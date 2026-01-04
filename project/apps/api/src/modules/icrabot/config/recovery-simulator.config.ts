/**
 * RECOVERY SIMULATOR CONFIG v5
 * 
 * Net Getiri Simülatörü.
 * gross_value, liquidation_factor, costs, prior_claims → expected_net
 * go/no-go kararı için kullanılır.
 */

import { AssetType } from './facts-schema.config';
import { RiskLevel } from './risk-scoring.config';

// ==================== TYPES ====================

export interface SimulationInput {
  // Varlık bilgileri
  assetType: AssetType;
  grossValue: number;           // Brüt değer (AI tahmini veya bilirkişi)
  valueConfidence: number;      // Değer güveni (0-1)
  
  // Likidite faktörleri
  liquidationFactor?: number;   // Manuel override
  marketCondition?: 'GOOD' | 'NORMAL' | 'POOR';
  
  // Ön alacaklar
  priorClaims: PriorClaim[];
  
  // Masraflar
  estimatedCosts: CostItem[];
  
  // Dosya bilgileri
  totalDebt: number;
  collectedAmount: number;
  
  // Opsiyonel
  ourLienRank?: number;
  timeToSaleMonths?: number;
}

export interface PriorClaim {
  creditorName: string;
  claimType: 'HACIZ' | 'REHIN' | 'IPOTEK' | 'TEDBIR';
  amount: number;
  isKnown: boolean;           // Tutar kesin mi
  isActive: boolean;          // Hala aktif mi
  priority: number;           // Sıra
  estimatedIfUnknown?: number; // Bilinmiyorsa tahmin
}

export interface CostItem {
  costType: CostType;
  amount: number;
  isFixed: boolean;           // Sabit mi, değişken mi
  probability: number;        // Gerçekleşme olasılığı (0-1)
}

export type CostType =
  | 'YAKALAMA_AVANSI'
  | 'SATIS_AVANSI'
  | 'BILIRKISI_UCRETI'
  | 'ILAN_MASRAFI'
  | 'MUHAFAZA_MASRAFI'
  | 'NAKIL_MASRAFI'
  | 'HARÇ'
  | 'DIGER';

export interface SimulationResult {
  // Temel hesaplamalar
  grossValue: number;
  liquidationFactor: number;
  liquidatedValue: number;      // grossValue * liquidationFactor
  
  // Ön alacak analizi
  totalPriorClaims: number;
  knownPriorClaims: number;
  unknownPriorClaims: number;
  priorClaimsUncertainty: number; // 0-1
  
  // Masraf analizi
  totalCosts: number;
  fixedCosts: number;
  variableCosts: number;
  expectedCosts: number;        // probability weighted
  
  // Net değer hesaplamaları
  afterPriorClaims: number;     // liquidatedValue - totalPriorClaims
  afterCosts: number;           // afterPriorClaims - expectedCosts
  expectedNet: number;          // Final beklenen net
  
  // Tahsilat analizi
  remainingDebt: number;
  coverageRatio: number;        // expectedNet / remainingDebt
  
  // Senaryolar
  scenarios: {
    best: ScenarioResult;
    expected: ScenarioResult;
    worst: ScenarioResult;
  };
  
  // Karar
  decision: SimulationDecision;
  
  // Detaylı breakdown
  breakdown: SimulationBreakdown;
}

export interface ScenarioResult {
  name: string;
  probability: number;
  netValue: number;
  roi: number;                  // Return on Investment (net / costs)
  description: string;
}

export interface SimulationDecision {
  recommendation: 'GO' | 'NO_GO' | 'CONDITIONAL' | 'ATTORNEY_DECISION';
  confidence: number;           // 0-1
  reasoning: string[];
  blockedActions: string[];
  requiredConditions?: string[];
}

export interface SimulationBreakdown {
  // Değer zinciri
  valueChain: Array<{
    step: string;
    value: number;
    delta: number;
    note?: string;
  }>;
  
  // Risk faktörleri
  riskFactors: Array<{
    factor: string;
    impact: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
    weight: number;
    description: string;
  }>;
}

// ==================== LIQUIDATION FACTORS ====================

