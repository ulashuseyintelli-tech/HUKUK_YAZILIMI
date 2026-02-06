/**
 * IP Normalizer Tests
 * 
 * Phase 10.2 - Task 2.1
 */

import { normalizeIp } from '../ip-normalizer';

describe('IP Normalizer', () => {
  describe('IPv4', () => {
    it('should return IPv4 as-is (trimmed, lowercase)', () => {
      expect(normalizeIp('192.168.1.1')).toBe('192.168.1.1');
      expect(normalizeIp('  192.168.1.1  ')).toBe('192.168.1.1');
      expect(normalizeIp('10.0.0.1')).toBe('10.0.0.1');
    });

    it('should return null for invalid IPv4', () => {
      expect(normalizeIp('256.1.1.1')).toBeNull();
      expect(normalizeIp('192.168.1')).toBeNull();
      expect(normalizeIp('not-an-ip')).toBeNull();
    });
  });

  describe('IPv6', () => {
    it('should normalize loopback', () => {
      expect(normalizeIp('::1')).toBe('::1');
      expect(normalizeIp('0:0:0:0:0:0:0:1')).toBe('::1');
      expect(normalizeIp('0000:0000:0000:0000:0000:0000:0000:0001')).toBe('::1');
    });

    it('should normalize with compression', () => {
      expect(normalizeIp('2001:db8:0:0:0:0:0:1')).toBe('2001:db8::1');
      expect(normalizeIp('2001:0db8:0000:0000:0000:0000:0000:0001')).toBe('2001:db8::1');
    });

    it('should handle all zeros', () => {
      expect(normalizeIp('::')).toBe('::');
      expect(normalizeIp('0:0:0:0:0:0:0:0')).toBe('::');
    });

    it('should lowercase', () => {
      expect(normalizeIp('2001:DB8::1')).toBe('2001:db8::1');
      expect(normalizeIp('FE80::1')).toBe('fe80::1');
    });
  });

  describe('IPv4-mapped IPv6', () => {
    it('should extract IPv4 from dotted notation', () => {
      expect(normalizeIp('::ffff:192.168.1.1')).toBe('192.168.1.1');
      expect(normalizeIp('::FFFF:10.0.0.1')).toBe('10.0.0.1');
    });

    it('should extract IPv4 from hex notation', () => {
      // ::ffff:c0a8:0101 = ::ffff:192.168.1.1
      expect(normalizeIp('::ffff:c0a8:0101')).toBe('192.168.1.1');
    });
  });

  describe('edge cases', () => {
    it('should return null for null/undefined/empty', () => {
      expect(normalizeIp(null)).toBeNull();
      expect(normalizeIp(undefined)).toBeNull();
      expect(normalizeIp('')).toBeNull();
      expect(normalizeIp('   ')).toBeNull();
    });

    it('should handle whitespace', () => {
      expect(normalizeIp('  ::1  ')).toBe('::1');
      expect(normalizeIp('\t192.168.1.1\n')).toBe('192.168.1.1');
    });
  });
});
