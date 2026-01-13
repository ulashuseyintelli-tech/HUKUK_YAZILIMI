/**
 * Task 8.1 - TBK 100 Core Allocator
 * 
 * TBK 100 HARD RULE:
 * Sıra: FAİZ → MASRAF → FER'İ → ANAPARA
 * 
 * Bu sıra kanundan gelir, policy ile değiştirilemez.
 * Policy sadece aynı sınıf içinde tie-breaker belirler.
 */

import { Injectable } from '@nestjs/common';
import { 
  AllocationStep, 
  AllocationCategory, 
  AncillaryType,
  TBK100_ALLOCATION_ORDER,
} from '../types/domain.types';
import { InterestEngineError, InterestEngineErrorCode } from '../errors/interest-engine-errors';

// ═══════════════════════════════════════════════════════════════════════════
// DEBT STATE
// ═══════════════════════════════════════════════════════════════════════════

export interface DebtState {
  principal: number;
  accruedInterest: number;
  costs: Map<AncillaryType, number>;      // Masraflar (HARC, TEBLIGAT_MASRAFI)
  ancillaries: Map<AncillaryType, number>; // Fer'iler (VEKALET_UCRETI, CEK_TAZMINATI)
}

export interface DebtComponent {
  category: AncillaryType | 'INTEREST' | 'PRINCIPAL';
  label: string;
  amount: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// ALLOCATION OPTIONS
// ═══════════════════════════════════════════════════════════════════════════

export interface TBK100AllocationOptions {
  ancillaryPriority?: AncillaryType[]; // Soft tie-breaker within ancillary class
}

// ═══════════════════════════════════════════════════════════════════════════
// ALLOCATION RESULT
// ═══════════════════════════════════════════════════════════════════════════

export interface AllocationResult {
  allocations: AllocationCategory[];
  remainingPayment: number;
  newDebtState: DebtState;
}

// ═══════════════════════════════════════════════════════════════════════════
// ANCILLARY LABELS
// ═══════════════════════════════════════════════════════════════════════════

const ANCILLARY_LABELS: Record<AncillaryType, string> = {
  [AncillaryType.HARC]: 'Harç',
  [AncillaryType.TEBLIGAT_MASRAFI]: 'Tebligat Masrafı',
  [AncillaryType.VEKALET_UCRETI]: 'Vekalet Ücreti',
  [AncillaryType.CEK_TAZMINATI]: 'Çek Tazminatı',
  [AncillaryType.KOMISYON]: 'Komisyon',
  [AncillaryType.DIGER]: 'Diğer Masraflar',
};

const CATEGORY_LABELS: Record<string, string> = {
  INTEREST: 'İşlemiş Faiz',
  PRINCIPAL: 'Anapara',
  ...ANCILLARY_LABELS,
};

// ═══════════════════════════════════════════════════════════════════════════
// DEFAULT ANCILLARY PRIORITY (within same class)
// ═══════════════════════════════════════════════════════════════════════════

export const DEFAULT_ANCILLARY_PRIORITY: AncillaryType[] = [
  AncillaryType.HARC,
  AncillaryType.TEBLIGAT_MASRAFI,
  AncillaryType.VEKALET_UCRETI,
  AncillaryType.CEK_TAZMINATI,
  AncillaryType.KOMISYON,
  AncillaryType.DIGER,
];

// ═══════════════════════════════════════════════════════════════════════════
// TBK 100 ALLOCATOR SERVICE
// ═══════════════════════════════════════════════════════════════════════════

@Injectable()
export class TBK100AllocatorService {
  /**
   * Allocate a single payment according to TBK 100 rules
   * 
   * HARD RULE ORDER:
   * 1. INTEREST (İşlemiş Faiz)
   * 2. COSTS (Masraflar - HARC, TEBLIGAT_MASRAFI)
   * 3. ANCILLARIES (Fer'iler - VEKALET_UCRETI, CEK_TAZMINATI, etc.)
   * 4. PRINCIPAL (Anapara)
   * 
   * @param paymentAmount - Ödeme tutarı
   * @param debtState - Mevcut borç durumu
   * @param options - Allocation options (soft tie-breakers)
   */
  allocate(
    paymentAmount: number,
    debtState: DebtState,
    options: TBK100AllocationOptions = {},
  ): AllocationResult {
    if (paymentAmount < 0) {
      throw new InterestEngineError(
        InterestEngineErrorCode.E_ALLOCATION_OVERFLOW,
        'Ödeme tutarı negatif olamaz',
        { paymentAmount, totalDebt: this.calculateTotalDebt(debtState), overflow: paymentAmount },
      );
    }

    let remaining = paymentAmount;
    const allocations: AllocationCategory[] = [];
    const newDebtState = this.cloneDebtState(debtState);
    const ancillaryPriority = options.ancillaryPriority || DEFAULT_ANCILLARY_PRIORITY;

    // 1. INTEREST (İşlemiş Faiz) - TBK 100 HARD RULE: Faiz önce
    const interestAlloc = this.allocateToCategory(
      'INTEREST',
      CATEGORY_LABELS.INTEREST,
      newDebtState.accruedInterest,
      remaining,
    );
    allocations.push(interestAlloc);
    remaining -= interestAlloc.amountAllocated;
    newDebtState.accruedInterest -= interestAlloc.amountAllocated;

    // 2. COSTS & ANCILLARIES (Masraflar ve Fer'iler) - TBK 100 HARD RULE: Masraf/fer'i ikinci
    // Soft tie-breaker: ancillaryPriority sırasına göre
    for (const ancType of ancillaryPriority) {
      if (remaining <= 0) break;

      // Check costs first
      const costAmount = newDebtState.costs.get(ancType) || 0;
      if (costAmount > 0) {
        const costAlloc = this.allocateToCategory(
          ancType,
          ANCILLARY_LABELS[ancType],
          costAmount,
          remaining,
        );
        allocations.push(costAlloc);
        remaining -= costAlloc.amountAllocated;
        newDebtState.costs.set(ancType, costAmount - costAlloc.amountAllocated);
      }

      // Then check ancillaries
      const ancAmount = newDebtState.ancillaries.get(ancType) || 0;
      if (ancAmount > 0) {
        const ancAlloc = this.allocateToCategory(
          ancType,
          ANCILLARY_LABELS[ancType],
          ancAmount,
          remaining,
        );
        // Merge with existing allocation if same category
        const existingIdx = allocations.findIndex(
          a => a.category === ancType && a.amountBefore === costAmount,
        );
        if (existingIdx === -1) {
          allocations.push(ancAlloc);
        }
        remaining -= ancAlloc.amountAllocated;
        newDebtState.ancillaries.set(ancType, ancAmount - ancAlloc.amountAllocated);
      }
    }

    // 3. PRINCIPAL (Anapara) - TBK 100 HARD RULE: Anapara son
    const principalAlloc = this.allocateToCategory(
      'PRINCIPAL',
      CATEGORY_LABELS.PRINCIPAL,
      newDebtState.principal,
      remaining,
    );
    allocations.push(principalAlloc);
    remaining -= principalAlloc.amountAllocated;
    newDebtState.principal -= principalAlloc.amountAllocated;

    return {
      allocations: allocations.filter(a => a.amountBefore > 0 || a.amountAllocated > 0),
      remainingPayment: Math.max(0, remaining),
      newDebtState,
    };
  }

