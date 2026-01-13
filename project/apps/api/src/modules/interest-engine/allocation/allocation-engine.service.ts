/**
 * Task 8.3 - Allocation Engine Service
 * 
 * Multi-payment allocation with interest recalculation between payments.
 * 
 * TBK 100 vs Policy Çakışma Protokolü:
 * - TBK 100 HARD RULE: faiz → masraf → fer'i → anapara (sınıf sırası)
 * - Policy SOFT RULE: aynı sınıf içinde tie-breaker (claim sırası)
 * 
 * Örnek (3 claim, OLDEST_DUE_FIRST):
 * 1. A'nın faizi → B'nin faizi → C'nin faizi
 * 2. A'nın masrafları → B'nin masrafları → C'nin masrafları
 * 3. A'nın fer'ileri → B'nin fer'ileri → C'nin fer'ileri
 * 4. A'nın anaparası → B'nın anaparası → C'nin anaparası
 */

import { Injectable } from '@nestjs/common';
import { 
  AllocationStep, 
  AllocationCategory, 
  Payment, 
  ClaimBucket,
  Segment,
  AncillaryType,
} from '../types/domain.types';
import { 
  TBK100AllocatorService, 
  DebtState,
  DEFAULT_ANCILLARY_PRIORITY,
} from './tbk100-allocator.service';
import { 
  ClaimPriorityService, 
  ClaimPriorityRule,
  ClaimWithInterest,
} from './claim-priority.service';
import { InterestEngineError, InterestEngineErrorCode } from '../errors/interest-engine-errors';

// ═══════════════════════════════════════════════════════════════════════════
// ALLOCATION OPTIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface AllocationOptions {
  claimPriorityRule: ClaimPriorityRule;
  ancillaryPriority?: AncillaryType[];
}

// ═══════════════════════════════════════════════════════════════════════════
// INTEREST CALCULATOR FUNCTION TYPE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Function to recalculate interest for a claim up to a given date
 * This is injected to avoid circular dependency with SegmentBuilder
 */
export type InterestCalculatorFn = (
  claim: ClaimBucket,
  asOfDate: string,
  currentPrincipal: number,
) => { accruedInterest: number; segments: Segment[] };

// ═══════════════════════════════════════════════════════════════════════════
// CLAIM DEBT STATE
// ═══════════════════════════════════════════════════════════════════════════

export interface ClaimDebtState {
  claimId: string;
  claim: ClaimBucket;
  debtState: DebtState;
  segments: Segment[];
}

// ═══════════════════════════════════════════════════════════════════════════
// ALLOCATION ENGINE RESULT
// ═══════════════════════════════════════════════════════════════════════════

export interface AllocationEngineResult {
  steps: AllocationStep[];
  finalDebtStates: ClaimDebtState[];
  totalAllocated: number;
  totalRemaining: number;
  isFullyPaid: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// ALLOCATION ENGINE SERVICE
// ═══════════════════════════════════════════════════════════════════════════

@Injectable()
export class AllocationEngineService {
  constructor(
    private readonly tbk100Allocator: TBK100AllocatorService,
    private readonly claimPriority: ClaimPriorityService,
  ) {}

