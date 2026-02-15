/**
 * WarmupValidator — Adaptif warmup stabilizasyon tespiti
 *
 * Performance Characterization — Task 6.1
 *
 * 30s pencerelerle p95/p99 ölçümü.
 * Stabilizasyon: ardışık 3 pencerede p95 değişimi <%5 ve p99 değişimi <%8.
 * Timeout: 10 dk sonra WARN + devam (abort etmez).
 *
 * @see .kiro/specs/perf-characterization/design.md — Bileşen 4
 */

// ============================================================================
// Types
// ============================================================================

export interface LatencyWindow {
  p95Ms: number;
  p99Ms: number;
  windowIndex: number;
}

export interface WarmupResult {
  isStable: boolean;
  warmupMinutes: number;
  windows: LatencyWindow[];
  stabilizedAtWindow: number | null; // null = timeout
}

// ============================================================================
// Constants
// ============================================================================

const WINDOW_SEC = 30;
const STABLE_WINDOWS_REQUIRED = 3;
const P95_THRESHOLD = 0.05; // %5
const P99_THRESHOLD = 0.08; // %8
const TIMEOUT_MIN = 10;

// ============================================================================
// WarmupValidator
// ============================================================================

export class WarmupValidator {
  /**
   * Warmup fazını başlat.
   *
   * @param sendRequests — Her pencerede çağrılır, o penceredeki p95/p99 döner.
   * @returns WarmupResult — stabilizasyon durumu + ölçülen warmup süresi.
   */
  async start(
    sendRequests: (rps: number, windowSec: number) => Promise<LatencyWindow>,
    rps: number,
  ): Promise<WarmupResult> {
    const windows: LatencyWindow[] = [];
    const maxWindows = Math.ceil((TIMEOUT_MIN * 60) / WINDOW_SEC);

    for (let i = 0; i < maxWindows; i++) {
      const win = await sendRequests(rps, WINDOW_SEC);
      windows.push({ ...win, windowIndex: i });

      if (windows.length >= STABLE_WINDOWS_REQUIRED + 1) {
        if (this.isStable(windows)) {
          const warmupMinutes = ((i + 1) * WINDOW_SEC) / 60;
          return {
            isStable: true,
            warmupMinutes,
            windows,
            stabilizedAtWindow: i,
          };
        }
      }
    }

    // Timeout — 10 dk doldu, stabil değil
    return {
      isStable: false,
      warmupMinutes: TIMEOUT_MIN,
      windows,
      stabilizedAtWindow: null,
    };
  }

  /**
   * Stabilizasyon kontrolü — pure fonksiyon (property testlerde kullanılır).
   *
   * Son 3 ardışık pencerede:
   * - p95 değişimi < %5
   * - p99 değişimi < %8
   *
   * Karşılaştırma: her pencere bir önceki ile.
   * En az 4 pencere gerekli (3 ardışık çift = 4 pencere).
   */
  static checkStability(windows: LatencyWindow[]): {
    isStable: boolean;
    stabilizedAtWindow: number | null;
  } {
    if (windows.length < STABLE_WINDOWS_REQUIRED + 1) {
      return { isStable: false, stabilizedAtWindow: null };
    }

    // Her olası 3-ardışık-çift pencere grubunu kontrol et
    for (let end = STABLE_WINDOWS_REQUIRED; end < windows.length; end++) {
      let allStable = true;
      for (let j = end - STABLE_WINDOWS_REQUIRED + 1; j <= end; j++) {
        const prev = windows[j - 1];
        const curr = windows[j];
        if (prev.p95Ms === 0 || prev.p99Ms === 0) {
          allStable = false;
          break;
        }
        const p95Change = Math.abs(curr.p95Ms - prev.p95Ms) / prev.p95Ms;
        const p99Change = Math.abs(curr.p99Ms - prev.p99Ms) / prev.p99Ms;
        if (p95Change >= P95_THRESHOLD || p99Change >= P99_THRESHOLD) {
          allStable = false;
          break;
        }
      }
      if (allStable) {
        return { isStable: true, stabilizedAtWindow: end };
      }
    }

    return { isStable: false, stabilizedAtWindow: null };
  }

  /** Instance method — delegates to static */
  private isStable(windows: LatencyWindow[]): boolean {
    return WarmupValidator.checkStability(windows).isStable;
  }
}

/** Exported constants for property tests */
export const WARMUP_CONSTANTS = {
  WINDOW_SEC,
  STABLE_WINDOWS_REQUIRED,
  P95_THRESHOLD,
  P99_THRESHOLD,
  TIMEOUT_MIN,
} as const;
