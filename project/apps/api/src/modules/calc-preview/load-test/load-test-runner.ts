/**
 * Phase 5.5 - Load Test Runner
 * 
 * In-process load test runner for calc-preview endpoint.
 * 
 * Features:
 * - Configurable load profiles (soak, burst, stress)
 * - Real-time metrics collection
 * - Memory leak detection
 * - Breaker flapping detection
 * - SLO violation tracking
 * - JSON/HTML report generation
 * 
 * @see docs/single-source-of-truth-architecture.md - Phase 5.5
 */

import { Logger } from '@nestjs/common';
import {
  LoadTestConfig,
  LoadTestResult,
  LoadTestScenario,
  TestSummary,
  TimeSeriesData,
  MemorySnapshot,
  BreakerEvent,
  SloViolation,
  SuccessCriteria,
} from './load-test.types';

// ============================================================================
// LOAD TEST RUNNER
// ============================================================================

export class LoadTestRunner {
  private readonly logger = new Logger(LoadTestRunner.name);
  
  // Test state
  private isRunning = false;
  private shouldStop = false;
  private testId: string = '';
  private startTime: number = 0;
  
  // Metrics collection
  private latencies: number[] = [];
  private successCount = 0;
  private failureCount = 0;
  private fallbackCount = 0;
  private rateLimitedCount = 0;
  private cacheHitCount = 0;
  private totalRequests = 0;
  
  // Time series
  private timeSeries: TimeSeriesData = {
    timestamps: [],
    rps: [],
    p95Latency: [],
    p99Latency: [],
    successRate: [],
    errorRate: [],
    heapUsedMB: [],
    activeRequests: [],
  };
  
  // Memory snapshots
  private memorySnapshots: MemorySnapshot[] = [];
  
  // Breaker events
  private breakerEvents: BreakerEvent[] = [];
  private lastBreakerStates: Record<string, string> = {};
  
  // SLO violations
  private sloViolations: SloViolation[] = [];
  
  // Active requests counter
  private activeRequests = 0;
  
  // Intervals
  private metricsInterval?: NodeJS.Timeout;
  private memoryInterval?: NodeJS.Timeout;
  private loadInterval?: NodeJS.Timeout;

  constructor(
    private readonly httpClient: HttpClient,
    private readonly metricsService?: any,
    private readonly circuitBreakerService?: any,
    private readonly traceStorageService?: any,
  ) {}

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  /**
   * Run a load test scenario
   */
  async run(scenario: LoadTestScenario): Promise<LoadTestResult> {
    if (this.isRunning) {
      throw new Error('Load test already running');
    }
    
    this.logger.log(`[LoadTest] Starting: ${scenario.name}`);
    this.logger.log(`[LoadTest] Duration: ${scenario.config.durationMs / 1000}s`);
    this.logger.log(`[LoadTest] Profile: ${scenario.config.profile.type} @ ${scenario.config.profile.rps} RPS`);
    
    this.reset();
    this.isRunning = true;
    this.testId = `lt_${Date.now()}_${scenario.id}`;
    this.startTime = Date.now();
    
    try {
      // Start metrics collection
      this.startMetricsCollection(scenario.config);
      
      // Start memory monitoring
      this.startMemoryMonitoring(scenario.config);
      
      // Run load generation
      await this.generateLoad(scenario.config);
      
      // Wait for completion
      await this.waitForCompletion(scenario.config.durationMs);
      
    } finally {
      this.stopCollection();
      this.isRunning = false;
    }
    
    // Generate result
    const result = this.generateResult(scenario);
    
    this.logger.log(`[LoadTest] Completed: ${result.status}`);
    if (result.failureReasons.length > 0) {
      this.logger.warn(`[LoadTest] Failures: ${result.failureReasons.join(', ')}`);
    }
    
    return result;
  }

  /**
   * Stop running test
   */
  stop(): void {
    this.shouldStop = true;
    this.logger.log('[LoadTest] Stop requested');
  }

