# Phase 9B.5 Idempotency Architecture

**Status:** FINAL (Integration Tested)  
**Date:** 2026-01-23

---

## Why This Cannot Be Reversed

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DB-LEVEL ENFORCED IDEMPOTENCY                            │
│                                                                             │
│  This is NOT a design decision. It is a PHYSICAL CONSTRAINT.                │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                      │   │
│  │   Application Code                                                   │   │
│  │        │                                                             │   │
│  │        │ INSERT (tenant, incident, run, hash)                        │   │
│  │        ▼                                                             │   │
│  │   ┌─────────────────────────────────────────────────────────────┐   │   │
│  │   │              PostgreSQL Unique Index                         │   │   │
│  │   │                                                              │   │   │
│  │   │   uq_sim_snap_idempotency                                    │   │   │
│  │   │   ON (tenant_id, incident_id, COALESCE(run_id), calc_hash)   │   │   │
│  │   │                                                              │   │   │
│  │   │   ┌──────────────────────────────────────────────────────┐  │   │   │
│  │   │   │  Duplicate?  ──YES──►  P2002 ERROR (REJECTED)        │  │   │   │
│  │   │   │      │                                               │  │   │   │
│  │   │   │      NO                                              │  │   │   │
│  │   │   │      │                                               │  │   │   │
│  │   │   │      ▼                                               │  │   │   │
│  │   │   │  INSERT SUCCEEDS                                     │  │   │   │
│  │   │   └──────────────────────────────────────────────────────┘  │   │   │
│  │   │                                                              │   │   │
│  │   │  This check happens BEFORE application code sees the data.   │   │   │
│  │   │  No amount of application code can bypass this.              │   │   │
│  │   └──────────────────────────────────────────────────────────────┘   │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  IRREVERSIBILITY:                                                           │
│  - Index exists in production → duplicates physically impossible            │
│  - Removing index requires DBA access + explicit DROP INDEX                 │
│  - Any DROP INDEX would be caught in audit logs                             │
│  - Phase 9C evidence bundles depend on this guarantee                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Dual-Layer Idempotency Model

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CALLER (SimulationEngine)                         │
│                                                                             │
│  createSnapshot({                                                           │
│    snapshotId: uuid(),      ← Layer 1: Caller-generated PK                  │
│    tenantId, incidentId,                                                    │
│    runId?,                  ← Optional (NULL → '__NO_RUN__' sentinel)       │
│    calcHash                 ← Layer 2: Content fingerprint                  │
│  })                                                                         │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SnapshotStoreService                                │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ VALIDATION (Pre-Insert)                                              │   │
│  │                                                                      │   │
│  │  ✓ runId !== '__NO_RUN__'  (sentinel reserved)                       │   │
│  │  ✓ calcHash is 64 hex chars (SHA256)                                 │   │
│  │  ✓ tenantId non-empty                                                │   │
│  │  ✓ incidentId non-empty                                              │   │
│  │  ✓ 0 ≤ driftScore ≤ 1                                                │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       PrismaSnapshotRepository                              │
│                                                                             │
│  INSERT INTO simulation_snapshots (...)                                     │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ ON P2002 (Unique Violation)                                          │   │
│  │                                                                      │   │
│  │  1. Check target constraint name                                     │   │
│  │  2. If PK conflict → findUnique(snapshotId) → return existing        │   │
│  │  3. If content conflict → findFirst(tenant,incident,run,hash)        │   │
│  │  4. If baseline conflict → throw BaselineAlreadyExistsError          │   │
│  │  5. Fallback: try both queries                                       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PostgreSQL                                        │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ TABLE: simulation_snapshots                                          │   │
│  │                                                                      │   │
│  │  snapshot_id   VARCHAR  PRIMARY KEY  ← Layer 1                       │   │
│  │  tenant_id     VARCHAR  NOT NULL                                     │   │
│  │  incident_id   VARCHAR  NOT NULL                                     │   │
│  │  run_id        VARCHAR  NULL                                         │   │
│  │  calc_hash     VARCHAR  NOT NULL                                     │   │
│  │  ...                                                                 │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ INDEX: uq_sim_snap_idempotency (UNIQUE)  ← Layer 2                   │   │
│  │                                                                      │   │
│  │  ON (                                                                │   │
│  │    tenant_id,                                                        │   │
│  │    incident_id,                                                      │   │
│  │    COALESCE(run_id, '__NO_RUN__'),  ← NULL sentinel                  │   │
│  │    calc_hash                                                         │   │
│  │  )                                                                   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Idempotency Scenarios

