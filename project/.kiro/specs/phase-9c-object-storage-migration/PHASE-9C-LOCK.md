# Phase 9C Lock Document

**Status**: LOCKED  
**Locked At**: 2026-02-02  
**Lock Owner**: Phase 9C Object Storage Migration

---

## Lock Scope

This document defines what is LOCKED and what is ALLOWED after Phase 9C completion.

### Priority Rules (CRITICAL)

**These two rules define the architectural priority and must never be violated:**

1. **Seal correctness > Export availability**
   - Seal integrity is the primary concern
   - Manifest export is secondary/auxiliary
   - If forced to choose, always protect seal correctness

2. **Any change that makes manifest write blocking is FORBIDDEN**
   - Manifest write must remain fire-and-forget
   - Manifest failure must never block seal success
   - This is the most common regression pattern - guard against it

---

### Non-Goals (Explicitly Out of Scope)

The following are NOT part of Phase 9C and belong to future phases:

- ❌ Retention alignment / enforcement → Phase 11
- ❌ Legal hold ↔ retention cross-checks → Phase 11
- ❌ Manifest timestamps ↔ retention policy validation → Phase 11
- ❌ Retry worker / DLQ pipeline → Phase 10
- ❌ Digital signature (manifest.signature) → Phase 10/11

Phase 9C scope is strictly: **seal + manifest export + write-once + invariants**

### 🔒 LOCKED (Breaking Changes Forbidden)

#### 1. Bundle State Machine

```
OPEN ──────────────────► SEALED
       (one-way, irreversible)
```

**Forbidden Changes:**
- ❌ Adding reverse transition (SEALED → OPEN)
- ❌ Adding intermediate states
- ❌ Bypassing seal validation

#### 2. Database Schema (evidence_bundles)

```sql
CREATE TABLE evidence_bundles (
  id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  incident_id TEXT NOT NULL,
  state bundle_state NOT NULL DEFAULT 'OPEN',
  sealed_hash TEXT,
  sealed_at TIMESTAMPTZ,
  seal_run_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE evidence_bundle_objects (
  id UUID PRIMARY KEY,
  bundle_id UUID NOT NULL REFERENCES evidence_bundles(id),
  object_key TEXT NOT NULL,
  object_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  etag TEXT NOT NULL,
  version_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE evidence_bundle_seal_events (
  id UUID PRIMARY KEY,
  bundle_id UUID NOT NULL REFERENCES evidence_bundles(id),
  sealed_hash TEXT NOT NULL,
  sealed_at TIMESTAMPTZ NOT NULL,
  seal_run_id TEXT NOT NULL,
  object_count INTEGER NOT NULL,
  total_size_bytes BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Forbidden Changes:**
- ❌ Removing columns
- ❌ Changing column types
- ❌ Removing triggers (trg_bundle_write_once, trg_seal_event_order)
- ❌ Changing enum values (bundle_state)

#### 3. Database Triggers (CRITICAL)

| Trigger | SQLSTATE | Purpose |
|---------|----------|---------|
| `trg_bundle_write_once` | 45000 | Block INSERT to SEALED bundle |
| `trg_bundle_tenant_check` | 45001 | Block cross-tenant object insert |
| `trg_seal_event_order` | 45002 | Enforce seal event after SEALED state |

**Forbidden Changes:**
- ❌ Removing triggers
- ❌ Relaxing trigger conditions
- ❌ Changing SQLSTATE codes

#### 4. Seal Service Contract

**BundleSealService:**
```typescript
// API path (on-demand)
sealBundleOnDemand(bundleId: string): Promise<SealResult>
// Lock: FOR UPDATE NOWAIT

