# Requirements Document

## Introduction

Phase 9 Production Hardening is the umbrella phase for migrating the diagnostics system from in-memory storage to production-ready persistent storage. The system currently works correctly with 88 passing tests (commit 2c8ed0b) but uses in-memory stores that lose data on restart and cannot scale horizontally.

This master spec coordinates three sub-sprints, each targeting a different storage layer with distinct risk profiles:
- **Sprint 9A**: Redis Migration (Operational Layer) - Rate limits, concurrent tracking
- **Sprint 9B**: PostgreSQL Migration (Truth Layer) - Incidents, snapshots, simulation runs
- **Sprint 9C**: Object Storage Migration (Infrastructure Layer) - Evidence bundles, retention

## Glossary

- **Production_Hardening_System**: The umbrella system coordinating all persistence migrations
- **Operational_Layer**: Ephemeral state that can be reconstructed (rate limits, locks, concurrent tracking)
- **Truth_Layer**: Authoritative data that must be preserved (incidents, snapshots, simulation runs)
- **Infrastructure_Layer**: Large binary/JSON artifacts with lifecycle policies (evidence bundles)
- **Fallback_Mode**: Ability to revert to in-memory storage if persistent storage fails
- **Migration_Gate**: Checkpoint that validates migration success before proceeding

## Requirements

### Requirement 1: Independent Deployability

**User Story:** As a DevOps engineer, I want each sprint to be independently deployable, so that I can roll out persistence changes incrementally without risking the entire system.

#### Acceptance Criteria

1. WHEN Sprint 9A is deployed, THE Production_Hardening_System SHALL continue functioning with in-memory stores for Truth_Layer and Infrastructure_Layer
2. WHEN Sprint 9B is deployed, THE Production_Hardening_System SHALL continue functioning with in-memory stores for Infrastructure_Layer
3. WHEN any sprint deployment fails, THE Production_Hardening_System SHALL support rollback to the previous state within 5 minutes
4. THE Production_Hardening_System SHALL maintain all existing API contracts unchanged across all sprint deployments

### Requirement 2: Fallback Capability

**User Story:** As a system operator, I want to fall back to in-memory storage during migration issues, so that the system remains available even if persistent storage has problems.

#### Acceptance Criteria

1. WHEN Redis connection fails during Sprint 9A, THE Production_Hardening_System SHALL fall back to in-memory rate limiting with degraded mode logging
2. WHEN PostgreSQL connection fails during Sprint 9B, THE Production_Hardening_System SHALL reject new operations with clear error messages rather than silently failing
3. WHEN S3/MinIO connection fails during Sprint 9C, THE Production_Hardening_System SHALL queue bundle exports for retry with bounded queue size
4. IF fallback mode is activated, THEN THE Production_Hardening_System SHALL emit metrics indicating degraded operation

### Requirement 3: Data Integrity Preservation

**User Story:** As a legal compliance officer, I want data integrity preserved during migration, so that audit trails and legal holds remain valid.

#### Acceptance Criteria

1. THE Production_Hardening_System SHALL preserve all existing LEGAL_HOLD snapshots during migration
2. THE Production_Hardening_System SHALL maintain deterministic simulation behavior after migration
3. WHEN migrating incident data, THE Production_Hardening_System SHALL preserve all timestamps and audit fields
4. THE Production_Hardening_System SHALL validate data integrity with checksums before and after migration

### Requirement 4: Test Continuity

**User Story:** As a developer, I want all 88 existing tests to pass after each sprint, so that I can be confident the migration doesn't break existing functionality.

#### Acceptance Criteria

1. WHEN Sprint 9A is complete, THE Production_Hardening_System SHALL pass all existing rate limit and concurrent tracking tests
2. WHEN Sprint 9B is complete, THE Production_Hardening_System SHALL pass all existing simulation and evidence tests
3. WHEN Sprint 9C is complete, THE Production_Hardening_System SHALL pass all existing bundle export and retention tests
4. THE Production_Hardening_System SHALL support running tests against both in-memory and persistent backends

