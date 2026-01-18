# Requirements Document

## Introduction

Sprint 2F: Simulation API - Product surface layer for the simulation engine built in S-2.

This sprint exposes the simulation engine through REST endpoints with:
- RBAC tenant boundary enforcement
- Simulation-specific rate limiting (per-incident, per-tenant concurrent, daily)
- Feature flag control (503 when disabled)

**Context:** S-2 closed with 31/31 green tests. 2F is "product surface" not "architecture".

## Glossary

- **Simulation_Controller**: REST controller for simulation endpoints
- **Evidence_Bundle_Controller**: REST controller for evidence bundle export/read/verify
- **Legal_Hold_Controller**: REST controller for legal hold inventory management
- **Simulation_RBAC_Guard**: Access control guard enforcing tenant boundaries
- **Simulation_Rate_Limit_Guard**: Rate limiting guard with IClock for testability
- **Feature_Flag_Service**: Service checking SIMULATION_ENABLED flag
- **Run_Summary**: Lightweight representation of a simulation run
- **Evidence_Bundle**: Exportable package containing simulation evidence chain
- **Legal_Hold**: Snapshot with indefinite retention for compliance

## Requirements

### Requirement 1: Feature Flag Control

**User Story:** As a system operator, I want to disable simulation features via feature flag, so that I can control system load and perform maintenance.

#### Acceptance Criteria

1. THE Feature_Flag_Service SHALL provide a `isSimulationEnabled()` helper that checks SIMULATION_ENABLED flag
2. WHEN SIMULATION_ENABLED=false, THE Simulation_Controller SHALL return 503 SIMULATION_DISABLED for POST /incidents/:id/simulate
3. WHEN SIMULATION_ENABLED=false, THE Evidence_Bundle_Controller SHALL return 503 SIMULATION_DISABLED for POST /incidents/:id/runs/:runId/export-bundle
4. WHEN SIMULATION_ENABLED=false, THE Legal_Hold_Controller SHALL return 503 SIMULATION_DISABLED for POST /legal-holds/:snapshotId/archive
5. WHEN SIMULATION_ENABLED=false, THE Simulation_Controller SHALL allow GET /incidents/:id/runs (read endpoints work regardless of flag)
6. WHEN SIMULATION_ENABLED=false, THE Evidence_Bundle_Controller SHALL allow GET /evidence-bundles/:bundleId (read endpoints work regardless of flag)
7. WHEN SIMULATION_ENABLED=false, THE Legal_Hold_Controller SHALL allow GET /legal-holds (read endpoints work regardless of flag)

---

### Requirement 2: Simulation Rate Limit Constants

**User Story:** As a system architect, I want rate limit constants defined in a single source, so that limits are consistent across the codebase.

#### Acceptance Criteria

1. THE system SHALL define SIMULATION_RATE_LIMITS constant with perIncident: 1/min
2. THE system SHALL define SIMULATION_RATE_LIMITS constant with perTenantConcurrent: 5
3. THE system SHALL define SIMULATION_RATE_LIMITS constant with daily: 100/tenant
4. THE rate limit keyspace SHALL use `rate:simulation:incident:{tenantId}:{incidentId}:m` for per-incident minute limit (TTL=60s, INCR counter)
5. THE rate limit keyspace SHALL use `rate:simulation:tenant:{tenantId}:concurrent` for concurrent limit (Set with runId membership, SADD/SREM, SCARD <= 5)
6. THE rate limit keyspace SHALL use `rate:simulation:tenant:{tenantId}:daily:{yyyy-mm-dd}` for daily limit (UTC timezone)
7. THE rate limit keyspace SHALL use `rate:simulation:run:{runId}:lease` for crash recovery (TTL=5min)

---

### Requirement 3: Simulation Rate Limit Guard

**User Story:** As a system operator, I want simulation requests rate limited, so that the system is protected from abuse.

#### Acceptance Criteria

