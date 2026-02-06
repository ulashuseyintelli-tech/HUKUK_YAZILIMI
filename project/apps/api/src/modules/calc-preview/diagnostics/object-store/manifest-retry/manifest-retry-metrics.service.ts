/**
 * Manifest Retry Metrics Service
 * 
 * Phase 10.1.7 - Circuit Breaker Metrics + Queue/DLQ Metrics
 * 
 * Prometheus-compatible metrics for manifest retry worker:
 * - Circuit breaker state (one-hot gauge)
 * - Circuit breaker transitions (counter with from/to/reason labels)
 * - Circuit breaker trips (counter with trip_reason label)
 * - Open duration gauge
 * - Queue size gauge (by status)
 * - Job duration histogram (by outcome)
 * - DLQ size gauge (by status)
 * - DLQ oldest age gauge
 * - Job processing metrics
 * 
 * FORBIDDEN LABELS: bundleId, tenantId, jobId, userId (cardinality explosion)
 * 
 * @see .kiro/specs/phase-10-retry-signature/PHASE-10-WORKER-ARCHITECTURE.md
 */

import { Injectable, Logger } from '@nestjs/common';
import { IWorkerMetrics, CircuitBreakerState } from './manifest-retry-worker.service';
import { ManifestErrorCode } from './manifest-error-classifier';
import { RetryQueueStatus, DoneReason } from './manifest-retry.types';

// ============================================================================
// Types
// ============================================================================

/** CB state values (one-hot) */
export type CBState = 'closed' | 'open' | 'half_open';

/** CB transition reasons (low cardinality) */
export type CBTransitionReason = 
  | 'threshold_reached'  // consecutive failures hit threshold
  | 'reset_timeout'      // reset timeout elapsed → half_open
  | 'probe_success'      // half_open probe succeeded → closed
  | 'probe_failure'      // half_open probe failed → open
  | 'manual'             // admin manual reset
  | 'forced_open'        // admin forced open
  | 'unknown';

/** CB trip reasons (low cardinality) */
export type CBTripReason = 'timeout' | '5xx' | 'connection_reset' | 'unknown';

/** Job duration outcome (mapped from DoneReason + status) */
export type JobDurationOutcome = 'success' | 'noop' | 'dlq' | 'retry_scheduled';

/** Histogram bucket configuration */
export const DURATION_HISTOGRAM_BUCKETS = [0.1, 0.25, 0.5, 1, 2.5, 5, 10, 20, 40, 80] as const;

/** Histogram data structure */
export interface HistogramData {
  buckets: number[];  // cumulative counts per bucket
  sum: number;
  count: number;
}

/** Metrics snapshot for testing/export */
export interface ManifestRetryMetricsSnapshot {
  cbState: Record<CBState, number>;
  cbTransitions: Array<{
    from: CBState;
    to: CBState;
    reason: CBTransitionReason;
    count: number;
  }>;
  cbTrips: Record<CBTripReason, number>;
  cbOpenSeconds: number;
  queueSize: Record<RetryQueueStatus, number>;
  dlqSize: Record<'DLQ_OPEN' | 'DLQ_RESOLVED', number>;
  dlqOldestAgeSeconds: number;
  jobDuration: Record<JobDurationOutcome, HistogramData>;
  jobs: {
    claimed: Record<string, number>;
    done: Record<string, { count: number; totalDurationMs: number }>;
    retryScheduled: Record<string, number>;
    dlq: Record<string, number>;
  };
  worker: {
    polls: number;
    idles: number;
    errors: Record<string, number>;
  };
}

// ============================================================================
// Error Code to Trip Reason Mapping
// ============================================================================

/**
 * Map ManifestErrorCode to CBTripReason
 * LOCKED: Must stay low-cardinality
 */
