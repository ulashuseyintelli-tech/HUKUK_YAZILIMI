# Phase 11 — Tasks

## 11.0a — Orchestrator Foundation (P0)

- [x] 1. Tenant discovery from snapshots table
  - [x] 1.1 Add repository method `listDistinctTenantIds()` with ORDER BY tenantId ASC
  - [x] 1.2 Unit test: returns only tenants present in snapshots table
  - [x] 1.3 Unit test: returns tenants in ascending order

- [x] 2. Distributed lock implementation (P0)
  - [x] 2.1 Choose backend: Redis or DB lock
  - [x] 2.2 Implement `acquireLock(lockKey, ttlMs)` with SET NX PX or DB advisory
  - [x] 2.3 Implement `releaseLock(lockKey, lockId)`
  - [x] 2.4 Add required config: maxTenantsPerRun, perTenantBudgetMs, safetyMarginMs
  - [x] 2.5 Implement TTL calculation: `lockTtlMs = maxTenantsPerRun * perTenantBudgetMs + safetyMarginMs`
  - [x] 2.6 Test: lock acquired once
  - [x] 2.7 Test: second run returns SKIPPED_LOCKED

- [x] 3. Single source of truth for deletable criteria (P0)
  - [x] 3.1 Implement `buildDeletableWhere(tenantId, now)` returning Prisma where clause
  - [x] 3.2 Refactor `deleteExpired(tenantId)` to use buildDeletableWhere
  - [x] 3.3 Implement `countDeletable(tenantId)` using buildDeletableWhere
  - [x] 3.4 Unit test: buildDeletableWhere output used by both methods (same where clause structure)
  - [x] 3.5 Unit test: countDeletable returns same count as would be deleted

- [x] 4. SnapshotCleanupOrchestrator skeleton (P0)
  - [x] 4.1 Implement `runOnce(options)` method signature
  - [x] 4.2 Implement `validateTenantId(tenant)` - reject empty/null/undefined
  - [x] 4.3 Implement allowlist/blocklist precedence (allowlist first, then blocklist)
  - [x] 4.4 Implement bounded run: process only first maxTenantsPerRun tenants
  - [x] 4.5 Wire dry-run mode (calls countDeletable instead of deleteExpired)
  - [x] 4.6 Test: allowlist narrows tenant set
  - [x] 4.7 Test: blocklist excludes from narrowed set

## 11.0b — Correctness + Integration Locks (P0)

- [x] 5. Wire per-tenant cleanup calls
  - [x] 5.1 Implement tenant iteration loop with deleteExpired(tenantId) calls
  - [x] 5.2 Ensure no default/unknown tenant fallback exists
  - [x] 5.3 Test: each discovered tenant gets deleteExpired called

- [x] 6. Failure policy in P0 (atomic consecutive failures)
  - [x] 6.1 Add cleanup_failure_state table (Prisma migration)
  - [x] 6.2 Implement atomic `incrementFailure(tenantId, errorCode)` with UPSERT
  - [x] 6.3 Implement `resetFailure(tenantId)`
  - [x] 6.4 Implement threshold check and signal emission
  - [x] 6.5 Test: fail N times -> threshold event emitted
  - [x] 6.6 Test: success resets counter to 0
  - [x] 6.7 Test: atomic increment under concurrent calls (if applicable)

- [x] 7. Slow tenant handling (P0)
  - [x] 7.1 Track per-tenant duration
  - [x] 7.2 Compare against perTenantBudgetMs
  - [x] 7.3 Emit slow tenant log event
  - [x] 7.4 Emit `snapshot_cleanup_tenant_slow_total` metric
  - [x] 7.5 Test: slow tenant is logged but NOT skipped

- [x] 8. Update/Deprecate legacy SnapshotCleanupService + tests
  - [x] 8.1 Remove `cleanupInProgress` boolean from legacy service (marked @deprecated)
  - [x] 8.2 Forward legacy service to orchestrator OR delete entirely (N+1/N+2 timeline)
  - [x] 8.3 Update snapshot-cleanup.spec.ts for new behavior
  - [x] 8.4 Remove expectations tied to old API/signature

- [x] 9. Integration tests (CI locks)
  - [x] 9.1 Seed DB with tenantA + tenantB snapshots:
    - deletable expired STANDARD
    - immutable LEGAL_HOLD
    - immutable PROMOTED
    - immutable baseline (if exists)
  - [x] 9.2 Assert: tenantA run deletes only tenantA deletable
  - [x] 9.3 Assert: tenantB run deletes only tenantB deletable when processed
  - [x] 9.4 Assert: immutables never deleted (LEGAL_HOLD, PROMOTED, baseline)
  - [x] 9.5 Assert: cross-tenant leakage absent
  - [x] 9.6 Assert: lock prevents parallel run
  - [x] 9.7 Assert: dry-run does not mutate any data

## 11.1 — Observability Enhancements (P1)

- [ ] 10. Metrics implementation
  - [ ] 10.1 Implement aggregate metrics (no tenant labels)
  - [ ] 10.2 Implement optional per-tenant metrics gated by config
  - [ ] 10.3 Test: metric emission smoke tests

- [ ] 11. Structured logs
  - [ ] 11.1 Implement run summary log (start/end)
  - [ ] 11.2 Implement per-tenant result log
  - [ ] 11.3 Implement threshold event log
  - [ ] 11.4 Implement slow tenant log
  - [ ] 11.5 Ensure no sensitive payloads logged

- [ ] 12. Trigger mechanisms
  - [ ] 12.1 Implement internal Cron (@nestjs/schedule) gated by config
  - [ ] 12.2 Implement external trigger endpoint gated by config (internal-ops only)
  - [ ] 12.3 Test: endpoint forbidden without internal-ops role
  - [ ] 12.4 Test: endpoint respects lock (returns SKIPPED_LOCKED if locked)

## 11.2 — Nice-to-have (P1+)

- [ ]* 13. Graceful shutdown hook
  - [ ]* 13.1 Stop starting new tenant work on shutdown signal
  - [ ]* 13.2 Ensure lock released if possible

- [ ]* 14. Checkpoint/resume
  - [ ]* 14.1 Persist cursor (last processed tenantId)
  - [ ]* 14.2 Resume next run from checkpoint

- [ ]* 15. Metrics naming standard alignment
  - [ ]* 15.1 Align snapshot_cleanup_* with global metric naming conventions doc (if exists)
  - [ ]* 15.2 Add doc link to design.md

## Definition of Done

- All P0 tasks done (11.0a + 11.0b)
- Integration locks are in CI
- Old cleanup service cannot call outdated signature
- Bounded runs prevent lock TTL expiry without heartbeat
- Failure threshold signals exist and are test-covered
- Slow tenant handling works without skip
- buildDeletableWhere is proven single source of truth
