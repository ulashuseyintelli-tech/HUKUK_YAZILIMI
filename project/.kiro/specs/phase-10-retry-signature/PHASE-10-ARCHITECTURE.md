# Phase 10: Final Architecture

**Status**: LOCKED  
**Locked At**: 2026-02-02  
**Lock Owner**: Phase 10 Retry Pipeline + Digital Signature

---

## 1. System Overview

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                                PHASE 10                                      │
│                 Retry Pipeline + SealedHash Digital Signature                │
└──────────────────────────────────────────────────────────────────────────────┘

          ┌───────────────────────┐
          │ BundleSealService      │
          │ (Phase 9C locked)      │
          └───────────┬───────────┘
                      │ 1) DB TX: seal bundle + persist sealedHash
                      ▼
          ┌───────────────────────┐
          │  DB (transaction)     │
          │  bundles/seals table  │
          └───────────┬───────────┘
                      │ commit success
                      ▼
          ┌────────────────────────────────────────┐
          │ Post-seal Hook (non-blocking, locked)   │
          │ - enqueue manifest retry job            │
          │ - DO NOT write manifest synchronously   │
          └───────────┬────────────────────────────┘
                      │
                      │ 2) enqueue (fire-and-forget)
                      ▼
          ┌───────────────────────────────┐
          │ manifest_retry_queue (DB)      │
          │ - bundleId, attempt            │
          │ - nextAttemptAt, status        │
          │ - lastErrorCode                │
          └───────────┬───────────────────┘
                      │ 3) poll/claim (FOR UPDATE SKIP LOCKED)
                      ▼
          ┌───────────────────────────────┐
          │ ManifestRetryWorker            │
          │ - error classifier             │
          │ - backoff + jitter             │
          │ - circuit breaker              │
          │ - DLQ on permanent failure     │
          └───────────┬───────────────────┘
                      │ 4) write-once PUT + metadata
                      ▼
          ┌────────────────────────────────────────┐
          │ Object Store (S3/MinIO via IObjectStore)│
          │ - bundles/{id}/manifest.json (immutable)│
          └────────────────────────────────────────┘


Digital Signature Lane (independent, non-blocking):

          ┌───────────────────────────────┐
          │ SealSignatureService           │
          │ - sign(sealedHash)             │
          │ - persist signature + keyId    │
          └───────────┬───────────────────┘
                      ▼
          ┌───────────────────────────────┐
          │ DB: seal_signatures table      │
          │ - bundleId, sealedHash, sig    │
          │ - alg, keyId, signedAt         │
          └───────────────────────────────┘


Admin Lane:

          ┌───────────────────────────────┐
          │ Admin API                       │
          │ POST /admin/bundles/{id}/manifest/retry
          │ - ENQUEUE ONLY (never direct write)
          │ - rate limit: 10 req/min       │
          │ - break-glass role required    │
          └───────────────────────────────┘
```

---

## 2. Sequence Diagram (Happy Path)

```
Client        API(BundleSealService)         DB           Post-seal Hook     Queue Table     Worker      ObjectStore
  |                    |                     |                 |                |             |            |
  | sealBundle()       |                     |                 |                |             |            |
  |------------------->|  BEGIN TX           |                 |                |             |            |
  |                    |  compute sealedHash |                 |                |             |            |
  |                    |  persist seal       |---------------->|                |             |            |
  |                    |  COMMIT             |                 |                |             |            |
  |                    |-------------------->|                 |                |             |            |
  |                    |  return success     |                 |                |             |            |
  |<-------------------|                     |                 |                |             |            |
  |                    |  async: enqueue job |                 |                |             |            |
  |                    |-------------------->| (enqueue row)   |---------------->|             |            |
  |                    |                     |                 |                |             |            |
  |                    |                     |                 |                | claim job   |            |
  |                    |                     |                 |                |------------>|            |
  |                    |                     |                 |                |             | PUT (WORM) |
  |                    |                     |                 |                |             |----------->|
  |                    |                     |                 |                |             | success    |
  |                    |                     |                 |                |             |<-----------|
  |                    |                     |                 |                | mark done   |            |
  |                    |                     |                 |                |<------------|            |