export function mapErrorCodeToTripReason(errorCode: ManifestErrorCode | string): CBTripReason {
  switch (errorCode) {
    case ManifestErrorCode.S3_TIMEOUT:
      return 'timeout';
    case ManifestErrorCode.S3_5XX:
      return '5xx';
    case ManifestErrorCode.S3_CONNECTION_RESET:
      return 'connection_reset';
    default:
      return 'unknown';
  }
}

// ============================================================================
// Metrics Service
// ============================================================================

@Injectable()
export class ManifestRetryMetricsService implements IWorkerMetrics {
  private readonly logger = new Logger(ManifestRetryMetricsService.name);

  // -------------------------------------------------------------------------
  // Circuit Breaker State (one-hot gauge)
  // -------------------------------------------------------------------------
  private cbStateGauge: Record<CBState, number> = {
    closed: 1,
    open: 0,
    half_open: 0,
  };
  private currentCBState: CBState = 'closed';
  private cbOpenedAt: number | null = null;

  // -------------------------------------------------------------------------
  // Circuit Breaker Transitions Counter
  // -------------------------------------------------------------------------
  private cbTransitionsCounter = new Map<string, number>();

  // -------------------------------------------------------------------------
  // Circuit Breaker Trips Counter
  // -------------------------------------------------------------------------
  private cbTripsCounter: Record<CBTripReason, number> = {
    timeout: 0,
    '5xx': 0,
    connection_reset: 0,
    unknown: 0,
  };

  // -------------------------------------------------------------------------
  // Queue Size Gauge (by status)
  // -------------------------------------------------------------------------
  private queueSizeGauge: Record<RetryQueueStatus, number> = {
    PENDING: 0,
    IN_PROGRESS: 0,
    RETRY_SCHEDULED: 0,
    DONE: 0,
  };

  // -------------------------------------------------------------------------
  // DLQ Metrics
  // -------------------------------------------------------------------------
  private dlqSizeGauge: Record<'DLQ_OPEN' | 'DLQ_RESOLVED', number> = {
    DLQ_OPEN: 0,
    DLQ_RESOLVED: 0,
  };
  private dlqOldestAgeSeconds = 0;

  // -------------------------------------------------------------------------
  // Job Duration Histogram (by outcome)
  // -------------------------------------------------------------------------
  private jobDurationHistogram: Record<JobDurationOutcome, HistogramData> = {
    success: this.createEmptyHistogram(),
    noop: this.createEmptyHistogram(),
    dlq: this.createEmptyHistogram(),
    retry_scheduled: this.createEmptyHistogram(),
  };

  // -------------------------------------------------------------------------
  // Job Metrics
  // -------------------------------------------------------------------------
  private jobClaimedCounter = new Map<string, number>();
  private jobDoneCounter = new Map<string, { count: number; totalDurationMs: number }>();
  private jobRetryScheduledCounter = new Map<string, number>();
  private jobDlqCounter = new Map<string, number>();

  // -------------------------------------------------------------------------
  // Worker Metrics
  // -------------------------------------------------------------------------
  private workerPollCounter = 0;
  private workerIdleCounter = 0;
  private workerErrorCounter = new Map<string, number>();

  // -------------------------------------------------------------------------
  // Worker Pause Metrics (Phase 10.2)
  // -------------------------------------------------------------------------
  private workerPausedGauge: Record<string, number> = {
    CONSECUTIVE_ERRORS: 0,
    MANUAL_PAUSE: 0,
    UNKNOWN: 0,
  };
  private workerPauseTotalCounter: Record<string, number> = {
    CONSECUTIVE_ERRORS: 0,
    MANUAL_PAUSE: 0,
    UNKNOWN: 0,
  };
  private workerResumeTotalCounter = 0;
  private workerConsecutiveErrorsGauge = 0;
  private workerIsLeaderGauge = 0;
  private workerAutoResumeTotalCounter = 0;
  private workerLeaseExpiresInSecondsGauge = 0;

  // Last error code for trip reason tracking
  private lastFailureErrorCode: ManifestErrorCode | null = null;

