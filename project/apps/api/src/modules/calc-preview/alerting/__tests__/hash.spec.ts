/**
 * Hash Utilities Tests
 * 
 * Production Alerting System - Sprint 0 Gate A
 * 
 * Tests for deterministic hash generation.
 * 
 * @see Requirements 13.2
 */

import {
  deterministicHash,
  deterministicHashParts,
  deterministicHashFull,
  generateTimestampedId,
  extractTimestampFromId,
  isValidHash,
  isValidFullHash,
} from '../core/hash';

describe('Hash Utilities', () => {
  describe('deterministicHash', () => {
    it('should produce same output for same input', () => {
      const input = 'test-input-string';
      const hash1 = deterministicHash(input);
      const hash2 = deterministicHash(input);
      
      expect(hash1).toBe(hash2);
    });

    it('should produce different output for different inputs', () => {
      const hash1 = deterministicHash('input-a');
      const hash2 = deterministicHash('input-b');
      
      expect(hash1).not.toBe(hash2);
    });

    it('should produce 16 character hex string', () => {
      const hash = deterministicHash('any-input');
      
      expect(hash).toHaveLength(16);
      expect(hash).toMatch(/^[0-9a-f]+$/);
    });

    it('should handle empty string', () => {
      const hash = deterministicHash('');
      
      expect(hash).toHaveLength(16);
      expect(hash).toMatch(/^[0-9a-f]+$/);
    });

    it('should handle unicode characters', () => {
      const hash = deterministicHash('türkçe-içerik-🚀');
      
      expect(hash).toHaveLength(16);
      expect(hash).toMatch(/^[0-9a-f]+$/);
    });

    // Determinism test - same input always produces same output
    it('should produce consistent hash across multiple calls', () => {
      const input = 'alerting-test-key';
      const hash1 = deterministicHash(input);
      const hash2 = deterministicHash(input);
      const hash3 = deterministicHash(input);

      expect(hash1).toBe(hash2);
      expect(hash2).toBe(hash3);
      expect(hash1).toHaveLength(16);
      expect(hash1).toMatch(/^[0-9a-f]+$/);
    });
  });

  describe('deterministicHashParts', () => {
    it('should produce same output for same parts', () => {
      const hash1 = deterministicHashParts('part1', 'part2', 123);
      const hash2 = deterministicHashParts('part1', 'part2', 123);
      
      expect(hash1).toBe(hash2);
    });

    it('should produce different output for different parts', () => {
      const hash1 = deterministicHashParts('a', 'b', 'c');
      const hash2 = deterministicHashParts('a', 'b', 'd');
      
      expect(hash1).not.toBe(hash2);
    });

    it('should handle mixed string and number parts', () => {
      const hash = deterministicHashParts('string', 42, 'another', 3.14);
      
      expect(hash).toHaveLength(16);
      expect(hash).toMatch(/^[0-9a-f]+$/);
    });

    it('should be order-sensitive', () => {
      const hash1 = deterministicHashParts('a', 'b');
      const hash2 = deterministicHashParts('b', 'a');
      
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('deterministicHashFull', () => {
    it('should produce 64 character hex string', () => {
      const hash = deterministicHashFull('any-input');
      
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]+$/);
    });

    it('should be deterministic', () => {
      const hash1 = deterministicHashFull('test');
      const hash2 = deterministicHashFull('test');
      
      expect(hash1).toBe(hash2);
    });
  });

  describe('generateTimestampedId', () => {
    it('should include timestamp prefix', () => {
      const timestamp = 1700000000000; // Known timestamp
      const id = generateTimestampedId(['part1'], timestamp);
      
      expect(id).toContain('_');
      const [timestampHex] = id.split('_');
      expect(parseInt(timestampHex, 16)).toBe(timestamp);
    });

    it('should be deterministic for same inputs', () => {
      const timestamp = 1700000000000;
      const id1 = generateTimestampedId(['a', 'b'], timestamp);
      const id2 = generateTimestampedId(['a', 'b'], timestamp);
      
      expect(id1).toBe(id2);
    });

    it('should produce different IDs for different timestamps', () => {
      const id1 = generateTimestampedId(['part'], 1000);
      const id2 = generateTimestampedId(['part'], 2000);
      
      expect(id1).not.toBe(id2);
    });

    it('should produce different IDs for different parts', () => {
      const timestamp = 1700000000000;
      const id1 = generateTimestampedId(['a'], timestamp);
      const id2 = generateTimestampedId(['b'], timestamp);
      
      expect(id1).not.toBe(id2);
    });
  });

  describe('extractTimestampFromId', () => {
    it('should extract timestamp from valid ID', () => {
      const timestamp = 1700000000000;
      const id = generateTimestampedId(['part'], timestamp);
      
      expect(extractTimestampFromId(id)).toBe(timestamp);
    });

    it('should return null for invalid ID format', () => {
      expect(extractTimestampFromId('invalid')).toBeNull();
      expect(extractTimestampFromId('')).toBeNull();
    });

    it('should return null for non-hex timestamp', () => {
      expect(extractTimestampFromId('xyz_hash')).toBeNull();
    });
  });

  describe('isValidHash', () => {
    it('should return true for valid 16-char hex hash', () => {
      const hash = deterministicHash('test');
      expect(isValidHash(hash)).toBe(true);
    });

    it('should return false for wrong length', () => {
      expect(isValidHash('abc')).toBe(false);
      expect(isValidHash('a'.repeat(20))).toBe(false);
    });

    it('should return false for non-hex characters', () => {
      expect(isValidHash('ghijklmnopqrstuv')).toBe(false);
    });

    it('should return false for non-string', () => {
      expect(isValidHash(123 as unknown as string)).toBe(false);
      expect(isValidHash(null as unknown as string)).toBe(false);
    });
  });

  describe('isValidFullHash', () => {
    it('should return true for valid 64-char hex hash', () => {
      const hash = deterministicHashFull('test');
      expect(isValidFullHash(hash)).toBe(true);
    });

    it('should return false for wrong length', () => {
      expect(isValidFullHash('abc')).toBe(false);
      expect(isValidFullHash(deterministicHash('test'))).toBe(false);
    });
  });
});