1. THE Simulation_Rate_Limit_Guard SHALL accept IClock interface for testability
2. WHEN checking rate limits, THE Simulation_Rate_Limit_Guard SHALL check perTenantConcurrent first (reject immediately if full)
3. WHEN perTenantConcurrent passes, THE Simulation_Rate_Limit_Guard SHALL check perIncident minute limit
4. WHEN perIncident passes, THE Simulation_Rate_Limit_Guard SHALL check daily limit
5. WHEN perTenantConcurrent limit (5) is exceeded, THE Simulation_Rate_Limit_Guard SHALL return 429 TOO_MANY_SIMULATIONS
6. WHEN perIncident limit (1/min) is exceeded, THE Simulation_Rate_Limit_Guard SHALL return 429 TOO_MANY_SIMULATIONS
7. WHEN daily limit (100/tenant) is exceeded, THE Simulation_Rate_Limit_Guard SHALL return 429 TOO_MANY_SIMULATIONS
8. WHEN a simulation run starts, THE Simulation_Rate_Limit_Guard SHALL acquire token (SADD runId to concurrent set)
9. WHEN a simulation run completes, THE Simulation_Rate_Limit_Guard SHALL release token in finally block (SREM runId)
10. THE Simulation_Rate_Limit_Guard SHALL set TTL=5min on lease key for crash recovery

---

### Requirement 4: Simulation RBAC Guard

**User Story:** As a tenant admin, I want to only access my own tenant's simulations, so that tenant data is isolated.

#### Acceptance Criteria

1. WHEN a tenant-admin requests simulation data, THE Simulation_RBAC_Guard SHALL verify the incident belongs to their tenant
2. WHEN a tenant-admin requests another tenant's data, THE Simulation_RBAC_Guard SHALL return 403 FORBIDDEN_TENANT_SCOPE
3. WHEN an internal-ops user requests simulation data, THE Simulation_RBAC_Guard SHALL allow access to any tenant
4. WHEN a tenant-admin provides tenantId override in request, THE Simulation_RBAC_Guard SHALL reject with 403 (same pattern as diagnostics fix)
5. IF authentication is missing or invalid, THE Simulation_RBAC_Guard SHALL return 401 Unauthorized

---

### Requirement 5: POST /incidents/:id/simulate Endpoint

**User Story:** As a tenant admin, I want to run simulations on my incidents, so that I can evaluate what-if scenarios.

#### Acceptance Criteria

1. WHEN a valid simulation request is received, THE Simulation_Controller SHALL accept optional body `{ scenarioId?: string; seed?: number }`
2. IF scenarioId/seed not provided, THE Simulation_Controller SHALL use engine defaults
3. WHEN simulation succeeds, THE Simulation_Controller SHALL return `{ runId; verdict; driftScore; evidenceStatus; driftBlocked; evidenceGateReason? }`
4. WHEN SIMULATION_ENABLED=false, THE Simulation_Controller SHALL return 503 SIMULATION_DISABLED
5. WHEN incident does not exist, THE Simulation_Controller SHALL return 404 INCIDENT_NOT_FOUND
6. WHEN incident belongs to different tenant, THE Simulation_Controller SHALL return 403 FORBIDDEN_TENANT_SCOPE
7. WHEN a simulation is already running for this incident, THE Simulation_Controller SHALL return 409 SIMULATION_ALREADY_RUNNING
8. WHEN rate limit is exceeded, THE Simulation_Controller SHALL return 429 TOO_MANY_SIMULATIONS

---

### Requirement 6: GET /incidents/:id/runs Endpoint

**User Story:** As a tenant admin, I want to list simulation runs for an incident, so that I can review past simulations.

#### Acceptance Criteria