  // ==========================================================================
  // Histogram Helpers
  // ==========================================================================

  private createEmptyHistogram(): HistogramData {
    return {
      buckets: new Array(DURATION_HISTOGRAM_BUCKETS.length).fill(0),
      sum: 0,
      count: 0,
    };
  }

  private observeHistogram(histogram: HistogramData, value: number): void {
    histogram.sum += value;
    histogram.count++;
    
    // Update buckets (cumulative)
    for (let i = 0; i < DURATION_HISTOGRAM_BUCKETS.length; i++) {
      if (value <= DURATION_HISTOGRAM_BUCKETS[i]) {
        histogram.buckets[i]++;
      }
    }
  }

  // ==========================================================================
  // IWorkerMetrics Implementation
  // ==========================================================================

  recordJobClaimed(source: string): void {
    const current = this.jobClaimedCounter.get(source) || 0;
    this.jobClaimedCounter.set(source, current + 1);
  }

  recordJobDone(reason: string, durationMs: number): void {
    const current = this.jobDoneCounter.get(reason) || { count: 0, totalDurationMs: 0 };
    this.jobDoneCounter.set(reason, {
      count: current.count + 1,
      totalDurationMs: current.totalDurationMs + durationMs,
    });
  }

  recordJobRetryScheduled(errorCode: string, _attempt: number): void {
    // Store last error code for potential trip reason
    this.lastFailureErrorCode = errorCode as ManifestErrorCode;
    
    const key = errorCode; // Don't include attempt in key (cardinality)
    const current = this.jobRetryScheduledCounter.get(key) || 0;
    this.jobRetryScheduledCounter.set(key, current + 1);
  }

  recordJobDlq(errorCode: string): void {
    const current = this.jobDlqCounter.get(errorCode) || 0;
    this.jobDlqCounter.set(errorCode, current + 1);
  }

  recordCircuitBreakerState(state: CircuitBreakerState): void {
    const newState = state as CBState;
    
    if (newState !== this.currentCBState) {
      // Record transition
      this.recordCBTransition(this.currentCBState, newState);
      
      // Update one-hot gauge
      this.cbStateGauge.closed = newState === 'closed' ? 1 : 0;
      this.cbStateGauge.open = newState === 'open' ? 1 : 0;
      this.cbStateGauge.half_open = newState === 'half_open' ? 1 : 0;
      
      // Track open duration
      if (newState === 'open') {
        this.cbOpenedAt = Date.now();
      } else if (this.currentCBState === 'open') {
        this.cbOpenedAt = null;
      }
      
      this.currentCBState = newState;
    }
  }

  recordWorkerPoll(): void {
    this.workerPollCounter++;
  }

  recordWorkerIdle(): void {
    this.workerIdleCounter++;
  }

  recordWorkerError(errorCode: string): void {
    const current = this.workerErrorCounter.get(errorCode) || 0;
    this.workerErrorCounter.set(errorCode, current + 1);
  }

  // ==========================================================================
  // Worker Pause Metrics (Phase 10.2)
  // ==========================================================================

  /**
   * Record worker pause state change
   */
  recordWorkerPaused(reason: string, isPaused: boolean): void {
    // Reset all pause gauges
    this.workerPausedGauge.CONSECUTIVE_ERRORS = 0;
    this.workerPausedGauge.MANUAL_PAUSE = 0;
    this.workerPausedGauge.UNKNOWN = 0;
    
    if (isPaused && reason in this.workerPausedGauge) {
      this.workerPausedGauge[reason] = 1;
      this.workerPauseTotalCounter[reason]++;
    }
  }

  /**
   * Record worker resume
   */
  recordWorkerResume(): void {
    this.workerResumeTotalCounter++;
    // Reset all pause gauges
    this.workerPausedGauge.CONSECUTIVE_ERRORS = 0;
    this.workerPausedGauge.MANUAL_PAUSE = 0;
    this.workerPausedGauge.UNKNOWN = 0;
  }

