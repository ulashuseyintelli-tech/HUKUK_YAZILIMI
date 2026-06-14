import { Injectable } from '@nestjs/common';
import {
  Payment,
  DebtState,
  PaymentAllocationResult,
  AllocationCategory,
} from './types';

/**
 * TBK 100 Ödeme Mahsubu Servisi
 *
 * @deprecated ÖLÜ — KULLANMA. Kanonik mahsup = `allocation-engine.service`
 *   (allocateSinglePayment, P-0 sırası: MASRAF→FER'İ→FAİZ→ANAPARA) + `tbk100-allocator`.
 *   Bu servis ESKİ FAİZ-ÖNCE sırayı (1.faiz 2.masraf 3.fer'i 4.anapara) taşır = **P-0 İHLALİ**.
 *   DI provider'ından ve barrel export'undan ÇIKARILDI (de-fang); yanlışlıkla inject edilemez.
 *   Yalnız tarihsel/karakterizasyon (payment-allocation.characterization.spec) için duruyor.
 *
 * Türk Borçlar Kanunu 100. madde uyarınca (ESKİ) ödeme sırası:
 * 1. İşlemiş faiz
 * 2. Masraflar (harç, tebligat, vb.)
 * 3. Fer'i alacaklar (komisyon, tazminat, vb.)
 * 4. Anapara
 */
@Injectable()
export class PaymentAllocationService {
  /**
   * Allocate a single payment according to TBK 100 rules
   */
  allocatePayment(
    payment: Payment,
    debtState: DebtState,
  ): PaymentAllocationResult {
    let remaining = payment.amount;
    const allocations: AllocationCategory[] = [];

    // 1. First: Accrued Interest (İşlemiş Faiz)
    const interestAllocation = this.allocateToCategory(
      'INTEREST',
      'İşlemiş Faiz',
      debtState.accruedInterest,
      remaining,
    );
    allocations.push(interestAllocation);
    remaining = interestAllocation.amountAfter > 0 
      ? remaining - interestAllocation.amountAllocated 
      : remaining - interestAllocation.amountAllocated;
    remaining = Math.max(0, remaining);

    // 2. Second: Costs (Masraflar)
    const costsAllocation = this.allocateToCategory(
      'COSTS',
      'Masraflar',
      debtState.costs,
      remaining,
    );
    allocations.push(costsAllocation);
    remaining = Math.max(0, remaining - costsAllocation.amountAllocated);

    // 3. Third: Ancillaries (Fer'i Alacaklar)
    const ancillaryAllocation = this.allocateToCategory(
      'ANCILLARY',
      'Fer\'i Alacaklar',
      debtState.ancillaries,
      remaining,
    );
    allocations.push(ancillaryAllocation);
    remaining = Math.max(0, remaining - ancillaryAllocation.amountAllocated);

    // 4. Last: Principal (Anapara)
    const principalAllocation = this.allocateToCategory(
      'PRINCIPAL',
      'Anapara',
      debtState.principal,
      remaining,
    );
    allocations.push(principalAllocation);
    remaining = Math.max(0, remaining - principalAllocation.amountAllocated);

    // Calculate new principal
    const newPrincipal = debtState.principal - principalAllocation.amountAllocated;

    return {
      paymentId: payment.id,
      paymentDate: payment.date,
      paymentAmount: payment.amount,
      allocations,
      remainingPayment: remaining,
      newPrincipal: Math.max(0, newPrincipal),
    };
  }

  /**
   * Allocate multiple payments with interest recalculation between payments
   */
  allocateMultiplePayments(
    payments: Payment[],
    initialDebtState: DebtState,
    interestCalculator: (principal: number, fromDate: string, toDate: string) => number,
  ): PaymentAllocationResult[] {
    // Sort payments by date
    const sortedPayments = [...payments].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );

    const results: PaymentAllocationResult[] = [];
    let currentState = { ...initialDebtState };
    let lastPaymentDate: string | null = null;

    for (const payment of sortedPayments) {
      // Recalculate interest if there's a gap between payments
      if (lastPaymentDate && currentState.principal > 0) {
        const additionalInterest = interestCalculator(
          currentState.principal,
          lastPaymentDate,
          payment.date,
        );
        currentState.accruedInterest += additionalInterest;
      }

      // Allocate this payment
      const result = this.allocatePayment(payment, currentState);
      results.push(result);

      // Update state for next payment
      currentState = {
        principal: result.newPrincipal,
        accruedInterest: Math.max(
          0,
          currentState.accruedInterest - result.allocations[0].amountAllocated,
        ),
        costs: Math.max(
          0,
          currentState.costs - result.allocations[1].amountAllocated,
        ),
        ancillaries: Math.max(
          0,
          currentState.ancillaries - result.allocations[2].amountAllocated,
        ),
      };

      lastPaymentDate = payment.date;
    }

    return results;
  }

  /**
   * Generate human-readable allocation breakdown
   */
  generateAllocationBreakdown(result: PaymentAllocationResult): string {
    const lines: string[] = [
      `Ödeme Tarihi: ${this.formatDate(result.paymentDate)}`,
      `Ödeme Tutarı: ${this.formatCurrency(result.paymentAmount)}`,
      '',
      'Mahsup Dağılımı (TBK 100):',
    ];

    for (const alloc of result.allocations) {
      if (alloc.amountAllocated > 0) {
        lines.push(
          `  ${alloc.label}: ${this.formatCurrency(alloc.amountAllocated)} ` +
          `(${this.formatCurrency(alloc.amountBefore)} → ${this.formatCurrency(alloc.amountAfter)})`,
        );
      }
    }

    if (result.remainingPayment > 0) {
      lines.push('');
      lines.push(`Kalan Ödeme: ${this.formatCurrency(result.remainingPayment)}`);
    }

    lines.push('');
    lines.push(`Yeni Anapara: ${this.formatCurrency(result.newPrincipal)}`);

    return lines.join('\n');
  }

  /**
   * Allocate to a single category
   */
  private allocateToCategory(
    category: AllocationCategory['category'],
    label: string,
    amountBefore: number,
    availablePayment: number,
  ): AllocationCategory {
    const amountAllocated = Math.min(amountBefore, availablePayment);
    const amountAfter = amountBefore - amountAllocated;

    return {
      category,
      label,
      amountBefore: this.round(amountBefore),
      amountAllocated: this.round(amountAllocated),
      amountAfter: this.round(amountAfter),
    };
  }

  /**
   * Round to 2 decimal places
   */
  private round(value: number): number {
    return Math.round(value * 100) / 100;
  }

  /**
   * Format currency for display
   */
  private formatCurrency(amount: number): string {
    return new Intl.NumberFormat('tr-TR', {
      style: 'currency',
      currency: 'TRY',
    }).format(amount);
  }

  /**
   * Format date for display
   */
  private formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('tr-TR');
  }
}