/**
 * Varlık türüne göre likidite faktörleri
 * İcra satışlarında genellikle piyasa değerinin altında satış olur
 */
export const LIQUIDATION_FACTORS: Record<AssetType, {
  good: number;
  normal: number;
  poor: number;
  description: string;
}> = {
  VEHICLE: {
    good: 0.75,
    normal: 0.65,
    poor: 0.50,
    description: 'Araçlar genellikle piyasa değerinin %50-75\'ine satılır',
  },
  REAL_ESTATE: {
    good: 0.80,
    normal: 0.70,
    poor: 0.55,
    description: 'Gayrimenkuller %55-80 arasında değerlenir',
  },
  BANK_ACCOUNT: {
    good: 1.0,
    normal: 1.0,
    poor: 1.0,
    description: 'Banka hesabı direkt tahsilat - fire yok',
  },
  WAGE: {
    good: 0.95,
    normal: 0.90,
    poor: 0.80,
    description: 'Maaş haczi - düzenli ama kısmi tahsilat',
  },
  PENSION: {
    good: 0.95,
    normal: 0.90,
    poor: 0.85,
    description: 'Emekli maaşı - düzenli ama sınırlı',
  },
  TRADE_REGISTRY: {
    good: 0.60,
    normal: 0.45,
    poor: 0.30,
    description: 'Şirket hisseleri - likidite düşük',
  },
  OTHER: {
    good: 0.50,
    normal: 0.40,
    poor: 0.25,
    description: 'Diğer varlıklar - yüksek belirsizlik',
  },
};

// ==================== COST ESTIMATES ====================

/**
 * Masraf türü bazlı tahmini tutarlar
 */
export const COST_ESTIMATES: Record<CostType, {
  minAmount: number;
  maxAmount: number;
  typicalAmount: number;
  isPercentage: boolean;
  percentageBase?: 'GROSS_VALUE' | 'DEBT';
  percentageRate?: number;
}> = {
  YAKALAMA_AVANSI: {
    minAmount: 3000,
    maxAmount: 10000,
    typicalAmount: 5000,
    isPercentage: false,
  },
  SATIS_AVANSI: {
    minAmount: 5000,
    maxAmount: 20000,
    typicalAmount: 10000,
    isPercentage: false,
  },
  BILIRKISI_UCRETI: {
    minAmount: 1500,
    maxAmount: 5000,
    typicalAmount: 2500,
    isPercentage: false,
  },
  ILAN_MASRAFI: {
    minAmount: 1000,
    maxAmount: 5000,
    typicalAmount: 2000,
    isPercentage: false,
  },
  MUHAFAZA_MASRAFI: {
    minAmount: 500,
    maxAmount: 3000,
    typicalAmount: 1000,
    isPercentage: false,
  },
  NAKIL_MASRAFI: {
    minAmount: 500,
    maxAmount: 2000,
    typicalAmount: 1000,
    isPercentage: false,
  },
  HARÇ: {
    minAmount: 0,
    maxAmount: 0,
    typicalAmount: 0,
    isPercentage: true,
    percentageBase: 'GROSS_VALUE',
    percentageRate: 0.0114, // %1.14 satış harcı
  },
  DIGER: {
    minAmount: 500,
    maxAmount: 2000,
    typicalAmount: 1000,
    isPercentage: false,
  },
};

// ==================== DECISION THRESHOLDS ====================

export const DECISION_THRESHOLDS = {
  // GO kararı için minimum ROI
  MIN_ROI_FOR_GO: 1.5,          // Masrafların 1.5 katı net getiri
  
  // NO_GO kararı için maksimum ROI
  MAX_ROI_FOR_NO_GO: 0.5,       // Masrafların yarısından az
  
  // Belirsizlik toleransı
  MAX_UNCERTAINTY_FOR_GO: 0.3,  // %30'dan fazla belirsizlik varsa GO verme
  
  // Minimum net değer (TL)
  MIN_NET_VALUE: 5000,
  
  // Minimum kapsama oranı
  MIN_COVERAGE_RATIO: 0.1,      // En az %10 borç karşılama
  
  // Worst case pozitif olmalı
  REQUIRE_POSITIVE_WORST_CASE: false,
};

