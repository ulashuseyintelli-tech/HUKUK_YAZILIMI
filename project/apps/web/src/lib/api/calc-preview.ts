/**
 * Calc Preview API Client
 * 
 * Unified preview endpoint için API client.
 * Tek request, tek response, tek versiyon seti.
 * 
 * @see docs/single-source-of-truth-architecture.md - Phase 3
 */

import { apiClient } from './client';
import { InterestTypeCode } from './interest-engine';

// ============================================================================
// TYPES
// ============================================================================

export type CalcPreviewStatus = 'FULL' | 'PARTIAL' | 'UNAVAILABLE';

export interface CalcPreviewRequest {
  // Tenant (GÜVENLİK - cache isolation için)
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

export interface InterestPreviewData {
  estimatedInterest: number;
  currentRate: number;
  days: number;
  interestType: InterestTypeCode;
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

export interface PolicySoftWarning {
  gateCode: string;
  message: string;
  severity: 'info' | 'warning';
  suggestion?: string;
}

export interface PolicyPreviewData {
  passedGates: string[];
  softWarnings: PolicySoftWarning[];
  policyVersion: string;
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
  
  // UX Guidance
  uxGuidance: UxGuidance;
  
  // Cache info
  cached: boolean;
  cacheExpiry?: string;
  cacheKey?: string;
  
  // Trace
  requestHash: string;
  timestamp: string;
}

// ============================================================================
// API CLIENT
// ============================================================================

export const calcPreviewApi = {
  /**
   * Unified preview - interest + fee + policy tek request'te
   * 
   * API erişilemezse { success: false, status: 'UNAVAILABLE' } döner.
   * TAHMİN YAPILMAZ.
   * 
   * @see docs/single-source-of-truth-architecture.md
   */
  preview: async (request: CalcPreviewRequest): Promise<CalcPreviewResponse> => {
    try {
      const response = await apiClient.post('/calc/preview/light', request);
      return response.data;
    } catch (error) {
      console.error('[calcPreviewApi.preview] Error:', error);
      return {
        success: false,
        status: 'UNAVAILABLE',
        versions: {
          engineVersion: 'unknown',
          ruleVersion: 'unknown',
        },
        errors: [{
          domain: 'validation',
          code: 'SERVICE_UNAVAILABLE',
          message: 'Hesaplama servisi şu an erişilemiyor',
        }],
        warnings: [],
        uxGuidance: {
          blocking: false,
          recommendedAction: 'RETRY',
          retryAfterMs: 3000,
          userMessage: 'Servis geçici olarak erişilemiyor, lütfen tekrar deneyin',
        },
        cached: false,
        requestHash: '',
        timestamp: new Date().toISOString(),
      };
    }
  },

  /**
   * Health check
   */
  health: async (): Promise<{ status: string; timestamp: string; version: string } | null> => {
    try {
      const response = await apiClient.get('/calc/health');
      return response.data;
    } catch {
      return null;
    }
  },
};

export default calcPreviewApi;
