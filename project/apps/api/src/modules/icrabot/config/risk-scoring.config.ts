/**
 * RISK SCORING v4
 * 
 * Varlık/haciz/iştirak risk skorlama sistemi.
 * AI değerleme + haciz sırası + ön alacaklar → risk skoru
 */

import { AssetType, LienType } from './facts-schema.config';

// ==================== TYPES ====================

export type RiskCategory = 
  | 'YAKALAMA_RISK'      // Araç yakalama riski
  | 'HACIZ_RISK'         // Genel haciz riski
  | 'SATIS_RISK'         // Satış riski
  | 'ISTIRAK_RISK'       // İştirak/100. madde riski
  | 'TAHSILAT_RISK';     // Genel tahsilat riski

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface RiskFactor {
  factorId: string;
  name: string;
  description: string;
  weight: number; // 0-1 arası ağırlık
  
  // Hesaplama
  calculate: (context: RiskContext) => number; // 0-100 arası skor döner
}

export interface RiskContext {
  // Varlık bilgileri
  assetType: AssetType;
  assetValue: number;
  assetValueConfidence: number;
  liquidationFactor: number;
  
  // Haciz bilgileri
  ourLienRank: number;
  totalLiens: number;
  activePriorLiens: number;
  priorClaimsTotal: number;
  priorClaimsKnown: number;
  
  // Dosya bilgileri
  totalDebt: number;
  collectedAmount: number;
  caseAgeDays: number;
  
  // Borçlu bilgileri
  debtorType: 'INDIVIDUAL' | 'COMPANY' | 'PUBLIC_INSTITUTION';
  hasOtherAssets: boolean;
  
  // Maliyet bilgileri
  estimatedCosts: number;
}

export interface RiskResult {
  category: RiskCategory;
  score: number; // 0-100
  level: RiskLevel;
  
  // Faktör katkıları
  factorContributions: Array<{
    factorId: string;
    factorName: string;
    rawScore: number;
    weight: number;
    contribution: number;
  }>;
  
  // Hesaplanan değerler
  expectedRecovery: number;
  breakEvenPoint: number;
  netExpectedValue: number;
  
  // Öneri
  recommendation: 'PROCEED' | 'CAUTION' | 'BLOCK' | 'ATTORNEY_DECISION';
  reasoning: string;
  
  // Bloklanacak aksiyonlar
  blockedActions: string[];
}

// ==================== RISK FACTORS ====================

