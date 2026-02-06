/**
 * Phase 9C Task 3 - Manifest Storage
 * 
 * S3 read/write for manifests with write-once semantics.
 * 
 * S3 Metadata Headers:
 * - x-amz-meta-manifest-version: Schema version (1.0.0)
 * - x-amz-meta-bundle-id: Bundle UUID (for debugging)
 * - x-amz-meta-sha256: manifestHash (integrity verification)
 */

import { buildManifestKey } from './bundle-manifest.keys';
import { canonicalStringify } from './bundle-manifest.canonical';
import type {
  BundleManifestV1,
  ManifestWriteResult,
  ManifestReadResult,
} from './bundle-manifest.types';
import { MANIFEST_VERSION } from './bundle-manifest.types';
import type { IObjectStoreClient } from '../object-store.interface';
import { ObjectAlreadyExistsError } from '../object-store.interface';

/** Error thrown when manifest already exists */
export class ManifestExistsError extends Error {
  constructor(bundleId: string) {
    super(`Manifest already exists for bundle: ${bundleId}`);
    this.name = 'ManifestExistsError';
  }
}

export class ManifestStorage {
  constructor(
    private readonly objectStore: IObjectStoreClient,
    private readonly keyPrefix: string = 'bundles'
  ) {}

  /**
   * Writes manifest to S3 with write-once semantics.
   * 
   * Uses If-None-Match: * to fail if manifest already exists.
   * Includes metadata headers for debugging and integrity verification.
   * 
   * @param bundleId - Bundle UUID
   * @param manifest - Manifest to write
   * @returns Write result
   */
  async writeManifest(
    bundleId: string,
    manifest: BundleManifestV1
  ): Promise<ManifestWriteResult> {
    return this.writeManifestWithSignal(bundleId, manifest, undefined);
  }

  /**
   * Phase 10.1.6: Writes manifest with AbortSignal support.
   * 
   * Uses If-None-Match: * to fail if manifest already exists.
   * Includes metadata headers for debugging and integrity verification.
   * Signal enables hard timeout enforcement from worker.
   * 
   * @param bundleId - Bundle UUID
   * @param manifest - Manifest to write
   * @param signal - Optional AbortSignal for timeout
   * @returns Write result
   * 
   * @see PHASE-10-WORKER-ARCHITECTURE.md Section 11.5
   */
  async writeManifestWithSignal(
    bundleId: string,
    manifest: BundleManifestV1,
    signal?: AbortSignal
  ): Promise<ManifestWriteResult> {
    const key = buildManifestKey(bundleId, this.keyPrefix);
    
    // Canonical JSON for consistent storage
    const content = canonicalStringify(manifest);
    const buffer = Buffer.from(content, 'utf8');
    
    // S3 metadata headers for debugging and integrity
    const metadata: Record<string, string> = {
      'manifest-version': MANIFEST_VERSION,
      'bundle-id': bundleId,
      'sha256': manifest.manifestHash,
    };
    
    try {
      // Write-once: fail if exists
      // Phase 10.1.6: Pass signal for timeout support
      const putInput: Parameters<typeof this.objectStore.putWriteOnce>[0] = {
        key,
        body: buffer,
        contentType: 'application/json',
        metadata,
      };
      if (signal) {
        putInput.signal = signal;
      }
      await this.objectStore.putWriteOnce(putInput);
      
      return {
        success: true,
        key,
      };
    } catch (error) {
      // Phase 10.1.6: Re-throw AbortError for timeout handling
      if (this.isAbortError(error)) {
        throw error;
      }
      
      // Check if it's a "already exists" error
      if (error instanceof ObjectAlreadyExistsError) {
        return {
          success: false,
          key,
          alreadyExists: true,
          error: 'Manifest already exists',
        };
      }
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (
        errorMessage.includes('PreconditionFailed') ||
        errorMessage.includes('already exists') ||
        errorMessage.includes('If-None-Match')
      ) {
        return {
          success: false,
          key,
          alreadyExists: true,
          error: 'Manifest already exists',
        };
      }
      
      return {
        success: false,
        key,
        error: errorMessage,
      };
    }
  }

  /**
   * Phase 10.1.6: Detect AbortError for timeout handling
   */
  private isAbortError(error: unknown): boolean {
    if (!error) return false;
    if (error instanceof Error && error.name === 'AbortError') return true;
    if (typeof error === 'object' && 'name' in error) {
      const err = error as { name?: string };
      if (err.name === 'AbortError') return true;
    }
    return false;
  }

  /**
   * Reads manifest from S3.
   * 
   * @param bundleId - Bundle UUID
   * @returns Read result with manifest or error
   */
  async readManifest(bundleId: string): Promise<ManifestReadResult> {
    const key = buildManifestKey(bundleId, this.keyPrefix);
    
    try {
      const result = await this.objectStore.getObject(key);
      
      // Parse JSON
      let manifest: BundleManifestV1;
      try {
        manifest = JSON.parse(result.body.toString('utf8'));
      } catch {
        return {
          success: false,
          error: 'PARSE_ERROR',
          errorMessage: 'Failed to parse manifest JSON',
        };
      }
      
      // Validate version
      if (manifest.version !== MANIFEST_VERSION) {
        return {
          success: false,
          error: 'INVALID_VERSION',
          errorMessage: `Unsupported manifest version: ${manifest.version}`,
        };
      }
      
      return {
        success: true,
        manifest,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Check for not found
      if (
        errorMessage.includes('NoSuchKey') ||
        errorMessage.includes('not found') ||
        errorMessage.includes('404') ||
        errorMessage.includes('OBJECT_NOT_FOUND')
      ) {
        return {
          success: false,
          error: 'NOT_FOUND',
          errorMessage: `Manifest not found: ${key}`,
        };
      }
      
      return {
        success: false,
        error: 'UNKNOWN',
        errorMessage,
      };
    }
  }

  /**
   * Checks if manifest exists.
   * 
   * @param bundleId - Bundle UUID
   * @returns true if manifest exists
   */
  async manifestExists(bundleId: string): Promise<boolean> {
    const key = buildManifestKey(bundleId, this.keyPrefix);
    
    try {
      const result = await this.objectStore.headObject(key);
      return result.exists;
    } catch {
      return false;
    }
  }
}