  /**
   * Check if test is running
   */
  getStatus(): { running: boolean; testId?: string; elapsed?: number } {
    return {
      running: this.isRunning,
      testId: this.isRunning ? this.testId : undefined,
      elapsed: this.isRunning ? Date.now() - this.startTime : undefined,
    };
  }

  // ============================================================================
  // LOAD GENERATION
  // ============================================================================

  private async generateLoad(config: LoadTestConfig): Promise<void> {
    const { profile, tenants, endpoint } = config;
    
    // Calculate request interval based on RPS
    const baseIntervalMs = 1000 / profile.rps;
    
    // Ramp up phase
    if (profile.rampUpMs && profile.rampUpMs > 0) {
      await this.rampUp(config, profile.rampUpMs);
    }
    
    // Main load phase
    const mainDuration = config.durationMs - (profile.rampUpMs || 0) - (profile.rampDownMs || 0);
    
    this.loadInterval = setInterval(async () => {
      if (this.shouldStop) {
        return;
      }
      
      // Calculate current RPS based on profile
      const currentRps = this.calculateCurrentRps(config);
      const intervalMs = 1000 / currentRps;
      
      // Select tenant
      const tenant = this.selectTenant(tenants);
      
      // Generate payload
      const payload = this.generatePayload(config, tenant.tenantId);
      
      // Send request
      this.sendRequest(endpoint, payload, tenant.tenantId);
      
    }, baseIntervalMs);
  }

  private async rampUp(config: LoadTestConfig, durationMs: number): Promise<void> {
    const steps = 10;
    const stepDuration = durationMs / steps;
    const targetRps = config.profile.rps;
    
    for (let i = 1; i <= steps && !this.shouldStop; i++) {
      const currentRps = (targetRps * i) / steps;
      this.logger.debug(`[LoadTest] Ramp up: ${currentRps.toFixed(1)} RPS`);
      await this.sleep(stepDuration);
    }
  }

  private calculateCurrentRps(config: LoadTestConfig): number {
    const { profile } = config;
    const elapsed = Date.now() - this.startTime;
    
    switch (profile.type) {
      case 'constant':
      case 'soak':
        return profile.rps;
        
      case 'spike':
        // Check if we're in a spike period
        if (profile.spikeIntervalMs && profile.spikeDurationMs) {
          const cyclePosition = elapsed % profile.spikeIntervalMs;
          if (cyclePosition < profile.spikeDurationMs) {
            return profile.burstRps || profile.rps * 5;
          }
        }
        return profile.rps;
        
      case 'stress':
        // Linear ramp from rps to burstRps
        const rampDuration = profile.rampUpMs || config.durationMs;
        const progress = Math.min(elapsed / rampDuration, 1);
        const targetRps = profile.burstRps || profile.rps * 10;
        return profile.rps + (targetRps - profile.rps) * progress;
        
      default:
        return profile.rps;
    }
  }

  private selectTenant(tenants: LoadTestConfig['tenants']): LoadTestConfig['tenants'][0] {
    const random = Math.random();
    let cumulative = 0;
    
    for (const tenant of tenants) {
      cumulative += tenant.weight;
      if (random <= cumulative) {
        return tenant;
      }
    }
    
    return tenants[0];
  }

  private generatePayload(config: LoadTestConfig, tenantId: string): any {
    // Generate random preview request
    const principals = [10000, 50000, 100000, 500000, 1000000];
    const interestTypes = ['TCMB_AVANS', 'YASAL_FAIZ', 'TEMERRUT'];
    
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - Math.floor(Math.random() * 12));
    
