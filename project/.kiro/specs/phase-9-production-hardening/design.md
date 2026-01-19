# Design Document: Phase 9 Production Hardening

## Overview

Phase 9 Production Hardening is the umbrella phase coordinating the migration from in-memory storage to production-ready persistent storage. The migration is structured as three independent sub-sprints, each targeting a different storage layer with distinct risk profiles and technology choices.

### Sprint Structure

| Sprint | Layer | Technology | Risk Profile | Key Concern |
|--------|-------|------------|--------------|-------------|
| 9A | Operational | Redis | Availability | System can't make decisions |
| 9B | Truth | PostgreSQL | Integrity | Wrong legal decisions |
| 9C | Infrastructure | S3/MinIO | Cost/Scale | Burning money or losing evidence |

### Migration Philosophy

1. **Interface Preservation**: All migrations implement existing interfaces
2. **Fallback First**: Each layer has fallback to in-memory
3. **Test Continuity**: All 88 tests must pass after each sprint
4. **Independent Deployment**: Each sprint can be deployed separately

## Architecture

### Current State (In-Memory)

```
┌─────────────────────────────────────────────────────────────────┐
│                     Diagnostics Module                          │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │ Rate Limit      │  │ Simulation Run  │  │ Evidence Bundle │ │
│  │ Guard           │  │ Store           │  │ Service         │ │
│  │ (In-Memory)     │  │ (In-Memory)     │  │ (In-Memory)     │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
│  ┌─────────────────┐  ┌─────────────────┐                      │
│  │ Incident Store  │  │ Snapshot Store  │                      │
│  │ (In-Memory)     │  │ (In-Memory)     │                      │
│  └─────────────────┘  └─────────────────┘                      │
└─────────────────────────────────────────────────────────────────┘
```

### Target State (Persistent)

```
┌─────────────────────────────────────────────────────────────────┐
│                     Diagnostics Module                          │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │ Rate Limit      │  │ Simulation Run  │  │ Evidence Bundle │ │
│  │ Guard           │  │ Store           │  │ Service         │ │
│  │ (Redis)         │  │ (PostgreSQL)    │  │ (S3/MinIO)      │ │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘ │
│           │                    │                    │          │
│  ┌────────▼────────┐  ┌────────▼────────┐  ┌────────▼────────┐ │
│  │ In-Memory       │  │ In-Memory       │  │ In-Memory       │ │
│  │ Fallback        │  │ Fallback        │  │ Queue           │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
│  ┌─────────────────┐  ┌─────────────────┐                      │
│  │ Incident Store  │  │ Snapshot Store  │                      │
│  │ (PostgreSQL)    │  │ (PostgreSQL)    │                      │
│  └─────────────────┘  └─────────────────┘                      │
└─────────────────────────────────────────────────────────────────┘
         │                      │                    │
         ▼                      ▼                    ▼
    ┌─────────┐           ┌──────────┐         ┌─────────┐
    │  Redis  │           │PostgreSQL│         │ S3/MinIO│
    └─────────┘           └──────────┘         └─────────┘
```

## Components and Interfaces

### Storage Provider Interface

Each storage layer implements a provider pattern with fallback:

```typescript
interface IStorageProvider<T> {
  readonly name: string;
  readonly isHealthy: boolean;
  
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  healthCheck(): Promise<boolean>;
}

interface IFallbackStrategy {
  shouldFallback(error: Error): boolean;
  onFallbackActivated(): void;
  onFallbackDeactivated(): void;
}
```

### Configuration Interface

```typescript
interface Phase9Config {
  redis: {
    enabled: boolean;
    url: string;
    fallbackEnabled: boolean;
  };
  postgresql: {
    enabled: boolean;
    connectionString: string;
    fallbackEnabled: boolean;
  };
  s3: {
    enabled: boolean;
    endpoint: string;
    bucket: string;
    fallbackEnabled: boolean;
  };
}
```

### Feature Flag Strategy

