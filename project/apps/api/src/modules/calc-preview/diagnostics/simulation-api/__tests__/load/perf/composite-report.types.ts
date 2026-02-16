/**
 * Composite Perf Report Types — M0–M4 birleşik rapor tipi ve yardımcılar
 *
 * Performance Characterization — Task 20.1
 *
 * CompositePerfReport, birden fazla matrix raporunu tek bir deterministik
 * yapıda birleştirir. Her rapor bir `runKey` ile gruplanır:
 *   - runKey = runId (varsa ve non-empty)
 *   - runKey = sha256(envHash + seed + gitSha).slice(0, 16) (fallback)
 *
 * Duplicate matrixId policy: aynı runKey altında aynı matrixId iki kez
 * bulunamaz. Daha eski rapor (earlier completedAt) `duplicates[]` listesine
 * taşınır ve index'e dahil edilmez. Daha güncel rapor (later completedAt)
 * kazanır — "latest wins" politikası.
 *
 * @see .kiro/specs/perf-characterization/design.md — Task 20
 * @see .kiro/specs/perf-characterization/requirements.md — Req 16.1–16.7
 */

import { createHash } from 'crypto';
import {
  MatrixReport,
  MatrixId,
  OverheadDelta,
  PerRPSOverheadDelta,
  CapacityPoint,
} from './perf-report.types';

// ============================================================================
// Run Key
// ============================================================================

/**
 * Compute a deterministic run key for grouping matrix reports.
 *
 * Priority:
 *   1. runId from report metadata (if non-empty)
 *   2. sha256(envHash:seed:gitSha).slice(0, 16) — fallback
 *
 * Deterministic: same inputs → same key, always.
 * Fallback path normalizes inputs: trim + lowercase for envHash/gitSha.
 *
 * Returns { runKey, fallback } — caller should emit warning when fallback=true.
 */
export function computeRunKey(report: MatrixReport): { runKey: string; fallback: boolean } {
  const runId = report.metadata.runId;
  if (runId && runId.trim().length > 0) {
    return { runKey: runId.trim(), fallback: false };
  }

  const envHash = (report.metadata.environmentSnapshotHash ?? '').trim().toLowerCase();
  const seed = String(report.seed ?? 0);
  const gitSha = (report.metadata.gitSha ?? '').trim().toLowerCase();

  const runKey = createHash('sha256')
    .update(`${envHash}:${seed}:${gitSha}`)
    .digest('hex')
    .slice(0, 16);

  return { runKey, fallback: true };
}

// ============================================================================
// Matrix Index Entry — her matrix'in özet metrikleri
// ============================================================================

export interface MatrixIndexEntry {
  matrixId: MatrixId;
  runKey: string;
  /** ISO 8601 — matrix tamamlanma zamanı */
  completedAt: string;
  /** Adaptive sweep sonucu (null = sweep yapılmadı, ör. M2/M3/M4) */
  sustainableRPS: number | null;
  breakpointRPS: number | null;
  /** Genel p99 latency (ms) — sweep varsa son sustainable step'ten */
  p99Ms: number | null;
  /** Event loop p99 (ms) */
  eventLoopP99Ms: number | null;
  /** Heap trend — leak suspected? (M4 only) */
  leakSuspected: boolean | null;
  /** Block rate bucket count (M2 only) */
  blockRateBucketCount: number | null;
  /** Snapshot pressure cold path p99 contribution (M3 only) */
  coldPathP99ContributionMs: number | null;
  /** Uyarı sayısı */
  warningCount: number;
}

// ============================================================================
// Duplicate Record — aynı runKey + matrixId çakışması
// ============================================================================

export interface DuplicateRecord {
  matrixId: MatrixId;
  runKey: string;
  /** Kazanan raporun runId'si */
  keptRunId: string;
  /** Kazanan raporun completedAt'i */
  keptCompletedAt: string;
  /** Düşürülen raporun runId'si */
  droppedRunId: string;
  /** Düşürülen raporun completedAt'i */
  droppedCompletedAt: string;
  /** Neden reddedildi */
  reason: 'latest-wins';
}

// ============================================================================
// Composite Perf Report
// ============================================================================

export interface CompositePerfReport {
  /** Rapor metadata — birleşik rapor seviyesinde */
  metadata: {
    schemaVersion: '2.0.0';
    compositeRunKey: string;
    generatedAt: string;
    gitSha: string;
    environmentSnapshotHash: string;
  };

  /** Matrix index — her matrix'in özet metrikleri (hızlı lookup) */
  index: MatrixIndexEntry[];

