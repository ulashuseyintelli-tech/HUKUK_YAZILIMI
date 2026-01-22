# Task 3: Unique Constraint (Idempotency) — Design Document

## Phase 9B.5 — Snapshot Store Cutover

**Status:** READY FOR REVIEW  
**Author:** Kiro  
**Date:** 2026-01-21

---

## 1. Problem Statement

### Threat Model
- Multi-instance deployment → iki pod aynı anda "yokmuş" diye görüp insert edebilir
- Caller retry → aynı mantıksal snapshot tekrar gönderilirse duplicate oluşur
- App-level check → yarış koşuluna yenilir, DB unique = fizik kanunu

### Why Now?
Phase 9C'de S3/MinIO evidence bundle yazınca:
- snapshotId ve hash zinciri "kanıt" oluyor
- Duplicate snapshot → iki farklı bundle pointer
- Cleanup/retention/legal hold akışları çelişir
- **Sonuç:** Unique constraint = kanıt zincirinin kilidi

---

## 2. Design Decision: Dual-Layer Idempotency

### Layer 1: Primary Key (snapshotId)
```
snapshotId String @id
```
- Caller provides snapshotId
- Same snapshotId = same logical snapshot
- PK violation → fetch existing, return it
- **Guarantees:** Retry safety for deterministic callers

### Layer 2: Content-Based Unique Index
```sql
CREATE UNIQUE INDEX uq_sim_snap_idempotency 
ON simulation_snapshots (
  tenant_id,
  incident_id,
  COALESCE(run_id, '__NO_RUN__'),
  calc_hash
);
```
- Same content = same snapshot (even with different snapshotId)
- COALESCE handles NULL runId problem
- **Guarantees:** Content dedupe for non-deterministic callers

### Why Both Layers?
| Scenario | Layer 1 (PK) | Layer 2 (Content) |
|----------|--------------|-------------------|
| Caller retry with same snapshotId | ✅ Catches | ✅ Catches |
| Caller generates new snapshotId each time | ❌ Misses | ✅ Catches |
| Different caller, same content | ❌ Misses | ✅ Catches |
| Race condition (2 pods) | ✅ One wins | ✅ One wins |

---

## 3. The NULL Problem

### PostgreSQL Behavior
```sql
-- These are considered DIFFERENT (NULL != NULL)
INSERT (tenant1, incident1, NULL, hash1)  -- succeeds
INSERT (tenant1, incident1, NULL, hash1)  -- ALSO succeeds! ❌
```

### Solution: COALESCE Sentinel
```sql
COALESCE(run_id, '__NO_RUN__')
```
- `__NO_RUN__` is a sentinel value that cannot appear in real data
- runId is UUID format → `__NO_RUN__` is impossible
- Alternative sentinel: `'∅'` (empty set symbol) — even safer

### Why Not Make runId Required?
- Breaking change for all callers
- Some snapshots legitimately have no run (ad-hoc calculations)
- COALESCE is cleaner and backward compatible

---

## 4. Schema Changes

### A) Raw SQL Migration
```sql
-- Migration: 20260121_add_snapshot_idempotency_index.sql

-- Content-based idempotency index
-- Handles NULL runId via COALESCE sentinel
CREATE UNIQUE INDEX IF NOT EXISTS uq_sim_snap_idempotency 
ON simulation_snapshots (
  tenant_id,
  incident_id,
  COALESCE(run_id, '__NO_RUN__'),
  calc_hash
);

-- Comment for documentation
COMMENT ON INDEX uq_sim_snap_idempotency IS 
  'Phase 9B.5 Task 3: Content-based idempotency. COALESCE handles NULL runId. Sentinel __NO_RUN__ cannot appear in real UUID data.';
```

### B) Prisma Schema Update (Documentation Only)
```prisma
model SimulationSnapshot {
  // ... existing fields ...
  
  // NOTE: Content-based idempotency enforced via raw SQL index
  // uq_sim_snap_idempotency ON (tenant_id, incident_id, COALESCE(run_id, '__NO_RUN__'), calc_hash)
  // See migration: 20260121_add_snapshot_idempotency_index.sql
  
  @@map("simulation_snapshots")
}
```

---

## 5. Application Behavior

### createSnapshot() — Insert-First Pattern

