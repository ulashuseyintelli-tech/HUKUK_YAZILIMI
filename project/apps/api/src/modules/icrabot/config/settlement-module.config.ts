/**
 * SETTLEMENT MODULE CONFIG v10
 * 
 * Uzlaşma/Taksit teklifi modülü konfigürasyonu.
 * settlement_module_v10.yaml'dan implement edilmiştir.
 * 
 * Amaç: Davranış skoru yüksek borçluda tahsilatı hızlandırmak.
 */

import { DebtorBehaviorClass } from './debtor-behavior-score.config';

// ==================== TYPES ====================

export interface SettlementParams {
  enabled: boolean;
  minBehaviorScore: number;
  minRemainingClaim: number;
  defaultInstallments: number;
  maxInstallments: number;
  discountPolicy: {
    enabled: boolean;
    maxDiscountRate: number;
    requireAttorneyApproval: boolean;
  };
}

export interface SettlementPlan {
  installments: number;
  installmentAmount: number;
  dueDay: number;
  totalAmount: number;
  discountApplied: number;
}

export interface SettlementEligibility {
  eligible: boolean;
  reason?: string;
}

// ==================== CONFIG ====================

export const SETTLEMENT_PARAMS: SettlementParams = {
  enabled: true,
  minBehaviorScore: 70,
  minRemainingClaim: 20000,
  defaultInstallments: 6,
  maxInstallments: 12,
  discountPolicy: {
    enabled: true,
    maxDiscountRate: 0.08, // %8'e kadar
    requireAttorneyApproval: true,
  },
};

// ==================== ELIGIBILITY ====================

/**
 * Uzlaşma uygunluğunu kontrol et
 */
export function checkSettlementEligibility(
  behaviorClass: DebtorBehaviorClass,
  remainingClaim: number,
  params: SettlementParams = SETTLEMENT_PARAMS
): SettlementEligibility {
  if (!params.enabled) {
    return { eligible: false, reason: 'Uzlaşma modülü devre dışı' };
  }
  
  if (behaviorClass === 'PAYMENT_LIKELY' && remainingClaim >= params.minRemainingClaim) {
    return { eligible: true };
  }
  
  if (behaviorClass === 'MIXED' && remainingClaim >= params.minRemainingClaim * 2) {
    return { eligible: true };
  }
  
  if (behaviorClass === 'HARD') {
    return { eligible: false, reason: 'Borçlu davranış skoru düşük' };
  }
  
  if (remainingClaim < params.minRemainingClaim) {
    return { eligible: false, reason: `Kalan alacak minimum tutarın altında (${params.minRemainingClaim} TL)` };
  }
  
  return { eligible: false, reason: 'Uygunluk kriterleri karşılanmadı' };
}

// ==================== PLAN BUILDER ====================

/**
 * Taksit planı oluştur
 */
export function buildSettlementPlan(
  remainingClaim: number,
  params: SettlementParams = SETTLEMENT_PARAMS
): SettlementPlan {
  let installments = params.defaultInstallments;
  
  // Yüksek tutarlar için daha fazla taksit
  if (remainingClaim > 200000) {
    installments = Math.min(params.maxInstallments, 10);
  } else if (remainingClaim > 100000) {
    installments = Math.min(params.maxInstallments, 8);
  }
  
  const installmentAmount = Math.ceil(remainingClaim / installments);
  const dueDay = 5; // Her ayın 5'i
  
  return {
    installments,
    installmentAmount,
    dueDay,
    totalAmount: remainingClaim,
    discountApplied: 0,
  };
}

/**
 * İndirimli taksit planı oluştur
 */
export function buildDiscountedSettlementPlan(
  remainingClaim: number,
  discountRate: number,
  params: SettlementParams = SETTLEMENT_PARAMS
): SettlementPlan {
  if (!params.discountPolicy.enabled) {
    return buildSettlementPlan(remainingClaim, params);
  }
  
  // İndirim oranını sınırla
  const effectiveDiscount = Math.min(discountRate, params.discountPolicy.maxDiscountRate);
  const discountedAmount = remainingClaim * (1 - effectiveDiscount);
  
  const plan = buildSettlementPlan(discountedAmount, params);
  plan.discountApplied = remainingClaim - discountedAmount;
  
  return plan;
}

// ==================== TEMPLATES ====================

export const SETTLEMENT_TEMPLATES = {
  offerEmailTemplateId: 'SETTLEMENT_OFFER_TR',
  reminderSmsTemplateId: 'SETTLEMENT_REMINDER_TR',
} as const;
