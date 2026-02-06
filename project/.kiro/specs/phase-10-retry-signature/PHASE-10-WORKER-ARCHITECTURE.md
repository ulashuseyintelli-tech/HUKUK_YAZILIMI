# Phase 10.1.6+ Worker Architecture

**Status**: LOCKED  
**Date**: 2026-02-02  
**Author**: Kiro AI

---

## 1. System Overview

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                         PHASE 10: RETRY PIPELINE ARCHITECTURE                        │
└─────────────────────────────────────────────────────────────────────────────────────┘

                                    ┌─────────────────┐
                                    │   Seal Event    │
                                    │  (Phase 9C)     │
                                    └────────┬────────┘
                                             │
                                             │ post-seal hook (fire-and-forget)
                                             ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              RETRY QUEUE (PostgreSQL)                                │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐          │
│  │   PENDING   │───►│ IN_PROGRESS │───►│RETRY_SCHED  │───►│    DONE     │          │
│  └─────────────┘    └──────┬──────┘    └─────────────┘    └─────────────┘          │
│                            │                                     ▲                  │
│                            │ (permanent error / max attempts)    │                  │
│                            ▼                                     │                  │
│                     ┌─────────────┐                              │                  │
│                     │     DLQ     │──────────────────────────────┘                  │
│                     │   INSERT    │     (done_reason='DLQ')                         │
│                     └─────────────┘                                                 │
└─────────────────────────────────────────────────────────────────────────────────────┘
                                             │
                                             │ SKIP LOCKED claim
                                             ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              RETRY WORKER (NestJS Service)                           │
│                                                                                      │
│  ┌──────────────────────────────────────────────────────────────────────────────┐   │
│  │                           WORKER LOOP                                         │   │
│  │                                                                               │   │
│  │   ┌─────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐       │   │
│  │   │  Claim  │───►│ Try Write   │───►│  Classify   │───►│ Transition  │       │   │
│  │   │  Job    │    │  Manifest   │    │   Error     │    │   State     │       │   │
│  │   └─────────┘    └─────────────┘    └─────────────┘    └─────────────┘       │   │
│  │        │                                                      │               │   │
│  │        │ (no jobs)                                           │               │   │
│  │        ▼                                                      ▼               │   │
│  │   ┌─────────┐                                          ┌─────────────┐       │   │
│  │   │  Sleep  │                                          │   Metrics   │       │   │
│  │   │ (poll)  │                                          │    Emit     │       │   │
│  │   └─────────┘                                          └─────────────┘       │   │
│  └──────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                      │
│  ┌──────────────────────────────────────────────────────────────────────────────┐   │
│  │                         CIRCUIT BREAKER                                       │   │
│  │                                                                               │   │
│  │   CLOSED ──(5 consecutive failures)──► OPEN ──(60s)──► HALF-OPEN            │   │
│  │      ▲                                                      │                │   │
│  │      └──────────────────(probe success)─────────────────────┘                │   │
│  └──────────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────────┘
                                             │
                                             │ write-once PUT
                                             ▼
                                    ┌─────────────────┐
                                    │  Object Store   │
                                    │  (MinIO/S3)     │
                                    └─────────────────┘
```

---

## 2. Worker State Machine (LOCKED)

```
                              ┌─────────────────────────────────────┐
                              │         STATE TRANSITIONS           │
                              └─────────────────────────────────────┘

    ┌──────────────────────────────────────────────────────────────────────────────┐
    │                                                                              │
    │   PENDING ─────────────────────────────────────────────────► IN_PROGRESS    │
    │      │                                                            │          │
    │      │                                                            │          │
    │      │                                                            ▼          │
    │      │                                                    ┌──────────────┐   │
    │      │                                                    │   SUCCESS    │   │
    │      │                                                    │  (written)   │   │
    │      │                                                    └──────┬───────┘   │
    │      │                                                           │           │
    │      │                                                           ▼           │
    │      │                                                    ┌──────────────┐   │
    │      │                                                    │     DONE     │   │
    │      │                                                    │ reason='OK'  │   │
    │      │                                                    └──────────────┘   │
    │      │                                                                       │
    │      │                                                    ┌──────────────┐   │
    │      │                                                    │ ALREADY_EXIST│   │
    │      │                                                    │  (no-op)     │   │
    │      │                                                    └──────┬───────┘   │
    │      │                                                           │           │
    │      │                                                           ▼           │
    │      │                                                    ┌──────────────┐   │
    │      │                                                    │     DONE     │   │
    │      │                                                    │reason='NOOP' │   │
    │      │                                                    └──────────────┘   │
    │      │                                                                       │
    │      │                                                    ┌──────────────┐   │
    │      │                                                    │  TRANSIENT   │   │
    │      │                                                    │   ERROR      │   │
    │      │                                                    └──────┬───────┘   │
    │      │                                                           │           │
    │      │                                                           ▼           │
    │      │                                                    ┌──────────────┐   │
    │      │                                                    │RETRY_SCHED   │   │
    │      │                                                    │next_attempt  │   │
    │      │                                                    └──────┬───────┘   │
    │      │                                                           │           │
    │      └───────────────────────────────────────────────────────────┘           │
    │                                                                              │
    │                                                           ┌──────────────┐   │
    │                                                           │  PERMANENT   │   │
    │                                                           │   ERROR      │   │
    │                                                           └──────┬───────┘   │
    │                                                                  │           │
    │                                                                  ▼           │
    │                                                           ┌──────────────┐   │
    │                                                           │  DLQ INSERT  │   │
    │                                                           │     +        │   │
    │                                                           │     DONE     │   │
    │                                                           │reason='DLQ'  │   │
    │                                                           └──────────────┘   │
    │                                                                              │
    └──────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Worker Contract (LOCKED)