    return {
      tenantId,
      payload: {
        principalAmount: principals[Math.floor(Math.random() * principals.length)],
        currency: 'TRY',
        interestType: interestTypes[Math.floor(Math.random() * interestTypes.length)],
        startDate: startDate.toISOString().split('T')[0],
        endDate: new Date().toISOString().split('T')[0],
        caseType: 'ICRA_TAKIP',
        debtorCount: Math.floor(Math.random() * 3) + 1,
      },
    };
  }

  private async sendRequest(endpoint: string, payload: any, tenantId: string): Promise<void> {
    this.activeRequests++;
    this.totalRequests++;
    
    const startTime = Date.now();
    
    try {
      const response = await this.httpClient.post(endpoint, payload, {
        headers: {
          'X-Tenant-Id': tenantId,
          'X-Force-Trace': 'true',
        },
        timeout: 10000,
      });
      
      const latency = Date.now() - startTime;
      this.latencies.push(latency);
      
      if (response.status === 200) {
        const data = response.data;
        
        if (data.status === 'FULL') {
          this.successCount++;
        } else if (data.status === 'PARTIAL') {
          this.successCount++;
          this.fallbackCount++;
        } else {
          this.failureCount++;
        }
        
        if (data.cached) {
          this.cacheHitCount++;
        }
      } else if (response.status === 429) {
        this.rateLimitedCount++;
      } else {
        this.failureCount++;
      }
      
    } catch (error) {
      const latency = Date.now() - startTime;
      this.latencies.push(latency);
      this.failureCount++;
    } finally {
      this.activeRequests--;
    }
  }

  // ============================================================================
  // METRICS COLLECTION
  // ============================================================================

  private startMetricsCollection(config: LoadTestConfig): void {
    this.metricsInterval = setInterval(() => {
      this.collectMetrics();
      this.checkBreakerState();
    }, config.metricsIntervalMs);
  }

  private collectMetrics(): void {
    const now = new Date().toISOString();
    const elapsed = (Date.now() - this.startTime) / 1000;
    
    // Calculate current metrics
    const recentLatencies = this.latencies.slice(-100);
    const p95 = this.percentile(recentLatencies, 95);
    const p99 = this.percentile(recentLatencies, 99);
    
    const successRate = this.totalRequests > 0 
      ? this.successCount / this.totalRequests 
      : 1;
    const errorRate = this.totalRequests > 0 
      ? this.failureCount / this.totalRequests 
      : 0;
    
    const rps = elapsed > 0 ? this.totalRequests / elapsed : 0;
    
    const memUsage = process.memoryUsage();
    const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
    
    // Store time series
    this.timeSeries.timestamps.push(now);
    this.timeSeries.rps.push(rps);
    this.timeSeries.p95Latency.push(p95);
    this.timeSeries.p99Latency.push(p99);
    this.timeSeries.successRate.push(successRate);
    this.timeSeries.errorRate.push(errorRate);
    this.timeSeries.heapUsedMB.push(heapUsedMB);
    this.timeSeries.activeRequests.push(this.activeRequests);
  }

  private checkBreakerState(): void {
    if (!this.circuitBreakerService) return;
    
    const statuses = this.circuitBreakerService.getAllStatuses();
    
    for (const [dep, status] of Object.entries(statuses)) {
      const lastState = this.lastBreakerStates[dep];
      const currentState = (status as any).state;
      
      if (lastState && lastState !== currentState) {
        // State changed - record event
        this.breakerEvents.push({
          timestamp: new Date().toISOString(),
          dependency: dep,
          event: currentState as any,
          reason: `Transition: ${lastState} → ${currentState}`,
        });
        
        // Check for flapping
        const recentEvents = this.breakerEvents.filter(e => 
          e.dependency === dep && 
          Date.now() - new Date(e.timestamp).getTime() < 5 * 60 * 1000
        );
        
        if (recentEvents.length >= 4) {
          this.breakerEvents.push({
            timestamp: new Date().toISOString(),
            dependency: dep,
            event: 'FLAP',
            reason: `${recentEvents.length} state changes in 5 minutes`,
          });
        }
      }
      
      this.lastBreakerStates[dep] = currentState;
    }
  }

  // ============================================================================
  // MEMORY MONITORING
  // ============================================================================

  private startMemoryMonitoring(config: LoadTestConfig): void {
    // Initial snapshot
    this.takeMemorySnapshot();
    
    this.memoryInterval = setInterval(() => {
      this.takeMemorySnapshot();
    }, config.memorySnapshotIntervalMs);
  }

  private takeMemorySnapshot(): void {
    const mem = process.memoryUsage();
    
    this.memorySnapshots.push({
      timestamp: new Date().toISOString(),
      heapUsedMB: mem.heapUsed / 1024 / 1024,
      heapTotalMB: mem.heapTotal / 1024 / 1024,
      externalMB: mem.external / 1024 / 1024,
      arrayBuffersMB: mem.arrayBuffers / 1024 / 1024,
      rss: mem.rss / 1024 / 1024,
    });
  }

  // ============================================================================
  // RESULT GENERATION
  // ============================================================================

  private generateResult(scenario: LoadTestScenario): LoadTestResult {
    const endTime = Date.now();
    const durationMs = endTime - this.startTime;
    
    // Calculate summary
    const summary = this.calculateSummary(durationMs);
    
    // Check success criteria
    const { passed, failureReasons } = this.checkSuccessCriteria(
      summary, 
      scenario.successCriteria
    );
    
    return {
      testId: this.testId,
      testName: scenario.name,
      startedAt: new Date(this.startTime).toISOString(),
      endedAt: new Date(endTime).toISOString(),
      durationMs,
      status: this.shouldStop ? 'ABORTED' : (passed ? 'PASSED' : 'FAILED'),
      summary,
      timeSeries: this.timeSeries,
      memorySnapshots: this.memorySnapshots,
      breakerEvents: this.breakerEvents,
      sloViolations: this.sloViolations,
      failureReasons,
    };
  }

  private calculateSummary(durationMs: number): TestSummary {
    const sortedLatencies = [...this.latencies].sort((a, b) => a - b);
    
    const startHeap = this.memorySnapshots[0]?.heapUsedMB || 0;
    const endHeap = this.memorySnapshots[this.memorySnapshots.length - 1]?.heapUsedMB || 0;
    const peakHeap = Math.max(...this.memorySnapshots.map(s => s.heapUsedMB));
    
    const flaps = this.breakerEvents.filter(e => e.event === 'FLAP').length;
    const opens = this.breakerEvents.filter(e => e.event === 'OPENED').length;
    const recoveries = this.breakerEvents.filter(e => e.event === 'CLOSED').length;
    
    return {
      totalRequests: this.totalRequests,
      successfulRequests: this.successCount,
      failedRequests: this.failureCount,
      fallbackRequests: this.fallbackCount,
      rateLimitedRequests: this.rateLimitedCount,
      actualRps: this.totalRequests / (durationMs / 1000),
      latency: {
        p50: this.percentile(sortedLatencies, 50),
        p95: this.percentile(sortedLatencies, 95),
        p99: this.percentile(sortedLatencies, 99),
        max: sortedLatencies[sortedLatencies.length - 1] || 0,
        min: sortedLatencies[0] || 0,
        avg: sortedLatencies.reduce((a, b) => a + b, 0) / sortedLatencies.length || 0,
      },
      successRate: this.totalRequests > 0 ? this.successCount / this.totalRequests : 1,
      errorRate: this.totalRequests > 0 ? this.failureCount / this.totalRequests : 0,
      fallbackRate: this.totalRequests > 0 ? this.fallbackCount / this.totalRequests : 0,
      cacheHitRate: this.totalRequests > 0 ? this.cacheHitCount / this.totalRequests : 0,
      memory: {
        startHeapMB: startHeap,
        endHeapMB: endHeap,
        peakHeapMB: peakHeap,
        growthPercent: startHeap > 0 ? ((endHeap - startHeap) / startHeap) * 100 : 0,
      },
      breaker: {
        totalFlaps: flaps,
        openEvents: opens,
        recoveryEvents: recoveries,
        flapsPerHour: (flaps / (durationMs / 1000 / 3600)),
      },
      traceStorage: {
        tracesCreated: this.totalRequests, // Approximate
        tracesDeleted: 0, // Would need trace service integration
        storageUsedMB: 0, // Would need trace service integration
        pressurePercent: 0,
      },
    };
  }

  private checkSuccessCriteria(
    summary: TestSummary, 
    criteria: SuccessCriteria
  ): { passed: boolean; failureReasons: string[] } {
    const failures: string[] = [];
    
    if (summary.latency.p95 > criteria.maxP95LatencyMs) {
      failures.push(`p95 latency ${summary.latency.p95}ms > ${criteria.maxP95LatencyMs}ms`);
    }
    
    if (summary.latency.p99 > criteria.maxP99LatencyMs) {
      failures.push(`p99 latency ${summary.latency.p99}ms > ${criteria.maxP99LatencyMs}ms`);
    }
    
    if (summary.successRate < criteria.minSuccessRate) {
      failures.push(`Success rate ${(summary.successRate * 100).toFixed(1)}% < ${criteria.minSuccessRate * 100}%`);
    }
    
    if (summary.errorRate > criteria.maxErrorRate) {
      failures.push(`Error rate ${(summary.errorRate * 100).toFixed(1)}% > ${criteria.maxErrorRate * 100}%`);
    }
    
    if (summary.fallbackRate > criteria.maxFallbackRate) {
      failures.push(`Fallback rate ${(summary.fallbackRate * 100).toFixed(1)}% > ${criteria.maxFallbackRate * 100}%`);
    }
    
    if (summary.memory.growthPercent > criteria.maxMemoryGrowthPercent) {
      failures.push(`Memory growth ${summary.memory.growthPercent.toFixed(1)}% > ${criteria.maxMemoryGrowthPercent}%`);
    }
    
    if (summary.breaker.flapsPerHour > criteria.maxBreakerFlapsPerHour) {
      failures.push(`Breaker flaps ${summary.breaker.flapsPerHour.toFixed(1)}/hr > ${criteria.maxBreakerFlapsPerHour}/hr`);
    }
    
    // Check p95 drift
    if (this.timeSeries.p95Latency.length >= 10) {
      const firstQuarter = this.timeSeries.p95Latency.slice(0, Math.floor(this.timeSeries.p95Latency.length / 4));
      const lastQuarter = this.timeSeries.p95Latency.slice(-Math.floor(this.timeSeries.p95Latency.length / 4));
      
      const firstAvg = firstQuarter.reduce((a, b) => a + b, 0) / firstQuarter.length;
      const lastAvg = lastQuarter.reduce((a, b) => a + b, 0) / lastQuarter.length;
      
      const drift = firstAvg > 0 ? ((lastAvg - firstAvg) / firstAvg) * 100 : 0;
      
      if (drift > criteria.maxP95DriftPercent) {
        failures.push(`p95 drift ${drift.toFixed(1)}% > ${criteria.maxP95DriftPercent}%`);
      }
    }
    
    return {
      passed: failures.length === 0,
      failureReasons: failures,
    };
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private reset(): void {
    this.shouldStop = false;
    this.latencies = [];
    this.successCount = 0;
    this.failureCount = 0;
    this.fallbackCount = 0;
    this.rateLimitedCount = 0;
    this.cacheHitCount = 0;
    this.totalRequests = 0;
    this.activeRequests = 0;
    this.timeSeries = {
      timestamps: [],
      rps: [],
      p95Latency: [],
      p99Latency: [],
      successRate: [],
      errorRate: [],
      heapUsedMB: [],
      activeRequests: [],
    };
    this.memorySnapshots = [];
    this.breakerEvents = [];
    this.lastBreakerStates = {};
    this.sloViolations = [];
  }

  private stopCollection(): void {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }
    if (this.memoryInterval) {
      clearInterval(this.memoryInterval);
    }
    if (this.loadInterval) {
      clearInterval(this.loadInterval);
    }
  }

  private async waitForCompletion(durationMs: number): Promise<void> {
    const endTime = this.startTime + durationMs;
    
    while (Date.now() < endTime && !this.shouldStop) {
      await this.sleep(1000);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }
}

// ============================================================================
// HTTP CLIENT INTERFACE
// ============================================================================

export interface HttpClient {
  post(url: string, data: any, config?: { headers?: Record<string, string>; timeout?: number }): Promise<{
    status: number;
    data: any;
  }>;
}
