/**
 * DEGRADED MODE CONFIG v5
 * 
 * UI değişikliklerine dayanıklılık.
 * UYAP ekran değişikliklerinde fallback mekanizması.
 * Graceful degradation stratejileri.
 */

import { UyapScreen } from './ui-map.config';

// ==================== TYPES ====================

export type DegradedModeLevel =
  | 'NORMAL'            // Her şey çalışıyor
  | 'PARTIAL'           // Bazı özellikler kısıtlı
  | 'DEGRADED'          // Temel özellikler çalışıyor
  | 'MINIMAL'           // Sadece okuma işlemleri
  | 'OFFLINE';          // Tamamen çevrimdışı

export type FailureType =
  | 'ELEMENT_NOT_FOUND'     // Element bulunamadı
  | 'SELECTOR_CHANGED'      // Selector değişti
  | 'SCREEN_LAYOUT_CHANGED' // Ekran düzeni değişti
  | 'API_ERROR'             // API hatası
  | 'TIMEOUT'               // Zaman aşımı
  | 'AUTH_ERROR'            // Kimlik doğrulama hatası
  | 'UNKNOWN';              // Bilinmeyen hata

export interface DegradedModeConfig {
  level: DegradedModeLevel;
  reason?: string;
  affectedScreens?: string[];
  fallbackStrategies?: FallbackStrategy[];
  activatedAt?: Date;
  autoRecoveryEnabled?: boolean;
}

export interface FallbackStrategy {
  screen: string;
  originalSelector: string;
  fallbackSelectors: string[];
  maxRetries: number;
}

export interface FailureRecord {
  type: FailureType;
  screen: string;
  selector?: string;
  timestamp: Date;
  errorMessage?: string;
  recoveryAttempted?: boolean;
}

// ==================== DEFAULT CONFIG ====================

export const DEFAULT_DEGRADED_MODE_CONFIG: DegradedModeConfig = {
  level: 'NORMAL',
  autoRecoveryEnabled: true,
};

export const FAILURE_THRESHOLDS = {
  PARTIAL: 3,    // 3 hata → PARTIAL
  DEGRADED: 5,   // 5 hata → DEGRADED
  MINIMAL: 10,   // 10 hata → MINIMAL
  OFFLINE: 20,   // 20 hata → OFFLINE
};

export const AUTO_RECOVERY_INTERVAL_MS = 5 * 60 * 1000; // 5 dakika