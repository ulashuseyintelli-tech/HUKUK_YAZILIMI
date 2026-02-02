# Phase 10: Design Document

**Architecture Reference**: See [PHASE-10-ARCHITECTURE.md](./PHASE-10-ARCHITECTURE.md) for final locked diagrams.

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│                           PHASE 10: RETRY + SIGNATURE                                 │
└──────────────────────────────────────────────────────────────────────────────────────┘

                              ┌─────────────────────┐
                              │   ManifestWriter    │
                              │  (Phase 9C - locked)│
                              └──────────┬──────────┘
                                         │
                    ┌────────────────────┼────────────────────┐
                    │                    │                    │
                    ▼                    ▼                    ▼
              ┌──────────┐        ┌──────────┐        ┌──────────┐
              │ Success  │        │ Transient│        │ Permanent│
              │          │        │  Error   │        │  Error   │
              └────┬─────┘        └────┬─────┘        └────┬─────┘
                   │                   │                   │
                   ▼                   ▼                   ▼
              ┌──────────┐        ┌──────────┐        ┌──────────┐
              │  Done    │        │  Retry   │        │   DLQ    │
              │          │        │  Queue   │        │          │
              └──────────┘        └────┬─────┘        └──────────┘
                                       │
                                       ▼
                              ┌─────────────────────┐
                              │   Retry Worker      │
                              │  (out-of-band)      │
                              └──────────┬──────────┘
                                         │
                    ┌────────────────────┼────────────────────┐
                    │                    │                    │
                    ▼                    ▼                    ▼
              ┌──────────┐        ┌──────────┐        ┌──────────┐
              │ Success  │        │ Max      │        │ Still    │
              │          │        │ Retries  │        │ Failing  │
              └──────────┘        └────┬─────┘        └────┬─────┘
                                       │                   │
                                       ▼                   ▼
                                  ┌──────────┐        ┌──────────┐
                                  │   DLQ    │        │  Retry   │
                                  │          │        │  Later   │
                                  └──────────┘        └──────────┘
```

## Critical Anti-Regression Rules (MUST)

These rules MUST be enforced in Phase 10 implementation:

### Rule 1: Admin Retry Endpoint MUST Enqueue, MUST NOT Direct Write

```typescript
// ❌ FORBIDDEN - Direct write in admin endpoint
async retryManifest(bundleId: string) {
  await this.manifestWriter.writeManifestForBundle(bundleId); // WRONG!
}

// ✅ CORRECT - Enqueue only
async retryManifest(bundleId: string) {
  await this.retryQueue.enqueue(bundleId, { source: 'admin', priority: 'high' });
  return { enqueued: true, jobId: '...', nextAttemptAt: '...' };
}
```

**Rationale**: Direct write bypasses backpressure, can kill API during S3 outage.

### Rule 2: Retry Worker MUST Remain Non-Blocking

- Retry worker MUST NOT connect back to seal path
- Post-seal hook only enqueues job (or fire-and-forget + enqueue on fail)
- NEVER create dependency that blocks seal success

### Rule 3: Retry Idempotency Model

- Job de-dup: Same bundleId concurrent jobs → single job
- "Already exists" = success (no-op success)
- Admin spam protection: "already queued" response within 1 minute

---

## Component Design

### 1. Error Classifier (LOCKED CONTRACT)

```typescript
// manifest-error-classifier.ts

/**
 * Classifier Decision - Single output model
 * DONE_NOOP: Object already exists (write-once idempotent success)
 * RETRY: Transient error, schedule retry with backoff
 * DLQ: Permanent error, move to dead-letter queue
 */
export type ClassifierDecision = 'DONE_NOOP' | 'RETRY' | 'DLQ';

/**
 * Error codes for metrics (low cardinality, stable)
 */
