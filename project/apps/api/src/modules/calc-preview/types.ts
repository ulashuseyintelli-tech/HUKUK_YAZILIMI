/**
 * Calc Preview Types
 * 
 * Unified preview endpoint için tip tanımları.
 * Tek request, tek response, tek versiyon seti.
 * 
 * @see docs/single-source-of-truth-architecture.md - Phase 3
 */

import { InterestTypeCode } from '../interest-engine/types/domain.types';

// ============================================================================
// REQUEST
// ============================================================================

export interface CalcPreviewRequest {
  // Tenant (GÜVENLİK - cache isolation için ZORUNLU)
  tenantId?: string;
  
  // Interest params
  principalAmount: number;
  currency?: string;
  interestType: InterestTypeCode;
  startDate: string;
  endDate: string;
  fixedRate?: number;
  
  // Fee params
  caseType?: string;
  debtorCount?: number;
  
  // Options
  skipInterest?: boolean;
  skipFee?: boolean;
  skipPolicy?: boolean;
}

// ============================================================================
// RESPONSE
// ============================================================================

export type CalcPreviewStatus = 'FULL' | 'PARTIAL' | 'UNAVAILABLE';

export interface InterestPreviewData {
  estimatedInterest: number;
  currentRate: number;
  days: number;
  interestType: InterestTypeCode;
  // Phase 3.1.1: Detaylı breakdown
  preEnforcementInterest?: number;
  postEnforcementInterest?: number;
  // Phase 3.1.1: Segment detayları
  segments?: Array<{
    startDate: string;
    endDate: string;
    days: number;
    annualRatePct: number;
    principal: number;
    interest: number;
    phase?: 'PRE_ENFORCEMENT' | 'POST_ENFORCEMENT';
    rateSource?: string;
  }>;
  segmentsMeta?: {
    total: number;
    returned: number;
    truncated: boolean;
  };
  // Phase 3.1.1: Coverage bilgisi
  coverage?: {
    percent: number;
    totalDays: number;
    coveredDays: number;
    hasGaps: boolean;
    hasOverlaps: boolean;
  };
}

export interface FeePreviewData {
  estimatedFees: number;
  estimatedAttorneyFee: number;
  tariffYear: number;
  breakdown: {
    basvurmaHarci: number;
    vekaletHarci: number;
    pesinHarc: number;
    dosyaGideri: number;
    tebligatGideri: number;
    vekaletPulu: number;
  };
}

/**
 * Policy preview - soft gate kontrolü
 * Blocking değil, sadece uyarı
 */
export interface PolicyPreviewData {
  /** Geçen gate'ler */
  passedGates: string[];
  /** Soft uyarı veren gate'ler (blocking değil) */
  softWarnings: PolicySoftWarning[];
  /** Policy engine version */
  policyVersion: string;
}

export interface PolicySoftWarning {
  gateCode: string;
  message: string;
  severity: 'info' | 'warning';
  /** Kullanıcıya önerilen aksiyon */
  suggestion?: string;
}

export interface CalcPreviewVersions {
  /** Engine version - TEK versiyon, mismatch OLMAZ */
  engineVersion: string;
  /** Rule version - TEK versiyon */
  ruleVersion: string;
  /** Rate table version (interest için) */
  rateTableVersion?: string;
  /** Tariff version (fee için) */
  tariffVersion?: string;
  /** Tariff year */
  tariffYear?: number;
  /** Policy version */
  policyVersion?: string;
}

export interface CalcPreviewError {
  domain: 'interest' | 'fee' | 'validation' | 'policy';
  code: string;
  message: string;
}

export interface CalcPreviewWarning {
  domain: 'interest' | 'fee' | 'coordinator' | 'policy';
  code: string;
  message: string;
  severity: 'warning' | 'info';
}

/**
 * UX Guidance - UI'ın ne yapması gerektiğini backend belirler
 */
export interface UxGuidance {
  /** Bu sonuç blocking mi? (Save engellensin mi?) */
  blocking: boolean;
  /** Önerilen sonraki adım */
  recommendedAction: 'PROCEED' | 'RETRY' | 'CHECK_INPUT' | 'CONTACT_SUPPORT' | 'WAIT';
  /** Retry öneriliyorsa kaç ms sonra */
  retryAfterMs?: number;
  /** Kullanıcıya gösterilecek mesaj */
  userMessage?: string;
}

export interface CalcPreviewResponse {
  success: boolean;
  status: CalcPreviewStatus;
  
  // Data
  interest?: InterestPreviewData;
  fee?: FeePreviewData;
  policy?: PolicyPreviewData;
  
  // Unified versions - TEK SET, mismatch OLMAZ
  versions: CalcPreviewVersions;
  
  // Errors & warnings
  errors: CalcPreviewError[];
  warnings: CalcPreviewWarning[];
  
  // UX Guidance - UI semantiği backend'den gelir
  uxGuidance: UxGuidance;
  
  // Cache info
  cached: boolean;
  cacheExpiry?: string;
  /** Cache key (version-pinned) */
  cacheKey?: string;
  
  // Trace
  requestHash: string;
  timestamp: string;
}