export const RISK_FACTORS: Record<RiskCategory, RiskFactor[]> = {
  
  YAKALAMA_RISK: [
    {
      factorId: 'YR_LIEN_RANK',
      name: 'Haciz Sırası',
      description: 'Bizim haciz sıramız (1. sıra en iyi)',
      weight: 0.35,
      calculate: (ctx) => {
        if (ctx.ourLienRank === 1) return 100;
        if (ctx.ourLienRank === 2) return 70;
        if (ctx.ourLienRank === 3) return 40;
        if (ctx.ourLienRank <= 5) return 20;
        return 5;
      },
    },
    {
      factorId: 'YR_PRIOR_CLAIMS',
      name: 'Ön Alacak Oranı',
      description: 'Ön alacakların varlık değerine oranı',
      weight: 0.30,
      calculate: (ctx) => {
        if (ctx.assetValue === 0) return 0;
        const ratio = ctx.priorClaimsTotal / ctx.assetValue;
        if (ratio === 0) return 100;
        if (ratio < 0.3) return 80;
        if (ratio < 0.5) return 60;
        if (ratio < 0.7) return 40;
        if (ratio < 0.9) return 20;
        return 5;
      },
    },
    {
      factorId: 'YR_ASSET_VALUE',
      name: 'Varlık Değeri',
      description: 'Varlığın tahmini değeri',
      weight: 0.20,
      calculate: (ctx) => {
        if (ctx.assetValue >= 500000) return 100;
        if (ctx.assetValue >= 200000) return 80;
        if (ctx.assetValue >= 100000) return 60;
        if (ctx.assetValue >= 50000) return 40;
        if (ctx.assetValue >= 20000) return 20;
        return 10;
      },
    },
    {
      factorId: 'YR_VALUE_CONFIDENCE',
      name: 'Değerleme Güveni',
      description: 'AI değerleme güven skoru',
      weight: 0.15,
      calculate: (ctx) => ctx.assetValueConfidence,
    },
  ],
  
  ISTIRAK_RISK: [
    {
      factorId: 'IR_EXPECTED_SHARE',
      name: 'Beklenen Pay',
      description: 'Satış sonrası beklenen payımız',
      weight: 0.40,
      calculate: (ctx) => {
        const netValue = ctx.assetValue * ctx.liquidationFactor;
        const afterPrior = netValue - ctx.priorClaimsTotal;
        if (afterPrior <= 0) return 0;
        const shareRatio = Math.min(afterPrior / ctx.totalDebt, 1);
        return shareRatio * 100;
      },
    },
    {
      factorId: 'IR_BREAK_EVEN',
      name: 'Başabaş Analizi',
      description: 'Masrafları karşılama olasılığı',
      weight: 0.30,
      calculate: (ctx) => {
        const netValue = ctx.assetValue * ctx.liquidationFactor;
        const afterPrior = netValue - ctx.priorClaimsTotal;
        const afterCosts = afterPrior - ctx.estimatedCosts;
        if (afterCosts <= 0) return 0;
        if (afterCosts >= ctx.estimatedCosts * 3) return 100;
        if (afterCosts >= ctx.estimatedCosts * 2) return 80;
        if (afterCosts >= ctx.estimatedCosts) return 60;
        return 30;
      },
    },
    {
      factorId: 'IR_PRIOR_ACTIVITY',
      name: 'Ön Haciz Aktivitesi',
      description: 'Ön hacizlerin aktiflik durumu',
      weight: 0.20,
      calculate: (ctx) => {
        if (ctx.activePriorLiens === 0) return 100;
        const activeRatio = ctx.activePriorLiens / ctx.totalLiens;
        return (1 - activeRatio) * 100;
      },
    },
    {
      factorId: 'IR_CLAIM_CERTAINTY',
      name: 'Alacak Kesinliği',
      description: 'Ön alacak tutarlarının bilinirliği',
      weight: 0.10,
      calculate: (ctx) => {
        if (ctx.priorClaimsTotal === 0) return 100;
        const knownRatio = ctx.priorClaimsKnown / ctx.priorClaimsTotal;
        return knownRatio * 100;
      },
    },
  ],
  
  HACIZ_RISK: [
    {
      factorId: 'HR_ASSET_LIQUIDITY',
      name: 'Varlık Likiditesi',
      description: 'Varlığın nakde çevrilebilirliği',
      weight: 0.30,
      calculate: (ctx) => ctx.liquidationFactor * 100,
    },
    {
      factorId: 'HR_DEBT_COVERAGE',
      name: 'Borç Karşılama',
      description: 'Varlığın borcu karşılama oranı',
      weight: 0.35,
      calculate: (ctx) => {
        if (ctx.totalDebt === 0) return 100;
        const coverage = (ctx.assetValue * ctx.liquidationFactor) / ctx.totalDebt;
        return Math.min(coverage * 100, 100);
      },
    },
    {
      factorId: 'HR_OTHER_ASSETS',
      name: 'Diğer Varlıklar',
      description: 'Borçlunun başka varlıkları var mı',
      weight: 0.20,
      calculate: (ctx) => ctx.hasOtherAssets ? 80 : 40,
    },
    {
      factorId: 'HR_DEBTOR_TYPE',
      name: 'Borçlu Tipi',
      description: 'Borçlu türüne göre tahsilat olasılığı',
      weight: 0.15,
      calculate: (ctx) => {
        switch (ctx.debtorType) {
          case 'COMPANY': return 70;
          case 'INDIVIDUAL': return 60;
          case 'PUBLIC_INSTITUTION': return 90;
          default: return 50;
        }
      },
    },
  ],
  
  SATIS_RISK: [
    {
      factorId: 'SR_MARKET_DEMAND',
      name: 'Piyasa Talebi',
      description: 'Varlık türüne göre piyasa talebi',
      weight: 0.25,
      calculate: (ctx) => {
        // Varlık türüne göre talep skoru
        switch (ctx.assetType) {
          case 'VEHICLE': return 80;
          case 'REAL_ESTATE': return 90;
          case 'BANK_ACCOUNT': return 100; // Direkt tahsilat
          default: return 50;
        }
      },
    },
    {
      factorId: 'SR_LIQUIDATION',
      name: 'Likidite Faktörü',
      description: 'Satışta beklenen fire oranı',
      weight: 0.35,
      calculate: (ctx) => ctx.liquidationFactor * 100,
    },
    {
      factorId: 'SR_NET_PROCEEDS',
      name: 'Net Gelir',
      description: 'Satış sonrası net gelir beklentisi',
      weight: 0.40,
      calculate: (ctx) => {
        const netValue = ctx.assetValue * ctx.liquidationFactor;
        const afterPrior = netValue - ctx.priorClaimsTotal - ctx.estimatedCosts;
        if (afterPrior <= 0) return 0;
        if (afterPrior >= ctx.totalDebt) return 100;
        return (afterPrior / ctx.totalDebt) * 100;
      },
    },
  ],
  
  TAHSILAT_RISK: [
    {
      factorId: 'TR_COLLECTION_RATE',
      name: 'Tahsilat Oranı',
      description: 'Mevcut tahsilat oranı',
      weight: 0.30,
      calculate: (ctx) => {
        if (ctx.totalDebt === 0) return 100;
        return (ctx.collectedAmount / ctx.totalDebt) * 100;
      },
    },
    {
      factorId: 'TR_CASE_AGE',
      name: 'Dosya Yaşı',
      description: 'Dosyanın yaşına göre tahsilat olasılığı',
      weight: 0.20,
      calculate: (ctx) => {
        if (ctx.caseAgeDays < 180) return 90;
        if (ctx.caseAgeDays < 365) return 70;
        if (ctx.caseAgeDays < 730) return 50;
        return 30;
      },
    },
    {
      factorId: 'TR_ASSET_COVERAGE',
      name: 'Varlık Kapsamı',
      description: 'Tespit edilen varlıkların borcu karşılama oranı',
      weight: 0.35,
      calculate: (ctx) => {
        if (ctx.totalDebt === 0) return 100;
        const coverage = ctx.assetValue / ctx.totalDebt;
        return Math.min(coverage * 100, 100);
      },
    },
    {
      factorId: 'TR_DEBTOR_PROFILE',
      name: 'Borçlu Profili',
      description: 'Borçlu tipine göre ödeme olasılığı',
      weight: 0.15,
      calculate: (ctx) => {
        switch (ctx.debtorType) {
          case 'PUBLIC_INSTITUTION': return 95;
          case 'COMPANY': return 65;
          case 'INDIVIDUAL': return 55;
          default: return 50;
        }
      },
    },
  ],
};