```
┌────────────────────────────────────────────────────────────────────────────┐
│ SCENARIO 1: Caller Retry (Same snapshotId)                                 │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  Request 1: { snapshotId: "abc-123", ... }  ──► INSERT ──► SUCCESS         │
│                                                                            │
│  Request 2: { snapshotId: "abc-123", ... }  ──► INSERT ──► P2002 (PK)      │
│                                                    │                       │
│                                                    ▼                       │
│                                              findUnique("abc-123")         │
│                                                    │                       │
│                                                    ▼                       │
│                                              Return existing snapshot      │
│                                                                            │
│  Result: Same snapshot returned (idempotent)                               │
└────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────────┐
│ SCENARIO 2: Duplicate Content (Different snapshotId, Same Content)         │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  Request 1: { snapshotId: "abc-123", tenant: "T1", incident: "I1",         │
│               runId: "R1", calcHash: "HASH1" }                             │
│                                                                            │
│           ──► INSERT ──► SUCCESS                                           │
│                                                                            │
│  Request 2: { snapshotId: "xyz-789", tenant: "T1", incident: "I1",         │
│               runId: "R1", calcHash: "HASH1" }  ← Same content!            │
│                                                                            │
│           ──► INSERT ──► P2002 (uq_sim_snap_idempotency)                   │
│                    │                                                       │
│                    ▼                                                       │
│              findFirst(T1, I1, R1, HASH1)                                  │
│                    │                                                       │
│                    ▼                                                       │
│              Return snapshot "abc-123" (first one)                         │
│                                                                            │
│  Result: Original snapshot returned, no duplicate created                  │
└────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────────┐
│ SCENARIO 3: NULL runId Handling                                            │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  Request 1: { tenant: "T1", incident: "I1", runId: NULL, hash: "H1" }      │
│                                                                            │
│           ──► INSERT ──► SUCCESS                                           │
│               Index stores: (T1, I1, '__NO_RUN__', H1)                     │
│                                                                            │
│  Request 2: { tenant: "T1", incident: "I1", runId: NULL, hash: "H1" }      │
│                                                                            │
│           ──► INSERT ──► P2002 (same sentinel value)                       │
│                    │                                                       │
│                    ▼                                                       │
│              Return existing snapshot                                      │
│                                                                            │
│  Request 3: { tenant: "T1", incident: "I1", runId: "R1", hash: "H1" }      │
│                                                                            │
│           ──► INSERT ──► SUCCESS (different! runId differs)                │
│               Index stores: (T1, I1, 'R1', H1)                             │
│                                                                            │
│  Result: NULL runId treated as distinct value via sentinel                 │
└────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────────┐
│ SCENARIO 4: Concurrent Inserts (Race Condition)                            │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  Thread A: INSERT (T1, I1, R1, H1) ─┐                                      │
│  Thread B: INSERT (T1, I1, R1, H1) ─┼──► Race to DB                        │
│  Thread C: INSERT (T1, I1, R1, H1) ─┘                                      │
│                                                                            │
│  PostgreSQL serializes at index level:                                     │
│                                                                            │
│  Thread A: INSERT ──► SUCCESS (wins)                                       │
│  Thread B: INSERT ──► P2002 ──► findFirst ──► Return A's snapshot          │
│  Thread C: INSERT ──► P2002 ──► findFirst ──► Return A's snapshot          │
│                                                                            │
│  Result: Single row in DB, all callers get same snapshot                   │
└────────────────────────────────────────────────────────────────────────────┘
```

