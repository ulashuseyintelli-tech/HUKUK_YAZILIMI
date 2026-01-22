# Phase 11 — Design

## Overview

SnapshotCleanupOrchestrator:
1. acquires distributed lock
2. discovers tenants from SimulationSnapshot table
3. filters tenants by allowlist/blocklist
4. processes up to maxTenantsPerRun tenants (bounded run)
5. calls deleteExpired(tenantId) (or dry-run)
6. emits metrics/logs + updates consecutive failure counters atomically

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        CLEANUP ORCHESTRATION                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────────────┐   │
│  │   Trigger    │───▶│ Distributed  │───▶│  SnapshotCleanupOrchestrator │   │
│  │ (Cron/API)   │    │    Lock      │    │                              │   │
│  └──────────────┘    └──────────────┘    │  1. listTenantsWithSnapshots │   │
│                                          │  2. apply allow/blocklist    │   │
│                                          │  3. for each tenant:         │   │
│                                          │     - deleteExpired(tenant)  │   │
│                                          │     - update failure state   │   │
│                                          │     - emit metrics/logs      │   │
│                                          └──────────────────────────────┘   │
│                                                        │                     │
│                                                        ▼                     │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                         ISnapshotStore                                │   │
│  │  - deleteExpired(tenantId) [uses buildDeletableWhere]                │   │
│  │  - countDeletable(tenantId) [uses buildDeletableWhere]               │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Components

### 1) TenantDiscovery

**Source of truth:** SimulationSnapshot table.

Interface:
- `listTenantsWithSnapshots(): Promise<string[]>`

Implementation:
- Prisma/repository: `SELECT DISTINCT tenantId FROM SimulationSnapshot ORDER BY tenantId ASC`

Notes:
- Must not depend on IncidentStore.
- Includes tenants even if they have no active incidents.
- Deterministic ordering (ASC) for predictable behavior.

### 2) Distributed Lock (bounded-run P0)

Requirement: prevent concurrent cleanup runs across multiple instances.

Interface:
- `acquireLock(lockKey, ttlMs): Promise<{ acquired: boolean, lockId?: string }>`
- `releaseLock(lockKey, lockId): Promise<void>`

Backend options:
- A) Redis SET NX PX
- B) DB advisory lock / lock table

#### TTL Safety (P0)

We DO NOT implement heartbeat renewal in P0. Instead, we enforce bounded runtime using `maxTenantsPerRun` (required).

Config:
- `maxTenantsPerRun` (required)
- `perTenantBudgetMs` (required, conservative estimate)
- `safetyMarginMs` (required, buffer for overhead)
- `lockTtlMs = maxTenantsPerRun * perTenantBudgetMs + safetyMarginMs`

Example:
- maxTenantsPerRun = 500
- perTenantBudgetMs = 750
- safetyMarginMs = 120000 (2 min)
- => lockTtlMs = 500 * 750 + 120000 = 495000ms (~8.25 min)

If a tenant exceeds `perTenantBudgetMs`, it is recorded as slow (log/metric), but the run continues to completion. Bounded run ensures lock TTL is never exceeded.

P1 may add heartbeat renewal and/or checkpointing.

### 3) Failure State (atomic updates)

We track consecutive failures per tenant.

Storage (DB-backed):
```sql
CREATE TABLE cleanup_failure_state (
  tenant_id VARCHAR(255) PRIMARY KEY,
  consecutive_failures INT NOT NULL DEFAULT 0,
  last_failed_at TIMESTAMP,
  last_error_code TEXT
);
```

Atomic operations (required):
```sql
-- incrementFailure(tenantId, errorCode)
INSERT INTO cleanup_failure_state (tenant_id, consecutive_failures, last_failed_at, last_error_code)
VALUES (:tenantId, 1, NOW(), :errorCode)
ON CONFLICT (tenant_id) DO UPDATE SET
  consecutive_failures = cleanup_failure_state.consecutive_failures + 1,
  last_failed_at = NOW(),
  last_error_code = :errorCode;

-- resetFailure(tenantId)
UPDATE cleanup_failure_state
SET consecutive_failures = 0
WHERE tenant_id = :tenantId;
```

Lock prevents concurrent runs, but atomicity is still required for correctness under edge timing and retries.

Threshold:
- Default: 3 consecutive failures
- Configurable via `CLEANUP_FAILURE_THRESHOLD`

### 4) Cleanup Execution (single source of truth for WHERE)

We must avoid drift between `deleteExpired` and dry-run `countDeletable`.

**Design rule:** A single query definition (single source of truth) must back both operations.