// ==================== THRESHOLDS ====================

export const RISK_THRESHOLDS: Record<RiskLevel, { min: number; max: number }> = {
  LOW: { min: 70, max: 100 },
  MEDIUM: { min: 40, max: 69 },
  HIGH: { min: 20, max: 39 },
  CRITICAL: { min: 0, max: 19 },
};

export const RECOMMENDATION_THRESHOLDS: Record<RiskLevel, {
  recommendation: 'PROCEED' | 'CAUTION' | 'BLOCK' | 'ATTORNEY_DECISION';
  blockedActions: string[];
}> = {
  LOW: {
    recommendation: 'PROCEED',
    blockedActions: [],
  },
  MEDIUM: {
    recommendation: 'CAUTION',
    blockedActions: [],
  },
  HIGH: {
    recommendation: 'ATTORNEY_DECISION',
    blockedActions: ['SubmitYakalamaRequest', 'RequestSale'],
  },
  CRITICAL: {
    recommendation: 'BLOCK',
    blockedActions: ['SubmitYakalamaRequest', 'RequestSale', 'PayAdvance', 'PlaceLien'],
  },
};

// ==================== SCORING FUNCTIONS ====================

/**
 * Risk skoru hesapla
 */
export function calculateRiskScore(
  category: RiskCategory,
  context: RiskContext
): RiskResult {
  const factors = RISK_FACTORS[category];
  if (!factors || factors.length === 0) {
    throw new Error(`Bilinmeyen risk kategorisi: ${category}`);
  }
  
  // Faktör katkılarını hesapla
  const contributions = factors.map(factor => {
    const rawScore = factor.calculate(context);
    const contribution = rawScore * factor.weight;
    return {
      factorId: factor.factorId,
      factorName: factor.name,
      rawScore,
      weight: factor.weight,
      contribution,
    };
  });
  
  // Toplam skor
  const totalScore = contributions.reduce((sum, c) => sum + c.contribution, 0);
  
  // Risk seviyesi
  const level = getRiskLevel(totalScore);
  
  // Beklenen değerler
  const netValue = context.assetValue * context.liquidationFactor;
  const expectedRecovery = Math.max(0, netValue - context.priorClaimsTotal);
  const breakEvenPoint = context.estimatedCosts;
  const netExpectedValue = expectedRecovery - context.estimatedCosts;
  
  // Öneri
  const thresholds = RECOMMENDATION_THRESHOLDS[level];
  
  // Gerekçe oluştur
  const reasoning = generateReasoning(category, level, contributions, context);
  
  return {
    category,
    score: Math.round(totalScore),
    level,
    factorContributions: contributions,
    expectedRecovery,
    breakEvenPoint,
    netExpectedValue,
    recommendation: thresholds.recommendation,
    reasoning,
    blockedActions: thresholds.blockedActions,
  };
}

