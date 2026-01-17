/**
 * Phase 5.5 - Load/Soak Test Types
 * 
 * "Ferrari'yi dyno'ya sokmadan otoyola çıkma"
 * 
 * Test hedefleri:
 * - 1 saat soak (sabit yük)
 * - Burst + steady mix
 * - p95/p99 drift kontrolü
 * - Memory leak tespiti
 * - Breaker flapping kontrolü
 * - Trace retention pressure
 * 
 * @see docs/single-source-of-truth-architecture.md - Phase 5.5
 */

// ============================================================================
// TEST CONFIGURATION
// ============================================================================

export interface LoadTestConfig {
  /** Test name */
  name: string;
  
  /** Test duration (ms) */
  durationMs: number;
  
  /** Target endpoint */
  endpoint: string;
  
  /** Load profile */
  profile: LoadProfile;
  
  /** Tenant distribution */
  tenants: TenantDistribution[];
  
  /** Request payload generator */
  payloadGenerator: 'random' | 'golden-scenarios' | 'mixed';
  
  /** Metrics collection interval (ms) */
  metricsIntervalMs: number;
  
  /** Memory snapshot interval (ms) */
  memorySnapshotIntervalMs: number;
  
  /** Enable chaos injection during test */
  enableChaos: boolean;
  
  /** Chaos injection probability (0-1) */
  chaosProbability: number;
}

export interface LoadProfile {
  /** Profile type */
  type: 'constant' | 'ramp' | 'spike' | 'soak' | 'stress';
  
  /** Requests per second (steady state) */
  rps: number;
  
  /** Burst RPS (for spike profile) */
  burstRps?: number;
  
  /** Ramp up duration (ms) */
  rampUpMs?: number;
  
  /** Ramp down duration (ms) */
  rampDownMs?: number;
  
  /** Spike duration (ms) */
  spikeDurationMs?: number;
  
  /** Spike interval (ms) */
  spikeIntervalMs?: number;
}

export interface TenantDistribution {
  tenantId: string;
  weight: number; // 0-1, sum should be 1
  isPremium: boolean;
}

// ============================================================================
// TEST SCENARIOS
// ============================================================================

export interface LoadTestScenario {
  id: string;
  name: string;
  description: string;
  config: LoadTestConfig;
  successCriteria: SuccessCriteria;
}

export interface SuccessCriteria {
  /** Max p95 latency (ms) */
  maxP95LatencyMs: number;
  
  /** Max p99 latency (ms) */
  maxP99LatencyMs: number;
  
  /** Min success rate (0-1) */
  minSuccessRate: number;
  
  /** Max error rate (0-1) */
  maxErrorRate: number;
  
  /** Max fallback rate (0-1) */
  maxFallbackRate: number;
  
  /** Max memory growth (%) */
  maxMemoryGrowthPercent: number;
  
  /** Max breaker flaps per hour */
  maxBreakerFlapsPerHour: number;
  
  /** Max p95 drift (%) - latency increase over time */
  maxP95DriftPercent: number;
  
  /** Max trace storage pressure (%) */
  maxTraceStoragePressurePercent: number;
}

// ============================================================================
// TEST RESULTS
// ============================================================================

export interface LoadTestResult {
  /** Test ID */
  testId: string;
  
  /** Test name */
  testName: string;
  
  /** Start time */
  startedAt: string;
  
  /** End time */
  endedAt: string;
  
  /** Duration (ms) */
  durationMs: number;
  
  /** Overall status */
  status: 'PASSED' | 'FAILED' | 'ABORTED';
  
  /** Summary metrics */
  summary: TestSummary;
  
  /** Time series data */
  timeSeries: TimeSeriesData;
  
  /** Memory snapshots */
  memorySnapshots: MemorySnapshot[];
  
  /** Breaker events */
  breakerEvents: BreakerEvent[];
  
  /** SLO violations */
  sloViolations: SloViolation[];
  
  /** Failure reasons (if failed) */
  failureReasons: string[];
}

export interface TestSummary {
  /** Total requests */
  totalRequests: number;
  
  /** Successful requests */
  successfulRequests: number;
  
