/**
 * Phase 9C Task 2.5 - Bundle Seal Repository
 * 
 * Prisma raw queries for evidence bundle sealing operations.
 * 
 * LOCKING STRATEGIES:
 * - API (on-demand): FOR UPDATE NOWAIT → deterministic 200/409/423
 * - Worker (batch): FOR UPDATE SKIP LOCKED → throughput, fire-and-forget
 */

import { PrismaClient, Prisma } from '@prisma/client';
import type { 
  EvidenceBundleRow, 
  EvidenceObjectRow, 
  BundleSealEventRow,
} from './bundle-seal.types';

export class BundleSealRepository {
  constructor(private readonly prisma: PrismaClient) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // LOCK OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Locks a bundle with NOWAIT semantics (API path).
   * Throws 55P03 (lock_not_available) if bundle is already locked.
   * 
   * @param bundleId - Bundle UUID to lock
   * @param tx - Prisma transaction client
   * @returns Bundle row or null if not found
   */
  async lockBundleNowait(
    bundleId: string,
    tx: Prisma.TransactionClient = this.prisma
  ): Promise<EvidenceBundleRow | null> {
    const rows = await tx.$queryRaw<EvidenceBundleRow[]>`
      SELECT 
        bundle_id::text as bundle_id,
        tenant_id,
        incident_id,
        state,
        sealed_hash,
        sealed_at,
        created_at
      FROM evidence_bundles
      WHERE bundle_id = ${bundleId}::uuid
      FOR UPDATE NOWAIT
    `;
    return rows[0] ?? null;
  }

  /**
   * Picks next OPEN bundle eligible for sealing with SKIP LOCKED (Worker path).
   * Only selects bundles older than grace period.
   * 
   * @param gracePeriodMs - Minimum age in milliseconds before bundle can be sealed
   * @param tx - Prisma transaction client
   * @returns Bundle row or null if no candidate
   */
  async pickNextOpenBundleSkipLocked(
    gracePeriodMs: number,
    tx: Prisma.TransactionClient = this.prisma
  ): Promise<EvidenceBundleRow | null> {
    // Convert ms to PostgreSQL interval
    const intervalSeconds = Math.floor(gracePeriodMs / 1000);
    
    const rows = await tx.$queryRaw<EvidenceBundleRow[]>`
      SELECT 
        bundle_id::text as bundle_id,
        tenant_id,
        incident_id,
        state,
        sealed_hash,
        sealed_at,
        created_at
      FROM evidence_bundles
      WHERE state = 'OPEN'
        AND created_at < now() - (${intervalSeconds} || ' seconds')::interval
      ORDER BY created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    `;
    return rows[0] ?? null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // READ OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Gets bundle by ID without locking.
   */
  async getBundleById(
    bundleId: string,
    tx: Prisma.TransactionClient = this.prisma
  ): Promise<EvidenceBundleRow | null> {
    const rows = await tx.$queryRaw<EvidenceBundleRow[]>`
      SELECT 
        bundle_id::text as bundle_id,
        tenant_id,
        incident_id,
        state,
        sealed_hash,
        sealed_at,
        created_at
      FROM evidence_bundles
      WHERE bundle_id = ${bundleId}::uuid
    `;
    return rows[0] ?? null;
  }

  /**
   * Gets all objects for a bundle, ordered by object_key ASC.
   * This ordering is CRITICAL for deterministic hash computation.
   */
  async getObjectsOrdered(
    bundleId: string,
    tx: Prisma.TransactionClient = this.prisma
  ): Promise<EvidenceObjectRow[]> {
    return tx.$queryRaw<EvidenceObjectRow[]>`
      SELECT 
        object_key,
        etag,
        version_id,
        content_type,
        size_bytes
      FROM evidence_objects
      WHERE bundle_id = ${bundleId}::uuid
      ORDER BY object_key ASC
    `;
  }


  /**
   * Gets seal event by bundle_id and run_id.
   * Used for idempotency check.
   */
  async getSealEventByRunId(
    bundleId: string,
    runId: string,
    tx: Prisma.TransactionClient = this.prisma
  ): Promise<BundleSealEventRow | null> {
    const rows = await tx.$queryRaw<BundleSealEventRow[]>`
      SELECT 
        id::text as id,
        bundle_id::text as bundle_id,
        run_id,
        hash,
        object_count,
        total_size_bytes,
        created_at
      FROM bundle_seal_events
      WHERE bundle_id = ${bundleId}::uuid
        AND run_id = ${runId}
    `;
    return rows[0] ?? null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // WRITE OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Updates bundle to SEALED state.
   * MUST be called BEFORE insertSealEvent due to trigger 45002.
   * 
   * @returns Number of rows updated (0 if already sealed or not found)
   */
  async updateBundleSealed(
    bundleId: string,
    sealedHash: string,
    tx: Prisma.TransactionClient = this.prisma
  ): Promise<number> {
    const result = await tx.$executeRaw`
      UPDATE evidence_bundles
      SET 
        state = 'SEALED',
        sealed_hash = ${sealedHash},
        sealed_at = now()
      WHERE bundle_id = ${bundleId}::uuid
        AND state = 'OPEN'
    `;
    return result;
  }

  /**
   * Inserts seal event with ON CONFLICT DO NOTHING for idempotency.
   * MUST be called AFTER updateBundleSealed due to trigger 45002.
   * 
   * @returns true if inserted, false if conflict (idempotent)
   */
  async insertSealEvent(
    bundleId: string,
    runId: string,
    hash: string,
    objectCount: number,
    totalSizeBytes: bigint,
    tx: Prisma.TransactionClient = this.prisma
  ): Promise<boolean> {
    const result = await tx.$executeRaw`
      INSERT INTO bundle_seal_events (
        bundle_id,
        run_id,
        hash,
        object_count,
        total_size_bytes
      ) VALUES (
        ${bundleId}::uuid,
        ${runId},
        ${hash},
        ${objectCount},
        ${totalSizeBytes}
      )
      ON CONFLICT (bundle_id, run_id) DO NOTHING
    `;
    return result > 0;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TRANSACTION HELPER
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Executes callback within a transaction.
   * Uses SERIALIZABLE isolation for seal operations.
   */
  async withTransaction<T>(
    callback: (tx: Prisma.TransactionClient) => Promise<T>
  ): Promise<T> {
    return this.prisma.$transaction(callback, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  }
}
