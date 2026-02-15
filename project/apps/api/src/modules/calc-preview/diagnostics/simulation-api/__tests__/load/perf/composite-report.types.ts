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
  /** Duplicate raporun runId'si (debugging için) */
  duplicateRunId: string;
  /** Duplicate raporun completedAt'i */
  duplicateCompletedAt: string;
  /** Neden reddedildi */
  reason: 'duplicate_matrix_id';
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

  /** Birleştirme sırasında oluşan uyarılar */
  warnings: string[];
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

const MATRIX_ORDER: Record<MatrixId, number> = {
  M0: 0, M1: 1, M2: 2, M3: 3, M4: 4, M5: 5,
};

export function compareMatrixId(a: MatrixId, b: MatrixId): number {
  return (MATRIX_ORDER[a] ?? 99) - (MATRIX_ORDER[b] ?? 99);
}