  /** Bireysel matrix raporları — matrixId sırasına göre (M0, M1, M2, M3, M4) */
  matrices: MatrixReport[];

  /** M0 vs M1 overhead delta (her ikisi de mevcutsa) */
  overheadDelta: OverheadDelta | null;

  /** Capacity envelope — M0 + M1 eğrileri yan yana */
  capacityEnvelope: {
    phase7Off: CapacityPoint[];
    phase7On: CapacityPoint[];
  } | null;

  /** Duplicate raporlar (aynı runKey + matrixId) */
  duplicates: DuplicateRecord[];

  /** Typed diagnostics — warnings[]'den taşınan yapısal veriler */
  diagnostics: CompositeDiagnostics;

  /** Hangi normalizasyonlar uygulandı (audit trail) */
  normalizationsApplied: string[];

  /** Birleştirme sırasında oluşan uyarılar */
  warnings: string[];
}

// ============================================================================
// Composite Diagnostics — typed M4 diagnostics
// ============================================================================

export interface M4DiagnosticsData {
  baselineHeapUsedMB: number;
  baselineExternalMB: number;
  baselineRssMB: number;
  intervalDeltas: Array<{
    intervalIndex: number;
    simulatedMinute: number;
    heapUsedDeltaMB: number;
    heapTotalDeltaMB: number;
    externalDeltaMB: number;
    rssDeltaMB: number;
    retainedObjectCount: number;
    retainedBufferBytes: number;
  }>;
  slopeMBPerInterval: number;
  slopeMBPerRequest: number;
  totalHeapUsedDeltaMB: number;
  totalExternalDeltaMB: number;
  retainedObjectCount: number;
  retainedBufferBytes: number;
  gcAvailable: boolean;
}

// ============================================================================
// M5 Diagnostics — micro-benchmark detaylı metrikler
// ============================================================================

export interface M5RunDetail {
  grossNs: number;
  netNs: number;
  opsPerSec: number;
}

export interface M5DiagnosticsData {
  /** Her varyantın 3-run detayları */
  runs: {
    float: M5RunDetail[];
    scaledInt: M5RunDetail[];
    e2eScaledInt: M5RunDetail[];
  };
  /** Empty loop baseline (ns) — zamanlama doğrulama */
  emptyLoopNs: number;
  /** Input setup */
  inputConfig: { metricCount: number; seed: number };
  /** GC available? */
  gcAvailable: boolean;
  /** Varyasyon uyarıları */
  noiseWarnings: string[];
}

export interface CompositeDiagnostics {
  /** M4 GC pressure diagnostics (null = M4 yok veya diagnostics parse fail) */
  m4: M4DiagnosticsData | null;
  /** M5 micro-benchmark diagnostics (null = M5 yok veya diagnostics parse fail) */
  m5: M5DiagnosticsData | null;
}

// ============================================================================
// buildIndexEntry — tek bir MatrixReport'tan index entry üret
// ============================================================================

export function buildIndexEntry(report: MatrixReport, runKey: string): MatrixIndexEntry {
  // Sweep varsa sustainable step'in p99'unu al
  let p99Ms: number | null = null;
  let eventLoopP99Ms: number | null = null;
  let sustainableRPS: number | null = null;
  let breakpointRPS: number | null = null;

  if (report.sweep) {
    sustainableRPS = report.sweep.sustainableRPS;
    breakpointRPS = report.sweep.breakpointRPS;

    // Son sustainable step = sustainableRPS'e eşit veya en yakın step
    const sustainableStep = report.sweep.steps
      .filter((s) => s.rps <= (report.sweep?.sustainableRPS ?? 0))
      .sort((a, b) => b.rps - a.rps)[0];

    if (sustainableStep) {
      p99Ms = sustainableStep.latency.p99;
      eventLoopP99Ms = sustainableStep.eventLoop.p99Ms;
    }
  }

  return {
    matrixId: report.matrixId,
    runKey,
    completedAt: report.completedAt,
    sustainableRPS,
    breakpointRPS,
    p99Ms,
    eventLoopP99Ms,
    leakSuspected: report.heapTrend?.isLeakSuspected ?? null,
    blockRateBucketCount: report.blockRateBuckets.length > 0
      ? report.blockRateBuckets.length
      : null,
    coldPathP99ContributionMs: report.snapshotPressure?.coldPathP99ContributionMs ?? null,
    warningCount: report.warnings.length,
  };
}

// ============================================================================
// Matrix ID canonical sort order
// ============================================================================

