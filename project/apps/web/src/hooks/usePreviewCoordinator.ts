/**
 * usePreviewCoordinator Hook
 * 
 * Phase 3: Unified preview endpoint + legacy fallback
 * 
 * Önce /calc/preview/light (unified) dener.
 * Fail olursa legacy coordinator'a (interest + fee ayrı) fallback yapar.
 * 
 * Avantajlar:
 * - Tek trace / tek requestHash
 * - Tek versiyon seti (mismatch OLMAZ)
 * - Policy bağlamı tek yerde
 * - UI karmaşıklığı azalır
 * 
 * @see docs/single-source-of-truth-architecture.md - Phase 3
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { 
  interestEngineApi, 
  InterestPreviewRequest, 
  InterestPreviewResponse,
  InterestTypeCode 
} from '@/lib/api/interest-engine';
import { 
  feeEngineApi, 
  FeePreviewRequest, 
  FeePreviewResponse 
} from '@/lib/api/fee-engine';
import { 
  calcPreviewApi, 
  CalcPreviewResponse,
  CalcPreviewRequest as UnifiedRequest 
} from '@/lib/api/calc-preview';
import { 
  FEATURE_FLAGS, 
  shouldUseUnifiedPreview, 
  trackLegacyFallback, 
  trackUnifiedSuccess 
} from '@/lib/config/feature-flags';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Preview durumu
 * - FULL: Her iki hesaplama da başarılı
 * - PARTIAL: Biri başarılı, diğeri başarısız
 * - UNAVAILABLE: İkisi de başarısız
 * - LOADING: Hesaplama devam ediyor
 * - IDLE: Henüz hesaplama yapılmadı
 */
export type PreviewStatus = 'FULL' | 'PARTIAL' | 'UNAVAILABLE' | 'LOADING' | 'IDLE';

/**
 * Versiyon bilgileri
 */
export interface PreviewVersions {
  interest?: {
    engineVersion?: string;
    rateTableVersion?: string;
    ruleVersion?: string;
  };
  fee?: {
    engineVersion?: string;
    tariffVersion?: string;
    tariffYear?: number;
    ruleVersion?: string;
  };
}

/**
 * Versiyon uyumsuzluğu
 */
export interface VersionMismatch {
  type: 'ENGINE_VERSION_MISMATCH' | 'RULE_VERSION_MISMATCH';
  details: {
    interestVersion?: string;
    feeVersion?: string;
  };
}

/**
 * Preview hatası
 */
export interface PreviewError {
  source: 'interest' | 'fee';
  code: string;
  message: string;
}

/**
 * Preview uyarısı
 */
export interface PreviewWarning {
  source: 'interest' | 'fee' | 'coordinator';
  code: string;
  message: string;
  severity: 'warning' | 'info';
}

/**
 * Faiz preview sonucu (normalize edilmiş)
 */
export interface InterestPreviewData {
  estimatedInterest: number;
  currentRate: number;
  days: number;
  interestType: InterestTypeCode;
}

/**
 * Masraf preview sonucu (normalize edilmiş)
 */
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
 * Birleşik preview sonucu
 */
export interface PreviewBundle {
  status: PreviewStatus;
  interest: InterestPreviewData | null;
  fee: FeePreviewData | null;
  versions: PreviewVersions;
  versionMismatch: VersionMismatch | null;
  warnings: PreviewWarning[];
  errors: PreviewError[];
  requestHash: string;
  timestamp: string;
  cached: {
    interest: boolean;
    fee: boolean;
  };
  /** UX Guidance from backend */
  uxGuidance?: {
    blocking: boolean;
    recommendedAction: 'PROCEED' | 'RETRY' | 'CHECK_INPUT' | 'CONTACT_SUPPORT' | 'WAIT';
    retryAfterMs?: number;
    userMessage?: string;
  };
  /** Unified endpoint kullanıldı mı? */
  usedUnified?: boolean;
}

/**
 * Coordinator request
 */
export interface PreviewCoordinatorRequest {
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
}

/**
 * Hook options
 */