## Index Design Rationale

```
┌────────────────────────────────────────────────────────────────────────────┐
│ WHY COALESCE(run_id, '__NO_RUN__')?                                        │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  PostgreSQL treats NULL != NULL in unique indexes.                         │
│                                                                            │
│  Without COALESCE:                                                         │
│    (T1, I1, NULL, H1) ≠ (T1, I1, NULL, H1)  ← Both allowed! BAD!           │
│                                                                            │
│  With COALESCE:                                                            │
│    (T1, I1, '__NO_RUN__', H1) = (T1, I1, '__NO_RUN__', H1)  ← Blocked!     │
│                                                                            │
│  Sentinel value '__NO_RUN__' is:                                           │
│    - Forbidden as actual runId (validation rejects it)                     │
│    - Only appears in index via COALESCE                                    │
│    - Makes NULL runId behave like a real value for uniqueness              │
└────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────────┐
│ WHY INSERT-FIRST (No Pre-Check)?                                           │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  Anti-pattern (race condition):                                            │
│    1. SELECT ... WHERE (tenant, incident, run, hash)                       │
│    2. If not exists → INSERT                                               │
│    ⚠️ Gap between 1 and 2 allows duplicate!                                │
│                                                                            │
│  Correct pattern (atomic):                                                 │
│    1. INSERT (let DB enforce uniqueness)                                   │
│    2. On P2002 → SELECT existing                                           │
│    ✓ No race condition, DB guarantees atomicity                            │
└────────────────────────────────────────────────────────────────────────────┘
```

## Test Coverage Matrix

| Test Case | Layer | Constraint | Expected Behavior |
|-----------|-------|------------|-------------------|
| Same snapshotId twice | 1 | PK | Return existing |
| Same content, different snapshotId | 2 | uq_sim_snap_idempotency | Return existing |
| Different hash, same tenant/incident/run | 2 | - | Both allowed |
| Same content, different tenant | 2 | - | Both allowed (tenant isolation) |
| NULL runId twice | 2 | COALESCE sentinel | Return existing |
| NULL vs non-NULL runId | 2 | - | Both allowed (different values) |
| 5 concurrent inserts | 2 | uq_sim_snap_idempotency | Single row |

## Production Deployment Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ STEP 1: Pre-Deployment Check                                                │
│                                                                             │
│  SELECT tenant_id, incident_id,                                             │
│         COALESCE(run_id, '__NO_RUN__') as run_key,                          │
│         calc_hash, COUNT(*)                                                 │
│  FROM simulation_snapshots                                                  │
│  GROUP BY 1,2,3,4                                                           │
│  HAVING COUNT(*) > 1;                                                       │
│                                                                             │
│  Expected: 0 rows (no duplicates)                                           │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ STEP 2: Create Index CONCURRENTLY                                           │
│                                                                             │
│  ⚠️ DO NOT use Prisma migrate! (wraps in transaction)                       │
│                                                                             │
│  psql $DATABASE_URL -c "                                                    │
│    CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_sim_snap_idempotency   │
│    ON simulation_snapshots (                                                │
│      tenant_id,                                                             │
│      incident_id,                                                           │
│      COALESCE(run_id, '__NO_RUN__'),                                        │
│      calc_hash                                                              │
│    );"                                                                      │
│                                                                             │
│  CONCURRENTLY = no table lock, safe for production                          │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ STEP 3: Verify Index                                                        │
│                                                                             │
│  SELECT indexname, indexdef                                                 │
│  FROM pg_indexes                                                            │
│  WHERE tablename = 'simulation_snapshots'                                   │
│    AND indexname = 'uq_sim_snap_idempotency';                               │
│                                                                             │
│  Expected: 1 row with COALESCE in indexdef                                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ STEP 4: Mark Migration Applied                                              │
│                                                                             │
│  npx prisma migrate resolve --applied 20260121000000_phase_9b5_idempotency  │
│                                                                             │
│  This tells Prisma the migration is done without executing it               │
└─────────────────────────────────────────────────────────────────────────────┘

