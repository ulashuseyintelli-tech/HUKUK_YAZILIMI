/**
 * Phase 9C Task 3 - Manifest Hasher Tests
 */

import { createHash } from 'crypto';
import {
  computeManifestHash,
  verifyManifestHash,
  addManifestHash,
} from '../bundle-manifest.hasher';
import { canonicalStringify } from '../bundle-manifest.canonical';
import type { BundleManifestV1, ManifestWithoutHash } from '../bundle-manifest.types';

describe('Manifest Hasher', () => {
  const baseManifest: ManifestWithoutHash = {
    version: '1.0.0',
    bundleId: '550e8400-e29b-41d4-a716-446655440000',
    tenantId: 'tenant-1',
    incidentId: 'incident-1',
    state: 'SEALED',
    sealedHash: 'abc123def456',
    sealedAt: '2026-02-02T12:00:00.000Z',
    sealRunId: 'run-1',
    createdAt: '2026-02-02T11:00:00.000Z',
    objects: [
      {
        objectKey: 'a.json',
        etag: '"etag1"',
        versionId: null,
        contentType: 'application/json',
        sizeBytes: '100',
        createdAt: '2026-02-02T11:30:00.000Z',
      },
    ],
    objectCount: 1,
    totalSizeBytes: '100',
    signature: null,
    storage: {
      provider: 's3',
      bucket: 'test-bucket',
    },
  };

  describe('computeManifestHash', () => {
    it('should compute SHA-256 hash', () => {
      const hash = computeManifestHash(baseManifest);
      
      // Should be 64 char hex
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should produce deterministic hash', () => {
      const hash1 = computeManifestHash(baseManifest);
      const hash2 = computeManifestHash(baseManifest);
      
      expect(hash1).toBe(hash2);
    });

    it('should exclude manifestHash field from computation', () => {
      const manifestWithHash: BundleManifestV1 = {
        ...baseManifest,
        manifestHash: 'some-existing-hash',
      };
      
      const hashWithout = computeManifestHash(baseManifest);
      const hashWith = computeManifestHash(manifestWithHash);
      
      expect(hashWithout).toBe(hashWith);
    });

    it('should match manual computation', () => {
      const canonical = canonicalStringify(baseManifest);
      const expectedHash = createHash('sha256')
        .update(canonical, 'utf8')
        .digest('hex');
      
      const actualHash = computeManifestHash(baseManifest);
      
      expect(actualHash).toBe(expectedHash);
    });

    it('should produce different hash for different content', () => {
      const modified = { ...baseManifest, tenantId: 'tenant-2' };
      
      const hash1 = computeManifestHash(baseManifest);
      const hash2 = computeManifestHash(modified);
      
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('verifyManifestHash', () => {
    it('should return true for valid hash', () => {
      const manifest = addManifestHash(baseManifest);
      
      expect(verifyManifestHash(manifest)).toBe(true);
    });

    it('should return false for invalid hash', () => {
      const manifest: BundleManifestV1 = {
        ...baseManifest,
        manifestHash: 'invalid-hash',
      };
      
      expect(verifyManifestHash(manifest)).toBe(false);
    });

    it('should return false for tampered content', () => {
      const manifest = addManifestHash(baseManifest);
      
      // Tamper with content
      const tampered: BundleManifestV1 = {
        ...manifest,
        tenantId: 'tampered-tenant',
      };
      
      expect(verifyManifestHash(tampered)).toBe(false);
    });
  });

  describe('addManifestHash', () => {
    it('should add manifestHash to manifest', () => {
      const manifest = addManifestHash(baseManifest);
      
      expect(manifest.manifestHash).toBeDefined();
      expect(manifest.manifestHash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should preserve all other fields', () => {
      const manifest = addManifestHash(baseManifest);
      
      expect(manifest.version).toBe(baseManifest.version);
      expect(manifest.bundleId).toBe(baseManifest.bundleId);
      expect(manifest.tenantId).toBe(baseManifest.tenantId);
      expect(manifest.objects).toEqual(baseManifest.objects);
    });

    it('should produce verifiable manifest', () => {
      const manifest = addManifestHash(baseManifest);
      
      expect(verifyManifestHash(manifest)).toBe(true);
    });
  });

  describe('hash invariants', () => {
    it('should be independent of object key order in source', () => {
      const manifest1: ManifestWithoutHash = {
        version: '1.0.0',
        bundleId: 'id',
        tenantId: 't',
        incidentId: 'i',
        state: 'SEALED',
        sealedHash: 'h',
        sealedAt: '2026-01-01T00:00:00.000Z',
        sealRunId: 'r',
        createdAt: '2026-01-01T00:00:00.000Z',
        objects: [],
        objectCount: 0,
        totalSizeBytes: '0',
        signature: null,
        storage: { provider: 's3', bucket: 'b' },
      };

      // Same content, different source key order
      const manifest2: ManifestWithoutHash = {
        storage: { bucket: 'b', provider: 's3' },
        signature: null,
        totalSizeBytes: '0',
        objectCount: 0,
        objects: [],
        createdAt: '2026-01-01T00:00:00.000Z',
        sealRunId: 'r',
        sealedAt: '2026-01-01T00:00:00.000Z',
        sealedHash: 'h',
        state: 'SEALED',
        incidentId: 'i',
        tenantId: 't',
        bundleId: 'id',
        version: '1.0.0',
      };

      const hash1 = computeManifestHash(manifest1);
      const hash2 = computeManifestHash(manifest2);

      expect(hash1).toBe(hash2);
    });
  });
});
