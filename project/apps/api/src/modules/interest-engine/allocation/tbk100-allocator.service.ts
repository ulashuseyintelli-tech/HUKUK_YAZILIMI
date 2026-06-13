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
import { toCents, fromCents } from './minor-unit';

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
   *
   * @remarks
   * Çağrıldığı yerler:
   * - SummaryEngineService.<allocate-payment>() → claim-item bazlı mahsup dağıtımı (production tüketici, summary-engine.service.ts:639).
   * - sprint-3.spec.ts / tbk100-allocator.characterization.spec.ts → karakterizasyon (test).
   * NOT: AllocationEngineService allocate()'i ÇAĞIRMAZ (kendi inline Math.min mahsubunu yapar);
   *       allocator'dan yalnız isFullyPaid + createDebtState kullanır.
   * Cents-internal (doc 18 §6): çıktı number kalır; sub-cent değerler HALF_UP away-from-zero normalize edilir.
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

    // INTERNAL-ONLY CENTS (doc 18 §3 R1 + doc 25): para matematiği tamamen integer
    // kuruş (bigint) üzerinde yürür; number ↔ cents çevrimi yalnız allocate() sınırında.
    // Public API (number/Map kontratı) korunur; çıktı fromCents ile number'a döner.
    let remaining = toCents(paymentAmount);
    const allocations: AllocationCategory[] = [];
    const newDebtState = this.cloneDebtState(debtState);
    const ancillaryPriority = options.ancillaryPriority || DEFAULT_ANCILLARY_PRIORITY;

    // 1. INTEREST (İşlemiş Faiz) - TBK 100 HARD RULE: Faiz önce
    const interestBefore = toCents(newDebtState.accruedInterest);
    const interestRes = this.allocateToCategory(
      'INTEREST',
      CATEGORY_LABELS.INTEREST,
      interestBefore,
      remaining,
    );
    allocations.push(interestRes.allocation);
    remaining -= interestRes.allocatedCents;
    newDebtState.accruedInterest = fromCents(interestBefore - interestRes.allocatedCents);

    // 2. COSTS & ANCILLARIES (Masraflar ve Fer'iler) - TBK 100 HARD RULE: Masraf/fer'i ikinci
    // Soft tie-breaker: ancillaryPriority sırasına göre
    for (const ancType of ancillaryPriority) {
      if (remaining <= 0n) break;

      // Check costs first
      const costAmount = newDebtState.costs.get(ancType) || 0;
      // Merge karşılaştırma anahtarı (legacy semantik): cost alloc'ın amountBefore'u.
      let costAllocBefore = costAmount;
      if (costAmount > 0) {
        const costBefore = toCents(costAmount);
        const costRes = this.allocateToCategory(
          ancType,
          ANCILLARY_LABELS[ancType],
          costBefore,
          remaining,
        );
        costAllocBefore = costRes.allocation.amountBefore;
        allocations.push(costRes.allocation);
        remaining -= costRes.allocatedCents;
        newDebtState.costs.set(ancType, fromCents(costBefore - costRes.allocatedCents));
      }

      // Then check ancillaries
      const ancAmount = newDebtState.ancillaries.get(ancType) || 0;
      if (ancAmount > 0) {
        const ancBefore = toCents(ancAmount);
        const ancRes = this.allocateToCategory(
          ancType,
          ANCILLARY_LABELS[ancType],
          ancBefore,
          remaining,
        );
        // Merge with existing allocation if same category
        const existingIdx = allocations.findIndex(
          a => a.category === ancType && a.amountBefore === costAllocBefore,
        );
        if (existingIdx === -1) {
          allocations.push(ancRes.allocation);
        }
        remaining -= ancRes.allocatedCents;
        newDebtState.ancillaries.set(ancType, fromCents(ancBefore - ancRes.allocatedCents));
      }
    }

    // 3. PRINCIPAL (Anapara) - TBK 100 HARD RULE: Anapara son
    const principalBefore = toCents(newDebtState.principal);
    const principalRes = this.allocateToCategory(
      'PRINCIPAL',
      CATEGORY_LABELS.PRINCIPAL,
      principalBefore,
      remaining,
    );
    allocations.push(principalRes.allocation);
    remaining -= principalRes.allocatedCents;
    newDebtState.principal = fromCents(principalBefore - principalRes.allocatedCents);

    return {
      allocations: allocations.filter(a => a.amountBefore > 0 || a.amountAllocated > 0),
      remainingPayment: fromCents(remaining > 0n ? remaining : 0n),
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
    return fromCents(this.totalDebtCents(debtState));
  }

  /**
   * Check if debt is fully paid
   *
   * Cents-internal: borç tamamen kuruş bazında toplanır; "tam ödendi" =
   * toplam ≤ 0 kuruş (exact 0n). Float tolerans (0.001) yerine integer karşılaştırma.
   */
  isFullyPaid(debtState: DebtState): boolean {
    return this.totalDebtCents(debtState) <= 0n;
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
    costs?: Partial<Record<AncillaryType, number>>,
    ancillaries?: Partial<Record<AncillaryType, number>>,
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

  /**
   * Bir kategoriye TBK 100 sınırına kadar tahsis yapar — tamamen integer kuruş üzerinde.
   * bigint Math.min + subtraction (float dust yok). Döndürülen AllocationCategory'nin
   * number alanları fromCents ile sınırda dönüştürülür; allocatedCents çağırana akar.
   */
  private allocateToCategory(
    category: AncillaryType | 'INTEREST' | 'PRINCIPAL',
    label: string,
    amountBeforeCents: bigint,
    availableCents: bigint,
  ): { allocation: AllocationCategory; allocatedCents: bigint } {
    // bigint Math.min (yerleşik Math.min bigint kabul etmez)
    const allocatedCents =
      amountBeforeCents < availableCents ? amountBeforeCents : availableCents;
    const afterCents = amountBeforeCents - allocatedCents;

    return {
      allocation: {
        category,
        label,
        amountBefore: fromCents(amountBeforeCents),
        amountAllocated: fromCents(allocatedCents),
        amountAfter: fromCents(afterCents),
      },
      allocatedCents,
    };
  }

  /**
   * Toplam borcu integer kuruş (bigint) olarak döndürür — calculateTotalDebt/isFullyPaid
   * ortak çekirdeği. Float toplama dust'ı yerine exact cent toplamı.
   */
  private totalDebtCents(debtState: DebtState): bigint {
    let total = toCents(debtState.principal) + toCents(debtState.accruedInterest);

    for (const amount of debtState.costs.values()) {
      total += toCents(amount);
    }
    for (const amount of debtState.ancillaries.values()) {
      total += toCents(amount);
    }

    return total;
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
