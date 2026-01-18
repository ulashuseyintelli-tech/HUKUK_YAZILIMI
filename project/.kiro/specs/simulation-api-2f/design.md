# Design Document: Simulation API 2F

## Overview

Sprint 2F exposes the simulation engine (built in S-2) through REST endpoints with:
- RBAC tenant boundary enforcement
- Simulation-specific rate limiting (per-incident, per-tenant concurrent, daily)
- Feature flag control (503 when disabled)

This is a "product surface" sprint - the core simulation engine already exists and is tested (31/31 green).

### Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Rate-limit order | concurrent → incident → daily | Reject fast (concurrent) before expensive checks |
| Concurrency tracking | Set membership (SADD/SREM) | Atomic, no race conditions vs DECR counter |
| GET /runs/latest empty | 200 + null body | Not an error, just no data yet |
| Bundle verify mismatch | 200 OK + ok=false | Verification succeeded, result is mismatch |
| Daily reset | UTC timezone | Consistent across regions |
| Feature flag | Mutations blocked only | Reads always work for observability |

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              API Layer (2F)                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐          │
│  │ SimulationCtrl   │  │ EvidenceBundleCtrl│  │ LegalHoldCtrl   │          │
│  │                  │  │                  │  │                  │          │
│  │ POST /simulate   │  │ POST /export     │  │ GET /legal-holds │          │
│  │ GET /runs        │  │ GET /:bundleId   │  │ POST /archive    │          │
│  │ GET /runs/latest │  │ GET /verify      │  │ GET /stats       │          │
│  │ GET /runs/:runId │  │                  │  │                  │          │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘          │
│           │                     │                     │                     │
│  ┌────────┴─────────────────────┴─────────────────────┴─────────┐          │
│  │                        Guards Pipeline                        │          │
│  │  ┌─────────────┐  ┌─────────────────┐  ┌─────────────────┐   │          │
│  │  │FeatureFlag  │→ │SimulationRBAC   │→ │SimulationRateLimit│  │          │
│  │  │Guard        │  │Guard            │  │Guard (IClock)    │  │          │
│  │  └─────────────┘  └─────────────────┘  └─────────────────┘   │          │
│  └──────────────────────────────────────────────────────────────┘          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Service Layer (S-2 existing)                         │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐          │
│  │ SimulationEngine │  │ EvidenceBundleSvc│  │ LegalHoldInvSvc  │          │
│  │ (deterministic)  │  │                  │  │                  │          │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘          │
│                                                                              │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐          │
│  │ SnapshotStore    │  │ IncidentStore    │  │ ClockService     │          │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘          │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Request Flow

```
Request → FeatureFlagGuard → RBACGuard → RateLimitGuard → Controller → Service
              │                  │              │
              │ 503 if disabled  │ 403 if       │ 429 if limit
              │ (mutations only) │ wrong tenant │ exceeded
              ▼                  ▼              ▼
```

## Components and Interfaces

### 1. Feature Flag Service

```typescript
// simulation-feature-flag.service.ts

export const SIMULATION_FEATURE_FLAGS = {
  SIMULATION_ENABLED: 'SIMULATION_ENABLED',
} as const;

export interface ISimulationFeatureFlagService {
  isSimulationEnabled(): boolean;
}

@Injectable()
export class SimulationFeatureFlagService implements ISimulationFeatureFlagService {
  isSimulationEnabled(): boolean {
    return process.env.SIMULATION_ENABLED !== 'false';
  }
}
```

### 2. Simulation Rate Limit Constants