// Worker path (batch)
sealNextOpenBundleBatch(options: BatchOptions): Promise<BatchSealResult>
// Lock: FOR UPDATE SKIP LOCKED
```

**Forbidden Changes:**
- ❌ Changing lock strategies
- ❌ Removing transaction boundaries
- ❌ Changing error code mapping

#### 5. Error Code Mapping (API Contract)

| SQLSTATE | Error Class | HTTP |
|----------|-------------|------|
| 55P03 | BundleLockedError | 423 |
| 45000 | WriteOnceViolationError | 409 |
| 45001 | TenantMismatchError | 403 |
| 45002 | InvalidStateTransitionError | 409 |
| 23503 | BundleNotFoundError | 404 |

**Forbidden Changes:**
- ❌ Changing HTTP status codes
- ❌ Changing error class names
- ❌ Removing error types

#### 6. Hash Hierarchy

```
sealedHash   = SHA-256(objects sorted by key)     → Content integrity
manifestHash = SHA-256(canonical JSON envelope)   → Export integrity
```

**Single Source of Truth:**
- `bundle-seal.hasher.ts` → sealedHash
- `bundle-manifest.hasher.ts` → manifestHash

**Forbidden:**
- ❌ Calculating hashes elsewhere
- ❌ Changing hash algorithms
- ❌ Changing canonical format

#### 7. Manifest Schema (v1.0.0)

```typescript
interface BundleManifestV1 {
  version: '1.0.0';
  bundleId: string;
  tenantId: string;
  incidentId: string;
  state: 'SEALED';
  sealedHash: string;
  sealedAt: string;        // ISO 8601 UTC
  sealRunId: string;
  createdAt: string;       // ISO 8601 UTC
  objects: ManifestObjectV1[];
  objectCount: number;
  totalSizeBytes: string;  // bigint as string
  manifestHash: string;
  signature: null;         // Phase 10/11
  storage: { provider: 's3'; bucket: string; region?: string };
}
```

**Forbidden Changes:**
- ❌ Removing fields
- ❌ Changing field types
- ❌ Changing version without migration path

#### 8. Write-Once Semantics

**S3 Layer:**
- `If-None-Match: *` header on PUT
- HEAD verification after PUT
- `ObjectAlreadyExistsError` on conflict

**DB Layer:**
- Trigger `45000` blocks INSERT to SEALED bundle

**Forbidden:**
- ❌ Allowing manifest overwrite
- ❌ Allowing object overwrite in SEALED bundle
- ❌ Bypassing write-once checks

#### 9. Manifest Hook Architecture

```
Seal Transaction (DB)
        │
        ▼ commit success
        │
Post-Seal Hook (OUTSIDE transaction)
        │
        ▼ fire-and-forget
        │
