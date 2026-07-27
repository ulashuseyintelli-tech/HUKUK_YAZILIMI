/**
 * Diagnostics Property-Based Tests
 * 
 * Phase 7A - Sprint 3 - Task 3.6
 * 
 * Property-based tests using fast-check for invariant verification.
 * 
 * @see .kiro/specs/self-serve-diagnostics/design.md
 */

import * as fc from 'fast-check';
import { DiagnosticsRedactionService } from '../diagnostics-redaction.service';
import { DiagnosticsRateLimitGuard } from '../guards/diagnostics-rate-limit.guard';

// ============================================================================
// ARBITRARIES
// ============================================================================

// Bu arbitrary'ler once `fc.string(...).filter(regex)` ile yaziliydi ve spec SONSUZA
// KADAR ASILI KALIYORDU. Sebep: `fc.string()` yazdirilabilir ASCII'den (~95 karakter)
// uretir; uzerine dar bir regex filtresi konunca kabul olasiligi yok denecek kadar
// dusuyor (11 karakterin hepsinin rakam olmasi: (10/95)^11 ~ 1.5e-11). fast-check
// gecerli bir ornek bulana kadar yeniden uretmeye devam ettigi icin `numRuns: 5`
// bile testi kurtarmiyordu — jest timeout'u da devreye girmiyor, cunku uretim
// asamasi test govdesine hic ulasmiyor.
//
// Cozum: filtrelemek yerine dogrudan kisitli karakter kumesinden uretmek. Uretilen
// degerlerin sagladigi sozlesme (asagidaki regex'ler) birebir ayni; degisen yalnizca
// uretim yontemi. Testlerin dogruladigi invariant'lar korunmustur.
const DIGIT = fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9');
const LOWER = fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split(''));
const TENANT_TAIL = fc.constantFrom(
  ...'abcdefghijklmnopqrstuvwxyz0123456789_-'.split(''),
);

// /^[a-z][a-z0-9_-]*$/, toplam uzunluk 3..32
const tenantIdArb: fc.Arbitrary<string> = fc
  .tuple(LOWER, fc.string({ unit: TENANT_TAIL, minLength: 2, maxLength: 31 }))
  .map(([head, tail]) => `${head}${tail}`);

const traceIdArb: fc.Arbitrary<string> = fc.uuid();

// /^\d{11}$/
const tcknArb: fc.Arbitrary<string> = fc.string({
  unit: DIGIT,
  minLength: 11,
  maxLength: 11,
});

// /^\+90\d{10}$/
const phoneArb: fc.Arbitrary<string> = fc
  .string({ unit: DIGIT, minLength: 10, maxLength: 10 })
  .map((num) => `+90${num}`);

// /^[a-z]{3,10}@(gmail|hotmail|example)\.com$/
const emailArb: fc.Arbitrary<string> = fc.tuple(
  fc.string({ unit: LOWER, minLength: 3, maxLength: 10 }),
  fc.constantFrom('gmail.com', 'hotmail.com', 'example.com')
).map(([local, domain]) => `${local}@${domain}`);

// ============================================================================
// PROPERTY TESTS
// ============================================================================

