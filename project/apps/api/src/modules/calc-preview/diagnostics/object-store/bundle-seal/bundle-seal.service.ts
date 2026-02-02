/**
 * Phase 9C Task 2.5 - Bundle Seal Service
 * 
 * Business logic for evidence bundle sealing operations.
 * 
 * TWO PATHS:
 * 1. API (on-demand): sealBundleOnDemand() - NOWAIT, deterministic response
 * 2. Worker (batch): sealNextOpenBundleBatch() - SKIP LOCKED, throughput
 * 
 * TRANSACTION ORDER (due to trigger 45002):
 * 1. UPDATE bundle SET state='SEALED'
 * 2. INSERT seal_event
 * 
 * POST-SEAL HOOK (Phase 9C Task 3):
 * After successful seal, manifest is written to S3 (fire-and-forget).
 */

import { PrismaClient, Prisma } from '@prisma/client';
import { BundleSealRepository } from './bundle-seal.repository';
import { computeSealSnapshot, computeEmptyBundleSnapshot } from './bundle-seal.hasher';
import {
  BundleNotFoundError,
  BundleAlreadySealedError,
  mapPrismaError,
  isBundleSealError,
} from './bundle-seal.errors';
import type {
  EvidenceBundleRow,
  SealSnapshot,
  SealResult,
  BatchSealResult,
  BundleSealConfig,
} from './bundle-seal.types';
import { DEFAULT_SEAL_CONFIG } from './bundle-seal.types';
import type { ManifestWriter, ManifestWriteOperationResult } from '../bundle-manifest';

/** Extended config with manifest writer */
export interface BundleSealServiceConfig extends Partial<BundleSealConfig> {
  /** Optional manifest writer for post-seal hook */
  manifestWriter?: ManifestWriter;
  /** Log function for manifest write errors (default: console.error) */
  manifestErrorLogger?: (message: string, error: unknown) => void;
}

export class BundleSealService {
  private readonly repository: BundleSealRepository;
  private readonly config: BundleSealConfig;
  private readonly manifestWriter: ManifestWriter | undefined;
  private readonly manifestErrorLogger: (message: string, error: unknown) => void;