export enum ManifestErrorCode {
  S3_TIMEOUT = 'S3_TIMEOUT',
  S3_THROTTLED = 'S3_THROTTLED',
  S3_5XX = 'S3_5XX',
  S3_CONNECTION_RESET = 'S3_CONNECTION_RESET',
  S3_DNS = 'S3_DNS',
  S3_ACCESS_DENIED = 'S3_ACCESS_DENIED',
  S3_NO_SUCH_BUCKET = 'S3_NO_SUCH_BUCKET',
  S3_INVALID_OBJECT = 'S3_INVALID_OBJECT',
  SERIALIZATION_ERROR = 'SERIALIZATION_ERROR',
  WRITE_ONCE_ALREADY_EXISTS = 'WRITE_ONCE_ALREADY_EXISTS',
  UNKNOWN = 'UNKNOWN',
}

export interface ClassifiedError {
  decision: ClassifierDecision;
  errorCode: ManifestErrorCode;
  retryAfterMs?: number;  // For throttle errors
  reason: string;
}

export function classifyError(error: unknown, attemptCount: number): ClassifiedError {
  // See classification table below
}
```

#### Error Classification Table (SOURCE OF TRUTH - MUST follow)

##### DONE_NOOP (Idempotent Success)

| Error Type | Detection | Decision | ErrorCode | Notes |
|------------|-----------|----------|-----------|-------|
| Object already exists | PreconditionFailed, "key exists" | DONE_NOOP | WRITE_ONCE_ALREADY_EXISTS | Expected idempotent case |

**CRITICAL**: `WRITE_ONCE_ALREADY_EXISTS` is NOT an error - it's expected behavior for idempotent retry.

##### RETRY (Transient - Recoverable)

| Error Type | Detection | Decision | ErrorCode | Notes |
|------------|-----------|----------|-----------|-------|
| Timeout | ETIMEDOUT, ESOCKETTIMEDOUT | RETRY | S3_TIMEOUT | Network timeout |
| Connection Reset | ECONNRESET, socket hang up | RETRY | S3_CONNECTION_RESET | Network issue |
| DNS Failure | ENOTFOUND (temporary) | RETRY | S3_DNS | DNS resolution |
| Throttling | 429, SlowDown | RETRY | S3_THROTTLED | Use Retry-After header |
| Server Error | 500, 502, 503, 504 | RETRY | S3_5XX | S3 internal error |

##### DLQ (Permanent - Non-Recoverable)

| Error Type | Detection | Decision | ErrorCode | Notes |
|------------|-----------|----------|-----------|-------|
| Access Denied | 403, AccessDenied | DLQ | S3_ACCESS_DENIED | IAM/policy issue |
| Invalid Credentials | InvalidAccessKeyId, SignatureDoesNotMatch | DLQ | S3_ACCESS_DENIED | Config error |
| Bucket Not Found | NoSuchBucket | DLQ | S3_NO_SUCH_BUCKET | Config error |
| Invalid Object | InvalidObjectKey, validation error | DLQ | S3_INVALID_OBJECT | Code bug |
| Serialization | JSON.stringify failure | DLQ | SERIALIZATION_ERROR | Code bug |

##### UNKNOWN (Guardrail)

| Condition | Decision | ErrorCode | Notes |
|-----------|----------|-----------|-------|
| Unknown error, attempt=0 | RETRY | UNKNOWN | Give one chance |
| Unknown error, attempt>=1 | DLQ | UNKNOWN | Prevent infinite retry |

**CRITICAL**: Unknown guardrail prevents "infinite retry" system degradation.

### 2. Retry Queue (PostgreSQL-based)

#### Per-Bundle De-Duplication (CRITICAL)

**Rule**: Only ONE active job per bundleId at any time.

```sql
-- Unique partial index prevents duplicate active jobs
CREATE UNIQUE INDEX idx_retry_queue_bundle_active 
ON manifest_retry_queue (bundle_id) 
WHERE status IN ('PENDING', 'RETRY_SCHEDULED', 'PROCESSING');
```

**Behavior**:
- Admin endpoint spam → "ALREADY_QUEUED" response (not new job)
- Race condition → DB constraint prevents duplicate
- Queue bloat prevention → guaranteed single job per bundle

```sql
-- Migration: manifest_retry_queue
CREATE TABLE manifest_retry_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_id UUID NOT NULL REFERENCES evidence_bundles(id),
  status TEXT NOT NULL DEFAULT 'PENDING',  -- PENDING, RETRY_SCHEDULED, PROCESSING, DONE, DLQ
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 7,
  next_retry_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error_code TEXT,
  last_error_message TEXT,
  source TEXT NOT NULL DEFAULT 'post_seal_hook',  -- post_seal_hook, admin_retry
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Per-bundle de-dup: only one active job per bundle
CREATE UNIQUE INDEX idx_retry_queue_bundle_active 
ON manifest_retry_queue (bundle_id) 
WHERE status IN ('PENDING', 'RETRY_SCHEDULED', 'PROCESSING');