```typescript
// Environment-based feature flags
PHASE9_REDIS_ENABLED=true|false
PHASE9_POSTGRESQL_ENABLED=true|false
PHASE9_S3_ENABLED=true|false

// Fallback behavior
PHASE9_REDIS_FALLBACK=true|false
PHASE9_POSTGRESQL_FALLBACK=true|false
PHASE9_S3_FALLBACK=true|false
```

## Data Models

### Migration State Tracking

```typescript
interface MigrationState {
  sprint: '9A' | '9B' | '9C';
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'ROLLED_BACK';
  startedAt?: string;
  completedAt?: string;
  rollbackReason?: string;
  testPassRate: number;
  checksumValidation: boolean;
}
```

### Rollback Checkpoint

```typescript
interface RollbackCheckpoint {
  sprintId: string;
  createdAt: string;
  configSnapshot: Phase9Config;
  testResults: {
    total: number;
    passed: number;
    failed: number;
  };
  canRollback: boolean;
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Sprint Independence

*For any* combination of sprint deployments (9A, 9B, 9C), the system shall function correctly with any subset of sprints deployed, using in-memory fallback for non-deployed layers.

**Validates: Requirements 1.1, 1.2, 6.1, 6.2, 6.3**

### Property 2: API Contract Preservation

*For any* API request that succeeded before Phase 9, the same request with the same inputs shall produce the same response structure after any sprint deployment.

**Validates: Requirements 1.4**

### Property 3: Test Continuity

*For any* test in the existing test suite, if it passed before Phase 9, it shall pass after each sprint deployment.

**Validates: Requirements 4.1, 4.2, 4.3, 4.4**

### Property 4: Rollback Completeness

*For any* rollback operation, the system shall return to the exact previous configuration state within the specified time limit.

**Validates: Requirements 1.3, 5.1, 5.2, 5.3, 5.4**

### Property 5: Data Integrity Preservation

*For any* data that existed before migration, the data shall be identical (verified by checksum) after migration.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4**

## Error Handling

### Sprint Deployment Errors

| Error | Detection | Response |
|-------|-----------|----------|
| Connection failure | Health check | Activate fallback |
| Test failure | CI pipeline | Block deployment |
| Data corruption | Checksum mismatch | Trigger rollback |
| Performance degradation | Latency metrics | Alert + investigate |

### Rollback Triggers

1. **Automatic**: Test pass rate < 100%
2. **Automatic**: Determinism check failure
3. **Automatic**: Data integrity check failure
4. **Manual**: Operator decision based on metrics

## Testing Strategy

### Test Categories

1. **Unit Tests**: Each sprint's components in isolation
2. **Integration Tests**: Sprint components with real backends (containerized)
3. **Migration Tests**: Data migration correctness
4. **Rollback Tests**: Rollback procedure verification
5. **Property Tests**: Universal properties across all configurations

### Test Environment Matrix

| Environment | Redis | PostgreSQL | S3 |
|-------------|-------|------------|-----|
| Unit Tests | Mock | Mock | Mock |
| Integration | Container | Container | MinIO |
| Staging | Managed | Managed | S3 |
| Production | Managed | Managed | S3 |

### Dual Backend Testing

All existing tests must support running against both in-memory and persistent backends:

```typescript
describe.each(['in-memory', 'redis'])('Rate Limit Guard (%s)', (backend) => {
  // Tests run twice: once with in-memory, once with Redis
});
```

---

## Cross-Tenant Break-Glass Access Architecture (Step 4)

### Purpose

Maintain absolute tenant isolation as the default policy while providing a controlled, auditable, dual-approval exception mechanism for mandatory operational scenarios (support, incident response, legal requests, audit).

### Core Principles

| Principle | Description |
|-----------|-------------|
| Default Policy (A) | Cross-tenant access is **FORBIDDEN** by default |
| Exception Mechanism (B) | Break-glass is a controlled exception layered on top of A |
| A + B Together | Neither alone is sufficient; both are required |

### Security Model

#### 1. TenantContext Source Resolution

TenantContext is extracted from a **single authoritative source**:

**External Requests (user-facing / admin portal):**
- Source: JWT claim `tenantId`
- Header/path param tenant extraction is **FORBIDDEN** (spoof risk)

**Service-to-Service Calls (internal):**
- Preferred: Service account JWT (audience + issuer validation)
- Alternative: `X-Internal-Tenant-Id` + `X-Internal-Signature` (HMAC)
  - Signature: `HMAC(method + path + timestamp + tenantId + bodyHash)`
  - Replay protection: timestamp + nonce cache

**Rule:** Regardless of source, `TenantContextResolver` produces a single canonical:

```typescript
interface TenantContext {
  tenantId: string;
  actor: ActorIdentity;
  authType: 'JWT' | 'SERVICE_ACCOUNT' | 'INTERNAL_HMAC';
  scopes: string[];
}
```

#### 2. Scope Granularity

No generic `cross_tenant_read` scope. Resource-specific scopes only:

| Scope | Resource |
|-------|----------|
| `cross_tenant_read:snapshot` | Simulation snapshots |
| `cross_tenant_read:legal_hold` | Legal hold records |
| `cross_tenant_read:evidence_bundle` | Evidence bundles (future) |
| `cross_tenant_read:incident` | Incident records (future) |

#### 3. Network / IP Restriction

Break-glass flow and cross-tenant endpoints are accessible **only** from:
- Internal network / VPN
- Enforcement: CIDR allowlist + mTLS (if available) + WAF rule

```typescript
interface NetworkRestriction {
  allowedCidrs: string[];  // e.g., ['10.0.0.0/8', '172.16.0.0/12']
  requireMtls: boolean;
  wafRuleId?: string;
}
```

#### 4. Structured Reason (Validated)

Break-glass requests require structured reason:

```typescript
interface BreakGlassReason {
  category: 'CUSTOMER_SUPPORT' | 'INCIDENT_RESPONSE' | 'LEGAL_REQUEST' | 'AUDIT';
  ticketRef: string;        // Required, pattern: /^[A-Z]+-\d+$/ or org format
  description?: string;     // Optional, max 500 chars, trimmed
}
```

**Validation Rules:**
- `ticketRef` cannot be empty, must match regex
- `description` trimmed, max 500 characters
- `category` must be valid enum value

#### 5. Four-Eyes Principle (Dual Approval)

Break-glass activation requires **two distinct actors**:

| Role | Action |
|------|--------|
| Requester | Creates break-glass request (ops team member) |
| Approver | Approves request (ops lead / security) |

**Rules:**
- Same person **cannot** request and approve
- Approval window: 30 minutes (configurable)
- Unapproved requests expire automatically

```typescript
interface BreakGlassRequest {
  requestId: string;
  requesterId: string;
  reason: BreakGlassReason;
  targetTenantId: string;
  requestedScopes: string[];
  requestedAt: string;
  expiresAt: string;        // requestedAt + 30min
  status: 'PENDING' | 'APPROVED' | 'DENIED' | 'EXPIRED';
}

