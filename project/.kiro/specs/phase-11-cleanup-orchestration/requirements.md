# Phase 11 — Snapshot Cleanup Orchestration

## Goal

Make snapshot cleanup production-correct, tenant-safe, multi-instance safe, and observable.

## Non-negotiables (P0)

1. **Tenant iteration is correct:**
   - Tenants must be discovered from SimulationSnapshot storage (NOT IncidentStore).
   - Cleanup must run for all tenants with snapshots, not only tenants with active incidents.

2. **Multi-instance safety:**
   - Cleanup must not run concurrently on multiple instances.
   - Use distributed lock (DB or Redis). In-memory flags are forbidden.

3. **Failure policy is not "silent best-effort":**
   - Per-tenant consecutive failure tracking must exist in P0.
   - Alert threshold must be defined and emitted as metric/log signal.
   - Failure state updates must be atomic (no read-modify-write races).

4. **Immutable protections remain enforced:**
   - Cleanup must never delete LEGAL_HOLD, PROMOTED, or BASELINE snapshots.
   - These protections must be enforced at repository query level AND covered by integration tests.

5. **Run time bounds are explicit:**
   - P0 must define either (A) lock renewal/heartbeat OR (B) bounded runs (maxTenantsPerRun required) such that TTL safety is provable.

## In scope

- Orchestrator that iterates tenants and runs deleteExpired(tenantId)
- Tenant discovery from SimulationSnapshot table (distinct tenantId)
- Distributed lock (with renewal OR bounded-run policy)
- Dry-run mode for safe rollout
- Allowlist/blocklist config for emergency control
- Observability: metrics + structured logs
- Deprecate/update old SnapshotCleanupService + tests

## Out of scope (later)

- Retention economics / tiered storage / compaction
- Admin UI/reporting beyond logs/metrics
- Checkpoint/resume across runs (P1)
- Graceful shutdown drain hooks (P1)

## Functional Requirements

### Tenant discovery

- Source of truth: SimulationSnapshot table.
- Provide method: `listTenantsWithSnapshots() -> tenantId[]`
- Must support allowlist/blocklist overrides (see precedence rules below).

### Allowlist / Blocklist precedence (explicit)

Let T be discovered tenants from storage.

1. If allowlist is provided and non-empty:
   - `candidates = T ∩ allowlist`
2. Else:
   - `candidates = T`

Then, if blocklist is provided and non-empty:
- `candidates = candidates \ blocklist`

**Result:** allowlist narrows first, blocklist excludes last.

### Tenant ordering (explicit)

Tenants are processed in deterministic order: `ORDER BY tenantId ASC`.

This ensures:
- Predictable behavior across runs
- Easy debugging (same order = same logs)
- Fair distribution when combined with checkpoint/resume (P1)

### Orchestrator run modes

- `runOnce({ dryRun?: boolean, tenantAllowlist?: string[], tenantBlocklist?: string[], maxTenantsPerRun?: number })`
- dryRun: compute and report what would be deleted; must not mutate.

### Scheduling / triggering

- Support internal scheduler (@nestjs/schedule Cron) AND external trigger (secure endpoint or job runner).
- Only one may be enabled at a time in production (config gate).

### Failure policy (P0)

- Track consecutive failures per tenant with atomic updates.
- On threshold breach:
  - Emit metric + structured log event.
  - Policy must be explicit (no silent skip).

### Slow tenant policy (P0)

- A tenant is "slow" if cleanup duration exceeds `perTenantBudgetMs`.
- Slow tenants are NOT skipped; cleanup runs to completion.
- Slow tenant event is logged and metric emitted: `snapshot_cleanup_tenant_slow_total`.
- If slow tenants cause lock TTL risk, bounded run (`maxTenantsPerRun`) prevents expiry.

## Observability Requirements (P0)

### Metrics (aggregate, no tenant labels)

- `snapshot_cleanup_runs_total{status}`
- `snapshot_cleanup_duration_ms`
- `snapshot_cleanup_tenants_processed_total{status}`
- `snapshot_cleanup_deleted_total`
- `snapshot_cleanup_skipped_immutable_total{reason}`
- `snapshot_cleanup_failures_total`
- `snapshot_cleanup_failure_threshold_total`
- `snapshot_cleanup_tenant_slow_total`

### Metrics (per-tenant, opt-in)

- `snapshot_cleanup_tenant_deleted_total{tenantId}`
- `snapshot_cleanup_tenant_failures_total{tenantId}`

Per-tenant metrics must be gated by config to avoid high-cardinality surprises.

### Logs (structured)

- run start/end: `runId, dryRun, tenantsPlanned, tenantsProcessed, durationMs, status`
- tenant result: `runId, tenantId, deletedCount, skippedImmutableCount, durationMs, status, errorCode`
- failure escalation: `tenantId, consecutiveFailures, threshold, lastErrorCode`
- slow tenant: `runId, tenantId, durationMs, perTenantBudgetMs`

## Acceptance Criteria (P0)

- [ ] Orchestrator lists tenants from snapshots table (ORDER BY tenantId ASC).
- [ ] deleteExpired(tenantId) is called for each discovered tenant (subject to allow/block rules).
- [ ] Distributed lock prevents concurrent runs across instances.
- [ ] Run time bound policy is implemented (renewal OR bounded run).
- [ ] Integration test proves no cross-tenant deletion and immutable protections.
- [ ] Consecutive failure counter works via atomic update and emits threshold alerts.
- [ ] Slow tenant handling logs/metrics without skip.
- [ ] Old cleanup service does not call outdated signatures; tests updated or deprecated.
