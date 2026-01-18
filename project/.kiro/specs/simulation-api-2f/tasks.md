# Implementation Plan: Simulation API 2F

## Overview

Sprint 2F exposes the simulation engine through REST endpoints with RBAC, rate limiting, and feature flag control. Implementation follows the "fastest end-to-end" order: guards first, then endpoints.

## Tasks

- [x] 1. Set up constants and feature flag service
  - [x] 1.1 Create simulation-rate-limit.constants.ts with SIMULATION_RATE_LIMITS and key builders
    - Define perIncident: 1, perTenantConcurrent: 5, daily: 100
    - Define key builder functions for all rate limit keys
    - Define getUtcDateString helper
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_
  
  - [x] 1.2 Create simulation-feature-flag.service.ts with isSimulationEnabled() helper
    - Check SIMULATION_ENABLED env var
    - Return false only when explicitly set to 'false'
    - _Requirements: 1.1_
  
  - [x] 1.3 Create simulation-error.types.ts with error codes and response types
    - Define SimulationErrorCode type
    - Define SimulationErrorResponse interface
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6_

- [x] 2. Implement Simulation RBAC Guard
  - [x] 2.1 Create simulation-rbac.guard.ts
    - Extract tenant context from request
    - Validate tenant-admin can only access own tenant
    - Allow internal-ops to access any tenant
    - Reject tenant-admin with tenantId override (403)
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_
  
  - [x] 2.2 Write property test for RBAC tenant isolation
    - **Property 8: RBAC Tenant Isolation**
    - **Validates: Requirements 4.1, 4.2**
  
  - [x] 2.3 Write property test for internal-ops cross-tenant access
    - **Property 9: Internal-Ops Cross-Tenant Access**
    - **Validates: Requirements 4.3**

- [x] 3. Implement Simulation Rate Limit Guard
  - [x] 3.1 Create simulation-rate-limit.guard.ts with IClock injection
    - Implement acquireToken and releaseToken methods
    - Check order: concurrent → incident → daily
    - Use in-memory maps for MVP (Redis-compatible interface)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.8, 3.9, 3.10_
  
  - [x] 3.2 Write property test for concurrent limit enforcement
    - **Property 4: Concurrent Limit Enforcement**
    - **Validates: Requirements 3.5**
  
  - [x] 3.3 Write unit test for per-incident limit with MockClock
    - Test 2nd request within 1 min → 429
    - Test request after 1 min → success
    - **Property 5: Per-Incident Limit Enforcement**
    - **Validates: Requirements 3.6**
  
  - [x] 3.4 Write unit test for daily limit with UTC reset
    - Test 101st request → 429
    - Test first request next UTC day → success
    - **Property 6: Daily Limit with UTC Reset**
    - **Validates: Requirements 3.7**
  
  - [x] 3.5 Write property test for token acquire/release round-trip
    - **Property 7: Token Acquire/Release Round-Trip**
    - **Validates: Requirements 3.8, 3.9**

- [x] 4. Checkpoint - Guards complete
  - Ensure all guard tests pass, ask the user if questions arise.

- [x] 5. Implement Feature Flag Guard
  - [x] 5.1 Create simulation-feature-flag.guard.ts
    - Check if endpoint is mutation (POST)
    - Return 503 for mutations when disabled
    - Allow reads regardless of flag
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_
  
  - [x] 5.2 Write property test for feature flag blocks mutations
    - **Property 1: Feature Flag Blocks Mutations**
    - **Validates: Requirements 1.2, 1.3, 1.4**
  
  - [x] 5.3 Write property test for feature flag allows reads
    - **Property 2: Feature Flag Allows Reads**
    - **Validates: Requirements 1.5, 1.6, 1.7**

- [x] 6. Implement Simulation Controller
  - [x] 6.1 Create simulation.controller.ts with POST /incidents/:id/simulate
    - Accept optional { scenarioId?, seed? }
    - Return { runId, verdict, driftScore, evidenceStatus, driftBlocked, evidenceGateReason? }
    - Apply guards: FeatureFlag, RBAC, RateLimit
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8_
  
  - [x] 6.2 Add GET /incidents/:id/runs endpoint
    - Accept query params: limit (default 20), cursor
    - Return run summaries ordered newest → oldest
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_
  
  - [x] 6.3 Add GET /incidents/:id/runs/latest endpoint
    - Return 200 OK with { latestRun: null } if no runs (NOT 404)
    - _Requirements: 7.1, 7.2, 7.3, 7.4_
  
  - [x] 6.4 Add GET /incidents/:id/runs/:runId endpoint
    - Return run summary (expandable for details)
    - _Requirements: 8.1, 8.2, 8.3, 8.4_
  
  - [x] 6.5 Write property test for run list ordering
    - **Property 12: Run List Ordering**
    - **Validates: Requirements 6.2**
  
  - [x] 6.6 Write unit tests for simulation controller endpoints
    - Test happy paths and error cases
    - _Requirements: 5.1-5.8, 6.1-6.5, 7.1-7.4, 8.1-8.4_