  /** Failed requests */
  failedRequests: number;
  
  /** Fallback requests */
  fallbackRequests: number;
  
  /** Rate limited requests */
  rateLimitedRequests: number;
  
  /** Actual RPS (average) */
  actualRps: number;
  
  /** Latency percentiles */
  latency: {
    p50: number;
    p95: number;
    p99: number;
    max: number;
    min: number;
    avg: number;
  };
  
  /** Success rate */
  successRate: number;
  
  /** Error rate */
  errorRate: number;
  
  /** Fallback rate */
  fallbackRate: number;
  
  /** Cache hit rate */
  cacheHitRate: number;
  
  /** Memory usage */
  memory: {
    startHeapMB: number;
    endHeapMB: number;
    peakHeapMB: number;
    growthPercent: number;
  };
  
  /** Breaker stats */
  breaker: {
    totalFlaps: number;
    openEvents: number;
    recoveryEvents: number;
    flapsPerHour: number;
  };
  
  /** Trace storage stats */
  traceStorage: {
    tracesCreated: number;
    tracesDeleted: number;
    storageUsedMB: number;
    pressurePercent: number;
  };
}

export interface TimeSeriesData {
  /** Timestamps */
  timestamps: string[];
  
  /** RPS over time */
  rps: number[];
  
  /** p95 latency over time */
  p95Latency: number[];
  
  /** p99 latency over time */
  p99Latency: number[];
  
  /** Success rate over time */
  successRate: number[];
  
  /** Error rate over time */
  errorRate: number[];
  
  /** Heap usage over time (MB) */
  heapUsedMB: number[];
  
  /** Active requests over time */
  activeRequests: number[];
}

export interface MemorySnapshot {
  timestamp: string;
  heapUsedMB: number;
  heapTotalMB: number;
  externalMB: number;
  arrayBuffersMB: number;
  rss: number;
}

export interface BreakerEvent {
  timestamp: string;
  dependency: string;
  event: 'OPENED' | 'HALF_OPEN' | 'CLOSED' | 'FLAP';
  reason?: string;
}

export interface SloViolation {
  timestamp: string;
  metric: string;
  threshold: number;
  actual: number;
  severity: 'WARNING' | 'CRITICAL';
}

// ============================================================================
// PREDEFINED SCENARIOS
// ============================================================================

export const SOAK_TEST_1H: LoadTestScenario = {
  id: 'soak-1h',
  name: '1 Hour Soak Test',
  description: 'Sabit yük altında 1 saat dayanıklılık testi',
  config: {
    name: 'soak-1h',
    durationMs: 60 * 60 * 1000, // 1 hour
    endpoint: '/calc/preview/light',
    profile: {
      type: 'soak',
      rps: 10, // 10 req/sec steady
      rampUpMs: 60 * 1000, // 1 min ramp up
      rampDownMs: 30 * 1000, // 30 sec ramp down
    },
    tenants: [
      { tenantId: 't_demo', weight: 0.6, isPremium: false },
      { tenantId: 't_premium', weight: 0.3, isPremium: true },
      { tenantId: 't_test', weight: 0.1, isPremium: false },
    ],
    payloadGenerator: 'mixed',
    metricsIntervalMs: 10 * 1000, // 10 sec
    memorySnapshotIntervalMs: 60 * 1000, // 1 min
    enableChaos: false,
    chaosProbability: 0,
  },
  successCriteria: {
    maxP95LatencyMs: 200,
    maxP99LatencyMs: 500,
    minSuccessRate: 0.99,
    maxErrorRate: 0.01,
    maxFallbackRate: 0.02,
    maxMemoryGrowthPercent: 20, // Max 20% memory growth
    maxBreakerFlapsPerHour: 5,
    maxP95DriftPercent: 10, // Max 10% latency increase
    maxTraceStoragePressurePercent: 80,
  },
};