interface BreakGlassGrant {
  grantId: string;
  requestId: string;
  approverId: string;
  grantedScopes: string[];
  grantedAt: string;
  expiresAt: string;        // grantedAt + 15min
  renewalCount: number;
  maxRenewals: number;      // 3
}
```

#### 6. Time-Bound Token + Renewal Cap

| Parameter | Value |
|-----------|-------|
| Initial TTL | 15 minutes |
| Max renewals | 3 |
| Total max duration | 60 minutes |
| Renewal approval | Not required (same ticketRef) |

**Renewal Constraints:**
- Only same `ticketRef` can renew
- Abnormal usage patterns trigger circuit breaker

#### 7. Circuit Breaker (Abuse Control)

Break-glass system can self-disable under abuse:

```typescript
interface BreakGlassCircuitBreaker {
  window: '1h';
  maxGranted: 10;           // env configurable
  action: 'DISABLE_AND_ALERT';
  resetRequires: 'SECURITY_OVERRIDE';
}
```

When triggered:
- All new requests/approvals return 503
- Security team alerted
- Only security override can re-enable

#### 8. Post-Mortem Requirement

Every break-glass `USED` event triggers post-mortem obligation:

| Requirement | Value |
|-------------|-------|
| Deadline | 48 hours from first USED event |
| Enforcement | Missing post-mortem blocks requester's future requests |
| Alternative | Approval requirements escalate (e.g., 2 approvers) |

### Audit Event Model

Event-sourcing style audit trail with **six event types**:

| Event | Trigger |
|-------|---------|
| `CROSS_TENANT_ACCESS_REQUESTED` | Request created |
| `CROSS_TENANT_ACCESS_GRANTED` | Request approved |
| `CROSS_TENANT_ACCESS_DENIED` | Request rejected |
| `CROSS_TENANT_ACCESS_USED` | Grant actually used for access |
| `CROSS_TENANT_ACCESS_EXPIRED` | Grant TTL expired |
| `CROSS_TENANT_ACCESS_REVOKED` | Grant manually revoked |

**Event Payload (minimum):**

```typescript
interface CrossTenantAuditEvent {
  eventType: CrossTenantEventType;
  requestId: string;
  grantId?: string;
  requesterId: string;
  approverId?: string;
  targetTenantId: string;
  resourceScope: string;
  reason: {
    category: string;
    ticketRef: string;
    descriptionTruncated?: string;  // max 100 chars
  };
  network: {
    ip: string;
    userAgent: string;
  };
  authType: string;
  timestamp: string;
  outcome: 'ALLOWED' | 'DENIED';
  correlationId: string;
  traceId: string;
}
```

**KVKK/PII Rule:** Never log raw evidence payload. Only IDs.

### Endpoint Design

#### Break-Glass Management Endpoints

```
POST /api/v1/internal-ops/break-glass/request
  Body: { targetTenantId, scopes[], reason }
  Response: { requestId, expiresAt }

