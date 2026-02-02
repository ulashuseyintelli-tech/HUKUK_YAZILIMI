# Phase 10: Tasks

## Task Breakdown

### Phase 10.1: Retry Pipeline

#### Task 10.1.1: Error Classifier
- [ ] Create `manifest-error-classifier.ts`
- [ ] Implement `classifyError()` function
- [ ] Add unit tests for all error types
- [ ] Export from index.ts

**DoD:**
- 5xx → transient
- timeout → transient
- 429 → transient
- 4xx (except 429) → permanent
- 100% test coverage

#### Task 10.1.2: Retry Queue Schema
- [ ] Create migration for `manifest_retry_queue` table
- [ ] Add unique constraint on bundle_id
- [ ] Add index on next_retry_at
- [ ] Run migration test

**DoD:**
- Migration applies cleanly
- Rollback works
- Index verified

#### Task 10.1.3: DLQ Schema
- [ ] Create migration for `manifest_dead_letter_queue` table
- [ ] Add unique constraint on bundle_id
- [ ] Run migration test

**DoD:**
- Migration applies cleanly
- Rollback works

#### Task 10.1.4: Retry Queue Repository
- [ ] Create `manifest-retry-queue.repository.ts`
- [ ] Implement `enqueue()` method
- [ ] Implement `dequeueForProcessing()` with SKIP LOCKED
- [ ] Implement `markSuccess()` method
- [ ] Implement `updateNextRetry()` method
- [ ] Add unit tests

**DoD:**
- All CRUD operations work
- Concurrent access safe (SKIP LOCKED)
- 100% test coverage

#### Task 10.1.5: DLQ Repository
- [ ] Create `manifest-dlq.repository.ts`
- [ ] Implement `enqueue()` method
- [ ] Implement `query()` method with pagination
- [ ] Implement `resolve()` method
- [ ] Add unit tests

**DoD:**
- All CRUD operations work
- Pagination works
- 100% test coverage

#### Task 10.1.6: Retry Worker
- [ ] Create `manifest-retry-worker.service.ts`
- [ ] Implement `processRetryBatch()` method
- [ ] Implement exponential backoff with jitter
- [ ] Implement max retry logic
- [ ] Add unit tests
- [ ] Add integration tests

**DoD:**
- Processes batches correctly
- Backoff formula verified
- Max retries → DLQ
- Integration test passes

#### Task 10.1.7: ManifestWriter Integration
- [ ] Update `ManifestWriter` to use error classifier
- [ ] Add retry queue injection
- [ ] Add DLQ injection
- [ ] Update existing tests
- [ ] Add new integration tests

**DoD:**
- Transient errors enqueued
- Permanent errors go to DLQ
- Existing tests pass
- New tests pass

#### Task 10.1.8: Admin Retry API
- [ ] Create `manifest-admin.controller.ts`
- [ ] Implement `POST /admin/bundles/{bundleId}/manifest/retry`
- [ ] **MUST enqueue job, MUST NOT do direct write**
- [ ] Add admin role guard (break-glass)
- [ ] Add rate limiting (10 req/min)
- [ ] Add audit logging
- [ ] Add idempotency check (already queued within 1 min)
- [ ] Add manifest exists check (no-op success)
- [ ] Add unit tests

**DoD:**
- Endpoint enqueues job (never direct write)
- Auth required (break-glass role)
- Rate limited
- Idempotent
- Audited
- Tests pass

#### Task 10.1.9: DLQ Query API
- [ ] Add `GET /admin/manifest/dlq` endpoint
- [ ] Implement pagination
- [ ] Add admin role guard
- [ ] Add unit tests

**DoD:**
- Endpoint works
- Pagination works
- Auth required
- Tests pass

#### Task 10.1.10: DLQ Re-drive API
- [ ] Add `POST /admin/manifest/dlq/{dlqId}/redrive` endpoint
- [ ] Move entry from DLQ back to retry queue
- [ ] Add admin role guard
- [ ] Add audit logging
- [ ] Add unit tests

**DoD:**
- Re-drive works
- Entry moved to retry queue
- Audited
- Tests pass

#### Task 10.1.11: DLQ Resolve API
- [ ] Add `POST /admin/manifest/dlq/{dlqId}/resolve` endpoint
- [ ] Accept resolution type and notes
- [ ] Mark entry as resolved
- [ ] Add admin role guard
- [ ] Add audit logging
- [ ] Add unit tests

**DoD:**
- Resolve works
- Resolution recorded
- Audited
- Tests pass

#### Task 10.1.12: Circuit Breaker
- [ ] Implement circuit breaker for retry worker
- [ ] States: CLOSED → OPEN → HALF-OPEN → CLOSED
- [ ] Threshold: 5 consecutive failures
- [ ] Reset timeout: 60 seconds
- [ ] Add metrics for circuit breaker state
- [ ] Add unit tests

**DoD:**
- Circuit breaker works
- State transitions correct
- Metrics emitted
- Tests pass

#### Task 10.1.13: Metrics
- [ ] Add retry queue metrics
- [ ] Add DLQ metrics (size, oldest age)
- [ ] Add circuit breaker metrics
- [ ] Add to existing metrics collector
- [ ] Update SIGN-OFF with new metrics

**DoD:**
- All metrics emitted
- Grafana dashboard updated

---

### Phase 10.2: Digital Signature

#### Task 10.2.1: Signature Types
- [ ] Create `bundle-signature.types.ts`
- [ ] Define `BundleSignature` interface
- [ ] Define `SigningKey` interface
- [ ] Define `VerificationResult` interface

