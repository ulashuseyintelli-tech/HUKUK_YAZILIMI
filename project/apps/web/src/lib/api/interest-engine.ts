import { apiClient } from './client';

// ============================================================================
// TYPES
// ============================================================================

export enum InterestTypeCode {
  // ═══════════════════════════════════════════════════════════════════════════
  // YASAL FAİZ (3095 sayılı Kanun m.1)
  // Not: Nadiren değişir - 2006-2024: %9, 2024+: %24
  // ═══════════════════════════════════════════════════════════════════════════
  LEGAL_3095 = 'LEGAL_3095', // Yasal faiz - adi alacaklar için
  
  // ═══════════════════════════════════════════════════════════════════════════
  // TİCARİ TEMERRÜT FAİZİ (3095 sayılı Kanun m.2/2)
  // Not: TCMB avans oranına bağlı, sık değişir
  // ═══════════════════════════════════════════════════════════════════════════
  COMMERCIAL_AVANS_3095_2_2 = 'COMMERCIAL_AVANS_3095_2_2', // Ticari temerrüt (TCMB Avans) - değişen oran
  COMMERCIAL_FIXED = 'COMMERCIAL_FIXED', // Ticari (Sabit) - kullanıcının girdiği sabit oran
  
  // ═══════════════════════════════════════════════════════════════════════════
  // DİĞER FAİZ TÜRLERİ
  // ═══════════════════════════════════════════════════════════════════════════
  TTK_1530 = 'TTK_1530', // Geç ödeme faizi - TTK 1530
  CONTRACTUAL = 'CONTRACTUAL', // Sözleşmesel faiz (akdi faiz)
  
  // ═══════════════════════════════════════════════════════════════════════════
  // MEVDUAT FAİZLERİ
  // ═══════════════════════════════════════════════════════════════════════════
  MEVDUAT_TL_BANKALARCA = 'MEVDUAT_TL_BANKALARCA',
  MEVDUAT_USD_BANKALARCA = 'MEVDUAT_USD_BANKALARCA',
  MEVDUAT_EUR_BANKALARCA = 'MEVDUAT_EUR_BANKALARCA',
  MEVDUAT_TL_KAMU = 'MEVDUAT_TL_KAMU',
  MEVDUAT_USD_KAMU = 'MEVDUAT_USD_KAMU',
  MEVDUAT_EUR_KAMU = 'MEVDUAT_EUR_KAMU',
}

export enum RateSourceType {
  TCMB = 'TCMB',
  RESMI_GAZETE = 'RESMI_GAZETE',
  CONTRACT = 'CONTRACT',
}

export interface RateEntry {
  id: string;
  interestType: InterestTypeCode;
  validFrom: string;
  validTo?: string | null;
  annualRate: number;
  source: RateSourceType;
  sourceReference?: string;
  versionHash: string;
  createdAt: string;
  createdBy?: string;
}

export interface PrincipalItem {
  id: string;
  amount: number;
  currency: string;
  startDate: string;
  interestType: InterestTypeCode;
  dayCountBasis?: 365 | 360;
  compounding?: boolean;
  description?: string;
  ibrazTarihi?: string;
  vadeTarihi?: string;
  fixedRate?: number; // For COMMERCIAL_FIXED, CONTRACTUAL (e.g., 0.48 for %48)
}

export interface Payment {
  id: string;
  date: string;
  amount: number;
  currency: string;
  source?: string;
}

export interface InterestCalculationRequest {
  caseId: string;
  principalItems: PrincipalItem[];
  payments?: Payment[];
  asOfDate: string;
  options?: {
    includeKarsilisizCekTazminati?: boolean;
    skipPolicyGate?: boolean;
  };
}

export interface InterestSegment {
  principalItemId: string;
  periodStart: string;
  periodEnd: string;
  days: number;
  rate: number;
  rateId: string;
  rateSource: string;
  principal: number;
  segmentInterest: number;
  /** Segment türü: takip öncesi mi sonrası mı */
  phase?: 'PRE_ENFORCEMENT' | 'POST_ENFORCEMENT';
}

export interface PolicyWarning {
  code: string;
  severity: 'ERROR' | 'WARNING' | 'INFO';
  message: string;
  suggestion?: string;
  field?: string;
}

export interface AllocationCategory {
  category: 'INTEREST' | 'COSTS' | 'ANCILLARY' | 'PRINCIPAL';
  label: string;
  amountBefore: number;
  amountAllocated: number;
  amountAfter: number;
}

export interface PaymentAllocationResult {
  paymentId: string;
  paymentDate: string;
  paymentAmount: number;
  allocations: AllocationCategory[];
  remainingPayment: number;
  newPrincipal: number;
}