```typescript
async insert(snapshot: SnapshotInput): Promise<Snapshot> {
  try {
    // 1. Try INSERT
    const created = await this.prisma.simulationSnapshot.create({
      data: { ... }
    });
    return this.mapToEntity(created);
    
  } catch (error) {
    // 2. Handle unique violation
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        // Determine which constraint was violated
        const target = (error.meta?.target as string[]) ?? [];
        
        // PK violation (snapshotId)
        if (target.includes('snapshot_id')) {
          const existing = await this.prisma.simulationSnapshot.findUnique({
            where: { snapshotId: snapshot.snapshotId }
          });
          if (existing) return this.mapToEntity(existing);
        }
        
        // Content index violation (uq_sim_snap_idempotency)
        if (target.includes('uq_sim_snap_idempotency') || target.length === 0) {
          const existing = await this.prisma.simulationSnapshot.findFirst({
            where: {
              tenantId: snapshot.tenantId,
              incidentId: snapshot.incidentId,
              runId: snapshot.runId ?? null,
              calcHash: snapshot.calcHash,
            }
          });
          if (existing) return this.mapToEntity(existing);
        }
        
        // Fallback: baseline unique constraint
        if (snapshot.isBaseline) {
          throw new BaselineAlreadyExistsError(...);
        }
      }
    }
    
    // 3. Other errors → bubble up
    throw this.handlePrismaError(error, 'insert');
  }
}
```

### Key Points
- **Insert-first:** Try insert, handle conflict — fastest path for new data
- **No pre-check:** Avoids race condition between check and insert
- **Idempotent return:** Same input → same output (existing snapshot)
- **No breaking change:** Return type stays `Promise<Snapshot>`

---

## 6. Error Classification

| Error Code | Meaning | Recovery |
|------------|---------|----------|
| P2002 + PK | Same snapshotId exists | Fetch & return existing |
| P2002 + content index | Same content exists | Fetch & return existing |
| P2002 + baseline index | Second baseline for incident | Throw BaselineAlreadyExistsError |
| Other P2002 | Unknown constraint | Bubble up |
| Other errors | DB failure | Bubble up as DatabaseUnavailableError |

---

## 7. Test Plan

### Unit Tests (Repository Layer)
```typescript
describe('PrismaSnapshotRepository.insert idempotency', () => {
  // Test 1: Same snapshotId twice → returns existing
  it('returns existing snapshot when snapshotId already exists');
  
  // Test 2: Same content twice (different snapshotId) → returns existing
  it('returns existing snapshot when content matches');
  
  // Test 3: Same tenant/incident/run + different hash → two rows
  it('allows different hash for same tenant/incident/run');
  
  // Test 4: Different tenant + same other fields → two rows
  it('allows same content for different tenants');
  
  // Test 5: Different incident + same hash → two rows
  it('allows same hash for different incidents');
  
  // Test 6: NULL runId twice with same content → single row
  it('handles NULL runId idempotency via COALESCE');
});
```

### Integration Tests (Real DB)
```typescript
describe('Snapshot idempotency integration', () => {
  // Test 7: Concurrent create (Promise.all) → single row
  it('handles concurrent inserts correctly', async () => {
    const input = createTestInput();
    
    // Fire 5 concurrent inserts
    const results = await Promise.all([
      repository.insert({ ...input, snapshotId: uuid() }),
      repository.insert({ ...input, snapshotId: uuid() }),
      repository.insert({ ...input, snapshotId: uuid() }),
      repository.insert({ ...input, snapshotId: uuid() }),
      repository.insert({ ...input, snapshotId: uuid() }),
    ]);
    
    // All should return same snapshot (first one wins)
    const uniqueIds = new Set(results.map(r => r.snapshotId));
    expect(uniqueIds.size).toBe(1);
    
    // DB should have exactly 1 row
    const count = await prisma.simulationSnapshot.count({
      where: { tenantId: input.tenantId, incidentId: input.incidentId }
    });
    expect(count).toBe(1);
  });
});
```

---

## 8. Sentinel Value Safety

### Why `__NO_RUN__` is Safe
- runId is UUID format: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`
- `__NO_RUN__` cannot be a valid UUID
- Even if someone tries to use it, validation should reject

### Defense in Depth
```typescript
// In SnapshotInput validation
if (input.runId === '__NO_RUN__') {
  throw new SnapshotValidationError(
    'runId',
    'runId cannot be the sentinel value __NO_RUN__'
  );
}
```

---

## 9. Migration Strategy

### Step 1: Create Index — Environment Strategy

**CRITICAL:** `CREATE INDEX CONCURRENTLY` cannot run inside a transaction.
Prisma migrations may wrap SQL in transactions depending on configuration.

**Strategy:**
- **Dev/Test:** Normal `CREATE UNIQUE INDEX` in Prisma migration (acceptable lock)
- **Production:** Manual ops step with `CONCURRENTLY` (no downtime)

```sql
-- DEV/TEST (Prisma migration - may lock briefly)
CREATE UNIQUE INDEX IF NOT EXISTS uq_sim_snap_idempotency 
ON simulation_snapshots (
  tenant_id,
  incident_id,
  COALESCE(run_id, '__NO_RUN__'),
  calc_hash
);

