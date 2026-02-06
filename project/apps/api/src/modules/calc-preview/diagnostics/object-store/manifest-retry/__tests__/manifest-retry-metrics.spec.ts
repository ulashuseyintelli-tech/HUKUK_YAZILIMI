/**
 * Manifest Retry Metrics Tests
 * 
 * Phase 10.1.7 - Circuit Breaker Metrics
 * 
 * Test coverage:
 * 1. One-hot state gauge validation
 * 2. Transition counter label set validation
 * 3. Trip reason breakdown validation
 * 4. Forbidden labels policy validation
 * 5. Open duration tracking
 * 6. Prometheus export format
 */

import {
  ManifestRetryMetricsService,
  CBState,
  CBTransitionReason,
  CBTripReason,
  JobDurationOutcome,
  DURATION_HISTOGRAM_BUCKETS,
  mapErrorCodeToTripReason,
  validateNoForbiddenLabels,
} from '../manifest-retry-metrics.service';
import { ManifestErrorCode } from '../manifest-error-classifier';

describe('ManifestRetryMetricsService', () => {
  let metrics: ManifestRetryMetricsService;

  beforeEach(() => {
    metrics = new ManifestRetryMetricsService();
  });

  // ==========================================================================
  // Test 1: One-Hot State Gauge Validation
  // ==========================================================================
  describe('CB State Gauge (one-hot)', () => {
    it('should initialize with closed=1, others=0', () => {
      const gauge = metrics.getCBStateGauge();
      
      expect(gauge.closed).toBe(1);
      expect(gauge.open).toBe(0);
      expect(gauge.half_open).toBe(0);
    });

    it('should set open=1, others=0 when state changes to open', () => {
      metrics.recordCircuitBreakerState('open');
      const gauge = metrics.getCBStateGauge();
      
      expect(gauge.closed).toBe(0);
      expect(gauge.open).toBe(1);
      expect(gauge.half_open).toBe(0);
    });

    it('should set half_open=1, others=0 when state changes to half_open', () => {
      metrics.recordCircuitBreakerState('open');
      metrics.recordCircuitBreakerState('half_open');
      const gauge = metrics.getCBStateGauge();
      
      expect(gauge.closed).toBe(0);
      expect(gauge.open).toBe(0);
      expect(gauge.half_open).toBe(1);
    });

    it('should maintain one-hot invariant: exactly one state is 1', () => {
      const states: CBState[] = ['closed', 'open', 'half_open', 'closed', 'open'];
      
      for (const state of states) {
        metrics.recordCircuitBreakerState(state);
        const gauge = metrics.getCBStateGauge();
        
        const sum = gauge.closed + gauge.open + gauge.half_open;
        expect(sum).toBe(1);
        expect(gauge[state]).toBe(1);
      }
    });

    it('should not change gauge when same state is recorded', () => {
      metrics.recordCircuitBreakerState('closed');
      metrics.recordCircuitBreakerState('closed');
      metrics.recordCircuitBreakerState('closed');
      
      const transitions = metrics.getCBTransitions();
      expect(transitions.length).toBe(0); // No transitions recorded
    });
  });

  // ==========================================================================
  // Test 2: Transition Counter Label Set Validation
  // ==========================================================================
  describe('CB Transitions Counter', () => {
    it('should record closed→open transition with threshold_reached reason', () => {
      metrics.recordCircuitBreakerState('open');
      
      const transitions = metrics.getCBTransitions();
      expect(transitions).toHaveLength(1);
      expect(transitions[0]).toEqual({
        from: 'closed',
        to: 'open',
        reason: 'threshold_reached',
        count: 1,
      });
    });

    it('should record open→half_open transition with reset_timeout reason', () => {
      metrics.recordCircuitBreakerState('open');
      metrics.recordCircuitBreakerState('half_open');
      
      const transitions = metrics.getCBTransitions();
      const halfOpenTransition = transitions.find(t => t.to === 'half_open');
      
      expect(halfOpenTransition).toEqual({
        from: 'open',
        to: 'half_open',
        reason: 'reset_timeout',
        count: 1,
      });
    });

    it('should record half_open→closed transition with probe_success reason', () => {
      metrics.recordCircuitBreakerState('open');
      metrics.recordCircuitBreakerState('half_open');
      metrics.recordCircuitBreakerState('closed');
      
      const transitions = metrics.getCBTransitions();
      const closedTransition = transitions.find(t => t.from === 'half_open' && t.to === 'closed');
      
      expect(closedTransition).toEqual({
        from: 'half_open',
        to: 'closed',
        reason: 'probe_success',
        count: 1,
      });
    });

    it('should record half_open→open transition with probe_failure reason', () => {
      metrics.recordCircuitBreakerState('open');
      metrics.recordCircuitBreakerState('half_open');
      metrics.recordCircuitBreakerState('open');
      
      const transitions = metrics.getCBTransitions();
      const probeFailure = transitions.find(t => t.from === 'half_open' && t.to === 'open');
      
      expect(probeFailure).toEqual({
        from: 'half_open',
        to: 'open',
        reason: 'probe_failure',
        count: 1,
      });
    });

    it('should increment counter for repeated transitions', () => {
      // closed → open → half_open → closed (cycle 1)
      metrics.recordCircuitBreakerState('open');
      metrics.recordCircuitBreakerState('half_open');
      metrics.recordCircuitBreakerState('closed');
      
      // closed → open → half_open → closed (cycle 2)
      metrics.recordCircuitBreakerState('open');
      metrics.recordCircuitBreakerState('half_open');
      metrics.recordCircuitBreakerState('closed');
      
      const transitions = metrics.getCBTransitions();
      const closedToOpen = transitions.find(t => t.from === 'closed' && t.to === 'open');
      
      expect(closedToOpen?.count).toBe(2);
    });

    it('should have valid label values (from/to/reason)', () => {
      metrics.recordCircuitBreakerState('open');
      metrics.recordCircuitBreakerState('half_open');
      metrics.recordCircuitBreakerState('closed');
      
      const transitions = metrics.getCBTransitions();
      const validStates: CBState[] = ['closed', 'open', 'half_open'];
      const validReasons: CBTransitionReason[] = [
        'threshold_reached', 'reset_timeout', 'probe_success', 
        'probe_failure', 'manual', 'forced_open', 'unknown'
      ];
      
      for (const t of transitions) {
        expect(validStates).toContain(t.from);
        expect(validStates).toContain(t.to);
        expect(validReasons).toContain(t.reason);
      }
    });
  });

  // ==========================================================================
  // Test 3: Trip Reason Breakdown Validation
  // ==========================================================================
  describe('CB Trips Counter', () => {
    it('should record trip with timeout reason when S3_TIMEOUT error', () => {
      metrics.recordJobRetryScheduled(ManifestErrorCode.S3_TIMEOUT, 1);
      metrics.recordCircuitBreakerState('open');
      
      const trips = metrics.getCBTrips();
      expect(trips.timeout).toBe(1);
      expect(trips['5xx']).toBe(0);
      expect(trips.connection_reset).toBe(0);
    });

    it('should record trip with 5xx reason when S3_5XX error', () => {
      metrics.recordJobRetryScheduled(ManifestErrorCode.S3_5XX, 1);
      metrics.recordCircuitBreakerState('open');
      
      const trips = metrics.getCBTrips();
      expect(trips['5xx']).toBe(1);
    });

    it('should record trip with connection_reset reason when S3_CONNECTION_RESET error', () => {
      metrics.recordJobRetryScheduled(ManifestErrorCode.S3_CONNECTION_RESET, 1);
      metrics.recordCircuitBreakerState('open');
      
      const trips = metrics.getCBTrips();
      expect(trips.connection_reset).toBe(1);
    });

    it('should record trip with unknown reason for other errors', () => {
      metrics.recordJobRetryScheduled(ManifestErrorCode.S3_ACCESS_DENIED, 1);
      metrics.recordCircuitBreakerState('open');
      
      const trips = metrics.getCBTrips();
      expect(trips.unknown).toBe(1);
    });

    it('should record trip on half_open→open transition', () => {
      metrics.recordJobRetryScheduled(ManifestErrorCode.S3_TIMEOUT, 1);
      metrics.recordCircuitBreakerState('open');
      metrics.recordCircuitBreakerState('half_open');
      
      metrics.recordJobRetryScheduled(ManifestErrorCode.S3_5XX, 1);
      metrics.recordCircuitBreakerState('open'); // probe failure
      
      const trips = metrics.getCBTrips();
      expect(trips.timeout).toBe(1);
      expect(trips['5xx']).toBe(1);
    });

    it('should have low-cardinality trip reasons', () => {
      const trips = metrics.getCBTrips();
      const validReasons: CBTripReason[] = ['timeout', '5xx', 'connection_reset', 'unknown'];
      
      for (const reason of Object.keys(trips)) {
        expect(validReasons).toContain(reason);
      }
    });
  });

  // ==========================================================================
  // Test 4: Forbidden Labels Policy Validation
  // ==========================================================================
  describe('Forbidden Labels Policy', () => {
    it('should reject bundleId label', () => {
      expect(validateNoForbiddenLabels({ bundleId: 'test' })).toBe(false);
      expect(validateNoForbiddenLabels({ bundle_id: 'test' })).toBe(false);
    });

    it('should reject tenantId label', () => {
      expect(validateNoForbiddenLabels({ tenantId: 'test' })).toBe(false);
      expect(validateNoForbiddenLabels({ tenant_id: 'test' })).toBe(false);
    });

    it('should reject jobId label', () => {
      expect(validateNoForbiddenLabels({ jobId: 'test' })).toBe(false);
      expect(validateNoForbiddenLabels({ job_id: 'test' })).toBe(false);
    });

    it('should reject userId label', () => {
      expect(validateNoForbiddenLabels({ userId: 'test' })).toBe(false);
      expect(validateNoForbiddenLabels({ user_id: 'test' })).toBe(false);
    });

    it('should accept valid labels', () => {
      expect(validateNoForbiddenLabels({ state: 'open' })).toBe(true);
      expect(validateNoForbiddenLabels({ from: 'closed', to: 'open' })).toBe(true);
      expect(validateNoForbiddenLabels({ reason: 'timeout' })).toBe(true);
      expect(validateNoForbiddenLabels({ error_code: 'S3_TIMEOUT' })).toBe(true);
    });

    it('should verify Prometheus output has no forbidden labels', () => {
      metrics.recordCircuitBreakerState('open');
      metrics.recordJobDone('ok', 100);
      metrics.recordJobDlq(ManifestErrorCode.S3_ACCESS_DENIED);
      
      const prometheusText = metrics.toPrometheusText();
      
      expect(prometheusText).not.toContain('bundleId');
      expect(prometheusText).not.toContain('bundle_id');
      expect(prometheusText).not.toContain('tenantId');
      expect(prometheusText).not.toContain('tenant_id');
      expect(prometheusText).not.toContain('jobId');
      expect(prometheusText).not.toContain('job_id');
      expect(prometheusText).not.toContain('userId');
      expect(prometheusText).not.toContain('user_id');
    });
  });

  // ==========================================================================
  // Test 5: Open Duration Tracking
  // ==========================================================================
  describe('CB Open Duration', () => {
    it('should return 0 when CB is closed', () => {
      expect(metrics.getCBOpenSeconds()).toBe(0);
    });

    it('should track duration when CB is open', async () => {
      metrics.recordCircuitBreakerState('open');
      
      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const duration = metrics.getCBOpenSeconds();
      expect(duration).toBeGreaterThan(0);
      expect(duration).toBeLessThan(1); // Should be less than 1 second
    });

    it('should reset duration when CB transitions from open', () => {
      metrics.recordCircuitBreakerState('open');
      metrics.recordCircuitBreakerState('half_open');
      
      expect(metrics.getCBOpenSeconds()).toBe(0);
    });

    it('should restart duration tracking on re-open', async () => {
      metrics.recordCircuitBreakerState('open');
      await new Promise(resolve => setTimeout(resolve, 50));
      
      metrics.recordCircuitBreakerState('half_open');
      metrics.recordCircuitBreakerState('open');
      
      // Duration should be reset (close to 0)
      const duration = metrics.getCBOpenSeconds();
      expect(duration).toBeLessThan(0.1);
    });
  });

  // ==========================================================================
  // Test 6: Prometheus Export Format
  // ==========================================================================
  describe('Prometheus Export', () => {
    it('should export CB state gauge in correct format', () => {
      const text = metrics.toPrometheusText();
      
      expect(text).toContain('# HELP manifest_retry_circuit_breaker_state');
      expect(text).toContain('# TYPE manifest_retry_circuit_breaker_state gauge');
      expect(text).toContain('manifest_retry_circuit_breaker_state{state="closed"} 1');
      expect(text).toContain('manifest_retry_circuit_breaker_state{state="open"} 0');
      expect(text).toContain('manifest_retry_circuit_breaker_state{state="half_open"} 0');
    });

    it('should export CB open duration gauge', () => {
      const text = metrics.toPrometheusText();
      
      expect(text).toContain('# HELP manifest_retry_circuit_breaker_open_seconds');
      expect(text).toContain('# TYPE manifest_retry_circuit_breaker_open_seconds gauge');
      expect(text).toContain('manifest_retry_circuit_breaker_open_seconds 0');
    });

    it('should export CB transitions counter with labels', () => {
      metrics.recordCircuitBreakerState('open');
      const text = metrics.toPrometheusText();
      
      expect(text).toContain('# HELP manifest_retry_circuit_breaker_transitions_total');
      expect(text).toContain('# TYPE manifest_retry_circuit_breaker_transitions_total counter');
      expect(text).toContain('manifest_retry_circuit_breaker_transitions_total{from="closed",to="open",reason="threshold_reached"} 1');
    });

    it('should export CB trips counter with labels', () => {
      metrics.recordJobRetryScheduled(ManifestErrorCode.S3_TIMEOUT, 1);
      metrics.recordCircuitBreakerState('open');
      const text = metrics.toPrometheusText();
      
      expect(text).toContain('# HELP manifest_retry_circuit_breaker_trips_total');
      expect(text).toContain('# TYPE manifest_retry_circuit_breaker_trips_total counter');
      expect(text).toContain('manifest_retry_circuit_breaker_trips_total{trip_reason="timeout"} 1');
    });

    it('should export job done counter', () => {
      metrics.recordJobDone('ok', 100);
      metrics.recordJobDone('done_noop', 50);
      const text = metrics.toPrometheusText();
      
      expect(text).toContain('# HELP manifest_retry_job_done_total');
      expect(text).toContain('manifest_retry_job_done_total{reason="ok"} 1');
      expect(text).toContain('manifest_retry_job_done_total{reason="done_noop"} 1');
    });

    it('should export job DLQ counter', () => {
      metrics.recordJobDlq(ManifestErrorCode.S3_ACCESS_DENIED);
      const text = metrics.toPrometheusText();
      
      expect(text).toContain('# HELP manifest_retry_job_dlq_total');
      expect(text).toContain(`manifest_retry_job_dlq_total{error_code="${ManifestErrorCode.S3_ACCESS_DENIED}"} 1`);
    });
  });

  // ==========================================================================
  // Test 7: Error Code to Trip Reason Mapping
  // ==========================================================================
  describe('mapErrorCodeToTripReason', () => {
    it('should map S3_TIMEOUT to timeout', () => {
      expect(mapErrorCodeToTripReason(ManifestErrorCode.S3_TIMEOUT)).toBe('timeout');
    });

    it('should map S3_5XX to 5xx', () => {
      expect(mapErrorCodeToTripReason(ManifestErrorCode.S3_5XX)).toBe('5xx');
    });

    it('should map S3_CONNECTION_RESET to connection_reset', () => {
      expect(mapErrorCodeToTripReason(ManifestErrorCode.S3_CONNECTION_RESET)).toBe('connection_reset');
    });

    it('should map other codes to unknown', () => {
      expect(mapErrorCodeToTripReason(ManifestErrorCode.S3_ACCESS_DENIED)).toBe('unknown');
      expect(mapErrorCodeToTripReason(ManifestErrorCode.S3_NO_SUCH_BUCKET)).toBe('unknown');
      expect(mapErrorCodeToTripReason(ManifestErrorCode.SERIALIZATION_ERROR)).toBe('unknown');
      expect(mapErrorCodeToTripReason(ManifestErrorCode.UNKNOWN)).toBe('unknown');
    });
  });

  // ==========================================================================
  // Test 8: Snapshot
  // ==========================================================================
  describe('Metrics Snapshot', () => {
    it('should return complete snapshot', () => {
      // Record retry BEFORE state change so trip reason is captured
      metrics.recordJobRetryScheduled(ManifestErrorCode.S3_TIMEOUT, 1);
      metrics.recordCircuitBreakerState('open');
      metrics.recordJobClaimed('post_seal_hook');
      metrics.recordJobDone('ok', 100);
      metrics.recordJobDlq(ManifestErrorCode.S3_ACCESS_DENIED);
      metrics.recordWorkerPoll();
      metrics.recordWorkerIdle();
      metrics.recordWorkerError('LOOP_ERROR');
      
      const snapshot = metrics.getSnapshot();
      
      expect(snapshot.cbState.open).toBe(1);
      expect(snapshot.cbTransitions.length).toBeGreaterThan(0);
      expect(snapshot.cbTrips.timeout).toBe(1);
      expect(snapshot.jobs.claimed['post_seal_hook']).toBe(1);
      expect(snapshot.jobs.done['ok'].count).toBe(1);
      expect(snapshot.jobs.retryScheduled[ManifestErrorCode.S3_TIMEOUT]).toBe(1);
      expect(snapshot.jobs.dlq[ManifestErrorCode.S3_ACCESS_DENIED]).toBe(1);
      expect(snapshot.worker.polls).toBe(1);
      expect(snapshot.worker.idles).toBe(1);
      expect(snapshot.worker.errors['LOOP_ERROR']).toBe(1);
    });
  });

  // ==========================================================================
  // Test 9: Reset
  // ==========================================================================
  describe('Reset', () => {
    it('should reset all metrics to initial state', () => {
      metrics.recordCircuitBreakerState('open');
      metrics.recordJobClaimed('post_seal_hook');
      metrics.recordJobDone('ok', 100);
      
      metrics.reset();
      
      const snapshot = metrics.getSnapshot();
      expect(snapshot.cbState.closed).toBe(1);
      expect(snapshot.cbState.open).toBe(0);
      expect(snapshot.cbTransitions.length).toBe(0);
      expect(Object.keys(snapshot.jobs.claimed).length).toBe(0);
      expect(Object.keys(snapshot.jobs.done).length).toBe(0);
    });
  });

  // ==========================================================================
  // Test 10: Manual CB Transition
  // ==========================================================================
  describe('Manual CB Transition', () => {
    it('should record manual transition with custom reason', () => {
      metrics.recordManualCBTransition('closed', 'open', 'forced_open');
      
      const transitions = metrics.getCBTransitions();
      expect(transitions).toContainEqual({
        from: 'closed',
        to: 'open',
        reason: 'forced_open',
        count: 1,
      });
    });

    it('should record manual reset', () => {
      metrics.recordCircuitBreakerState('open');
      metrics.recordManualCBTransition('open', 'closed', 'manual');
      
      const transitions = metrics.getCBTransitions();
      const manualReset = transitions.find(t => t.reason === 'manual');
      
      expect(manualReset).toEqual({
        from: 'open',
        to: 'closed',
        reason: 'manual',
        count: 1,
      });
    });
  });

  // ==========================================================================
  // Test 11: Queue Size Gauge (Phase 10.1.13)
  // ==========================================================================
  describe('Queue Size Gauge', () => {
    it('should initialize all statuses to 0', () => {
      const sizes = metrics.getQueueSize();
      
      expect(sizes.PENDING).toBe(0);
      expect(sizes.IN_PROGRESS).toBe(0);
      expect(sizes.RETRY_SCHEDULED).toBe(0);
      expect(sizes.DONE).toBe(0);
    });

    it('should set queue size for specific status', () => {
      metrics.setQueueSize('PENDING', 5);
      metrics.setQueueSize('IN_PROGRESS', 2);
      
      const sizes = metrics.getQueueSize();
      expect(sizes.PENDING).toBe(5);
      expect(sizes.IN_PROGRESS).toBe(2);
      expect(sizes.RETRY_SCHEDULED).toBe(0);
      expect(sizes.DONE).toBe(0);
    });

    it('should set all queue sizes at once', () => {
      metrics.setAllQueueSizes({
        PENDING: 10,
        IN_PROGRESS: 3,
        RETRY_SCHEDULED: 7,
        DONE: 100,
      });
      
      const sizes = metrics.getQueueSize();
      expect(sizes.PENDING).toBe(10);
      expect(sizes.IN_PROGRESS).toBe(3);
      expect(sizes.RETRY_SCHEDULED).toBe(7);
      expect(sizes.DONE).toBe(100);
    });

    it('should set missing statuses to 0 when using setAllQueueSizes', () => {
      metrics.setQueueSize('PENDING', 99); // Pre-set
      
      metrics.setAllQueueSizes({
        IN_PROGRESS: 5,
        // PENDING, RETRY_SCHEDULED, DONE not provided
      });
      
      const sizes = metrics.getQueueSize();
      expect(sizes.PENDING).toBe(0); // Reset to 0
      expect(sizes.IN_PROGRESS).toBe(5);
      expect(sizes.RETRY_SCHEDULED).toBe(0);
      expect(sizes.DONE).toBe(0);
    });

    it('should export queue size in Prometheus format', () => {
      metrics.setAllQueueSizes({
        PENDING: 15,
        IN_PROGRESS: 2,
        RETRY_SCHEDULED: 8,
        DONE: 50,
      });
      
      const text = metrics.toPrometheusText();
      
      expect(text).toContain('# HELP manifest_retry_queue_size');
      expect(text).toContain('# TYPE manifest_retry_queue_size gauge');
      expect(text).toContain('manifest_retry_queue_size{status="PENDING"} 15');
      expect(text).toContain('manifest_retry_queue_size{status="IN_PROGRESS"} 2');
      expect(text).toContain('manifest_retry_queue_size{status="RETRY_SCHEDULED"} 8');
      expect(text).toContain('manifest_retry_queue_size{status="DONE"} 50');
    });

    it('should include queue size in snapshot', () => {
      metrics.setAllQueueSizes({
        PENDING: 3,
        IN_PROGRESS: 1,
        RETRY_SCHEDULED: 2,
        DONE: 10,
      });
      
      const snapshot = metrics.getSnapshot();
      expect(snapshot.queueSize.PENDING).toBe(3);
      expect(snapshot.queueSize.IN_PROGRESS).toBe(1);
      expect(snapshot.queueSize.RETRY_SCHEDULED).toBe(2);
      expect(snapshot.queueSize.DONE).toBe(10);
    });

    it('should reset queue sizes on reset()', () => {
      metrics.setAllQueueSizes({
        PENDING: 100,
        IN_PROGRESS: 50,
        RETRY_SCHEDULED: 25,
        DONE: 1000,
      });
      
      metrics.reset();
      
      const sizes = metrics.getQueueSize();
      expect(sizes.PENDING).toBe(0);
      expect(sizes.IN_PROGRESS).toBe(0);
      expect(sizes.RETRY_SCHEDULED).toBe(0);
      expect(sizes.DONE).toBe(0);
    });
  });

  // ==========================================================================
  // Test 12: Job Duration Histogram (Phase 10.1.13)
  // ==========================================================================
  describe('Job Duration Histogram', () => {
    it('should initialize with empty histograms for all outcomes', () => {
      const histograms = metrics.getJobDurationHistogram();
      
      const outcomes: JobDurationOutcome[] = ['success', 'noop', 'dlq', 'retry_scheduled'];
      for (const outcome of outcomes) {
        expect(histograms[outcome].sum).toBe(0);
        expect(histograms[outcome].count).toBe(0);
        expect(histograms[outcome].buckets.length).toBe(DURATION_HISTOGRAM_BUCKETS.length);
        expect(histograms[outcome].buckets.every(b => b === 0)).toBe(true);
      }
    });

    it('should observe values into correct buckets', () => {
      // Observe 0.05s → should go into 0.1 bucket
      metrics.observeJobDuration('success', 0.05);
      
      const histograms = metrics.getJobDurationHistogram();
      expect(histograms.success.count).toBe(1);
      expect(histograms.success.sum).toBe(0.05);
      expect(histograms.success.buckets[0]).toBe(1); // le=0.1
    });

    it('should track cumulative bucket counts correctly', () => {
      // Observe values: 0.05, 0.3, 1.5, 15
      metrics.observeJobDuration('success', 0.05);  // le=0.1 and all higher
      metrics.observeJobDuration('success', 0.3);   // le=0.5 and all higher
      metrics.observeJobDuration('success', 1.5);   // le=2.5 and all higher
      metrics.observeJobDuration('success', 15);    // le=20 and all higher
      
      const histograms = metrics.getJobDurationHistogram();
      
      // Buckets: [0.1, 0.25, 0.5, 1, 2.5, 5, 10, 20, 40, 80]
      // Cumulative counts:
      // 0.05 ≤ 0.1 → bucket[0]++ (and all higher buckets)
      // 0.3 ≤ 0.5 → bucket[2]++ (and all higher buckets)
      // 1.5 ≤ 2.5 → bucket[4]++ (and all higher buckets)
      // 15 ≤ 20 → bucket[7]++ (and all higher buckets)
      
      // bucket[0] (le=0.1): 1 (only 0.05)
      // bucket[1] (le=0.25): 1 (only 0.05)
      // bucket[2] (le=0.5): 2 (0.05 + 0.3)
      // bucket[3] (le=1): 2 (0.05 + 0.3)
      // bucket[4] (le=2.5): 3 (0.05 + 0.3 + 1.5)
      // bucket[5] (le=5): 3
      // bucket[6] (le=10): 3
      // bucket[7] (le=20): 4 (all values)
      // bucket[8] (le=40): 4
      // bucket[9] (le=80): 4
      
      expect(histograms.success.buckets[0]).toBe(1);  // le=0.1
      expect(histograms.success.buckets[1]).toBe(1);  // le=0.25
      expect(histograms.success.buckets[2]).toBe(2);  // le=0.5
      expect(histograms.success.buckets[3]).toBe(2);  // le=1
      expect(histograms.success.buckets[4]).toBe(3);  // le=2.5
      expect(histograms.success.buckets[5]).toBe(3);  // le=5
      expect(histograms.success.buckets[6]).toBe(3);  // le=10
      expect(histograms.success.buckets[7]).toBe(4);  // le=20
      
      expect(histograms.success.count).toBe(4);
      expect(histograms.success.sum).toBeCloseTo(0.05 + 0.3 + 1.5 + 15, 5);
    });

    it('should track sum and count accurately', () => {
      const values = [0.1, 0.2, 0.5, 1.0, 2.0];
      for (const v of values) {
        metrics.observeJobDuration('success', v);
      }
      
      const histograms = metrics.getJobDurationHistogram();
      expect(histograms.success.count).toBe(5);
      expect(histograms.success.sum).toBeCloseTo(3.8, 5);
    });

    it('should separate outcomes correctly', () => {
      metrics.observeJobDuration('success', 1.0);
      metrics.observeJobDuration('noop', 0.5);
      metrics.observeJobDuration('dlq', 2.0);
      metrics.observeJobDuration('retry_scheduled', 0.3);
      
      const histograms = metrics.getJobDurationHistogram();
      
      expect(histograms.success.count).toBe(1);
      expect(histograms.success.sum).toBe(1.0);
      
      expect(histograms.noop.count).toBe(1);
      expect(histograms.noop.sum).toBe(0.5);
      
      expect(histograms.dlq.count).toBe(1);
      expect(histograms.dlq.sum).toBe(2.0);
      
      expect(histograms.retry_scheduled.count).toBe(1);
      expect(histograms.retry_scheduled.sum).toBe(0.3);
    });

    it('should export histogram in Prometheus format with cumulative buckets', () => {
      metrics.observeJobDuration('success', 0.05);
      metrics.observeJobDuration('success', 0.3);
      metrics.observeJobDuration('success', 1.5);
      
      const text = metrics.toPrometheusText();
      
      expect(text).toContain('# HELP manifest_retry_job_duration_seconds');
      expect(text).toContain('# TYPE manifest_retry_job_duration_seconds histogram');
      
      // Check cumulative buckets for success
      // 0.05 ≤ all buckets
      // 0.3 ≤ 0.5 and higher
      // 1.5 ≤ 2.5 and higher
      // Cumulative: bucket[0]=1, bucket[1]=1, bucket[2]=2, bucket[3]=2, bucket[4]=3, ...
      expect(text).toContain('manifest_retry_job_duration_seconds_bucket{outcome="success",le="0.1"} 1');
      expect(text).toContain('manifest_retry_job_duration_seconds_bucket{outcome="success",le="0.25"} 1');
      expect(text).toContain('manifest_retry_job_duration_seconds_bucket{outcome="success",le="0.5"} 2');
      expect(text).toContain('manifest_retry_job_duration_seconds_bucket{outcome="success",le="2.5"} 3');
      expect(text).toContain('manifest_retry_job_duration_seconds_bucket{outcome="success",le="+Inf"} 3');
      expect(text).toContain('manifest_retry_job_duration_seconds_sum{outcome="success"}');
      expect(text).toContain('manifest_retry_job_duration_seconds_count{outcome="success"} 3');
    });

    it('should include histogram in snapshot', () => {
      metrics.observeJobDuration('success', 1.0);
      metrics.observeJobDuration('dlq', 5.0);
      
      const snapshot = metrics.getSnapshot();
      
      expect(snapshot.jobDuration.success.count).toBe(1);
      expect(snapshot.jobDuration.success.sum).toBe(1.0);
      expect(snapshot.jobDuration.dlq.count).toBe(1);
      expect(snapshot.jobDuration.dlq.sum).toBe(5.0);
    });

    it('should reset histograms on reset()', () => {
      metrics.observeJobDuration('success', 1.0);
      metrics.observeJobDuration('dlq', 2.0);
      
      metrics.reset();
      
      const histograms = metrics.getJobDurationHistogram();
      expect(histograms.success.count).toBe(0);
      expect(histograms.success.sum).toBe(0);
      expect(histograms.dlq.count).toBe(0);
      expect(histograms.dlq.sum).toBe(0);
    });
  });

  // ==========================================================================
  // Test 13: DLQ Metrics (Phase 10.1.13)
  // ==========================================================================
  describe('DLQ Metrics', () => {
    it('should initialize DLQ sizes to 0', () => {
      const sizes = metrics.getDlqSize();
      
      expect(sizes.DLQ_OPEN).toBe(0);
      expect(sizes.DLQ_RESOLVED).toBe(0);
    });

    it('should set DLQ size for specific status', () => {
      metrics.setDlqSize('DLQ_OPEN', 5);
      metrics.setDlqSize('DLQ_RESOLVED', 10);
      
      const sizes = metrics.getDlqSize();
      expect(sizes.DLQ_OPEN).toBe(5);
      expect(sizes.DLQ_RESOLVED).toBe(10);
    });

    it('should set all DLQ sizes at once', () => {
      metrics.setAllDlqSizes(15, 25);
      
      const sizes = metrics.getDlqSize();
      expect(sizes.DLQ_OPEN).toBe(15);
      expect(sizes.DLQ_RESOLVED).toBe(25);
    });

    it('should initialize DLQ oldest age to 0', () => {
      expect(metrics.getDlqOldestAgeSeconds()).toBe(0);
    });

    it('should set DLQ oldest age', () => {
      metrics.setDlqOldestAgeSeconds(3600); // 1 hour
      
      expect(metrics.getDlqOldestAgeSeconds()).toBe(3600);
    });

    it('should clamp negative DLQ oldest age to 0', () => {
      metrics.setDlqOldestAgeSeconds(-100);
      
      expect(metrics.getDlqOldestAgeSeconds()).toBe(0);
    });

    it('should return 0 for empty DLQ oldest age', () => {
      // Simulate empty DLQ
      metrics.setDlqSize('DLQ_OPEN', 0);
      metrics.setDlqOldestAgeSeconds(0);
      
      expect(metrics.getDlqOldestAgeSeconds()).toBe(0);
    });

    it('should export DLQ metrics in Prometheus format', () => {
      metrics.setAllDlqSizes(8, 12);
      metrics.setDlqOldestAgeSeconds(7200);
      
      const text = metrics.toPrometheusText();
      
      expect(text).toContain('# HELP manifest_dlq_size');
      expect(text).toContain('# TYPE manifest_dlq_size gauge');
      expect(text).toContain('manifest_dlq_size{status="DLQ_OPEN"} 8');
      expect(text).toContain('manifest_dlq_size{status="DLQ_RESOLVED"} 12');
      
      expect(text).toContain('# HELP manifest_dlq_oldest_age_seconds');
      expect(text).toContain('# TYPE manifest_dlq_oldest_age_seconds gauge');
      expect(text).toContain('manifest_dlq_oldest_age_seconds 7200');
    });

    it('should include DLQ metrics in snapshot', () => {
      metrics.setAllDlqSizes(3, 7);
      metrics.setDlqOldestAgeSeconds(1800);
      
      const snapshot = metrics.getSnapshot();
      
      expect(snapshot.dlqSize.DLQ_OPEN).toBe(3);
      expect(snapshot.dlqSize.DLQ_RESOLVED).toBe(7);
      expect(snapshot.dlqOldestAgeSeconds).toBe(1800);
    });

    it('should reset DLQ metrics on reset()', () => {
      metrics.setAllDlqSizes(100, 200);
      metrics.setDlqOldestAgeSeconds(9999);
      
      metrics.reset();
      
      const sizes = metrics.getDlqSize();
      expect(sizes.DLQ_OPEN).toBe(0);
      expect(sizes.DLQ_RESOLVED).toBe(0);
      expect(metrics.getDlqOldestAgeSeconds()).toBe(0);
    });
  });

  // ==========================================================================
  // Test 14: DoneReason to JobDurationOutcome Mapping (Phase 10.1.13)
  // ==========================================================================
  describe('DoneReason to JobDurationOutcome Mapping', () => {
    it('should map OK to success', () => {
      expect(ManifestRetryMetricsService.mapDoneReasonToOutcome('OK')).toBe('success');
    });

    it('should map DONE_NOOP to noop', () => {
      expect(ManifestRetryMetricsService.mapDoneReasonToOutcome('DONE_NOOP')).toBe('noop');
    });

    it('should map DLQ to dlq', () => {
      expect(ManifestRetryMetricsService.mapDoneReasonToOutcome('DLQ')).toBe('dlq');
    });

    it('should map unknown reasons to dlq (fallback)', () => {
      // @ts-expect-error - Testing invalid input
      expect(ManifestRetryMetricsService.mapDoneReasonToOutcome('UNKNOWN')).toBe('dlq');
    });

    it('should observe job duration from DoneReason', () => {
      metrics.observeJobDurationFromReason('OK', 1.5);
      metrics.observeJobDurationFromReason('DONE_NOOP', 0.1);
      metrics.observeJobDurationFromReason('DLQ', 30.0);
      
      const histograms = metrics.getJobDurationHistogram();
      
      expect(histograms.success.count).toBe(1);
      expect(histograms.success.sum).toBe(1.5);
      
      expect(histograms.noop.count).toBe(1);
      expect(histograms.noop.sum).toBe(0.1);
      
      expect(histograms.dlq.count).toBe(1);
      expect(histograms.dlq.sum).toBe(30.0);
    });
  });

  // ==========================================================================
  // Test 15: Histogram Bucket Configuration (Phase 10.1.13)
  // ==========================================================================
  describe('Histogram Bucket Configuration', () => {
    it('should have correct bucket boundaries', () => {
      expect(DURATION_HISTOGRAM_BUCKETS).toEqual([0.1, 0.25, 0.5, 1, 2.5, 5, 10, 20, 40, 80]);
    });

    it('should have 10 buckets', () => {
      expect(DURATION_HISTOGRAM_BUCKETS.length).toBe(10);
    });

    it('should have buckets in ascending order', () => {
      for (let i = 1; i < DURATION_HISTOGRAM_BUCKETS.length; i++) {
        expect(DURATION_HISTOGRAM_BUCKETS[i]).toBeGreaterThan(DURATION_HISTOGRAM_BUCKETS[i - 1]);
      }
    });
  });

  // ==========================================================================
  // Test 16: Extended Prometheus Export Validation (Phase 10.1.13)
  // ==========================================================================
  describe('Extended Prometheus Export', () => {
    it('should export all Phase 10.1.13 metrics', () => {
      // Set up all metrics
      metrics.setAllQueueSizes({ PENDING: 5, IN_PROGRESS: 2, RETRY_SCHEDULED: 3, DONE: 100 });
      metrics.setAllDlqSizes(4, 10);
      metrics.setDlqOldestAgeSeconds(3600);
      metrics.observeJobDuration('success', 1.0);
      metrics.observeJobDuration('dlq', 5.0);
      
      const text = metrics.toPrometheusText();
      
      // Queue size
      expect(text).toContain('manifest_retry_queue_size{status="PENDING"} 5');
      expect(text).toContain('manifest_retry_queue_size{status="IN_PROGRESS"} 2');
      
      // DLQ size
      expect(text).toContain('manifest_dlq_size{status="DLQ_OPEN"} 4');
      expect(text).toContain('manifest_dlq_size{status="DLQ_RESOLVED"} 10');
      
      // DLQ oldest age
      expect(text).toContain('manifest_dlq_oldest_age_seconds 3600');
      
      // Job duration histogram
      expect(text).toContain('manifest_retry_job_duration_seconds_bucket{outcome="success"');
      expect(text).toContain('manifest_retry_job_duration_seconds_bucket{outcome="dlq"');
      expect(text).toContain('manifest_retry_job_duration_seconds_sum{outcome="success"} 1');
      expect(text).toContain('manifest_retry_job_duration_seconds_count{outcome="success"} 1');
    });

    it('should not contain forbidden labels in extended metrics', () => {
      metrics.setAllQueueSizes({ PENDING: 5, IN_PROGRESS: 2, RETRY_SCHEDULED: 3, DONE: 100 });
      metrics.setAllDlqSizes(4, 10);
      metrics.observeJobDuration('success', 1.0);
      
      const text = metrics.toPrometheusText();
      
      // Verify no forbidden labels
      expect(text).not.toContain('bundleId');
      expect(text).not.toContain('bundle_id');
      expect(text).not.toContain('tenantId');
      expect(text).not.toContain('tenant_id');
      expect(text).not.toContain('jobId');
      expect(text).not.toContain('job_id');
      expect(text).not.toContain('userId');
      expect(text).not.toContain('user_id');
    });
  });
});