// ==================== SIMULATION FUNCTIONS ====================

/**
 * Net getiri simülasyonu çalıştır
 */
export function runRecoverySimulation(input: SimulationInput): SimulationResult {
  // 1. Likidite faktörünü belirle
  const liquidationFactor = input.liquidationFactor ?? 
    getLiquidationFactor(input.assetType, input.marketCondition ?? 'NORMAL');
  
  // 2. Likide edilmiş değer
  const liquidatedValue = input.grossValue * liquidationFactor;
  
  // 3. Ön alacak analizi
  const priorClaimsAnalysis = analyzePriorClaims(input.priorClaims);
  
  // 4. Masraf analizi
  const costsAnalysis = analyzeCosts(input.estimatedCosts, input.grossValue, input.totalDebt);
  
  // 5. Net değer hesapla
  const afterPriorClaims = Math.max(0, liquidatedValue - priorClaimsAnalysis.total);
  const afterCosts = Math.max(0, afterPriorClaims - costsAnalysis.expected);
  const expectedNet = afterCosts;
  
  // 6. Tahsilat analizi
  const remainingDebt = input.totalDebt - input.collectedAmount;
  const coverageRatio = remainingDebt > 0 ? expectedNet / remainingDebt : 1;
  
  // 7. Senaryolar
  const scenarios = calculateScenarios(
    input.grossValue,
    liquidationFactor,
    priorClaimsAnalysis,
    costsAnalysis,
    input.valueConfidence
  );
  
  // 8. Karar
  const decision = makeDecision(
    expectedNet,
    costsAnalysis.expected,
    coverageRatio,
    priorClaimsAnalysis.uncertainty,
    scenarios
  );
  
  // 9. Breakdown
  const breakdown = generateBreakdown(
    input,
    liquidatedValue,
    priorClaimsAnalysis,
    costsAnalysis,
    expectedNet
  );
  
  return {
    grossValue: input.grossValue,
    liquidationFactor,
    liquidatedValue,
    totalPriorClaims: priorClaimsAnalysis.total,
    knownPriorClaims: priorClaimsAnalysis.known,
    unknownPriorClaims: priorClaimsAnalysis.unknown,
    priorClaimsUncertainty: priorClaimsAnalysis.uncertainty,
    totalCosts: costsAnalysis.total,
    fixedCosts: costsAnalysis.fixed,
    variableCosts: costsAnalysis.variable,
    expectedCosts: costsAnalysis.expected,
    afterPriorClaims,
    afterCosts,
    expectedNet,
    remainingDebt,
    coverageRatio,
    scenarios,
    decision,
    breakdown,
  };
}

/**
 * Likidite faktörü getir
 */
export function getLiquidationFactor(
  assetType: AssetType,
  marketCondition: 'GOOD' | 'NORMAL' | 'POOR'
): number {
  const factors = LIQUIDATION_FACTORS[assetType] ?? LIQUIDATION_FACTORS.OTHER;
  return factors[marketCondition.toLowerCase() as 'good' | 'normal' | 'poor'];
}

/**
 * Ön alacak analizi
 */
function analyzePriorClaims(claims: PriorClaim[]): {
  total: number;
  known: number;
  unknown: number;
  uncertainty: number;
  activeClaims: number;
} {
  let known = 0;
  let unknown = 0;
  let activeClaims = 0;
  
  for (const claim of claims) {
    if (!claim.isActive) continue;
    
    activeClaims++;
    
    if (claim.isKnown) {
      known += claim.amount;
    } else {
      unknown += claim.estimatedIfUnknown ?? claim.amount;
    }
  }
  
  const total = known + unknown;
  const uncertainty = total > 0 ? unknown / total : 0;
  
  return { total, known, unknown, uncertainty, activeClaims };
}

/**
 * Masraf analizi
 */
