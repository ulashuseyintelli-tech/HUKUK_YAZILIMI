/**
 * Phase 9C Task 3 - Canonical JSON Tests
 */

import {
  canonicalStringify,
  parseAndSort,
  canonicalEquals,
} from '../bundle-manifest.canonical';

describe('Canonical JSON', () => {
  describe('canonicalStringify', () => {
    it('should sort object keys alphabetically', () => {
      const obj = { z: 1, a: 2, m: 3 };
      const result = canonicalStringify(obj);
      
      expect(result).toBe('{"a":2,"m":3,"z":1}');
    });

    it('should sort nested object keys', () => {
      const obj = { b: { z: 1, a: 2 }, a: 1 };
      const result = canonicalStringify(obj);
      
      expect(result).toBe('{"a":1,"b":{"a":2,"z":1}}');
    });

    it('should preserve array order', () => {
      const obj = { arr: [3, 1, 2] };
      const result = canonicalStringify(obj);
      
      expect(result).toBe('{"arr":[3,1,2]}');
    });

    it('should sort objects inside arrays', () => {
      const obj = { arr: [{ z: 1, a: 2 }, { b: 3 }] };
      const result = canonicalStringify(obj);
      
      expect(result).toBe('{"arr":[{"a":2,"z":1},{"b":3}]}');
    });

    it('should handle null', () => {
      const obj = { a: null };
      const result = canonicalStringify(obj);
      
      expect(result).toBe('{"a":null}');
    });

    it('should handle boolean', () => {
      const obj = { t: true, f: false };
      const result = canonicalStringify(obj);
      
      expect(result).toBe('{"f":false,"t":true}');
    });

    it('should handle numbers', () => {
      const obj = { n: 123, f: 1.5 };
      const result = canonicalStringify(obj);
      
      expect(result).toBe('{"f":1.5,"n":123}');
    });

    it('should handle strings with special characters', () => {
      const obj = { s: 'hello\nworld' };
      const result = canonicalStringify(obj);
      
      expect(result).toBe('{"s":"hello\\nworld"}');
    });

    it('should produce no whitespace', () => {
      const obj = { a: 1, b: { c: 2 } };
      const result = canonicalStringify(obj);
      
      expect(result).not.toContain(' ');
      expect(result).not.toContain('\n');
      expect(result).not.toContain('\t');
    });

    it('should be deterministic', () => {
      const obj = { z: 1, a: 2, m: { x: 3, y: 4 } };
      
      const result1 = canonicalStringify(obj);
      const result2 = canonicalStringify(obj);
      const result3 = canonicalStringify({ a: 2, z: 1, m: { y: 4, x: 3 } });
      
      expect(result1).toBe(result2);
      expect(result1).toBe(result3);
    });

    it('should handle empty object', () => {
      expect(canonicalStringify({})).toBe('{}');
    });

    it('should handle empty array', () => {
      expect(canonicalStringify([])).toBe('[]');
    });
  });

  describe('parseAndSort', () => {
    it('should parse and sort JSON', () => {
      const json = '{"z":1,"a":2}';
      const result = parseAndSort(json);
      
      expect(result).toEqual({ a: 2, z: 1 });
    });

    it('should handle nested objects', () => {
      const json = '{"b":{"z":1,"a":2},"a":1}';
      const result = parseAndSort(json);
      
      expect(result).toEqual({ a: 1, b: { a: 2, z: 1 } });
    });
  });

  describe('canonicalEquals', () => {
    it('should return true for equal objects with different key order', () => {
      const a = { z: 1, a: 2 };
      const b = { a: 2, z: 1 };
      
      expect(canonicalEquals(a, b)).toBe(true);
    });

    it('should return false for different objects', () => {
      const a = { a: 1 };
      const b = { a: 2 };
      
      expect(canonicalEquals(a, b)).toBe(false);
    });

    it('should handle nested objects', () => {
      const a = { x: { z: 1, a: 2 } };
      const b = { x: { a: 2, z: 1 } };
      
      expect(canonicalEquals(a, b)).toBe(true);
    });
  });

  describe('golden file tests', () => {
    it('should produce expected output for manifest-like structure', () => {
      const manifest = {
        version: '1.0.0',
        bundleId: '550e8400-e29b-41d4-a716-446655440000',
        tenantId: 'tenant-1',
        incidentId: 'incident-1',
        state: 'SEALED',
        sealedHash: 'abc123',
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

      const result = canonicalStringify(manifest);
      
      // Verify key order
      expect(result.indexOf('"bundleId"')).toBeLessThan(result.indexOf('"createdAt"'));
      expect(result.indexOf('"createdAt"')).toBeLessThan(result.indexOf('"incidentId"'));
      expect(result.indexOf('"incidentId"')).toBeLessThan(result.indexOf('"objectCount"'));
      
      // Verify no whitespace
      expect(result).not.toMatch(/\s/);
      
      // Verify parseable
      const parsed = JSON.parse(result);
      expect(parsed.version).toBe('1.0.0');
    });
  });
});
