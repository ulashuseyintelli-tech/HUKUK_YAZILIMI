/**
 * Redaction Snapshot Tests
 * 
 * Phase 7A - Sprint 2 - Task 2.3
 * 
 * PII leak prevention tests using fixtures.
 * 
 * Kurallar:
 * - Allowlist tabanlı: SAFE_FIELDS dışındaki string alanlar kontrol edilir
 * - Fail-closed: Redaction hatası → exception
 * - Snapshot testleri: CI'da zorunlu
 * 
 * @see .kiro/specs/self-serve-diagnostics/design.md
 */

import { DiagnosticsRedactionService, PII_PATTERNS, SAFE_FIELDS } from '../diagnostics-redaction.service';

describe('DiagnosticsRedactionService - Snapshot Tests', () => {
  let service: DiagnosticsRedactionService;

  beforeEach(() => {
    service = new DiagnosticsRedactionService();
    service.resetStats();
  });

  // ============================================================================
  // PII PATTERN TESTS
  // ============================================================================

  describe('PII Pattern Detection', () => {
    it('should redact TCKN (11 digits)', () => {
      const input = { unknownField: 'Borçlu TCKN: 12345678901' };
      const result = service.redact(input);
      
      expect(result.unknownField).toBe('Borçlu TCKN: ***********');
      expect(result.unknownField).not.toMatch(/\d{11}/);
    });

    it('should redact Turkish phone numbers', () => {
      const testCases = [
        { input: '+905551234567', expected: '+90*******67' },
        { input: '05551234567', expected: '+90*******67' },
        { input: '+90 555 123 45 67', expected: '+90*******67' },
        { input: '0555 123 45 67', expected: '+90*******67' },
      ];

      for (const { input, expected } of testCases) {
        const obj = { unknownField: input };
        const result = service.redact(obj);
        expect(result.unknownField).toBe(expected);
      }
    });

    it('should redact email addresses', () => {
      const input = { unknownField: 'Contact: test@example.com' };
      const result = service.redact(input);
      
      expect(result.unknownField).toBe('Contact: t***@***.com');
      expect(result.unknownField).not.toMatch(PII_PATTERNS.EMAIL);
    });

    it('should redact multiple PII in same string', () => {
      const input = {
        unknownField: 'TCKN: 12345678901, Tel: +905551234567, Email: test@example.com',
      };
      const result = service.redact(input);
      
      expect(result.unknownField).not.toMatch(/\d{11}/);
      expect(result.unknownField).not.toMatch(/5551234567/);
      expect(result.unknownField).not.toMatch(/test@example/);
    });
  });

  // ============================================================================
  // SAFE FIELDS TESTS
  // ============================================================================

  describe('Safe Fields (Allowlist)', () => {
    it('should NOT redact safe fields even with PII-like content', () => {
      // traceId is a safe field
      const input = {
        traceId: '12345678901', // Looks like TCKN but is safe
        tenantId: 'tenant-12345678901',
      };
      const result = service.redact(input);
      
      // Safe fields should pass through unchanged
      expect(result.traceId).toBe('12345678901');
      expect(result.tenantId).toBe('tenant-12345678901');
    });

    it('should preserve all SAFE_FIELDS', () => {
      const safeFieldsToTest = [
        'traceId', 'requestId', 'tenantId', 'clientId', 'endpoint',
        'startedAt', 'finishedAt', 'durationMs', 'status', 'timestamp',
      ];

      for (const field of safeFieldsToTest) {
        expect(SAFE_FIELDS.has(field)).toBe(true);
      }
    });
  });

  // ============================================================================
  // UNKNOWN FIELDS TESTS
  // ============================================================================

  describe('Unknown Fields (Fallback)', () => {
    it('should log and redact unknown string fields with PII', () => {
      const input = {
        customField: 'User TCKN is 12345678901',
        anotherUnknown: 'Call +905551234567',
      };
      const result = service.redact(input);
      
      expect(result.customField).toBe('User TCKN is ***********');
      expect(result.anotherUnknown).toBe('Call +90*******67');
      
      const stats = service.getStats();
      expect(stats.unknownFieldsRedacted).toBeGreaterThan(0);
    });

    it('should pass through unknown fields without PII', () => {
      const input = {
        customField: 'This is safe text',
        anotherField: 'No PII here',
      };
      const result = service.redact(input);
      
      expect(result.customField).toBe('This is safe text');
      expect(result.anotherField).toBe('No PII here');
    });
  });

  // ============================================================================
  // RECURSIVE REDACTION TESTS
  // ============================================================================

  describe('Recursive Redaction', () => {
    it('should redact nested objects', () => {
      const input = {
        level1: {
          level2: {
            unknownField: 'TCKN: 12345678901',
          },
        },
      };
      const result = service.redact(input);
      
      expect(result.level1.level2.unknownField).toBe('TCKN: ***********');
    });

    it('should redact arrays', () => {
      const input = {
        items: [
          { unknownField: 'Tel: +905551234567' },
          { unknownField: 'Email: test@example.com' },
        ],
      };
      const result = service.redact(input);
      
      expect(result.items[0].unknownField).toBe('Tel: +90*******67');
      expect(result.items[1].unknownField).toBe('Email: t***@***.com');
    });

    it('should handle mixed nested structures', () => {
      const input = {
        meta: {
          traceId: 'trace-123', // Safe
          custom: {
            unknownField: '12345678901', // PII
          },
        },
        items: [
          { status: 'OK', unknownField: 'test@example.com' },
        ],
      };
      const result = service.redact(input);
      
      expect(result.meta.traceId).toBe('trace-123');
      expect(result.meta.custom.unknownField).toBe('***********');
      expect(result.items[0].status).toBe('OK');
      expect(result.items[0].unknownField).toBe('t***@***.com');
    });
  });

  // ============================================================================
  // TRACE BUNDLE SNAPSHOT TESTS
  // ============================================================================

  describe('TraceBundle Redaction Snapshots', () => {
    it('should safely redact a typical trace bundle', () => {
      const traceBundle = {
        meta: {
          traceId: 'trace-abc-123',
          requestId: 'req-xyz-456',
          tenantId: 'tenant-001',
          endpoint: '/calc/preview',
          mode: 'PREVIEW',
          startedAt: '2026-01-17T10:00:00Z',
          finishedAt: '2026-01-17T10:00:01Z',
          durationMs: 1000,
          version: {
            service: '1.0.0',
          },
        },
        input: {
          fingerprint: 'hash-123',
          normalizedSummary: {
            principalAmount: 100000,
            currency: 'TRY',
          },
        },
        result: {
          status: 'OK',
          totals: {
            interest: 5000,
            fees: 1000,
            total: 106000,
          },
        },
        warnings: [],
        dependencies: [],
        cache: { hits: 1, misses: 0, staleServed: 0, byNamespace: {} },
        circuitBreaker: { byDependency: {}, events: [] },
        rateLimit: { applied: false },
        policy: {},
      };

      const result = service.redact(traceBundle);
      
      // All safe fields should be preserved
      expect(result.meta.traceId).toBe('trace-abc-123');
      expect(result.meta.tenantId).toBe('tenant-001');
      expect(result.result.status).toBe('OK');
      expect(result.result.totals.total).toBe(106000);
    });

    it('should redact PII injected into trace bundle', () => {
      const traceBundleWithPII = {
        meta: {
          traceId: 'trace-abc-123',
          tenantId: 'tenant-001',
          startedAt: '2026-01-17T10:00:00Z',
          durationMs: 1000,
        },
        // Simulating PII leak in unknown field
        debtorInfo: {
          name: 'Ahmet Yılmaz',
          tckn: '12345678901',
          phone: '+905551234567',
          email: 'ahmet@example.com',
          address: 'İstanbul, Türkiye',
        },
        result: {
          status: 'OK',
        },
      };

      const result = service.redact(traceBundleWithPII);
      
      // Safe fields preserved
      expect(result.meta.traceId).toBe('trace-abc-123');
      
      // PII should be redacted
      expect(result.debtorInfo.tckn).toBe('***********');
      expect(result.debtorInfo.phone).toBe('+90*******67');
      expect(result.debtorInfo.email).toBe('a***@***.com');
      
      // Name and address don't match PII patterns but are unknown fields
      // They pass through if no PII pattern matches
      expect(result.debtorInfo.name).toBe('Ahmet Yılmaz');
      expect(result.debtorInfo.address).toBe('İstanbul, Türkiye');
    });
  });

  // ============================================================================
  // EDGE CASES
  // ============================================================================

  describe('Edge Cases', () => {
    it('should handle null and undefined', () => {
      expect(service.redact(null)).toBeNull();
      expect(service.redact(undefined)).toBeUndefined();
    });

    it('should handle empty objects and arrays', () => {
      expect(service.redact({})).toEqual({});
      expect(service.redact([])).toEqual([]);
    });

    it('should handle primitives', () => {
      expect(service.redact(123)).toBe(123);
      expect(service.redact(true)).toBe(true);
      expect(service.redact('safe string')).toBe('safe string');
    });

    it('should handle deeply nested structures without stack overflow', () => {
      let deep: Record<string, unknown> = { value: 'test' };
      for (let i = 0; i < 100; i++) {
        deep = { nested: deep };
      }
      
      // Should not throw
      expect(() => service.redact(deep)).not.toThrow();
    });
  });

  // ============================================================================
  // EXPLICIT REDACTION METHODS
  // ============================================================================

  describe('Explicit Redaction Methods', () => {
    it('should redact debtor name', () => {
      expect(service.redactDebtorName('Ahmet Yılmaz')).toBe('A***');
      expect(service.redactDebtorName('')).toBe('');
    });

    it('should redact address completely', () => {
      expect(service.redactAddress('İstanbul, Kadıköy, Türkiye')).toBe('[ADRES GİZLİ]');
    });
  });

  // ============================================================================
  // STATISTICS
  // ============================================================================

  describe('Redaction Statistics', () => {
    it('should track redaction statistics', () => {
      service.redact({ unknownField: '12345678901' });
      service.redact({ unknownField: '+905551234567' });
      service.redact({ unknownField: 'test@example.com' });
      
      const stats = service.getStats();
      
      expect(stats.totalRedactions).toBe(3);
      expect(stats.piiPatternsMatched).toBe(3);
      expect(stats.unknownFieldsRedacted).toBe(3);
      expect(stats.errors).toBe(0);
    });

    it('should reset statistics', () => {
      service.redact({ unknownField: '12345678901' });
      service.resetStats();
      
      const stats = service.getStats();
      expect(stats.totalRedactions).toBe(0);
    });
  });
});
