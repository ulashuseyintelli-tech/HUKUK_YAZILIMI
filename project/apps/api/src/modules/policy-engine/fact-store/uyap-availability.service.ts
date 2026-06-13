/**
 * UYAP Availability Service
 *
 * P3 — UYAP geçici arıza (temporary outage) sinyali.
 *
 * Ops kontrollü feature-flag: UYAP ulusal sistemi geçici olarak erişilemediğinde
 * operasyon ekibi `UYAP_AVAILABLE` env değişkenini kapatır. Bu sinyal
 * `system.uyap_available` computed fact'ini besler (bkz. SystemUyapAvailableProvider).
 *
 * Kapsam (multitenant): UYAP arızası TÜM tenant/büroları aynı anda etkiler →
 * bu sinyal GLOBAL/sistem seviyesidir, per-tenant veya per-case DEĞİLDİR.
 * Per-case KALICI kapatma (`case.allow_uyap_actions` → UYAP_DISABLED HARD gate)
 * ile KARIŞTIRILMAMALIDIR; bu ayrı, geçici bir kavramdır.
 *
 * Kaynak deseni: SimulationFeatureFlagService (env var, default-enabled).
 *
 * Not (sonraki iş): Gerçek UYAP health-check (uyap.service.ts:781 TODO) ileride
 * bu servisin arkasına delege edilebilir — fact/gate aynı kalır, sadece kaynak değişir.
 */

import { Injectable } from '@nestjs/common';

// ============================================================================
// Feature Flag Constants
// ============================================================================

export const UYAP_AVAILABILITY_ENV = {
  /** Ops toggle: yalnız açık kapatma değerlerinde outage sayılır. */
  UYAP_AVAILABLE: 'UYAP_AVAILABLE',
} as const;

/**
 * Outage olarak sayılan açık kapatma değerleri (case-insensitive, trim'li).
 * Bunların DIŞINDAki her değer (boş string ve env yokluğu dahil) = available.
 */
const OUTAGE_VALUES: readonly string[] = ['false', '0', 'disabled'];

// ============================================================================
// Interface
// ============================================================================

export interface IUyapAvailabilityService {
  /**
   * UYAP sistemi şu an erişilebilir mi?
   * Yalnızca `UYAP_AVAILABLE` env'i açıkça `false`/`0`/`disabled` ise false döner.
   * Env yok veya boş ise true (fail-safe: available).
   */
  isUyapAvailable(): boolean;
}

// ============================================================================
// Implementation
// ============================================================================

@Injectable()
export class UyapAvailabilityService implements IUyapAvailabilityService {
  /**
   * UYAP erişilebilirlik durumunu env flag'inden okur.
   *
   * <remarks>
   * Çağrıldığı yerler:
   * - SystemUyapAvailableProvider.compute() → `system.uyap_available` computed fact'ini üretir
   *   (computed-fact-registry.ts) → CPE.canPerformAction akışında gate'lere girdi olur.
   * </remarks>
   *
   * Default: available (true). Outage yalnız env açıkça `false`/`0`/`disabled` ise.
   */
  isUyapAvailable(): boolean {
    const raw = process.env[UYAP_AVAILABILITY_ENV.UYAP_AVAILABLE];
    if (raw == null) return true; // env tanımsız → available
    const normalized = raw.trim().toLowerCase();
    return !OUTAGE_VALUES.includes(normalized); // boş string dahil → available
  }
}

// ============================================================================
// Mock for Testing
// ============================================================================

export class MockUyapAvailabilityService implements IUyapAvailabilityService {
  private available = true;

  isUyapAvailable(): boolean {
    return this.available;
  }

  /** Test yardımcı: outage'ı aç/kapat. */
  setAvailable(available: boolean): void {
    this.available = available;
  }
}
