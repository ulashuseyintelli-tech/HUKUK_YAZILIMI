# Phase 9B Lock Document

**Status**: LOCKED  
**Locked At**: 2026-01-18  
**Lock Owner**: Phase 9B PostgreSQL Migration

---

## Lock Scope

This document defines what is LOCKED and what is ALLOWED after Phase 9B completion.

### 🔒 LOCKED (Breaking Changes Forbidden)

#### 1. Database Schema

```sql
-- SimulationRun table structure
CREATE TABLE simulation_runs (
  run_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  incident_id TEXT NOT NULL,
  scenario_id TEXT NOT NULL,
  seed INTEGER NOT NULL,
  simulation_version TEXT NOT NULL,
  engine_version TEXT,
  status SimulationRunStatus NOT NULL,
  started_at TIMESTAMP NOT NULL,
  finished_at TIMESTAMP,
  current_snapshot_id TEXT,
  baseline_snapshot_id TEXT,
  error_code TEXT,
  error_message TEXT
);

-- SimulationSnapshot table structure
CREATE TABLE simulation_snapshots (
  snapshot_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  incident_id TEXT NOT NULL,
  run_id TEXT,
  snapshot_kind SimulationSnapshotKind NOT NULL,
  is_baseline BOOLEAN NOT NULL DEFAULT FALSE,
  verdict TEXT NOT NULL,
  drift_score DECIMAL(10,6) NOT NULL,
  calc_result JSONB NOT NULL,
  calc_result_norm JSONB NOT NULL,
  calc_hash TEXT NOT NULL,
  retention_policy TEXT DEFAULT 'STANDARD',
  expires_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Partial unique index (CRITICAL)
CREATE UNIQUE INDEX ux_sim_snap_one_baseline_per_incident 
  ON simulation_snapshots (tenant_id, incident_id) 
  WHERE is_baseline = TRUE;
```

**Forbidden Changes:**
- ❌ Removing columns
- ❌ Changing column types
- ❌ Removing the partial unique index
- ❌ Adding unique constraints that could break existing data
- ❌ Changing enum values (SimulationRunStatus, SimulationSnapshotKind)

#### 2. Repository Contracts

**ISimulationRunRepository:**
- `upsert(run: SimulationRunInput): Promise<SimulationRun>`
- `updateStatus(runId, status, finishedAt?): Promise<void>`
- `setCurrentSnapshot(runId, snapshotId): Promise<void>`
- `setBaselineSnapshot(runId, snapshotId): Promise<void>`
- `findById(runId): Promise<SimulationRun | null>`
- `findByIncidentId(incidentId, options?): Promise<PaginatedRunsResult>`
- `findLatestByIncidentId(incidentId): Promise<SimulationRun | null>`
- `countByIncidentId(incidentId): Promise<number>`
- `countByTenantId(tenantId, date?): Promise<number>`

**ISnapshotRepository:**
- `insert(snapshot: SnapshotInput): Promise<Snapshot>`
- `markAsBaseline(snapshotId): Promise<void>`
- `applyLegalHold(snapshotId, reason?): Promise<ApplyLegalHoldResult>`
- `setRetentionPolicy(snapshotId, policy): Promise<SetRetentionPolicyResult>`
- `findById(snapshotId): Promise<Snapshot | null>`
- `findByIncidentId(incidentId): Promise<Snapshot[]>`
- `findBaseline(incidentId): Promise<Snapshot | null>`
- `findByRunId(runId): Promise<Snapshot[]>`
- `findWithLegalHold(tenantId?): Promise<Snapshot[]>`
- `getLegalHoldStats(tenantId?): Promise<LegalHoldStats>`

**Forbidden Changes:**
- ❌ Changing method signatures
- ❌ Removing methods
- ❌ Changing return types
- ❌ Changing error types thrown

#### 3. Truth Layer Invariants