### 3.1 Core Loop Pseudocode

```typescript
// manifest-retry-worker.service.ts

class ManifestRetryWorker {
  private running = false;
  private readonly instanceId = generateInstanceId();
  
  async start(): Promise<void> {
    this.running = true;
    while (this.running) {
      await this.processOnce();
      await sleep(this.config.pollIntervalMs);
    }
  }
  
  async processOnce(): Promise<WorkerResult> {
    // 1. Circuit breaker check
    if (this.circuitBreaker.isOpen()) {
      this.metrics.emit('retry_worker_circuit_open');
      return { skipped: true, reason: 'circuit_open' };
    }
    
    // 2. Claim next job
    const claimResult = await this.retryQueue.claimNext(
      this.instanceId,
      this.config.leaseMs
    );
    
    if (!claimResult.claimed) {
      return { processed: false, reason: 'no_jobs' };
    }
    
    const job = claimResult.job!;
    const startTime = Date.now();
    
    try {
      // 3. Attempt manifest write
      const writeResult = await this.manifestWriter.tryWriteManifest(job.bundleId);
      
      // 4. Classify result
      const decision = this.classifyResult(writeResult, job.attempt);
      
      // 5. Execute transition
      await this.executeTransition(job, decision, writeResult);
      
      // 6. Update circuit breaker
      this.circuitBreaker.recordSuccess();
      
      // 7. Emit metrics
      this.emitMetrics(job, decision, Date.now() - startTime);
      
      return { processed: true, decision };
      
    } catch (error) {
      // Handle unexpected errors
      const decision = this.classifier.classifyError(error, job.attempt);
      await this.executeTransition(job, decision, { error });
      this.circuitBreaker.recordFailure();
      return { processed: true, decision, error };
    }
  }
  
  private classifyResult(result: WriteResult, attempt: number): ClassifierDecision {
    if (result.outcome === 'written') return 'DONE_SUCCESS';
    if (result.outcome === 'already_exists') return 'DONE_NOOP';
    return this.classifier.classifyError(result.error, attempt);
  }
  
  private async executeTransition(
    job: RetryQueueJob,
    decision: ClassifierDecision,
    result: WriteResult
  ): Promise<void> {
    switch (decision) {
      case 'DONE_SUCCESS':
        await this.retryQueue.markDone({ jobId: job.id, reason: 'OK' });
        break;
        
      case 'DONE_NOOP':
        await this.retryQueue.markDone({ jobId: job.id, reason: 'DONE_NOOP' });
        break;
        
      case 'RETRY':
        if (job.attempt + 1 >= job.maxAttempts) {
          // Max attempts reached → DLQ
          await this.moveToDlq(job, result);
        } else {
          // Schedule retry
          await this.retryQueue.scheduleRetry({
            jobId: job.id,
            errorCode: result.errorCode,
            errorMessage: result.errorMessage,
            nextAttemptAt: calculateNextAttemptAt(job.attempt + 1),
          });
        }
        break;
        
      case 'DLQ':
        await this.moveToDlq(job, result);
        break;
    }
  }
  
  private async moveToDlq(job: RetryQueueJob, result: WriteResult): Promise<void> {
    await this.dlqRepo.upsert({
      bundleId: job.bundleId,
      attempt: job.attempt + 1,
      errorCode: result.errorCode,
      errorMessage: result.errorMessage,
      firstFailedAt: job.createdAt,
      lastFailedAt: new Date(),
    });
    await this.retryQueue.markDone({ jobId: job.id, reason: 'DLQ' });
  }
}
```

### 3.2 ManifestWriter Integration Contract

