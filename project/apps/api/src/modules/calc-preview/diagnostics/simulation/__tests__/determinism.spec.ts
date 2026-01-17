/**
 * Determinism Tests
 * 
 * Phase 8 - Sprint 2A
 * 
 * Tests for PRNG, hash generation, and deterministic utilities.
 */

import {
  mulberry32,
  createSeededRng,
  generateRunId,
  canonicalHash,
  canonicalStringify,
  deterministicSort,
} from '../determinism';

describe('Determinism Utilities', () => {
  describe('mulberry32', () => {
    it('should produce same sequence for same seed', () => {
      const rng1 = mulberry32(12345);
      const rng2 = mulberry32(12345);

      const seq1 = [rng1(), rng1(), rng1(), rng1(), rng1()];
      const seq2 = [rng2(), rng2(), rng2(), rng2(), rng2()];

      expect(seq1).toEqual(seq2);
    });

    it('should produce different sequences for different seeds', () => {
      const rng1 = mulberry32(12345);
      const rng2 = mulberry32(54321);

      const seq1 = [rng1(), rng1(), rng1()];
      const seq2 = [rng2(), rng2(), rng2()];

      expect(seq1).not.toEqual(seq2);
    });

    it('should produce values in [0, 1)', () => {
      const rng = mulberry32(42);

      for (let i = 0; i < 1000; i++) {
        const value = rng();
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(1);
      }
    });

    it('should handle edge case seeds', () => {
      // Zero seed
      const rng0 = mulberry32(0);
      expect(rng0()).toBeDefined();

      // Max uint32
      const rngMax = mulberry32(0xFFFFFFFF);
      expect(rngMax()).toBeDefined();

      // Negative (converted to unsigned)
      const rngNeg = mulberry32(-1);
      expect(rngNeg()).toBeDefined();
    });
  });

  describe('createSeededRng', () => {
    it('should produce same sequence for same inputs', () => {
      const rng1 = createSeededRng(42, 'incident-1', 'scenario-1');
      const rng2 = createSeededRng(42, 'incident-1', 'scenario-1');

      const seq1 = [rng1(), rng1(), rng1()];
      const seq2 = [rng2(), rng2(), rng2()];

      expect(seq1).toEqual(seq2);
    });

    it('should produce different sequences for different additional inputs', () => {
      const rng1 = createSeededRng(42, 'incident-1');
      const rng2 = createSeededRng(42, 'incident-2');

      const seq1 = [rng1(), rng1(), rng1()];
      const seq2 = [rng2(), rng2(), rng2()];

      expect(seq1).not.toEqual(seq2);
    });
  });

  describe('generateRunId', () => {
    it('should produce same runId for same inputs', () => {
      const id1 = generateRunId('incident-1', 'scenario-1', 42, '2A.1');
      const id2 = generateRunId('incident-1', 'scenario-1', 42, '2A.1');

      expect(id1).toBe(id2);
    });

    it('should produce different runId for different inputs', () => {
      const id1 = generateRunId('incident-1', 'scenario-1', 42, '2A.1');
      const id2 = generateRunId('incident-2', 'scenario-1', 42, '2A.1');
      const id3 = generateRunId('incident-1', 'scenario-2', 42, '2A.1');
      const id4 = generateRunId('incident-1', 'scenario-1', 43, '2A.1');
      const id5 = generateRunId('incident-1', 'scenario-1', 42, '2A.2');

      expect(new Set([id1, id2, id3, id4, id5]).size).toBe(5);
    });

    it('should have expected format', () => {
      const id = generateRunId('incident-1', 'scenario-1', 42, '2A.1');

      expect(id).toMatch(/^sim_2A\.1_[a-f0-9]{8}$/);
    });
  });

  describe('canonicalHash', () => {
    it('should produce same hash for same object', () => {
      const obj = { a: 1, b: 'test', c: [1, 2, 3] };

      const hash1 = canonicalHash(obj);
      const hash2 = canonicalHash(obj);

      expect(hash1).toBe(hash2);
    });

    it('should produce same hash regardless of key order', () => {
      const obj1 = { a: 1, b: 2, c: 3 };
      const obj2 = { c: 3, a: 1, b: 2 };
      const obj3 = { b: 2, c: 3, a: 1 };

      const hash1 = canonicalHash(obj1);
      const hash2 = canonicalHash(obj2);
      const hash3 = canonicalHash(obj3);

      expect(hash1).toBe(hash2);
      expect(hash2).toBe(hash3);
    });

    it('should produce different hash for different values', () => {
      const hash1 = canonicalHash({ a: 1 });
      const hash2 = canonicalHash({ a: 2 });

      expect(hash1).not.toBe(hash2);
    });

    it('should handle nested objects with key order independence', () => {
      const obj1 = { outer: { inner: { a: 1, b: 2 } } };
      const obj2 = { outer: { inner: { b: 2, a: 1 } } };

      expect(canonicalHash(obj1)).toBe(canonicalHash(obj2));
    });

    it('should handle arrays (order matters)', () => {
      const hash1 = canonicalHash([1, 2, 3]);
      const hash2 = canonicalHash([3, 2, 1]);

      expect(hash1).not.toBe(hash2);
    });

    it('should handle null and undefined', () => {
      expect(canonicalHash(null)).toBeDefined();
      expect(canonicalHash(undefined)).toBeDefined();
      expect(canonicalHash({ a: null })).toBeDefined();
    });
  });

  describe('canonicalStringify', () => {
    it('should sort keys alphabetically', () => {
      const obj = { z: 1, a: 2, m: 3 };
      const str = canonicalStringify(obj);

      expect(str).toBe('{"a":2,"m":3,"z":1}');
    });

    it('should handle nested objects', () => {
      const obj = { b: { z: 1, a: 2 }, a: 1 };
      const str = canonicalStringify(obj);

      expect(str).toBe('{"a":1,"b":{"a":2,"z":1}}');
    });
  });

  describe('deterministicSort', () => {
    it('should sort with primary comparator', () => {
      const rng = mulberry32(42);
      const items = [{ priority: 3 }, { priority: 1 }, { priority: 2 }];

      const sorted = deterministicSort(
        items,
        (a, b) => a.priority - b.priority,
        rng,
      );

      expect(sorted.map(x => x.priority)).toEqual([1, 2, 3]);
    });

    it('should use RNG for tiebreaking', () => {
      const items = [
        { priority: 1, id: 'a' },
        { priority: 1, id: 'b' },
        { priority: 1, id: 'c' },
      ];

      // Same seed should produce same order
      const rng1 = mulberry32(42);
      const rng2 = mulberry32(42);

      const sorted1 = deterministicSort(items, (a, b) => a.priority - b.priority, rng1);
      const sorted2 = deterministicSort(items, (a, b) => a.priority - b.priority, rng2);

      expect(sorted1.map(x => x.id)).toEqual(sorted2.map(x => x.id));
    });

    it('should produce different order with different seeds', () => {
      const items = [
        { priority: 1, id: 'a' },
        { priority: 1, id: 'b' },
        { priority: 1, id: 'c' },
        { priority: 1, id: 'd' },
        { priority: 1, id: 'e' },
      ];

      const rng1 = mulberry32(42);
      const rng2 = mulberry32(999);

      const sorted1 = deterministicSort(items, (a, b) => a.priority - b.priority, rng1);
      const sorted2 = deterministicSort(items, (a, b) => a.priority - b.priority, rng2);

      // With 5 items all same priority, different seeds should likely produce different order
      // (not guaranteed but highly probable)
      expect(sorted1.map(x => x.id)).not.toEqual(sorted2.map(x => x.id));
    });
  });
});
