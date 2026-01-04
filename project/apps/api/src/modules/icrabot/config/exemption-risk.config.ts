/**
 * EXEMPTION RISK CONFIG v11
 * 
 * Haczedilmezlik/istisna risk motoru konfigürasyonu.
 * haczedilmezlik_risk_v11.yaml'dan implement edilmiştir.
 * 
 * Amaç: Bot haciz önerirken "hukuki risk" uyarısı da üretsin.
 */

// ==================== TYPES ====================

export type AssetType = 
  | 'vehicle' 
  | 'salary' 
  | 'bank_account' 
  | 'household' 
  | 'tools_of_trade' 
  | 'real_estate';

export interface DebtorProfile {
  isSmallTrader: boolean | null;
  hasMinimumLivelihoodClaim: boolean | null;
  salaryOnlyIncome: boolean | null;
}

export interface ExemptionParams {
  enabled: boolean;
  riskThresholdHigh: number;
}

export interface ExemptionRule {
  id: string;
  assetType: AssetType;
  condition: string;
  risk: number;
  note: string;
}

export interface ExemptionRiskResult {
  score: number;
  note: string;
  ruleId: string | null;
}

// ==================== CONFIG ====================

export const EXEMPTION_PARAMS: ExemptionParams = {
  enabled: true,
  riskThresholdHigh: 80,
};

// ==================== RULES ====================

export const EXEMPTION_RULES: ExemptionRule[] = [
  {
    id: 'EX1_TOOLS_OF_TRADE',
    assetType: 'tools_of_trade',
    condition: 'debtor_profile.is_small_trader == true',
    risk: 85,
    note: 'Mesleki araç-gereç haczedilmezlik iddiası riski yüksek.',
  },
  {
    id: 'EX2_SALARY_LIMITS',
    assetType: 'salary',
    condition: 'debtor_profile.salary_only_income == true',
    risk: 75,
    note: 'Ücret haczinde oran/sınır itirazı riski.',
  },
  {
    id: 'EX3_HOUSEHOLD_MINIMUM',
    assetType: 'household',
    condition: 'debtor_profile.has_minimum_livelihood_claim == true',
    risk: 80,
    note: 'Zaruri ev eşyası haczedilmezlik iddiası.',
  },
];

// ==================== CALCULATOR ====================

/**
 * Haczedilmezlik riskini hesapla
 */
export function computeExemptionRisk(
  assetType: AssetType,
  debtorProfile: DebtorProfile
): ExemptionRiskResult {
  // Varsayılan düşük risk
  let result: ExemptionRiskResult = {
    score: 0,
    note: 'Haczedilmezlik riski düşük.',
    ruleId: null,
  };
  
  // EX1: Mesleki araç-gereç
  if (assetType === 'tools_of_trade' && debtorProfile.isSmallTrader === true) {
    return {
      score: 85,
      note: 'Mesleki araç-gereç haczedilmezlik iddiası riski yüksek.',
      ruleId: 'EX1_TOOLS_OF_TRADE',
    };
  }
  
  // EX2: Ücret haczi
  if (assetType === 'salary' && debtorProfile.salaryOnlyIncome === true) {
    return {
      score: 75,
      note: 'Ücret haczinde oran/sınır itirazı riski.',
      ruleId: 'EX2_SALARY_LIMITS',
    };
  }
  
  // EX3: Ev eşyası
  if (assetType === 'household' && debtorProfile.hasMinimumLivelihoodClaim === true) {
    return {
      score: 80,
      note: 'Zaruri ev eşyası haczedilmezlik iddiası.',
      ruleId: 'EX3_HOUSEHOLD_MINIMUM',
    };
  }
  
  // Araç için düşük risk (genelde haczedilebilir)
  if (assetType === 'vehicle') {
    return {
      score: 20,
      note: 'Araç genellikle haczedilebilir.',
      ruleId: null,
    };
  }
  
  // Gayrimenkul için düşük risk
  if (assetType === 'real_estate') {
    return {
      score: 15,
      note: 'Gayrimenkul genellikle haczedilebilir (haline münasip mesken hariç).',
      ruleId: null,
    };
  }
  
  // Banka hesabı için orta risk
  if (assetType === 'bank_account') {
    return {
      score: 40,
      note: 'Banka hesabında asgari geçim indirimi itirazı olabilir.',
      ruleId: null,
    };
  }
  
  return result;
}

/**
 * Risk yüksek mi kontrol et
 */
export function isHighExemptionRisk(
  score: number,
  params: ExemptionParams = EXEMPTION_PARAMS
): boolean {
  return score >= params.riskThresholdHigh;
}