- [x] 7. Checkpoint - Simulation endpoints complete
  - All simulation tests pass (17 tests)

- [x] 8. Implement Evidence Bundle Controller
  - [x] 8.1 Create evidence-bundle.controller.ts with POST /incidents/:id/runs/:runId/export-bundle
    - Return { bundleId, contentHash }
    - Apply guards: FeatureFlag, RBAC
    - _Requirements: 9.1, 9.2, 9.3, 9.4_
  
  - [x] 8.2 Add GET /evidence-bundles/:bundleId endpoint
    - Return bundle meta + payload
    - Apply RBAC guard
    - _Requirements: 10.1, 10.2, 10.3_
  
  - [x] 8.3 Add GET /evidence-bundles/:bundleId/verify endpoint
    - Return { ok: boolean, expectedHash, actualHash }
    - Return 200 OK even for mismatch (ok=false)
    - _Requirements: 11.1, 11.2, 11.3_
  
  - [x] 8.4 Write property test for bundle verify integrity
    - **Property 11: Bundle Verify Integrity**
    - **Validates: Requirements 11.1, 11.2**
  
  - [x] 8.5 Write unit tests for evidence bundle controller
    - Test export, get, verify endpoints
    - _Requirements: 9.1-9.4, 10.1-10.3, 11.1-11.3_

- [x] 9. Implement Legal Hold Controller
  - [x] 9.1 Create legal-hold.controller.ts with GET /legal-holds
    - Accept query params: incidentId?, tenantId? (ops only)
    - tenant-admin: only own tenant (tenantId query ignored)
    - internal-ops: any tenant
    - _Requirements: 12.1, 12.2, 12.3, 12.4_
  
  - [x] 9.2 Add POST /legal-holds/:snapshotId/archive endpoint
    - Return 409 CANNOT_ARCHIVE_BASELINE for baseline snapshots
    - Apply guards: FeatureFlag, RBAC
    - _Requirements: 13.1, 13.2, 13.3, 13.4_
  
  - [x] 9.3 Add GET /legal-holds/stats endpoint
    - Return { totalCount, byIncidentCount, oldestHoldAt, averageAgeDays }
    - _Requirements: 14.1, 14.2_
  
  - [x] 9.4 Write property test for baseline cannot be archived
    - **Property 10: Baseline Cannot Be Archived**
    - **Validates: Requirements 13.1**
  
  - [x] 9.5 Write unit tests for legal hold controller
    - Test list with RBAC, archive baseline → 409, stats calculation
    - _Requirements: 12.1-12.4, 13.1-13.4, 14.1-14.2_

- [x] 10. Final checkpoint - All endpoints complete
  - All 88 tests pass across 6 test files

- [x] 11. Wire module and register controllers
  - [x] 11.1 Create simulation-api.module.ts
    - Register all controllers
    - Register all guards as providers
    - Import required dependencies (ClockService, etc.)
    - _Requirements: All_
  
  - [x] 11.2 Update app.module.ts to import SimulationApiModule
    - Env-conditional import: SIMULATION_API_ENABLED !== 'false' → module loaded
    - Startup log: "Simulation API enabled/disabled (deployment level)"
    - Known limitations documented in app.module.ts comments
    - _Requirements: All_

## Implementation Red Lines

These are non-negotiable constraints for 2F implementation:

1. **Mutations 503, reads open**: 503 only for POST simulate, POST export-bundle, POST archive. Read endpoints work when flag disabled.

2. **Rate-limit determinism + singular behavior**:
   - per-incident: INCR + TTL=60s; >1 => 429
   - concurrent: set membership (runId) + SCARD > 5 => 429
   - daily: UTC day key; >100 => 429
   - All use IClock for deterministic testing

3. **"already running" 409 must work correctly**: Same incident concurrent simulate calls - use lock/flag to cleanly cut race condition. Single winner, others get 409.

4. **RBAC tenant-boundary override hole will not return**: tenant-admin query/header tenant override attempt always forbidden. internal-ops override allowed.

5. **Evidence bundle hash mismatch: 200 + ok:false**: Verify endpoint "did the job" but result is mismatch → 200 OK. Log it (audit) because this may be "integrity violation".

## Notes

- All tasks including tests are required for comprehensive coverage
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- Implementation uses existing services: SimulationEngine, EvidenceBundleService, LegalHoldInventoryService
- Rate limit guard uses IClock for testability (same pattern as DiagnosticsRateLimitGuard)