-- Worker claim index
CREATE INDEX idx_retry_queue_next ON manifest_retry_queue (next_retry_at)
  WHERE status IN ('PENDING', 'RETRY_SCHEDULED');
```

#### Status State Machine

```
PENDING ──────────────────► PROCESSING ──────────────────► DONE
    │                            │                           ▲
    │                            │ (success)                 │
    │                            ▼                           │
    │                       RETRY_SCHEDULED ─────────────────┘
    │                            │
    │                            │ (max retries OR permanent error)
    │                            ▼
    └────────────────────────► DLQ
```

### 3. Dead Letter Queue

```sql
-- Migration: manifest_dlq
CREATE TABLE manifest_dead_letter_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_id UUID NOT NULL REFERENCES evidence_bundles(id),
  error_code TEXT NOT NULL,
  error_message TEXT,
  attempt_count INTEGER NOT NULL,
  classification TEXT NOT NULL, -- 'max_retries' | 'permanent_error'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  resolution_notes TEXT,
  
  CONSTRAINT unique_bundle_dlq UNIQUE (bundle_id)
);
```

### 4. Retry Worker

```typescript
// manifest-retry-worker.service.ts

export class ManifestRetryWorker {
  private readonly BATCH_SIZE = 10;
  private readonly POLL_INTERVAL_MS = 5000;
  private readonly MAX_CONCURRENT_WORKERS = 3;
  
  async processRetryBatch(): Promise<RetryBatchResult> {
    // 0. Check circuit breaker - if open, skip processing
    if (this.circuitBreaker.isOpen()) {
      return { skipped: true, reason: 'circuit_breaker_open' };
    }
    
    // 1. SELECT ... FOR UPDATE SKIP LOCKED
    // 2. Attempt manifest write
    // 3. On DONE_NOOP (already exists): mark DONE (idempotent success)
    // 4. On success: mark DONE
    // 5. On RETRY: UPDATE next_retry_at with backoff
    // 6. On DLQ: Move to DLQ table
  }
  