export interface InterestCalculationResult {
  caseId: string;
  calculatedAt: string;
  asOfDate: string;
  segments: InterestSegment[];
  totalInterest: number;
  totalDue: number;
  paymentAllocations?: PaymentAllocationResult[];
  policyWarnings: PolicyWarning[];
  auditLogId: string;
  legalText: string;
  /** Takip öncesi faiz (vade/ibraz → takip tarihi) */
  preEnforcementInterest?: number;
  /** Takip sonrası faiz (takip tarihi → hesap tarihi) */
  postEnforcementInterest?: number;
  /** Takip tarihi (caseDate) */
  enforcementDate?: string;
}

export interface RateQueryResult {
  rates: RateEntry[];
  hasGaps: boolean;
  gaps?: { from: string; to: string }[];
}

export interface InterestAuditLog {
  id: string;
  caseId: string;
  tenantId: string;
  calculatedAt: string;
  asOfDate: string;
  request: InterestCalculationRequest;
  result: InterestCalculationResult;
  segments: InterestSegment[];
  rateVersionHashes: string[];
  createdBy?: string;
}

// ============================================
// PREVIEW TYPES (Lightweight, no audit)
// ============================================

export interface InterestPreviewRequest {
  principalAmount: number;
  currency?: string;
  interestType: InterestTypeCode;
  startDate: string;
  endDate: string;
  fixedRate?: number;
}

export interface InterestPreviewResponse {
  success: boolean;
  data?: {
    estimatedInterest: number;
    currentRate: number;
    days: number;
    interestType: InterestTypeCode;
  };
  error?: {
    code: 'RATE_NOT_FOUND' | 'SERVICE_UNAVAILABLE' | 'INVALID_INPUT' | 'INVALID_DATE_RANGE';
    message: string;
  };
  cached: boolean;
  cacheExpiry?: string;
}

// ============================================================================
// API FUNCTIONS
// ============================================================================

export const interestEngineApi = {
  /**
   * Preview interest calculation (lightweight, no audit)
   * 
   * Frontend form preview için kullanılır.
   * API erişilemezse { success: false } döner - TAHMİN YAPILMAZ.
   * 
   * @see docs/single-source-of-truth-architecture.md
   */
  preview: async (request: InterestPreviewRequest): Promise<InterestPreviewResponse> => {
    try {
      const response = await apiClient.post('/interest-engine/preview', request);
      return response.data;
    } catch (error) {
      console.error('[interestEngineApi.preview] Error:', error);
      return {
        success: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Faiz hesaplama servisi şu an erişilemiyor',
        },
        cached: false,
      };
    }
  },

  /**
   * Calculate interest for given principal items
   */
  calculate: async (request: InterestCalculationRequest): Promise<InterestCalculationResult> => {
    const response = await apiClient.post('/interest-engine/calculate', request);
    return response.data;
  },

  /**
   * Calculate interest for an existing case
   */
  calculateForCase: async (caseId: string, asOfDate: string): Promise<InterestCalculationResult> => {
    const response = await apiClient.post(
      `/interest-engine/calculate/${caseId}?asOfDate=${asOfDate}`
    );
    return response.data;
  },

  /**
   * Get calculation history for a case
   */
  getHistory: async (caseId: string): Promise<InterestCalculationResult[]> => {
    const response = await apiClient.get(`/interest-engine/history/${caseId}`);
    return response.data;
  },

  /**
   * Get rates for a period
   */
  getRates: async (
    type: InterestTypeCode,
    from: string,
    to: string
  ): Promise<RateQueryResult> => {
    const queryParams = new URLSearchParams({ type, from, to }).toString();
    const response = await apiClient.get(`/interest-engine/rates?${queryParams}`);
    return response.data;
  },

  /**
   * Get current rate for an interest type
   */
  getCurrentRate: async (type: InterestTypeCode): Promise<RateEntry | null> => {
    const response = await apiClient.get(`/interest-engine/rates/current/${type}`);
    return response.data;
  },

  /**
   * Add a new rate entry
   */
  addRate: async (entry: {
    interestType: InterestTypeCode;
    validFrom: string;
    validTo?: string;
    annualRate: number;
    source: RateSourceType;
    sourceRef?: string;
  }): Promise<RateEntry> => {
    const response = await apiClient.post('/interest-engine/rates', entry);
    return response.data;
  },

  /**
   * Sync rates from TCMB
   */
  syncTcmb: async (): Promise<{ added: number }> => {
    const response = await apiClient.post('/interest-engine/rates/sync-tcmb');
    return response.data;
  },

  /**
   * Seed historical rates
   */
  seedRates: async (): Promise<{ added: number }> => {
    const response = await apiClient.post('/interest-engine/rates/seed');
    return response.data;
  },

  /**
   * Get a specific audit log
   */
  getAuditLog: async (logId: string): Promise<InterestAuditLog | null> => {
    const response = await apiClient.get(`/interest-engine/audit/${logId}`);
    return response.data;
  },

  /**
   * Get flagged logs for review
   */
  getFlaggedLogs: async (): Promise<InterestAuditLog[]> => {
    const response = await apiClient.get('/interest-engine/audit/flagged');
    return response.data;
  },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get human-readable interest type label
 */
