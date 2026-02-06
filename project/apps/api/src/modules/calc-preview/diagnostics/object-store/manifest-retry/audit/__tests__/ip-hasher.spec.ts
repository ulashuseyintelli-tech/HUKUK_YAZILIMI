/**
 * IP Hasher Tests
 * 
 * Phase 10.2 - Task 2.1
 */

import { hashIp } from '../ip-hasher';

describe('IP Hasher', () => {
  const TEST_SECRET = 'test-secret-key-for-hmac';

  describe('with secret', () => {
    it('should hash IPv4 address', () => {
      const hash = hashIp('192.168.1.1', TEST_SECRET);
      
      expect(hash).not.toBeNull();
      expect(hash).toHaveLength(32);
      expect(hash).toMatch(/^[a-f0-9]+$/);
    });

    it('should hash IPv6 address', () => {
      const hash = hashIp('::1', TEST_SECRET);
      
      expect(hash).not.toBeNull();
      expect(hash).toHaveLength(32);
    });

    it('should produce same hash for equivalent IPs', () => {
      // IPv6 equivalents
      const hash1 = hashIp('::1', TEST_SECRET);
      const hash2 = hashIp('0:0:0:0:0:0:0:1', TEST_SECRET);
      
      expect(hash1).toBe(hash2);
    });

    it('should produce same hash for IPv4-mapped IPv6', () => {
      const hash1 = hashIp('192.168.1.1', TEST_SECRET);
      const hash2 = hashIp('::ffff:192.168.1.1', TEST_SECRET);
      
      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different IPs', () => {
      const hash1 = hashIp('192.168.1.1', TEST_SECRET);
      const hash2 = hashIp('192.168.1.2', TEST_SECRET);
      
      expect(hash1).not.toBe(hash2);
    });

    it('should produce different hashes with different secrets', () => {
      const hash1 = hashIp('192.168.1.1', 'secret1');
      const hash2 = hashIp('192.168.1.1', 'secret2');
      
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('without secret (fail-closed)', () => {
    it('should return null when secret is null', () => {
      const hash = hashIp('192.168.1.1', null);
      expect(hash).toBeNull();
    });

    it('should return null when secret is empty string', () => {
      const hash = hashIp('192.168.1.1', '');
      expect(hash).toBeNull();
    });
  });

  describe('invalid IP', () => {
    it('should return null for invalid IP', () => {
      expect(hashIp('not-an-ip', TEST_SECRET)).toBeNull();
      expect(hashIp('256.1.1.1', TEST_SECRET)).toBeNull();
    });

    it('should return null for null/undefined IP', () => {
      expect(hashIp(null, TEST_SECRET)).toBeNull();
      expect(hashIp(undefined, TEST_SECRET)).toBeNull();
    });

    it('should return null for empty IP', () => {
      expect(hashIp('', TEST_SECRET)).toBeNull();
      expect(hashIp('   ', TEST_SECRET)).toBeNull();
    });
  });
});