**DoD:**
- All types defined
- JSDoc comments

#### Task 10.2.2: Signing Key Service
- [ ] Create `signing-key.service.ts`
- [ ] Implement `getActiveSigningKey()`
- [ ] Implement `getKeyById()`
- [ ] Implement key rotation support
- [ ] Implement key revocation
- [ ] Add unit tests

**DoD:**
- Key management works
- Rotation works
- Revocation works
- Tests pass

#### Task 10.2.3: Signature Service
- [ ] Create `bundle-signature.service.ts`
- [ ] Implement `sign()` method (RS256)
- [ ] Implement `sign()` method (ES256)
- [ ] Implement `verify()` method
- [ ] Add unit tests

**DoD:**
- RS256 signing works
- ES256 signing works
- Verification works
- Tests pass

#### Task 10.2.4: ManifestWriter Signature Integration
- [ ] Update `ManifestWriter` to sign manifests
- [ ] Handle signing failures gracefully (warning, not blocking)
- [ ] Store signature in seal record (DB)
- [ ] Update manifest schema to include signatureRef
- [ ] Update existing tests

**DoD:**
- Manifests are signed
- Signature stored in seal record
- Signing failure doesn't block write
- Tests pass

#### Task 10.2.5: Seal Record Schema Update
- [ ] Add signature columns to evidence_bundle_seal_events
- [ ] Create migration
- [ ] Run migration test

**DoD:**
- Migration applies cleanly
- Rollback works

#### Task 10.2.6: Verification API
- [ ] Add `GET /bundles/{bundleId}/verify` endpoint
- [ ] Implement verification logic
- [ ] Add audit logging
- [ ] Add unit tests

**DoD:**
- Endpoint works
- Verification correct
- Audited
- Tests pass

#### Task 10.2.7: CLI Verification Tool
- [ ] Create `verify-bundle` CLI command
- [ ] Implement offline verification
- [ ] Add help documentation
- [ ] Add integration tests

**DoD:**
- CLI works
- Offline verification works
- Help text clear
- Tests pass

#### Task 10.2.8: Signature Metrics
- [ ] Add signature generation metrics
- [ ] Add verification metrics
- [ ] Update metrics collector

**DoD:**
- All metrics emitted
- Dashboard updated

---

## Task Dependencies

```
10.1.1 (Error Classifier)
    │
    ├──► 10.1.4 (Retry Queue Repo)
    │        │
    │        └──► 10.1.6 (Retry Worker)
    │                 │
    │                 └──► 10.1.7 (ManifestWriter Integration)
    │
    └──► 10.1.5 (DLQ Repo)
             │
             └──► 10.1.7 (ManifestWriter Integration)

10.1.2 (Retry Queue Schema) ──► 10.1.4 (Retry Queue Repo)
10.1.3 (DLQ Schema) ──► 10.1.5 (DLQ Repo)

10.1.7 (ManifestWriter Integration)
    │
    ├──► 10.1.8 (Admin Retry API)
    └──► 10.1.9 (DLQ Query API)

10.2.1 (Signature Types)
    │
    ├──► 10.2.2 (Signing Key Service)
    │        │
    │        └──► 10.2.3 (Signature Service)
    │                 │
    │                 └──► 10.2.4 (ManifestWriter Signature Integration)
    │                          │
    │                          ├──► 10.2.5 (Verification API)
    │                          └──► 10.2.6 (CLI Verification Tool)
    │
    └──► 10.2.3 (Signature Service)
```

---

## Execution Order (Recommended)

### Sprint 1: Retry Pipeline Foundation
1. Task 10.1.1: Error Classifier
2. Task 10.1.2: Retry Queue Schema
3. Task 10.1.3: DLQ Schema
4. Task 10.1.4: Retry Queue Repository
5. Task 10.1.5: DLQ Repository

### Sprint 2: Retry Pipeline Integration
6. Task 10.1.6: Retry Worker
7. Task 10.1.7: ManifestWriter Integration
8. Task 10.1.8: Admin Retry API
9. Task 10.1.9: DLQ Query API
10. Task 10.1.10: Metrics

### Sprint 3: Digital Signature
11. Task 10.2.1: Signature Types
12. Task 10.2.2: Signing Key Service
13. Task 10.2.3: Signature Service
14. Task 10.2.4: ManifestWriter Signature Integration
15. Task 10.2.5: Verification API
16. Task 10.2.6: CLI Verification Tool
17. Task 10.2.7: Signature Metrics

---

## Phase 9C Lock Compliance Checklist

Before each task, verify:

- [ ] Does NOT change seal transaction semantics
- [ ] Does NOT make manifest write blocking
- [ ] Does NOT violate write-once semantics
- [ ] Does NOT move manifest write inside transaction
- [ ] Retry is out-of-band only
- [ ] Signature failure does NOT block manifest write

---

## Test Coverage Target

| Component | Unit Tests | Integration Tests |
|-----------|------------|-------------------|
| Error Classifier | 15+ | - |
| Retry Queue Repo | 10+ | 5+ |
| DLQ Repo | 10+ | 5+ |
| Retry Worker | 15+ | 10+ |
| Circuit Breaker | 10+ | 5+ |
| Admin APIs | 15+ | 10+ |
| Signature Service | 20+ | 10+ |
| Key Service | 15+ | 5+ |
| Verification | 10+ | 5+ |
| **Total** | **120+** | **55+** |