export const MATRIX_ORDER: Record<MatrixId, number> = {
  M0: 0, M1: 1, M2: 2, M3: 3, M4: 4, M5: 5,
};

export function compareMatrixId(a: MatrixId, b: MatrixId): number {
  return (MATRIX_ORDER[a] ?? 99) - (MATRIX_ORDER[b] ?? 99);
}

// ============================================================================
// computeOverheadDelta — standalone (PerfHarness'tan extract edildi)
// ============================================================================

/**
 * M0 vs M1 overhead delta hesapla.
 *
 * Per-RPS eşleme: M1'in her step'i için M0'da exact match veya en yakın
 * düşük RPS bulunur. İnterpolasyon yapılmaz.
 *
 * Özet delta: M1'in sustainableRPS'inde hesaplanır.
 *
 * Standalone fonksiyon — PerfHarness coupling'i yok.
 * Merger ve test'ler doğrudan import edebilir.
 */
export function computeOverheadDelta(m0: MatrixReport, m1: MatrixReport): OverheadDelta {
  const m0Sweep = m0.sweep;
  const m1Sweep = m1.sweep;
  const m0Steps = m0Sweep?.steps ?? [];
  const m1Steps = m1Sweep?.steps ?? [];

  // Per-RPS delta: M1'in her step'i için M0'da en yakın düşük RPS'i bul
  const perRPSDeltas: PerRPSOverheadDelta[] = [];
  for (const m1Step of m1Steps) {
    let m0Step = m0Steps.find((s) => s.rps === m1Step.rps);
    if (!m0Step) {
      const candidates = m0Steps.filter((s) => s.rps <= m1Step.rps);
      if (candidates.length > 0) {
        m0Step = candidates.reduce((a, b) => (b.rps > a.rps ? b : a));
      }
    }
    if (!m0Step) continue;

    perRPSDeltas.push({
      rps: m1Step.rps,
      deltaP50Ms: m1Step.latency.p50 - m0Step.latency.p50,
      deltaP95Ms: m1Step.latency.p95 - m0Step.latency.p95,
      deltaP99Ms: m1Step.latency.p99 - m0Step.latency.p99,
      deltaSnapshotFetchP95Ms:
        m1Step.splitTimers.phase7_snapshot_fetch_ms.p95 -
        m0Step.splitTimers.phase7_snapshot_fetch_ms.p95,
      deltaSnapshotFetchP99Ms:
        m1Step.splitTimers.phase7_snapshot_fetch_ms.p99 -
        m0Step.splitTimers.phase7_snapshot_fetch_ms.p99,
      deltaDriftCalcP95Ms:
        m1Step.splitTimers.phase7_drift_calc_ms.p95 -
        m0Step.splitTimers.phase7_drift_calc_ms.p95,
      deltaDriftCalcP99Ms:
        m1Step.splitTimers.phase7_drift_calc_ms.p99 -
        m0Step.splitTimers.phase7_drift_calc_ms.p99,
      deltaEventLoopP99Ms: m1Step.eventLoop.p99Ms - m0Step.eventLoop.p99Ms,
      deltaCpuTotalPercent: m1Step.cpu.totalPercent - m0Step.cpu.totalPercent,
      deltaRssMB:
        Math.round(m1Step.memory.rssKB / 1024) -
        Math.round(m0Step.memory.rssKB / 1024),
    });
  }

  // Özet delta: M1'in sustainable RPS'inde
  const compareRPS = m1Sweep?.sustainableRPS ?? m0Sweep?.sustainableRPS ?? 0;
  const summaryDelta = perRPSDeltas.find((d) => d.rps === compareRPS);

  const emptyStats = { p50: 0, p95: 0, p99: 0, max: 0, count: 0, mean: 0 };

  return {
    deltaP99Ms: summaryDelta?.deltaP99Ms ?? 0,
    deltaCpuPercent: summaryDelta?.deltaCpuTotalPercent ?? 0,
    deltaAllocRateMBPerMin: 0, // M4'ten hesaplanır
    deltaEventLoopP99Ms: summaryDelta?.deltaEventLoopP99Ms ?? 0,
    sustainableRPSDelta:
      (m1Sweep?.sustainableRPS ?? 0) - (m0Sweep?.sustainableRPS ?? 0),
    splitTimerBreakdown: m1.splitTimers ?? {
      request_duration_ms: emptyStats,
      phase7_snapshot_fetch_ms: emptyStats,
      phase7_drift_calc_ms: emptyStats,
      phase7_audit_write_ms: emptyStats,
      phase7_metrics_emit_ms: emptyStats,
    },
    perRPSDeltas,
  };
}