```typescript
// simulation-rate-limit.constants.ts

export const SIMULATION_RATE_LIMITS = {
  /** Max simulations per incident per minute */
  perIncident: 1,
  /** Max concurrent simulations per tenant */
  perTenantConcurrent: 5,
  /** Max simulations per tenant per day */
  daily: 100,
  /** Lease TTL for crash recovery (ms) */
  leaseTtlMs: 5 * 60 * 1000, // 5 minutes
  /** Per-incident key TTL (seconds) */
  perIncidentTtlSec: 60,
} as const;

export const SIMULATION_RATE_LIMIT_KEYS = {
  /** Per-incident minute limit: rate:simulation:incident:{tenantId}:{incidentId}:m */
  perIncident: (tenantId: string, incidentId: string) =>
    `rate:simulation:incident:${tenantId}:${incidentId}:m`,
  
  /** Per-tenant concurrent: rate:simulation:tenant:{tenantId}:concurrent */
  perTenantConcurrent: (tenantId: string) =>
    `rate:simulation:tenant:${tenantId}:concurrent`,
  
  /** Daily limit: rate:simulation:tenant:{tenantId}:daily:{yyyy-mm-dd} */
  daily: (tenantId: string, date: string) =>
    `rate:simulation:tenant:${tenantId}:daily:${date}`,
  
  /** Run lease: rate:simulation:run:{runId}:lease */
  runLease: (runId: string) =>
    `rate:simulation:run:${runId}:lease`,
} as const;

/** Get UTC date string for daily key */
export function getUtcDateString(clock: IClock): string {
  return clock.nowIso().slice(0, 10); // yyyy-mm-dd
}
```

### 3. Simulation Rate Limit Guard

```typescript
// simulation-rate-limit.guard.ts

export interface ISimulationRateLimitGuard {
  canActivate(context: ExecutionContext): Promise<boolean>;
  acquireToken(tenantId: string, incidentId: string, runId: string): Promise<AcquireResult>;
  releaseToken(tenantId: string, runId: string): Promise<void>;
}

export interface AcquireResult {
  acquired: boolean;
  reason?: 'CONCURRENT_LIMIT' | 'INCIDENT_LIMIT' | 'DAILY_LIMIT';
  retryAfterSec?: number;
}

@Injectable()
export class SimulationRateLimitGuard implements CanActivate, ISimulationRateLimitGuard {
  constructor(private readonly clock: IClock) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Extract tenantId, incidentId from request
    // Check limits in order: concurrent → incident → daily
    // Throw 429 if any limit exceeded
  }

  async acquireToken(tenantId: string, incidentId: string, runId: string): Promise<AcquireResult> {
    // 1. Check concurrent (SCARD)
    // 2. Check incident minute (GET counter)
    // 3. Check daily (GET counter)
    // 4. If all pass: SADD to concurrent, INCR incident, INCR daily, SET lease
  }

  async releaseToken(tenantId: string, runId: string): Promise<void> {
    // SREM from concurrent set
    // DEL lease key
  }
}
```

### 4. Simulation RBAC Guard

```typescript
// simulation-rbac.guard.ts

export interface ISimulationRBACGuard {
  canActivate(context: ExecutionContext): Promise<boolean>;
  validateTenantAccess(requestTenantId: string, resourceTenantId: string, role: string): boolean;
}

@Injectable()
export class SimulationRBACGuard implements CanActivate, ISimulationRBACGuard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const tenantContext = this.extractTenantContext(request);
    
    // tenant-admin: only own tenant
    // internal-ops: any tenant
    // tenant-admin with tenantId override: REJECT (403)
  }

  validateTenantAccess(requestTenantId: string, resourceTenantId: string, role: string): boolean {
    if (role === 'internal-ops') return true;
    if (role === 'tenant-admin') return requestTenantId === resourceTenantId;
    return false;
  }
}
```

### 5. Simulation Controller

```typescript
// simulation.controller.ts

@Controller('incidents')
@UseGuards(SimulationFeatureFlagGuard, SimulationRBACGuard, SimulationRateLimitGuard)
export class SimulationController {
  
  @Post(':id/simulate')
  async simulate(
    @Param('id') incidentId: string,
    @Body() body?: SimulateRequestDto,
  ): Promise<SimulateResponseDto> {
    // Returns: { runId, verdict, driftScore, evidenceStatus, driftBlocked, evidenceGateReason? }
  }

  @Get(':id/runs')
  async listRuns(
    @Param('id') incidentId: string,
    @Query('limit') limit?: number,
    @Query('cursor') cursor?: string,
  ): Promise<RunListResponseDto> {
    // Returns: run summaries (newest → oldest)
  }

  @Get(':id/runs/latest')
  async getLatestRun(
    @Param('id') incidentId: string,
  ): Promise<LatestRunResponseDto> {
    // Returns: { latestRun: RunSummary | null }
  }

  @Get(':id/runs/:runId')
  async getRun(
    @Param('id') incidentId: string,
    @Param('runId') runId: string,
  ): Promise<RunDetailResponseDto> {
    // Returns: run summary (expandable)
  }
}
```