  /**
   * Get ordered debt components according to TBK 100
   */
  getOrderedDebtComponents(
    debtState: DebtState,
    ancillaryPriority: AncillaryType[] = DEFAULT_ANCILLARY_PRIORITY,
  ): DebtComponent[] {
    const components: DebtComponent[] = [];

    // 1. Interest
    if (debtState.accruedInterest > 0) {
      components.push({
        category: 'INTEREST',
        label: CATEGORY_LABELS.INTEREST,
        amount: debtState.accruedInterest,
      });
    }

    // 2. Costs & Ancillaries (by priority)
    for (const ancType of ancillaryPriority) {
      const costAmount = debtState.costs.get(ancType) || 0;
      const ancAmount = debtState.ancillaries.get(ancType) || 0;
      const total = costAmount + ancAmount;
      
      if (total > 0) {
        components.push({
          category: ancType,
          label: ANCILLARY_LABELS[ancType],
          amount: total,
        });
      }
    }

    // 3. Principal
    if (debtState.principal > 0) {
      components.push({
        category: 'PRINCIPAL',
        label: CATEGORY_LABELS.PRINCIPAL,
        amount: debtState.principal,
      });
    }

    return components;
  }

  /**
   * Calculate total debt
   */
  calculateTotalDebt(debtState: DebtState): number {
    let total = debtState.principal + debtState.accruedInterest;
    
    for (const amount of debtState.costs.values()) {
      total += amount;
    }
    for (const amount of debtState.ancillaries.values()) {
      total += amount;
    }
    
    return total;
  }

  /**
   * Check if debt is fully paid
   */
  isFullyPaid(debtState: DebtState): boolean {
    return this.calculateTotalDebt(debtState) <= 0.001; // Tolerance for rounding
  }

  /**
   * Create empty debt state
   */
  createEmptyDebtState(): DebtState {
    return {
      principal: 0,
      accruedInterest: 0,
      costs: new Map(),
      ancillaries: new Map(),
    };
  }

  /**
   * Create debt state from values
   */
  createDebtState(
    principal: number,
    accruedInterest: number,
    costs?: Record<AncillaryType, number>,
    ancillaries?: Record<AncillaryType, number>,
  ): DebtState {
    const state: DebtState = {
      principal,
      accruedInterest,
      costs: new Map(),
      ancillaries: new Map(),
    };

    if (costs) {
      for (const [type, amount] of Object.entries(costs)) {
        if (amount > 0) {
          state.costs.set(type as AncillaryType, amount);
        }
      }
    }

    if (ancillaries) {
      for (const [type, amount] of Object.entries(ancillaries)) {
        if (amount > 0) {
          state.ancillaries.set(type as AncillaryType, amount);
        }
      }
    }

    return state;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════════════════════

  private allocateToCategory(
    category: AncillaryType | 'INTEREST' | 'PRINCIPAL',
    label: string,
    amountBefore: number,
    availablePayment: number,
  ): AllocationCategory {
    const amountAllocated = Math.min(amountBefore, availablePayment);
    
    return {
      category,
      label,
      amountBefore,
      amountAllocated,
      amountAfter: amountBefore - amountAllocated,
    };
  }

  private cloneDebtState(state: DebtState): DebtState {
    return {
      principal: state.principal,
      accruedInterest: state.accruedInterest,
      costs: new Map(state.costs),
      ancillaries: new Map(state.ancillaries),
    };
  }
}
