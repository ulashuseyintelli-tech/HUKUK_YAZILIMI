/**
 * Phase 9C Task 3 - Manifest Writer Service
 * 
 * Orchestrates manifest generation and storage after seal.
 * Called as post-seal hook (outside transaction, idempotent).
 */

import { PrismaClient } from '@prisma/client';
import { ManifestBuilder, BundleNotFoundError, BundleNotSealedError } from './bundle-manifest.builder';
import { ManifestStorage } from './bundle-manifest.storage';
import type { IObjectStoreClient } from '../object-store.interface';
import type { BundleManifestV1, ManifestStorage as ManifestStorageConfig } from './bundle-manifest.types';
import {
  type IManifestMetricsCollector,
  NoOpManifestMetricsCollector,
  createManifestWriteMetricEvent,
} from './bundle-manifest.metrics';

/** Result of manifest write operation */
export interface ManifestWriteOperationResult {
  success: boolean;
  bundleId: string;
  manifestKey?: string;
  alreadyExists?: boolean;
  error?: string | undefined;
}

/** Manifest writer configuration */
export interface ManifestWriterConfig {
  storage: ManifestStorageConfig;
  keyPrefix?: string;
}

export class ManifestWriter {
  private readonly builder: ManifestBuilder;
  private readonly storage: ManifestStorage;
  private readonly storageConfig: ManifestStorageConfig;
  private readonly metrics: IManifestMetricsCollector;

  constructor(
    prisma: PrismaClient,
    objectStore: IObjectStoreClient,
    config: ManifestWriterConfig,
    metrics?: IManifestMetricsCollector
  ) {
    this.builder = new ManifestBuilder(prisma);
    this.storage = new ManifestStorage(objectStore, config.keyPrefix);
    this.storageConfig = config.storage;
    this.metrics = metrics ?? new NoOpManifestMetricsCollector();
  }

  /**
   * Writes manifest for a sealed bundle.
   * 
   * This is idempotent:
   * - If manifest already exists, returns success with alreadyExists=true
   * - If bundle not sealed, returns error
   * 
   * @param bundleId - Bundle UUID
   * @returns Write operation result
   */
  async writeManifestForBundle(bundleId: string): Promise<ManifestWriteOperationResult> {
    const startTime = Date.now();
    
    try {
      // 1. Build manifest from DB
      const manifest = await this.builder.buildManifest(bundleId, {
        storage: this.storageConfig,
      });

      // 2. Write to S3 (write-once)
      const writeResult = await this.storage.writeManifest(bundleId, manifest);
      const durationMs = Date.now() - startTime;

      if (writeResult.success) {
        this.metrics.recordManifestWrite(
          createManifestWriteMetricEvent(bundleId, 'success', durationMs)
        );
        return {
          success: true,
          bundleId,
          manifestKey: writeResult.key,
        };
      }

      if (writeResult.alreadyExists) {
        this.metrics.recordManifestWrite(
          createManifestWriteMetricEvent(bundleId, 'already_exists', durationMs)
        );
        return {
          success: true,
          bundleId,
          manifestKey: writeResult.key,
          alreadyExists: true,
        };
      }

      this.metrics.recordManifestWrite(
        createManifestWriteMetricEvent(bundleId, 'failure', durationMs, 'STORAGE_ERROR')
      );
      return {
        success: false,
        bundleId,
        error: writeResult.error,
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      
      if (error instanceof BundleNotFoundError) {
        this.metrics.recordManifestWrite(
          createManifestWriteMetricEvent(bundleId, 'failure', durationMs, 'BUNDLE_NOT_FOUND')
        );
        return {
          success: false,
          bundleId,
          error: 'BUNDLE_NOT_FOUND',
        };
      }

      if (error instanceof BundleNotSealedError) {
        this.metrics.recordManifestWrite(
          createManifestWriteMetricEvent(bundleId, 'failure', durationMs, 'BUNDLE_NOT_SEALED')
        );
        return {
          success: false,
          bundleId,
          error: 'BUNDLE_NOT_SEALED',
        };
      }

      this.metrics.recordManifestWrite(
        createManifestWriteMetricEvent(bundleId, 'failure', durationMs, 'UNKNOWN')
      );
      return {
        success: false,
        bundleId,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Reads manifest for a bundle.
   * 
   * @param bundleId - Bundle UUID
   * @returns Manifest or null if not found
   */
  async readManifest(bundleId: string): Promise<BundleManifestV1 | null> {
    const result = await this.storage.readManifest(bundleId);
    return result.success ? result.manifest! : null;
  }

  /**
   * Checks if manifest exists for a bundle.
   * 
   * @param bundleId - Bundle UUID
   * @returns true if manifest exists
   */
  async manifestExists(bundleId: string): Promise<boolean> {
    return this.storage.manifestExists(bundleId);
  }
}