| Invariant | Enforcement | Location |
|-----------|-------------|----------|
| Single baseline per incident | Partial unique index | DB |
| Status monotonicity | STATUS_RANK check | App layer |
| Immutable fields on upsert | verifyImmutableFields() | App layer |
| Snapshot insert-only | No UPDATE on insert | App layer |
| Retention upgrade-only | RETENTION_RANK check | App layer |
| Baseline upgrade-only | isBaseline: false→true only | App layer |
| Legal hold upgrade-only | legalHold: false→true only | App layer |
| Incident/tenant mismatch | Transaction validation | App layer |
| Run COMPLETED for baseline | Status check | App layer |

**Forbidden Changes:**
- ❌ Relaxing any invariant
- ❌ Adding fallback paths that bypass invariants
- ❌ Removing validation checks

#### 4. Service Layer Rules

**SimulationRunStoreService:**
- ✅ Thin orchestration layer only
- ✅ Delegates to ISimulationRunRepository
- ✅ Emits metrics
- ❌ No Map, no in-memory storage
- ❌ No clear() method
- ❌ No business logic (repo handles invariants)

**SnapshotStoreService:**
- ✅ Thin orchestration layer only
- ✅ Delegates to ISnapshotRepository
- ✅ Validates calcHash/calcResultNorm presence
- ❌ No hash calculation (determinism.ts only)
- ❌ No Map, no in-memory storage

**TruthLayerModule:**
- ✅ onModuleInit: SELECT 1 health check
- ✅ Fail fast if DB unavailable
- ❌ No in-memory fallback

#### 5. Hash Calculation Rule

```
calcHash = canonicalHash(calcResultNorm)
         = SHA256(canonicalStringify(calcResultNorm))
```

**Single Source of Truth:** `determinism.ts`

**Forbidden:**
- ❌ Calculating hash anywhere else
- ❌ Store services calculating hash
- ❌ Repositories calculating hash

---

### ✅ ALLOWED (Non-Breaking Changes)

#### 1. Index Additions

```sql
-- ALLOWED: Non-unique indexes for performance
CREATE INDEX idx_sim_run_tenant_date ON simulation_runs (tenant_id, started_at);
CREATE INDEX idx_sim_snap_run ON simulation_snapshots (run_id);
```

**Rules:**
- ✅ Non-unique indexes only
- ✅ Must not change query semantics
- ❌ Unique indexes forbidden (could break existing data)

#### 2. Bug Fixes

- ✅ Fixing incorrect error messages
- ✅ Fixing edge cases in validation
- ✅ Fixing metric emission
- ❌ Changing invariant behavior

#### 3. Metric Additions

- ✅ Adding new metrics
- ✅ Adding new metric tags
- ❌ Removing existing metrics

#### 4. Logging Improvements

- ✅ Adding log statements
- ✅ Improving log messages
- ✅ Adding structured log fields

#### 5. New Query Methods

- ✅ Adding new read-only query methods to repositories
- ❌ Changing existing method signatures

---

## Shadow Compare Metrics (Phase 9B → 9C Transition)

During transition, these metrics track in-memory vs DB consistency:

| Metric | Type | Description |
|--------|------|-------------|
| `truth_shadow_hash_match` | Counter | Hash matches between in-memory and DB |
| `truth_shadow_drift_detected` | Counter | Hash mismatches detected |
| `truth_shadow_latency_delta_ms` | Histogram | Latency difference (DB - in-memory) |

**Mismatch Log Format:**
```json
{
  "event": "truth_shadow_mismatch",
  "runId": "sim_1.0.0_abc12345",
  "snapshotId": "snap_xyz",
  "incidentId": "inc_123",
  "tenantId": "tenant_456",
  "inMemoryHash": "abc...",
  "dbHash": "def...",
  "timestamp": "2026-01-18T12:00:00Z"
}
```

---

## Verification Checklist

Before any change to Phase 9B code, verify:

- [ ] Does this change any locked schema?
- [ ] Does this change any repository contract?
- [ ] Does this relax any invariant?
- [ ] Does this add fallback/bypass logic?
- [ ] Does this calculate hash outside determinism.ts?