  /**
   * Record worker auto-resume
   */
  recordWorkerAutoResume(): void {
    this.workerAutoResumeTotalCounter++;
    this.recordWorkerResume();
  }

  /**
   * Set consecutive errors gauge
   */
  setWorkerConsecutiveErrors(count: number): void {
    this.workerConsecutiveErrorsGauge = count;
  }

  /**
   * Set leader status gauge
   */
  setWorkerIsLeader(isLeader: boolean): void {
    this.workerIsLeaderGauge = isLeader ? 1 : 0;
  }

  /**
   * Set lease expires in seconds gauge
   * Leader ise: (lease_expires_at - now()) saniye
   * Leader değilse: 0
   */
  setWorkerLeaseExpiresInSeconds(seconds: number): void {
    this.workerLeaseExpiresInSecondsGauge = Math.max(0, seconds);
  }

  /**
   * Get lease expires in seconds gauge
   */
  getWorkerLeaseExpiresInSeconds(): number {
    return this.workerLeaseExpiresInSecondsGauge;
  }

  /**
   * Get worker pause gauges
   */
  getWorkerPausedGauge(): Record<string, number> {
    return { ...this.workerPausedGauge };
  }

  // ==========================================================================
  // Circuit Breaker Specific Methods
  // ==========================================================================

  /**
   * Record CB state transition with reason
   */
  private recordCBTransition(from: CBState, to: CBState): void {
    const reason = this.inferTransitionReason(from, to);
    const key = `${from}:${to}:${reason}`;
    const current = this.cbTransitionsCounter.get(key) || 0;
    this.cbTransitionsCounter.set(key, current + 1);

    // Record trip if transitioning to open
    if (to === 'open') {
      this.recordCBTrip();
    }

    this.logger.log('[CB Metrics] State transition', { from, to, reason });
  }

  /**
   * Infer transition reason from state change
   */
  private inferTransitionReason(from: CBState, to: CBState): CBTransitionReason {
    if (from === 'closed' && to === 'open') {
      return 'threshold_reached';
    }
    if (from === 'open' && to === 'half_open') {
      return 'reset_timeout';
    }
    if (from === 'half_open' && to === 'closed') {
      return 'probe_success';
    }
    if (from === 'half_open' && to === 'open') {
      return 'probe_failure';
    }
    return 'unknown';
  }

  /**
   * Record CB trip (transition to open state)
   */
  private recordCBTrip(): void {
    const tripReason = this.lastFailureErrorCode 
      ? mapErrorCodeToTripReason(this.lastFailureErrorCode)
      : 'unknown';
    
    this.cbTripsCounter[tripReason]++;
    this.logger.warn('[CB Metrics] Circuit breaker tripped', { tripReason });
  }

  /**
   * Manually record CB transition (for admin operations)
   */
  recordManualCBTransition(from: CBState, to: CBState, reason: CBTransitionReason): void {
    const key = `${from}:${to}:${reason}`;
    const current = this.cbTransitionsCounter.get(key) || 0;
    this.cbTransitionsCounter.set(key, current + 1);

    // Update state
    this.cbStateGauge.closed = to === 'closed' ? 1 : 0;
    this.cbStateGauge.open = to === 'open' ? 1 : 0;
    this.cbStateGauge.half_open = to === 'half_open' ? 1 : 0;
    
    if (to === 'open') {
      this.cbOpenedAt = Date.now();
      this.recordCBTrip();
    } else if (from === 'open') {
      this.cbOpenedAt = null;
    }
    
    this.currentCBState = to;
    this.logger.log('[CB Metrics] Manual state transition', { from, to, reason });
  }

  // ==========================================================================
  // Getters for Prometheus Export
  // ==========================================================================

  /**
   * Get CB state gauge (one-hot)
   */
  getCBStateGauge(): Record<CBState, number> {
    return { ...this.cbStateGauge };
  }

