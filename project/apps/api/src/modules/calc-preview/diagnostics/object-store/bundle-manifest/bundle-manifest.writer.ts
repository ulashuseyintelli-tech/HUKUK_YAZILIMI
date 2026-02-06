/**
 * Phase 9C Task 3 - Manifest Writer Service
 * 
 * Orchestrates manifest generation and storage after seal.
 * Called as post-seal hook (outside transaction, idempotent).
 * 
 * Phase 10 Integration: Added tryWriteManifest() for retry worker.
 * Phase 10.1.6: Added hard timeout enforcement with AbortController.
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
import {
  classifyError,
  ManifestErrorCode,
  type ManifestWriteResult,
} from '../manifest-retry';
import { DEFAULT_WORKER_CONFIG } from '../manifest-retry/manifest-retry-worker.config';

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
  /**
   * Phase 10.1.6: Hard timeout for write operations (ms)
   * 
   * MUST be less than worker lease duration (60s).
   * Default: 30_000ms (30s) - provides 30s safety margin.
   * 
   * @see PHASE-10-WORKER-ARCHITECTURE.md Section 11.5
   */
  writeTimeoutMs?: number;
}

export class ManifestWriter {
  private readonly builder: ManifestBuilder;
  private readonly storage: ManifestStorage;
  private readonly storageConfig: ManifestStorageConfig;
  private readonly metrics: IManifestMetricsCollector;
  private readonly writeTimeoutMs: number;

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
    // Phase 10.1.6: Hard timeout - MUST be less than lease (60s)
    this.writeTimeoutMs = config.writeTimeoutMs ?? DEFAULT_WORKER_CONFIG.writeTimeoutMs;
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

  /**
   * Phase 10 Integration: Try to write manifest for retry worker.
   * 
   * Phase 10.1.6: Enforces hard timeout with AbortController.
   * 
   * Returns standardized result for error classification:
   * - { outcome: 'written' } → Success, manifest created
   * - { outcome: 'already_exists' } → Idempotent success, manifest exists
   * - { outcome: 'error', error, errorCode } → Failed, needs classification
   * 
   * Timeout behavior:
   * - AbortController enforces writeTimeoutMs (default 30s)
   * - Timeout → S3_TIMEOUT errorCode → RETRYABLE
   * - Prevents lease expiry during slow S3 stalls
   * 
   * @param bundleId - Bundle UUID
   * @param timeoutMs - Optional override for timeout (default: config.writeTimeoutMs)
   * @returns ManifestWriteResult for worker processing
   * 
   * @see PHASE-10-WORKER-ARCHITECTURE.md Section 11.5
   */
  async tryWriteManifest(bundleId: string, timeoutMs?: number): Promise<ManifestWriteResult> {
    const effectiveTimeout = timeoutMs ?? this.writeTimeoutMs;
    
    // Phase 10.1.6: AbortController for hard timeout enforcement
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), effectiveTimeout);
    
    try {
      // Pass abort signal to storage layer
      const result = await this.writeManifestForBundleWithSignal(bundleId, controller.signal);
      
      if (result.success) {
        if (result.alreadyExists) {
          const alreadyExistsResult: ManifestWriteResult = {
            outcome: 'already_exists',
          };
          if (result.manifestKey !== undefined) {
            alreadyExistsResult.manifestKey = result.manifestKey;
          }
          return alreadyExistsResult;
        }
        const writtenResult: ManifestWriteResult = {
          outcome: 'written',
        };
        if (result.manifestKey !== undefined) {
          writtenResult.manifestKey = result.manifestKey;
        }
        return writtenResult;
      }
      
      // Error case - classify the error
      const errorMessage = result.error ?? 'Unknown error';
      const classified = classifyError({ message: errorMessage }, 0);
      
      return {
        outcome: 'error',
        error: { message: errorMessage },
        errorCode: classified.errorCode,
        errorMessage,
      };
    } catch (error) {
      // Phase 10.1.6: AbortError detection for timeout
      if (this.isAbortError(error)) {
        return {
          outcome: 'error',
          error,
          errorCode: ManifestErrorCode.S3_TIMEOUT,
          errorMessage: `Write timeout after ${effectiveTimeout}ms`,
        };
      }
      
      // Unexpected exception - classify it
      const classified = classifyError(error, 0);
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      return {
        outcome: 'error',
        error,
        errorCode: classified.errorCode,
        errorMessage,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Phase 10.1.6: Internal method that accepts AbortSignal
   * 
   * Wraps writeManifestForBundle with signal propagation.
   */
  private async writeManifestForBundleWithSignal(
    bundleId: string,
    signal: AbortSignal
  ): Promise<ManifestWriteOperationResult> {
    const startTime = Date.now();
    
    // Check if already aborted before starting
    if (signal.aborted) {
      throw new Error('Operation aborted');
    }
    
    try {
      // 1. Build manifest from DB
      const manifest = await this.builder.buildManifest(bundleId, {
        storage: this.storageConfig,
      });

      // Check abort after DB operation
      if (signal.aborted) {
        throw new Error('Operation aborted');
      }

      // 2. Write to S3 (write-once) with signal
      const writeResult = await this.storage.writeManifestWithSignal(bundleId, manifest, signal);
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

      // Re-throw for abort handling in caller
      throw error;
    }
  }

  /**
   * Phase 10.1.6: Detect AbortError from AbortController
   */
  private isAbortError(error: unknown): boolean {
    if (!error) return false;
    
    // Standard Error with name='AbortError'
    if (error instanceof Error && error.name === 'AbortError') {
      return true;
    }
    
    // DOMException compatibility
    if (typeof error === 'object' && 'name' in error) {
      const err = error as { name?: string };
      if (err.name === 'AbortError') {
        return true;
      }
    }
    
    // Message-based detection
    if (error instanceof Error && error.message === 'Operation aborted') {
      return true;
    }
    
    return false;
  }
}