  constructor(
    prisma: PrismaClient,
    config: BundleSealServiceConfig = {}
  ) {
    this.repository = new BundleSealRepository(prisma);
    const { manifestWriter, manifestErrorLogger, ...sealConfig } = config;
    this.config = { ...DEFAULT_SEAL_CONFIG, ...sealConfig };
    this.manifestWriter = manifestWriter;
    this.manifestErrorLogger = manifestErrorLogger ?? ((msg, err) => console.error(msg, err));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // API PATH: On-Demand Seal (NOWAIT)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Seals a bundle on-demand (API path).
   * 
   * Uses FOR UPDATE NOWAIT for deterministic behavior:
   * - 200: Successfully sealed (or idempotent return for same run_id)
   * - 404: Bundle not found
   * - 409: Bundle already sealed
   * - 423: Bundle locked by another process
   * 
   * POST-SEAL: Writes manifest to S3 (fire-and-forget, errors logged not thrown).
   * 
   * @param bundleId - Bundle UUID to seal
   * @param runId - Unique run identifier for idempotency
   * @returns SealResult on success
   * @throws BundleNotFoundError, BundleAlreadySealedError, BundleLockedError
   */
  async sealBundleOnDemand(bundleId: string, runId: string): Promise<SealResult> {
    let result: SealResult;
    
    try {
      result = await this.repository.withTransaction(async (tx) => {
        // 1. Lock bundle with NOWAIT
        let bundle: EvidenceBundleRow | null;
        try {
          bundle = await this.repository.lockBundleNowait(bundleId, tx);
        } catch (error) {
          throw mapPrismaError(error, bundleId);
        }

        // 2. Check bundle exists
        if (!bundle) {
          throw new BundleNotFoundError(bundleId);
        }

        // 3. Check if already sealed (always 409, regardless of run_id)
        if (bundle.state === 'SEALED') {
          throw new BundleAlreadySealedError(
            bundleId,
            bundle.sealed_hash!,
            bundle.sealed_at!
          );
        }

        // 4. Execute seal
        return this.executeSeal(bundleId, runId, tx);
      });
    } catch (error) {
      // Re-throw domain errors as-is
      if (isBundleSealError(error)) {
        throw error;
      }
      // Map unknown errors
      throw mapPrismaError(error, bundleId);
    }
    
    // POST-SEAL HOOK: Write manifest (outside transaction, fire-and-forget)
    await this.writeManifestAfterSeal(bundleId);
    
    return result;
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // WORKER PATH: Batch Seal (SKIP LOCKED)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Seals next eligible OPEN bundle (Worker path).
   * 
   * Uses FOR UPDATE SKIP LOCKED for throughput:
   * - Skips bundles locked by other workers
   * - Only processes bundles older than grace period
   * - Fire-and-forget semantics (no idempotent response)
   * 
   * POST-SEAL: Writes manifest to S3 (fire-and-forget, errors logged not thrown).
   * 
   * @param runId - Unique run identifier for audit trail
   * @returns BatchSealResult indicating outcome
   */
  async sealNextOpenBundleBatch(runId: string): Promise<BatchSealResult> {
    try {
      const batchResult = await this.repository.withTransaction(async (tx) => {
        // 1. Pick next candidate with SKIP LOCKED
        const bundle = await this.repository.pickNextOpenBundleSkipLocked(
          this.config.gracePeriodMs,
          tx
        );

        // 2. No candidate available
        if (!bundle) {
          return {
            sealed: false,
            reason: 'no_candidate' as const,
          };
        }

        // 3. Execute seal
        const result = await this.executeSeal(bundle.bundle_id, runId, tx);

        return {
          sealed: true,
          bundleId: bundle.bundle_id,
          reason: 'sealed' as const,
          result,
        };
      });
      
      // POST-SEAL HOOK: Write manifest (outside transaction, fire-and-forget)
      if (batchResult.sealed && batchResult.bundleId) {
        await this.writeManifestAfterSeal(batchResult.bundleId);
      }
      
      return batchResult;
    } catch (error) {
      // Log error but don't throw - worker should continue
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        sealed: false,
        reason: 'error',
        error: errorMessage,
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SHARED CORE: Execute Seal
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Core seal execution logic shared by both paths.
   * 
   * TRANSACTION ORDER (due to trigger 45002):
   * 1. Get objects ordered by object_key
   * 2. Compute seal snapshot (hash, count, size)
   * 3. UPDATE bundle to SEALED state
   * 4. INSERT seal event
   * 
   * @param bundleId - Bundle UUID (must be locked)
   * @param runId - Run identifier for idempotency
   * @param tx - Transaction client
   * @returns SealResult
   */
  private async executeSeal(
    bundleId: string,
    runId: string,
    tx: Prisma.TransactionClient
  ): Promise<SealResult> {
    // 1. Get objects ordered by object_key (CRITICAL for deterministic hash)
    const objects = await this.repository.getObjectsOrdered(bundleId, tx);

    // 2. Compute seal snapshot
    const snapshot: SealSnapshot = objects.length > 0
      ? computeSealSnapshot(objects)
      : computeEmptyBundleSnapshot();

    // 3. UPDATE bundle to SEALED (MUST be before INSERT seal_event)
    const updateCount = await this.repository.updateBundleSealed(
      bundleId,
      snapshot.hash,
      tx
    );

    // Race condition: another process sealed between lock and update
    if (updateCount === 0) {
      // Re-fetch to get sealed info
      const bundle = await this.repository.getBundleById(bundleId, tx);
      if (bundle?.state === 'SEALED') {
        throw new BundleAlreadySealedError(
          bundleId,
          bundle.sealed_hash!,
          bundle.sealed_at!
        );
      }
      throw new BundleNotFoundError(bundleId);
    }

    // 4. INSERT seal event (ON CONFLICT DO NOTHING for idempotency)
    const inserted = await this.repository.insertSealEvent(
      bundleId,
      runId,
      snapshot.hash,
      snapshot.objectCount,
      snapshot.totalSizeBytes,
      tx
    );

    // If not inserted, it's an idempotent call - fetch existing event
    if (!inserted) {
      const existingEvent = await this.repository.getSealEventByRunId(
        bundleId,
        runId,
        tx
      );
      if (existingEvent) {
        return {
          bundleId,
          sealedHash: existingEvent.hash,
          objectCount: existingEvent.object_count,
          totalSizeBytes: existingEvent.total_size_bytes.toString(),
          sealedAt: existingEvent.created_at,
        };
      }
    }

    // 5. Return result
    return {
      bundleId,
      sealedHash: snapshot.hash,
      objectCount: snapshot.objectCount,
      totalSizeBytes: snapshot.totalSizeBytes.toString(),
      sealedAt: new Date(),
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UTILITY METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Gets current configuration.
   */
  getConfig(): BundleSealConfig {
    return { ...this.config };
  }
  
  /**
   * Checks if manifest writer is configured.
   */
  hasManifestWriter(): boolean {
    return this.manifestWriter !== undefined;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // POST-SEAL HOOK: Manifest Write
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Writes manifest after successful seal (fire-and-forget).
   * 
   * This is called OUTSIDE the seal transaction to avoid:
   * - Blocking the seal on S3 latency
   * - Rolling back seal if S3 fails
   * 
   * Errors are logged but not thrown - seal success is not dependent on manifest.
   * 
   * @param bundleId - Bundle UUID that was just sealed
   */
  private async writeManifestAfterSeal(bundleId: string): Promise<void> {
    if (!this.manifestWriter) {
      return; // No manifest writer configured
    }
    
    try {
      const result: ManifestWriteOperationResult = await this.manifestWriter.writeManifestForBundle(bundleId);
      
      if (!result.success && !result.alreadyExists) {
        this.manifestErrorLogger(
          `[BundleSealService] Manifest write failed for bundle ${bundleId}`,
          { error: result.error }
        );
      }
      // If alreadyExists=true, that's fine (idempotent)
    } catch (error) {
      // Fire-and-forget: log error but don't throw
      this.manifestErrorLogger(
        `[BundleSealService] Manifest write error for bundle ${bundleId}`,
        error
      );
    }
  }
}