### Requirement 5: Rollback Criteria

**User Story:** As a release manager, I want clear rollback criteria for each sprint, so that I know when to abort a migration.

#### Acceptance Criteria

1. IF test pass rate drops below 100% after Sprint 9A deployment, THEN THE Production_Hardening_System SHALL trigger rollback
2. IF simulation determinism check fails after Sprint 9B deployment, THEN THE Production_Hardening_System SHALL trigger rollback
3. IF bundle integrity verification fails after Sprint 9C deployment, THEN THE Production_Hardening_System SHALL trigger rollback
4. WHEN rollback is triggered, THE Production_Hardening_System SHALL restore previous configuration within 5 minutes

### Requirement 6: Sprint Coordination

**User Story:** As a project manager, I want clear dependencies between sprints, so that I can plan the migration sequence correctly.

#### Acceptance Criteria

1. THE Production_Hardening_System SHALL allow Sprint 9A to be deployed independently of 9B and 9C
2. THE Production_Hardening_System SHALL allow Sprint 9B to be deployed after 9A is stable (or independently)
3. THE Production_Hardening_System SHALL allow Sprint 9C to be deployed after 9B is stable (or independently)
4. WHEN all three sprints are complete, THE Production_Hardening_System SHALL support full production mode with all persistent backends

### Requirement 7: Cross-Tenant Break-Glass Access

**User Story:** As a security officer, I want cross-tenant access to be forbidden by default with a controlled exception mechanism, so that tenant isolation is maintained while allowing legitimate operational access when necessary.

#### Acceptance Criteria

1. THE Production_Hardening_System SHALL reject all cross-tenant data access requests by default with 403 Forbidden
2. WHEN break-glass access is requested, THE Production_Hardening_System SHALL require dual approval (requester ≠ approver)
3. THE Production_Hardening_System SHALL restrict break-glass endpoints to internal network / VPN only
4. WHEN break-glass grant is issued, THE Production_Hardening_System SHALL enforce 15-minute TTL with maximum 3 renewals
5. THE Production_Hardening_System SHALL audit all break-glass lifecycle events (REQUESTED, GRANTED, DENIED, USED, EXPIRED, REVOKED)
6. IF more than 10 break-glass grants are issued within 1 hour, THEN THE Production_Hardening_System SHALL trigger circuit breaker and alert security
7. THE Production_Hardening_System SHALL require structured reason (category + ticketRef) for all break-glass requests
8. WHEN break-glass access is used, THE Production_Hardening_System SHALL enforce read-only access (no mutations)

### Requirement 8: Tenant Context Source Authority

**User Story:** As a security architect, I want tenant identity to come from a single authoritative source, so that tenant spoofing is impossible.

#### Acceptance Criteria

1. FOR external requests, THE Production_Hardening_System SHALL extract tenantId exclusively from JWT claims
2. THE Production_Hardening_System SHALL NOT accept tenantId from request headers or path parameters for authorization purposes
3. FOR service-to-service calls, THE Production_Hardening_System SHALL require either service account JWT or HMAC-signed internal header
4. THE Production_Hardening_System SHALL resolve all tenant context through a single TenantContextResolver component

## Invariants

The following invariants must hold at all times across all system states:

### INV-1: No Cross-Tenant Access Without Grant

Every cross-tenant data access requires a valid, non-expired break-glass grant. There is no bypass.

### INV-2: Four-Eyes Enforced

No single actor can both request and approve break-glass access. The system SHALL reject approval attempts where `requesterId === approverId`.

### INV-3: All Grants Audited

Every grant lifecycle event (REQUESTED, GRANTED, DENIED, USED, EXPIRED, REVOKED) produces an immutable audit record. No silent access.

### INV-4: Network Boundary Enforced

Break-glass endpoints are unreachable from public internet. Only requests from configured CIDR ranges are accepted.

### INV-5: Read-Only Cross-Tenant Access

Cross-tenant access is strictly read-only. No mutations (POST, PUT, PATCH, DELETE) are permitted via break-glass grants.
