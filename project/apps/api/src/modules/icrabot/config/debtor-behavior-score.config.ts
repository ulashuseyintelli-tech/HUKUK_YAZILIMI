/**
 * DEBTOR BEHAVIOR SCORE CONFIG v9
 * 
 * Borçlu davranış skoru hesaplama konfigürasyonu.
 * debtor_behavior_score_v9.yaml'dan implement edilmiştir.
 * 
 * Amaç: Hatırlatma/uzlaşma/strateji kararını veriyle vermek.
 */

// ==================== TYPES ====================

export interface DebtorSignals {
  tebligat: {
    debtorOpenedEtebligat: boolean;
    daysToOpen: number | null;
    returnsCount: number;
  };
  payments: {
    anyPaymentMade: boolean;
    lastPaymentDaysAgo: number | null;
    partialPaymentsCount: number;
  };
  assets: {
    assetScore: number | null;
    hasVehicle: boolean;
    hasRealEstate: boolean;
    hasSgkJob: boolean;
  };
  cooperation: {
    respondedToCalls: boolean | null;
    providedDocuments: boolean | null;
  };
}

export type DebtorBehaviorClass = 'PAYMENT_LIKELY' | 'MIXED' | 'HARD';

export interface DebtorBehaviorScoreResult {
  score: number;
  class: DebtorBehaviorClass;
  willingnessScore: number;
  abilityScore: number;
  frictionScore: number;
  recommendedActions: string[];
}

// ==================== WEIGHTS ====================

export const BEHAVIOR_SCORE_WEIGHTS = {
  willingness: 0.35,
  ability: 0.45,
  friction: 0.20,
} as const;

// ==================== SCORING RULES ====================

/**
 * Willingness (İsteklilik) skoru hesaplama kuralları
 */
export function computeWillingnessScore(signals: DebtorSignals): number {
  let score = 0;
  
  // E-tebligatı açtı ve 2 gün içinde açtı
  if (signals.tebligat.debtorOpenedEtebligat && 
      signals.tebligat.daysToOpen !== null && 
      signals.tebligat.daysToOpen <= 2) {
    score += 30;
  }
  
  // Herhangi bir ödeme yaptı
  if (signals.payments.anyPaymentMade) {
    score += 40;
  }
  
  // 2+ kısmi ödeme yaptı
  if (signals.payments.partialPaymentsCount >= 2) {
    score += 10;
  }
  
  // 2+ iade (tebligat iadesi)
  if (signals.tebligat.returnsCount >= 2) {
    score -= 25;
  }
  
  return Math.max(0, Math.min(100, score));
}

/**
 * Ability (Ödeme Gücü) skoru hesaplama kuralları
 */
export function computeAbilityScore(signals: DebtorSignals): number {
  let score = 0;
  
  // Gayrimenkul var
  if (signals.assets.hasRealEstate) {
    score += 40;
  }
  
  // Araç var
  if (signals.assets.hasVehicle) {
    score += 20;
  }
  
  // SGK'lı iş var
  if (signals.assets.hasSgkJob) {
    score += 20;
  }
  
  // Varlık skoru varsa ekle (max 20)
  if (signals.assets.assetScore !== null) {
    score += Math.min(20, signals.assets.assetScore / 5);
  }
  
  return Math.max(0, Math.min(100, score));
}

/**
 * Friction (Sürtünme/Zorluk) skoru hesaplama kuralları
 */
export function computeFrictionScore(signals: DebtorSignals): number {
  let score = 0;
  
  // 1+ iade
  if (signals.tebligat.returnsCount >= 1) {
    score += 20;
  }
  
  // Aramalara cevap vermedi
  if (signals.cooperation.respondedToCalls === false) {
    score += 20;
  }
  
  // Belge sağlamadı
  if (signals.cooperation.providedDocuments === false) {
    score += 10;
  }
  
  return Math.max(0, Math.min(100, score));
}

// ==================== MAIN CALCULATOR ====================

/**
 * Borçlu davranış skorunu hesapla
 */
export function computeDebtorBehaviorScore(signals: DebtorSignals): DebtorBehaviorScoreResult {
  const willingnessScore = computeWillingnessScore(signals);
  const abilityScore = computeAbilityScore(signals);
  const frictionScore = computeFrictionScore(signals);
  
  // Ağırlıklı skor hesapla
  const rawScore = 
    willingnessScore * BEHAVIOR_SCORE_WEIGHTS.willingness +
    abilityScore * BEHAVIOR_SCORE_WEIGHTS.ability -
    frictionScore * BEHAVIOR_SCORE_WEIGHTS.friction;
  
  // 0-100 arasına sınırla
  const score = Math.max(0, Math.min(100, rawScore));
  
  // Sınıf belirle
  let behaviorClass: DebtorBehaviorClass;
  if (score >= 70) {
    behaviorClass = 'PAYMENT_LIKELY';
  } else if (score >= 40) {
    behaviorClass = 'MIXED';
  } else {
    behaviorClass = 'HARD';
  }
  
  // Önerilen aksiyonlar
  const recommendedActions = RECOMMENDED_ACTIONS[behaviorClass];
  
  return {
    score: Math.round(score * 100) / 100,
    class: behaviorClass,
    willingnessScore,
    abilityScore,
    frictionScore,
    recommendedActions,
  };
}

// ==================== RECOMMENDED ACTIONS ====================

export const RECOMMENDED_ACTIONS: Record<DebtorBehaviorClass, string[]> = {
  PAYMENT_LIKELY: ['offer_installment', 'short_reminder_cycle'],
  MIXED: ['standard_followup', 'asset_first'],
  HARD: ['asset_enforcement', 'limit_cost_actions'],
};

// ==================== HELPER ====================

/**
 * Boş/varsayılan sinyaller oluştur
 */
export function createEmptySignals(): DebtorSignals {
  return {
    tebligat: {
      debtorOpenedEtebligat: false,
      daysToOpen: null,
      returnsCount: 0,
    },
    payments: {
      anyPaymentMade: false,
      lastPaymentDaysAgo: null,
      partialPaymentsCount: 0,
    },
    assets: {
      assetScore: null,
      hasVehicle: false,
      hasRealEstate: false,
      hasSgkJob: false,
    },
    cooperation: {
      respondedToCalls: null,
      providedDocuments: null,
    },
  };
}