function analyzeCosts(
  costs: CostItem[],
  grossValue: number,
  totalDebt: number
): {
  total: number;
  fixed: number;
  variable: number;
  expected: number;
} {
  let fixed = 0;
  let variable = 0;
  let expected = 0;
  
  for (const cost of costs) {
    let amount = cost.amount;
    
    // Yüzde bazlı masrafları hesapla
    const estimate = COST_ESTIMATES[cost.costType];
    if (estimate?.isPercentage && estimate.percentageRate) {
      const base = estimate.percentageBase === 'GROSS_VALUE' ? grossValue : totalDebt;
      amount = base * estimate.percentageRate;
    }
    
    if (cost.isFixed) {
      fixed += amount;
    } else {
      variable += amount;
    }
    
    expected += amount * cost.probability;
  }
  
  return {
    total: fixed + variable,
    fixed,
    variable,
    expected,
  };
}

/**
 * Senaryoları hesapla
 */
function calculateScenarios(
  grossValue: number,
  liquidationFactor: number,
  priorClaims: { total: number; uncertainty: number },
  costs: { expected: number; total: number },
  valueConfidence: number
): SimulationResult['scenarios'] {
  // Best case: Yüksek değer, düşük ön alacak, düşük masraf
  const bestValue = grossValue * (liquidationFactor + 0.1);
  const bestPrior = priorClaims.total * 0.7;
  const bestCosts = costs.expected * 0.8;
  const bestNet = Math.max(0, bestValue - bestPrior - bestCosts);
  
  // Expected case: Normal değerler
  const expectedValue = grossValue * liquidationFactor;
  const expectedNet = Math.max(0, expectedValue - priorClaims.total - costs.expected);
  
  // Worst case: Düşük değer, yüksek ön alacak, yüksek masraf
  const worstValue = grossValue * (liquidationFactor - 0.15);
  const worstPrior = priorClaims.total * 1.3;
  const worstCosts = costs.total;
  const worstNet = Math.max(0, worstValue - worstPrior - worstCosts);
  
  return {
    best: {
      name: 'En İyi Senaryo',
      probability: 0.2,
      netValue: bestNet,
      roi: bestCosts > 0 ? bestNet / bestCosts : 0,
      description: 'Yüksek satış fiyatı, düşük ön alacak',
    },
    expected: {
      name: 'Beklenen Senaryo',
      probability: 0.6,
      netValue: expectedNet,
      roi: costs.expected > 0 ? expectedNet / costs.expected : 0,
      description: 'Normal piyasa koşulları',
    },
    worst: {
      name: 'En Kötü Senaryo',
      probability: 0.2,
      netValue: worstNet,
      roi: worstCosts > 0 ? worstNet / worstCosts : 0,
      description: 'Düşük satış, yüksek masraf',
    },
  };
}

/**
 * Karar ver
 */
