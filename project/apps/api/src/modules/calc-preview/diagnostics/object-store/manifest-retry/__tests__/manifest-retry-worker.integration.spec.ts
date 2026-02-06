/**
 * Manifest Retry Worker Integration Tests - Phase 10.1.6
 */
import { ScriptedFakeObjectStore } from './scripted-fake-object-store';
import { ManifestRetryWorkerService, type IManifestWriter, type ManifestWriteResult, type IWorkerMetrics } from '../manifest-retry-worker.service';
import { type RetryQueueJob, type RetryQueueStatus, type RetrySource, type DoneReason } from '../manifest-retry.types';
import { ManifestErrorCode } from '../manifest-error-classifier';
import { DEFAULT_WORKER_CONFIG } from '../manifest-retry-worker.config';

class InMemoryRetryQueueRepository {
  private jobs = new Map<string, RetryQueueJob>();
  private jobsByBundle = new Map<string, string>();
  async enqueue(input: { bundleId: string; source: string; maxAttempts?: number }): Promise<{ jobId: string; alreadyQueued: boolean }> {
    const existingJobId = this.jobsByBundle.get(input.bundleId);
    if (existingJobId) { const existingJob = this.jobs.get(existingJobId); if (existingJob && existingJob.status !== 'DONE') return { jobId: existingJobId, alreadyQueued: true }; }
    const jobId = 'job-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    const job: RetryQueueJob = { id: jobId, bundleId: input.bundleId, status: 'PENDING' as RetryQueueStatus, attempt: 0, maxAttempts: input.maxAttempts ?? 7, source: input.source as RetrySource, nextAttemptAt: null, leasedUntil: null, leasedBy: null, lastErrorCode: null, lastErrorMessage: null, doneReason: null, createdAt: new Date(), updatedAt: new Date() };
    this.jobs.set(jobId, job); this.jobsByBundle.set(input.bundleId, jobId);
    return { jobId, alreadyQueued: false };
  }
  async claimNext(workerId: string, leaseMs: number): Promise<{ claimed: boolean; job?: RetryQueueJob }> {
    const now = new Date();
    for (const job of this.jobs.values()) {
      const isPending = job.status === 'PENDING';
      const isRetryReady = job.status === 'RETRY_SCHEDULED' && job.nextAttemptAt && job.nextAttemptAt <= now;
      const isLeaseExpired = job.status === 'IN_PROGRESS' && job.leasedUntil && job.leasedUntil < now;
      if (isPending || isRetryReady || isLeaseExpired) { job.status = 'IN_PROGRESS' as RetryQueueStatus; job.leasedBy = workerId; job.leasedUntil = new Date(now.getTime() + leaseMs); job.updatedAt = now; return { claimed: true, job: { ...job } }; }
    }
    return { claimed: false };
  }
  async markDone(input: { jobId: string; reason: string }): Promise<void> { const job = this.jobs.get(input.jobId); if (job) { job.status = 'DONE' as RetryQueueStatus; job.doneReason = input.reason as DoneReason; job.updatedAt = new Date(); } }
  async scheduleRetry(input: { jobId: string; errorCode: ManifestErrorCode; errorMessage?: string; nextAttemptAt: Date }): Promise<void> { const job = this.jobs.get(input.jobId); if (job) { job.status = 'RETRY_SCHEDULED' as RetryQueueStatus; job.attempt += 1; job.lastErrorCode = input.errorCode; job.lastErrorMessage = input.errorMessage ?? null; job.nextAttemptAt = input.nextAttemptAt; job.leasedBy = null; job.leasedUntil = null; job.updatedAt = new Date(); } }
  findByBundleId(bundleId: string): RetryQueueJob | undefined { const jobId = this.jobsByBundle.get(bundleId); return jobId ? this.jobs.get(jobId) : undefined; }
  clear(): void { this.jobs.clear(); this.jobsByBundle.clear(); }
}
interface DlqEntry { id: string; bundleId: string; status: string; attempt: number; errorCode: ManifestErrorCode; errorMessage?: string; firstFailedAt: Date; lastFailedAt: Date; }
class InMemoryDlqRepository {
  private entries = new Map<string, DlqEntry>();
  async upsert(input: { bundleId: string; attempt: number; errorCode: ManifestErrorCode; errorMessage?: string; firstFailedAt: Date; lastFailedAt: Date }): Promise<void> {
    const existing = this.entries.get(input.bundleId);
    if (existing) { existing.attempt = input.attempt; existing.errorCode = input.errorCode; if (input.errorMessage !== undefined) existing.errorMessage = input.errorMessage; existing.lastFailedAt = input.lastFailedAt; }
    else { const entry: DlqEntry = { id: 'dlq-' + Date.now(), bundleId: input.bundleId, status: 'OPEN', attempt: input.attempt, errorCode: input.errorCode, firstFailedAt: input.firstFailedAt, lastFailedAt: input.lastFailedAt }; if (input.errorMessage !== undefined) entry.errorMessage = input.errorMessage; this.entries.set(input.bundleId, entry); }
  }
  findByBundleId(bundleId: string): DlqEntry | undefined { return this.entries.get(bundleId); }
  clear(): void { this.entries.clear(); }
}
class TestMetricsCollector implements IWorkerMetrics {
  private counters = new Map<string, number>();
  private labels = new Map<string, Set<string>>();
  recordJobClaimed(source: string): void { this.increment('job_claimed_total'); this.addLabel('job_claimed_total', 'source', source); }
  recordJobDone(reason: string, _durationMs: number): void { this.increment('job_done_total'); this.addLabel('job_done_total', 'reason', reason); }
  recordJobRetryScheduled(errorCode: string, attempt: number): void { this.increment('job_retry_scheduled_total'); this.addLabel('job_retry_scheduled_total', 'error_code', errorCode); this.addLabel('job_retry_scheduled_total', 'attempt', String(attempt)); }
  recordJobDlq(errorCode: string): void { this.increment('job_dlq_total'); this.addLabel('job_dlq_total', 'error_code', errorCode); }
  recordCircuitBreakerState(_state: 'closed' | 'open' | 'half_open'): void {}
  recordWorkerPoll(): void { this.increment('worker_poll_total'); }
  recordWorkerIdle(): void { this.increment('worker_idle_total'); }
  recordWorkerError(errorCode: string): void { this.increment('worker_error_total'); this.addLabel('worker_error_total', 'error_code', errorCode); }
  getCounter(name: string): number { return this.counters.get(name) ?? 0; }
  getAllLabelKeys(): Set<string> { const allKeys = new Set<string>(); for (const labelSet of this.labels.values()) { for (const label of labelSet) { allKeys.add(label.split('=')[0]); } } return allKeys; }
  clear(): void { this.counters.clear(); this.labels.clear(); }
  private increment(name: string): void { this.counters.set(name, (this.counters.get(name) ?? 0) + 1); }
  private addLabel(metric: string, key: string, value: string): void { if (!this.labels.has(metric)) this.labels.set(metric, new Set()); this.labels.get(metric)!.add(key + '=' + value); }
}
class FakeManifestWriter implements IManifestWriter {
  constructor(private readonly fakeStore: ScriptedFakeObjectStore) {}
  async tryWriteManifest(bundleId: string): Promise<ManifestWriteResult> {
    const key = 'bundles/' + bundleId + '/manifest.json';
    try {
      await this.fakeStore.putWriteOnce({ key, body: Buffer.from(JSON.stringify({ bundleId, version: '1.0.0' })), contentType: 'application/json' });
      return { outcome: 'written', manifestKey: key };
    } catch (error: unknown) {
      const err = error as { name?: string; code?: string; $metadata?: { httpStatusCode?: number } };
      if (err.name === 'ObjectAlreadyExistsError') return { outcome: 'already_exists', manifestKey: key };
      if (err.name === 'AbortError') return { outcome: 'error', error, errorCode: ManifestErrorCode.S3_TIMEOUT, errorMessage: 'Write timeout' };
      if (err.name === 'ObjectStoreAccessDeniedError') return { outcome: 'error', error, errorCode: ManifestErrorCode.S3_ACCESS_DENIED, errorMessage: 'Access denied' };
      if (err.code === 'ServiceUnavailable' || err.$metadata?.httpStatusCode === 503) return { outcome: 'error', error, errorCode: ManifestErrorCode.S3_5XX, errorMessage: 'Service unavailable' };
      if (err.code === 'ECONNRESET') return { outcome: 'error', error, errorCode: ManifestErrorCode.S3_CONNECTION_RESET, errorMessage: 'Connection reset' };
      if (err.code === 'ENOTFOUND') return { outcome: 'error', error, errorCode: ManifestErrorCode.S3_DNS, errorMessage: 'DNS resolution failed' };
      return { outcome: 'error', error, errorCode: ManifestErrorCode.UNKNOWN, errorMessage: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
}

describe('ManifestRetryWorker Integration Tests', () => {
  let fakeStore: ScriptedFakeObjectStore;
  let retryQueue: InMemoryRetryQueueRepository;
  let dlqRepo: InMemoryDlqRepository;
  let manifestWriter: FakeManifestWriter;
  let metrics: TestMetricsCollector;
  let worker: ManifestRetryWorkerService;
  const TEST_BUNDLE_ID = 'test-bundle-12345';

  beforeEach(async () => {
    fakeStore = new ScriptedFakeObjectStore();
    retryQueue = new InMemoryRetryQueueRepository();
    dlqRepo = new InMemoryDlqRepository();
    manifestWriter = new FakeManifestWriter(fakeStore);
    metrics = new TestMetricsCollector();
    worker = new ManifestRetryWorkerService(retryQueue as any, dlqRepo as any, manifestWriter, metrics, { ...DEFAULT_WORKER_CONFIG, pollIntervalMs: 10, circuitBreakerEnabled: false });
    await retryQueue.enqueue({ bundleId: TEST_BUNDLE_ID, source: 'post_seal_hook' });
  });
  afterEach(() => { fakeStore.reset(); retryQueue.clear(); dlqRepo.clear(); metrics.clear(); });

  describe('IT-1: Retryable -> schedule', () => {
    it('should schedule retry on timeout', async () => {
      fakeStore.setNextResponse({ mode: 'timeout' });
      const result = await worker.processOnce();
      expect(result.processed).toBe(true);
      expect(result.decision).toBe('RETRY');
      const job = retryQueue.findByBundleId(TEST_BUNDLE_ID);
      expect(job!.status).toBe('RETRY_SCHEDULED');
      expect(job!.attempt).toBe(1);
      expect(job!.lastErrorCode).toBe(ManifestErrorCode.S3_TIMEOUT);
    });
    it('should schedule retry on 503', async () => {
      fakeStore.setNextResponse({ mode: '503' });
      const result = await worker.processOnce();
      expect(result.decision).toBe('RETRY');
      expect(retryQueue.findByBundleId(TEST_BUNDLE_ID)!.lastErrorCode).toBe(ManifestErrorCode.S3_5XX);
    });
    it('should schedule retry on connection reset', async () => {
      fakeStore.setNextResponse({ mode: 'connection_reset' });
      const result = await worker.processOnce();
      expect(result.decision).toBe('RETRY');
      expect(retryQueue.findByBundleId(TEST_BUNDLE_ID)!.lastErrorCode).toBe(ManifestErrorCode.S3_CONNECTION_RESET);
    });
  });

  describe('IT-2: Backoff increases', () => {
    it('should increase backoff on consecutive failures', async () => {
      fakeStore.setResponses([{ mode: '503' }, { mode: 'connection_reset' }]);
      await worker.processOnce();
      const jobAfterFirst = retryQueue.findByBundleId(TEST_BUNDLE_ID)!;
      const firstBackoff = jobAfterFirst.nextAttemptAt!.getTime() - Date.now();
      jobAfterFirst.nextAttemptAt = new Date(Date.now() - 1000);
      await worker.processOnce();
      const secondBackoff = retryQueue.findByBundleId(TEST_BUNDLE_ID)!.nextAttemptAt!.getTime() - Date.now();
      expect(secondBackoff).toBeGreaterThan(firstBackoff);
    });
  });

  describe('IT-3: Non-retryable -> DLQ', () => {
    it('should move to DLQ on 403', async () => {
      fakeStore.setNextResponse({ mode: '403' });
      const result = await worker.processOnce();
      expect(result.decision).toBe('DLQ');
      const job = retryQueue.findByBundleId(TEST_BUNDLE_ID)!;
      expect(job.status).toBe('DONE');
      expect(job.doneReason).toBe('DLQ');
      const dlqEntry = dlqRepo.findByBundleId(TEST_BUNDLE_ID)!;
      expect(dlqEntry.errorCode).toBe(ManifestErrorCode.S3_ACCESS_DENIED);
    });
  });

  describe('IT-4: Already exists -> DONE_NOOP', () => {
    it('should mark DONE_NOOP when manifest exists', async () => {
      fakeStore.setNextResponse({ mode: 'already_exists' });
      const result = await worker.processOnce();
      expect(result.decision).toBe('DONE_NOOP');
      expect(retryQueue.findByBundleId(TEST_BUNDLE_ID)!.status).toBe('DONE');
      expect(dlqRepo.findByBundleId(TEST_BUNDLE_ID)).toBeUndefined();
    });
    it('should mark DONE on success', async () => {
      fakeStore.setNextResponse({ mode: 'success' });
      const result = await worker.processOnce();
      expect(result.decision).toBe('DONE_NOOP');
      expect(retryQueue.findByBundleId(TEST_BUNDLE_ID)!.status).toBe('DONE');
    });
  });

  describe('IT-5: Lease expiry -> reclaim', () => {
    it('should reclaim expired job without incrementing attempt', async () => {
      const job = retryQueue.findByBundleId(TEST_BUNDLE_ID)!;
      const originalAttempt = job.attempt;
      job.status = 'IN_PROGRESS' as RetryQueueStatus;
      job.leasedBy = 'worker-a';
      job.leasedUntil = new Date(Date.now() - 1000);
      fakeStore.setNextResponse({ mode: 'success' });
      const result = await worker.processOnce();
      expect(result.processed).toBe(true);
      expect(retryQueue.findByBundleId(TEST_BUNDLE_ID)!.attempt).toBe(originalAttempt);
    });
  });

  describe('IT-6: Metrics label policy', () => {
    it('MUST NOT use high-cardinality labels', async () => {
      fakeStore.setNextResponse({ mode: 'success' });
      await worker.processOnce();
      const allLabelKeys = metrics.getAllLabelKeys();
      expect(allLabelKeys.has('bundleId')).toBe(false);
      expect(allLabelKeys.has('tenantId')).toBe(false);
      expect(allLabelKeys.has('jobId')).toBe(false);
      expect(allLabelKeys.has('userId')).toBe(false);
    });
    it('should emit job_claimed_total', async () => { fakeStore.setNextResponse({ mode: 'success' }); await worker.processOnce(); expect(metrics.getCounter('job_claimed_total')).toBeGreaterThanOrEqual(1); });
    it('should emit job_done_total', async () => { fakeStore.setNextResponse({ mode: 'success' }); await worker.processOnce(); expect(metrics.getCounter('job_done_total')).toBe(1); });
    it('should emit job_retry_scheduled_total', async () => { fakeStore.setNextResponse({ mode: 'timeout' }); await worker.processOnce(); expect(metrics.getCounter('job_retry_scheduled_total')).toBe(1); });
    it('should emit job_dlq_total', async () => { fakeStore.setNextResponse({ mode: '403' }); await worker.processOnce(); expect(metrics.getCounter('job_dlq_total')).toBe(1); });
  });

  describe('Edge cases', () => {
    it('should return no_jobs when queue is empty', async () => { retryQueue.clear(); const result = await worker.processOnce(); expect(result.processed).toBe(false); expect(result.reason).toBe('no_jobs'); });
    it('should handle slow_success', async () => { fakeStore.setNextResponse({ mode: 'slow_success', delayMs: 100 }); const result = await worker.processOnce(); expect(result.decision).toBe('DONE_NOOP'); });
    it('should move to DLQ after max attempts', async () => {
      retryQueue.clear();
      await retryQueue.enqueue({ bundleId: TEST_BUNDLE_ID, source: 'post_seal_hook', maxAttempts: 2 });
      fakeStore.setNextResponse({ mode: 'timeout' });
      await worker.processOnce();
      retryQueue.findByBundleId(TEST_BUNDLE_ID)!.nextAttemptAt = new Date(Date.now() - 1000);
      fakeStore.setNextResponse({ mode: 'timeout' });
      await worker.processOnce();
      expect(retryQueue.findByBundleId(TEST_BUNDLE_ID)!.doneReason).toBe('DLQ');
      expect(dlqRepo.findByBundleId(TEST_BUNDLE_ID)).toBeDefined();
    });
  });
});