```typescript
// manifest-writer.interface.ts

interface ManifestWriteResult {
  outcome: 'written' | 'already_exists' | 'error';
  manifestKey?: string;
  error?: unknown;
  errorCode?: ManifestErrorCode;
  errorMessage?: string;
}

interface IManifestWriter {
  /**
   * Attempt to write manifest for bundle.
   * 
   * Returns:
   * - { outcome: 'written' } → Success, manifest created
   * - { outcome: 'already_exists' } → Idempotent success, manifest exists
   * - { outcome: 'error', error, errorCode } → Failed, needs classification
   */
  tryWriteManifest(bundleId: string): Promise<ManifestWriteResult>;
}
```

---

## 4. Circuit Breaker (LOCKED)

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              CIRCUIT BREAKER STATE MACHINE                           │
└─────────────────────────────────────────────────────────────────────────────────────┘

    ┌──────────────────────────────────────────────────────────────────────────────┐
    │                                                                              │
    │                              ┌─────────────┐                                 │
    │                              │   CLOSED    │                                 │
    │                              │  (normal)   │                                 │
    │                              └──────┬──────┘                                 │
    │                                     │                                        │
    │                                     │ 5 consecutive failures                 │
    │                                     │ OR failure_rate > 50% in 5min         │
    │                                     ▼                                        │
    │                              ┌─────────────┐                                 │
    │                              │    OPEN     │                                 │
    │                              │  (paused)   │                                 │
    │                              └──────┬──────┘                                 │
    │                                     │                                        │
    │                                     │ 60 seconds timeout                     │
    │                                     ▼                                        │
    │                              ┌─────────────┐                                 │
    │                              │ HALF-OPEN   │                                 │
    │                              │  (probe)    │                                 │
    │                              └──────┬──────┘                                 │
    │                                     │                                        │
    │                    ┌────────────────┼────────────────┐                       │
    │                    │                │                │                       │
    │                    ▼                │                ▼                       │
    │             probe success           │          probe failure                 │
    │                    │                │                │                       │
    │                    ▼                │                ▼                       │
    │              ┌─────────────┐        │         ┌─────────────┐                │
    │              │   CLOSED    │        │         │    OPEN     │                │
    │              └─────────────┘        │         └─────────────┘                │
    │                                     │                                        │
    └─────────────────────────────────────┴────────────────────────────────────────┘

Configuration:
  - failureThreshold: 5 consecutive failures
  - failureRateThreshold: 50% in 5 minutes
  - resetTimeoutMs: 60_000 (60 seconds)
  - probeCount: 1 (single test request)
```

---

## 5. Metrics (LOCKED)

```typescript
// Retry Queue Metrics
manifest_retry_queue_size{status="pending|in_progress|retry_scheduled|done"}
manifest_retry_job_claimed_total{source="post_seal_hook|admin_retry"}
manifest_retry_job_done_total{reason="ok|done_noop|dlq"}
manifest_retry_job_duration_seconds{outcome="success|retry|dlq"}
manifest_retry_backoff_seconds{attempt="0|1|2|3|4|5|6"}

// DLQ Metrics
manifest_dlq_size{status="open|resolved|redriven"}
manifest_dlq_oldest_age_seconds
manifest_dlq_resolved_total{resolution="manual|redrive"}

// Circuit Breaker Metrics
manifest_retry_circuit_breaker_state{state="closed|open|half_open"}
manifest_retry_circuit_breaker_trips_total

// Worker Metrics
manifest_retry_worker_poll_total
manifest_retry_worker_idle_total
manifest_retry_worker_error_total{error_code="..."}
```

---

## 6. Admin API Endpoints (LOCKED)

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              ADMIN API SURFACE                                       │
└─────────────────────────────────────────────────────────────────────────────────────┘

POST /admin/bundles/{bundleId}/manifest/retry
  ├── Auth: break-glass role required
  ├── Rate limit: 10 req/min per admin
  ├── Behavior: ENQUEUE ONLY (never direct write)
  ├── Response 200: { enqueued: true, jobId, nextAttemptAt }
  ├── Response 200: { enqueued: false, reason: 'ALREADY_QUEUED', existingJobId }
  ├── Response 200: { enqueued: false, reason: 'MANIFEST_EXISTS' }
  └── Audit: logged with admin ID, bundle ID, action

GET /admin/manifest/retry-queue
  ├── Auth: break-glass role required
  ├── Query: ?status=pending|in_progress|retry_scheduled
  └── Response: { stats: { pending, inProgress, retryScheduled, done, total } }

GET /admin/manifest/dlq
  ├── Auth: break-glass role required
  ├── Query: ?status=open|resolved&limit=50&offset=0
  └── Response: { entries: [...], total, oldestAge }

POST /admin/manifest/dlq/{dlqId}/redrive
  ├── Auth: break-glass role required
  ├── Behavior: Create new retry job, mark DLQ as redriven
  ├── Response 200: { redriven: true, newJobId }
  ├── Response 400: { error: 'ALREADY_RESOLVED' }
  └── Audit: logged

POST /admin/manifest/dlq/{dlqId}/resolve
  ├── Auth: break-glass role required
  ├── Body: { resolution: 'manual_fix|wont_fix|duplicate', notes: '...' }
  ├── Response 200: { resolved: true, resolvedAt }
  └── Audit: logged
```