-- PRODUCTION (Manual ops step - no lock)
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_sim_snap_idempotency 
ON simulation_snapshots (
  tenant_id,
  incident_id,
  COALESCE(run_id, '__NO_RUN__'),
  calc_hash
);
```

**Ops Runbook Entry:**
```bash
# Production index creation (run manually before deploy)
psql $DATABASE_URL -c "CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_sim_snap_idempotency ON simulation_snapshots (tenant_id, incident_id, COALESCE(run_id, '__NO_RUN__'), calc_hash);"
```

### Step 2: Verify No Duplicates (BEFORE Index Creation)
```sql
-- Check for existing duplicates before index creation
SELECT tenant_id, incident_id, COALESCE(run_id, '__NO_RUN__') as run_key, calc_hash, COUNT(*)
FROM simulation_snapshots
GROUP BY tenant_id, incident_id, COALESCE(run_id, '__NO_RUN__'), calc_hash
HAVING COUNT(*) > 1;
```
- If duplicates exist, resolve manually before index creation
- Index creation will fail if duplicates exist

### Step 2b: Duplicate Resolution Strategy (If Needed)

If pre-check finds duplicates:

1. **Report duplicates with details:**
```sql
SELECT tenant_id, incident_id, COALESCE(run_id, '__NO_RUN__') as run_key, calc_hash, 
       COUNT(*) as dup_count,
       array_agg(snapshot_id ORDER BY created_at ASC) as snapshot_ids
FROM simulation_snapshots
GROUP BY tenant_id, incident_id, COALESCE(run_id, '__NO_RUN__'), calc_hash
HAVING COUNT(*) > 1;
```

2. **Winner selection:** Keep the OLDEST snapshot (first `created_at`)
   - Rationale: First insert is the "original" — later ones are duplicates

3. **Safe deletion (only STANDARD, non-baseline):**
```sql
-- DRY RUN: Show what would be deleted
WITH duplicates AS (
  SELECT snapshot_id,
         ROW_NUMBER() OVER (
           PARTITION BY tenant_id, incident_id, COALESCE(run_id, '__NO_RUN__'), calc_hash
           ORDER BY created_at ASC
         ) as rn,
         retention_policy, is_baseline
  FROM simulation_snapshots
)
SELECT * FROM duplicates 
WHERE rn > 1 
  AND retention_policy = 'STANDARD' 
  AND is_baseline = false;

-- ACTUAL DELETE (after review)
WITH duplicates AS (
  SELECT snapshot_id,
         ROW_NUMBER() OVER (
           PARTITION BY tenant_id, incident_id, COALESCE(run_id, '__NO_RUN__'), calc_hash
           ORDER BY created_at ASC
         ) as rn,
         retention_policy, is_baseline
  FROM simulation_snapshots
)
DELETE FROM simulation_snapshots 
WHERE snapshot_id IN (
  SELECT snapshot_id FROM duplicates 
  WHERE rn > 1 
    AND retention_policy = 'STANDARD' 
    AND is_baseline = false
);
```

4. **Protected duplicates:** If duplicate has `LEGAL_HOLD`, `PROMOTED`, or `is_baseline=true`:
   - DO NOT auto-delete
   - Manual review required
   - Document in incident report

### Step 3: Update Application Code
- Deploy P2002 handling code
- No downtime required

---

## 10. DONE Criteria

- [x] Raw SQL migration created and applied
- [x] Unique index `uq_sim_snap_idempotency` exists in DB
- [x] `insert()` handles P2002 with fetch-existing pattern
- [x] Sentinel validation added (reject `__NO_RUN__` as runId)
- [x] Unit tests (sentinel validation) passing
- [x] Integration tests (7 cases including concurrent insert) created
- [ ] Documentation in PHASE-9B5-LOCK.md (Task 4)

---

## 11. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Existing duplicates block index creation | Pre-check query, manual resolution |
| Sentinel collision | UUID validation rejects non-UUID values |
| P2002 meta.target varies by Prisma version | Fallback to content-based fetch |
| Index creation locks table | Use CONCURRENTLY |

---

## 12. Future Considerations

### Optional: `created` Flag
```typescript
interface CreateSnapshotResult {
  snapshot: SimulationSnapshot;
  created: boolean;
}
```
- Nice-to-have for metrics/logging
- Not P0 — can add later without breaking change
- Current contract: `createSnapshot() → SimulationSnapshot`

### Optional: Upsert Pattern
- Not recommended for immutable snapshots
- Insert-first is cleaner for audit trail

---

## Approval

**Design approved by:** [Pending]  
**Implementation start:** After approval  
**Target completion:** Task 3 DONE