  /**
   * Get current CB state
   */
  getCurrentCBState(): CBState {
    return this.currentCBState;
  }

  /**
   * Get CB open duration in seconds
   */
  getCBOpenSeconds(): number {
    if (this.cbOpenedAt === null || this.currentCBState !== 'open') {
      return 0;
    }
    return (Date.now() - this.cbOpenedAt) / 1000;
  }

  /**
   * Get CB transitions counter
   */
  getCBTransitions(): Array<{ from: CBState; to: CBState; reason: CBTransitionReason; count: number }> {
    const result: Array<{ from: CBState; to: CBState; reason: CBTransitionReason; count: number }> = [];
    
    for (const [key, count] of this.cbTransitionsCounter.entries()) {
      const [from, to, reason] = key.split(':') as [CBState, CBState, CBTransitionReason];
      result.push({ from, to, reason, count });
    }
    
    return result;
  }

  /**
   * Get CB trips counter
   */
  getCBTrips(): Record<CBTripReason, number> {
    return { ...this.cbTripsCounter };
  }

  // ==========================================================================
  // Queue Size Methods
  // ==========================================================================

  /**
   * Set queue size for a specific status
   * Called after scanning queue counts
   */
  setQueueSize(status: RetryQueueStatus, size: number): void {
    this.queueSizeGauge[status] = size;
  }

  /**
   * Set all queue sizes at once (from scan result)
   * Ensures all statuses are set (missing ones become 0)
   */
  setAllQueueSizes(sizes: Partial<Record<RetryQueueStatus, number>>): void {
    this.queueSizeGauge.PENDING = sizes.PENDING ?? 0;
    this.queueSizeGauge.IN_PROGRESS = sizes.IN_PROGRESS ?? 0;
    this.queueSizeGauge.RETRY_SCHEDULED = sizes.RETRY_SCHEDULED ?? 0;
    this.queueSizeGauge.DONE = sizes.DONE ?? 0;
  }

  /**
   * Get queue size gauge
   */
  getQueueSize(): Record<RetryQueueStatus, number> {
    return { ...this.queueSizeGauge };
  }

  // ==========================================================================
  // DLQ Metrics Methods
  // ==========================================================================

  /**
   * Set DLQ size for a specific status
   */
  setDlqSize(status: 'DLQ_OPEN' | 'DLQ_RESOLVED', size: number): void {
    this.dlqSizeGauge[status] = size;
  }

  /**
   * Set all DLQ sizes at once
   */
  setAllDlqSizes(open: number, resolved: number): void {
    this.dlqSizeGauge.DLQ_OPEN = open;
    this.dlqSizeGauge.DLQ_RESOLVED = resolved;
  }

  /**
   * Get DLQ size gauge
   */
  getDlqSize(): Record<'DLQ_OPEN' | 'DLQ_RESOLVED', number> {
    return { ...this.dlqSizeGauge };
  }

  /**
   * Set DLQ oldest age in seconds
   * Set to 0 if DLQ is empty
   */
  setDlqOldestAgeSeconds(ageSeconds: number): void {
    this.dlqOldestAgeSeconds = Math.max(0, ageSeconds);
  }

  /**
   * Get DLQ oldest age in seconds
   */
  getDlqOldestAgeSeconds(): number {
    return this.dlqOldestAgeSeconds;
  }

  // ==========================================================================
  // Job Duration Histogram Methods
  // ==========================================================================

  /**
   * Map DoneReason to JobDurationOutcome
   */
  static mapDoneReasonToOutcome(reason: DoneReason): JobDurationOutcome {
    switch (reason) {
      case 'OK':
        return 'success';
      case 'DONE_NOOP':
        return 'noop';
      case 'DLQ':
        return 'dlq';
      default:
        return 'dlq'; // fallback
    }
  }