function makeDecision(
  expectedNet: number,
  expectedCosts: number,
  coverageRatio: number,
  uncertainty: number,
  scenarios: SimulationResult['scenarios']
): SimulationDecision {
  const reasoning: string[] = [];
  const blockedActions: string[] = [];
  const requiredConditions: string[] = [];
  
  // ROI hesapla
  const roi = expectedCosts > 0 ? expectedNet / expectedCosts : 0;
  
  // Karar kriterleri
  let score = 0;
  
  // 1. ROI kontrolü
  if (roi >= DECISION_THRESHOLDS.MIN_ROI_FOR_GO) {
    score += 2;
    reasoning.push(`ROI yeterli: ${roi.toFixed(2)}x`);
  } else if (roi <= DECISION_THRESHOLDS.MAX_ROI_FOR_NO_GO) {
    score -= 2;
    reasoning.push(`ROI çok düşük: ${roi.toFixed(2)}x`);
  } else {
    reasoning.push(`ROI orta seviyede: ${roi.toFixed(2)}x`);
  }
  
  // 2. Belirsizlik kontrolü
  if (uncertainty > DECISION_THRESHOLDS.MAX_UNCERTAINTY_FOR_GO) {
    score -= 1;
    reasoning.push(`Belirsizlik yüksek: %${Math.round(uncertainty * 100)}`);
    requiredConditions.push('Ön alacak tutarlarının teyidi');
  }
  
  // 3. Minimum net değer
  if (expectedNet < DECISION_THRESHOLDS.MIN_NET_VALUE) {
    score -= 1;
    reasoning.push(`Net değer düşük: ${expectedNet.toLocaleString('tr-TR')} TL`);
  }
  
  // 4. Kapsama oranı
  if (coverageRatio < DECISION_THRESHOLDS.MIN_COVERAGE_RATIO) {
    score -= 1;
    reasoning.push(`Borç karşılama oranı düşük: %${Math.round(coverageRatio * 100)}`);
  }
  
  // 5. Worst case kontrolü
  if (DECISION_THRESHOLDS.REQUIRE_POSITIVE_WORST_CASE && scenarios.worst.netValue <= 0) {
    score -= 1;
    reasoning.push('En kötü senaryoda zarar riski var');
  }
  
  // Karar
  let recommendation: SimulationDecision['recommendation'];
  let confidence: number;
  
  if (score >= 2) {
    recommendation = 'GO';
    confidence = Math.min(0.9, 0.6 + score * 0.1);
  } else if (score <= -2) {
    recommendation = 'NO_GO';
    confidence = Math.min(0.9, 0.6 + Math.abs(score) * 0.1);
    blockedActions.push('SubmitYakalamaRequest', 'RequestSale', 'PayAdvance');
  } else if (uncertainty > 0.4) {
    recommendation = 'ATTORNEY_DECISION';
    confidence = 0.5;
    reasoning.push('Belirsizlik nedeniyle avukat kararı gerekli');
  } else {
    recommendation = 'CONDITIONAL';
    confidence = 0.6;
  }
  
  return {
    recommendation,
    confidence,
    reasoning,
    blockedActions,
    requiredConditions: requiredConditions.length > 0 ? requiredConditions : undefined,
  };
}

/**
 * Breakdown oluştur
 */
function generateBreakdown(
  input: SimulationInput,
  liquidatedValue: number,
  priorClaims: { total: number; known: number; unknown: number },
  costs: { expected: number; fixed: number; variable: number },
  expectedNet: number
): SimulationBreakdown {
  const valueChain: SimulationBreakdown['valueChain'] = [
    {
      step: 'Brüt Değer',
      value: input.grossValue,
      delta: 0,
      note: `AI tahmini (güven: %${Math.round(input.valueConfidence * 100)})`,
    },
    {
      step: 'Likide Değer',
      value: liquidatedValue,
      delta: liquidatedValue - input.grossValue,
      note: 'İcra satış firesi',
    },
    {
      step: 'Ön Alacaklar Sonrası',
      value: Math.max(0, liquidatedValue - priorClaims.total),
      delta: -priorClaims.total,
      note: `${priorClaims.known.toLocaleString('tr-TR')} TL bilinen, ${priorClaims.unknown.toLocaleString('tr-TR')} TL tahmini`,
    },
    {
      step: 'Masraflar Sonrası',
      value: expectedNet,
      delta: -costs.expected,
      note: `${costs.fixed.toLocaleString('tr-TR')} TL sabit, ${costs.variable.toLocaleString('tr-TR')} TL değişken`,
    },
  ];
  
  const riskFactors: SimulationBreakdown['riskFactors'] = [];
  
  // Haciz sırası
  if (input.ourLienRank) {
    riskFactors.push({
      factor: 'Haciz Sırası',
      impact: input.ourLienRank === 1 ? 'POSITIVE' : input.ourLienRank <= 3 ? 'NEUTRAL' : 'NEGATIVE',
      weight: 0.3,
      description: `${input.ourLienRank}. sırada`,
    });
  }
  
  // Değer güveni
  riskFactors.push({
    factor: 'Değerleme Güveni',
    impact: input.valueConfidence >= 0.8 ? 'POSITIVE' : input.valueConfidence >= 0.6 ? 'NEUTRAL' : 'NEGATIVE',
    weight: 0.2,
    description: `%${Math.round(input.valueConfidence * 100)} güven`,
  });
  
  // Ön alacak belirsizliği
  const priorUncertainty = priorClaims.total > 0 ? priorClaims.unknown / priorClaims.total : 0;
  riskFactors.push({
    factor: 'Ön Alacak Belirsizliği',
    impact: priorUncertainty <= 0.2 ? 'POSITIVE' : priorUncertainty <= 0.4 ? 'NEUTRAL' : 'NEGATIVE',
    weight: 0.25,
    description: `%${Math.round(priorUncertainty * 100)} bilinmiyor`,
  });
  
  // Satış süresi
  if (input.timeToSaleMonths) {
    riskFactors.push({
      factor: 'Tahmini Satış Süresi',
      impact: input.timeToSaleMonths <= 6 ? 'POSITIVE' : input.timeToSaleMonths <= 12 ? 'NEUTRAL' : 'NEGATIVE',
      weight: 0.15,
      description: `~${input.timeToSaleMonths} ay`,
    });
  }
  
  return { valueChain, riskFactors };
}