/**
 * Risk seviyesini belirle
 */
export function getRiskLevel(score: number): RiskLevel {
  if (score >= RISK_THRESHOLDS.LOW.min) return 'LOW';
  if (score >= RISK_THRESHOLDS.MEDIUM.min) return 'MEDIUM';
  if (score >= RISK_THRESHOLDS.HIGH.min) return 'HIGH';
  return 'CRITICAL';
}

/**
 * Gerekçe oluştur
 */
function generateReasoning(
  category: RiskCategory,
  level: RiskLevel,
  contributions: RiskResult['factorContributions'],
  context: RiskContext
): string {
  const parts: string[] = [];
  
  // En etkili faktörleri bul
  const sorted = [...contributions].sort((a, b) => b.contribution - a.contribution);
  const topFactors = sorted.slice(0, 2);
  const bottomFactors = sorted.slice(-2);
  
  // Olumlu faktörler
  const positiveFactors = topFactors.filter(f => f.rawScore >= 60);
  if (positiveFactors.length > 0) {
    parts.push(`Olumlu: ${positiveFactors.map(f => f.factorName).join(', ')}`);
  }
  
  // Olumsuz faktörler
  const negativeFactors = bottomFactors.filter(f => f.rawScore < 40);
  if (negativeFactors.length > 0) {
    parts.push(`Risk: ${negativeFactors.map(f => f.factorName).join(', ')}`);
  }
  
  // Özel durumlar
  if (context.ourLienRank > 1 && context.priorClaimsTotal > context.assetValue * 0.7) {
    parts.push('Ön alacaklar varlık değerinin %70\'ini aşıyor');
  }
  
  if (context.estimatedCosts > context.assetValue * context.liquidationFactor * 0.3) {
    parts.push('Masraflar beklenen gelirin %30\'unu aşıyor');
  }
  
  // Seviye bazlı özet
  switch (level) {
    case 'LOW':
      parts.unshift('Düşük risk - işleme devam edilebilir.');
      break;
    case 'MEDIUM':
      parts.unshift('Orta risk - dikkatli ilerlenmeli.');
      break;
    case 'HIGH':
      parts.unshift('Yüksek risk - avukat onayı önerilir.');
      break;
    case 'CRITICAL':
      parts.unshift('Kritik risk - masraflı işlemler bloklandı.');
      break;
  }
  
  return parts.join(' ');
}

/**
 * Hızlı iştirak riski kontrolü
 */
export function quickParticipationCheck(context: RiskContext): {
  shouldProceed: boolean;
  reason: string;
} {
  // 1. sıradaysak devam et
  if (context.ourLienRank === 1) {
    return { shouldProceed: true, reason: 'Birinci sıra haciz' };
  }
  
  // Ön alacaklar varlık değerini aşıyorsa dur
  if (context.priorClaimsTotal >= context.assetValue * context.liquidationFactor) {
    return {
      shouldProceed: false,
      reason: 'Ön alacaklar varlık değerini aşıyor',
    };
  }
  
  // Beklenen pay masrafları karşılamıyorsa dur
  const expectedShare = (context.assetValue * context.liquidationFactor - context.priorClaimsTotal);
  if (expectedShare < context.estimatedCosts * 1.5) {
    return {
      shouldProceed: false,
      reason: 'Beklenen pay masrafları karşılamıyor',
    };
  }
  
  return { shouldProceed: true, reason: 'Risk kabul edilebilir seviyede' };
}

/**
 * Yakalama avansı önerisi
 */
export function shouldRequestYakalamaAdvance(context: RiskContext): {
  recommend: boolean;
  reason: string;
  riskLevel: RiskLevel;
} {
  // Araç değilse önermez
  if (context.assetType !== 'VEHICLE') {
    return { recommend: false, reason: 'Araç değil', riskLevel: 'LOW' };
  }
  
  // Risk hesapla
  const result = calculateRiskScore('YAKALAMA_RISK', context);
  
  if (result.level === 'CRITICAL') {
    return {
      recommend: false,
      reason: 'Risk çok yüksek - yakalama önerilmez',
      riskLevel: result.level,
    };
  }
  
  if (result.level === 'HIGH') {
    return {
      recommend: false,
      reason: 'Risk yüksek - avukat onayı gerekli',
      riskLevel: result.level,
    };
  }
  
  return {
    recommend: true,
    reason: result.reasoning,
    riskLevel: result.level,
  };
}
