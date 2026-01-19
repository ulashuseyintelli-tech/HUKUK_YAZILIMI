# Implementation Plan: Phase 9 Production Hardening

## Overview

This is the master implementation plan coordinating three sub-sprints for production hardening. Each sprint has its own detailed task list. This document tracks the overall phase progress and cross-sprint dependencies.

## Tasks

- [ ] 1. Phase 9 Infrastructure Setup
  - [ ] 1.1 Create Phase 9 configuration module
    - Create `phase9-config.ts` with feature flags for each layer
    - Define `Phase9Config` interface with redis, postgresql, s3 sections
    - Implement environment variable parsing for all flags
    - _Requirements: 1.1, 1.2, 6.1, 6.2, 6.3_
  
  - [ ] 1.2 Create storage provider base interface
    - Define `IStorageProvider<T>` interface with connect/disconnect/healthCheck
    - Define `IFallbackStrategy` interface
    - Create abstract base class for storage providers
    - _Requirements: 2.1, 2.2, 2.3_

- [ ] 2. Sprint 9A: Redis Migration
  - Execute tasks from `.kiro/specs/phase-9a-redis-migration/tasks.md`
  - _Requirements: 1.1, 4.1_

- [ ] 3. Sprint 9A Validation Checkpoint
  - Ensure all 88 existing tests pass with Redis backend
  - Verify rate limit tests pass with both in-memory and Redis
  - Confirm failover behavior works correctly
  - _Requirements: 4.1, 5.1_

- [ ] 4. Sprint 9B: PostgreSQL Migration
  - Execute tasks from `.kiro/specs/phase-9b-postgresql-migration/tasks.md`
  - _Requirements: 1.2, 4.2_

- [ ] 5. Sprint 9B Validation Checkpoint
  - Ensure all simulation tests pass with PostgreSQL backend
  - Verify determinism is preserved after migration
  - Confirm data integrity with checksum validation
  - _Requirements: 3.2, 4.2, 5.2_

- [ ] 6. Sprint 9C: Object Storage Migration
  - Execute tasks from `.kiro/specs/phase-9c-object-storage-migration/tasks.md`
  - _Requirements: 1.2, 4.3_

- [ ] 7. Sprint 9C Validation Checkpoint
  - Ensure all bundle export tests pass with S3 backend
  - Verify retention lifecycle policies are active
  - Confirm bundle integrity verification works
  - _Requirements: 3.1, 4.3, 5.3_

- [ ] 8. Phase 9 Integration Testing
  - [ ] 8.1 Full system integration test
    - Run all 88 tests with all persistent backends enabled
    - Verify cross-layer interactions work correctly
    - _Requirements: 4.1, 4.2, 4.3_
  
  - [ ] 8.2 Write property test for sprint independence
    - **Property 1: Sprint Independence**
    - **Validates: Requirements 1.1, 1.2, 6.1, 6.2, 6.3**
  
  - [ ] 8.3 Write property test for API contract preservation
    - **Property 2: API Contract Preservation**
    - **Validates: Requirements 1.4**

- [ ] 9. Final Checkpoint
  - Ensure all tests pass with full production configuration
  - Verify rollback procedures work for each sprint
  - Document deployment runbook
  - _Requirements: 5.4, 6.4_