---

## 7. Execution Order (LOCKED)

```
Phase 10.1.6: Retry Worker
  ├── manifest-retry-worker.service.ts
  ├── manifest-retry-worker.config.ts
  ├── __tests__/manifest-retry-worker.spec.ts
  └── __tests__/manifest-retry-worker.integration.spec.ts

Phase 10.1.7: ManifestWriter Integration
  ├── Update bundle-manifest.writer.ts with tryWriteManifest()
  ├── Add retry queue injection
  └── Update existing tests

Phase 10.1.8: Metrics
  ├── manifest-retry-metrics.service.ts
  ├── Add to existing metrics collector
  └── Grafana dashboard update

Phase 10.1.9: Circuit Breaker
  ├── manifest-retry-circuit-breaker.service.ts
  ├── __tests__/manifest-retry-circuit-breaker.spec.ts
  └── Integration with worker

Phase 10.1.10: Admin API
  ├── manifest-admin.controller.ts
  ├── manifest-admin.dto.ts
  ├── __tests__/manifest-admin.controller.spec.ts
  └── Rate limiting + audit logging
```

---

## 8. Critical Invariants (MUST NOT VIOLATE)

| Invariant | Description | Enforcement |
|-----------|-------------|-------------|
| Worker never blocks seal | Retry is out-of-band only | Code review + test |
| Admin endpoint enqueue-only | Never direct write | Code review + test |
| ALREADY_EXISTS = DONE_NOOP | Idempotent success | Classifier contract |
| Per-bundle de-dup | Single active job | Partial unique index |
| Lease prevents stuck jobs | Expired lease = re-claimable | SKIP LOCKED query |
| DLQ is single source | All failures tracked | Upsert on bundle_id |

---

## 9. Test Coverage Requirements

| Component | Unit Tests | Integration Tests |
|-----------|------------|-------------------|
| Retry Worker | 15+ | 5+ |
| Circuit Breaker | 10+ | 3+ |
| ManifestWriter Integration | 10+ | 5+ |
| Admin API | 15+ | 5+ |
| Metrics | 5+ | - |
| **Total** | **55+** | **18+** |

---

## 10. Sign-Off Checklist

Before Phase 10.1.6+ implementation:

- [x] Gap check passed (updated_at, lease expiry, DONE_NOOP, DLQ idempotent, de-dup)
- [x] State machine transitions locked
- [x] Worker contract locked
- [x] Circuit breaker config locked
- [x] Admin API surface locked
- [x] Metrics list locked
- [x] Execution order locked
- [x] Lease semantics locked (Section 11)
- [x] Polling & backpressure locked (Section 12)
- [x] Hard timeout requirement locked (Section 11.5)
- [x] Integration test scenarios locked (Section 13.2)
- [x] Metrics label policy locked (Section 14)

**Status**:
- ✅ Architecture: PRODUCTION-READY (locked)
- ⏳ Implementation: PRODUCTION-READY after integration tests + metrics smoke PASS

---

## 11. Lease Semantics (MUST - Option A: Simple)

**Decision**: Option A (Simple) - No heartbeat, 60s lease sufficient.

### 11.1 MUST Rules

| Rule | Description | Enforcement |
|------|-------------|-------------|
| MUST: No heartbeat | Worker does NOT extend lease during processing | Code review |
| MUST: 60s lease | Default lease duration is 60 seconds | Config locked |
| MUST: Single attempt ≤ 60s | Manifest write attempt MUST NOT exceed 60s | Integration test |
| MUST: Crash recovery | `leased_until < NOW()` allows job reclaim | SKIP LOCKED query |

### 11.2 Rationale

```
Why Option A (Simple) over Option B (Heartbeat)?

1. Job is short-lived:
   - Manifest write = S3 PUT (typically < 5s)
   - 60s lease provides 12x safety margin
   
2. Crash recovery is automatic:
   - Worker crash → lease expires → job re-claimable
   - No orphaned jobs possible
   
3. Complexity reduction:
   - No heartbeat thread
   - No lease extension logic
   - No race conditions between heartbeat and completion
   
4. Phase 10.1 scope:
   - Simple worker first
   - Heartbeat can be added in Phase 10.3 if needed
```

