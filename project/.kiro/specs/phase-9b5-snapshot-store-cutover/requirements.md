# Phase 9B.5 — Snapshot Store Interface Cutover

## Overview

Phase 9B.5 consolidates all snapshot operations behind a single `ISnapshotStore` interface, eliminating direct `InMemorySnapshotStore` usage in production paths. This is a prerequisite for Phase 9C (Evidence Bundle → S3/MinIO).

## User Stories

### US-1: Single Source of Truth for Snapshots
**As a** platform developer  
**I want** all snapshot operations to go through a single interface  
**So that** storage backend changes don't require code changes in consumers

**Acceptance Criteria:**
- [ ] `ISnapshotStore` interface defines all snapshot operations
- [ ] `SnapshotStoreService` implements `ISnapshotStore`
- [ ] All consumers inject `ISnapshotStore` (not concrete implementations)
- [ ] No direct `InMemorySnapshotStore` imports in production code

### US-2: Production Safety Gate
**As a** platform operator  
**I want** InMemorySnapshotStore blocked in production  
**So that** no durable evidence is accidentally stored in volatile memory

**Acceptance Criteria:**
- [ ] `SNAPSHOT_STORE_BACKEND` env var controls backend selection
- [ ] `SNAPSHOT_STORE_BACKEND=inmemory` + `NODE_ENV=production` → startup hard fail
- [ ] Startup log clearly shows which backend is active
- [ ] No silent fallback to InMemory ever

### US-3: Tenant Isolation Enforcement
**As a** security engineer  
**I want** tenant isolation enforced at interface level  
**So that** cross-tenant access is impossible regardless of implementation

**Acceptance Criteria:**
- [ ] All `ISnapshotStore` methods require `tenantId` parameter
- [ ] Wrong tenant operations return `SNAPSHOT_NOT_FOUND` (not `ACCESS_DENIED`)
- [ ] Integration tests verify cross-tenant isolation

### US-4: Idempotent Snapshot Creation
**As a** API consumer  
**I want** duplicate snapshot creation to be safe  
**So that** retries don't cause data corruption

**Acceptance Criteria:**
- [ ] `(tenantId, incidentId, runId, calcHash)` is unique
- [ ] Duplicate insert returns `SNAPSHOT_ALREADY_EXISTS` error
- [ ] Original snapshot is not modified on duplicate attempt

### US-5: Immutability Flag Protection
**As a** compliance officer  
**I want** LEGAL_HOLD, PROMOTED, and BASELINE snapshots protected  
**So that** evidence integrity is guaranteed

**Acceptance Criteria:**
- [ ] `ISnapshotStore.delete()` rejects immutable snapshots
- [ ] Immutability flags can only be upgraded (never downgraded)
- [ ] Integration tests verify immutable protection

## Non-Functional Requirements

### NFR-1: No Data Migration
- Existing InMemory data is NOT migrated
- New snapshots go to Postgres after cutover
- This is acceptable because InMemory is volatile anyway

### NFR-2: Shadow Compare (Optional, P1)
- `SNAPSHOT_STORE_SHADOW_COMPARE=true` enables dual-write
- Primary: Postgres, Secondary: InMemory (compare only)
- Drift detection via metrics, no hard fail
- Default: `false`

### NFR-3: Backward Compatibility
- Existing tests using `InMemorySnapshotStore` continue to work
- Test-only usage is allowed and encouraged
- No breaking changes to test infrastructure

## Out of Scope

- Evidence Bundle storage (Phase 9C)
- S3/MinIO integration (Phase 9C)
- Cleanup orchestrator changes (already uses separate interface)
- Data migration from InMemory to Postgres

## Dependencies

- Phase 9B LOCKED (PostgreSQL Truth Layer)
- Phase 11 LOCKED (Cleanup Orchestration)

## Risks

| Risk | Mitigation |
|------|------------|
| Consumer code still imports InMemory | Lint rule + code review |
| Silent fallback | Hard fail on startup |
| Test breakage | Keep InMemory for test context |
