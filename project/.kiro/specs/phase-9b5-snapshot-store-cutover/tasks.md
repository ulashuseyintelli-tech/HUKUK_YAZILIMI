# Phase 9B.5 — Tasks

## 9B.5.1 — Interface & Provider Foundation (P0)

- [x] 1. Define ISnapshotStore interface ✅ ALREADY EXISTS
  - [x] 1.1 Create `snapshot-store.interface.ts` with full contract
  - [x] 1.2 Define `SNAPSHOT_STORE` injection token
  - [x] 1.3 Define all error codes (SNAPSHOT_NOT_FOUND, ALREADY_EXISTS, etc.)
  - [x] 1.4 Define supporting types (CreateSnapshotParams, Snapshot, ListOptions)
  - [ ] 1.5 Unit test: interface type compilation check

- [x] 2. Production safety gate ✅ DONE
  - [x] 2.1 Add `SNAPSHOT_STORE_BACKEND` env var support
  - [x] 2.2 Implement startup hard fail: inmemory + production = Error
  - [x] 2.3 Add startup log showing active backend
  - [x] 2.4 Unit test: hard fail scenario (33 tests passing)
  - [x] 2.5 Unit test: postgres selection in prod

- [x] 3. SnapshotStoreService implements ISnapshotStore ✅ ALREADY EXISTS
  - [x] 3.1 Implement createSnapshot with validation
  - [x] 3.2 Implement findById with tenant isolation
  - [x] 3.3 Implement findByIncidentId
  - [x] 3.4 Implement findBaseline
  - [ ] 3.5 Implement list with pagination (NOT YET)
  - [x] 3.6 Implement promoteToBaseline
  - [x] 3.7 Implement applyLegalHold
  - [ ] 3.8 Implement removeLegalHold (NOT YET)
  - [x] 3.9 Implement deleteExpired with immutability check
  - [x] 3.10 Retention policy integration via repository

## 9B.5.2 — Database & Repository (P0)

- [x] 4. Add unique constraint for idempotency ✅ DONE (Task 3)
  - [x] 4.1 Create raw SQL migration: uq_sim_snap_idempotency with COALESCE for NULL runId
  - [x] 4.2 Verify existing indexes from Phase 9B
  - [x] 4.3 P2002 handling: duplicate insert returns existing snapshot (idempotent)
  - [x] 4.4 Sentinel validation: reject `__NO_RUN__` as runId
  - [x] 4.5 Unit tests for sentinel validation (snapshot-store-service.spec.ts)
  - [x] 4.6 Integration tests for idempotency (snapshot-idempotency.integration.spec.ts)

- [x] 5. Update PrismaSnapshotRepository ✅ DONE
  - [x] 5.1 Handle P2002 unique constraint violation → fetch existing, return idempotent
  - [x] 5.2 Ensure all queries include tenantId in WHERE
  - [x] 5.3 Add isImmutable computed property (via legalHold/isBaseline checks)

## 9B.5.3 — Consumer Migration (P0)

- [x] 6. Migrate BaselineResolverService ✅ ALREADY DONE
  - [x] 6.1 Replace InMemorySnapshotStore with ISnapshotStore injection
  - [x] 6.2 Update method calls to new interface
  - [ ] 6.3 Update unit tests with mock ISnapshotStore
  - [ ] 6.4 Verify existing behavior unchanged

- [x] 7. Migrate EvidenceBundleService ✅ ALREADY DONE
  - [x] 7.1 Replace InMemorySnapshotStore with ISnapshotStore injection
  - [x] 7.2 Update method calls to new interface
  - [ ] 7.3 Update unit tests with mock ISnapshotStore
  - [ ] 7.4 Verify existing behavior unchanged

- [x] 8. Migrate LegalHoldInventoryService ✅ ALREADY DONE
  - [x] 8.1 Replace InMemorySnapshotStore with ISnapshotStore injection
  - [x] 8.2 Update method calls to new interface
  - [ ] 8.3 Update unit tests with mock ISnapshotStore
  - [ ] 8.4 Verify existing behavior unchanged

- [x] 9. Migrate LegalHoldController ✅ ALREADY DONE
  - [x] 9.1 Replace InMemorySnapshotStore with ISnapshotStore injection
  - [x] 9.2 Update method calls to new interface
  - [ ] 9.3 Update controller tests
  - [ ] 9.4 Verify existing behavior unchanged

- [x] 10. Update simulation-api.module.ts ✅ ALREADY DONE
  - [x] 10.1 Import TruthLayerModule
  - [x] 10.2 Remove direct InMemorySnapshotStore provider
  - [ ] 10.3 Verify DI wiring works