export function getInterestTypeLabel(type: InterestTypeCode): string {
  const labels: Record<InterestTypeCode, string> = {
    [InterestTypeCode.LEGAL_3095]: 'Yasal Faiz (%9 / %24)',
    [InterestTypeCode.COMMERCIAL_AVANS_3095_2_2]: 'Ticari Temerrüt - TCMB Avans (Değişen)',
    [InterestTypeCode.COMMERCIAL_FIXED]: 'Ticari - Sabit Oran',
    [InterestTypeCode.TTK_1530]: 'Geç Ödeme (TTK 1530)',
    [InterestTypeCode.CONTRACTUAL]: 'Akdi Faiz (Sözleşme)',
    [InterestTypeCode.MEVDUAT_TL_BANKALARCA]: 'Mevduat TL (Bankalar)',
    [InterestTypeCode.MEVDUAT_USD_BANKALARCA]: 'Mevduat USD (Bankalar)',
    [InterestTypeCode.MEVDUAT_EUR_BANKALARCA]: 'Mevduat EUR (Bankalar)',
    [InterestTypeCode.MEVDUAT_TL_KAMU]: 'Mevduat TL (Kamu)',
    [InterestTypeCode.MEVDUAT_USD_KAMU]: 'Mevduat USD (Kamu)',
    [InterestTypeCode.MEVDUAT_EUR_KAMU]: 'Mevduat EUR (Kamu)',
  };
  return labels[type] || type;
}

/**
 * Get short label for interest type (for UI badges)
 */
export function getInterestTypeShortLabel(type: InterestTypeCode): string {
  const labels: Record<InterestTypeCode, string> = {
    [InterestTypeCode.LEGAL_3095]: 'Yasal',
    [InterestTypeCode.COMMERCIAL_AVANS_3095_2_2]: 'Ticari (Değişen)',
    [InterestTypeCode.COMMERCIAL_FIXED]: 'Ticari (Sabit)',
    [InterestTypeCode.TTK_1530]: 'TTK 1530',
    [InterestTypeCode.CONTRACTUAL]: 'Akdi',
    [InterestTypeCode.MEVDUAT_TL_BANKALARCA]: 'Mevduat TL',
    [InterestTypeCode.MEVDUAT_USD_BANKALARCA]: 'Mevduat USD',
    [InterestTypeCode.MEVDUAT_EUR_BANKALARCA]: 'Mevduat EUR',
    [InterestTypeCode.MEVDUAT_TL_KAMU]: 'Mevduat TL (K)',
    [InterestTypeCode.MEVDUAT_USD_KAMU]: 'Mevduat USD (K)',
    [InterestTypeCode.MEVDUAT_EUR_KAMU]: 'Mevduat EUR (K)',
  };
  return labels[type] || type;
}

/**
 * Check if interest type uses variable rates (TCMB table)
 */
export function isVariableRateType(type: InterestTypeCode): boolean {
  return [
    InterestTypeCode.LEGAL_3095,
    InterestTypeCode.COMMERCIAL_AVANS_3095_2_2,
    InterestTypeCode.TTK_1530,
    InterestTypeCode.MEVDUAT_TL_BANKALARCA,
    InterestTypeCode.MEVDUAT_USD_BANKALARCA,
    InterestTypeCode.MEVDUAT_EUR_BANKALARCA,
    InterestTypeCode.MEVDUAT_TL_KAMU,
    InterestTypeCode.MEVDUAT_USD_KAMU,
    InterestTypeCode.MEVDUAT_EUR_KAMU,
  ].includes(type);
}

/**
 * Sabit oran girişi gerektiren faiz türü mü?
 * E-G2a/Q5: TEK OTORİTE = packages/types. Yerel kopya KALDIRILDI → re-export.
 * (packages/types.requiresFixedRate param'ı `InterestTypeCode | string` olduğundan bu
 *  dosyanın yerel InterestTypeCode enum değerleri de cast'siz geçer.)
 */
export { requiresFixedRate } from '@shared/types';

/**
 * Format rate as percentage
 */
export function formatRate(rate: number): string {
  return `%${(rate * 100).toFixed(2)}`;
}

/**
 * Format currency amount
 */
export function formatCurrency(amount: number, currency = 'TRY'): string {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency,
  }).format(amount);
}

/**
 * Get severity color for policy warning
 */
export function getWarningSeverityColor(severity: PolicyWarning['severity']): string {
  switch (severity) {
    case 'ERROR':
      return 'text-red-600';
    case 'WARNING':
      return 'text-yellow-600';
    case 'INFO':
      return 'text-blue-600';
    default:
      return 'text-gray-600';
  }
}