### 6. Evidence Bundle Controller

```typescript
// evidence-bundle.controller.ts

@Controller()
export class EvidenceBundleController {
  
  @Post('incidents/:id/runs/:runId/export-bundle')
  @UseGuards(SimulationFeatureFlagGuard, SimulationRBACGuard)
  async exportBundle(
    @Param('id') incidentId: string,
    @Param('runId') runId: string,
  ): Promise<ExportBundleResponseDto> {
    // Returns: { bundleId, contentHash }
  }

  @Get('evidence-bundles/:bundleId')
  @UseGuards(SimulationRBACGuard)
  async getBundle(
    @Param('bundleId') bundleId: string,
  ): Promise<BundleResponseDto> {
    // Returns: bundle meta + payload
  }

  @Get('evidence-bundles/:bundleId/verify')
  async verifyBundle(
    @Param('bundleId') bundleId: string,
  ): Promise<VerifyBundleResponseDto> {
    // Returns: { ok: boolean, expectedHash, actualHash }
  }
}
```

### 7. Legal Hold Controller

```typescript
// legal-hold.controller.ts

@Controller('legal-holds')
export class LegalHoldController {
  
  @Get()
  @UseGuards(SimulationRBACGuard)
  async listLegalHolds(
    @Query('incidentId') incidentId?: string,
    @Query('tenantId') tenantId?: string,
  ): Promise<LegalHoldListResponseDto> {
    // tenant-admin: only own tenant (tenantId query ignored)
    // internal-ops: any tenant
  }

  @Post(':snapshotId/archive')
  @UseGuards(SimulationFeatureFlagGuard, SimulationRBACGuard)
  async archiveLegalHold(
    @Param('snapshotId') snapshotId: string,
  ): Promise<ArchiveResponseDto> {
    // Baseline → 409 CANNOT_ARCHIVE_BASELINE
    // Returns: { archived: true }
  }

  @Get('stats')
  @UseGuards(SimulationRBACGuard)
  async getStats(): Promise<LegalHoldStatsResponseDto> {
    // Returns: { totalCount, byIncidentCount, oldestHoldAt, averageAgeDays }
  }
}
```

## Data Models

### Request/Response DTOs

```typescript
// simulation.dto.ts

export interface SimulateRequestDto {
  scenarioId?: string;
  seed?: number;
}

export interface SimulateResponseDto {
  runId: string;
  verdict: EvidenceVerdict;
  driftScore: number;
  evidenceStatus: 'OK' | 'STALE' | 'LOW_CONFIDENCE';
  driftBlocked: boolean;
  evidenceGateReason?: string;
}

export interface RunSummaryDto {
  runId: string;
  scenarioId: string;
  seed: number;
  verdict: EvidenceVerdict;
  driftScore: number;
  createdAt: string;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED';
}

export interface RunListResponseDto {
  runs: RunSummaryDto[];
  pagination: {
    limit: number;
    cursor?: string;
    nextCursor?: string;
    hasMore: boolean;
  };
}

export interface LatestRunResponseDto {
  latestRun: RunSummaryDto | null;
}

export interface ExportBundleResponseDto {
  bundleId: string;
  contentHash: string;
}

export interface VerifyBundleResponseDto {
  ok: boolean;
  expectedHash: string;
  actualHash: string;
}

export interface LegalHoldEntryDto {
  snapshotId: string;
  incidentId: string;
  tenantId: string;
  createdAt: string;
  reason: string;
}

export interface LegalHoldStatsResponseDto {
  totalCount: number;
  byIncidentCount: Record<string, number>;
  oldestHoldAt: string | null;
  averageAgeDays: number;
}
```