If ANY answer is YES → **CHANGE FORBIDDEN**

---

## Integration Test Coverage

33 tests covering all invariants:

- ✅ Immutable field protection (2 tests)
- ✅ Status monotonicity (4 tests)
- ✅ Baseline uniqueness (3 tests)
- ✅ Incident/tenant mismatch (3 tests)
- ✅ Retention upgrade-only (3 tests)
- ✅ CRUD operations (18 tests)

**Test File:** `persistence/__tests__/prisma-repositories.integration.spec.ts`

---

## Phase 9B.5 — Snapshot Store Interface Cutover (Pre-9C)

Before Phase 9C, the following cleanup is REQUIRED:

### Tasks

1. **Create/extend ISnapshotStore interface** ✅ DONE
2. **Make SnapshotStoreService implement ISnapshotStore** ✅ DONE
3. **Migrate all consumers to interface:** ✅ DONE
   - BaselineResolverService
   - EvidenceBundleService
   - LegalHoldInventoryService
   - LegalHoldController
   - simulation-api.module.ts (DI wiring)
4. **Keep InMemorySnapshotStore for tests/shadow-compare only** ✅ DONE
5. **Add shadow-compare metrics (drift/hash/latency)** ⏳ DEFERRED (Phase 9C)

### Lock Rules (After 9B.5)

| Rule | Description |
|------|-------------|
| Prod InMemorySnapshotStore | ❌ FORBIDDEN (test only) |
| Shadow-compare decisions | DB is source of truth, in-memory for comparison only |

---

## Phase 9B.6 — Migration Lock (Kapanış Kilitleri)

**Status**: ✅ COMPLETE  
**Completed At**: 2026-01-20  
**Test Count**: 299 tests passing

### Implemented Locks

| # | Lock | Status | Evidence |
|---|------|--------|----------|
| 1 | Snapshot ordering centralization | ✅ DONE | `snapshot-ordering.ts` - `compareForBaseline()`, `compareForDisplay()` |
| 2 | Prisma tenant isolation test | ✅ DONE | `prisma-repositories.integration.spec.ts` - cross-tenant sızıntı testleri |
| 3 | extractPoints CI guard | ✅ DONE | `extract-points-guard.spec.ts` - `.points` erişim kontrolü |
| 4 | NOT_FOUND response standardization | ✅ DONE | `simulation-error.types.ts` - SNAPSHOT_NOT_FOUND eklendi |
| 5 | Internal-ops audit log | ✅ DONE | `evidence-bundle.controller.ts` - structured audit logging |
| 6 | archivedSnapshots teknik borç | ✅ DONE | TODO(Phase-10) etiketi eklendi |
| 7 | PHASE-9B-LOCK.md güncelleme | ✅ DONE | Bu dosya |
| 8 | Kapanış commit | ⏳ PENDING | `chore(phase-9b.5): lock tenant isolation, ordering, and error contracts (299 tests)` |

### Lock Details

#### Lock 1: Snapshot Ordering (`snapshot-ordering.ts`)

Centralized comparator functions for deterministic snapshot ordering:

```typescript
// Baseline selection: LEGAL_HOLD > PROMOTED > STANDARD, then date DESC, then ID ASC
compareForBaseline(a, b): number

// Display ordering: date DESC, then ID ASC
compareForDisplay(a, b): number

// Helpers
sortForBaseline(snapshots): T[]
sortForDisplay(snapshots): T[]
selectBestBaseline(snapshots): T | null
```

**Consumers:**
- `BaselineResolverService` - uses `selectBestBaseline()`
- `LegalHoldInventoryService` - uses `sortForDisplay()`

#### Lock 2: Tenant Isolation Tests

Integration tests verifying cross-tenant isolation:

```typescript
// Same incidentId, different tenants → no leakage
describe('tenant isolation behavior', () => {
  it('findByIncidentId returns only tenant A snapshots')
  it('findBaseline returns only tenant A baseline')
  it('findWithLegalHold returns only tenant A legal holds')
})
```

#### Lock 3: extractPoints CI Guard

Test that catches direct `.points` access in production code:

```typescript
// Allowlist: calc-result-projection.ts, snapshot-ordering.ts, test files
// Pattern: \.points\b
// Forbidden: snapshot.points, result.points (use extractPoints() instead)
```

#### Lock 4: Error Code Contract

Stable error codes (API contract - DO NOT CHANGE):

| Code | HTTP | Description |
|------|------|-------------|
| SIMULATION_DISABLED | 503 | Feature flag off |
| INCIDENT_NOT_FOUND | 404 | Incident doesn't exist or tenant mismatch |
| SNAPSHOT_NOT_FOUND | 404 | Snapshot doesn't exist or tenant mismatch |
| RUN_NOT_FOUND | 404 | Simulation run doesn't exist |
| BUNDLE_NOT_FOUND | 404 | Evidence bundle doesn't exist |
| FORBIDDEN_TENANT_SCOPE | 403 | Cross-tenant access denied |
| SIMULATION_ALREADY_RUNNING | 409 | Concurrent simulation conflict |
| TOO_MANY_SIMULATIONS | 429 | Rate limit exceeded |
| CANNOT_ARCHIVE_BASELINE | 409 | Baseline protection |

#### Lock 5: Internal-Ops Audit

All internal-ops actions logged with structured fields:

```typescript
interface InternalOpsAuditEntry {
  event: 'internal_ops_access';
  opsUserId: string;
  targetTenantId: string;
  incidentId: string;
  runId?: string;
  bundleId?: string;
  action: 'export_bundle' | 'get_bundle' | 'verify_bundle';
  timestamp: string;
  success: boolean;
  errorCode?: string;
}
```

#### Lock 6: archivedSnapshots Technical Debt

```typescript
// ✅ RESOLVED in Phase 10
// Archive state is now DB-backed (archivedAt, archivedBy, archivedReason)
// Multi-instance safe, durable across restarts
// See: Phase 10 section below
```

---

## Phase 9C Dependencies

Phase 9C (Object Storage) depends on Phase 9B and 9B.5:

1. **Snapshot data** → Stored in PostgreSQL (Phase 9B)
2. **Legal hold status** → Managed by Phase 9B
3. **Retention policy** → Enforced by Phase 9B
4. **Baseline selection** → Determined by Phase 9B
5. **InMemorySnapshotStore cleanup** → Phase 9B.5 COMPLETE

Phase 9C MUST NOT:
- Bypass Phase 9B invariants
- Store authoritative data outside PostgreSQL
- Calculate hashes independently
- Use InMemorySnapshotStore in prod paths

---

## Rollback Procedure

If Phase 9B needs rollback:

1. **Stop application**
2. **Run rollback migration** (if schema changed)
3. **Revert code to pre-9B**
4. **Restart with in-memory stores**

⚠️ **Data Loss Warning:** Rollback loses all PostgreSQL data. Export critical data before rollback.

---

## Sign-Off

| Role | Name | Date |
|------|------|------|
| Author | Kiro | 2026-01-18 |
| Reviewer | - | - |
| Approver | - | - |

---

## Phase 9B Completion Summary

**Status**: ✅ COMPLETE

**Test Results**:
- Integration tests: 33 passed (all Truth Layer invariants)
- Simulation tests: 299 passed (all suites)
- TypeScript compilation: No errors in Phase 9B files

