# Requirements Document

## Introduction

Sprint 9B migrates the Truth Layer from in-memory storage to PostgreSQL. This layer handles authoritative data that must be preserved: incidents, snapshots, and simulation runs. The risk profile is data integrity - wrong implementation means wrong legal decisions or lost audit trails.

Current in-memory implementations to migrate:
- `SimulationRunStoreService`: Run history, results, status tracking
- `IncidentStore`: Incident metadata, state, relationships
- `SnapshotStore`: Calculation snapshots, legal holds, baseline references

## Glossary

- **PostgreSQL_Adapter**: The PostgreSQL-backed implementation of truth layer storage
- **Simulation_Run_Repository**: Interface for storing and querying simulation runs
- **Incident_Repository**: Interface for storing and querying incidents
- **Snapshot_Repository**: Interface for storing and querying snapshots
- **Transaction_Manager**: Component ensuring ACID compliance across operations
- **Migration_Script**: SQL scripts for schema creation and data migration
- **Connection_Pool**: Managed pool of PostgreSQL connections
- **Failover_Handler**: Component managing PostgreSQL connection failures

## Requirements

### Requirement 1: Simulation Run Persistence

**User Story:** As a system operator, I want simulation runs stored in PostgreSQL, so that run history survives restarts and works across multiple API instances.

#### Acceptance Criteria

1. WHEN a simulation completes, THE Simulation_Run_Repository SHALL persist run data with all fields (runId, incidentId, tenantId, scenarioId, seed, verdict, driftScore, status, createdAt, completedAt)
2. WHEN querying runs by incidentId, THE Simulation_Run_Repository SHALL return runs ordered by createdAt descending
3. WHEN querying latest run, THE Simulation_Run_Repository SHALL return the most recent run or null if none exists
4. THE Simulation_Run_Repository SHALL support pagination with cursor-based navigation
5. WHEN run status changes, THE Simulation_Run_Repository SHALL update status atomically with timestamp

### Requirement 2: Incident Persistence

**User Story:** As a system operator, I want incidents stored in PostgreSQL, so that incident data survives restarts and maintains referential integrity.

#### Acceptance Criteria

1. WHEN an incident is created, THE Incident_Repository SHALL persist incident with all fields (incidentId, tenantId, caseId, status, createdAt, updatedAt)
2. WHEN querying incidents by tenantId, THE Incident_Repository SHALL return only incidents belonging to that tenant
3. THE Incident_Repository SHALL enforce unique constraint on incidentId
4. WHEN incident status changes, THE Incident_Repository SHALL update status and updatedAt atomically
5. THE Incident_Repository SHALL support soft delete with deletedAt timestamp

### Requirement 3: Snapshot Persistence

**User Story:** As a legal compliance officer, I want snapshots stored in PostgreSQL, so that legal holds and audit trails are preserved permanently.

#### Acceptance Criteria

1. WHEN a snapshot is created, THE Snapshot_Repository SHALL persist snapshot with all fields (snapshotId, incidentId, tenantId, calcResult, isBaseline, legalHold, createdAt)
2. WHEN querying snapshots with legal hold, THE Snapshot_Repository SHALL return only snapshots where legalHold=true
3. THE Snapshot_Repository SHALL enforce foreign key constraint to incidents table
4. WHEN baseline is set, THE Snapshot_Repository SHALL ensure only one baseline per incident
5. THE Snapshot_Repository SHALL store calcResult as JSONB for flexible querying

### Requirement 4: Transaction Management

**User Story:** As a developer, I want ACID transactions for multi-table operations, so that data remains consistent even during failures.

#### Acceptance Criteria

1. WHEN creating a simulation run with snapshot, THE Transaction_Manager SHALL wrap both inserts in a single transaction
2. IF any operation in a transaction fails, THEN THE Transaction_Manager SHALL rollback all changes
3. WHEN updating incident status and creating snapshot, THE Transaction_Manager SHALL ensure atomicity
4. THE Transaction_Manager SHALL support nested transactions with savepoints
5. WHEN transaction timeout occurs, THE Transaction_Manager SHALL rollback and throw clear error

### Requirement 5: Connection Pooling

**User Story:** As a system operator, I want PostgreSQL connection pooling, so that the system handles high load efficiently.

#### Acceptance Criteria

1. THE Connection_Pool SHALL maintain minimum 5 connections to PostgreSQL
2. THE Connection_Pool SHALL scale up to maximum 20 connections under load
3. WHEN connection is idle for 60 seconds, THE Connection_Pool SHALL close it
4. THE Connection_Pool SHALL validate connections before use with simple query
5. WHEN all connections are busy, THE Connection_Pool SHALL queue requests with 5 second timeout

### Requirement 6: Failover Handling

**User Story:** As a system operator, I want graceful error handling when PostgreSQL is unavailable, so that the system fails clearly rather than silently.

#### Acceptance Criteria

1. WHEN PostgreSQL connection fails, THE Failover_Handler SHALL reject new write operations with clear error message
2. WHEN PostgreSQL connection fails, THE Failover_Handler SHALL allow read operations from cache if available
3. THE Failover_Handler SHALL attempt PostgreSQL reconnection every 10 seconds
4. WHEN PostgreSQL connection is restored, THE Failover_Handler SHALL resume normal operations within 1 second
5. IF PostgreSQL fails 5 consecutive times, THEN THE Failover_Handler SHALL emit critical alert
6. THE Failover_Handler SHALL NOT fall back to in-memory for truth layer (data integrity requirement)

### Requirement 7: Schema Migration

**User Story:** As a DevOps engineer, I want database schema managed through migrations, so that schema changes are versioned and reversible.

#### Acceptance Criteria

1. THE Migration_Script SHALL create all required tables with proper indexes
2. THE Migration_Script SHALL be idempotent (safe to run multiple times)
3. THE Migration_Script SHALL include rollback scripts for each migration
4. WHEN migration fails, THE Migration_Script SHALL leave database in consistent state
5. THE Migration_Script SHALL support zero-downtime migrations

### Requirement 8: Test Compatibility

**User Story:** As a developer, I want existing tests to pass with PostgreSQL backend, so that I can verify the migration is correct.

#### Acceptance Criteria

1. THE PostgreSQL_Adapter SHALL implement same interface as current in-memory implementation
2. WHEN running tests, THE PostgreSQL_Adapter SHALL support test database isolation
3. THE PostgreSQL_Adapter SHALL pass all existing simulation and snapshot tests
4. THE PostgreSQL_Adapter SHALL support deterministic clock injection for time-based tests
5. WHEN test environment is detected, THE PostgreSQL_Adapter SHALL use test database with automatic cleanup