  calculateNextRetry(attemptCount: number): Date {
    // Exponential backoff with full jitter
    // Formula: min(base * 4^attempt, max) * random(0.5, 1.5)
  }
}
```

#### Backoff Policy (LOCKED - Numerical Values)

| Attempt | Base Delay | Formula | With Jitter (range) | Cumulative Max |
|---------|------------|---------|---------------------|----------------|
| 0 | 30s | 30s * 4^0 = 30s | 15s - 45s | 45s |
| 1 | 2m | 30s * 4^1 = 2m | 1m - 3m | 3m45s |
| 2 | 8m | 30s * 4^2 = 8m | 4m - 12m | 15m45s |
| 3 | 32m | 30s * 4^3 = 32m | 16m - 48m | 1h3m45s |
| 4 | 2h | 30s * 4^4 = 2h (capped) | 1h - 2h | 3h3m45s |
| 5 | 2h | capped at max | 1h - 2h | 5h3m45s |
| 6 | 2h | capped at max | 1h - 2h | 7h3m45s |
| 7 (max) | → DLQ | - | - | - |

**Configuration**:
```typescript
const BACKOFF_CONFIG = {
  baseMs: 30_000,        // 30 seconds
  multiplier: 4,         // 4x per attempt
  maxDelayMs: 7_200_000, // 2 hours cap
  maxAttempts: 7,        // 7 attempts then DLQ
  jitterStrategy: 'full' // random(0.5, 1.5)
};
```

**Formula**:
```typescript
function calculateBackoff(attempt: number): number {
  const baseDelay = Math.min(
    BACKOFF_CONFIG.baseMs * Math.pow(BACKOFF_CONFIG.multiplier, attempt),
    BACKOFF_CONFIG.maxDelayMs
  );
  // Full jitter: multiply by random factor between 0.5 and 1.5
  const jitter = 0.5 + Math.random();
  return Math.floor(baseDelay * jitter);
}
```

#### Concurrency Control

```typescript
interface RetryWorkerConfig {
  maxConcurrentWorkers: 3;           // Max parallel workers
  batchSize: 10;                      // Jobs per batch
  pollIntervalMs: 5000;               // Poll frequency
  circuitBreakerThreshold: 5;         // Consecutive failures to open
  circuitBreakerResetMs: 60000;       // Time before half-open
  perTenantMaxConcurrent: 2;          // Optional: per-tenant throttle
}
```

#### Circuit Breaker

```
CLOSED ──(5 consecutive failures)──► OPEN
   ▲                                    │
   │                                    │ (60s timeout)
   │                                    ▼
   └────(success)──── HALF-OPEN ◄──────┘
                         │
                    (1 test request)
```

When circuit is OPEN:
- Worker skips processing
- Metric emitted: `manifest_retry_circuit_breaker{state="open"}`
- Alert fires after 5 minutes

### 5. Signature Service

```typescript
// bundle-signature.service.ts

export interface SignatureConfig {
  algorithm: 'RS256' | 'ES256';
  keyId: string;
  privateKey: string; // PEM format
}

export interface BundleSignature {
  algorithm: 'RS256' | 'ES256';
  keyId: string;
  signedData: 'sealedHash';  // NOT manifestHash - more stable
  value: string; // base64
  signedAt: string; // ISO 8601
}

export class BundleSignatureService {
  sign(sealedHash: string): Promise<BundleSignature>;
  verify(sealedHash: string, signature: BundleSignature): Promise<VerificationResult>;
}
```

**Design Decision: Sign sealedHash, not manifestHash**

Rationale:
- `sealedHash` = content integrity (objects) - stable
- `manifestHash` = presentation layer (export format) - may change
- Manifest format can evolve (v1.1, v2.0) without breaking signatures
- Signature on `sealedHash` survives manifest schema migrations

#### sealedHash Canonical Definition (Reference: Phase 9C)

```typescript
// From bundle-seal.hasher.ts (Phase 9C - LOCKED)
// DO NOT DUPLICATE - reference only

sealedHash = SHA-256(
  objects
    .sort((a, b) => a.objectKey.localeCompare(b.objectKey))
    .map(obj => `${obj.objectKey}:${obj.etag}:${obj.sizeBytes}`)
    .join('\n')
)
```

**Single Source of Truth**: `bundle-seal.hasher.ts` (Phase 9C)

#### Signature Storage Decision

**Option A (RECOMMENDED)**: Store signature in seal record (DB)
```sql
ALTER TABLE evidence_bundle_seal_events
ADD COLUMN signature_alg TEXT,
ADD COLUMN signature_key_id TEXT,
ADD COLUMN signature_value TEXT,
ADD COLUMN signature_signed_at TIMESTAMPTZ;
```

**Option B**: Store signature in manifest only
- Manifest includes full signature object
- Verification requires manifest fetch

**Decision**: Use Option A (seal record) as primary, manifest includes `signatureRef`:
```typescript
// In manifest
{
  signatureRef: {
    location: 'seal_record',
    keyId: 'RS256-20260202-001'
  }
}
```

**Rationale**:
- Seal = source of truth (immutable)
- Manifest = export artifact (format may change)
- Signature in seal record survives manifest schema migrations

### 6. Key Management

```typescript
// signing-key.service.ts