- [x] 10. Step 4: Cross-Tenant Break-Glass Access Implementation
  - [x] 10.1 TenantContext Source Lock-down
    - [x] 10.1.1 Create `TenantContextResolver` service
      - Extract tenantId exclusively from JWT claims for external requests
      - Support service account JWT for internal service-to-service calls
      - Support HMAC-signed `X-Internal-Tenant-Id` header as fallback
      - Produce canonical `TenantContext { tenantId, actor, authType, scopes }`
      - _Requirements: 8.1, 8.2, 8.3, 8.4_
    
    - [x] 10.1.2 Create `TenantContextGuard`
      - Inject resolved TenantContext into request
      - Reject requests with missing/invalid tenant context
      - _Requirements: 8.1, 8.2_
  
  - [x] 10.2 Break-Glass Core Types
    - [x] 10.2.1 Create `break-glass.types.ts`
      - Define `BreakGlassReason` interface (category, ticketRef, description)
      - Define `BreakGlassRequest` interface
      - Define `BreakGlassGrant` interface
      - Define `CrossTenantAuditEvent` interface
      - Define `CrossTenantEventType` enum
      - _Requirements: 7.5, 7.7_
    
    - [x] 10.2.2 Create `break-glass.config.ts`
      - Define `BreakGlassConfig` interface
      - Parse environment variables
      - Default values: 15min TTL, 3 renewals, 10 grants/hour circuit breaker
      - _Requirements: 7.4, 7.6_
  
  - [x] 10.3 Break-Glass Guards
    - [x] 10.3.1 Create `NetworkAllowlistGuard`
      - Check request IP against configured CIDR allowlist
      - Return 403 if outside allowed networks
      - _Requirements: 7.3, INV-4_
    
    - [x] 10.3.2 Create `InternalOpsGuard`
      - Verify `role=internal_ops` claim in JWT
      - Return 403 if not internal ops
      - _Requirements: 7.2_
    
    - [x] 10.3.3 Create `BreakGlassGrantGuard`
      - Verify valid break-glass token
      - Check token not expired
      - Check scope matches requested resource
      - Check renewal cap not exceeded
      - DB status check with 10s TTL cache (fail-closed)
      - Return 403/401 on failure
      - _Requirements: 7.4, INV-1_
  
  - [x] 10.4 Break-Glass Services
    - [x] 10.4.1 Create `BreakGlassRequestService`
      - Create break-glass request with structured reason
      - Validate reason (category enum, ticketRef regex, description length)
      - Set 30-minute expiry
      - Requester overdue post-mortem check (fail-closed)
      - Emit `CROSS_TENANT_ACCESS_REQUESTED` audit event
      - _Requirements: 7.7, 7.5_
    
    - [x] 10.4.2 Create `BreakGlassApprovalService`
      - Approve pending request
      - Enforce four-eyes: reject if requesterId === approverId
      - Optimistic lock: WHERE id=? AND status='PENDING' AND version=?
      - Check circuit breaker before granting
      - Generate time-bound token (15min TTL)
      - Emit `CROSS_TENANT_ACCESS_GRANTED` or `DENIED` audit event
      - _Requirements: 7.2, 7.4, 7.5, INV-2_
    
    - [x] 10.4.3 Create `BreakGlassGrantService`
      - Issue/renew/revoke/expire methods
      - Post-mortem requirement creation
      - Renewal cap enforcement (max 3)
      - Token generation with 15min TTL
      - DB status check with 10s TTL cache (fail-closed)
      - _Requirements: 7.4, 7.6_
    
    - [x] 10.4.4 Create `BreakGlassCircuitBreakerService`
      - Track grants per hour
      - Trip circuit breaker at threshold (default: 10)
      - Alert security team on trip
      - Require security override to reset
      - _Requirements: 7.6_
    
    - [x] 10.4.5 Create `CrossTenantAuditService`
      - Emit all 6 event types
      - Include full payload (no PII/evidence content)
      - Append-only repository (no update/delete methods)
      - _Requirements: 7.5, INV-3_
  
  - [x] 10.5 Break-Glass Controllers
    - [x] 10.5.1 Create `BreakGlassController`
      - `POST /api/v1/internal-ops/break-glass/request`
      - `POST /api/v1/internal-ops/break-glass/approve`
      - `POST /api/v1/internal-ops/break-glass/deny`
      - `POST /api/v1/internal-ops/break-glass/revoke`
      - `POST /api/v1/internal-ops/break-glass/renew`
      - `GET /api/v1/internal-ops/break-glass/status/:requestId`
      - Apply `NetworkAllowlistGuard` + `InternalOpsGuard`
      - _Requirements: 7.2, 7.3_
    
    - [x] 10.5.2 Create `CrossTenantAccessController`
      - `GET /api/v1/internal-ops/cross-tenant/:tenantId/snapshots`
      - `GET /api/v1/internal-ops/cross-tenant/:tenantId/snapshots/:snapshotId`
      - `GET /api/v1/internal-ops/cross-tenant/:tenantId/legal-holds`
      - `GET /api/v1/internal-ops/cross-tenant/:tenantId/legal-holds/:holdId`
      - Apply `NetworkAllowlistGuard` + `BreakGlassGrantGuard`
      - Enforce read-only (reject POST/PUT/PATCH/DELETE with 405)
      - Emit `CROSS_TENANT_ACCESS_USED` on each access
      - _Requirements: 7.8, INV-1, INV-5_
  
  - [x] 10.6 Break-Glass Tests
    - [x] 10.6.1 Remove skipped test, replace with comprehensive suite
      - Test: Default cross-tenant call → 403
      - Test: Request → approve → access → 200
      - Test: Wrong scope → 403
      - Test: Same requester approving → 403 (four-eyes)
      - Test: Outside VPN CIDR → 403
      - Test: Renewal > 3 → 403
      - Test: Expired grant → 401
      - Test: Circuit breaker triggered → 503 + alert
      - Test: Write attempt → 405
      - _Requirements: 7.1-7.8, INV-1 through INV-5_
    
    - [x] 10.6.2 Security hardening tests (added post-review)
      - Test: Actor binding - actor in authorizedActors → allowed
      - Test: Actor binding - actor NOT in authorizedActors → 403
      - Test: Actor binding - no actor context → 403
      - Test: renewalsLeft=0 in guard → allowed (enforcement in renew API only)
      - Test: Revoke → same token → 403 (cache invalidation)
      - _Validates: Actor binding (Option A), renewalsLeft enforcement location_
    
    - [ ] 10.6.3 Property test for break-glass invariants (future)
      - **Property: No access without valid grant**
      - **Property: Four-eyes always enforced**
      - **Property: All events audited**
      - _Validates: INV-1, INV-2, INV-3_
  
  - [x] 10.7 Security Fixes (added post-review)
    - [x] 10.7.1 Actor binding implementation (Option A)
      - Add `authorizedActors` claim to token (min 1, max 5 IDs)
      - Add `requesterId`, `approverId` claims for audit
      - Guard checks `authorizedActors.includes(ctx.actorId)`
      - _Validates: Token cannot be shared/delegated_
    
    - [x] 10.7.2 Minimum disclosure in token
      - Remove `ticketRef` from token claims
      - Add `requestId` for audit lookup
      - _Validates: Reduced exposure if token leaks_
    
    - [x] 10.7.3 USED audit moved to interceptor
      - Create `CrossTenantAccessInterceptor`
      - Use `mergeMap` pattern for proper async await
      - Audit fail → 500 (strict mode for legal/forensic)
      - Remove audit calls from controller methods
      - _Validates: Consistent audit coverage, no missed events_
    
    - [x] 10.7.4 Guard chain update
      - Add `TenantContextGuard` to CrossTenantAccessController
      - Add `InternalOpsGuard` to CrossTenantAccessController
      - Full chain: KillSwitch → NetworkAllowlist → TenantContext → InternalOps → BreakGlassGrant
      - _Validates: Actor identity verified before token check_
    
    - [x] 10.7.5 renewalsLeft enforcement location
      - Remove renewalsLeft check from guard
      - Enforce `renewalsLeft > 0` in renew API only
      - _Validates: Token with renewalsLeft=0 can still be used for access_

## Notes

- Each sprint (9A, 9B, 9C) has its own detailed task list
- Sprints can be deployed independently but should follow order for stability
- Checkpoints ensure incremental validation before proceeding
- Property tests validate universal correctness properties
- Step 4 (Task 10) implements the cross-tenant break-glass architecture decided in design review