  /**
   * Observe job duration
   * @param outcome - The job outcome
   * @param durationSeconds - Duration in seconds
   */
  observeJobDuration(outcome: JobDurationOutcome, durationSeconds: number): void {
    this.observeHistogram(this.jobDurationHistogram[outcome], durationSeconds);
  }

  /**
   * Observe job duration from DoneReason
   * @param reason - The done reason
   * @param durationSeconds - Duration in seconds
   */
  observeJobDurationFromReason(reason: DoneReason, durationSeconds: number): void {
    const outcome = ManifestRetryMetricsService.mapDoneReasonToOutcome(reason);
    this.observeJobDuration(outcome, durationSeconds);
  }

  /**
   * Get job duration histogram data
   */
  getJobDurationHistogram(): Record<JobDurationOutcome, HistogramData> {
    return {
      success: { ...this.jobDurationHistogram.success },
      noop: { ...this.jobDurationHistogram.noop },
      dlq: { ...this.jobDurationHistogram.dlq },
      retry_scheduled: { ...this.jobDurationHistogram.retry_scheduled },
    };
  }

  // ==========================================================================
  // Snapshot & Export
  // ==========================================================================

  /**
   * Get full metrics snapshot
   */
  getSnapshot(): ManifestRetryMetricsSnapshot {
    return {
      cbState: this.getCBStateGauge(),
      cbTransitions: this.getCBTransitions(),
      cbTrips: this.getCBTrips(),
      cbOpenSeconds: this.getCBOpenSeconds(),
      queueSize: this.getQueueSize(),
      dlqSize: this.getDlqSize(),
      dlqOldestAgeSeconds: this.getDlqOldestAgeSeconds(),
      jobDuration: this.getJobDurationHistogram(),
      jobs: {
        claimed: Object.fromEntries(this.jobClaimedCounter),
        done: Object.fromEntries(this.jobDoneCounter),
        retryScheduled: Object.fromEntries(this.jobRetryScheduledCounter),
        dlq: Object.fromEntries(this.jobDlqCounter),
      },
      worker: {
        polls: this.workerPollCounter,
        idles: this.workerIdleCounter,
        errors: Object.fromEntries(this.workerErrorCounter),
      },
    };
  }

