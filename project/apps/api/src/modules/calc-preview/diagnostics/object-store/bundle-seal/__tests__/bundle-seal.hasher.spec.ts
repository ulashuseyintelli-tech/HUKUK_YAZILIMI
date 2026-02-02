/**
 * Phase 9C Task 2.5 - Bundle Seal Hasher Tests
 */

import { createHash } from 'crypto';
import {
  formatObjectForHash,
  computeSealSnapshot,
  computeEmptyBundleSnapshot,
} from '../bundle-seal.hasher';
import type { EvidenceObjectRow } from '../bundle-seal.types';

describe('BundleSealHasher', () => {
  describe('formatObjectForHash', () => {
    it('should format object with all fields', () => {
      const obj: EvidenceObjectRow = {
        object_key: 'tenant/incident/snapshot.json',
        etag: '"abc123"',
        version_id: 'v1',
        content_type: 'application/json',
        size_bytes: BigInt(1024),
      };

      const result = formatObjectForHash(obj);

      expect(result).toBe(
        'tenant/incident/snapshot.json\n"abc123"\nv1\napplication/json\n1024'
      );
    });

    it('should handle null version_id', () => {
      const obj: EvidenceObjectRow = {
        object_key: 'key1',
        etag: 'etag1',
        version_id: null,
        content_type: 'text/plain',
        size_bytes: BigInt(100),
      };

      const result = formatObjectForHash(obj);

      expect(result).toBe('key1\netag1\n\ntext/plain\n100');
    });

    it('should use BigInt.toString() for locale-independent size', () => {
      const obj: EvidenceObjectRow = {
        object_key: 'key',
        etag: 'etag',
        version_id: null,
        content_type: 'application/octet-stream',
        size_bytes: BigInt('9007199254740993'), // > Number.MAX_SAFE_INTEGER
      };

      const result = formatObjectForHash(obj);

      expect(result).toContain('9007199254740993');
    });
  });

  describe('computeSealSnapshot', () => {
    it('should compute deterministic hash for single object', () => {
      const objects: EvidenceObjectRow[] = [
        {
          object_key: 'key1',
          etag: 'etag1',
          version_id: null,
          content_type: 'application/json',
          size_bytes: BigInt(100),
        },
      ];

      const result = computeSealSnapshot(objects);

      // Verify hash is 64 char hex (SHA-256)
      expect(result.hash).toMatch(/^[a-f0-9]{64}$/);
      expect(result.objectCount).toBe(1);
      expect(result.totalSizeBytes).toBe(BigInt(100));
    });

    it('should compute same hash for same objects', () => {
      const objects: EvidenceObjectRow[] = [
        {
          object_key: 'a',
          etag: 'e1',
          version_id: null,
          content_type: 'text/plain',
          size_bytes: BigInt(10),
        },
        {
          object_key: 'b',
          etag: 'e2',
          version_id: 'v1',
          content_type: 'text/plain',
          size_bytes: BigInt(20),
        },
      ];

      const result1 = computeSealSnapshot(objects);
      const result2 = computeSealSnapshot(objects);

      expect(result1.hash).toBe(result2.hash);
    });

    it('should compute different hash for different order (caller must sort)', () => {
      const obj1: EvidenceObjectRow = {
        object_key: 'a',
        etag: 'e1',
        version_id: null,
        content_type: 'text/plain',
        size_bytes: BigInt(10),
      };
      const obj2: EvidenceObjectRow = {
        object_key: 'b',
        etag: 'e2',
        version_id: null,
        content_type: 'text/plain',
        size_bytes: BigInt(20),
      };

      const result1 = computeSealSnapshot([obj1, obj2]);
      const result2 = computeSealSnapshot([obj2, obj1]);

      // Different order = different hash (caller must sort!)
      expect(result1.hash).not.toBe(result2.hash);
    });

    it('should accumulate totalSizeBytes correctly', () => {
      const objects: EvidenceObjectRow[] = [
        {
          object_key: 'a',
          etag: 'e1',
          version_id: null,
          content_type: 'text/plain',
          size_bytes: BigInt('5000000000000'), // 5TB
        },
        {
          object_key: 'b',
          etag: 'e2',
          version_id: null,
          content_type: 'text/plain',
          size_bytes: BigInt('5000000000000'), // 5TB
        },
      ];

      const result = computeSealSnapshot(objects);

      expect(result.totalSizeBytes).toBe(BigInt('10000000000000')); // 10TB
      expect(result.objectCount).toBe(2);
    });

    it('should handle empty array', () => {
      const result = computeSealSnapshot([]);

      // Empty payload hash
      const expectedHash = createHash('sha256').update('', 'utf8').digest('hex');
      expect(result.hash).toBe(expectedHash);
      expect(result.objectCount).toBe(0);
      expect(result.totalSizeBytes).toBe(BigInt(0));
    });
  });

  describe('computeEmptyBundleSnapshot', () => {
    it('should return deterministic hash for empty bundle', () => {
      const result = computeEmptyBundleSnapshot();

      const expectedHash = createHash('sha256').update('', 'utf8').digest('hex');
      expect(result.hash).toBe(expectedHash);
      expect(result.objectCount).toBe(0);
      expect(result.totalSizeBytes).toBe(BigInt(0));
    });

    it('should match computeSealSnapshot with empty array', () => {
      const emptyResult = computeEmptyBundleSnapshot();
      const arrayResult = computeSealSnapshot([]);

      expect(emptyResult.hash).toBe(arrayResult.hash);
    });
  });

  describe('canonical format verification', () => {
    it('should produce expected canonical format', () => {
      const obj: EvidenceObjectRow = {
        object_key: 'tenant-123/incident-456/snapshot.json',
        etag: '"d41d8cd98f00b204e9800998ecf8427e"',
        version_id: 'abc123',
        content_type: 'application/json',
        size_bytes: BigInt(1234567890),
      };

      const formatted = formatObjectForHash(obj);
      const lines = formatted.split('\n');

      expect(lines).toHaveLength(5);
      expect(lines[0]).toBe('tenant-123/incident-456/snapshot.json');
      expect(lines[1]).toBe('"d41d8cd98f00b204e9800998ecf8427e"');
      expect(lines[2]).toBe('abc123');
      expect(lines[3]).toBe('application/json');
      expect(lines[4]).toBe('1234567890');
    });

    it('should join multiple objects with single newline', () => {
      const objects: EvidenceObjectRow[] = [
        {
          object_key: 'a',
          etag: 'e1',
          version_id: null,
          content_type: 't1',
          size_bytes: BigInt(1),
        },
        {
          object_key: 'b',
          etag: 'e2',
          version_id: null,
          content_type: 't2',
          size_bytes: BigInt(2),
        },
      ];

      // Manually build expected payload
      const expectedPayload = 'a\ne1\n\nt1\n1\nb\ne2\n\nt2\n2';
      const expectedHash = createHash('sha256')
        .update(expectedPayload, 'utf8')
        .digest('hex');

      const result = computeSealSnapshot(objects);

      expect(result.hash).toBe(expectedHash);
    });
  });
});