### Error Response Types

```typescript
// simulation-error.types.ts

export type SimulationErrorCode =
  | 'SIMULATION_DISABLED'
  | 'INCIDENT_NOT_FOUND'
  | 'RUN_NOT_FOUND'
  | 'BUNDLE_NOT_FOUND'
  | 'FORBIDDEN_TENANT_SCOPE'
  | 'SIMULATION_ALREADY_RUNNING'
  | 'TOO_MANY_SIMULATIONS'
  | 'CANNOT_ARCHIVE_BASELINE';

export interface SimulationErrorResponse {
  statusCode: number;
  error: string;
  message: string;
  details?: {
    retryAfter?: number;
    limitType?: 'concurrent' | 'incident' | 'daily';
    errorCode?: SimulationErrorCode;
  };
}
```



## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Feature Flag Blocks Mutations

*For any* mutation endpoint (POST /simulate, POST /export-bundle, POST /archive), when SIMULATION_ENABLED=false, the system SHALL return 503 SIMULATION_DISABLED regardless of request validity.

**Validates: Requirements 1.2, 1.3, 1.4**

### Property 2: Feature Flag Allows Reads

*For any* read endpoint (GET /runs, GET /runs/latest, GET /runs/:runId, GET /evidence-bundles/:bundleId, GET /legal-holds, GET /legal-holds/stats), when SIMULATION_ENABLED=false, the system SHALL process the request normally (not return 503).

**Validates: Requirements 1.5, 1.6, 1.7**

### Property 3: Rate Limit Check Order

*For any* simulation request where concurrent limit is full, the system SHALL return 429 immediately without checking per-incident or daily limits.

**Validates: Requirements 3.2, 3.3, 3.4**

### Property 4: Concurrent Limit Enforcement

*For any* tenant with exactly 5 concurrent simulations running, the 6th simulation request SHALL return 429 TOO_MANY_SIMULATIONS with limitType='concurrent'.

**Validates: Requirements 3.5**

### Property 5: Per-Incident Limit Enforcement

*For any* incident, if a simulation was started within the last 60 seconds, a second simulation request for the same incident SHALL return 429 TOO_MANY_SIMULATIONS with limitType='incident'.

**Validates: Requirements 3.6**

### Property 6: Daily Limit with UTC Reset

*For any* tenant with exactly 100 simulations on a given UTC day, the 101st simulation request on the same day SHALL return 429. A request on the next UTC day SHALL succeed (counter reset).

**Validates: Requirements 3.7, 2.6**

### Property 7: Token Acquire/Release Round-Trip

*For any* simulation run, the concurrent count SHALL increase by 1 when the run starts and decrease by 1 when the run completes (regardless of success/failure).

**Validates: Requirements 3.8, 3.9**

### Property 8: RBAC Tenant Isolation

*For any* tenant-admin user and any incident, access SHALL be granted if and only if incident.tenantId equals the user's tenantId. Otherwise, 403 FORBIDDEN_TENANT_SCOPE SHALL be returned.

**Validates: Requirements 4.1, 4.2**

### Property 9: Internal-Ops Cross-Tenant Access

*For any* internal-ops user and any tenant's data, access SHALL be granted regardless of tenantId.

**Validates: Requirements 4.3**

### Property 10: Baseline Cannot Be Archived

*For any* snapshot that is the baseline for an incident, attempting to archive it SHALL return 409 CANNOT_ARCHIVE_BASELINE.

**Validates: Requirements 13.1**

### Property 11: Bundle Verify Integrity

*For any* exported evidence bundle, verifying it immediately after export SHALL return `{ ok: true, expectedHash, actualHash }` where expectedHash equals actualHash.

**Validates: Requirements 11.1, 11.2**

### Property 12: Run List Ordering

*For any* incident with multiple simulation runs, listing runs SHALL return them ordered by createdAt descending (newest first).

**Validates: Requirements 6.2**

## Error Handling

### Error Response Matrix