```

---

## 3. Failure & Retry Flow

```
Worker claims job
  |
  +--> write-once PUT to ObjectStore
         |
         +--> SUCCESS
         |      -> mark DONE, delete from queue
         |
         +--> ALREADY_EXISTS (write-once violation)
         |      -> mark DONE (no-op success, idempotent)
         |
         +--> RETRYABLE error (timeout/5xx/throttle)
         |      -> attempt++
         |      -> nextAttemptAt = now + backoff(attempt) + jitter
         |      -> status = RETRY_SCHEDULED
         |      -> if attempt >= maxAttempts: move to DLQ
         |
         +--> NON-RETRYABLE error (403/policy/validation/serialization)
                -> status = DLQ
                -> persist lastErrorCode
                -> emit critical metric
```

---

## 4. Lock Invariants (MUST NOT VIOLATE)

| Invariant | Description |
|-----------|-------------|
| Seal TX path dokunulmaz | Phase 9C seal transaction semantics unchanged |
| Post-seal hook asla bloklamaz | Hook is fire-and-forget, enqueue only |
| Manifest yazımı worker'da | Never in API request path |
| Write-once korunur | Manifest overwrite forbidden |
| Signature sealedHash üzerinde | Not manifestHash |
| Signature DB'de | seal_signatures table, not manifest |
| Admin endpoint enqueue-only | Never direct write |

---

## 5. Digital Signature Design

### 5.1 What is Signed

```
Signature = sign(sealedHash, privateKey)

sealedHash = SHA-256(
  objects
    .sort((a, b) => a.objectKey.localeCompare(b.objectKey))
    .map(obj => `${obj.objectKey}:${obj.etag}:${obj.sizeBytes}`)
    .join('\n')
)
```

**Single Source of Truth**: `bundle-seal.hasher.ts` (Phase 9C - LOCKED)

### 5.2 Why sealedHash (not manifestHash)

| Aspect | sealedHash | manifestHash |
|--------|------------|--------------|
| Stability | ✅ Stable (content-based) | ❌ Changes with manifest format |
| Migration | ✅ Survives schema changes | ❌ Breaks on v1.1, v2.0 |
| Semantics | Content integrity | Presentation integrity |
| Recommendation | ✅ Sign this | ❌ Don't sign |

### 5.3 Signature Storage

**Primary**: Database (seal_signatures table)

```sql
CREATE TABLE seal_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_id UUID NOT NULL REFERENCES evidence_bundles(id),
  sealed_hash TEXT NOT NULL,
  signature TEXT NOT NULL,           -- base64 encoded
  algorithm TEXT NOT NULL,           -- 'RS256' | 'ES256'
  key_id TEXT NOT NULL,              -- 'RS256-20260202-001'
  signed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT unique_bundle_signature UNIQUE (bundle_id)
);
```

**Secondary**: Manifest includes signatureRef only

```typescript
// In manifest.json
{
  "signatureRef": {
    "location": "seal_record",
    "keyId": "RS256-20260202-001",
    "signedAt": "2026-02-02T12:00:00Z"
  }
}
```

### 5.4 Key Management

```typescript
interface SigningKey {
  keyId: string;           // 'RS256-20260202-001'
  algorithm: 'RS256' | 'ES256';
  publicKey: string;       // PEM
  privateKey?: string;     // PEM (only for active key)
  status: 'active' | 'verify-only' | 'revoked';
  createdAt: Date;
  revokedAt?: Date;
}
```

**Key ID Format**: `{algorithm}-{YYYYMMDD}-{sequence}`

**Key Lifecycle**:
- `active`: Can sign and verify
- `verify-only`: Can only verify (after rotation)
- `revoked`: Cannot sign or verify

### 5.5 Verification Contract

```typescript
interface VerificationResult {
  valid: boolean;
  bundleId: string;
  sealedHash: string;
  signature: {
    algorithm: string;
    keyId: string;
    signedAt: string;
  };
  verifiedAt: string;
  reason?: 'SIGNATURE_MISMATCH' | 'KEY_REVOKED' | 'HASH_MISMATCH' | 'KEY_NOT_FOUND';
}
```

**Verification Steps**:
1. Fetch signature from seal_signatures table
2. Fetch public key by keyId
3. Check key status (not revoked)
4. Verify signature against sealedHash
5. Return result

---

## 6. Database Schema (Phase 10)

### 6.1 Retry Queue

```sql
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
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT unique_bundle_retry UNIQUE (bundle_id)
);

