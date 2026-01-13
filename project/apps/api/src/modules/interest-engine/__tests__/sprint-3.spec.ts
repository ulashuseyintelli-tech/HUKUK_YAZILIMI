/**
 * Sprint-3: Allocation Engine Tests
 * 
 * Task 8.4: Property test for TBK 100 Allocation Order
 * Task 8.5: Property test for Multi-Claim Priority Order
 * Task 8.6: Property test for Monotonicity Under Additional Payment
 * Task 8.7: Property test for Idempotent Allocation Steps
 * Task 8.8: Unit tests for TBK 100 vs Policy conflict
 */

import * as fc from 'fast-check';
import { 
  TBK100AllocatorService, 
  DebtState,
  DEFAULT_ANCILLARY_PRIORITY,
} from '../allocation/tbk100-allocator.service';
import { 
  ClaimPriorityService, 
  ClaimPriorityRule,
  ClaimWithInterest,
} from '../allocation/claim-priority.service';
import { 
  AllocationEngineService,
  AllocationOptions,
} from '../allocation/allocation-engine.service';
import { 
  AncillaryType, 
  ClaimBucket, 
  Segment, 
  Payment,
  InterestTypeCode,
} from '../types/domain.types';

describe('Sprint-3: Allocation Engine', () => {
  let tbk100Allocator: TBK100AllocatorService;
  let claimPriority: ClaimPriorityService;
  let allocationEngine: AllocationEngineService;

  beforeEach(() => {
    tbk100Allocator = new TBK100AllocatorService();
    claimPriority = new ClaimPriorityService();
    allocationEngine = new AllocationEngineService(tbk100Allocator, claimPriority);
  });


  // ═══════════════════════════════════════════════════════════════════════════
  // HELPER FUNCTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  function createDebtState(
    principal: number,
    accruedInterest: number,
    costs?: Partial<Record<AncillaryType, number>>,
    ancillaries?: Partial<Record<AncillaryType, number>>,
  ): DebtState {
    return tbk100Allocator.createDebtState(
      principal,
      accruedInterest,
      costs as Record<AncillaryType, number>,
      ancillaries as Record<AncillaryType, number>,
    );
  }

  function createClaim(
    id: string,
    amount: number,
    startDate: string,
    priority?: number,
  ): ClaimBucket {
    return {
      id,
      amount,
      currency: 'TRY',
      startDate,
      interestType: InterestTypeCode.COMMERCIAL_AVANS_3095_2_2,
      dayCountBasis: 365,
      priority,
    };
  }

  function createSegment(
    claimBucketId: string,
    days: number,
    rate: number,
    segmentInterest: number,
  ): Segment {
    return {
      claimBucketId,
      periodStart: '2025-01-01',
      periodEnd: '2025-01-15',
      days,
      rate,
      rateId: 'rate-1',
      rateSource: 'TCMB',
      principal: 100000,
      segmentInterest,
    };
  }

  function createPayment(id: string, date: string, amount: number): Payment {
    return { id, date, amount, currency: 'TRY' };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TASK 8.1: TBK 100 CORE ALLOCATOR UNIT TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Task 8.1: TBK100AllocatorService', () => {
    describe('Basic Allocation', () => {
      it('should allocate to interest first', () => {
        const debtState = createDebtState(100000, 5000);
        const result = tbk100Allocator.allocate(3000, debtState);

        expect(result.allocations[0].category).toBe('INTEREST');
        expect(result.allocations[0].amountAllocated).toBe(3000);
        expect(result.newDebtState.accruedInterest).toBe(2000);
        expect(result.newDebtState.principal).toBe(100000);
      });

      it('should allocate to principal after interest is fully paid', () => {
        const debtState = createDebtState(100000, 5000);
        const result = tbk100Allocator.allocate(8000, debtState);

        const interestAlloc = result.allocations.find(a => a.category === 'INTEREST');
        const principalAlloc = result.allocations.find(a => a.category === 'PRINCIPAL');

        expect(interestAlloc?.amountAllocated).toBe(5000);
        expect(principalAlloc?.amountAllocated).toBe(3000);
        expect(result.newDebtState.accruedInterest).toBe(0);
        expect(result.newDebtState.principal).toBe(97000);
      });

      it('should allocate to costs before principal', () => {
        const debtState = createDebtState(100000, 5000, {
          [AncillaryType.HARC]: 1000,
          [AncillaryType.TEBLIGAT_MASRAFI]: 500,
        });
        const result = tbk100Allocator.allocate(7000, debtState);

        const interestAlloc = result.allocations.find(a => a.category === 'INTEREST');
        const harcAlloc = result.allocations.find(a => a.category === AncillaryType.HARC);
        const tebligatAlloc = result.allocations.find(a => a.category === AncillaryType.TEBLIGAT_MASRAFI);
        const principalAlloc = result.allocations.find(a => a.category === 'PRINCIPAL');

        expect(interestAlloc?.amountAllocated).toBe(5000);
        expect(harcAlloc?.amountAllocated).toBe(1000);
        expect(tebligatAlloc?.amountAllocated).toBe(500);
        expect(principalAlloc?.amountAllocated).toBe(500);
      });
    });


    describe('Edge Cases', () => {
      it('should handle payment less than interest', () => {
        const debtState = createDebtState(100000, 10000);
        const result = tbk100Allocator.allocate(5000, debtState);

        expect(result.allocations[0].amountAllocated).toBe(5000);
        expect(result.newDebtState.accruedInterest).toBe(5000);
        expect(result.newDebtState.principal).toBe(100000);
        expect(result.remainingPayment).toBe(0);
      });

      it('should handle payment exactly equal to interest', () => {
        const debtState = createDebtState(100000, 5000);
        const result = tbk100Allocator.allocate(5000, debtState);

        expect(result.newDebtState.accruedInterest).toBe(0);
        expect(result.newDebtState.principal).toBe(100000);
      });

      it('should handle full payoff', () => {
        const debtState = createDebtState(100000, 5000, {
          [AncillaryType.HARC]: 1000,
        });
        const result = tbk100Allocator.allocate(200000, debtState);

        expect(result.newDebtState.accruedInterest).toBe(0);
        expect(result.newDebtState.principal).toBe(0);
        expect(result.newDebtState.costs.get(AncillaryType.HARC)).toBe(0);
        expect(result.remainingPayment).toBe(94000);
      });

      it('should handle zero interest', () => {
        const debtState = createDebtState(100000, 0);
        const result = tbk100Allocator.allocate(5000, debtState);

        const principalAlloc = result.allocations.find(a => a.category === 'PRINCIPAL');
        expect(principalAlloc?.amountAllocated).toBe(5000);
      });

      it('should throw error for negative payment', () => {
        const debtState = createDebtState(100000, 5000);
        expect(() => tbk100Allocator.allocate(-1000, debtState)).toThrow();
      });
    });

    describe('Debt State Helpers', () => {
      it('should calculate total debt correctly', () => {
        const debtState = createDebtState(100000, 5000, {
          [AncillaryType.HARC]: 1000,
          [AncillaryType.VEKALET_UCRETI]: 2000,
        });
        expect(tbk100Allocator.calculateTotalDebt(debtState)).toBe(108000);
      });

      it('should detect fully paid debt', () => {
        const debtState = createDebtState(0, 0);
        expect(tbk100Allocator.isFullyPaid(debtState)).toBe(true);
      });

      it('should detect unpaid debt', () => {
        const debtState = createDebtState(100, 0);
        expect(tbk100Allocator.isFullyPaid(debtState)).toBe(false);
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TASK 8.2: CLAIM PRIORITY SERVICE UNIT TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Task 8.2: ClaimPriorityService', () => {
    describe('OLDEST_DUE_FIRST', () => {
      it('should sort claims by startDate ascending', () => {
        const claims: ClaimWithInterest[] = [
          { claim: createClaim('c1', 100000, '2025-03-01'), accruedInterest: 1000, effectiveRate: 0.50, segments: [] },
          { claim: createClaim('c2', 100000, '2025-01-01'), accruedInterest: 2000, effectiveRate: 0.50, segments: [] },
          { claim: createClaim('c3', 100000, '2025-02-01'), accruedInterest: 1500, effectiveRate: 0.50, segments: [] },
        ];

        const sorted = claimPriority.sortClaims(claims, ClaimPriorityRule.OLDEST_DUE_FIRST);

        expect(sorted[0].claim.id).toBe('c2'); // 2025-01-01
        expect(sorted[1].claim.id).toBe('c3'); // 2025-02-01
        expect(sorted[2].claim.id).toBe('c1'); // 2025-03-01
      });

      it('should use amount as secondary sort for same date', () => {
        const claims: ClaimWithInterest[] = [
          { claim: createClaim('c1', 50000, '2025-01-01'), accruedInterest: 1000, effectiveRate: 0.50, segments: [] },
          { claim: createClaim('c2', 100000, '2025-01-01'), accruedInterest: 2000, effectiveRate: 0.50, segments: [] },
        ];

        const sorted = claimPriority.sortClaims(claims, ClaimPriorityRule.OLDEST_DUE_FIRST);

        expect(sorted[0].claim.id).toBe('c2'); // Larger amount first
        expect(sorted[1].claim.id).toBe('c1');
      });
    });


    describe('HIGHEST_RATE_FIRST', () => {
      it('should sort claims by effectiveRate descending', () => {
        const claims: ClaimWithInterest[] = [
          { claim: createClaim('c1', 100000, '2025-01-01'), accruedInterest: 1000, effectiveRate: 0.40, segments: [] },
          { claim: createClaim('c2', 100000, '2025-01-01'), accruedInterest: 2000, effectiveRate: 0.55, segments: [] },
          { claim: createClaim('c3', 100000, '2025-01-01'), accruedInterest: 1500, effectiveRate: 0.48, segments: [] },
        ];

        const sorted = claimPriority.sortClaims(claims, ClaimPriorityRule.HIGHEST_RATE_FIRST);

        expect(sorted[0].claim.id).toBe('c2'); // 0.55
        expect(sorted[1].claim.id).toBe('c3'); // 0.48
        expect(sorted[2].claim.id).toBe('c1'); // 0.40
      });

      it('should use startDate as secondary sort for same rate', () => {
        const claims: ClaimWithInterest[] = [
          { claim: createClaim('c1', 100000, '2025-02-01'), accruedInterest: 1000, effectiveRate: 0.50, segments: [] },
          { claim: createClaim('c2', 100000, '2025-01-01'), accruedInterest: 2000, effectiveRate: 0.50, segments: [] },
        ];

        const sorted = claimPriority.sortClaims(claims, ClaimPriorityRule.HIGHEST_RATE_FIRST);

        expect(sorted[0].claim.id).toBe('c2'); // Older date first
        expect(sorted[1].claim.id).toBe('c1');
      });
    });

    describe('CUSTOM', () => {
      it('should sort claims by priority field ascending', () => {
        const claims: ClaimWithInterest[] = [
          { claim: createClaim('c1', 100000, '2025-01-01', 3), accruedInterest: 1000, effectiveRate: 0.50, segments: [] },
          { claim: createClaim('c2', 100000, '2025-01-01', 1), accruedInterest: 2000, effectiveRate: 0.50, segments: [] },
          { claim: createClaim('c3', 100000, '2025-01-01', 2), accruedInterest: 1500, effectiveRate: 0.50, segments: [] },
        ];

        const sorted = claimPriority.sortClaims(claims, ClaimPriorityRule.CUSTOM);

        expect(sorted[0].claim.id).toBe('c2'); // priority 1
        expect(sorted[1].claim.id).toBe('c3'); // priority 2
        expect(sorted[2].claim.id).toBe('c1'); // priority 3
      });

      it('should handle missing priority (put at end)', () => {
        const claims: ClaimWithInterest[] = [
          { claim: createClaim('c1', 100000, '2025-01-01'), accruedInterest: 1000, effectiveRate: 0.50, segments: [] },
          { claim: createClaim('c2', 100000, '2025-01-01', 1), accruedInterest: 2000, effectiveRate: 0.50, segments: [] },
        ];

        const sorted = claimPriority.sortClaims(claims, ClaimPriorityRule.CUSTOM);

        expect(sorted[0].claim.id).toBe('c2'); // Has priority
        expect(sorted[1].claim.id).toBe('c1'); // No priority
      });
    });

    describe('Effective Rate Calculation', () => {
      it('should calculate weighted average rate', () => {
        const segments: Segment[] = [
          createSegment('c1', 10, 0.50, 1369.86),
          createSegment('c1', 20, 0.55, 3013.70),
        ];

        const effectiveRate = claimPriority.calculateEffectiveRate(segments);

        // (0.50 * 10 + 0.55 * 20) / 30 = 16 / 30 = 0.5333...
        expect(effectiveRate).toBeCloseTo(0.5333, 3);
      });

      it('should return 0 for empty segments', () => {
        expect(claimPriority.calculateEffectiveRate([])).toBe(0);
      });
    });

    describe('Priority Validation', () => {
      it('should validate unique priorities', () => {
        const claims = [
          createClaim('c1', 100000, '2025-01-01', 1),
          createClaim('c2', 100000, '2025-01-01', 2),
          createClaim('c3', 100000, '2025-01-01', 3),
        ];
        expect(claimPriority.validateCustomPriorities(claims)).toBe(true);
      });

      it('should reject duplicate priorities', () => {
        const claims = [
          createClaim('c1', 100000, '2025-01-01', 1),
          createClaim('c2', 100000, '2025-01-01', 1),
        ];
        expect(claimPriority.validateCustomPriorities(claims)).toBe(false);
      });

      it('should reject missing priorities', () => {
        const claims = [
          createClaim('c1', 100000, '2025-01-01', 1),
          createClaim('c2', 100000, '2025-01-01'),
        ];
        expect(claimPriority.validateCustomPriorities(claims)).toBe(false);
      });
    });
  });


  // ═══════════════════════════════════════════════════════════════════════════
  // TASK 8.3: ALLOCATION ENGINE SERVICE UNIT TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Task 8.3: AllocationEngineService', () => {
    describe('Single Payment to Multiple Claims', () => {
      it('should allocate all claims interest before any principal', () => {
        const claims = [
          createClaim('c1', 100000, '2025-01-01'),
          createClaim('c2', 100000, '2025-02-01'),
        ];
        const segments = new Map<string, Segment[]>([
          ['c1', [createSegment('c1', 30, 0.50, 4109.59)]],
          ['c2', [createSegment('c2', 15, 0.50, 2054.79)]],
        ]);
        const payment = createPayment('p1', '2025-02-15', 10000);

        const result = allocationEngine.allocateSinglePayment(
          payment,
          [
            { claimId: 'c1', claim: claims[0], debtState: createDebtState(100000, 4109.59), segments: segments.get('c1')! },
            { claimId: 'c2', claim: claims[1], debtState: createDebtState(100000, 2054.79), segments: segments.get('c2')! },
          ],
          { claimPriorityRule: ClaimPriorityRule.OLDEST_DUE_FIRST },
        );

        // First two steps should be interest allocations
        const interestSteps = result.filter(s => s.allocations[0].category === 'INTEREST');
        const principalSteps = result.filter(s => s.allocations[0].category === 'PRINCIPAL');

        expect(interestSteps.length).toBe(2);
        expect(principalSteps.length).toBe(1);

        // c1 interest should be allocated first (oldest)
        expect(interestSteps[0].claimBucketId).toBe('c1');
        expect(interestSteps[1].claimBucketId).toBe('c2');
      });

      it('should respect claim priority order within same category', () => {
        const claims = [
          createClaim('c1', 100000, '2025-03-01'), // Newest
          createClaim('c2', 100000, '2025-01-01'), // Oldest
        ];
        const segments = new Map<string, Segment[]>([
          ['c1', [createSegment('c1', 30, 0.50, 4109.59)]],
          ['c2', [createSegment('c2', 60, 0.50, 8219.18)]],
        ]);

        const claimDebtStates = [
          { claimId: 'c1', claim: claims[0], debtState: createDebtState(100000, 4109.59), segments: segments.get('c1')! },
          { claimId: 'c2', claim: claims[1], debtState: createDebtState(100000, 8219.18), segments: segments.get('c2')! },
        ];

        const payment = createPayment('p1', '2025-03-15', 5000);

        const result = allocationEngine.allocateSinglePayment(
          payment,
          claimDebtStates,
          { claimPriorityRule: ClaimPriorityRule.OLDEST_DUE_FIRST },
        );

        // c2 (oldest) should be allocated first
        expect(result[0].claimBucketId).toBe('c2');
      });
    });

    describe('Multiple Payments', () => {
      it('should process payments in date order', () => {
        const claims = [createClaim('c1', 100000, '2025-01-01')];
        const segments = new Map<string, Segment[]>([
          ['c1', [createSegment('c1', 30, 0.50, 4109.59)]],
        ]);
        const payments = [
          createPayment('p2', '2025-02-15', 5000),
          createPayment('p1', '2025-01-15', 3000),
        ];

        const result = allocationEngine.allocateMultiplePayments(
          payments,
          claims,
          segments,
          { claimPriorityRule: ClaimPriorityRule.OLDEST_DUE_FIRST },
        );

        // p1 should be processed first (earlier date)
        expect(result.steps[0].paymentId).toBe('p1');
      });

      it('should track total allocated correctly', () => {
        const claims = [createClaim('c1', 100000, '2025-01-01')];
        const segments = new Map<string, Segment[]>([
          ['c1', [createSegment('c1', 30, 0.50, 4109.59)]],
        ]);
        const payments = [
          createPayment('p1', '2025-01-15', 3000),
          createPayment('p2', '2025-02-15', 5000),
        ];

        const result = allocationEngine.allocateMultiplePayments(
          payments,
          claims,
          segments,
          { claimPriorityRule: ClaimPriorityRule.OLDEST_DUE_FIRST },
        );

        // Total allocated should be sum of all allocations (not payment amounts)
        const actualAllocated = result.steps.reduce(
          (sum, step) => sum + step.allocations.reduce(
            (s, a) => s + a.amountAllocated, 0
          ), 0
        );
        expect(result.totalAllocated).toBe(actualAllocated);
        // With 4109.59 interest + 100000 principal, 8000 payment should allocate 8000
        expect(result.totalAllocated).toBeLessThanOrEqual(8000);
      });
    });
  });


  // ═══════════════════════════════════════════════════════════════════════════
  // TASK 8.4: PROPERTY TEST - TBK 100 ALLOCATION ORDER
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Task 8.4: Property - TBK 100 Allocation Order', () => {
    /**
     * Property 3: TBK 100 Allocation Order
     * 
     * For any payment allocation, the allocation order SHALL be:
     * INTEREST first, then COSTS, then ANCILLARIES, then PRINCIPAL.
     * No category SHALL receive allocation before a higher-priority category is fully satisfied.
     */
    it('Property 3: allocation follows TBK 100 order (interest before principal)', () => {
      fc.assert(
        fc.property(
          fc.record({
            principal: fc.integer({ min: 1000, max: 1000000 }),
            interest: fc.integer({ min: 100, max: 100000 }),
            payment: fc.integer({ min: 1, max: 500000 }),
          }),
          ({ principal, interest, payment }) => {
            const debtState = createDebtState(principal, interest);
            const result = tbk100Allocator.allocate(payment, debtState);

            const interestAlloc = result.allocations.find(a => a.category === 'INTEREST');
            const principalAlloc = result.allocations.find(a => a.category === 'PRINCIPAL');

            // If principal received any allocation, interest must be fully paid
            if (principalAlloc && principalAlloc.amountAllocated > 0) {
              expect(interestAlloc?.amountAfter).toBe(0);
            }

            return true;
          },
        ),
        { numRuns: 100 },
      );
    });

    it('Property 3: costs allocated before principal', () => {
      fc.assert(
        fc.property(
          fc.record({
            principal: fc.integer({ min: 1000, max: 1000000 }),
            interest: fc.integer({ min: 100, max: 100000 }),
            harc: fc.integer({ min: 100, max: 10000 }),
            payment: fc.integer({ min: 1, max: 500000 }),
          }),
          ({ principal, interest, harc, payment }) => {
            const debtState = createDebtState(principal, interest, {
              [AncillaryType.HARC]: harc,
            });
            const result = tbk100Allocator.allocate(payment, debtState);

            const harcAlloc = result.allocations.find(a => a.category === AncillaryType.HARC);
            const principalAlloc = result.allocations.find(a => a.category === 'PRINCIPAL');

            // If principal received any allocation, harc must be fully paid
            if (principalAlloc && principalAlloc.amountAllocated > 0) {
              expect(harcAlloc?.amountAfter).toBe(0);
            }

            return true;
          },
        ),
        { numRuns: 100 },
      );
    });

    it('Property 3: interest allocated before costs', () => {
      fc.assert(
        fc.property(
          fc.record({
            principal: fc.integer({ min: 1000, max: 1000000 }),
            interest: fc.integer({ min: 100, max: 100000 }),
            harc: fc.integer({ min: 100, max: 10000 }),
            payment: fc.integer({ min: 1, max: 500000 }),
          }),
          ({ principal, interest, harc, payment }) => {
            const debtState = createDebtState(principal, interest, {
              [AncillaryType.HARC]: harc,
            });
            const result = tbk100Allocator.allocate(payment, debtState);

            const interestAlloc = result.allocations.find(a => a.category === 'INTEREST');
            const harcAlloc = result.allocations.find(a => a.category === AncillaryType.HARC);

            // If harc received any allocation, interest must be fully paid
            if (harcAlloc && harcAlloc.amountAllocated > 0) {
              expect(interestAlloc?.amountAfter).toBe(0);
            }

            return true;
          },
        ),
        { numRuns: 100 },
      );
    });
  });


  // ═══════════════════════════════════════════════════════════════════════════
  // TASK 8.5: PROPERTY TEST - MULTI-CLAIM PRIORITY ORDER
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Task 8.5: Property - Multi-Claim Priority Order', () => {
    /**
     * Property 8: Multi-Claim Priority Order
     * 
     * For any calculation with multiple claim buckets and claimPriorityRule R,
     * payment allocation SHALL process claims in order determined by R.
     */
    it('Property 8: OLDEST_DUE_FIRST orders by startDate ascending', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              id: fc.uuid(),
              startDate: fc.integer({ min: 0, max: 730 }).map(days => {
                const d = new Date('2024-01-01');
                d.setDate(d.getDate() + days);
                return d.toISOString().split('T')[0];
              }),
              amount: fc.integer({ min: 10000, max: 1000000 }),
            }),
            { minLength: 2, maxLength: 5 },
          ),
          (claimData) => {
            const claims: ClaimWithInterest[] = claimData.map(c => ({
              claim: createClaim(c.id, c.amount, c.startDate),
              accruedInterest: 1000,
              effectiveRate: 0.50,
              segments: [],
            }));

            const sorted = claimPriority.sortClaims(claims, ClaimPriorityRule.OLDEST_DUE_FIRST);

            // Verify sorted by startDate ascending
            for (let i = 1; i < sorted.length; i++) {
              const prevDate = sorted[i - 1].claim.startDate;
              const currDate = sorted[i].claim.startDate;
              expect(prevDate <= currDate).toBe(true);
            }

            return true;
          },
        ),
        { numRuns: 100 },
      );
    });

    it('Property 8: HIGHEST_RATE_FIRST orders by rate descending', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              id: fc.uuid(),
              rate: fc.double({ min: 0.10, max: 0.60, noNaN: true }),
            }),
            { minLength: 2, maxLength: 5 },
          ),
          (claimData) => {
            const claims: ClaimWithInterest[] = claimData.map(c => ({
              claim: createClaim(c.id, 100000, '2025-01-01'),
              accruedInterest: 1000,
              effectiveRate: c.rate,
              segments: [],
            }));

            const sorted = claimPriority.sortClaims(claims, ClaimPriorityRule.HIGHEST_RATE_FIRST);

            // Verify sorted by rate descending
            for (let i = 1; i < sorted.length; i++) {
              const prevRate = sorted[i - 1].effectiveRate;
              const currRate = sorted[i].effectiveRate;
              expect(prevRate >= currRate - 0.0001).toBe(true); // Tolerance for floating point
            }

            return true;
          },
        ),
        { numRuns: 100 },
      );
    });

    it('Property 8: CUSTOM orders by priority ascending', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              id: fc.uuid(),
              priority: fc.integer({ min: 1, max: 100 }),
            }),
            { minLength: 2, maxLength: 5 },
          ).filter(arr => {
            // Ensure unique priorities
            const priorities = arr.map(a => a.priority);
            return new Set(priorities).size === priorities.length;
          }),
          (claimData) => {
            const claims: ClaimWithInterest[] = claimData.map(c => ({
              claim: createClaim(c.id, 100000, '2025-01-01', c.priority),
              accruedInterest: 1000,
              effectiveRate: 0.50,
              segments: [],
            }));

            const sorted = claimPriority.sortClaims(claims, ClaimPriorityRule.CUSTOM);

            // Verify sorted by priority ascending
            for (let i = 1; i < sorted.length; i++) {
              const prevPriority = sorted[i - 1].claim.priority!;
              const currPriority = sorted[i].claim.priority!;
              expect(prevPriority <= currPriority).toBe(true);
            }

            return true;
          },
        ),
        { numRuns: 100 },
      );
    });
  });


  // ═══════════════════════════════════════════════════════════════════════════
  // TASK 8.6: PROPERTY TEST - MONOTONICITY UNDER ADDITIONAL PAYMENT
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Task 8.6: Property - Monotonicity Under Additional Payment', () => {
    /**
     * Property 13: Monotonicity Under Additional Payment
     * 
     * For any calculation with existing payments P1..Pn, adding a new payment Pn+1
     * SHALL NOT increase previously calculated interest or debt components.
     * The total debt SHALL decrease or stay same, never increase due to payment.
     */
    it('Property 13: total debt never increases after payment', () => {
      fc.assert(
        fc.property(
          fc.record({
            principal: fc.integer({ min: 10000, max: 1000000 }),
            interest: fc.integer({ min: 1000, max: 100000 }),
            payment: fc.integer({ min: 1, max: 500000 }),
          }),
          ({ principal, interest, payment }) => {
            const debtState = createDebtState(principal, interest);
            const totalBefore = tbk100Allocator.calculateTotalDebt(debtState);

            const result = tbk100Allocator.allocate(payment, debtState);
            const totalAfter = tbk100Allocator.calculateTotalDebt(result.newDebtState);

            // Total debt should decrease or stay same
            expect(totalAfter).toBeLessThanOrEqual(totalBefore);

            return true;
          },
        ),
        { numRuns: 100 },
      );
    });

    it('Property 13: principal never increases after payment', () => {
      fc.assert(
        fc.property(
          fc.record({
            principal: fc.integer({ min: 10000, max: 1000000 }),
            interest: fc.integer({ min: 1000, max: 100000 }),
            payment: fc.integer({ min: 1, max: 500000 }),
          }),
          ({ principal, interest, payment }) => {
            const debtState = createDebtState(principal, interest);
            const result = tbk100Allocator.allocate(payment, debtState);

            // Principal should decrease or stay same
            expect(result.newDebtState.principal).toBeLessThanOrEqual(principal);

            return true;
          },
        ),
        { numRuns: 100 },
      );
    });

    it('Property 13: interest never increases after payment', () => {
      fc.assert(
        fc.property(
          fc.record({
            principal: fc.integer({ min: 10000, max: 1000000 }),
            interest: fc.integer({ min: 1000, max: 100000 }),
            payment: fc.integer({ min: 1, max: 500000 }),
          }),
          ({ principal, interest, payment }) => {
            const debtState = createDebtState(principal, interest);
            const result = tbk100Allocator.allocate(payment, debtState);

            // Interest should decrease or stay same
            expect(result.newDebtState.accruedInterest).toBeLessThanOrEqual(interest);

            return true;
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // TASK 8.7: PROPERTY TEST - IDEMPOTENT ALLOCATION STEPS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Task 8.7: Property - Idempotent Allocation Steps', () => {
    /**
     * Property 14: Idempotent Allocation Steps
     * 
     * For any calculation with same input, same rateTableVersion, same roundingParams,
     * the AllocationStep[] array SHALL be identical in both order and values.
     */
    it('Property 14: same input produces identical allocation steps', () => {
      fc.assert(
        fc.property(
          fc.record({
            principal: fc.integer({ min: 10000, max: 1000000 }),
            interest: fc.integer({ min: 1000, max: 100000 }),
            harc: fc.integer({ min: 100, max: 10000 }),
            payment: fc.integer({ min: 1, max: 500000 }),
          }),
          ({ principal, interest, harc, payment }) => {
            const debtState1 = createDebtState(principal, interest, {
              [AncillaryType.HARC]: harc,
            });
            const debtState2 = createDebtState(principal, interest, {
              [AncillaryType.HARC]: harc,
            });

            const result1 = tbk100Allocator.allocate(payment, debtState1);
            const result2 = tbk100Allocator.allocate(payment, debtState2);

            // Results should be identical
            expect(result1.allocations.length).toBe(result2.allocations.length);
            expect(result1.remainingPayment).toBe(result2.remainingPayment);

            for (let i = 0; i < result1.allocations.length; i++) {
              expect(result1.allocations[i].category).toBe(result2.allocations[i].category);
              expect(result1.allocations[i].amountAllocated).toBe(result2.allocations[i].amountAllocated);
              expect(result1.allocations[i].amountAfter).toBe(result2.allocations[i].amountAfter);
            }

            return true;
          },
        ),
        { numRuns: 100 },
      );
    });

    it('Property 14: allocation order is deterministic', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              id: fc.uuid(),
              startDate: fc.integer({ min: 0, max: 730 }).map(days => {
                const d = new Date('2024-01-01');
                d.setDate(d.getDate() + days);
                return d.toISOString().split('T')[0];
              }),
            }),
            { minLength: 2, maxLength: 5 },
          ),
          (claimData) => {
            const claims1: ClaimWithInterest[] = claimData.map(c => ({
              claim: createClaim(c.id, 100000, c.startDate),
              accruedInterest: 1000,
              effectiveRate: 0.50,
              segments: [],
            }));

            const claims2: ClaimWithInterest[] = claimData.map(c => ({
              claim: createClaim(c.id, 100000, c.startDate),
              accruedInterest: 1000,
              effectiveRate: 0.50,
              segments: [],
            }));

            const sorted1 = claimPriority.sortClaims(claims1, ClaimPriorityRule.OLDEST_DUE_FIRST);
            const sorted2 = claimPriority.sortClaims(claims2, ClaimPriorityRule.OLDEST_DUE_FIRST);

            // Order should be identical
            for (let i = 0; i < sorted1.length; i++) {
              expect(sorted1[i].claim.id).toBe(sorted2[i].claim.id);
            }

            return true;
          },
        ),
        { numRuns: 100 },
      );
    });
  });


  // ═══════════════════════════════════════════════════════════════════════════
  // TASK 8.8: TBK 100 VS POLICY CONFLICT TESTS
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Task 8.8: TBK 100 vs Policy Conflict', () => {
    /**
     * Çakışma Protokolü:
     * TBK 100 HARD RULE her zaman galip.
     * Policy sadece aynı sınıf kalemleri arasında sıralama belirler.
     * "Policy asla sınıf atlatamaz"
     */

    it('should never allocate principal before interest regardless of policy', () => {
      // Even with HIGHEST_RATE_FIRST, interest must come before principal
      const claims = [
        createClaim('c1', 100000, '2025-01-01'), // Lower rate
        createClaim('c2', 100000, '2025-02-01'), // Higher rate
      ];

      const claimDebtStates = [
        { 
          claimId: 'c1', 
          claim: claims[0], 
          debtState: createDebtState(100000, 1000), 
          segments: [createSegment('c1', 30, 0.40, 1000)] 
        },
        { 
          claimId: 'c2', 
          claim: claims[1], 
          debtState: createDebtState(100000, 2000), 
          segments: [createSegment('c2', 30, 0.55, 2000)] 
        },
      ];

      const payment = createPayment('p1', '2025-03-01', 5000);

      const result = allocationEngine.allocateSinglePayment(
        payment,
        claimDebtStates,
        { claimPriorityRule: ClaimPriorityRule.HIGHEST_RATE_FIRST },
      );

      // All interest allocations should come before any principal allocation
      const interestSteps = result.filter(s => s.allocations[0].category === 'INTEREST');
      const principalSteps = result.filter(s => s.allocations[0].category === 'PRINCIPAL');

      // c2 (higher rate) interest should be first
      expect(interestSteps[0].claimBucketId).toBe('c2');
      
      // If there's principal allocation, all interest must be paid
      if (principalSteps.length > 0) {
        const totalInterestAllocated = interestSteps.reduce(
          (sum, s) => sum + s.allocations[0].amountAllocated, 0
        );
        expect(totalInterestAllocated).toBe(3000); // All interest paid
      }
    });

    it('should respect policy order within same TBK 100 class', () => {
      const claims = [
        createClaim('c1', 100000, '2025-03-01'), // Newest
        createClaim('c2', 100000, '2025-01-01'), // Oldest
        createClaim('c3', 100000, '2025-02-01'), // Middle
      ];

      const claimDebtStates = claims.map((claim, i) => ({
        claimId: claim.id,
        claim,
        debtState: createDebtState(100000, 1000 * (i + 1)),
        segments: [createSegment(claim.id, 30, 0.50, 1000 * (i + 1))],
      }));

      const payment = createPayment('p1', '2025-04-01', 10000);

      const result = allocationEngine.allocateSinglePayment(
        payment,
        claimDebtStates,
        { claimPriorityRule: ClaimPriorityRule.OLDEST_DUE_FIRST },
      );

      const interestSteps = result.filter(s => s.allocations[0].category === 'INTEREST');

      // Interest allocation order should follow OLDEST_DUE_FIRST
      expect(interestSteps[0].claimBucketId).toBe('c2'); // 2025-01-01
      expect(interestSteps[1].claimBucketId).toBe('c3'); // 2025-02-01
      expect(interestSteps[2].claimBucketId).toBe('c1'); // 2025-03-01
    });

    it('should allocate costs before principal even with different policy', () => {
      const claim = createClaim('c1', 100000, '2025-01-01');
      const debtState = createDebtState(100000, 5000, {
        [AncillaryType.HARC]: 1000,
        [AncillaryType.VEKALET_UCRETI]: 2000,
      });

      // Payment enough for interest + some costs but not all
      const result = tbk100Allocator.allocate(7000, debtState);

      const interestAlloc = result.allocations.find(a => a.category === 'INTEREST');
      const harcAlloc = result.allocations.find(a => a.category === AncillaryType.HARC);
      const vekaletAlloc = result.allocations.find(a => a.category === AncillaryType.VEKALET_UCRETI);
      const principalAlloc = result.allocations.find(a => a.category === 'PRINCIPAL');

      // Interest fully paid
      expect(interestAlloc?.amountAfter).toBe(0);
      // Harc fully paid
      expect(harcAlloc?.amountAfter).toBe(0);
      // Vekalet partially paid (1000 remaining from 7000 - 5000 - 1000)
      expect(vekaletAlloc?.amountAllocated).toBe(1000);
      // Principal not touched
      expect(principalAlloc?.amountAllocated).toBe(0);
    });

    it('should handle ancillary priority within costs class', () => {
      const debtState = createDebtState(100000, 0, {
        [AncillaryType.VEKALET_UCRETI]: 2000, // Lower priority
        [AncillaryType.HARC]: 1000,           // Higher priority
      });

      const result = tbk100Allocator.allocate(1500, debtState, {
        ancillaryPriority: [AncillaryType.HARC, AncillaryType.VEKALET_UCRETI],
      });

      const harcAlloc = result.allocations.find(a => a.category === AncillaryType.HARC);
      const vekaletAlloc = result.allocations.find(a => a.category === AncillaryType.VEKALET_UCRETI);

      // Harc should be fully paid first
      expect(harcAlloc?.amountAfter).toBe(0);
      // Vekalet should receive remaining 500
      expect(vekaletAlloc?.amountAllocated).toBe(500);
    });

    it('should document TBK 100 vs Policy protocol in legal text', () => {
      const description = claimPriority.getPriorityRuleDescription(
        ClaimPriorityRule.OLDEST_DUE_FIRST
      );
      
      expect(description).toContain('vadesi en eski');
    });
  });
});
