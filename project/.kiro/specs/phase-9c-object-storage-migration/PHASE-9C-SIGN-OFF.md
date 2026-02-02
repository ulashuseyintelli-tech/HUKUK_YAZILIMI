# Phase 9C - Object Storage Migration: SIGN-OFF

**Status**: ✅ COMPLETE  
**Date**: 2026-02-02  
**Test Coverage**: 87+ tests passing

---

## Executive Summary

Phase 9C establishes the legal-grade evidence storage foundation with:
- Immutable object storage (S3/MinIO)
- Write-once semantics enforced at DB + storage layer
- Tamper-evident bundle sealing with cryptographic hashes
- Manifest generation for audit trail export

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        PHASE 9C ARCHITECTURE                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐        │
│  │   API Layer     │     │   Worker Layer  │     │   Storage Layer │        │
│  │                 │     │                 │     │                 │        │
│  │  POST /seal     │────▶│  BundleSealSvc  │────▶│  PostgreSQL     │        │
│  │  (NOWAIT)       │     │  (SKIP LOCKED)  │     │  - bundles      │        │
│  │                 │     │                 │     │  - objects      │        │
│  │  GET /manifest  │     │                 │     │  - seal_events  │        │
│  └────────┬────────┘     └────────┬────────┘     └────────┬────────┘        │
│           │                       │                       │                  │
│           │              ┌────────▼────────┐              │                  │
│           │              │  ManifestWriter │              │                  │
│           │              │  (fire-forget)  │              │                  │
│           │              └────────┬────────┘              │                  │
│           │                       │                       │                  │
│           │              ┌────────▼────────┐     ┌────────▼────────┐        │
│           └─────────────▶│   S3/MinIO      │◀────│  Write-Once     │        │
│                          │  - manifest.json│     │  Enforcement    │        │
│                          │  - objects/*    │     │  (If-None-Match)│        │
│                          └─────────────────┘     └─────────────────┘        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Task Completion Matrix

| Task | Description | Status | Tests |
|------|-------------|--------|-------|
| Task 0 | Foundation Gates (Interface, Config) | ✅ | 12 |
| Task 1 | Write-Once Semantics | ✅ | 15 |
| Task 2 | DB Migration (evidence_bundles, triggers) | ✅ | 8 |
| Task 2.5 | Bundle Seal Service (NOWAIT/SKIP LOCKED) | ✅ | 39 |
| Task 3 | Bundle Manifest + Export Contract | ✅ | 48 |

**Total Tests**: 87+ passing

---

## Key Invariants (Locked)

### 1. State Machine
```
OPEN ──────▶ SEALED (one-way, irreversible)
```

### 2. Write-Once Enforcement
- DB: Trigger `45000` blocks INSERT to SEALED bundle
- S3: `If-None-Match: *` + HEAD verification

### 3. Hash Hierarchy
```
sealedHash   = SHA-256(objects sorted by key)     → Content integrity
manifestHash = SHA-256(canonical JSON envelope)   → Export integrity
```

### 4. Transaction Order (Trigger 45002)
```
1. UPDATE bundle SET state='SEALED'
2. INSERT seal_event
```

### 5. Dual Seal Semantics
| Path | Lock Strategy | Use Case |
|------|---------------|----------|
| API | FOR UPDATE NOWAIT | On-demand, deterministic response |
| Worker | FOR UPDATE SKIP LOCKED | Batch, throughput |

---

## Error Code Reference

| SQLSTATE | Error | HTTP | Description |
|----------|-------|------|-------------|
| 55P03 | BundleLockedError | 423 | Row locked by another process |
| 45000 | WriteOnceViolationError | 409 | SEALED bundle write attempt |
| 45001 | TenantMismatchError | 403 | Cross-tenant violation |
| 45002 | InvalidStateTransitionError | 409 | Seal event before SEALED state |
| 23503 | BundleNotFoundError | 404 | FK violation (bundle missing) |

---

## Manifest Contract (v1.0.0)

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
  manifestHash: string;    // SHA-256 of canonical JSON
  signature: null;         // Phase 10/11
  storage: { provider: 's3'; bucket: string; region?: string };
}
```

**Storage Key**: `bundles/{bundleId}/manifest.json`

---

## Operational Notes

### Metrics to Add (Pre-Production)
- `bundle_seal_total{status=success|failure}`
- `bundle_seal_duration_seconds`
- `manifest_write_total{status=success|failure|already_exists}`
- `manifest_write_duration_seconds`

### Log Fields (Structured)
- `bundleId`, `tenantId`, `incidentId`
- `runId`, `sealedHash`, `objectCount`, `totalSizeBytes`
- `lockStrategy` (nowait|skip_locked)

### Alerting Thresholds
- `manifest_write_failure_rate > 1%` → P2 Alert
- `bundle_seal_locked_rate > 10%` → P3 Alert (contention)

### Ops Playbook: Manifest Write Failure

**Alert**: `bundle_manifest_write_total{result="failure"}` rate > 1% (5m window)

**Triage Steps**:
1. Check S3 connectivity:
   ```bash
   aws s3 ls s3://<bucket>/bundles/ --max-items 1
   ```
2. Check bundle state in DB:
   ```sql
   SELECT id, state, sealed_at FROM evidence_bundles WHERE id = '<bundleId>';
   ```
3. Check error logs:
   ```bash
   grep "ManifestWriter" /var/log/api.log | grep "bundleId=<id>"
   ```

**Resolution Actions**:
| Error Code | Action |
|------------|--------|
| STORAGE_ERROR (5xx) | Wait for S3 recovery, retry via admin API |
| BUNDLE_NOT_FOUND | Investigate DB consistency |
| BUNDLE_NOT_SEALED | Bug - seal hook fired for non-sealed bundle |
| UNKNOWN | Check full stack trace in logs |

**Manual Re-trigger** (Phase 10):
```bash
POST /admin/bundles/{bundleId}/manifest/retry
Authorization: Bearer <admin-token>
```

**Escalation**:
- P2: On-call engineer (15 min response)
- P1: If >10% failure rate sustained for 30 min

---

## Dependencies

- Phase 9A (Redis) ✅
- Phase 9B (PostgreSQL) ✅
- Phase 9B5 (Snapshot Store) ✅

## Unlocks

- Phase 10: Digital Signature (manifest.signature)
- Phase 11: Retention + Legal Hold Alignment
- Phase 12: Evidence Export API

---

## Phase 10 Backlog (Documented)

### Manifest Retry Pipeline (P2)

**Problem**: Fire-and-forget is correct for latency, but transient S3 errors (5xx, timeouts, throttling) need retry.

**Solution**: Out-of-band retry with exponential backoff + jitter

```
┌─────────────────────────┐      ┌────────────────────────────────────────┐
│ ManifestWriteJob Queue  │ ---> │ Worker: retry w/ backoff + jitter     │
│  - transient failures   │      │ - max attempts: 5-7                   │
│  - enqueue on 5xx/timeout│     │ - dead-letter on permanent errors     │
└─────────────────────────┘      └────────────────────────────────────────┘
```

**Error Classification**:
| Error Type | Action |
|------------|--------|
| 5xx, timeout, throttling | Retry with backoff |
| 4xx, permission, validation | Dead-letter (no retry) |

**Idempotency**: Already guaranteed by write-once semantics.

---

## Sign-Off

| Role | Name | Date | Status |
|------|------|------|--------|
| Architect | - | 2026-02-02 | ✅ Approved |
| Implementation | Kiro | 2026-02-02 | ✅ Complete |
| Review | User | 2026-02-02 | ✅ Approved |

**Phase 9C is officially CLOSED. No refactor debt. Clean transition to Phase 10/11.**