export interface UsePreviewCoordinatorOptions {
  /** Debounce süresi (ms) */
  debounceMs?: number;
  /** Otomatik çalıştır */
  enabled?: boolean;
  /** Tenant ID (rollout kontrolü için) */
  tenantId?: string;
  /** Session hash (consistent rollout için) */
  sessionHash?: string;
}

/**
 * Hook return type
 */
export interface UsePreviewCoordinatorReturn {
  /** Mevcut preview bundle */
  bundle: PreviewBundle;
  /** Yükleniyor mu? */
  loading: boolean;
  /** Manuel tetikleme */
  execute: (request: PreviewCoordinatorRequest) => Promise<PreviewBundle>;
  /** State'i sıfırla */
  reset: () => void;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Request'ten stable hash üret (race condition kontrolü için)
 */
function generateRequestHash(request: PreviewCoordinatorRequest): string {
  const normalized = JSON.stringify({
    p: request.principalAmount,
    c: request.currency || 'TRY',
    t: request.interestType,
    s: request.startDate,
    e: request.endDate,
    f: request.fixedRate,
    ct: request.caseType,
    dc: request.debtorCount,
  });
  
  // Simple hash
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

/**
 * Versiyon uyumsuzluğu kontrol et
 */
function checkVersionMismatch(versions: PreviewVersions): VersionMismatch | null {
  const interestEngine = versions.interest?.engineVersion;
  const feeEngine = versions.fee?.engineVersion;
  
  // Engine version farklıysa ciddi mismatch
  if (interestEngine && feeEngine && interestEngine !== feeEngine) {
    return {
      type: 'ENGINE_VERSION_MISMATCH',
      details: {
        interestVersion: interestEngine,
        feeVersion: feeEngine,
      },
    };
  }
  
  // Rule version farklıysa policy drift
  const interestRule = versions.interest?.ruleVersion;
  const feeRule = versions.fee?.ruleVersion;
  
  if (interestRule && feeRule && interestRule !== feeRule) {
    return {
      type: 'RULE_VERSION_MISMATCH',
      details: {
        interestVersion: interestRule,
        feeVersion: feeRule,
      },
    };
  }
  
  return null;
}

/**
 * Boş bundle oluştur
 */
function createEmptyBundle(): PreviewBundle {
  return {
    status: 'IDLE',
    interest: null,
    fee: null,
    versions: {},
    versionMismatch: null,
    warnings: [],
    errors: [],
    requestHash: '',
    timestamp: new Date().toISOString(),
    cached: { interest: false, fee: false },
    usedUnified: false,
  };
}

// ============================================================================
// HOOK
// ============================================================================

export function usePreviewCoordinator(
  options: UsePreviewCoordinatorOptions = {}
): UsePreviewCoordinatorReturn {
  const { debounceMs = 400, enabled = true, tenantId, sessionHash } = options;
  
  const [bundle, setBundle] = useState<PreviewBundle>(createEmptyBundle());
  const [loading, setLoading] = useState(false);
  
  // Race condition kontrolü için
  const latestRequestHashRef = useRef<string>('');
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Unified endpoint ile preview (Phase 3)
   * Tek request, tek response, tek versiyon seti
   */
  const executeUnified = useCallback(async (
    request: PreviewCoordinatorRequest,
    requestHash: string
  ): Promise<PreviewBundle | null> => {
    try {
      const unifiedRequest: UnifiedRequest = {
        principalAmount: request.principalAmount,
        currency: request.currency || 'TRY',
        interestType: request.interestType,
        startDate: request.startDate,
        endDate: request.endDate,
        fixedRate: request.fixedRate,
        caseType: request.caseType,
        debtorCount: request.debtorCount || 1,
      };

      const response: CalcPreviewResponse = await calcPreviewApi.preview(unifiedRequest);

      // Race condition kontrolü
      if (latestRequestHashRef.current !== requestHash) {
        console.log('[usePreviewCoordinator] Stale unified response dropped:', requestHash);
        return null;
      }

      // Unified response'u PreviewBundle'a dönüştür
      const warnings: PreviewWarning[] = response.warnings.map(w => ({
        source: w.domain as 'interest' | 'fee' | 'coordinator',
        code: w.code,
        message: w.message,
        severity: w.severity,
      }));

      const errors: PreviewError[] = response.errors
        .filter(e => e.domain !== 'validation')
        .map(e => ({
          source: e.domain as 'interest' | 'fee',
          code: e.code,
          message: e.message,
        }));

      // Unified endpoint'te mismatch OLMAZ - tek versiyon seti
      const versions: PreviewVersions = {
        interest: {
          engineVersion: response.versions.engineVersion,
          rateTableVersion: response.versions.rateTableVersion,
          ruleVersion: response.versions.ruleVersion,
        },
        fee: {
          engineVersion: response.versions.engineVersion,
          tariffVersion: response.versions.tariffVersion,
          tariffYear: response.versions.tariffYear,
          ruleVersion: response.versions.ruleVersion,
        },
      };

      const newBundle: PreviewBundle = {
        status: response.status === 'FULL' ? 'FULL' 
              : response.status === 'PARTIAL' ? 'PARTIAL' 
              : 'UNAVAILABLE',
        interest: response.interest || null,
        fee: response.fee || null,
        versions,
        versionMismatch: null, // Unified endpoint'te mismatch OLMAZ
        warnings,
        errors,
        requestHash: response.requestHash || requestHash,
        timestamp: response.timestamp,
        cached: {
          interest: response.cached,
          fee: response.cached,
        },
        uxGuidance: response.uxGuidance,
        usedUnified: true,
      };

      // Telemetry: unified success
      trackUnifiedSuccess();

      console.log('[usePreviewCoordinator] Unified endpoint success:', response.status);
      return newBundle;
    } catch (error) {
      console.warn('[usePreviewCoordinator] Unified endpoint failed, will fallback to legacy:', error);
      return null;
    }
  }, []);

  /**
   * Legacy coordinator (fallback) - interest + fee ayrı ayrı
   */
  const executeLegacy = useCallback(async (
    request: PreviewCoordinatorRequest,
    requestHash: string
  ): Promise<PreviewBundle> => {
    const warnings: PreviewWarning[] = [];
    const errors: PreviewError[] = [];
    const versions: PreviewVersions = {};
    
    // Interest request hazırla
    const interestRequest: InterestPreviewRequest = {
      principalAmount: request.principalAmount,
      currency: request.currency || 'TRY',
      interestType: request.interestType,
      startDate: request.startDate,
      endDate: request.endDate,
      fixedRate: request.fixedRate,
    };
    
    // Fee request hazırla
    const feeRequest: FeePreviewRequest = {
      principalAmount: request.principalAmount,
      caseType: request.caseType,
      debtorCount: request.debtorCount || 1,
    };
    
    // Promise.allSettled ile paralel çağır
    const [interestResult, feeResult] = await Promise.allSettled([
      interestEngineApi.preview(interestRequest),
      feeEngineApi.preview(feeRequest),
    ]);
    
    // Race condition kontrolü
    if (latestRequestHashRef.current !== requestHash) {
      console.log('[usePreviewCoordinator] Stale legacy response dropped:', requestHash);
      return bundle;
    }
    
    // Interest sonucunu işle
    let interestData: InterestPreviewData | null = null;
    let interestCached = false;
    
    if (interestResult.status === 'fulfilled') {
      const response = interestResult.value as InterestPreviewResponse;
      if (response.success && response.data) {
        interestData = response.data;
        interestCached = response.cached;
        versions.interest = {};
      } else {
        errors.push({
          source: 'interest',
          code: response.error?.code || 'UNKNOWN',
          message: response.error?.message || 'Faiz hesaplanamadı',
        });
      }
    } else {
      errors.push({
        source: 'interest',
        code: 'NETWORK_ERROR',
        message: 'Faiz servisi erişilemedi',
      });
    }
    
    // Fee sonucunu işle
    let feeData: FeePreviewData | null = null;
    let feeCached = false;
    
    if (feeResult.status === 'fulfilled') {
      const response = feeResult.value as FeePreviewResponse;
      if (response.success && response.data) {
        feeData = response.data;
        feeCached = response.cached;
        versions.fee = { tariffYear: response.data.tariffYear };
      } else {
        errors.push({
          source: 'fee',
          code: response.error?.code || 'UNKNOWN',
          message: response.error?.message || 'Masraf hesaplanamadı',
        });
      }
    } else {
      errors.push({
        source: 'fee',
        code: 'NETWORK_ERROR',
        message: 'Masraf servisi erişilemedi',
      });
    }
    
    // Status belirle
    let status: PreviewStatus;
    if (interestData && feeData) {
      status = 'FULL';
    } else if (interestData || feeData) {
      status = 'PARTIAL';
      warnings.push({
        source: 'coordinator',
        code: 'PARTIAL_PREVIEW',
        message: interestData 
          ? 'Masraf hesaplanamadı, sadece faiz gösteriliyor'
          : 'Faiz hesaplanamadı, sadece masraf gösteriliyor',
        severity: 'warning',
      });
    } else {
      status = 'UNAVAILABLE';
    }
    
    // Version mismatch kontrolü (legacy'de olabilir)
    const versionMismatch = checkVersionMismatch(versions);
    if (versionMismatch) {
      warnings.push({
        source: 'coordinator',
        code: versionMismatch.type,
        message: 'Sonuçlar farklı motor sürümlerinden geliyor olabilir',
        severity: 'warning',
      });
    }

    // Legacy kullanıldığına dair info warning
    warnings.push({
      source: 'coordinator',
      code: 'LEGACY_FALLBACK',
      message: 'Legacy preview kullanıldı (unified endpoint erişilemedi)',
      severity: 'info',
    });
    
    return {
      status,
      interest: interestData,
      fee: feeData,
      versions,
      versionMismatch,
      warnings,
      errors,
      requestHash,
      timestamp: new Date().toISOString(),
      cached: {
        interest: interestCached,
        fee: feeCached,
      },
      usedUnified: false,
    };
  }, [bundle]);

  /**
   * Preview'ları koordineli çalıştır
   * Phase 3: Önce unified, fail olursa legacy fallback
   * Rollout kontrolü: shouldUseUnifiedPreview() ile
   */
  const executeInternal = useCallback(async (
    request: PreviewCoordinatorRequest
  ): Promise<PreviewBundle> => {
    const requestHash = generateRequestHash(request);
    latestRequestHashRef.current = requestHash;
    
    setLoading(true);
    setBundle(prev => ({ ...prev, status: 'LOADING' }));
    
    let newBundle: PreviewBundle;

    // Phase 3: Unified endpoint + fallback with rollout control
    const useUnified = shouldUseUnifiedPreview(tenantId, sessionHash);
    
    if (useUnified) {
      // Önce unified endpoint'i dene
      const unifiedResult = await executeUnified(request, requestHash);
      
      if (unifiedResult) {
        // Unified başarılı
        newBundle = unifiedResult;
      } else {
        // Unified fail, legacy fallback
        console.log('[usePreviewCoordinator] Falling back to legacy coordinator');
        
        // Telemetry: fallback event
        trackLegacyFallback('UNIFIED_FAILED', {
          requestHash,
          tenantId,
        });
        
        newBundle = await executeLegacy(request, requestHash);
      }
    } else {
      // Rollout kontrolü: unified kullanılmayacak
      newBundle = await executeLegacy(request, requestHash);
    }
    
    setBundle(newBundle);
    setLoading(false);
    
    return newBundle;
  }, [executeUnified, executeLegacy, tenantId, sessionHash]);

  /**
   * Debounced execute
   */
  const execute = useCallback(async (
    request: PreviewCoordinatorRequest
  ): Promise<PreviewBundle> => {
    // Önceki timer'ı iptal et
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    
    return new Promise((resolve) => {
      debounceTimerRef.current = setTimeout(async () => {
        const result = await executeInternal(request);
        resolve(result);
      }, debounceMs);
    });
  }, [executeInternal, debounceMs]);

  /**
   * State'i sıfırla
   */
  const reset = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    latestRequestHashRef.current = '';
    setBundle(createEmptyBundle());
    setLoading(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  return {
    bundle,
    loading,
    execute,
    reset,
  };
}

export default usePreviewCoordinator;
