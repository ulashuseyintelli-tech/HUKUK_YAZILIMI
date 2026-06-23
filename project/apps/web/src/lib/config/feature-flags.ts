/**
 * Feature Flags - Runtime configuration
 * 
 * TEK KAYNAK PRENSİBİ için kritik flagler burada tanımlanır.
 * 
 * @see docs/single-source-of-truth-architecture.md
 */

// ============================================================================
// ROLLOUT CONFIGURATION
// ============================================================================

/**
 * Unified Preview Rollout Config
 * 
 * Kademeli rollout için:
 * - NEXT_PUBLIC_UNIFIED_PREVIEW_ROLLOUT_PERCENT: 0-100 arası
 * - NEXT_PUBLIC_UNIFIED_PREVIEW_TENANT_WHITELIST: comma-separated tenant IDs
 * - NEXT_PUBLIC_UNIFIED_PREVIEW_KILL_SWITCH: 'true' ise unified tamamen kapalı
 */
interface UnifiedPreviewRolloutConfig {
  /** Kill switch - true ise unified tamamen kapalı */
  killSwitch: boolean;
  /** Rollout yüzdesi (0-100) */
  rolloutPercent: number;
  /** Whitelist tenant'lar (her zaman unified kullanır) */
  tenantWhitelist: string[];
  /** Fallback rate eşiği - bu üstüne çıkarsa otomatik kill switch */
  fallbackRateThreshold: number;
}

function getUnifiedPreviewRolloutConfig(): UnifiedPreviewRolloutConfig {
  return {
    killSwitch: process.env.NEXT_PUBLIC_UNIFIED_PREVIEW_KILL_SWITCH === 'true',
    rolloutPercent: parseInt(process.env.NEXT_PUBLIC_UNIFIED_PREVIEW_ROLLOUT_PERCENT || '100', 10),
    tenantWhitelist: (process.env.NEXT_PUBLIC_UNIFIED_PREVIEW_TENANT_WHITELIST || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean),
    fallbackRateThreshold: parseFloat(
      process.env.NEXT_PUBLIC_UNIFIED_PREVIEW_FALLBACK_THRESHOLD || '0.02'
    ), // %2 default
  };
}

/**
 * Check if unified preview should be used for this request
 * 
 * @param tenantId - Optional tenant ID for whitelist check
 * @param sessionHash - Optional session hash for consistent rollout
 */
export function shouldUseUnifiedPreview(tenantId?: string, sessionHash?: string): boolean {
  const config = getUnifiedPreviewRolloutConfig();
  
  // Kill switch aktifse unified kapalı
  if (config.killSwitch) {
    return false;
  }
  
  // Tenant whitelist'te ise her zaman unified
  if (tenantId && config.tenantWhitelist.includes(tenantId)) {
    return true;
  }
  
  // Rollout yüzdesine göre karar ver
  if (config.rolloutPercent >= 100) {
    return true;
  }
  
  if (config.rolloutPercent <= 0) {
    return false;
  }
  
  // Session hash ile consistent rollout
  if (sessionHash) {
    const hashNum = parseInt(sessionHash.substring(0, 8), 16);
    return (hashNum % 100) < config.rolloutPercent;
  }
  
  // Random rollout (session hash yoksa)
  return Math.random() * 100 < config.rolloutPercent;
}

// ============================================================================
// FEATURE FLAGS
// ============================================================================

/**
 * Feature flags configuration
 */