1. WHEN listing runs, THE Simulation_Controller SHALL accept query params: limit (default 20), cursor (optional)
2. THE Simulation_Controller SHALL return run summaries ordered newest → oldest
3. WHEN incident does not exist, THE Simulation_Controller SHALL return 404 INCIDENT_NOT_FOUND
4. WHEN incident belongs to different tenant, THE Simulation_Controller SHALL return 403 FORBIDDEN_TENANT_SCOPE
5. THE run summary SHALL include: runId, scenarioId, seed, verdict, driftScore, createdAt, status

---

### Requirement 7: GET /incidents/:id/runs/latest Endpoint

**User Story:** As a tenant admin, I want to get the latest simulation run, so that I can quickly see the most recent result.

#### Acceptance Criteria

1. WHEN latest run exists, THE Simulation_Controller SHALL return 200 OK with run summary
2. WHEN no runs exist, THE Simulation_Controller SHALL return 200 OK with `{ latestRun: null }` (NOT 404)
3. WHEN incident does not exist, THE Simulation_Controller SHALL return 404 INCIDENT_NOT_FOUND
4. WHEN incident belongs to different tenant, THE Simulation_Controller SHALL return 403 FORBIDDEN_TENANT_SCOPE

---

### Requirement 8: GET /incidents/:id/runs/:runId Endpoint

**User Story:** As a tenant admin, I want to get details of a specific simulation run, so that I can analyze the results.

#### Acceptance Criteria

1. WHEN run exists, THE Simulation_Controller SHALL return run summary (expandable for details)
2. WHEN run does not exist, THE Simulation_Controller SHALL return 404 RUN_NOT_FOUND
3. WHEN incident does not exist, THE Simulation_Controller SHALL return 404 INCIDENT_NOT_FOUND
4. WHEN incident belongs to different tenant, THE Simulation_Controller SHALL return 403 FORBIDDEN_TENANT_SCOPE

---

### Requirement 9: POST /incidents/:id/runs/:runId/export-bundle Endpoint

**User Story:** As a tenant admin, I want to export evidence bundles, so that I can provide audit trails for compliance.

#### Acceptance Criteria

1. WHEN export succeeds, THE Evidence_Bundle_Controller SHALL return `{ bundleId; contentHash }`
2. WHEN SIMULATION_ENABLED=false, THE Evidence_Bundle_Controller SHALL return 503 SIMULATION_DISABLED
3. WHEN run does not exist, THE Evidence_Bundle_Controller SHALL return 404 RUN_NOT_FOUND
4. THE Evidence_Bundle_Controller SHALL enforce RBAC: tenant-admin (own tenant) + internal-ops

---

### Requirement 10: GET /evidence-bundles/:bundleId Endpoint

**User Story:** As a tenant admin, I want to retrieve exported evidence bundles, so that I can review audit trails.

#### Acceptance Criteria

1. WHEN bundle exists, THE Evidence_Bundle_Controller SHALL return bundle meta + payload
2. WHEN bundle does not exist, THE Evidence_Bundle_Controller SHALL return 404 BUNDLE_NOT_FOUND
3. THE Evidence_Bundle_Controller SHALL enforce RBAC: tenant-admin (own tenant) + internal-ops

---

### Requirement 11: GET /evidence-bundles/:bundleId/verify Endpoint

**User Story:** As a tenant admin, I want to verify evidence bundle integrity, so that I can confirm data has not been tampered.

#### Acceptance Criteria

1. WHEN verification succeeds, THE Evidence_Bundle_Controller SHALL return `{ ok: true; expectedHash; actualHash }`
2. WHEN verification fails (hash mismatch), THE Evidence_Bundle_Controller SHALL return 200 OK with `{ ok: false; expectedHash; actualHash }` (verification succeeded, result is mismatch)
3. WHEN bundle does not exist, THE Evidence_Bundle_Controller SHALL return 404 BUNDLE_NOT_FOUND

---

### Requirement 12: GET /legal-holds Endpoint

**User Story:** As a tenant admin, I want to list legal holds, so that I can manage compliance snapshots.

#### Acceptance Criteria

