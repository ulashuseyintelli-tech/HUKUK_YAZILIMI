# Requirements Document: Phase 9C Task 2 - Evidence Bundle DB Migration

## Introduction

Task 2 establishes the PostgreSQL schema foundation for Evidence Bundle state management. This migration enables "legal-grade" evidence handling by enforcing critical invariants at the database level: single open bundle per tenant+incident, sealed bundle immutability, and complete audit trail for seal operations.

This task is a prerequisite for Task 2.5 (BundleSealJob) - without stable schema, idempotency guarantees and retry semantics cannot be reliably implemented.

## Glossary

- **Evidence_Bundle**: A collection of evidence objects associated with an incident
- **Bundle_State**: Either OPEN (accepting objects) or SEALED (immutable)
- **Seal_Event**: Record of a bundle being sealed, including hash and metadata
- **Evidence_Object**: Individual piece of evidence within a bundle (stored in S3/MinIO)
- **Partial_Unique_Index**: PostgreSQL index that enforces uniqueness only for rows matching a condition
- **DB_Trigger**: PostgreSQL function that executes automatically on INSERT/UPDATE/DELETE

## Requirements

### Requirement 1: Evidence Bundle Table

**User Story:** As a system operator, I want evidence bundles tracked in PostgreSQL, so that bundle state survives restarts and can be queried efficiently.

#### Acceptance Criteria

1.1 THE migration SHALL create `evidence_bundles` table with columns: bundle_id (UUID PK), tenant_id, incident_id, state, sealed_hash, created_at, sealed_at

1.2 THE state column SHALL only accept values 'OPEN' or 'SEALED' via CHECK constraint

1.3 THE migration SHALL enforce invariant: IF state='SEALED' THEN sealed_hash IS NOT NULL AND sealed_at IS NOT NULL

1.4 THE migration SHALL enforce invariant: IF state='OPEN' THEN sealed_hash IS NULL AND sealed_at IS NULL

1.5 THE migration SHALL create partial unique index ensuring only ONE open bundle per (tenant_id, incident_id)

### Requirement 2: Evidence Objects Table

**User Story:** As a system operator, I want evidence objects tracked in PostgreSQL, so that I can query bundle contents and enforce integrity.

#### Acceptance Criteria

2.1 THE migration SHALL create `evidence_objects` table with columns: bundle_id, object_key, tenant_id (denormalized), etag, version_id, content_type, size_bytes, created_at

2.2 THE primary key SHALL be composite: (bundle_id, object_key)

2.3 THE bundle_id column SHALL reference evidence_bundles(bundle_id) with NOT DEFERRABLE FK

2.4 THE migration SHALL create index on (tenant_id, created_at) for efficient tenant queries

### Requirement 3: Bundle Seal Events Table

**User Story:** As a legal compliance officer, I want seal events recorded with full metadata, so that I can audit when and how bundles were sealed.

#### Acceptance Criteria

3.1 THE migration SHALL create `bundle_seal_events` table with columns: id (UUID PK), bundle_id, run_id, hash, object_count, total_size_bytes, created_at

3.2 THE migration SHALL enforce unique constraint on (bundle_id, run_id) for idempotency

3.3 THE bundle_id column SHALL reference evidence_bundles(bundle_id)

3.4 THE migration SHALL create index on (bundle_id, created_at) for efficient event queries

### Requirement 4: Sealed Bundle Immutability

**User Story:** As a legal compliance officer, I want sealed bundles protected from modification, so that evidence integrity is guaranteed at the database level.

#### Acceptance Criteria

4.1 THE migration SHALL create DB trigger that prevents INSERT into evidence_objects when bundle state is SEALED

4.2 WHEN insert is attempted on sealed bundle, THE trigger SHALL raise exception with error code 'SEALED_BUNDLE_VIOLATION'

4.3 THE trigger SHALL execute BEFORE INSERT on evidence_objects table

### Requirement 5: Performance Indexes

**User Story:** As a system operator, I want efficient queries on bundle data, so that API response times remain acceptable.

#### Acceptance Criteria

5.1 THE migration SHALL create index on evidence_bundles(tenant_id, incident_id)

5.2 THE migration SHALL create index on evidence_objects(tenant_id, created_at)

5.3 THE migration SHALL create index on bundle_seal_events(bundle_id, created_at)

### Requirement 6: Dual Seal Mode Support

**User Story:** As a system operator, I want the schema to support both background worker and API-driven seal operations, so that I can choose the appropriate mode.

#### Acceptance Criteria

6.1 THE schema SHALL support SELECT ... FOR UPDATE SKIP LOCKED for background worker batch processing

6.2 THE schema SHALL support SELECT ... FOR UPDATE NOWAIT for API-driven seal operations

6.3 THE (bundle_id, run_id) unique constraint SHALL enable idempotent seal operations regardless of mode

### Requirement 7: Migration Safety

**User Story:** As a system operator, I want safe migration execution, so that I can deploy without data loss.

#### Acceptance Criteria

7.1 THE migration SHALL be idempotent (safe to run multiple times)

7.2 THE migration SHALL include down migration for rollback capability

7.3 THE migration SHALL use raw SQL for PostgreSQL-specific features (partial index, trigger)