  /**
   * Allocate multiple payments to multiple claims
   * 
   * Process:
   * 1. Sort payments by date
   * 2. For each payment:
   *    a. Recalculate interest up to payment date
   *    b. Sort claims by priority rule
   *    c. Allocate payment following TBK 100 order across all claims
   * 
   * @param payments - Ödemeler
   * @param claims - Alacak kalemleri
   * @param initialSegments - Her claim için başlangıç segmentleri
   * @param options - Allocation options
   * @param interestCalculator - Faiz yeniden hesaplama fonksiyonu
   */
  allocateMultiplePayments(
    payments: Payment[],
    claims: ClaimBucket[],
    initialSegments: Map<string, Segment[]>,
    options: AllocationOptions,
    interestCalculator?: InterestCalculatorFn,
  ): AllocationEngineResult {
    // Validate inputs
    this.validateInputs(payments, claims);

    // Sort payments by date
    const sortedPayments = [...payments].sort((a, b) => 
      a.date.localeCompare(b.date),
    );

    // Initialize claim debt states
    const claimDebtStates = this.initializeClaimDebtStates(
      claims,
      initialSegments,
    );

    const allSteps: AllocationStep[] = [];
    let totalAllocated = 0;

    // Process each payment
    for (const payment of sortedPayments) {
      // Recalculate interest up to payment date if calculator provided
      if (interestCalculator) {
        this.recalculateInterest(
          claimDebtStates,
          payment.date,
          interestCalculator,
        );
      }

      // Allocate this payment
      const paymentSteps = this.allocateSinglePayment(
        payment,
        claimDebtStates,
        options,
      );

      allSteps.push(...paymentSteps);
      
      // Sum actual allocations from all steps for this payment
      const paymentAllocated = paymentSteps.reduce(
        (sum, step) => sum + step.allocations.reduce(
          (s, a) => s + a.amountAllocated, 0
        ), 0
      );
      totalAllocated += paymentAllocated;
    }

    // Calculate final state
    const totalRemaining = sortedPayments.reduce(
      (sum, p) => sum + p.amount,
      0,
    ) - totalAllocated;

    const isFullyPaid = claimDebtStates.every(
      cds => this.tbk100Allocator.isFullyPaid(cds.debtState),
    );

    return {
      steps: allSteps,
      finalDebtStates: claimDebtStates,
      totalAllocated,
      totalRemaining: Math.max(0, totalRemaining),
      isFullyPaid,
    };
  }

