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

export interf