  /**
   * Export metrics in Prometheus text format
   */
  toPrometheusText(): string {
    const lines: string[] = [];

    // CB State Gauge (one-hot)
    lines.push('# HELP manifest_retry_circuit_breaker_state Circuit breaker state (one-hot)');
    lines.push('# TYPE manifest_retry_circuit_breaker_state gauge');
    for (const [state, value] of Object.entries(this.cbStateGauge)) {
      lines.push(`manifest_retry_circuit_breaker_state{state="${state}"} ${value}`);
    }

    // CB Open Duration
    lines.push('# HELP manifest_retry_circuit_breaker_open_seconds Duration CB has been open');
    lines.push('# TYPE manifest_retry_circuit_breaker_open_seconds gauge');
    lines.push(`manifest_retry_circuit_breaker_open_seconds ${this.getCBOpenSeconds()}`);

    // CB Transitions Counter
    lines.push('# HELP manifest_retry_circuit_breaker_transitions_total CB state transitions');
    lines.push('# TYPE manifest_retry_circuit_breaker_transitions_total counter');
    for (const { from, to, reason, count } of this.getCBTransitions()) {
      lines.push(`manifest_retry_circuit_breaker_transitions_total{from="${from}",to="${to}",reason="${reason}"} ${count}`);
    }

    // CB Trips Counter
    lines.push('# HELP manifest_retry_circuit_breaker_trips_total CB trips by reason');
    lines.push('# TYPE manifest_retry_circuit_breaker_trips_total counter');
    for (const [reason, count] of Object.entries(this.cbTripsCounter)) {
      lines.push(`manifest_retry_circuit_breaker_trips_total{trip_reason="${reason}"} ${count}`);
    }

    // Queue Size Gauge
    lines.push('# HELP manifest_retry_queue_size Current queue size by status');
    lines.push('# TYPE manifest_retry_queue_size gauge');
    for (const [status, size] of Object.entries(this.queueSizeGauge)) {
      lines.push(`manifest_retry_queue_size{status="${status}"} ${size}`);
    }

    // DLQ Size Gauge
    lines.push('# HELP manifest_dlq_size Current DLQ size by status');
    lines.push('# TYPE manifest_dlq_size gauge');
    for (const [status, size] of Object.entries(this.dlqSizeGauge)) {
      lines.push(`manifest_dlq_size{status="${status}"} ${size}`);
    }

    // DLQ Oldest Age
    lines.push('# HELP manifest_dlq_oldest_age_seconds Age of oldest DLQ entry in seconds');
    lines.push('# TYPE manifest_dlq_oldest_age_seconds gauge');
    lines.push(`manifest_dlq_oldest_age_seconds ${this.dlqOldestAgeSeconds}`);

    // Job Duration Histogram
    lines.push('# HELP manifest_retry_job_duration_seconds Job processing duration by outcome');
    lines.push('# TYPE manifest_retry_job_duration_seconds histogram');
    for (const [outcome, data] of Object.entries(this.jobDurationHistogram)) {
      // Buckets are already cumulative from observeHistogram
      for (let i = 0; i < DURATION_HISTOGRAM_BUCKETS.length; i++) {
        lines.push(`manifest_retry_job_duration_seconds_bucket{outcome="${outcome}",le="${DURATION_HISTOGRAM_BUCKETS[i]}"} ${data.buckets[i]}`);
      }
      // +Inf bucket
      lines.push(`manifest_retry_job_duration_seconds_bucket{outcome="${outcome}",le="+Inf"} ${data.count}`);
      // Sum and count
      lines.push(`manifest_retry_job_duration_seconds_sum{outcome="${outcome}"} ${data.sum}`);
      lines.push(`manifest_retry_job_duration_seconds_count{outcome="${outcome}"} ${data.count}`);
    }

    // Job Done Counter
    lines.push('# HELP manifest_retry_job_done_total Jobs completed');
    lines.push('# TYPE manifest_retry_job_done_total counter');
    for (const [reason, data] of this.jobDoneCounter.entries()) {
      lines.push(`manifest_retry_job_done_total{reason="${reason}"} ${data.count}`);
    }

    // Job DLQ Counter
    lines.push('# HELP manifest_retry_job_dlq_total Jobs moved to DLQ');
    lines.push('# TYPE manifest_retry_job_dlq_total counter');
    for (const [errorCode, count] of this.jobDlqCounter.entries()) {
      lines.push(`manifest_retry_job_dlq_total{error_code="${errorCode}"} ${count}`);
    }

    // Worker Pause Gauge (Phase 10.2)
    lines.push('# HELP manifest_retry_worker_paused Worker pause state by reason');
    lines.push('# TYPE manifest_retry_worker_paused gauge');
    for (const [reason, value] of Object.entries(this.workerPausedGauge)) {
      lines.push(`manifest_retry_worker_paused{reason="${reason}"} ${value}`);
    }

    // Worker Pause Total Counter (Phase 10.2)
    lines.push('# HELP manifest_retry_worker_pause_total Total worker pauses by reason');
    lines.push('# TYPE manifest_retry_worker_pause_total counter');
    for (const [reason, count] of Object.entries(this.workerPauseTotalCounter)) {
      lines.push(`manifest_retry_worker_pause_total{reason="${reason}"} ${count}`);
    }

    // Worker Resume Total Counter (Phase 10.2)
    lines.push('# HELP manifest_retry_worker_resume_total Total worker resumes');
    lines.push('# TYPE manifest_retry_worker_resume_total counter');
    lines.push(`manifest_retry_worker_resume_total ${this.workerResumeTotalCounter}`);

    // Worker Auto-Resume Total Counter (Phase 10.2)
    lines.push('# HELP manifest_retry_worker_auto_resume_total Total worker auto-resumes');
    lines.push('# TYPE manifest_retry_worker_auto_resume_total counter');
    lines.push(`manifest_retry_worker_auto_resume_total ${this.workerAutoResumeTotalCounter}`);

    // Worker Consecutive Errors Gauge (Phase 10.2)
    lines.push('# HELP manifest_retry_worker_consecutive_errors Current consecutive error count');
    lines.push('# TYPE manifest_retry_worker_consecutive_errors gauge');
    lines.push(`manifest_retry_worker_consecutive_errors ${this.workerConsecutiveErrorsGauge}`);

    // Worker Is Leader Gauge (Phase 10.2)
    lines.push('# HELP manifest_retry_worker_is_leader Whether this instance is the leader');
    lines.push('# TYPE manifest_retry_worker_is_leader gauge');
    lines.push(`manifest_retry_worker_is_leader ${this.workerIsLeaderGauge}`);

    // Worker Lease Expires In Seconds Gauge (Phase 10.2)
    lines.push('# HELP manifest_retry_worker_lease_expires_in_seconds Seconds until lease expires (0 if not leader)');
    lines.push('# TYPE manifest_retry_worker_lease_expires_in_seconds gauge');
    lines.push(`manifest_retry_worker_lease_expires_in_seconds ${this.workerLeaseExpiresInSecondsGauge}`);

    return lines.join('\n');
  }