export const BURST_TEST: LoadTestScenario = {
  id: 'burst-test',
  name: 'Burst Load Test',
  description: 'Rate limit ve burst capacity testi',
  config: {
    name: 'burst-test',
    durationMs: 10 * 60 * 1000, // 10 minutes
    endpoint: '/calc/preview/light',
    profile: {
      type: 'spike',
      rps: 5, // 5 req/sec steady
      burstRps: 50, // 50 req/sec burst
      spikeDurationMs: 10 * 1000, // 10 sec spike
      spikeIntervalMs: 60 * 1000, // Every 1 min
    },
    tenants: [
      { tenantId: 't_demo', weight: 0.8, isPremium: false },
      { tenantId: 't_premium', weight: 0.2, isPremium: true },
    ],
    payloadGenerator: 'random',
    metricsIntervalMs: 5 * 1000, // 5 sec
    memorySnapshotIntervalMs: 30 * 1000, // 30 sec
    enableChaos: false,
    chaosProbability: 0,
  },
  successCriteria: {
    maxP95LatencyMs: 300, // Higher during burst
    maxP99LatencyMs: 1000,
    minSuccessRate: 0.95, // Lower due to rate limiting
    maxErrorRate: 0.05,
    maxFallbackRate: 0.05,
    maxMemoryGrowthPercent: 30,
    maxBreakerFlapsPerHour: 10,
    maxP95DriftPercent: 20,
    maxTraceStoragePressurePercent: 90,
  },
};

export const CHAOS_SOAK_TEST: LoadTestScenario = {
  id: 'chaos-soak',
  name: 'Chaos Soak Test',
  description: 'Fault injection ile dayanıklılık testi',
  config: {
    name: 'chaos-soak',
    durationMs: 30 * 60 * 1000, // 30 minutes
    endpoint: '/calc/preview/light',
    profile: {
      type: 'soak',
      rps: 5, // Lower RPS with chaos
      rampUpMs: 30 * 1000,
      rampDownMs: 30 * 1000,
    },
    tenants: [
      { tenantId: 't_demo', weight: 0.7, isPremium: false },
      { tenantId: 't_premium', weight: 0.3, isPremium: true },
    ],
    payloadGenerator: 'golden-scenarios',
    metricsIntervalMs: 10 * 1000,
    memorySnapshotIntervalMs: 60 * 1000,
    enableChaos: true,
    chaosProbability: 0.1, // 10% chaos injection
  },
  successCriteria: {
    maxP95LatencyMs: 500, // Higher with chaos
    maxP99LatencyMs: 2000,
    minSuccessRate: 0.90, // Lower with chaos
    maxErrorRate: 0.10,
    maxFallbackRate: 0.15, // Higher fallback expected
    maxMemoryGrowthPercent: 25,
    maxBreakerFlapsPerHour: 20, // More flaps expected
    maxP95DriftPercent: 30,
    maxTraceStoragePressurePercent: 85,
  },
};

export const STRESS_TEST: LoadTestScenario = {
  id: 'stress-test',
  name: 'Stress Test',
  description: 'Sistemin kırılma noktasını bulma',
  config: {
    name: 'stress-test',
    durationMs: 15 * 60 * 1000, // 15 minutes
    endpoint: '/calc/preview/light',
    profile: {
      type: 'stress',
      rps: 5, // Start low
      burstRps: 100, // Ramp to high
      rampUpMs: 10 * 60 * 1000, // 10 min ramp
      rampDownMs: 2 * 60 * 1000, // 2 min ramp down
    },
    tenants: [
      { tenantId: 't_stress', weight: 1.0, isPremium: false },
    ],
    payloadGenerator: 'random',
    metricsIntervalMs: 5 * 1000,
    memorySnapshotIntervalMs: 30 * 1000,
    enableChaos: false,
    chaosProbability: 0,
  },
  successCriteria: {
    maxP95LatencyMs: 1000, // Higher tolerance
    maxP99LatencyMs: 3000,
    minSuccessRate: 0.80, // Lower - finding limits
    maxErrorRate: 0.20,
    maxFallbackRate: 0.20,
    maxMemoryGrowthPercent: 50,
    maxBreakerFlapsPerHour: 30,
    maxP95DriftPercent: 50,
    maxTraceStoragePressurePercent: 95,
  },
};