---

## Integration Test Proof (2026-01-23)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ TESTED AGAINST: PostgreSQL 16-alpine (Docker)                               │
│ DATABASE: truthlayer_test                                                   │
│ RESULT: 6/6 PASS                                                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ✓ PK idempotency              → Same snapshotId returns existing           │
│  ✓ Content idempotency         → Same content returns existing              │
│  ✓ Different content allowed   → Different hash creates new row             │
│  ✓ Tenant isolation            → Same content for different tenants OK      │
│  ✓ NULL runId via COALESCE     → Sentinel prevents NULL duplicates          │
│  ✓ Concurrent inserts          → 5 parallel → single row                    │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│ INDEX VERIFIED IN DATABASE:                                                 │
│                                                                             │
│  uq_sim_snap_idempotency ON simulation_snapshots USING btree                │
│  (tenant_id, incident_id, COALESCE(run_id, '__NO_RUN__'), calc_hash)        │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│ BUG FIXED DURING TESTING:                                                   │
│                                                                             │
│  P2002 handler updated to recognize PostgreSQL's column-based target        │
│  format (added coalesce and column combination checks)                      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 9C Foundation

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    WHY 9B.5 ENABLES 9C                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Phase 9C: Evidence Bundle → S3/MinIO                                       │
│                                                                             │
│  Evidence bundle integrity requires:                                        │
│                                                                             │
│  1. SNAPSHOT UNIQUENESS (9B.5 provides this)                                │
│     - Each snapshot has unique (tenant, incident, run, hash)                │
│     - No duplicate snapshots → no duplicate evidence pointers               │
│                                                                             │
│  2. HASH CHAIN INTEGRITY (9C will implement)                                │
│     - Bundle hash = f(snapshot.calcHash, items...)                          │
│     - If snapshot is unique, bundle pointer is unique                       │
│                                                                             │
│  3. ORPHAN DETECTION (9C will implement)                                    │
│     - S3 object exists but no DB pointer → orphan                           │
│     - DB pointer exists but no S3 object → broken chain                     │
│                                                                             │
│  WITHOUT 9B.5:                                                              │
│     - Duplicate snapshots → multiple bundles for same content               │
│     - Cleanup confusion: which bundle is canonical?                         │
│     - Legal hold: which snapshot owns the evidence?                         │
│                                                                             │
│  WITH 9B.5:                                                                 │
│     - One snapshot = one bundle = one evidence chain                        │
│     - Cleanup is deterministic                                              │
│     - Legal hold applies to single source of truth                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                    9C INVARIANTS (Preview)                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. "Bu write idempotent mi?"                                               │
│     - S3 PUT + DB pointer must be atomic or recoverable                     │
│     - Retry must not create duplicate objects                               │
│                                                                             │
│  2. "Hash chain kırılırsa sistem nasıl bağırıyor?"                          │
│     - Orphan detection: S3 object without DB pointer                        │
│     - Broken chain: DB pointer without S3 object                            │
│     - Both must be logged and alerted                                       │
│                                                                             │
│  3. "Partial failure deterministik mi?"                                     │
│     - Items written but manifest not written → recoverable                  │
│     - Manifest written but items missing → detectable                       │
│     - Rollback path must be deterministic                                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Summary

Phase 9B.5 establishes **DB-level enforced idempotency** that cannot be bypassed:

| Guarantee | Mechanism | Bypass Possible? |
|-----------|-----------|------------------|
| No duplicate snapshotId | Primary Key | No (DB enforced) |
| No duplicate content | Unique Index | No (DB enforced) |
| NULL runId handled | COALESCE sentinel | No (DB enforced) |
| Race condition safe | Insert-first pattern | No (atomic) |

**This is the foundation for Phase 9C evidence bundle integrity.**
```