  /**
   * Allocate a single payment to multiple claims
   * 
   * TBK 100 HARD RULE across all claims:
   * 1. All claims' interest (by priority order)
   * 2. All claims' costs (by priority order)
   * 3. All claims' ancillaries (by priority order)
   * 4. All claims' principal (by priority order)
   */
  allocateSinglePayment(
    payment: Payment,
    claimDebtStates: ClaimDebtState[],
    options: AllocationOptions,
  ): AllocationStep[] {
    const steps: AllocationStep[] = [];
    let remaining = payment.amount;

    // Sort claims by priority rule
    const claimsWithInterest: ClaimWithInterest[] = claimDebtStates.map(cds => ({
      claim: cds.claim,
      accruedInterest: cds.debtState.accruedInterest,
      effectiveRate: this.claimPriority.calculateEffectiveRate(cds.segments),
      segments: cds.segments,
    }));

    const sortedClaims = this.claimPriority.sortClaims(
      claimsWithInterest,
      options.claimPriorityRule,
    );

    const claimOrder = sortedClaims.map(c => c.claim.id);
    const ancillaryPriority = options.ancillaryPriority || DEFAULT_ANCILLARY_PRIORITY;

    // TBK 100 HARD RULE: Process by category across all claims

    // 1. INTEREST - All claims' interest first
    for (const claimId of claimOrder) {
      if (remaining <= 0) break;
      
      const cds = claimDebtStates.find(c => c.claimId === claimId)!;
      const interestAmount = cds.debtState.accruedInterest;
      
      if (interestAmount > 0) {
        const allocated = Math.min(interestAmount, remaining);
        cds.debtState.accruedInterest -= allocated;
        remaining -= allocated;

        steps.push(this.createAllocationStep(
          payment,
          claimId,
          'INTEREST',
          'İşlemiş Faiz',
          interestAmount,
          allocated,
          cds.debtState.principal,
        ));
      }
    }

    // 2. COSTS & ANCILLARIES - All claims' costs/ancillaries by priority
    for (const ancType of ancillaryPriority) {
      for (const claimId of claimOrder) {
        if (remaining <= 0) break;
        
        const cds = claimDebtStates.find(c => c.claimId === claimId)!;
        
        // Costs
        const costAmount = cds.debtState.costs.get(ancType) || 0;
        if (costAmount > 0) {
          const allocated = Math.min(costAmount, remaining);
          cds.debtState.costs.set(ancType, costAmount - allocated);
          remaining -= allocated;

          steps.push(this.createAllocationStep(
            payment,
            claimId,
            ancType,
            this.getAncillaryLabel(ancType),
            costAmount,
            allocated,
            cds.debtState.principal,
          ));
        }

        // Ancillaries
        const ancAmount = cds.debtState.ancillaries.get(ancType) || 0;
        if (ancAmount > 0) {
          const allocated = Math.min(ancAmount, remaining);
          cds.debtState.ancillaries.set(ancType, ancAmount - allocated);
          remaining -= allocated;

          steps.push(this.createAllocationStep(
            payment,
            claimId,
            ancType,
            this.getAncillaryLabel(ancType),
            ancAmount,
            allocated,
            cds.debtState.principal,
          ));
        }
      }
    }

    // 3. PRINCIPAL - All claims' principal last
    for (const claimId of claimOrder) {
      if (remaining <= 0) break;
      
      const cds = claimDebtStates.find(c => c.claimId === claimId)!;
      const principalAmount = cds.debtState.principal;
      
      if (principalAmount > 0) {
        const allocated = Math.min(principalAmount, remaining);
        cds.debtState.principal -= allocated;
        remaining -= allocated;

        steps.push(this.createAllocationStep(
          payment,
          claimId,
          'PRINCIPAL',
          'Anapara',
          principalAmount,
          allocated,
          cds.debtState.principal,
        ));
      }
    }

    return steps;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  private validateInputs(payments: Payment[], claims: ClaimBucket[]): void {
    if (claims.length === 0) {
      throw new InterestEngineError(
        InterestEngineErrorCode.E_MISSING_REQUIRED,
        'En az bir alacak kalemi gereklidir',
        { missingFields: ['claims'] },
      );
    }

    for (const payment of payments) {
      if (payment.amount <= 0) {
        throw new InterestEngineError(
          InterestEngineErrorCode.E_ALLOCATION_OVERFLOW,
          'Ödeme tutarı pozitif olmalıdır',
          { paymentAmount: payment.amount, totalDebt: 0, overflow: payment.amount },
        );
      }
    }
  }

  private initializeClaimDebtStates(
    claims: ClaimBucket[],
    initialSegments: Map<string, Segment[]>,
  ): ClaimDebtState[] {
    return claims.map(claim => {
      const segments = initialSegments.get(claim.id) || [];
      const accruedInterest = segments.reduce(
        (sum, s) => sum + s.segmentInterest,
        0,
      );

      return {
        claimId: claim.id,
        claim,
        debtState: this.tbk100Allocator.createDebtState(
          claim.amount,
          accruedInterest,
        ),
        segments,
      };
    });
  }

  private recalculateInterest(
    claimDebtStates: ClaimDebtState[],
    asOfDate: string,
    interestCalculator: InterestCalculatorFn,
  ): void {
    for (const cds of claimDebtStates) {
      const { accruedInterest, segments } = interestCalculator(
        cds.claim,
        asOfDate,
        cds.debtState.principal,
      );
      
      cds.debtState.accruedInterest = accruedInterest;
      cds.segments = segments;
    }
  }

  private createAllocationStep(
    payment: Payment,
    claimBucketId: string,
    category: AncillaryType | 'INTEREST' | 'PRINCIPAL',
    label: string,
    amountBefore: number,
    amountAllocated: number,
    newPrincipal: number,
  ): AllocationStep {
    return {
      paymentId: payment.id,
      paymentDate: payment.date,
      paymentAmount: payment.amount,
      allocations: [{
        category,
        label,
        amountBefore,
        amountAllocated,
        amountAfter: amountBefore - amountAllocated,
      }],
      remainingPayment: 0, // Will be calculated at the end
      newPrincipal,
      claimBucketId,
    };
  }

  private getAncillaryLabel(type: AncillaryType): string {
    const labels: Record<AncillaryType, string> = {
      [AncillaryType.HARC]: 'Harç',
      [AncillaryType.TEBLIGAT_MASRAFI]: 'Tebligat Masrafı',
      [AncillaryType.VEKALET_UCRETI]: 'Vekalet Ücreti',
      [AncillaryType.CEK_TAZMINATI]: 'Çek Tazminatı',
      [AncillaryType.KOMISYON]: 'Komisyon',
      [AncillaryType.DIGER]: 'Diğer Masraflar',
    };
    return labels[type];
  }
}