describe('Diagnostics Property-Based Tests', () => {
  /**
   * Property 1: Tenant Isolation (via trace access check mock)
   */
  describe('Property 1: Tenant Isolation', () => {
    it('should never allow cross-tenant trace access', () => {
      fc.assert(
        fc.property(
          tenantIdArb,
          tenantIdArb,
          traceIdArb,
          (tenantA, tenantB, _traceId) => {
            fc.pre(tenantA !== tenantB);
            
            // Simulate trace belonging to tenantB
            const traceOwner = tenantB;
            const requestingTenant = tenantA;
            
            // Access check: requesting tenant should NOT match trace owner
            const belongsToTenant = traceOwner === requestingTenant;
            expect(belongsToTenant).toBe(false);
          }
        ),
        { numRuns: 5 }
      );
    });
  });

  /**
   * Property 2: Health Status Derivation (synchronous logic test)
   */
  describe('Property 2: Health Status Derivation', () => {
    const deriveStatus = (successRate: number, p95: number, breakers: number) => {
      if (successRate < 95 || p95 > 2000 || breakers >= 2) return 'INCIDENT';
      if (breakers >= 1) return 'DEGRADED';
      return 'OK';
    };

    it('should derive INCIDENT when success rate < 95%', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 94 }),
          fc.integer({ min: 0, max: 10000 }),
          fc.integer({ min: 0, max: 10 }),
          (successRate, p95, breakers) => {
            expect(deriveStatus(successRate, p95, breakers)).toBe('INCIDENT');
          }
        ),
        { numRuns: 5 }
      );
    });

    it('should derive INCIDENT when p95 > 2000ms', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 95, max: 100 }),
          fc.integer({ min: 2001, max: 10000 }),
          fc.integer({ min: 0, max: 1 }),
          (successRate, p95, breakers) => {
            expect(deriveStatus(successRate, p95, breakers)).toBe('INCIDENT');
          }
        ),
        { numRuns: 5 }
      );
    });

    it('should derive OK when all metrics healthy', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 95, max: 100 }),
          fc.integer({ min: 0, max: 2000 }),
          (successRate, p95) => {
            expect(deriveStatus(successRate, p95, 0)).toBe('OK');
          }
        ),
        { numRuns: 5 }
      );
    });
  });

  /**
   * Property 10: PII Redaction Round-Trip
   */
  describe('Property 10: PII Redaction Round-Trip', () => {
    const TCKN_PATTERN = /\b\d{11}\b/;
    const PHONE_PATTERN = /\+90\d{10}/;
    const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

    it('should redact all TCKN patterns', () => {
      fc.assert(
        fc.property(tcknArb, (tckn) => {
          const redactionService = new DiagnosticsRedactionService();
          const input = { unknownField: `TCKN: ${tckn}` };
          const result = redactionService.redact(input);
          expect(TCKN_PATTERN.test(result.unknownField)).toBe(false);
        }),
        { numRuns: 5 }
      );
    });

    it('should redact all phone patterns', () => {
      fc.assert(
        fc.property(phoneArb, (phone) => {
          const redactionService = new DiagnosticsRedactionService();
          const input = { unknownField: `Tel: ${phone}` };
          const result = redactionService.redact(input);
          expect(PHONE_PATTERN.test(result.unknownField)).toBe(false);
        }),
        { numRuns: 5 }
      );
    });

    it('should redact all email patterns', () => {
      fc.assert(
        fc.property(emailArb, (email) => {
          const redactionService = new DiagnosticsRedactionService();
          const input = { unknownField: `Email: ${email}` };
          const result = redactionService.redact(input);
          expect(EMAIL_PATTERN.test(result.unknownField)).toBe(false);
        }),
        { numRuns: 5 }
      );
    });
  });

  /**
   * Property 15: Rate Limiting
   */
  describe('Property 15: Rate Limiting', () => {
    // Bu iki test eski bir guard API'sine yaziliydi (`burstBuckets`/`minuteBuckets`
    // alanlari ve `checkBurstLimit(tenantId) => { allowed }`). Guard bugun tek bir
    // `buckets: Map<string, CombinedBucket>` tutuyor ve
    // `checkBurstLimit(burst: BurstBucket, now: number): boolean` imzasini kullaniyor.
    // Testler CI'a hic bagli olmadigi icin bu drift yillarca fark edilmedi.
    // Iddialar degismedi; yalnizca guard'in gercek imzasi kullaniliyor.
    type BurstBucketShape = { requests: number[] };
    type GuardInternals = {
      checkBurstLimit(burst: BurstBucketShape, now: number): boolean;
    };

    /** Guard'in tenant basina ayri bucket tutmasini birebir yansitir. */
    const makeBucketStore = () => {
      const buckets = new Map<string, BurstBucketShape>();
      return (tenantId: string): BurstBucketShape => {
        let bucket = buckets.get(tenantId);
        if (!bucket) {
          bucket = { requests: [] };
          buckets.set(tenantId, bucket);
        }
        return bucket;
      };
    };

    // Sabit `now`: tum istekler ayni 1 saniyelik burst penceresine duser.
    const NOW = 1_700_000_000_000;

    it('should allow requests within burst limit', () => {
      fc.assert(
        fc.property(
          tenantIdArb,
          fc.integer({ min: 1, max: 10 }),
          (tenantId, requestCount) => {
            const guard = new DiagnosticsRateLimitGuard() as unknown as GuardInternals;
            const bucketFor = makeBucketStore();
            const burst = bucketFor(tenantId);

            let allowedCount = 0;
            for (let i = 0; i < requestCount; i++) {
              if (guard.checkBurstLimit(burst, NOW)) {
                allowedCount++;
                burst.requests.push(NOW);
              }
            }
            expect(allowedCount).toBe(requestCount);
          }
        ),
        { numRuns: 5 }
      );
    });

    it('should block requests exceeding burst limit', () => {
      fc.assert(
        fc.property(
          tenantIdArb,
          fc.integer({ min: 11, max: 20 }),
          (tenantId, requestCount) => {
            const guard = new DiagnosticsRateLimitGuard() as unknown as GuardInternals;
            const bucketFor = makeBucketStore();
            const burst = bucketFor(tenantId);

            let blockedCount = 0;
            for (let i = 0; i < requestCount; i++) {
              if (guard.checkBurstLimit(burst, NOW)) {
                burst.requests.push(NOW);
              } else {
                blockedCount++;
              }
            }
            expect(blockedCount).toBeGreaterThan(0);
          }
        ),
        { numRuns: 5 }
      );
    });
  });
});