**Files Created/Modified**:
- `persistence/truth-layer-errors.ts` - Domain errors
- `persistence/simulation-run-repository.interface.ts` - Run repo contract
- `persistence/snapshot-repository.interface.ts` - Snapshot repo contract
- `persistence/prisma-simulation-run.repository.ts` - Prisma implementation
- `persistence/prisma-snapshot.repository.ts` - Prisma implementation
- `persistence/snapshot-store.service.ts` - NEW store service
- `persistence/truth-layer.module.ts` - NEW module
- `persistence/index.ts` - Barrel export
- `simulation-api/simulation-run-store.service.ts` - REFACTORED
- `simulation-api/simulation-api.module.ts` - Updated DI wiring
- `prisma/schema.prisma` - Added models
- `prisma/migrations/20260118000000_phase_9b_truth_layer/` - Migration

**Phase 9B.5 Files (Consumer Migration)**:
- `persistence/snapshot-store.interface.ts` - ISnapshotStore interface
- `simulation/baseline-resolver.service.ts` - Tenant-aware, uses ISnapshotStore
- `simulation/legal-hold-inventory.service.ts` - Tenant-aware, uses ISnapshotStore
- `simulation/evidence-bundle.service.ts` - Tenant-aware, uses ISnapshotStore
- `simulation-api/legal-hold.controller.ts` - Tenant-aware HTTP layer
- `simulation-api/evidence-bundle.controller.ts` - Internal-ops audit logging

**Phase 9B.6 Files (Migration Lock)**:
- `simulation/snapshot-ordering.ts` - Centralized comparators
- `simulation/__tests__/extract-points-guard.spec.ts` - CI guard test
- `persistence/__tests__/prisma-repositories.integration.spec.ts` - Tenant isolation tests
- `simulation-api/simulation-error.types.ts` - SNAPSHOT_NOT_FOUND error code

**Remaining Work for Phase 9C**:
- Object storage integration
- Shadow-compare metrics (optional)


---

## Phase 10 — Archived State Persistence + Cleanup Job Hardening

**Status**: ✅ COMPLETE  
**Started At**: 2026-01-20  
**Completed At**: 2026-01-21

### Goals

1. **Archived state persistence**: `archivedSnapshots: Set<string>` → DB-backed (`archivedAt`, `archivedBy`, `archivedReason`)
2. **Multi-instance safe**: Archive state durable across restarts and deployments
3. **Cleanup job hardening**: Mathematically impossible to delete protected snapshots

### Completed Steps

#### Step 10.1 — DB Migration ✅ DONE

Added to `SimulationSnapshot` model in Prisma schema:
- `archivedAt DateTime?`
- `archivedBy String?`
- `archivedReason String?`
- Index: `ix_sim_snap_tenant_policy_archived`

#### Step 10.2 — Repository/Store API ✅ DONE

**snapshot-repository.interface.ts:**
- Added `archivedAt`, `archivedBy`, `archivedReason` to `Snapshot` interface
- Added `MarkArchivedInput` and `MarkArchivedResult` types
- Added `markArchived()` method to `ISnapshotRepository`
- Updated `findWithLegalHold()` to accept `{ includeArchived?: boolean }` option

**prisma-snapshot.repository.ts:**
- Implemented `markArchived()` method
- Updated `findWithLegalHold()` to filter by `archivedAt IS NULL` by default
- Updated `mapToEntity()` to include archived fields

**snapshot-store.interface.ts:**
- Added archived fields to `SimulationSnapshot`
- Added `MarkArchivedInput` and `MarkArchivedResult` types
- Added `markArchived()` method to `ISnapshotStore`

**snapshot-store.service.ts:**
- Implemented `markArchived()` with tenant isolation
- Updated `mapToSimulationSnapshot()` to include archived fields

#### Step 10.3 — LegalHoldInventoryService Refactor ✅ DONE

- Removed in-memory `archivedSnapshots: Set<string>`
- Updated `buildEntry()` to read archived state from DB
- Updated `listLegalHolds()` to exclude archived snapshots
- Updated `listLegalHoldsByIncident()` to exclude archived snapshots
- Updated `archiveLegalHold()` to use DB via store
- Changed `isArchived()` from sync to async (reads from DB)

#### Step 10.4 — Controller & Audit ✅ DONE

