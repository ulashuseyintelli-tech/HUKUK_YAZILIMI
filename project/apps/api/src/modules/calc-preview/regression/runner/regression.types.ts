/**
 * Phase 5.2 - Regression Types
 * 
 * Golden scenario ve regression test tipleri
 */

import { CalcPreviewRequest, CalcPreviewResponse } from '../../types';
import { TraceBundle } from '../../trace';

// ============================================================================
// SCENARIO TYPES
// ============================================================================

export interface GoldenScenario {
  id: string;
  name: string;
  description?: string;
  tags?: string[];
  
  request: {
    tenantId: string;
    payload: CalcPreviewRequest;
    headers?: Record<string, string>;
  };
  
  expect: ScenarioExpectations;
}

export interface ScenarioExpectations {
  /** Beklenen status */
  status: 'OK' | 'DEGRADED' | 'UNAVAILABLE';
  
  /** Parasal toleranslar */
  tolerances: {
    /** Mutlak tolerans (kuruş) */
    moneyAbs: number;
    /** Göreli tolerans (oran) */
    moneyRel: number;
  };
  
  /** Zorunlu alanlar ve değerler */
  must: Record<string, unknown>;
  
  /** Yasak değerler */
  forbid: Record<string, unknown[]>;
  
  /** Trace assertion'ları */
  traceAssertions: TraceAssertions;
}

export interface TraceAssertions {
  /** PII içermemeli */
  noPII: boolean;
  
  /** Max süre (ms) */
  maxDurationMs: number;
  
  /** Bu dependency'ler OPEN olmamalı */
  breakerNeverOpen?: string[];
  
  /** Cache hit rate minimumları */
  cacheNamespaceHitRateMin?: Record<string, number>;
  
  /** Fallback olmamalı */
  noFallback?: boolean;
  
  /** Evidence zorunlu (fallback varsa) */
  mustHaveEvidence?: boolean;
}

// ============================================================================
// COMPARISON TYPES
// ============================================================================

export type DiffSeverity = 'NOISE' | 'MINOR' | 'MAJOR' | 'CRITICAL';
export type DiffCategory = 'ROUNDING' | 'ORDERING' | 'FORMAT' | 'VALUE' | 'MISSING' | 'POLICY' | 'TIMING';

export interface ComparisonDiff {
  path: string;
  expected: unknown;
  actual: unknown;
  severity: DiffSeverity;
  category: DiffCategory;
  message?: string;
}

export interface ComparisonResult {
  scenarioId: string;
  scenarioName: string;
  passed: boolean;
  severity: DiffSeverity;
  diffs: ComparisonDiff[];
  resultDiffs: ComparisonDiff[];
  traceDiffs: ComparisonDiff[];
  assertionFailures: AssertionFailure[];
  durationMs: number;
  timestamp: string;
}

export interface AssertionFailure {
  type: 'must' | 'forbid' | 'trace';
  path: string;
  expected: unknown;
  actual: unknown;
  message: string;
}

// ============================================================================
// RUNNER TYPES
// ============================================================================

export interface RegressionRunnerConfig {
  /** Scenario dosyaları dizini */
  scenariosDir: string;
  
  /** Baseline dosyaları dizini */
  baselinesDir: string;
  
  /** Allowlist dosyaları dizini */
  allowlistsDir: string;
  
  /** API base URL */
  apiBaseUrl: string;
  
  /** Paralel çalıştırma sayısı */
  concurrency: number;
  
  /** Timeout (ms) */
  timeoutMs: number;
  
  /** Fail on severity */
  failOnSeverity: DiffSeverity;
  
  /** Update baselines */
  updateBaselines: boolean;
  
  /** Force trace */
  forceTrace: boolean;
}

export interface RegressionRunResult {
  totalScenarios: number;
  passed: number;
  failed: number;
  skipped: number;
  
  bySeverity: Record<DiffSeverity, number>;
  
  results: ComparisonResult[];
  
  durationMs: number;
  timestamp: string;
}

// ============================================================================
// ALLOWLIST TYPES
// ============================================================================

export interface RoundingTolerance {
  /** Parasal alanlar için mutlak tolerans */
  moneyAbsolute: number;
  
  /** Parasal alanlar için göreli tolerans */
  moneyRelative: number;
  
  /** Yüzde alanları için tolerans */
  percentAbsolute: number;
}

export interface KnownDiff {
  scenarioId: string;
  path: string;
  reason: string;
  expiresAt?: string;
}

export interface FlakyField {
  path: string;
  reason: string;
  action: 'ignore' | 'normalize';
}

// ============================================================================
// BASELINE TYPES
// ============================================================================

export interface ResultBaseline {
  scenarioId: string;
  generatedAt: string;
  generatedBy: string;
  result: CalcPreviewResponse;
}

export interface TraceBaseline {
  scenarioId: string;
  generatedAt: string;
  generatedBy: string;
  trace: Partial<TraceBundle>;
}
