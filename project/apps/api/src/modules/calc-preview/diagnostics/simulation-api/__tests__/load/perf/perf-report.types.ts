/**
 * Perf Report Types — Performans karakterizasyon rapor type'ları
 *
 * Performance Characterization — Task 9.1
 *
 * @see .kiro/specs/perf-characterization/design.md — Veri Modelleri
 */

import { HistogramStats, SplitTimerSnapshot } from './helpers/split-timer';
import { EventLoopSnapshot } from './helpers/event-loop-monitor';
import {
  SweepResult,
  SweepStep,
  CapacityPoint,
  CpuSnapshot,
  MemorySnapshot,
  DbPoolSnapshot,
} from './helpers/adaptive-sweep';
import { WarmupResult } from './helpers/warmup-validator';

// ============================================================================
// Re-exports (kolaylık için)
// ============================================================================

export type {
  HistogramStats,
  SplitTimerSnapshot,
  EventLoopSnapshot,
  SweepResult,
  SweepStep,
  CapacityPoint,
  CpuSnapshot,
  MemorySnapshot,
  DbPoolSnapshot,
  WarmupResult,
};

// ============================================================================
// Matrix ID
// ============================================================================

export type MatrixId = 'M0' | 'M1' | 'M2' | 'M3' | 'M4' | 'M5';

// ============================================================================
// Environment Snapshot
// ============================================================================

export interface EnvironmentSnapshot {
  nodeVersion: string;
  cpuModel: string;
  cpuCores: number;
  totalMemoryMB: number;
  osVersion: string;
  nodeOptions: string;
  maxOldSpaceSize: number | null;
  dbPoolSize: number;
  postgresVersion: string;
  perfSeed: number;
  capturedAt: string;
}


// ============================================================================
// Report Metadata
// ============================================================================

export interface ReportMetadata {
  schemaVersion: string;
  runId: string;
  gitSha: string;
  environmentSnapshotHash: string;
}

// ============================================================================
// Matrix Report
// ============================================================================

export interface MatrixReport {
  metadata: ReportMetadata;
  matrixId: MatrixId;
  startedAt: string;
  completedAt: string;
  environment: EnvironmentSnapshot;
  warmup: WarmupResult | null;
  sweep: SweepResult | null;
  splitTimers: SplitTimerSnapshot | null;
  heapSnapshots: HeapSnapshot[];
  heapTrend: HeapTrend | null;
  blockRateBuckets: BlockRateBucketResult[];
  snapshotPressure: SnapshotPressureResult | null;
  microBenchmark: MicroBenchmarkResult | null;
  seed: number;
  warnings: string[];
  /** M1 raporu M0'ın runId'sini referans alır (delta hesaplama için) */
  baselineMatrixRef?: string;
}

// ============================================================================
// Overhead Delta (M0 vs M1)
// ============================================================================

/** Her eşlenmiş RPS noktasındaki delta */
export interface PerRPSOverheadDelta {
  rps: number;
  deltaP50Ms: number;
  deltaP95Ms: number;
  deltaP99Ms: number;
  deltaSnapshotFetchP95Ms: number;
  deltaSnapshotFetchP99Ms: number;
  deltaDriftCalcP95Ms: number;
  deltaDriftCalcP99Ms: number;
  deltaEventLoopP99Ms: number;
  deltaCpuTotalPercent: number;
  deltaRssMB: number;
}

export interface OverheadDelta {
  deltaP99Ms: number;
  deltaCpuPercent: number;
  deltaAllocRateMBPerMin: number;
  deltaEventLoopP99Ms: number;
  sustainableRPSDelta: number;
  splitTimerBreakdown: SplitTimerSnapshot;
  /** Her eşlenmiş RPS noktasındaki detaylı delta */
  perRPSDeltas: PerRPSOverheadDelta[];
}

// ============================================================================
// Block Rate (M2)
// ============================================================================

export interface BlockRateBucketResult {
  targetBlockRate: number;
  actualBlockRate: number;
  withinTolerance: boolean;
  distributionFair: boolean;
  /** En kötü penceredeki block rate — debugging kanıtı */
  worstWindowBlockRate: number;
  /** En kötü penceredeki hedeften sapma (mutlak) */
  worstWindowDeviationPct: number;
  latency: HistogramStats;
  blockLatency: HistogramStats;
  acceptLatency: HistogramStats;
  cpu: CpuSnapshot;
  memory: MemorySnapshot;
  durationMin: number;
  blockPenaltyAppliedMs: number;
  requestCount: number;
  blockCount: number;
}

// ============================================================================
// Snapshot Pressure (M3)
// ============================================================================

export interface SnapshotPressureResult {
  warmPath: PathResult;
  coldPath: PathResult;
  coldPathP99ContributionMs: number;
  concurrencySteps: ConcurrencyStep[];
}

export interface PathResult {
  snapshotFetchMs: HistogramStats;
  eventLoop: EventLoopSnapshot;
  pendingAsyncOps: number;
}

export interface ConcurrencyStep {
  concurrency: number;
  snapshotFetchMs: HistogramStats;
  eventLoop: EventLoopSnapshot;
}

// ============================================================================
// GC Pressure (M4)
// ============================================================================

export interface HeapSnapshot {
  timestamp: string;
  trigger: 'interval' | 'threshold' | 'correlation';
  heapUsedMB: number;
  heapTotalMB: number;
  externalMB: number;
  arrayBuffersMB: number;
  v8HeapSizeLimit: number;
  v8TotalHeapSize: number;
  v8UsedHeapSize: number;
  v8MallocedMemory: number;
}

export interface HeapTrend {
  allocRateMBPerMin: number;
  heapGrowthMBPerMin: number;
  /** null = --expose-gc unavailable; number = measured GC pause in ms */
  gcPauseEstimateMs: number | null;
  isLeakSuspected: boolean;
}

// ============================================================================
// Micro-Benchmark (M5)
// ============================================================================

export interface MicroBenchmarkResult {
  triggered: boolean;
  triggerRatio: number;
  triggerReason: 'threshold' | 'forced-simulated';
  wouldTriggerByThreshold: boolean;
  floatOpsPerSec: number;
  scaledIntOpsPerSec: number;
  e2eScaledIntOpsPerSec: number;
  speedupFactor: number;
  e2eSpeedupFactor: number;
  migrationPriority: 'high' | 'medium' | 'low';
  iterations: number;
}

// ============================================================================
// Consolidated Report
// ============================================================================

export interface ConsolidatedReport {
  metadata: ReportMetadata;
  matrices: MatrixReport[];
  overheadDelta: OverheadDelta | null;
  capacityEnvelope: {
    phase7Off: CapacityPoint[];
    phase7On: CapacityPoint[];
  } | null;
  tuningBacklog: TuningItem[];
}

export interface TuningItem {
  id: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
  effort: 'high' | 'medium' | 'low';
  evidence: string;
}