### 11.3 Crash Recovery Flow

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              CRASH RECOVERY SCENARIO                                 │
└─────────────────────────────────────────────────────────────────────────────────────┘

Timeline:
  T+0s    Worker A claims job (leased_until = T+60s)
  T+5s    Worker A crashes (no heartbeat, no completion)
  T+60s   Lease expires (leased_until < NOW())
  T+65s   Worker B claims same job (SKIP LOCKED sees it as available)
  T+70s   Worker B completes job → DONE

Key Points:
  - No manual intervention required
  - Job is NOT lost
  - Maximum delay = lease duration (60s)
  - Worker B sees job.attempt = same (crash didn't increment)
```

### 11.4 Integration Test Requirement

```typescript
// MUST: Integration test for lease timeout
describe('Lease Semantics', () => {
  it('MUST complete manifest write within 60s', async () => {
    const startTime = Date.now();
    
    // Simulate S3 write with realistic latency
    const result = await manifestWriter.tryWriteManifest(bundleId);
    
    const durationMs = Date.now() - startTime;
    
    // MUST NOT exceed lease duration
    expect(durationMs).toBeLessThan(60_000);
    
    // Typical case should be much faster
    expect(durationMs).toBeLessThan(10_000); // 10s warning threshold
  });
  
  it('MUST reclaim job after lease expiry', async () => {
    // 1. Claim job with Worker A
    const claimA = await retryQueue.claimNext('worker-a', 60_000);
    expect(claimA.claimed).toBe(true);
    
    // 2. Simulate crash (don't complete, don't release)
    // 3. Fast-forward time past lease expiry
    jest.advanceTimersByTime(61_000);
    
    // 4. Worker B should be able to claim same job
    const claimB = await retryQueue.claimNext('worker-b', 60_000);
    expect(claimB.claimed).toBe(true);
    expect(claimB.job!.id).toBe(claimA.job!.id);
  });
});
```

### 11.5 Hard Timeout (MUST - Code Enforcement)

**CRITICAL**: Dokümana yazmak yetmez, kodda enforce edilmeli!

```typescript
// MUST: Hard timeout on object store operations
const HARD_TIMEOUT_MS = 30_000;  // 30 seconds (half of 60s lease)

// manifest-retry-worker.config.ts
export const DEFAULT_WORKER_CONFIG = {
  leaseMs: 60_000,           // 60s lease
  writeTimeoutMs: 30_000,    // 30s hard timeout (MUST < leaseMs)
  // ...
};

// tryWriteManifest implementation MUST wrap with timeout
async tryWriteManifest(bundleId: string): Promise<ManifestWriteResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), this.config.writeTimeoutMs);
  
  try {
    const result = await this.objectStore.put(key, data, { 
      signal: controller.signal 
    });
    return { outcome: 'written', manifestKey: key };
  } catch (error) {
    if (error.name === 'AbortError') {
      return { 
        outcome: 'error', 
        errorCode: ManifestErrorCode.TIMEOUT,
        errorMessage: `Write timeout after ${this.config.writeTimeoutMs}ms`
      };
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
```

**Rationale**:
- 60s lease - 30s timeout = 30s safety margin
- Timeout error → RETRYABLE (transient)
- Prevents lease expiry during slow S3 stalls
- AbortController works with both fetch and AWS SDK v3

---

## 12. Polling & Backpressure (MUST)

### 12.1 MUST Rules

| Rule | Description | Value | Enforcement |
|------|-------------|-------|-------------|
| MUST: pollIntervalMs | Idle sleep duration | 5000ms | Config locked |
| MUST: maxConcurrency | Initial worker count | 1 | Config locked |
| MUST: Idle sleep | No job → sleep(pollIntervalMs) | 5s | Code review |
| MUST: Circuit OPEN → stop claiming | Don't claim when circuit open | - | Code review |

### 12.2 Polling Behavior

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              WORKER POLLING STATE MACHINE                            │
└─────────────────────────────────────────────────────────────────────────────────────┘

                              ┌─────────────────┐
                              │   START LOOP    │
                              └────────┬────────┘
                                       │
                                       ▼
                              ┌─────────────────┐
                              │ Circuit Breaker │
                              │    Check        │
                              └────────┬────────┘
                                       │
                    ┌──────────────────┼──────────────────┐
                    │                  │                  │
                    ▼                  │                  ▼
             ┌─────────────┐           │           ┌─────────────┐
             │    OPEN     │           │           │   CLOSED    │
             │  (paused)   │           │           │  (normal)   │
             └──────┬──────┘           │           └──────┬──────┘
                    │                  │                  │
                    │ MUST: Don't      │                  │
                    │ claim, just      │                  ▼
                    │ sleep            │           ┌─────────────┐
                    │                  │           │  claimNext  │
                    │                  │           └──────┬──────┘
                    │                  │                  │
                    │                  │    ┌─────────────┼─────────────┐
                    │                  │    │             │             │
                    │                  │    ▼             │             ▼
                    │                  │ ┌─────────┐      │      ┌─────────────┐
                    │                  │ │ No Job  │      │      │  Job Found  │
                    │                  │ └────┬────┘      │      └──────┬──────┘
                    │                  │      │           │             │
                    │                  │      │ MUST:     │             │
                    │                  │      │ sleep     │             ▼
                    │                  │      │ (5000ms)  │      ┌─────────────┐
                    │                  │      │           │      │  Process    │
                    │                  │      │           │      │    Job      │
                    │                  │      │           │      └──────┬──────┘
                    │                  │      │           │             │
                    └──────────────────┴──────┴───────────┴─────────────┘
                                       │
                                       ▼
                              ┌─────────────────┐
                              │ sleep(5000ms)   │
                              │ THEN LOOP       │
                              └─────────────────┘
```

### 12.3 Backpressure Strategy

```typescript
// LOCKED: Backpressure configuration
const BACKPRESSURE_CONFIG = {
  // Phase 10.1: Single-threaded worker
  maxConcurrency: 1,
  
  // Idle polling interval
  pollIntervalMs: 5_000,  // 5 seconds
  
  // Circuit breaker OPEN behavior
  circuitOpenBehavior: 'STOP_CLAIMING',  // NOT 'CLAIM_AND_RESCHEDULE'
  
  // Future: Phase 10.3 may increase concurrency
  // maxConcurrency: 3,  // After stability proven
};
```

### 12.4 Why "Stop Claiming" When Circuit Open?

```
Option A: Stop Claiming (CHOSEN)
  ✓ No DB load when S3 is down
  ✓ No job churn (claim → reschedule → claim)
  ✓ Clean metrics (no false "processed" counts)
  ✓ Simple implementation

Option B: Claim and Reschedule (REJECTED)
  ✗ Unnecessary DB writes
  ✗ Job attempt counter confusion
  ✗ Metrics pollution
  ✗ More complex state management
```

### 12.5 Busy Loop Prevention

```typescript
// MUST: Prevent busy loop when no jobs
async processOnce(): Promise<WorkerIterationResult> {
  // 1. Circuit breaker check - MUST skip if OPEN
  if (this.circuitBreaker.isOpen()) {
    // DON'T claim, just return
    return { processed: false, skipped: true, reason: 'circuit_open' };
  }
  
  // 2. Claim next job
  const claimResult = await this.retryQueue.claimNext(...);
  
  if (!claimResult.claimed) {
    // MUST: Return immediately, let outer loop sleep
    return { processed: false, reason: 'no_jobs' };
  }
  
  // 3. Process job...
}

// Outer loop - MUST sleep between iterations
async start(): Promise<void> {
  while (this.running) {
    await this.processOnce();
    
    // MUST: Always sleep, even after processing
    // This prevents CPU spin and gives DB breathing room
    await this.sleep(this.config.pollIntervalMs);
  }
}
```

### 12.6 Metrics for Monitoring

```typescript
// MUST emit these metrics for ops visibility
manifest_retry_worker_poll_total          // Total poll attempts
manifest_retry_worker_idle_total          // Polls with no job
manifest_retry_worker_circuit_open_total  // Polls skipped due to circuit
manifest_retry_worker_busy_ratio          // (poll - idle) / poll
```

---

## 13. Worker Definition of Done (DoD)

### 13.1 Unit Tests (MUST) ✅

| Test Case | Description | Status |
|-----------|-------------|--------|
| claimNext empty → sleeps | No job available, worker idles | ✅ |
| ALREADY_EXISTS → DONE_NOOP | Idempotent success | ✅ |
| RETRYABLE → RETRY_SCHEDULED | Transient error schedules retry | ✅ |
| NON_RETRYABLE → DLQ | Permanent error goes to DLQ | ✅ |
| lease expired → job reclaimed | Crashed worker's job is reclaimed | ✅ |
| Circuit OPEN → skip claim | Don't claim when circuit open | ✅ |
| Max attempts → DLQ | Retry exhaustion goes to DLQ | ✅ |

### 13.2 Integration Tests (MUST) - Detailed Scenarios

**Test Infrastructure**: In-memory fake object store (no MinIO container needed)

#### IT-1: Retryable Error → RETRY_SCHEDULED

```typescript
describe('IT-1: Retryable → schedule', () => {
  it('should schedule retry on timeout', async () => {
    // Setup: fake store returns timeout on first attempt
    fakeStore.setNextResponse({ error: 'ETIMEDOUT' });
    
    // Act: process job (attempt=0)
    await worker.processOnce();
    
    // Assert
    const job = await retryQueue.findByBundleId(bundleId);
    expect(job.status).toBe('RETRY_SCHEDULED');
    expect(job.attempt).toBe(1);
    expect(job.nextAttemptAt).toBeGreaterThan(new Date());
    expect(job.lastErrorCode).toBe('TIMEOUT');
    
    // DLQ should be empty
    const dlqEntry = await dlqRepo.findByBundleId(bundleId);
    expect(dlqEntry).toBeNull();
  });
});
```

#### IT-2: Multiple Retryable Errors → Backoff Increases

```typescript
describe('IT-2: Retryable → retryable → schedule again', () => {
  it('should increase backoff on consecutive failures', async () => {
    // Setup: fake store returns 503 then ECONNRESET
    fakeStore.setResponses([
      { error: { status: 503 } },      // attempt 0
      { error: 'ECONNRESET' },          // attempt 1
    ]);
    
    // Act: process twice
    await worker.processOnce();  // attempt 0 → 1
    await advanceTimeToNextAttempt();
    await worker.processOnce();  // attempt 1 → 2
    
    // Assert
    const job = await retryQueue.findByBundleId(bundleId);
    expect(job.status).toBe('RETRY_SCHEDULED');
    expect(job.attempt).toBe(2);
    
    // Backoff should be monotonically increasing
    // attempt 1: ~30s, attempt 2: ~120s (4x multiplier)
    const backoffMs = job.nextAttemptAt.getTime() - Date.now();
    expect(backoffMs).toBeGreaterThan(60_000);  // > 1 min
    expect(backoffMs).toBeLessThan(300_000);    // < 5 min
  });
});
```

#### IT-3: Non-Retryable Error → DLQ + DONE

```typescript
describe('IT-3: Non-retryable → DLQ + DONE', () => {
  it('should move to DLQ on 403 AccessDenied', async () => {
    // Setup: fake store returns 403
    fakeStore.setNextResponse({ 
      error: { status: 403, code: 'AccessDenied' } 
    });
    
    // Act
    await worker.processOnce();
    
    // Assert: Queue row
    const job = await retryQueue.findByBundleId(bundleId);
    expect(job.status).toBe('DONE');
    expect(job.doneReason).toBe('DLQ');
    
    // Assert: DLQ row
    const dlqEntry = await dlqRepo.findByBundleId(bundleId);
    expect(dlqEntry).not.toBeNull();
    expect(dlqEntry.status).toBe('OPEN');
    expect(dlqEntry.errorCode).toBe('ACCESS_DENIED');
    expect(dlqEntry.attempt).toBe(1);  // attempt incremented
  });
});
```

#### IT-4: Already Exists → DONE_NOOP

```typescript
describe('IT-4: Already exists → DONE_NOOP', () => {
  it('should mark DONE_NOOP when manifest exists', async () => {
    // Setup: fake store returns "already exists"
    fakeStore.setNextResponse({ outcome: 'already_exists' });
    
    // Act
    await worker.processOnce();
    
    // Assert: Queue row
    const job = await retryQueue.findByBundleId(bundleId);
    expect(job.status).toBe('DONE');
    expect(job.doneReason).toBe('DONE_NOOP');
    
    // Assert: DLQ should be empty (this is NOT an error)
    const dlqEntry = await dlqRepo.findByBundleId(bundleId);
    expect(dlqEntry).toBeNull();
  });
});
```

#### IT-5: Lease Expiry → Reclaim (Crash Recovery)

```typescript
describe('IT-5: Lease expiry → reclaim', () => {
  it('should allow Worker B to reclaim expired job', async () => {
    // Setup: Worker A claims job
    const workerA = createWorker('worker-a');
    await workerA.claimJob(bundleId);
    
    // Simulate crash: Worker A doesn't complete
    // Fast-forward past lease expiry
    await advanceTime(61_000);  // 61 seconds
    
    // Act: Worker B tries to claim
    const workerB = createWorker('worker-b');
    const result = await workerB.processOnce();
    
    // Assert: Worker B successfully claimed the same job
    expect(result.processed).toBe(true);
    expect(result.bundleId).toBe(bundleId);
    
    // Job should now be owned by Worker B
    const job = await retryQueue.findByBundleId(bundleId);
    expect(job.claimedBy).toBe('worker-b');
    expect(job.status).toBe('IN_PROGRESS');
  });
});
```

### 13.3 Metrics Smoke Tests (MUST)

#### Label Policy (LOCKED)

| Label | Values | Notes |
|-------|--------|-------|
| `reason` | `OK`, `DONE_NOOP`, `DLQ` | Fixed enum, no dynamic values |
| `error_code` | `TIMEOUT`, `ACCESS_DENIED`, `NOT_FOUND`, `UNKNOWN`, etc. | From ManifestErrorCode enum |
| `source` | `post_seal_hook`, `admin_retry` | Job source |

**FORBIDDEN Labels**:
- ❌ `bundleId` - High cardinality, will explode Prometheus
- ❌ `tenantId` - High cardinality
- ❌ `jobId` - High cardinality

#### Smoke Test Implementation

```typescript
describe('Metrics Smoke', () => {
  let metricsCollector: TestMetricsCollector;
  
  beforeEach(() => {
    metricsCollector = new TestMetricsCollector();
    worker = createWorker({ metrics: metricsCollector });
  });
  
  it('should emit manifest_retry_claim_total on claim', async () => {
    await worker.processOnce();
    
    expect(metricsCollector.getCounter('manifest_retry_claim_total'))
      .toBeGreaterThanOrEqual(1);
  });
  
  it('should emit manifest_retry_done_total{reason=OK} on success', async () => {
    fakeStore.setNextResponse({ outcome: 'written' });
    await worker.processOnce();
    
    expect(metricsCollector.getCounter('manifest_retry_done_total', { reason: 'OK' }))
      .toBe(1);
  });
  
  it('should emit manifest_retry_done_total{reason=DONE_NOOP} on already exists', async () => {
    fakeStore.setNextResponse({ outcome: 'already_exists' });
    await worker.processOnce();
    
    expect(metricsCollector.getCounter('manifest_retry_done_total', { reason: 'DONE_NOOP' }))
      .toBe(1);
  });
  
  it('should emit manifest_retry_scheduled_total on retry', async () => {
    fakeStore.setNextResponse({ error: 'ETIMEDOUT' });
    await worker.processOnce();
    
    expect(metricsCollector.getCounter('manifest_retry_scheduled_total'))
      .toBe(1);
  });
  
  it('should emit manifest_retry_dlq_total{error_code} on DLQ', async () => {
    fakeStore.setNextResponse({ error: { status: 403, code: 'AccessDenied' } });
    await worker.processOnce();
    
    expect(metricsCollector.getCounter('manifest_retry_dlq_total', { error_code: 'ACCESS_DENIED' }))
      .toBe(1);
  });
  
  it('should emit manifest_retry_duration_ms histogram', async () => {
    fakeStore.setNextResponse({ outcome: 'written' });
    await worker.processOnce();
    
    const histogram = metricsCollector.getHistogram('manifest_retry_duration_ms');
    expect(histogram.count).toBe(1);
    expect(histogram.sum).toBeGreaterThan(0);
  });
});
```

---

## 14. Metrics Label Policy (LOCKED)

### 14.1 Counter Metrics

| Metric | Labels | Description |
|--------|--------|-------------|
| `manifest_retry_claim_total` | `source` | Jobs claimed by worker |
| `manifest_retry_done_total` | `reason` | Jobs completed |
| `manifest_retry_scheduled_total` | `error_code`, `attempt` | Retries scheduled |
| `manifest_retry_dlq_total` | `error_code` | Jobs sent to DLQ |
| `manifest_retry_errors_total` | `error_code` | Unexpected errors |

### 14.2 Histogram Metrics

| Metric | Labels | Buckets | Description |
|--------|--------|---------|-------------|
| `manifest_retry_duration_ms` | `outcome` | 10, 50, 100, 500, 1000, 5000, 10000, 30000 | Job processing duration |

### 14.3 Gauge Metrics

| Metric | Labels | Description |
|--------|--------|-------------|
| `manifest_retry_queue_size` | `status` | Current queue size by status |
| `manifest_retry_dlq_size` | `status` | Current DLQ size by status |
| `manifest_retry_circuit_breaker_state` | - | 0=closed, 1=open, 2=half_open |

### 14.4 Label Value Enums

```typescript
// reason label values (LOCKED)
type DoneReason = 'OK' | 'DONE_NOOP' | 'DLQ';

// error_code label values (from ManifestErrorCode enum)
type ErrorCodeLabel = 
  | 'TIMEOUT'
  | 'ACCESS_DENIED'
  | 'NOT_FOUND'
  | 'BUCKET_NOT_FOUND'
  | 'SERVICE_UNAVAILABLE'
  | 'INTERNAL_ERROR'
  | 'UNKNOWN';

// source label values
type SourceLabel = 'post_seal_hook' | 'admin_retry';

// status label values
type StatusLabel = 'pending' | 'in_progress' | 'retry_scheduled' | 'done';

// outcome label values (for histogram)
type OutcomeLabel = 'success' | 'retry' | 'dlq' | 'error';
```