- Updated `archiveLegalHold()` to pass actor/reason to service
- Updated `ArchiveResponseDto` to include `archivedAt`
- Updated `LegalHoldEntry` type to include archive metadata

### Remaining Steps

#### Step 10.5 — Cleanup Job ✅ DONE

Implemented delete criteria with "dokunulmazlar" (untouchables):
- `retentionPolicy = 'LEGAL_HOLD'` → never delete (no expiresAt)
- `retentionPolicy = 'PROMOTED'` → never delete
- `isBaseline = true` → never delete
- Tenant iteration logic via `deleteExpired(tenantId)`

Files:
- `snapshot-store.interface.ts` - Added `deleteExpired()` and `DeleteExpiredResult`
- `snapshot-repository.interface.ts` - Added `deleteExpired()` and `DeleteExpiredResult`
- `snapshot-store.service.ts` - Implemented `deleteExpired()`
- `prisma-snapshot.repository.ts` - Implemented `deleteExpired()` with DB-level guard

#### Step 10.6 — Test Locks ✅ DONE

New tests in `phase-10-locks.spec.ts`:
- Lock 1: Archive persistence is DB-backed (2 tests)
- Lock 2: listLegalHolds excludes archived (2 tests)
- Lock 3: Cleanup job protects dokunulmazlar (5 tests)
- Lock 4: Cleanup job cross-tenant isolation (2 tests)
- Lock 5: Archive semantics (3 tests)

Total: 14 tests passing

### Archive Semantics (LOCKED)

| Rule | Description |
|------|-------------|
| Archive = soft-hide | DB flag only, does NOT change `retentionPolicy` |
| Legal hold preserved | `retentionPolicy` stays `LEGAL_HOLD` after archive |
| One-way operation | Cannot unarchive (by design) |
| Baseline protection | Baseline snapshots cannot be archived |
| Tenant isolation | Archive respects tenant boundaries |

### ⚠️ BREAKING BEHAVIOR CHANGE (Phase 10)

**PROMOTED snapshots are now protected (dokunulmazlar):**

| Before Phase 10 | After Phase 10 |
|-----------------|----------------|
| PROMOTED deleted after 168h | PROMOTED **never** deleted |
| Only LEGAL_HOLD protected | LEGAL_HOLD + PROMOTED + baseline protected |

**Impact:**
- Disk usage may grow over time
- Phase 11 should add capacity metrics and retention economics
- Cleanup job now returns `protectedBy.promoted` count

**Rationale:**
- PROMOTED = user explicitly marked as "important"
- Deleting user-marked snapshots is unexpected behavior
- Aligns with legal hold semantics (explicit > implicit)

### ⚠️ TODO: SnapshotCleanupService Migration

The legacy `SnapshotCleanupService` in `evidence/snapshot-cleanup.service.ts` uses:
- `ILegacySnapshotStore` (old interface)
- `deleteExpired()` without tenantId

**Phase 11 action required:**
- Migrate to `ISnapshotStore` with `deleteExpired(tenantId)`
- Add tenant iteration logic (get all tenants, loop)
- Or deprecate in favor of new cleanup job

### Files Modified (Phase 10)

- `prisma/schema.prisma` - Added archived fields
- `persistence/snapshot-repository.interface.ts` - Added markArchived
- `persistence/prisma-snapshot.repository.ts` - Implemented markArchived
- `persistence/snapshot-store.interface.ts` - Added markArchived
- `persistence/snapshot-store.service.ts` - Implemented markArchived
- `simulation/legal-hold-inventory.service.ts` - DB-backed archive
- `simulation/legal-hold-inventory.types.ts` - Added archive fields
- `simulation-api/legal-hold.controller.ts` - Pass actor/reason
- `simulation-api/simulation.dto.ts` - Added archivedAt to response
- `simulation-api/__tests__/mock-snapshot-store.ts` - Added markArchived

### Test Results (Phase 10)