  /**
   * Reset all metrics (for testing)
   */
  reset(): void {
    this.cbStateGauge = { closed: 1, open: 0, half_open: 0 };
    this.currentCBState = 'closed';
    this.cbOpenedAt = null;
    this.cbTransitionsCounter.clear();
    this.cbTripsCounter = { timeout: 0, '5xx': 0, connection_reset: 0, unknown: 0 };
    this.queueSizeGauge = { PENDING: 0, IN_PROGRESS: 0, RETRY_SCHEDULED: 0, DONE: 0 };
    this.dlqSizeGauge = { DLQ_OPEN: 0, DLQ_RESOLVED: 0 };
    this.dlqOldestAgeSeconds = 0;
    this.jobDurationHistogram = {
      success: this.createEmptyHistogram(),
      noop: this.createEmptyHistogram(),
      dlq: this.createEmptyHistogram(),
      retry_scheduled: this.createEmptyHistogram(),
    };
    this.jobClaimedCounter.clear();
    this.jobDoneCounter.clear();
    this.jobRetryScheduledCounter.clear();
    this.jobDlqCounter.clear();
    this.workerPollCounter = 0;
    this.workerIdleCounter = 0;
    this.workerErrorCounter.clear();
    // Phase 10.2 metrics
    this.workerPausedGauge = { CONSECUTIVE_ERRORS: 0, MANUAL_PAUSE: 0, UNKNOWN: 0 };
    this.workerPauseTotalCounter = { CONSECUTIVE_ERRORS: 0, MANUAL_PAUSE: 0, UNKNOWN: 0 };
    this.workerResumeTotalCounter = 0;
    this.workerConsecutiveErrorsGauge = 0;
    this.workerIsLeaderGauge = 0;
    this.workerAutoResumeTotalCounter = 0;
    this.workerLeaseExpiresInSecondsGauge = 0;
    this.lastFailureErrorCode = null;
  }
}

// ============================================================================
// FORBIDDEN Labels Check
// ============================================================================

/**
 * Validate that no forbidden labels are used
 * FORBIDDEN: bundleId, tenantId, jobId, userId
 */
export function validateNoForbiddenLabels(labels: Record<string, string>): boolean {
  const FORBIDDEN = ['bundleId', 'tenantId', 'jobId', 'userId', 'bundle_id', 'tenant_id', 'job_id', 'user_id'];
  for (const key of Object.keys(labels)) {
    if (FORBIDDEN.includes(key)) {
      return false;
    }
  }
  return true;
}