/**
 * Hızlı go/no-go kontrolü
 */
export function quickGoNoGo(
  grossValue: number,
  assetType: AssetType,
  priorClaimsTotal: number,
  estimatedCosts: number
): { go: boolean; reason: string } {
  const liquidationFactor = getLiquidationFactor(assetType, 'NORMAL');
  const liquidatedValue = grossValue * liquidationFactor;
  const afterPrior = liquidatedValue - priorClaimsTotal;
  const net = afterPrior - estimatedCosts;
  
  if (net <= 0) {
    return { go: false, reason: 'Net değer negatif' };
  }
  
  const roi = net / estimatedCosts;
  
  if (roi < DECISION_THRESHOLDS.MAX_ROI_FOR_NO_GO) {
    return { go: false, reason: `ROI çok düşük: ${roi.toFixed(2)}x` };
  }
  
  if (roi >= DECISION_THRESHOLDS.MIN_ROI_FOR_GO) {
    return { go: true, reason: `ROI yeterli: ${roi.toFixed(2)}x` };
  }
  
  return { go: true, reason: 'Orta seviye ROI - dikkatli ilerle' };
}

/**
 * Masraf tahmini oluştur
 */
export function estimateCostsForAsset(
  assetType: AssetType,
  grossValue: number,
  totalDebt: number
): CostItem[] {
  const costs: CostItem[] = [];
  
  switch (assetType) {
    case 'VEHICLE':
      costs.push(
        { costType: 'YAKALAMA_AVANSI', amount: COST_ESTIMATES.YAKALAMA_AVANSI.typicalAmount, isFixed: true, probability: 1 },
        { costType: 'MUHAFAZA_MASRAFI', amount: COST_ESTIMATES.MUHAFAZA_MASRAFI.typicalAmount, isFixed: false, probability: 0.8 },
        { costType: 'BILIRKISI_UCRETI', amount: COST_ESTIMATES.BILIRKISI_UCRETI.typicalAmount, isFixed: true, probability: 1 },
        { costType: 'ILAN_MASRAFI', amount: COST_ESTIMATES.ILAN_MASRAFI.typicalAmount, isFixed: true, probability: 1 },
        { costType: 'HARÇ', amount: grossValue * 0.0114, isFixed: true, probability: 1 }
      );
      break;
      
    case 'REAL_ESTATE':
      costs.push(
        { costType: 'SATIS_AVANSI', amount: COST_ESTIMATES.SATIS_AVANSI.typicalAmount, isFixed: true, probability: 1 },
        { costType: 'BILIRKISI_UCRETI', amount: COST_ESTIMATES.BILIRKISI_UCRETI.maxAmount, isFixed: true, probability: 1 },
        { costType: 'ILAN_MASRAFI', amount: COST_ESTIMATES.ILAN_MASRAFI.maxAmount, isFixed: true, probability: 1 },
        { costType: 'HARÇ', amount: grossValue * 0.0114, isFixed: true, probability: 1 }
      );
      break;
      
    case 'BANK_ACCOUNT':
      // Banka haczi düşük masraflı
      costs.push(
        { costType: 'HARÇ', amount: 100, isFixed: true, probability: 1 }
      );
      break;
      
    default:
      costs.push(
        { costType: 'DIGER', amount: COST_ESTIMATES.DIGER.typicalAmount, isFixed: false, probability: 0.5 }
      );
  }
  
  return costs;
}