1. THE Legal_Hold_Controller SHALL accept query params: incidentId? (optional filter), tenantId? (only for ops)
2. WHEN tenant-admin requests, THE Legal_Hold_Controller SHALL return only own tenant's legal holds (tenantId query ignored/forbidden)
3. WHEN internal-ops requests, THE Legal_Hold_Controller SHALL allow filtering by any tenantId
4. THE response SHALL include legal hold entries with snapshotId, incidentId, tenantId, createdAt, reason

---

### Requirement 13: POST /legal-holds/:snapshotId/archive Endpoint

**User Story:** As a tenant admin, I want to archive legal holds, so that I can manage storage while maintaining compliance.

#### Acceptance Criteria

1. WHEN archiving a baseline snapshot, THE Legal_Hold_Controller SHALL return 409 CONFLICT with error code CANNOT_ARCHIVE_BASELINE
2. WHEN SIMULATION_ENABLED=false, THE Legal_Hold_Controller SHALL return 503 SIMULATION_DISABLED
3. THE Legal_Hold_Controller SHALL enforce RBAC: tenant-admin (own tenant) + internal-ops
4. WHEN archive succeeds, THE Legal_Hold_Controller SHALL return 200 OK with `{ archived: true }`

---

### Requirement 14: GET /legal-holds/stats Endpoint

**User Story:** As a tenant admin, I want to see legal hold statistics, so that I can monitor compliance snapshot accumulation.

#### Acceptance Criteria

1. THE Legal_Hold_Controller SHALL return `{ totalCount; byIncidentCount; oldestHoldAt; averageAgeDays }`
2. THE Legal_Hold_Controller SHALL enforce RBAC: tenant-admin sees own tenant stats, internal-ops sees all

---

### Requirement 15: Error Response Format

**User Story:** As an API consumer, I want consistent error responses, so that I can handle errors programmatically.

#### Acceptance Criteria

1. THE system SHALL return error responses with structure: `{ statusCode; error; message; details? }`
2. THE 503 SIMULATION_DISABLED error SHALL include `{ statusCode: 503; error: 'Service Unavailable'; message: 'Simulation feature is disabled' }`
3. THE 429 TOO_MANY_SIMULATIONS error SHALL include `{ statusCode: 429; error: 'Too Many Requests'; message: string; details: { retryAfter: number; limitType: string } }`
4. THE 403 FORBIDDEN_TENANT_SCOPE error SHALL include `{ statusCode: 403; error: 'Forbidden'; message: 'Access denied to requested tenant scope' }`
5. THE 409 SIMULATION_ALREADY_RUNNING error SHALL include `{ statusCode: 409; error: 'Conflict'; message: 'Simulation already running for this incident' }`
6. THE 409 CANNOT_ARCHIVE_BASELINE error SHALL include `{ statusCode: 409; error: 'Conflict'; message: 'Cannot archive baseline snapshot' }`

## Invariants

| Invariant | Enforcement |
|-----------|-------------|
| Tenant isolation | RBAC guard on every endpoint |
| Rate limit order | perTenantConcurrent → perIncident → daily |
| Feature flag | Mutations blocked, reads allowed |
| Baseline protection | Cannot archive baseline snapshots |
| Daily reset | UTC timezone |

## Exit Criteria

Sprint 2F complete when:
1. ✅ Feature flag: disabled → simulate → 503
2. ✅ RBAC: tenant-admin own tenant OK, other tenant forbidden, internal-ops cross-tenant OK
3. ✅ Rate-limit: same incident 2nd request within 1 min → 429
4. ✅ Rate-limit: perTenant concurrency 6th parallel → 429
5. ✅ Rate-limit: daily 101 → 429, next day reset OK
6. ✅ Runs endpoints: simulate → run summary written, list/latest/runId get correct
7. ✅ Bundle endpoints: export → bundleId returned, get → payload returned, verify → ok true
8. ✅ Legal holds: list with RBAC, archive baseline → 409, stats calculation