POST /api/v1/internal-ops/break-glass/approve
  Body: { requestId }
  Response: { grantId, token, expiresAt }

POST /api/v1/internal-ops/break-glass/revoke
  Body: { grantId, reason }
  Response: { success }

GET /api/v1/internal-ops/break-glass/status/:requestId
  Response: { request, grant?, auditTrail[] }
```

#### Cross-Tenant Access Endpoints (Read-Only)

```
GET /api/v1/internal-ops/cross-tenant/:tenantId/snapshots
GET /api/v1/internal-ops/cross-tenant/:tenantId/snapshots/:snapshotId
GET /api/v1/internal-ops/cross-tenant/:tenantId/legal-holds
GET /api/v1/internal-ops/cross-tenant/:tenantId/legal-holds/:holdId
```

**Rule:** These endpoints use dedicated guards, not shared with normal controllers:
- `InternalOpsGuard`
- `BreakGlassGrantGuard`
- `NetworkAllowlistGuard`

### Runtime Enforcement Flow

#### Request Flow

```
1. Network allowlist check → 403 if outside VPN
2. Requester role check → 403 if not internal_ops
3. Reason validation → 400 if invalid
4. Circuit breaker check → 503 if tripped
5. Create request → audit: REQUESTED
6. Return requestId + expiresAt
```

#### Approve Flow

```
1. Network allowlist check → 403 if outside VPN
2. Approver role check → 403 if not ops_lead/security
3. Requester != Approver check → 403 if same person
4. Request not expired check → 410 if expired
5. Circuit breaker check → 503 if tripped
6. Generate time-bound token (15min TTL, 3 renewals)
7. Audit: GRANTED
8. Return grantId + token + expiresAt
```

#### Cross-Tenant Access Flow

```
1. Network allowlist check → 403 if outside VPN
2. Verify break-glass token:
   - Valid signature
   - Not expired
   - Scope matches resource
   - Renewal cap not exceeded