export const FEATURE_FLAGS = {
  /**
   * A1 Faz 2b-B: Kambiyo zinciri & müracaat (recourse) UI — enstrüman detayında
   * manuel zincir-kurucu panel (POST /case-instruments/chain/analyze çağırır).
   * Varsayılan KAPALI. Salt aday gösterim; otomatik borçlu YOK. Backend 2b-A (#384) her zaman açık.
   */
  A1_INSTRUMENT_CHAIN: process.env.NEXT_PUBLIC_A1_INSTRUMENT_CHAIN === 'true',

  /**
   * PR-2b-2: Manuel kambiyo (CEK/SENET) → CaseInstrument instruments[] yolu.
   *
   * ⚠️ Backend MANUAL_CASE_INSTRUMENTS ile BİRLİKTE açılmalı. Yalnız frontend açık + backend kapalı
   * = kambiyo kalem kaybı (frontend dues'tan çıkarır, backend instrument'ı yok sayar).
   * Varsayılan KAPALI → PR-2a davranışı korunur (kambiyo → dues[]).
   */
  MANUAL_CASE_INSTRUMENTS: process.env.NEXT_PUBLIC_MANUAL_CASE_INSTRUMENTS === 'true',

  /**
   * Mock hesaplama izni
   * 
   * ⚠️ SADECE development ortamında true olabilir.
   * Production'da mock hesaplama YASAKTIR.
   */
  ALLOW_MOCK_CALCULATIONS: 
    process.env.NEXT_PUBLIC_ALLOW_MOCK_CALCULATIONS === 'true' &&
    process.env.NODE_ENV !== 'production',

  /**
   * Deprecated API uyarıları
   * 
   * true: console.warn ile uyarı göster
   * false: sessizce devam et (önerilmez)
   */
  WARN_DEPRECATED_API: process.env.NEXT_PUBLIC_WARN_DEPRECATED_API !== 'false',

  /**
   * Telemetry gönderimi
   * 
   * Deprecated API kullanımlarını izlemek için
   */
  SEND_DEPRECATION_TELEMETRY: process.env.NEXT_PUBLIC_SEND_DEPRECATION_TELEMETRY === 'true',

  /**
   * Unified Preview Endpoint (Phase 3)
   * 
   * @deprecated Use shouldUseUnifiedPreview() for rollout-aware check
   * 
   * true: /calc/preview/light kullan (tek endpoint)
   * false: Legacy coordinator kullan (interest + fee ayrı)
   * 
   * Geçiş stratejisi:
   * 1. Önce unified endpoint'i dene
   * 2. Fail olursa legacy'ye fallback
   * 3. 2-4 hafta stabil çalışınca legacy'yi deprecate et
   * 
   * @see docs/single-source-of-truth-architecture.md - Phase 3
   */
  USE_UNIFIED_PREVIEW: process.env.NEXT_PUBLIC_USE_UNIFIED_PREVIEW !== 'false',
  
  /**
   * Unified Preview Rollout Config
   */
  get UNIFIED_PREVIEW_CONFIG() {
    return getUnifiedPreviewRolloutConfig();
  },

  /**
   * Balance display shadow evidence paneli.
   *
   * Varsayilan KAPALI. UI'da ancak bu flag true ve URL'de balanceShadow=1 varsa
   * shadow-diff endpoint'i okunur. Ana hesap ozeti calculation-summary hattinda kalir.
   */
  BALANCE_SHADOW_DISPLAY: process.env.NEXT_PUBLIC_BALANCE_SHADOW_DISPLAY === 'true',
} as const;

// ============================================================================
// TELEMETRY TRACKING
// ============================================================================

/** Fallback event counter (in-memory, should be sent to telemetry service) */
let fallbackEventCount = 0;
let totalPreviewCount = 0;

/**
 * Track legacy fallback event
 * 
 * Fallback rate monitoring için
 */
export function trackLegacyFallback(reason: string, metadata?: Record<string, unknown>): void {
  fallbackEventCount++;
  totalPreviewCount++;
  
  const fallbackRate = totalPreviewCount > 0 ? fallbackEventCount / totalPreviewCount : 0;
  
  console.warn('[TELEMETRY] Legacy fallback:', {
    reason,
    fallbackRate: `${(fallbackRate * 100).toFixed(2)}%`,
    totalEvents: totalPreviewCount,
    ...metadata,
  });
  
  // Fallback rate threshold check
  const config = getUnifiedPreviewRolloutConfig();
  if (fallbackRate > config.fallbackRateThreshold && totalPreviewCount > 100) {
    console.error(
      `[ALERT] Fallback rate (${(fallbackRate * 100).toFixed(2)}%) exceeded threshold ` +
      `(${(config.fallbackRateThreshold * 100).toFixed(2)}%). Consider enabling kill switch.`
    );
    
    // TODO: Send alert to monitoring service
    // TODO: Auto-enable kill switch if configured
  }
}

/**
 * Track unified preview success
 */
export function trackUnifiedSuccess(): void {
  totalPreviewCount++;
}

/**
 * Get current fallback rate
 */
export function getFallbackRate(): { rate: number; total: number; fallbacks: number } {
  return {
    rate: totalPreviewCount > 0 ? fallbackEventCount / totalPreviewCount : 0,
    total: totalPreviewCount,
    fallbacks: fallbackEventCount,
  };
}

// ============================================================================
// ASSERTIONS
// ============================================================================

/**
 * Production'da mock hesaplama kullanılmaya çalışılırsa hata fırlat
 * 
 * @throws Error if mock calculations attempted in production
 */
export function assertNoMockInProduction(context: string): void {
  if (process.env.NODE_ENV === 'production' && !FEATURE_FLAGS.ALLOW_MOCK_CALCULATIONS) {
    const error = new Error(
      `[SECURITY] Mock calculations are not allowed in production. Context: ${context}`
    );
    
    // Log to error tracking service
    console.error(error);
    
    // Hard fail
    throw error;
  }
}

/**
 * Check if we're in development mode
 */
export function isDevelopment(): boolean {
  return process.env.NODE_ENV === 'development';
}

/**
 * Check if we're in production mode
 */
export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Track deprecated API usage
 */
export function trackDeprecatedUsage(
  functionName: string,
  metadata?: Record<string, unknown>
): void {
  if (FEATURE_FLAGS.WARN_DEPRECATED_API) {
    console.warn(`[DEPRECATED] ${functionName} called`, metadata);
  }

  if (FEATURE_FLAGS.SEND_DEPRECATION_TELEMETRY) {
    // TODO: Send to telemetry service
    // telemetryService.track('deprecated_api_usage', { functionName, ...metadata });
  }
}

export default FEATURE_FLAGS;
