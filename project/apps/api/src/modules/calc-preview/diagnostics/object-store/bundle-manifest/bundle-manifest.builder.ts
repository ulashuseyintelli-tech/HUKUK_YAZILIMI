/**
 * Phase 9C Task 3 - Manifest Builder
 * 
 * Builds manifest from DB data (evidence_bundles, bundle_seal_events, evidence_objects).
 */

import { PrismaClient } from '@prisma/client';
import { addManifestHash } from './bundle-manifest.hasher';
import type {
  BundleManifestV1,
  ManifestObjectV1,
  ManifestWithoutHash,
  ManifestBuildOptions,
} from './bundle-manifest.types';
import { MANIFEST_VERSION } from './bundle-manifest.types';

/** Error thrown when bundle is not found */
export class BundleNotFoundError extends Error {
  constructor(bundleId: string) {
    super(`Bundle not found: ${bundleId}`);
    this.name = 'BundleNotFoundError';
  }
}

/** Error thrown when bundle is not sealed */
export class BundleNotSealedError extends Error {
  constructor(bundleId: string, state: string) {
    super(`Bundle ${bundleId} is not sealed (state: ${state})`);
    this.name = 'BundleNotSealedError';
  }
}

/** Error thrown when seal event is not found */
export class SealEventNotFoundError extends Error {
  constructor(bundleId: string) {
    super(`Seal event not found for bundle: ${bundleId}`);
    this.name = 'SealEventNotFoundError';
  }
}

/** Raw bundle row from DB */
interface BundleRow {
  bundle_id: string;
  tenant_id: string;
  incident_id: string;
  state: string;
  sealed_hash: string | null;
  sealed_at: Date | null;
  created_at: Date;
}

/** Raw seal event row from DB */
interface SealEventRow {
  run_id: string;
}

/** Raw object row from DB */
interface ObjectRow {
  object_key: string;
  etag: string;
  version_id: string | null;
  content_type: string;
  size_bytes: bigint;
  created_at: Date;
}

export class ManifestBuilder {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Builds manifest for a sealed bundle.
   * 
   * @param bundleId - Bundle UUID
   * @param options - Build options (storage config)
   * @returns Complete manifest with manifestHash
   * @throws BundleNotFoundError, BundleNotSealedError, SealEventNotFoundError
   */
  async buildManifest(
    bundleId: string,
    options: ManifestBuildOptions
  ): Promise<BundleManifestV1> {
    // 1. Read bundle
    const bundle = await this.getBundle(bundleId);
    
    if (!bundle) {
      throw new BundleNotFoundError(bundleId);
    }
    
    if (bundle.state !== 'SEALED') {
      throw new BundleNotSealedError(bundleId, bundle.state);
    }
    
    // 2. Read seal event
    const sealEvent = await this.getSealEvent(bundleId);
    
    if (!sealEvent) {
      throw new SealEventNotFoundError(bundleId);
    }
    
    // 3. Read objects (ordered by object_key)
    const objects = await this.getObjects(bundleId);
    
    // 4. Build manifest objects
    const manifestObjects: ManifestObjectV1[] = objects.map(obj => ({
      objectKey: obj.object_key,
      etag: obj.etag,
      versionId: obj.version_id,
      contentType: obj.content_type,
      sizeBytes: obj.size_bytes.toString(),
      createdAt: obj.created_at.toISOString(),
    }));
    
    // 5. Compute totals
    const totalSizeBytes = objects.reduce(
      (acc, obj) => acc + obj.size_bytes,
      BigInt(0)
    );
    
    // 6. Build manifest without hash
    const manifestWithoutHash: ManifestWithoutHash = {
      version: MANIFEST_VERSION,
      bundleId: bundle.bundle_id,
      tenantId: bundle.tenant_id,
      incidentId: bundle.incident_id,
      state: 'SEALED',
      sealedHash: bundle.sealed_hash!,
      sealedAt: bundle.sealed_at!.toISOString(),
      sealRunId: sealEvent.run_id,
      createdAt: bundle.created_at.toISOString(),
      objects: manifestObjects,
      objectCount: objects.length,
      totalSizeBytes: totalSizeBytes.toString(),
      signature: null,
      storage: options.storage,
    };
    
    // 7. Add manifestHash
    return addManifestHash(manifestWithoutHash);
  }

  private async getBundle(bundleId: string): Promise<BundleRow | null> {
    const rows = await this.prisma.$queryRaw<BundleRow[]>`
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

  private async getSealEvent(bundleId: string): Promise<SealEventRow | null> {
    const rows = await this.prisma.$queryRaw<SealEventRow[]>`
      SELECT run_id
      FROM bundle_seal_events
      WHERE bundle_id = ${bundleId}::uuid
      ORDER BY created_at DESC
      LIMIT 1
    `;
    return rows[0] ?? null;
  }

  private async getObjects(bundleId: string): Promise<ObjectRow[]> {
    return this.prisma.$queryRaw<ObjectRow[]>`
      SELECT 
        object_key,
        etag,
        version_id,
        content_type,
        size_bytes,
        created_at
      FROM evidence_objects
      WHERE bundle_id = ${bundleId}::uuid
      ORDER BY object_key ASC
    `;
  }
}