3. Enforce READ-only (no mutations)
4. Audit: USED (resource IDs only, no payload)
5. Return data
```

#### Expiry Job

```
1. Find expired grants
2. Audit: EXPIRED for each
3. Start post-mortem watchdog timer (48h)
4. After 48h: check post-mortem exists
   - If missing: flag requester for escalated approval
```

### Test Plan (Eliminating the Skipped Test)

The previously skipped "internal-ops cross-tenant access" test is replaced with a comprehensive test suite:

| Test Case | Expected Result |
|-----------|-----------------|
| Default: cross-tenant call without grant | 403 Forbidden |
| Break-glass request → approve → access | 200 OK |
| Wrong scope in grant | 403 Forbidden |
| Same requester approving own request | 403 Forbidden |
| Request from outside VPN CIDR | 403 Forbidden |
| Renewal count > 3 | 403 Forbidden |
| Expired grant | 401 Unauthorized |
| Circuit breaker triggered | 503 Service Unavailable + alert |
| Missing post-mortem after 48h | Requester's new requests → 403 |
| Write attempt via cross-tenant endpoint | 405 Method Not Allowed |

### Invariants

These invariants must hold at all times:

1. **No cross-tenant access without grant** - Every cross-tenant data access requires a valid, non-expired break-glass grant
2. **Four-eyes enforced** - No single actor can both request and approve break-glass access
3. **All grants audited** - Every grant lifecycle event (request, approve, deny, use, expire, revoke) produces an immutable audit record
4. **Network boundary enforced** - Break-glass endpoints are unreachable from public internet
5. **Read-only access** - Cross-tenant access is strictly read-only; no mutations permitted

### Configuration

```typescript
interface BreakGlassConfig {
  enabled: boolean;
  network: {
    allowedCidrs: string[];
    requireMtls: boolean;
  };
  timing: {
    requestTtlMinutes: number;      // default: 30
    grantTtlMinutes: number;        // default: 15
    maxRenewals: number;            // default: 3
    postMortemDeadlineHours: number; // default: 48
  };
  circuitBreaker: {
    windowMinutes: number;          // default: 60
    maxGrantsPerWindow: number;     // default: 10
  };
  audit: {
    logLevel: 'FULL' | 'SUMMARY';
    retentionDays: number;          // default: 2555 (7 years)
  };
}
```

### Environment Variables

```bash
# Feature toggle / Kill Switch
BREAK_GLASS_ENABLED=true   # false = all internal-ops endpoints return 503

# Network
BREAK_GLASS_ALLOWED_CIDRS=10.0.0.0/8,172.16.0.0/12
BREAK_GLASS_REQUIRE_MTLS=true

# Timing
BREAK_GLASS_REQUEST_TTL_MINUTES=30
BREAK_GLASS_GRANT_TTL_MINUTES=15
BREAK_GLASS_MAX_RENEWALS=3
BREAK_GLASS_POSTMORTEM_DEADLINE_HOURS=48

# Circuit breaker
BREAK_GLASS_CB_WINDOW_MINUTES=60
BREAK_GLASS_CB_MAX_GRANTS=10