## 9B.5.4 — Integration Tests (P0)

- [ ] 11. Interface contract tests
  - [ ] 11.1 Test: createSnapshot happy path
  - [ ] 11.2 Test: createSnapshot duplicate → SNAPSHOT_ALREADY_EXISTS
  - [ ] 11.3 Test: findById wrong tenant → null (not error)
  - [ ] 11.4 Test: promoteToBaseline happy path
  - [ ] 11.5 Test: promoteToBaseline duplicate → BASELINE_ALREADY_EXISTS
  - [ ] 11.6 Test: applyLegalHold happy path
  - [ ] 11.7 Test: delete immutable → CANNOT_DELETE_IMMUTABLE
  - [ ] 11.8 Test: delete normal → success

- [ ] 12. Cross-tenant isolation tests
  - [ ] 12.1 Test: tenantA cannot read tenantB snapshot
  - [ ] 12.2 Test: tenantA cannot delete tenantB snapshot
  - [ ] 12.3 Test: tenantA cannot apply legal hold to tenantB snapshot
  - [ ] 12.4 Test: wrong tenant returns SNAPSHOT_NOT_FOUND (not ACCESS_DENIED)

- [ ] 13. Retention policy integration tests
  - [ ] 13.1 Test: STANDARD retention → correct expiresAt
  - [ ] 13.2 Test: EXTENDED retention → correct expiresAt
  - [ ] 13.3 Test: PERMANENT retention → expiresAt = null

## 9B.5.5 — Cleanup & Documentation (P0)

- [ ] 14. InMemory usage audit
  - [ ] 14.1 Grep codebase for InMemorySnapshotStore imports
  - [ ] 14.2 Verify all prod paths use ISnapshotStore
  - [ ] 14.3 Document allowed InMemory contexts (test only)

- [x] 15. Create PHASE-9B5-LOCK.md ✅ DONE
  - [x] 15.1 Document all locks (interface contract, prod safety, etc.)
  - [x] 15.2 Document allowed/forbidden changes
  - [x] 15.3 Add sign-off section

- [ ] 16. Update Yapılacaklar.txt
  - [ ] 16.1 Mark Phase 9B.5 as LOCKED
  - [ ] 16.2 Update architecture diagram

## 9B.5.6 — Shadow Compare (P1, Optional)

- [ ]* 17. Shadow compare mode
  - [ ]* 17.1 Add SNAPSHOT_STORE_SHADOW_COMPARE env var
  - [ ]* 17.2 Implement dual-write (Postgres primary, InMemory secondary)
  - [ ]* 17.3 Implement read comparison
  - [ ]* 17.4 Add drift detection metric
  - [ ]* 17.5 Test: drift detected → metric emitted, no fail

## Definition of Done

- All P0 tasks complete (9B.5.1 - 9B.5.5)
- All consumers use ISnapshotStore (no direct InMemory in prod)
- Production safety gate enforced (startup hard fail)
- Unique constraint for idempotency in place
- Cross-tenant isolation proven by tests
- PHASE-9B5-LOCK.md created and signed

## Estimated Effort

**GOOD NEWS:** Most of Phase 9B.5 is already implemented!

| Section | Status | Remaining Effort |
|---------|--------|------------------|
| 9B.5.1 Interface & Provider | 100% done | ✅ Complete |
| 9B.5.2 Database & Repository | 70% done | 2-3 hours (unique constraint) |
| 9B.5.3 Consumer Migration | 90% done | 1-2 hours (test updates) |
| 9B.5.4 Integration Tests | 0% done | 3-4 hours |
| 9B.5.5 Cleanup & Documentation | 0% done | 2-3 hours |
| **Total P0 Remaining** | | **8-12 hours (~1-1.5 days)** |
| 9B.5.6 Shadow Compare (P1) | 0% done | 4-6 hours |

### Key Remaining Tasks

1. ~~**Production Safety Gate** (Task 2) — CRITICAL~~ ✅ DONE
   - ~~Add `SNAPSHOT_STORE_BACKEND` env var~~
   - ~~Hard fail on inmemory + production~~

2. **Unique Constraint** (Task 4) — CRITICAL
   - Prisma migration for idempotency
   - Handle duplicate insert error

3. **Integration Tests** (Tasks 11-13) — REQUIRED
   - Contract tests
   - Cross-tenant isolation tests
   - Retention policy tests

4. **PHASE-9B5-LOCK.md** (Task 15) — REQUIRED
   - Document locks and allowed changes
