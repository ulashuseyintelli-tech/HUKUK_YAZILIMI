'use client';

import { useState, useCallback } from 'react';
import { api } from '@/lib/api';

// ============================================
// TİPLER
// ============================================

export type LimitationLevel = 'GREEN' | 'YELLOW' | 'RED' | 'UNKNOWN';

export interface LimitationStatus {
  level: LimitationLevel;
  ruleCode: string;
  ruleName: string;
  expiryDate: string | null;
  daysLeft: number | null;
  years: number | null;
  baseStartDate: string | null;
  legalBasis: string;
  message: string;
}

export interface LimitationCheckResult {
  status: LimitationStatus;
  shouldShowModal: boolean;
  modalType: 'YELLOW' | 'RED' | null;
  modalTitle?: string;
  modalMessage?: string;
  suggestions?: string[];
}

export interface EnforcementRecommendation {
  type: string;
  typeName: string;
  score: number;
  limitationStatus: LimitationStatus;
  isRecommended: boolean;
  message?: string;
}

export interface CheckLimitationParams {
  caseType: string;
  claimTypeCode?: string;
  startDate?: string | Date;
  instrumentType?: string;
  role?: string;
  lastInterruptionDate?: string | Date;
}

export interface RecommendEnforcementParams {
  hasJudgment?: boolean;
  judgmentDate?: string | Date;
  hasInstrument?: boolean;
  instrumentType?: string;
  instrumentStartDate?: string | Date;
  generalStartDate?: string | Date;
  role?: string;
}

// ============================================
// HOOK
// ============================================

export function useLimitationCheck() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LimitationCheckResult | null>(null);
  const [recommendations, setRecommendations] = useState<EnforcementRecommendation[]>([]);

  /**
   * Zamanaşımı kontrolü yap
   */
  const checkLimitation = useCallback(async (params: CheckLimitationParams): Promise<LimitationCheckResult | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await api.post<LimitationCheckResult>('/limitation-engine/check', {
        caseType: params.caseType,
        claimTypeCode: params.claimTypeCode,
        startDate: params.startDate instanceof Date 
          ? params.startDate.toISOString() 
          : params.startDate,
        instrumentType: params.instrumentType,
        role: params.role,
        lastInterruptionDate: params.lastInterruptionDate instanceof Date
          ? params.lastInterruptionDate.toISOString()
          : params.lastInterruptionDate,
      });

      setResult(response.data);
      return response.data;
    } catch (err: any) {
      const message = err.message || 'Zamanaşımı kontrolü yapılamadı';
      setError(message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Takip türü önerisi al
   */
  const getRecommendations = useCallback(async (params: RecommendEnforcementParams): Promise<EnforcementRecommendation[]> => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await api.post<{ recommendations: EnforcementRecommendation[] }>('/limitation-engine/recommend', {
        hasJudgment: params.hasJudgment,
        judgmentDate: params.judgmentDate instanceof Date
          ? params.judgmentDate.toISOString()
          : params.judgmentDate,
        hasInstrument: params.hasInstrument,
        instrumentType: params.instrumentType,
        instrumentStartDate: params.instrumentStartDate instanceof Date
          ? params.instrumentStartDate.toISOString()
          : params.instrumentStartDate,
        generalStartDate: params.generalStartDate instanceof Date
          ? params.generalStartDate.toISOString()
          : params.generalStartDate,
        role: params.role,
      });

      setRecommendations(response.data.recommendations);
      return response.data.recommendations;
    } catch (err: any) {
      const message = err.message || 'Takip türü önerisi alınamadı';
      setError(message);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Risk logunu kaydet
   */
  const logRisk = useCallback(async (params: {
    caseId?: string;
    claimTypeCode: string;
    role?: string;
    startDateInput?: string;
    level: LimitationLevel;
    ackAction: 'PROCEED' | 'BACK';
  }) => {
    try {
      await api.post('/limitation-engine/log-risk', params);
    } catch (err) {
      console.error('Risk log kaydedilemedi:', err);
    }
  }, []);

  /**
   * Sonuçları temizle
   */
  const reset = useCallback(() => {
    setResult(null);
    setRecommendations([]);
    setError(null);
  }, []);

  return {
    isLoading,
    error,
    result,
    recommendations,
    checkLimitation,
    getRecommendations,
    logRisk,
    reset,
  };
}

// ============================================
// YARDIMCI FONKSİYONLAR
// ============================================

/**
 * Alacak türü kodunu takip türünden çıkar
 */
export function inferClaimTypeCode(
  caseType: string,
  instrumentType?: string,
  role?: string
): string {
  // Kambiyo takibi
  if (caseType === 'KAMBIYO') {
    if (instrumentType === 'CEK') {
      return role === 'CIRANTA' ? 'KAMB_CEK_CIRANTA' : 'KAMB_CEK_KESIDECI';
    }
    if (instrumentType === 'BONO' || instrumentType === 'SENET') {
      return role === 'CIRANTA' ? 'KAMB_BONO_CIRANTA' : 'KAMB_BONO_ASIL';
    }
    return 'KAMB_BONO_ASIL';
  }

  // İlamlı takip
  if (caseType === 'ILAMLI') {
    return 'ILAM_10';
  }

  // Kira takibi
  if (caseType === 'KIRA' || caseType === 'TAHLIYE') {
    return 'TBK_5_KIRA';
  }

  // Genel ilamsız
  return 'TBK_10';
}

/**
 * Zamanaşımı seviyesine göre renk döndür
 */
export function getLimitationLevelColor(level: LimitationLevel): string {
  switch (level) {
    case 'GREEN': return '#22c55e';
    case 'YELLOW': return '#eab308';
    case 'RED': return '#ef4444';
    default: return '#6b7280';
  }
}

/**
 * Zamanaşımı seviyesine göre etiket döndür
 */
export function getLimitationLevelLabel(level: LimitationLevel): string {
  switch (level) {
    case 'GREEN': return 'Uygun';
    case 'YELLOW': return 'Yaklaşıyor';
    case 'RED': return 'Dolmuş';
    default: return 'Hesaplanamadı';
  }
}

export default useLimitationCheck;
