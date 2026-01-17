/**
 * Phase 5.3 - Chaos Types
 * 
 * Fault injection ve chaos test tipleri
 */

import { DependencyName, CircuitState } from '../circuit-breaker';
import { DependencyOutcome } from '../trace';

// ============================================================================
// FAULT INJECTION TYPES
// ============================================================================

export type FaultMode = 
  | 'DELAY'           // Gecikme ekle
  | 'TIMEOUT'         // Timeout'a bırak
  | 'ERROR_500'       // 500 Internal Server Error
  | 'ERROR_503'       // 503 Service Unavailable
  | 'INVALID_RESPONSE'// Domain-level invalid payload
  | 'PARTIAL_DATA'    // Eksik/kısmi veri
  | 'EMPTY_RESPONSE'; // Boş response

export interface FaultInjectionConfig {
  /** Hedef dependency */
  dependency: DependencyName;
  
  /** Fault modu */
  mode: FaultMode;
  
  /** Gecikme süresi (DELAY modu için) */
  delayMs?: number;
  
  /** Timeout süresi (TIMEOUT modu için) */
  timeoutMs?: number;
  
  /** Hata mesajı (ERROR modları için) */
  errorMessage?: string;
  
  /** Olasılık (0-1, default 1.0) */
  probability?: number;
  
  /** Süre (ms, sonra otomatik temizle) */
  durationMs?: number;
  
  /** Başlangıç zamanı */
  startedAt?: string;
}

export interface ActiveInjection extends FaultInjectionConfig {
  id: string;
  startedAt: string;
  expiresAt?: string;
  triggerCount: number;
}

// ============================================================================
// CHAOS SCENARIO TYPES
// ============================================================================

export interface ChaosScenario {
  id: string;
  name: string;
  description?: string;
  tags?: string[];
  
  /** Injection konfigürasyonu */
  inject: FaultInjectionConfig;
  
  /** Test request'i */
  request?: {
    tenantId: string;
    payload: Record<string, unknown>;
  };
  
  /** Beklentiler */
  expect: ChaosExpectations;
}

export interface ChaosExpectations {
  /** Beklenen result status */
  'result.status'?: 'OK' | 'DEGRADED' | 'UNAVAILABLE';
  
  /** Dependency outcome beklentileri */
  dependencies?: Record<string, { outcome: DependencyOutcome }>;
  
  /** Circuit breaker state beklentileri */
  breaker?: Record<string, { state: CircuitState }>;
  
  /** Trace beklentileri */
  trace?: {
    mustContainEvidence?: boolean;
    maxDurationMs?: number;
  };
  
  /** UX guidance beklentileri */
  uxGuidance?: {
    recommendedAction?: string;
  };
}

// ============================================================================
// CHAOS RUNNER TYPES
// ============================================================================

export interface ChaosRunnerConfig {
  /** Scenario dosyaları dizini */
  scenariosDir: string;
  
  /** API base URL */
  apiBaseUrl: string;
  
  /** Timeout (ms) */
  timeoutMs: number;
  
  /** Cleanup after each scenario */
  cleanupAfterEach: boolean;
}

export interface ChaosTestResult {
  scenarioId: string;
  scenarioName: string;
  passed: boolean;
  failures: ChaosAssertionFailure[];
  durationMs: number;
  timestamp: string;
  
  /** Actual values for debugging */
  actual?: {
    resultStatus?: string;
    dependencies?: Record<string, { outcome: string }>;
    breakerStates?: Record<string, { state: string }>;
    hasEvidence?: boolean;
  };
}

export interface ChaosAssertionFailure {
  path: string;
  expected: unknown;
  actual: unknown;
  message: string;
}

export interface ChaosRunResult {
  totalScenarios: number;
  passed: number;
  failed: number;
  results: ChaosTestResult[];
  durationMs: number;
  timestamp: string;
}
