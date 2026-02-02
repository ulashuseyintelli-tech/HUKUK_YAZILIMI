# Phase 9C Task 2.5 - BundleSealJob Architecture

## ✅ SIGN-OFF (2026-02-02)

**Status**: COMPLETE

**Summary**:
- DB invariants enforced (partial unique, seal invariant, triggers 45000/45001/45002)
- Dual seal semantics implemented (worker SKIP LOCKED, API NOWAIT)
- Hash canonicalization locked
- 39 tests passing (12 hasher + 17 errors + 10 integration)

**Operational Notes** (pre-prod checklist):
- Metrics: `sealed_count`, `locked_count`, `skipped_count`, `conflict_count`
- Log fields: `bundleId`, `tenantId`, `incidentId`, `runId`, `sealedHash`, `objectCount`, `totalSizeBytes`, `lockStrategy`

---

## Overview

Evidence bundle sealing with legal-grade audit trail. Two execution paths:
- **API (on-demand)**: NOWAIT semantics for deterministic response
- **Worker (batch)**: SKIP LOCKED semantics for throughput

## Module Structure

```
bundle-seal/
├── bundle-seal.types.ts      # Type definitions
├── bundle-seal.hasher.ts     # SHA-256 hash computation
├── bundle-seal.errors.ts     # Exception classes + SQLSTATE mapper
├── bundle-seal.repository.ts # Prisma raw queries
├── bundle-seal.service.ts    # Business logic
├── index.ts                  # Public exports
└── __tests__/
    ├── bundle-seal.hasher.spec.ts      # Unit tests
    ├── bundle-seal.errors.spec.ts      # Unit tests
    └── bundle-seal.integration.spec.ts # Integration tests
```

## Sequence Diagrams

### API Path (On-Demand Seal)

```
┌─────────┐     ┌─────────────────┐     ┌────────────────┐     ┌──────────────┐
│  Client │     │ BundleSealService│     │ BundleSealRepo │     │  PostgreSQL  │
└────┬────┘     └────────┬────────┘     └───────┬────────┘     └──────┬───────┘
     │                   │                      │                     │
     │ sealBundleOnDemand│                      │                     │
     │──────────────────>│                      │                     │
     │                   │                      │                     │
     │                   │ BEGIN SERIALIZABLE   │                     │
     │                   │─────────────────────>│                     │
     │                   │                      │                     │
     │                   │ lockBundleNowait()   │                     │
     │                   │─────────────────────>│ SELECT ... FOR UPDATE NOWAIT
     │                   │                      │────────────────────>│
     │                   │                      │                     │
     │                   │                      │<────────────────────│
     │                   │<─────────────────────│ bundle row or 55P03 │
     │                   │                      │                     │
     │                   │ [if 55P03]           │                     │
     │                   │ throw BundleLockedError (423)              │
     │                   │                      │                     │
     │                   │ [if state=SEALED]    │                     │
     │                   │ throw BundleAlreadySealedError (409)       │
     │                   │                      │                     │
     │                   │ getObjectsOrdered()  │                     │
     │                   │─────────────────────>│ SELECT ... ORDER BY object_key
     │                   │                      │────────────────────>│
     │                   │                      │<────────────────────│
     │                   │<─────────────────────│ objects[]           │
     │                   │                      │                     │
     │                   │ computeSealSnapshot()│                     │
     │                   │ (hash, count, size)  │                     │
     │                   │                      │                     │
     │                   │ updateBundleSealed() │                     │
     │                   │─────────────────────>│ UPDATE ... SET state='SEALED'
     │                   │                      │────────────────────>│
     │                   │                      │<────────────────────│
     │                   │<─────────────────────│ rowCount            │
     │                   │                      │                     │
     │                   │ insertSealEvent()    │                     │
     │                   │─────────────────────>│ INSERT ... ON CONFLICT DO NOTHING
     │                   │                      │────────────────────>│
     │                   │                      │<────────────────────│
     │                   │<─────────────────────│ inserted            │
     │                   │                      │                     │
     │                   │ COMMIT               │                     │
     │                   │─────────────────────>│                     │
     │                   │                      │────────────────────>│
     │                   │                      │<────────────────────│
     │<──────────────────│ SealResult (200)     │                     │
     │                   │                      │                     │
```

### Worker Path (Batch Seal)