export interface SigningKey {
  keyId: string;
  algorithm: 'RS256' | 'ES256';
  publicKey: string;  // PEM
  privateKey?: string; // PEM (only for active signing key)
  status: 'active' | 'verify-only' | 'revoked';
  createdAt: Date;
  revokedAt?: Date;
}

export class SigningKeyService {
  getActiveSigningKey(): SigningKey;
  getKeyById(keyId: string): SigningKey | null;
  rotateKey(newKey: SigningKey): void;
  revokeKey(keyId: string): void;
}
```

## Integration Points

### ManifestWriter Integration (Phase 9C)

```typescript
// Updated flow in bundle-manifest.writer.ts

async writeManifestForBundle(bundleId: string): Promise<ManifestWriteOperationResult> {
  try {
    const manifest = await this.builder.buildManifest(bundleId, config);
    
    // NEW: Sign the sealedHash
    const signature = await this.signatureService.sign(manifest.sealedHash);
    manifest.signature = signature;
    
    const writeResult = await this.storage.writeManifest(bundleId, manifest);
    
    if (writeResult.success) {
      return { success: true, bundleId, manifestKey: writeResult.key };
    }
    
    // NEW: Classify error and enqueue if transient
    const classified = classifyError(writeResult.error);
    if (classified.retryable) {
      await this.retryQueue.enqueue(bundleId, classified);
    } else {
      await this.dlq.enqueue(bundleId, classified);
    }
    
    return { success: false, bundleId, error: writeResult.error };
  } catch (error) {
    // ... existing error handling
  }
}
```

## API Endpoints

### Admin Retry API

```
POST /admin/bundles/{bundleId}/manifest/retry
Authorization: Bearer <admin-token>

Response 200 (enqueued):
{
  "enqueued": true,
  "bundleId": "...",
  "jobId": "...",
  "nextAttemptAt": "2026-02-02T12:05:00Z",
  "queuePosition": 3
}

Response 200 (already queued - within 1 minute):
{
  "enqueued": false,
  "bundleId": "...",
  "reason": "ALREADY_QUEUED",
  "existingJobId": "...",
  "nextAttemptAt": "2026-02-02T12:05:00Z"
}

Response 200 (manifest exists):
{
  "enqueued": false,
  "bundleId": "...",
  "reason": "MANIFEST_EXISTS",
  "manifestKey": "bundles/.../manifest.json"
}

Response 404:
{
  "error": "BUNDLE_NOT_FOUND"
}

Response 429:
{
  "error": "RATE_LIMIT_EXCEEDED",
  "retryAfter": 60
}
```

**CRITICAL**: Admin endpoint MUST enqueue job, MUST NOT do direct write.

### Verification API

```
GET /bundles/{bundleId}/verify
Authorization: Bearer <token>

Response 200:
{
  "valid": true,
  "bundleId": "...",
  "sealedHash": "...",
  "signature": {
    "algorithm": "RS256",
    "keyId": "RS256-20260202-001",
    "signedAt": "2026-02-02T12:00:00Z"
  },
  "verifiedAt": "2026-02-02T12:05:00Z"
}

Response 200 (invalid):
{
  "valid": false,
  "bundleId": "...",
  "reason": "SIGNATURE_MISMATCH" | "KEY_REVOKED" | "HASH_MISMATCH"
}
```

### DLQ Query API

```
GET /admin/manifest/dlq?limit=50&offset=0
Authorization: Bearer <admin-token>

Response 200:
{
  "items": [
    {
      "id": "...",
      "bundleId": "...",
      "errorCode": "STORAGE_ERROR",
      "errorMessage": "S3 timeout after 30s",
      "attemptCount": 7,
      "classification": "max_retries",
      "createdAt": "2026-02-02T10:00:00Z",
      "resolvedAt": null
    }
  ],
  "total": 123,
  "oldestAge": "2h30m"
}
```

### DLQ Re-drive API

```
POST /admin/manifest/dlq/{dlqId}/redrive
Authorization: Bearer <admin-token>