| Scenario | Status | Error Code | Message |
|----------|--------|------------|---------|
| Feature disabled (mutation) | 503 | SIMULATION_DISABLED | Simulation feature is disabled |
| Incident not found | 404 | INCIDENT_NOT_FOUND | Incident {id} not found |
| Run not found | 404 | RUN_NOT_FOUND | Run {runId} not found |
| Bundle not found | 404 | BUNDLE_NOT_FOUND | Bundle {bundleId} not found |
| Wrong tenant | 403 | FORBIDDEN_TENANT_SCOPE | Access denied to requested tenant scope |
| Tenant override attempt | 403 | FORBIDDEN_TENANT_SCOPE | Tenant override not allowed |
| Unauthenticated | 401 | UNAUTHORIZED | Authentication required |
| Simulation running | 409 | SIMULATION_ALREADY_RUNNING | Simulation already running for this incident |
| Archive baseline | 409 | CANNOT_ARCHIVE_BASELINE | Cannot archive baseline snapshot |
| Concurrent limit | 429 | TOO_MANY_SIMULATIONS | Concurrent simulation limit exceeded |
| Incident limit | 429 | TOO_MANY_SIMULATIONS | Per-incident rate limit exceeded |
| Daily limit | 429 | TOO_MANY_SIMULATIONS | Daily simulation limit exceeded |

### Error Response Structure

```typescript
interface ErrorResponse {
  statusCode: number;
  error: string;
  message: string;
  details?: {
    errorCode: string;
    retryAfter?: number;      // For 429 errors
    limitType?: string;       // 'concurrent' | 'incident' | 'daily'
    incidentId?: string;      // For context
    runId?: string;           // For context
  };
}
```

### Guard Execution Order

```
1. FeatureFlagGuard → 503 if disabled (mutations only)
2. AuthGuard → 401 if unauthenticated
3. SimulationRBACGuard → 403 if wrong tenant
4. SimulationRateLimitGuard → 429 if limit exceeded
5. Controller → 404/409 for business logic errors
```

## Testing Strategy

### Dual Testing Approach

This feature requires both unit tests and property-based tests:

- **Unit tests**: Verify specific examples, edge cases, error conditions
- **Property tests**: Verify universal properties across all inputs

### Property-Based Testing Configuration

- **Library**: fast-check (TypeScript)
- **Minimum iterations**: 100 per property test
- **Tag format**: `Feature: simulation-api-2f, Property {N}: {title}`

### Test Categories

#### 1. Feature Flag Tests (Property + Unit)

```typescript
// Property test: mutations blocked when disabled
describe('Feature: simulation-api-2f, Property 1: Feature Flag Blocks Mutations', () => {
  it('should return 503 for any mutation when disabled', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('POST /simulate', 'POST /export-bundle', 'POST /archive'),
        (endpoint) => {
          // Set SIMULATION_ENABLED=false
          // Call endpoint
          // Assert 503
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Unit test: specific endpoint
it('POST /simulate returns 503 when disabled', async () => {
  process.env.SIMULATION_ENABLED = 'false';
  const response = await request(app).post('/incidents/inc-1/simulate');
  expect(response.status).toBe(503);
  expect(response.body.error).toBe('SIMULATION_DISABLED');
});
```

#### 2. Rate Limit Tests (Property + Unit with MockClock)