```
┌─────────┐     ┌─────────────────┐     ┌────────────────┐     ┌──────────────┐
│ Worker  │     │ BundleSealService│     │ BundleSealRepo │     │  PostgreSQL  │
└────┬────┘     └────────┬────────┘     └───────┬────────┘     └──────┬───────┘
     │                   │                      │                     │
     │ sealNextOpenBundleBatch                  │                     │
     │──────────────────>│                      │                     │
     │                   │                      │                     │
     │                   │ BEGIN SERIALIZABLE   │                     │
     │                   │─────────────────────>│                     │
     │                   │                      │                     │
     │                   │ pickNextOpenBundleSkipLocked()             │
     │                   │─────────────────────>│ SELECT ... WHERE state='OPEN'
     │                   │                      │   AND created_at < grace_period
     │                   │                      │   FOR UPDATE SKIP LOCKED
     │                   │                      │────────────────────>│
     │                   │                      │<────────────────────│
     │                   │<─────────────────────│ bundle or null      │
     │                   │                      │                     │
     │                   │ [if null]            │                     │
     │<──────────────────│ {sealed:false, reason:'no_candidate'}      │
     │                   │                      │                     │
     │                   │ [else: same as API path]                   │
     │                   │ getObjectsOrdered()  │                     │
     │                   │ computeSealSnapshot()│                     │
     │                   │ updateBundleSealed() │                     │
     │                   │ insertSealEvent()    │                     │
     │                   │ COMMIT               │                     │
     │                   │                      │                     │
     │<──────────────────│ BatchSealResult      │                     │
     │                   │                      │                     │
```

## Hash Computation

### Canonical Format

```
${objectKey}\n${etag}\n${versionId ?? ''}\n${contentType}\n${sizeBytes.toString()}
```

Objects joined by single `\n` character.

### Example

```typescript
// Input objects (MUST be sorted by object_key ASC)
const objects = [
  { object_key: 'a.json', etag: '"abc"', version_id: null, content_type: 'application/json', size_bytes: 100n },
  { object_key: 'b.json', etag: '"def"', version_id: 'v1', content_type: 'application/json', size_bytes: 200n },
];

// Canonical payload
const payload = 'a.json\n"abc"\n\napplication/json\n100\nb.json\n"def"\nv1\napplication/json\n200';

// Hash
const hash = crypto.createHash('sha256').update(payload, 'utf8').digest('hex');
// → 64 character hex string
```

## Error Mapping

| SQLSTATE | Error Class | HTTP | Description |
|----------|-------------|------|-------------|
| 55P03 | BundleLockedError | 423 | FOR UPDATE NOWAIT failed |
| 23503 | BundleNotFoundError | 404 | Bundle not found |
| 45000 | WriteOnceViolationError | 409 | SEALED bundle write attempt |
| 45001 | TenantMismatchError | 403 | Cross-tenant violation |
| 45002 | InvalidStateTransitionError | 409 | Seal event for non-SEALED bundle |
| 23505 | DuplicateBundleError | 409 | Unique constraint violation |

## Transaction Order

Due to trigger 45002 (`seal_event_requires_sealed_bundle`), operations MUST be in this order:

1. `UPDATE evidence_bundles SET state='SEALED'`
2. `INSERT INTO bundle_seal_events`

Reversing this order will cause trigger 45002 to reject the seal event.

## Configuration

```typescript
interface BundleSealConfig {
  gracePeriodMs: number;  // Default: 5 minutes (300000ms)
}

// Environment variable
SEAL_GRACE_PERIOD_MS=300000
```

## API Response Semantics

### sealBundleOnDemand(bundleId, runId)

| Condition | Response |
|-----------|----------|
| Success | 200 + SealResult |
| Bundle not found | 404 BundleNotFoundError |
| Bundle already SEALED | 409 BundleAlreadySealedError |
| Bundle locked | 423 BundleLockedError |

### sealNextOpenBundleBatch(runId)

| Condition | Response |
|-----------|----------|
| Sealed successfully | `{sealed: true, bundleId, result}` |
| No eligible bundle | `{sealed: false, reason: 'no_candidate'}` |
| Error | `{sealed: false, reason: 'error', error}` |

## Test Coverage

- **Unit Tests**: 29 tests (hasher + errors)
- **Integration Tests**: 10 tests (service + repository)
- **Total**: 39 tests passing

## Files Created

```
apps/api/src/modules/calc-preview/diagnostics/object-store/bundle-seal/
├── bundle-seal.types.ts
├── bundle-seal.hasher.ts
├── bundle-seal.errors.ts
├── bundle-seal.repository.ts
├── bundle-seal.service.ts
├── index.ts
└── __tests__/
    ├── bundle-seal.hasher.spec.ts
    ├── bundle-seal.errors.spec.ts
    └── bundle-seal.integration.spec.ts
```