CREATE INDEX idx_retry_queue_next ON manifest_retry_queue (next_retry_at)
  WHERE status IN ('PENDING', 'RETRY_SCHEDULED');
```

### 6.2 Dead Letter Queue

```sql
CREATE TABLE manifest_dead_letter_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_id UUID NOT NULL REFERENCES evidence_bundles(id),
  error_code TEXT NOT NULL,
  error_message TEXT,
  attempt_count INTEGER NOT NULL,
  classification TEXT NOT NULL,  -- 'max_retries' | 'permanent_error'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  resolution TEXT,               -- 'manual_fix' | 'wont_fix' | 'duplicate' | 'redriven'
  resolution_notes TEXT,
  
  CONSTRAINT unique_bundle_dlq UNIQUE (bundle_id)
);

CREATE INDEX idx_dlq_unresolved ON manifest_dead_letter_queue (created_at)
  WHERE resolved_at IS NULL;
```

### 6.3 Seal Signatures

```sql
CREATE TABLE seal_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_id UUID NOT NULL REFERENCES evidence_bundles(id),
  sealed_hash TEXT NOT NULL,
  signature TEXT NOT NULL,
  algorithm TEXT NOT NULL,
  key_id TEXT NOT NULL,
  signed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT unique_bundle_signature UNIQUE (bundle_id)
);
```

---

## 7. Worker Claim SQL

```sql
-- Claim next batch for processing (SKIP LOCKED prevents contention)
WITH claimed AS (
  SELECT id
  FROM manifest_retry_queue
  WHERE status IN ('PENDING', 'RETRY_SCHEDULED')
    AND next_retry_at <= NOW()
    AND attempt_count < max_attempts
  ORDER BY next_retry_at ASC
  LIMIT 10
  FOR UPDATE SKIP LOCKED
)
UPDATE manifest_retry_queue
SET status = 'PROCESSING',
    updated_at = NOW()
WHERE id IN (SELECT id FROM claimed)
RETURNING *;
```

---

## 8. Metrics

```
# Retry Pipeline
manifest_retry_enqueued_total{source="post_seal_hook|admin_retry"}
manifest_retry_success_total
manifest_retry_failure_total{error_code="..."}
manifest_retry_exhausted_total
manifest_retry_queue_size
manifest_retry_queue_oldest_seconds

# DLQ
manifest_dlq_size
manifest_dlq_oldest_age_seconds
manifest_dlq_resolved_total{resolution="..."}

# Circuit Breaker
manifest_retry_circuit_breaker{state="closed|open|half_open"}

# Signature
bundle_signature_generated_total{algorithm="RS256|ES256"}
bundle_signature_verified_total{result="valid|invalid"}
bundle_signature_duration_seconds
```

---

## 9. Phase 9C Compliance Checklist

Before any Phase 10 implementation, verify:

- [ ] Does NOT change seal transaction semantics
- [ ] Does NOT make manifest write blocking
- [ ] Does NOT violate write-once semantics
- [ ] Does NOT move manifest write inside transaction
- [ ] Retry is out-of-band only
- [ ] Signature failure does NOT block manifest write
- [ ] Admin endpoint enqueues only, never direct write

---

## 10. Sign-Off

| Role | Name | Date |
|------|------|------|
| Author | Kiro | 2026-02-02 |
| Reviewer | User | 2026-02-02 |
| Approver | User | 2026-02-02 |

**Phase 10 Architecture is LOCKED. Implementation can begin.**