ManifestWriter.writeManifestForBundle()
```

**Invariants:**
- ✅ Manifest write is OUTSIDE seal transaction
- ✅ Manifest failure does NOT rollback seal
- ✅ Manifest write is fire-and-forget (no blocking)
- ✅ Errors logged + metric emitted

**Forbidden:**
- ❌ Moving manifest write inside transaction
- ❌ Making seal success depend on manifest
- ❌ Blocking seal on manifest write

#### 10. S3 Metadata Headers

```
x-amz-meta-manifest-version: 1.0.0
x-amz-meta-bundle-id: <bundleId>
x-amz-meta-sha256: <manifestHash>
Content-Type: application/json
```

**Forbidden:**
- ❌ Removing metadata headers
- ❌ Changing header names

---

### ✅ ALLOWED (Non-Breaking Changes)

#### 1. Index Additions

```sql
-- ALLOWED: Non-unique indexes for performance
CREATE INDEX idx_bundle_tenant_state ON evidence_bundles (tenant_id, state);
CREATE INDEX idx_bundle_sealed_at ON evidence_bundles (sealed_at);
```

**Rules:**
- ✅ Non-unique indexes only
- ✅ Must not change query semantics

#### 2. Manifest Schema Extensions (v1.1+)

- ✅ Adding new optional fields
- ✅ Adding `signature` field (Phase 10/11)
- ❌ Removing existing fields
- ❌ Changing existing field types

#### 3. Metric Additions

- ✅ Adding new metrics
- ✅ Adding new metric labels (low cardinality only)
- ❌ Removing existing metrics
- ❌ Adding bundleId as metric label (cardinality explosion)

#### 4. Retry Pipeline (Phase 10)

- ✅ Adding out-of-band retry worker
- ✅ Adding dead-letter queue
- ❌ Adding in-band retry (latency impact)

#### 5. Bug Fixes

- ✅ Fixing incorrect error messages
- ✅ Fixing edge cases in validation
- ❌ Changing invariant behavior

---

## Failure Semantics

### Manifest Write Failure Behavior

| Scenario | Seal Status | Manifest Status | Action |
|----------|-------------|-----------------|--------|
| S3 5xx/timeout | ✅ SUCCESS | ❌ FAILED | Log + metric, retry later (Phase 10) |
| S3 403/policy | ✅ SUCCESS | ❌ FAILED | Log + metric, investigate IAM |
| Already exists | ✅ SUCCESS | ✅ NO-OP | Idempotent, no action needed |
| Bundle not sealed | N/A | ❌ SKIPPED | Bug - should not happen |

**Critical Invariant**: Manifest failure MUST NEVER affect seal success.

### Error Codes (Manifest Write)

| Code | Description | Retryable |
|------|-------------|-----------|
| `STORAGE_ERROR` | S3 5xx, timeout, throttling | ✅ Yes |
| `BUNDLE_NOT_FOUND` | Bundle doesn't exist | ❌ No |
| `BUNDLE_NOT_SEALED` | Bundle state != SEALED | ❌ No (bug) |
| `UNKNOWN` | Unexpected error | ⚠️ Investigate |

---

## Observability (Required)

### Metrics

```
bundle_manifest_write_total{result="success|failure|already_exists"}
bundle_manifest_write_duration_seconds{quantile="0.5|0.9|0.99"}
```

**Labels:**
- `result`: success, failure, already_exists
- `error_code`: (only for failures) STORAGE_ERROR, BUNDLE_NOT_FOUND, etc.

**⚠️ FORBIDDEN**: `bundleId` as metric label (cardinality explosion). Use logs instead.

### Alert Rules

| Alert | Condition | Severity |
|-------|-----------|----------|
| ManifestWriteFailureRate | `failure_rate > 1%` over 5m | Warning |
| ManifestWriteCritical | `failure_rate > 5%` over 5m | Critical |
| ManifestConsecutiveFailures | `consecutive failures > 3` within 5m | Critical |

### Ops Runbook: Manifest Write Failure

**Triage Steps:**

1. **Check S3/MinIO connectivity:**
   ```bash
   aws s3 ls s3://<bucket>/bundles/ --region <region>
   # or for MinIO:
   mc ls <alias>/<bucket>/bundles/
   ```

2. **Verify bundle state in DB:**
   ```sql
   SELECT id, state, sealed_at FROM evidence_bundles WHERE id = '<bundleId>';
   ```

3. **Check error logs:**
   ```bash
   grep "ManifestWriter" /var/log/api.log | grep "bundleId=<id>"
   ```

**Resolution by Error Code:**

| Error | Action |
|-------|--------|
| 5xx/timeout | Wait for S3 recovery, manual retry |
| 403/policy | Check IAM credentials and bucket policy |
| Serialization | Code regression - rollback/patch |

**Manual Retry (Phase 10 Admin API):**
```bash
POST /admin/bundles/{bundleId}/manifest/retry
Authorization: Bearer <admin-token>
```

**Security Notes:**
- Admin endpoint requires break-glass role
- Rate limit: 10 req/min per admin user
- All retries logged to audit trail

---

## Verification Checklist

Before any change to Phase 9C code, verify:

- [ ] Does this change the state machine?
- [ ] Does this change any locked schema?
- [ ] Does this change any trigger behavior?
- [ ] Does this change error code mapping?
- [ ] Does this change hash calculation?
- [ ] Does this allow manifest/object overwrite?
- [ ] Does this move manifest write inside transaction?

If ANY answer is YES → **CHANGE FORBIDDEN**

---

## Test Coverage

| Suite | Tests | Description |
|-------|-------|-------------|
| bundle-manifest.canonical.spec.ts | 18 | Canonical JSON |
| bundle-manifest.hasher.spec.ts | 12 | manifestHash |
| bundle-manifest.verifier.spec.ts | 10 | Verification |
| bundle-manifest.integration.spec.ts | 8 | End-to-end |
| bundle-seal.hasher.spec.ts | 12 | sealedHash |
| bundle-seal.errors.spec.ts | 17 | Error mapping |
| bundle-seal.integration.spec.ts | 10 | Seal flow |
| **Total** | **87** | |

---

## Regression Suite

### Test Command

```bash
# Run Phase 9C regression suite
pnpm --filter api exec jest --testPathPattern="bundle-manifest|bundle-seal" --verbose
```

### CI Integration

Phase 9C tests are a regression gate:
- Any failure in `bundle-manifest` or `bundle-seal` tests blocks merge
- CI job name: `phase-9c-regression`

### Test Files

```
object-store/bundle-manifest/__tests__/
├── bundle-manifest.canonical.spec.ts    (18 tests)
├── bundle-manifest.hasher.spec.ts       (12 tests)
├── bundle-manifest.verifier.spec.ts     (10 tests)
└── bundle-manifest.integration.spec.ts  (8 tests)

object-store/bundle-seal/__tests__/
├── bundle-seal.hasher.spec.ts           (12 tests)
├── bundle-seal.errors.spec.ts           (17 tests)
└── bundle-seal.integration.spec.ts      (10 tests)

Total: 87 tests
```

---

## Dependencies

- Phase 9A (Redis) ✅
- Phase 9B (PostgreSQL) ✅
- Phase 9B5 (Snapshot Store) ✅

## Unlocks

- Phase 10: Digital Signature + Retry Pipeline
- Phase 11: Retention + Legal Hold Alignment
- Phase 12: Evidence Export API

---

## Sign-Off

| Role | Name | Date |
|------|------|------|
| Author | Kiro | 2026-02-02 |
| Reviewer | User | 2026-02-02 |
| Approver | User | 2026-02-02 |

**Phase 9C is officially LOCKED. Breaking changes require new phase.**
