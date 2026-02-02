/**
 * Phase 9C Task 3 - Manifest Verifier Tests
 */

import { verifyManifest, verifyManifestDetailed } from '../bundle-manifest.verifier';
import { addManifestHash } from '../bundle-manifest.hasher';
import { computeSealSnapshot } from '../../bundle-seal/bundle-seal.hasher';
import type { BundleManifestV1, ManifestWithoutHash } from '../bundle-manifest.types';

describe('Manifest Verifier', () => {
  // Helper to create valid manifest
  function createValidManifest(objects: ManifestWithoutHash['objects'] = []): BundleManifestV1 {
    // Compute sealedHash from objects
    const objectRows = objects.map(obj => ({
      object_key: obj.objectKey,
      etag: obj.etag,
      version_id: obj.versionId,
      content_type: obj.contentType,
      size_bytes: BigInt(obj.sizeBytes),
    }));
    
    const snapshot = computeSealSnapshot(objectRows);
    const totalSize = objectRows.reduce((acc, o) => acc + o.size_bytes, BigInt(0));
    
    const manifestWithoutHash: ManifestWithoutHash = {
      version: '1.0.0',
      bundleId: '550e8400-e29b-41d4-a716-446655440000',
      tenantId: 'tenant-1',
      incidentId: 'incident-1',
      state: 'SEALED',
      sealedHash: snapshot.hash,
      sealedAt: '2026-02-02T12:00:00.000Z',
      sealRunId: 'run-1',
      createdAt: '2026-02-02T11:00:00.000Z',
      objects,
      objectCount: objects.length,
      totalSizeBytes: totalSize.toString(),
      signature: null,
      storage: {
        provider: 's3',
        bucket: 'test-bucket',
      },
    };
    
    return addManifestHash(manifestWithoutHash);
  }

  describe('verifyManifest', () => {
    it('should return valid for correct manifest', () => {
      const manifest = createValidManifest([
        {
          objectKey: 'a.json',
          etag: '"etag1"',
          versionId: null,
          contentType: 'application/json',
          sizeBytes: '100',
          createdAt: '2026-02-02T11:30:00.000Z',
        },
      ]);
      
      const result = verifyManifest(manifest);
      
      expect(result.valid).toBe(true);
      expect(result.manifestHashValid).toBe(true);
      expect(result.sealedHashValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return invalid for tampered manifestHash', () => {
      const manifest = createValidManifest();
      manifest.manifestHash = 'tampered-hash';
      
      const result = verifyManifest(manifest);
      
      expect(result.valid).toBe(false);
      expect(result.manifestHashValid).toBe(false);
      expect(result.errors).toContain('manifestHash does not match computed hash');
    });

    it('should return invalid for tampered sealedHash', () => {
      const manifest = createValidManifest([
        {
          objectKey: 'a.json',
          etag: '"etag1"',
          versionId: null,
          contentType: 'application/json',
          sizeBytes: '100',
          createdAt: '2026-02-02T11:30:00.000Z',
        },
      ]);
      
      // Tamper sealedHash but recompute manifestHash
      const tampered: ManifestWithoutHash = {
        ...manifest,
        sealedHash: 'tampered-sealed-hash',
      };
      const tamperedWithHash = addManifestHash(tampered);
      
      const result = verifyManifest(tamperedWithHash);
      
      expect(result.valid).toBe(false);
      expect(result.sealedHashValid).toBe(false);
      expect(result.errors).toContain('sealedHash does not match computed hash from objects');
    });

    it('should return invalid for tampered content', () => {
      const manifest = createValidManifest();
      
      // Tamper content without updating hashes
      manifest.tenantId = 'tampered-tenant';
      
      const result = verifyManifest(manifest);
      
      expect(result.valid).toBe(false);
      expect(result.manifestHashValid).toBe(false);
    });

    it('should handle empty objects array', () => {
      const manifest = createValidManifest([]);
      
      const result = verifyManifest(manifest);
      
      expect(result.valid).toBe(true);
    });

    it('should handle multiple objects', () => {
      const manifest = createValidManifest([
        {
          objectKey: 'a.json',
          etag: '"etag1"',
          versionId: null,
          contentType: 'application/json',
          sizeBytes: '100',
          createdAt: '2026-02-02T11:30:00.000Z',
        },
        {
          objectKey: 'b.json',
          etag: '"etag2"',
          versionId: 'v1',
          contentType: 'application/json',
          sizeBytes: '200',
          createdAt: '2026-02-02T11:31:00.000Z',
        },
      ]);
      
      const result = verifyManifest(manifest);
      
      expect(result.valid).toBe(true);
    });
  });

  describe('verifyManifestDetailed', () => {
    it('should verify all fields', () => {
      const manifest = createValidManifest([
        {
          objectKey: 'a.json',
          etag: '"etag1"',
          versionId: null,
          contentType: 'application/json',
          sizeBytes: '100',
          createdAt: '2026-02-02T11:30:00.000Z',
        },
      ]);
      
      const result = verifyManifestDetailed(manifest);
      
      expect(result.manifestHashValid).toBe(true);
      expect(result.sealedHashValid).toBe(true);
      expect(result.objectCountValid).toBe(true);
      expect(result.totalSizeBytesValid).toBe(true);
      expect(result.objectsOrderValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect objectCount mismatch', () => {
      const manifest = createValidManifest([
        {
          objectKey: 'a.json',
          etag: '"etag1"',
          versionId: null,
          contentType: 'application/json',
          sizeBytes: '100',
          createdAt: '2026-02-02T11:30:00.000Z',
        },
      ]);
      
      // Tamper objectCount
      const tampered = { ...manifest, objectCount: 5 };
      const tamperedWithHash = addManifestHash(tampered);
      
      const result = verifyManifestDetailed(tamperedWithHash);
      
      expect(result.objectCountValid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('objectCount mismatch'));
    });

    it('should detect totalSizeBytes mismatch', () => {
      const manifest = createValidManifest([
        {
          objectKey: 'a.json',
          etag: '"etag1"',
          versionId: null,
          contentType: 'application/json',
          sizeBytes: '100',
          createdAt: '2026-02-02T11:30:00.000Z',
        },
      ]);
      
      // Tamper totalSizeBytes
      const tampered = { ...manifest, totalSizeBytes: '999999' };
      const tamperedWithHash = addManifestHash(tampered);
      
      const result = verifyManifestDetailed(tamperedWithHash);
      
      expect(result.totalSizeBytesValid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('totalSizeBytes mismatch'));
    });

    it('should detect unsorted objects', () => {
      const manifest = createValidManifest([
        {
          objectKey: 'b.json',
          etag: '"etag2"',
          versionId: null,
          contentType: 'application/json',
          sizeBytes: '200',
          createdAt: '2026-02-02T11:31:00.000Z',
        },
        {
          objectKey: 'a.json',
          etag: '"etag1"',
          versionId: null,
          contentType: 'application/json',
          sizeBytes: '100',
          createdAt: '2026-02-02T11:30:00.000Z',
        },
      ]);
      
      const result = verifyManifestDetailed(manifest);
      
      expect(result.objectsOrderValid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('not sorted'));
    });
  });
});