- Legal hold inventory tests: 40 passed
- Legal hold controller tests: 37 passed (77 total legal-hold tests)
- Phase 10 lock tests: 14 passed
- TypeScript compilation: No errors (except Prisma client needs regeneration)

### Commit Message

```
chore(phase-10): archived state persistence + cleanup job hardening (131 tests)

- DB-backed archive state (archivedAt, archivedBy, archivedReason)
- Multi-instance safe, durable across restarts
- Cleanup job with dokunulmazlar (untouchables) protection
- LEGAL_HOLD, PROMOTED, baseline snapshots never deleted
- Tenant isolation on cleanup
- 14 new Phase 10 lock tests
```


---

## Phase 11 Entry Framework

### Priority Order

| Priority | Item | Rationale |
|----------|------|-----------|
| 1 | **Cleanup Job Migration** | `deleteExpired(tenantId)` implemented but no production caller |
| 2 | **Cleanup Observability** | Metrics meaningless without working job |
| 3 | **Retention Economics** | PROMOTED never deleted → disk growth management |
| 4 | **Admin Surface** | Audit log export/dashboard |

### Phase 11.1 — Cleanup Job Migration (Recommended First)

**Current State:**
- `SnapshotCleanupService` uses `ILegacySnapshotStore.deleteExpired()` (no tenantId)
- New `ISnapshotStore.deleteExpired(tenantId)` implemented but unused in production

**Required Work:**
1. Create tenant iteration service (get all active tenants)
2. New cleanup job that loops tenants and calls `deleteExpired(tenantId)`
3. Deprecate or remove `SnapshotCleanupService`
4. Add cleanup metrics (deleted, protected, duration per tenant)

**Test Lock:**
- Cleanup job MUST NOT run without valid tenantId
- Cleanup job MUST log protected counts

### Phase 11.2 — Cleanup Observability

**Metrics to Add:**
- `snapshot_cleanup_deleted_total{tenant}` - Counter
- `snapshot_cleanup_protected_total{tenant,reason}` - Counter (reason: legal_hold, promoted, baseline)
- `snapshot_cleanup_duration_seconds{tenant}` - Histogram
- `snapshot_storage_bytes{tenant,policy}` - Gauge

### Phase 11.3 — Retention Economics

**PROMOTED Capacity Management:**
- PROMOTED never deleted → unbounded growth possible
- Add `promoted_snapshot_count{tenant}` metric
- Consider: PROMOTED → LEGAL_HOLD auto-upgrade after N days?
- Consider: Admin alert when PROMOTED count exceeds threshold

### Architecture Diagram (Post Phase 10)

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Snapshot Lifecycle                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  CREATE ──► STANDARD ──┬──► PROMOTED ──┬──► LEGAL_HOLD             │
│              (72h TTL)  │    (∞ TTL)    │    (∞ TTL)                │
│                         │               │                           │
│                         │               └──► ARCHIVED (soft-hide)   │
│                         │                    (still LEGAL_HOLD)     │
│                         │                                           │
│  ┌─────────────────────┴───────────────────────────────────────┐   │
│  │                    CLEANUP JOB                               │   │
│  │  deleteExpired(tenantId) → only STANDARD non-baseline       │   │
│  │                                                              │   │
│  │  DOKUNULMAZLAR (never deleted):                             │   │
│  │  ├─ LEGAL_HOLD (no expiresAt)                               │   │
│  │  ├─ PROMOTED (Phase 10 change)                              │   │
│  │  └─ isBaseline = true                                       │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Test Matrix (Phase 10 Complete)

| Test Suite | Count | Status |
|------------|-------|--------|
| phase-10-locks.spec.ts | 14 | ✅ |
| legal-hold-inventory.spec.ts | 40 | ✅ |
| legal-hold.controller.spec.ts | 37 | ✅ |
| legal-hold.spec.ts | 13 | ✅ |
| promotion-workflow.spec.ts | 21 | ✅ |
| **Total** | **125** | ✅ |