```typescript
// Property test: concurrent limit
describe('Feature: simulation-api-2f, Property 4: Concurrent Limit Enforcement', () => {
  it('should reject 6th concurrent simulation', () => {
    fc.assert(
      fc.property(
        fc.array(fc.uuid(), { minLength: 6, maxLength: 6 }),
        (runIds) => {
          const guard = new SimulationRateLimitGuard(mockClock);
          // Acquire 5 tokens
          for (let i = 0; i < 5; i++) {
            const result = guard.acquireToken(tenantId, incidentId, runIds[i]);
            expect(result.acquired).toBe(true);
          }
          // 6th should fail
          const result = guard.acquireToken(tenantId, incidentId, runIds[5]);
          expect(result.acquired).toBe(false);
          expect(result.reason).toBe('CONCURRENT_LIMIT');
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Unit test: per-incident with MockClock
it('should reject 2nd request within 1 minute', async () => {
  const clock = new MockClockService(new Date('2024-01-15T10:00:00Z'));
  const guard = new SimulationRateLimitGuard(clock);
  
  // First request succeeds
  const r1 = await guard.acquireToken('tenant-1', 'inc-1', 'run-1');
  expect(r1.acquired).toBe(true);
  
  // Second request within 1 min fails
  clock.advanceSeconds(30);
  const r2 = await guard.acquireToken('tenant-1', 'inc-1', 'run-2');
  expect(r2.acquired).toBe(false);
  expect(r2.reason).toBe('INCIDENT_LIMIT');
  
  // After 1 min succeeds
  clock.advanceSeconds(31);
  const r3 = await guard.acquireToken('tenant-1', 'inc-1', 'run-3');
  expect(r3.acquired).toBe(true);
});

// Unit test: daily reset at UTC midnight
it('should reset daily counter at UTC midnight', async () => {
  const clock = new MockClockService(new Date('2024-01-15T23:59:00Z'));
  const guard = new SimulationRateLimitGuard(clock);
  
  // Exhaust daily limit (100)
  for (let i = 0; i < 100; i++) {
    await guard.acquireToken('tenant-1', `inc-${i}`, `run-${i}`);
  }
  
  // 101st fails
  const r101 = await guard.acquireToken('tenant-1', 'inc-100', 'run-100');
  expect(r101.acquired).toBe(false);
  expect(r101.reason).toBe('DAILY_LIMIT');
  
  // Advance to next UTC day
  clock.advanceMinutes(2); // Now 2024-01-16T00:01:00Z
  
  // First request of new day succeeds
  const r1 = await guard.acquireToken('tenant-1', 'inc-new', 'run-new');
  expect(r1.acquired).toBe(true);
});
```

#### 3. RBAC Tests (Property + Unit)

```typescript
// Property test: tenant isolation
describe('Feature: simulation-api-2f, Property 8: RBAC Tenant Isolation', () => {
  it('tenant-admin can only access own tenant', () => {
    fc.assert(
      fc.property(
        fc.record({
          userTenantId: fc.uuid(),
          resourceTenantId: fc.uuid(),
        }),
        ({ userTenantId, resourceTenantId }) => {
          const guard = new SimulationRBACGuard();
          const allowed = guard.validateTenantAccess(userTenantId, resourceTenantId, 'tenant-admin');
          expect(allowed).toBe(userTenantId === resourceTenantId);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Property test: internal-ops cross-tenant
describe('Feature: simulation-api-2f, Property 9: Internal-Ops Cross-Tenant Access', () => {
  it('internal-ops can access any tenant', () => {
    fc.assert(
      fc.property(
        fc.record({
          userTenantId: fc.uuid(),
          resourceTenantId: fc.uuid(),
        }),
        ({ userTenantId, resourceTenantId }) => {
          const guard = new SimulationRBACGuard();
          const allowed = guard.validateTenantAccess(userTenantId, resourceTenantId, 'internal-ops');
          expect(allowed).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});
```

#### 4. Bundle Verify Tests (Property)

```typescript
// Property test: round-trip integrity
describe('Feature: simulation-api-2f, Property 11: Bundle Verify Integrity', () => {
  it('exported bundle verifies successfully', () => {
    fc.assert(
      fc.property(
        arbitrarySimulationRun(),
        async (run) => {
          // Export bundle
          const { bundleId, contentHash } = await bundleService.export(run);
          
          // Verify immediately
          const result = await bundleService.verify(bundleId);
          
          expect(result.ok).toBe(true);
          expect(result.expectedHash).toBe(contentHash);
          expect(result.actualHash).toBe(contentHash);
        }
      ),
      { numRuns: 100 }
    );
  });
});
```

#### 5. Run List Ordering Tests (Property)