Implementation:
```typescript
// Repository method returns Prisma "where" object
function buildDeletableWhere(tenantId: string, now: Date): Prisma.SimulationSnapshotWhereInput {
  return {
    tenantId,
    expiresAt: { lt: now },
    retentionPolicy: { notIn: ['LEGAL_HOLD', 'PROMOTED'] },
    isBaseline: false,
  };
}

// deleteExpired uses buildDeletableWhere
async deleteExpired(tenantId: string): Promise<DeleteResult> {
  const where = buildDeletableWhere(tenantId, new Date());
  return this.prisma.simulationSnapshot.deleteMany({ where });
}

// countDeletable uses buildDeletableWhere
async countDeletable(tenantId: string): Promise<number> {
  const where = buildDeletableWhere(tenantId, new Date());
  return this.prisma.simulationSnapshot.count({ where });
}
```

### 5) SnapshotCleanupOrchestrator

Signature:
- `runOnce(options?: CleanupRunOptions): Promise<CleanupRunResult>`

CleanupRunOptions:
```typescript
interface CleanupRunOptions {
  dryRun?: boolean;
  tenantAllowlist?: string[];
  tenantBlocklist?: string[];
  emitPerTenantMetrics?: boolean;
  maxTenantsPerRun?: number; // required in P0; can default from config
}
```

Flow:
1. validate options and resolve effective config
2. acquire lock; if not acquired -> return `SKIPPED_LOCKED`
3. `runId = uuid()`
4. `tenants = listTenantsWithSnapshots()` (ordered ASC)
5. apply allowlist/blocklist precedence (allowlist first, then blocklist)
6. take first N tenants (N = maxTenantsPerRun)
7. for each tenant:
   - `validateTenantId(tenant)`
   - `startTime = now()`
   - try:
     - if dryRun: `deletableCount = countDeletable(tenant)`
     - else: `deletedCount = deleteExpired(tenant)`
     - `resetFailure(tenant)`
     - emit metrics/logs
   - catch (e):
     - `incrementFailure(tenant, errorCode)` atomically
     - emit failure metrics/logs
     - if `consecutiveFailures >= threshold`: emit threshold event
   - finally:
     - `duration = now() - startTime`
     - if `duration > perTenantBudgetMs`: emit slow tenant event
8. release lock
9. return run summary

### 6) Triggering

A) Internal scheduler: @nestjs/schedule + @Cron(expression)
   - gated by `CLEANUP_SCHEDULER_ENABLED=true`

B) External trigger endpoint:
   - `POST /internal/cleanup/run` (internal-ops only)
   - gated by `CLEANUP_TRIGGER_ENDPOINT_ENABLED=true`

Rule: enable either A or B in production, not both.

### 7) Deprecation of legacy SnapshotCleanupService

- Remove in-memory `cleanupInProgress` boolean
- Forward to orchestrator OR remove entirely
- Update tests accordingly

## Data Model Additions

### cleanup_failure_state (DB-backed failure tracking)

| Column | Type | Description |
|--------|------|-------------|
| tenant_id | VARCHAR(255) PK | Tenant identifier |
| consecutive_failures | INT | Count of consecutive failures |
| last_failed_at | TIMESTAMP | When last failure occurred |
| last_error_code | TEXT | Error code from last failure |

## Configuration

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| CLEANUP_SCHEDULER_ENABLED | boolean | false | Enable internal cron scheduler |
| CLEANUP_TRIGGER_ENDPOINT_ENABLED | boolean | false | Enable external trigger endpoint |
| CLEANUP_MAX_TENANTS_PER_RUN | number | 500 | Max tenants per run (required) |
| CLEANUP_PER_TENANT_BUDGET_MS | number | 750 | Expected max duration per tenant |
| CLEANUP_SAFETY_MARGIN_MS | number | 120000 | Buffer for lock TTL calculation |
| CLEANUP_FAILURE_THRESHOLD | number | 3 | Consecutive failures before alert |
| CLEANUP_PER_TENANT_METRICS_ENABLED | boolean | false | Enable high-cardinality metrics |

## Security Notes

- Tenant mismatch never exposed in error messages.
- External trigger endpoint requires internal-ops role.
- Per-tenant metrics are opt-in to avoid sensitive/high-cardinality leakage.

## Success Criteria

- [ ] One run processes up to maxTenantsPerRun tenants deterministically (ASC order).
- [ ] No cross-tenant deletion (integration test).
- [ ] No immutable deletion (integration test).
- [ ] Concurrent run prevented by distributed lock.
- [ ] Failure threshold emits signals.
- [ ] Slow tenant handling works without skip.
- [ ] buildDeletableWhere is single source of truth for delete/count queries.