Response 200:
{
  "redriven": true,
  "dlqId": "...",
  "bundleId": "...",
  "newJobId": "...",
  "nextAttemptAt": "2026-02-02T12:05:00Z"
}

Response 400:
{
  "error": "ALREADY_RESOLVED"
}
```

### DLQ Resolve API (Manual Resolution)

```
POST /admin/manifest/dlq/{dlqId}/resolve
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "resolution": "manual_fix" | "wont_fix" | "duplicate",
  "notes": "Manually uploaded manifest via S3 console"
}

Response 200:
{
  "resolved": true,
  "dlqId": "...",
  "resolvedBy": "admin@example.com",
  "resolvedAt": "2026-02-02T12:00:00Z"
}
```

### DLQ Dashboard Metrics

```
# DLQ size
manifest_dlq_size

# DLQ oldest entry age (seconds)
manifest_dlq_oldest_age_seconds

# DLQ entries by classification
manifest_dlq_entries{classification="max_retries|permanent_error"}

# Alert: DLQ size > 100 or oldest > 24h
```

## Metrics

```
# Retry metrics
manifest_retry_enqueued_total{error_code="..."}
manifest_retry_success_total
manifest_retry_exhausted_total
manifest_retry_queue_size

# DLQ metrics
manifest_dlq_size
manifest_dlq_resolved_total

# Signature metrics
bundle_signature_generated_total{algorithm="RS256|ES256"}
bundle_signature_verified_total{result="valid|invalid"}
bundle_signature_duration_seconds
```

## File Structure

```
object-store/
├── bundle-manifest/
│   ├── ... (existing Phase 9C files)
│   └── index.ts
├── bundle-seal/
│   └── ... (existing Phase 9C files)
├── manifest-retry/
│   ├── manifest-error-classifier.ts
│   ├── manifest-retry-queue.repository.ts
│   ├── manifest-retry-worker.service.ts
│   ├── manifest-dlq.repository.ts
│   ├── manifest-retry.types.ts
│   ├── index.ts
│   └── __tests__/
│       ├── manifest-error-classifier.spec.ts
│       ├── manifest-retry-worker.spec.ts
│       └── manifest-retry.integration.spec.ts
└── bundle-signature/
    ├── bundle-signature.service.ts
    ├── bundle-signature.types.ts
    ├── signing-key.service.ts
    ├── signing-key.types.ts
    ├── index.ts
    └── __tests__/
        ├── bundle-signature.spec.ts
        ├── signing-key.spec.ts
        └── bundle-signature.integration.spec.ts
```

## Migration Plan

### Phase 10.1: Retry Pipeline
1. Add retry queue table
2. Add DLQ table
3. Implement error classifier
4. Implement retry worker
5. Integrate with ManifestWriter
6. Add admin retry API

### Phase 10.2: Digital Signature
1. Implement signature service
2. Implement key management
3. Integrate with ManifestWriter
4. Add verification API
5. Add CLI verification tool

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Retry storm on S3 outage | High | Exponential backoff + circuit breaker |
| Key compromise | Critical | Key rotation + revocation support |
| DLQ overflow | Medium | Alert + auto-archive old entries |
| Signature performance | Low | Async signing, batch verification |

## Phase 9C Lock Compliance

This design explicitly respects Phase 9C locks:

| Phase 9C Invariant | Phase 10 Compliance |
|-------------------|---------------------|
| Seal correctness > Export availability | ✅ Retry is out-of-band, never blocks seal |
| Manifest write non-blocking | ✅ Retry queue is fire-and-forget enqueue |
| Write-once semantics | ✅ Retry checks existence before write |
| Post-seal hook outside transaction | ✅ No changes to hook architecture |