# Audit
BREAK_GLASS_AUDIT_RETENTION_DAYS=2555
```

---

## Implementation Gates

These gates must be satisfied before Step 4 implementation is considered complete.

### Gate 1: TenantContext Source Authority is Singular

**Requirement:** No controller, service, or guard may extract `tenantId` from request headers or path parameters directly. All tenant context must flow through `TenantContextResolver`.

**Enforcement:**

1. **Code Rule:** `TenantContextResolver` is the ONLY component that reads:
   - JWT `tenantId` claim
   - `X-Internal-Tenant-Id` header (with HMAC validation)

2. **Lint/Review Blocker:** Any code outside `TenantContextResolver` that accesses:
   ```typescript
   // FORBIDDEN patterns - must fail code review
   req.headers['x-internal-tenant-id']
   req.headers['x-tenant-id']
   req.params.tenantId  // for auth purposes
   req.query.tenantId   // for auth purposes
   ```

3. **Controller Access:** Controllers receive tenant context only via:
   ```typescript
   // ALLOWED pattern
   @TenantContext() ctx: TenantContext
   // or
   request.tenantContext  // set by TenantContextGuard
   ```

4. **Test Requirement:** Negative tests must verify:
   - Header spoof attempt → 401/403
   - Missing HMAC signature on internal header → 401
   - Invalid HMAC signature → 401

### Gate 2: Break-Glass Token is Distinct from User JWT

**Requirement:** Break-glass grant tokens must be cryptographically distinguishable from normal user JWTs to prevent token confusion attacks.

**Enforcement:**

1. **Token Structure:** Break-glass tokens use:
   ```typescript
   interface BreakGlassToken {
     // Distinct issuer or audience
     iss: 'break-glass-authority';  // NOT same as user JWT issuer
     aud: 'internal-ops';           // NOT same as user JWT audience
     
     // Break-glass specific claims
     bg: true;                      // Boolean flag
     grantId: string;
     targetTenantId: string;
     scopes: string[];              // e.g., ['cross_tenant_read:snapshot']
     renewalsLeft: number;
     
     // Standard claims
     sub: string;                   // approver ID
     iat: number;
     exp: number;
   }
   ```

2. **Signing Key:** Break-glass tokens SHOULD use a separate signing key from user JWTs. If same key is used, the `iss` and `aud` claims MUST differ.

3. **Validation Rule:** `BreakGlassGrantGuard` must:
   - Verify `bg === true` claim exists
   - Verify `iss === 'break-glass-authority'`
   - Reject tokens without these claims even if signature is valid

4. **Security Invariant:** A valid user JWT with added `bg` claim must NOT be accepted as a break-glass token (issuer mismatch will reject it).

### Gate 3: Kill Switch Functionality

**Requirement:** Setting `BREAK_GLASS_ENABLED=false` must immediately disable all internal-ops endpoints.

**Enforcement:**

1. **Behavior when disabled:**
   - All `/api/v1/internal-ops/*` endpoints return `503 Service Unavailable`
   - Response body: `{ "error": "BREAK_GLASS_DISABLED", "message": "Internal ops access is disabled" }`
   - No break-glass requests can be created, approved, or used

2. **Implementation:** `BreakGlassKillSwitchGuard` applied to all internal-ops routes:
   ```typescript
   @Injectable()
   export class BreakGlassKillSwitchGuard implements CanActivate {
     canActivate(): boolean {
       if (!this.config.breakGlass.enabled) {
         throw new ServiceUnavailableException({
           error: 'BREAK_GLASS_DISABLED',
           message: 'Internal ops access is disabled',
         });
       }
       return true;
     }
   }
   ```

3. **Test Requirement:**
   - With `BREAK_GLASS_ENABLED=false`, all internal-ops endpoints → 503
   - Kill switch takes effect without restart (config reload)

---

## Implementation Order (Risk-Minimized)

The following order ensures each layer is secure before building on it:

```
10.1 TenantContext Source Lock-down
  └─► Gate 1 satisfied
      │
10.2 Break-Glass Core Types
  └─► Token structure defined, Gate 2 foundation
      │
10.3 Guards (NetworkGuard, InternalOpsGuard, BreakGlassGrantGuard, KillSwitchGuard)
  └─► Gate 2 + Gate 3 satisfied
      │
10.4 Services (Request, Approval, CircuitBreaker, Audit)
  └─► Business logic with guards protecting it
      │
10.5 Controllers
  └─► Endpoints with full guard chain
      │
10.6 Tests
  └─► Verify all gates + invariants
```

**Critical:** Do not proceed to 10.3+ until Gate 1 tests pass. Do not proceed to 10.5+ until Gate 2 and Gate 3 tests pass.

---

## Step 4 Final Security Decisions (Completed)

### Decision 1: Actor Binding (Option A - authorizedActors)

Token is actor-bound via explicit ID list, not role-based expansion.

```typescript
interface BreakGlassTokenClaims {
  // ... other claims ...
  
  /**
   * Actor binding - explicit list of actor IDs authorized to use this token
   * Default: [requesterId]
   * If policy allows: [requesterId, approverId]
   * Max: 5 IDs (hardcoded limit)
   * NO role-based expansion
   */
  authorizedActors: string[];
  
  /** Requester ID (for audit trail) */
  requesterId: string;
  
  /** Approver ID (for audit trail) */
  approverId: string;
  
  /** Request ID (for audit lookup - replaces ticketRef in token) */
  requestId: string;
}
```

**Guard Check:**
```typescript
// BreakGlassGrantGuard.verifyActorBinding()
if (!claims.authorizedActors.includes(ctx.actorId)) {
  throw new ForbiddenException({
    error: 'TOKEN_NOT_AUTHORIZED_FOR_ACTOR',
    message: 'This break-glass token is not authorized for your identity',
  });
}
```

### Decision 2: renewalsLeft Enforcement Location

- **Guard:** Does NOT check renewalsLeft (only exp and DB ACTIVE)
- **Renew API:** Enforces `renewalsLeft > 0` (strict, not >= 0)

This prevents confusion where a token with `renewalsLeft=0` could still be used for access (which is correct - it just can't be renewed).

### Decision 3: Minimum Disclosure in Token

- `ticketRef` is NOT included in token (minimum disclosure principle)
- `requestId` is included for audit lookup if needed
- If token leaks, internal operation details are not exposed

### Decision 4: Interceptor Audit Pattern

- Uses `mergeMap` (not `tap`) for proper async await
- Audit fail → 500 (strict mode for legal/forensic)
- Controller methods do NOT emit audit - interceptor handles all

```typescript
// CrossTenantAccessInterceptor
return next.handle().pipe(
  mergeMap(async (responseData) => {
    await this.emitUsedAudit(request);  // await ensures audit completes
    return responseData;
  }),
);
```

### Decision 5: Guard Chain for Cross-Tenant Access

```
KillSwitchGuard → NetworkAllowlistGuard → TenantContextGuard → InternalOpsGuard → BreakGlassGrantGuard
```

Each guard has a specific responsibility:
1. **KillSwitchGuard:** 503 when disabled (Gate 3)
2. **NetworkAllowlistGuard:** 403 outside VPN (INV-4)
3. **TenantContextGuard:** Resolves actor identity (Gate 1)
4. **InternalOpsGuard:** Verifies internal_ops role
5. **BreakGlassGrantGuard:** Token validation + actor binding (Gate 2, INV-1)

### Decision 6: Cache Invalidation on Revoke

```typescript
// BreakGlassGrantService.revoke()
grant.isActive = false;
await this.grantRepository.update(grant);
this.statusCache.delete(grantId);  // Immediate cache invalidation
```

Guard uses fail-closed pattern:
- Cache hit → return cached status
- Cache miss → DB lookup
- DB error → deny access (fail-closed)

---

## Step 4 Completion Checklist

| Item | Status |
|------|--------|
| TenantContext single source (Gate 1) | ✅ |
| Break-glass token distinct from user JWT (Gate 2) | ✅ |
| Kill switch functionality (Gate 3) | ✅ |
| Actor binding (authorizedActors) | ✅ |
| renewalsLeft enforcement in renew API only | ✅ |
| ticketRef removed from token | ✅ |
| USED audit in interceptor (not controller) | ✅ |
| Guard chain with TenantContextGuard + InternalOpsGuard | ✅ |
| Cache invalidation on revoke | ✅ |
| All 68 tests passing | ✅ |
| No skipped tests | ✅ |

**Step 4 Status: COMPLETED**

**Security Posture:** Cross-tenant access is now:
- Actor-bound (token cannot be shared/delegated)
- Audited deterministically (interceptor, not controller)
- Minimum disclosure (no ticketRef in token)
- Fail-closed (DB errors deny access)