```typescript
// Property test: newest first ordering
describe('Feature: simulation-api-2f, Property 12: Run List Ordering', () => {
  it('runs are ordered newest first', () => {
    fc.assert(
      fc.property(
        fc.array(arbitraryRunSummary(), { minLength: 2, maxLength: 20 }),
        async (runs) => {
          // Store runs
          for (const run of runs) {
            await runStore.save(run);
          }
          
          // List runs
          const result = await controller.listRuns(incidentId);
          
          // Verify ordering
          for (let i = 1; i < result.runs.length; i++) {
            const prev = new Date(result.runs[i - 1].createdAt);
            const curr = new Date(result.runs[i].createdAt);
            expect(prev.getTime()).toBeGreaterThanOrEqual(curr.getTime());
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
```

### Test Plan Summary (2F Exit Criteria)

| Test | Type | Property |
|------|------|----------|
| Feature flag: disabled → simulate → 503 | Unit | P1 |
| RBAC: tenant-admin own tenant OK | Property | P8 |
| RBAC: tenant-admin other tenant forbidden | Property | P8 |
| RBAC: internal-ops cross-tenant OK | Property | P9 |
| Rate-limit: same incident 2nd within 1 min → 429 | Unit (MockClock) | P5 |
| Rate-limit: 6th concurrent → 429 | Property | P4 |
| Rate-limit: daily 101 → 429, next day reset | Unit (MockClock) | P6 |
| Runs: simulate → run summary written | Unit | - |
| Runs: list/latest/runId get correct | Unit | P12 |
| Bundle: export → bundleId returned | Unit | - |
| Bundle: get → payload returned | Unit | - |
| Bundle: verify → ok true | Property | P11 |
| Legal holds: list with RBAC | Unit | - |
| Legal holds: archive baseline → 409 | Property | P10 |
| Legal holds: stats calculation | Unit | - |


## Production Notes & Known Limitations

### Two-Level Feature Control

The Simulation API implements a two-level feature control mechanism:

| Level | Environment Variable | Effect |
|-------|---------------------|--------|
| Deployment | `SIMULATION_API_ENABLED` | `false` → Module not loaded, no routes exposed |
| Runtime | `SIMULATION_ENABLED` | `false` → 503 for mutations, reads work |

This provides maximum flexibility:
- **Security**: Completely hide the API surface in production until ready
- **Operations**: Temporarily disable writes without redeployment
- **Gradual rollout**: Enable routes but disable mutations during testing

### In-Memory Storage (MVP Limitations)

The following services use in-memory storage for MVP simplicity. **These must be migrated to persistent storage before production deployment:**

| Service | Data | Risk |
|---------|------|------|
| `SimulationRunStoreService` | Run history, results | Data lost on restart |
| `BundleStore` (in EvidenceBundleService) | Exported bundles | Data lost on restart |
| `SimulationRateLimitGuard` stores | Rate limit counters | Limits reset on restart, no multi-instance support |

**Production Migration Path:**
1. Rate limit stores → Redis (INCR, SADD/SREM, TTL already compatible)
2. Run store → PostgreSQL with `simulation_runs` table
3. Bundle store → S3/MinIO with PostgreSQL metadata

### Multi-Instance Deployment

Current implementation is **single-instance only**. For multi-instance deployment:
- Rate limiting requires shared Redis
- Run store requires shared database
- Bundle store requires shared object storage

### Recommended Production Configuration

```bash
# Deployment level - enable when ready
SIMULATION_API_ENABLED=true

# Runtime level - start disabled, enable after validation
SIMULATION_ENABLED=false

# Rate limits (can be overridden)
SIMULATION_RATE_LIMIT_CONCURRENT=5
SIMULATION_RATE_LIMIT_DAILY=100
SIMULATION_RATE_LIMIT_INCIDENT_TTL_SEC=60
```

## Phase 8 Closure

Sprint 2F completes Phase 8 (Simulation + Evidence + Incident Loop). All components are:
- ✅ Implemented with full test coverage (88 tests)
- ✅ Property-tested for correctness guarantees
- ✅ Integrated into app.module.ts with conditional loading
- ✅ Documented with production notes

**Next phases may include:**
- Phase 9: Production hardening (Redis migration, observability)
- Diagnostics expansion (new endpoints, metrics)
- UI/ops workflow integration
