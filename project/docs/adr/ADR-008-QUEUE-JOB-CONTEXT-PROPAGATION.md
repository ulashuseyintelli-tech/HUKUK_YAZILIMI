# ADR-008: Queue/Job Boundary Context Propagation

**Status:** Accepted  
**Date:** 2026-02-04  
**Deciders:** Platform Team  
**Related:** ADR-007 (ALS-Only Context Access), PR-7 (Phase 10.3)

## Context

AsyncLocalStorage (ALS) provides request-scoped context propagation within a single process. However, ALS context does NOT cross process boundaries:

- Queue jobs (BullMQ, SQS, etc.)
- Scheduled tasks (cron jobs)
- Event-driven handlers (webhooks, pub/sub)
- Worker processes

When idempotency context is lost at these boundaries:
- `actionId` becomes null → audit correlation breaks
- `requestId` unavailable → distributed tracing gaps
- Takeover metadata lost → incomplete audit trail

This ADR establishes the contract for explicit context propagation across process boundaries.

## Decision

Use a typed `IdempotencyContextCarrier` for explicit context propagation across all process boundaries.

### Carrier Schema

```typescript
/**
 * Typed carrier for cross-boundary context propagation.
 * 
 * RULES:
 * - All fields are serializable (JSON-safe)
 * - No PII (IP addresses, emails, etc.)
 * - Version field for forward compatibility
 */
export interface IdempotencyContextCarrier {
  /** Schema version for forward compatibility */
  readonly version: 1;
  
  /** Original request's idempotency key */
  readonly requestId: string;
  
  /** Gate action ID (correlation anchor) */
  readonly actionId: string;
  
  /** Action type: ADMIN_RETRY | DLQ_REDRIVE | DLQ_RESOLVE */
  readonly actionType: string;
  
  /** Resource type: BUNDLE | DLQ_ENTRY */
  readonly resourceType: string;
  
  /** Resource identifier (nullable) */
  readonly resourceId: string | null;
  
  /** Whether this was a lease takeover */
  readonly takeover: boolean;
  
  /** Previous actor ID if takeover occurred */
  readonly previousActorId: string | null;
}
```

### Producer Contract (MUST)

```typescript
// ✅ CORRECT: Capture context and include in job payload
const ctx = getIdempotencyContext();

queue.add('manifest-retry', {
  bundleId,
  // Explicit carrier - REQUIRED
  idempotencyContext: ctx ? {
    version: 1,
    requestId: ctx.requestId,
    actionId: ctx.actionId,
    actionType: ctx.actionType,
    resourceType: ctx.resourceType,
    resourceId: ctx.resourceId,
    takeover: ctx.takeover,
    previousActorId: ctx.previousActorId,
  } : null,
});

// ❌ WRONG: Assuming ALS crosses process boundaries
queue.add('manifest-retry', { bundleId }); // Context lost!
```

### Consumer Contract (MUST)

```typescript
// ✅ CORRECT: Restore ALS context at job start
async process(job: Job<ManifestRetryPayload>) {
  const carrier = job.data.idempotencyContext;
  
  if (carrier) {
    // Restore ALS context for the job scope
    return IdempotencyALS.run(carrierToContext(carrier), async () => {
      // All downstream services can use getIdempotencyContext()
      await this.retryService.execute(job.data.bundleId);
    });
  }
  
  // No context - run without ALS (degraded correlation)
  this.logger.warn('Job running without idempotency context', { jobId: job.id });
  await this.retryService.execute(job.data.bundleId);
}

// Helper: Convert carrier to IdempotencyContext
function carrierToContext(carrier: IdempotencyContextCarrier): IdempotencyContext {
  return {
    requestId: carrier.requestId,
    actionId: carrier.actionId,
    actionType: carrier.actionType,
    resourceType: carrier.resourceType,
    resourceId: carrier.resourceId,
    takeover: carrier.takeover,
    previousActorId: carrier.previousActorId,
  };
}
```

## Rules

### MUST

1. **Producer**: Every queue/job enqueue MUST include `idempotencyContext` carrier if context exists
2. **Consumer**: Job processor MUST restore ALS context via `IdempotencyALS.run()` before business logic
3. **Carrier**: All fields MUST be JSON-serializable (no functions, no circular refs)
4. **Version**: Carrier MUST include `version: 1` for forward compatibility
5. **Audit**: If `actionId` is null in audit event, log as "degraded correlation" (metric: `audit_degraded_correlation_total`)
6. **Validation**: Consumer MUST validate carrier before restoring context (see Carrier Validation Rules)

### Carrier Validation Rules

Consumer MUST validate carrier at job start. Invalid carriers trigger degraded mode (warn + metric + run without context).

```typescript
type CarrierValidationResult = 
  | { valid: true; context: IdempotencyContext }
  | { valid: false; reason: CarrierDropReason };

type CarrierDropReason = 
  | 'VERSION_MISMATCH'      // version !== 1
  | 'MISSING_REQUIRED'      // requestId, actionId, actionType, resourceType missing
  | 'MALFORMED'             // not an object, null, undefined
  | 'TYPE_ERROR';           // field type mismatch

function validateCarrier(carrier: unknown): CarrierValidationResult {
  // 1. Null/undefined check
  if (carrier == null || typeof carrier !== 'object') {
    return { valid: false, reason: 'MALFORMED' };
  }
  
  const c = carrier as Record<string, unknown>;
  
  // 2. Version check (strict equality)
  if (c.version !== 1) {
    return { valid: false, reason: 'VERSION_MISMATCH' };
  }
  
  // 3. Required fields check
  const required = ['requestId', 'actionId', 'actionType', 'resourceType'];
  for (const field of required) {
    if (typeof c[field] !== 'string' || c[field] === '') {
      return { valid: false, reason: 'MISSING_REQUIRED' };
    }
  }
  
  // 4. Type checks for optional fields
  if (c.resourceId !== null && typeof c.resourceId !== 'string') {
    return { valid: false, reason: 'TYPE_ERROR' };
  }
  if (typeof c.takeover !== 'boolean') {
    return { valid: false, reason: 'TYPE_ERROR' };
  }
  if (c.previousActorId !== null && typeof c.previousActorId !== 'string') {
    return { valid: false, reason: 'TYPE_ERROR' };
  }
  
  // 5. Extra fields: IGNORE (forward compatibility)
  
  return {
    valid: true,
    context: {
      requestId: c.requestId as string,
      actionId: c.actionId as string,
      actionType: c.actionType as string,
      resourceType: c.resourceType as string,
      resourceId: (c.resourceId as string | null) ?? null,
      takeover: c.takeover as boolean,
      previousActorId: (c.previousActorId as string | null) ?? null,
    },
  };
}
```

### Validation Behavior Matrix

| Condition | Action | Metric Label |
|-----------|--------|--------------|
| `carrier === null` | warn + run without ALS | `reason=MALFORMED` |
| `carrier.version !== 1` | warn + drop context | `reason=VERSION_MISMATCH` |
| Required field missing | warn + drop context | `reason=MISSING_REQUIRED` |
| Type mismatch | warn + drop context | `reason=TYPE_ERROR` |
| Extra fields present | ignore (forward compat) | - |
| Valid carrier | restore ALS | - |

### MUST NOT

1. **Global state**: DO NOT use module-level variables or singletons for context
2. **Request object**: DO NOT attach context to request objects (ADR-007)
3. **PII in carrier**: DO NOT include IP addresses, emails, or other PII
4. **Fire-and-forget**: DO NOT use `setImmediate`/`setTimeout` without capturing context first

### SHOULD

1. **Wrapper function**: Provide `enqueueWithContext()` helper to enforce carrier inclusion
2. **Type safety**: Use TypeScript strict mode to catch missing carrier fields
3. **Metrics**: Emit `job_context_propagation_total{has_context}` for observability

## Nested Job Propagation

When a job spawns another job, the propagation rule depends on the logical relationship:

| Scenario | Action | Reason |
|----------|--------|--------|
| Same logical action (e.g., retry sub-task) | Preserve parent carrier | Same actionId for correlation |
| New logical action (e.g., trigger notification) | Create new carrier with fresh actionId | New audit trail needed |

**Rule**: If the nested job would have its own audit trail entry, it needs its own actionId.

```typescript
// ✅ Same action: preserve carrier
async processRetrySubTask(parentCarrier: IdempotencyContextCarrier) {
  await enqueueWithContext(queue, 'sub-task', { 
    data,
    idempotencyContext: parentCarrier, // Preserve
  });
}

// ✅ New action: create fresh context (or null if no parent request)
async triggerNotification(bundleId: string) {
  // No carrier - this is a side-effect, not part of parent action
  await queue.add('notification', { bundleId, idempotencyContext: null });
}
```

## Anti-Patterns (When NOT to Propagate)

| Scenario | Action | Reason |
|----------|--------|--------|
| Fire-and-forget analytics | Don't propagate | No audit correlation needed |
| Scheduled cron jobs | Create fresh context or null | No parent request exists |
| External webhook handlers | Create fresh context | External origin, no parent |
| Metrics/logging side-effects | Don't propagate | Not part of business action |
| Cache warming jobs | Don't propagate | Infrastructure concern |

**Key insight**: Context propagation is for audit correlation. If the job doesn't need to appear in the same audit trail as the parent, don't propagate.

```typescript
// ❌ WRONG: Propagating to analytics (unnecessary)
await enqueueWithContext(analyticsQueue, 'track-event', { event });

// ✅ CORRECT: Analytics doesn't need correlation
await analyticsQueue.add('track-event', { event, idempotencyContext: null });

// ❌ WRONG: Cron job trying to use non-existent parent context
@Cron('0 * * * *')
async hourlyCleanup() {
  const ctx = getIdempotencyContext(); // Always undefined in cron!
  // ...
}

// ✅ CORRECT: Cron job creates its own context or runs without
@Cron('0 * * * *')
async hourlyCleanup() {
  // No parent context - this is fine for scheduled jobs
  await this.cleanupService.run();
}
```

## Non-Goals

- Queue technology selection (BullMQ vs SQS vs etc.)
- Retry/dedup strategy (separate concern)
- Job scheduling patterns
- Dead letter queue handling (covered by Phase 10)

## Consequences

### Positive

- Audit correlation preserved across process boundaries
- Distributed tracing continuity
- Type-safe contract prevents silent failures
- Forward-compatible via version field

### Negative

- Payload size increase (~200 bytes per job)
- Producer must explicitly capture context
- Consumer must explicitly restore context

### Neutral

- No runtime overhead when context is null
- Existing jobs without carrier continue to work (degraded mode)

## Guardrail Plan (Backlog)

| Priority | Guardrail | Type | Description |
|----------|-----------|------|-------------|
| P0 | `IdempotencyContextCarrier` type | Compile-time | Required fields enforced at compile time |
| P0 | `contextToCarrier()` / `carrierToContext()` | Runtime | Single source of truth for conversion |
| P0 | `validateCarrier()` | Runtime | Validation with typed result |
| P1 | `enqueueWithContext()` wrapper | Runtime | Enforces carrier inclusion |
| P1 | `audit_degraded_correlation_total{reason}` | Observability | Tracks context loss by reason |
| P1 | Worker bootstrap warn | Runtime | Log warning if carrier missing/invalid |
| P2 | ESLint rule: ban direct `queue.add()` | CI | Enforce wrapper usage |
| P2 | Dashboard panel for degraded correlation | Observability | Visual tracking |

## Implementation Checklist

When queue/job infrastructure is added:

### P0 (Must have before first queue) ✅ COMPLETE
- [x] Create `idempotency-carrier.types.ts` with type definition
- [x] Implement `validateCarrier()` with typed result
- [x] Implement `carrierToContext()` and `contextToCarrier()` helpers
- [x] Add `CarrierDropReason` type and validation logic

### P1 (Must have before production) ✅ COMPLETE
- [x] Create `enqueueWithContext()` wrapper (recommended)
- [x] Create `runJobWithCarrier()` consumer helper
- [x] Add `audit_degraded_correlation_total{reason}` metric
- [x] Add worker bootstrap warning for invalid carriers
- [x] Add integration test: context survives queue round-trip
- [x] Add integration test: invalid carrier triggers degraded mode

### P2 (Nice to have)
- [ ] ESLint rule to ban direct `queue.add()`
- [ ] Dashboard panel for degraded correlation metric

## Observability

### Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `audit_degraded_correlation_total` | Counter | `reason` | Jobs running without context |
| `job_context_restored_total` | Counter | - | Jobs that successfully restored context |

### Alert Definition

```yaml
# alerts/carrier-degraded.yaml
groups:
  - name: carrier-propagation
    rules:
      - alert: DegradedCorrelationSustained
        expr: rate(audit_degraded_correlation_total[5m]) > 0
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Jobs running without idempotency context"
          description: "{{ $labels.reason }} errors detected in carrier validation"
          runbook: |
            1. Check producer code for missing enqueueWithContext()
            2. Verify carrier schema matches expected version
            3. Review recent deployments for breaking changes
```

### Runbook

When `DegradedCorrelationSustained` fires:

1. **Check metric labels**: `reason` tells you the failure type
   - `MISSING`: Producer not including carrier
   - `VERSION_MISMATCH`: Schema version mismatch (deployment issue)
   - `MISSING_REQUIRED`: Incomplete carrier (producer bug)
   - `TYPE_ERROR`: Field type mismatch (serialization issue)

2. **Investigate producer**: Find which queue is producing invalid carriers
3. **Check recent deployments**: Version mismatch often indicates rolling deployment
4. **Temporary mitigation**: Degraded mode is safe, audit correlation is affected but jobs run

## References

- [ADR-007: ALS-Only Context Access](./ADR-007-ALS-ONLY-CONTEXT-ACCESS.md)
- [PR-7-ALS-ARCHITECTURE.md](../.kiro/specs/phase-10-3-idempotency-hardening/PR-7-ALS-ARCHITECTURE.md)
- [Node.js AsyncLocalStorage](https://nodejs.org/api/async_context.html)

---

# Phase 10.5 Addendum: Carrier Lifecycle (v1.3)

**Added:** 2026-02-06  
**Status:** Accepted  
**Related:** Phase 10.5 Cross-Queue Consistency

This addendum documents the carrier lifecycle rules established in Phase 10.5.

## Carrier Lifecycle Matrix

| Path | Operation | correlationId | parentCorrelationId | attemptNumber | failureHistory |
|------|-----------|---------------|---------------------|---------------|----------------|
| **Retry** | mutateCarrierForRetry() | PRESERVE | PRESERVE | INCREMENT | APPEND |
| **DLQ** | enrichCarrierForDlq() | PRESERVE | PRESERVE | PRESERVE | PRESERVE |
| **Redrive** | cloneCarrierForRedrive() | NEW | SET (old correlationId) | RESET (0) | CLEAR |

### Retry Path

```typescript
// Worker retry: increment attempt, preserve correlation
const mutated = mutateCarrierForRetry(carrier, {
  errorCode: 'OBJECT_STORE_TIMEOUT',
  errorMessage: 'Connection timeout',
  failedAt: new Date(),
});
// mutated.attemptNumber = carrier.attemptNumber + 1
// mutated.requestId = carrier.requestId (PRESERVED)
// mutated.failureHistory = [...carrier.failureHistory, newFailure]
```

### DLQ Path

```typescript
// Move to DLQ: enrich with DLQ metadata, preserve everything else
const enriched = enrichCarrierForDlq(carrier, {
  reason: 'EXHAUSTED', // FIXED ENUM: EXHAUSTED | POISON | MANUAL
  movedAt: new Date(),
});
// enriched.dlqReason = 'EXHAUSTED'
// enriched.movedToDlqAt = ISO timestamp
// enriched.finalAttemptNumber = carrier.attemptNumber
// enriched.requestId = carrier.requestId (PRESERVED)
```

### Redrive Path (Admin)

```typescript
// Admin redrive: clone with new correlation, link to parent
const { carrier: cloned, originalCorrelationId, newCorrelationId } = 
  cloneCarrierForRedrive(originalCarrier, {
    dlqName: 'manifest_dlq',
    operatorId: 'admin@example.com',
  });
// cloned.requestId = NEW UUID (new correlation)
// cloned.parentCorrelationId = originalCorrelationId (IMMUTABLE LINK)
// cloned.attemptNumber = 0 (RESET)
// cloned.failureHistory = undefined (CLEARED)
// cloned.redriveSource = 'manifest_dlq'
// cloned.redrivenBy = 'admin@example.com'
```

## Carrier Size Policy

### Size Limits

| Limit | Value | Rationale |
|-------|-------|-----------|
| MAX_CARRIER_SIZE_BYTES | 4096 | Queue payload budget (4KB safe for all queue backends) |
| MAX_FAILURE_HISTORY_ENTRIES | 10 | Prevent unbounded growth |

### Enforcement Policy

| Context | Policy | Behavior |
|---------|--------|----------|
| Worker retry | TRUNCATE | Truncate failureHistory, emit metric |
| Admin redrive | REJECT | Throw CarrierSizeExceededError |
| DLQ enrichment | TRUNCATE | Truncate failureHistory, emit metric |

```typescript
// Worker path: allow truncation
enforceCarrierSizeLimit(carrier, { allowTruncation: true });

// Admin path: reject if oversized
enforceCarrierSizeLimit(carrier, { allowTruncation: false });
// Throws CarrierSizeExceededError if size > MAX_CARRIER_SIZE_BYTES
```

### Anti-Pattern: Silent Truncation

```typescript
// ❌ WRONG: Truncate without metric
if (carrier.failureHistory.length > 10) {
  carrier.failureHistory = carrier.failureHistory.slice(-10);
}

// ✅ CORRECT: Use enforceCarrierSizeLimit (emits metric)
const result = enforceCarrierSizeLimit(carrier, { allowTruncation: true });
// result.action = 'OK' | 'TRUNCATED'
// Metric: carrier_size_enforcement_total{action="TRUNCATED"}
```

## Correlation Rules

### Redrive Clone Semantics

When admin redrives a DLQ entry:

1. **NEW correlationId** - Fresh UUID for new lifecycle
2. **parentCorrelationId** - Links to original (IMMUTABLE, never changes)
3. **attemptNumber = 0** - First attempt of new lifecycle
4. **failureHistory = []** - Fresh start, old history in DLQ record

```
Original Lifecycle:
  correlationId: abc-123
  attemptNumber: 0 → 1 → 2 → 3 (DLQ)

After Redrive:
  correlationId: xyz-789 (NEW)
  parentCorrelationId: abc-123 (LINK)
  attemptNumber: 0 → 1 → 2 (success or DLQ again)
```

### Audit Trail Correlation

```typescript
// Response MUST include both IDs for ops debugging
return {
  correlationId: cloneResult.newCorrelationId,
  parentCorrelationId: cloneResult.originalCorrelationId,
  // ...
};

// Audit event MUST include correlation chain
auditService.append({
  actionId: cloneResult.carrier.actionId,
  beforeState: {
    correlationId: cloneResult.originalCorrelationId,
  },
  afterState: {
    correlationId: cloneResult.newCorrelationId,
    parentCorrelationId: cloneResult.originalCorrelationId,
  },
});
```

## Metrics Cardinality Rules

### FIXED Label Sets (MUST NOT add new values without ADR update)

| Metric | Label | Allowed Values |
|--------|-------|----------------|
| `carrier_mutated_total` | `path` | `retry` |
| `carrier_dlq_enrichment_total` | `reason` | `EXHAUSTED`, `POISON`, `MANUAL` |
| `carrier_size_enforcement_total` | `action` | `OK`, `TRUNCATED`, `REJECTED` |
| `carrier_redrive_rejected_total` | `reason` | `SIZE`, `INVALID`, `UPGRADE_FAILED`, `NOT_FOUND` |
| `carrier_redrive_clone_total` | `source_dlq` | See DLQ Name Enum below |

### DLQ Name Enum (source_dlq label)

```typescript
// FIXED ENUM - do not add without ADR update
type DlqName = 
  | 'manifest_dlq'      // Manifest retry DLQ
  | 'bundle_dlq'        // Bundle processing DLQ
  | 'notification_dlq'; // Notification DLQ
```

### Anti-Pattern: Dynamic Labels

```typescript
// ❌ WRONG: Dynamic label value (cardinality explosion)
redriveCloneMetric.inc({ source_dlq: dlqEntry.id }); // NEVER!
redriveCloneMetric.inc({ source_dlq: `dlq_${tenantId}` }); // NEVER!

// ✅ CORRECT: Fixed enum value
redriveCloneMetric.inc({ source_dlq: 'manifest_dlq' });
```

### Anti-Pattern: Attempt Number Label

```typescript
// ❌ WRONG: attempt_number label (unbounded cardinality)
retryMetric.inc({ attempt_number: String(carrier.attemptNumber) });
// Today: 0-10, tomorrow: 0-50, policy change: 0-100

// ✅ CORRECT: Use path label only
retryMutationMetric.inc({ path: 'retry' });

// If distribution needed, use histogram with fixed buckets
attemptHistogram.observe(carrier.attemptNumber);
// Buckets: [1, 2, 3, 5, 10, 20] - FIXED
```

## Version Compatibility Rules

### V1 → V2 Upgrade (Explicit Only)

```typescript
// V1 carrier (legacy)
interface IdempotencyContextCarrierV1 {
  version: 1;
  requestId: string;
  actionId: string;
  // ... no lifecycle fields
}

// V2 carrier (current)
interface IdempotencyContextCarrierV2 {
  version: 2;
  requestId: string;
  actionId: string;
  attemptNumber: number;
  parentCorrelationId?: string;
  failureHistory?: FailureRecord[];
  // ... lifecycle fields
}
```

### Upgrade Rules

| Scenario | Action |
|----------|--------|
| V1 in worker inbound | Auto-upgrade to V2 (attemptNumber=0) |
| V1 in admin redrive | Auto-upgrade to V2, then clone |
| V2 everywhere | No upgrade needed |
| Unknown version | Reject (VERSION_MISMATCH) |

```typescript
// ensureCarrierV2() handles upgrade
const v2 = ensureCarrierV2(unknownCarrier);
// If V1: upgrades with defaults
// If V2: returns as-is
// If invalid: throws
```

## Anti-Patterns Summary

| Anti-Pattern | Risk | Correct Pattern |
|--------------|------|-----------------|
| Dynamic metric labels | Cardinality explosion | Fixed enum labels |
| `attempt_number` label | Unbounded cardinality | Histogram or omit |
| Silent truncation | Lost observability | `enforceCarrierSizeLimit()` |
| Admin truncation | Data loss | Reject policy |
| Implicit V1→V2 upgrade | Silent behavior change | Explicit `ensureCarrierV2()` |
| Preserving correlationId on redrive | Broken audit trail | Clone with new ID |
| Clearing parentCorrelationId | Lost lineage | Immutable link |

## Future Work (Out of Scope)

| Item | Description | Priority |
|------|-------------|----------|
| Worker inbound degraded mode | Run without carrier if invalid | P2 |
| Carrier storage in DLQ table | Store full carrier JSON | P2 |
| Redrive chain depth limit | Prevent infinite redrive loops | P3 |
| Carrier compression | gzip for large carriers | P3 |

## Implementation Files

| File | Purpose |
|------|---------|
| `carrier-lifecycle.types.ts` | V2 carrier type, size limits |
| `carrier-lifecycle-metrics.ts` | All lifecycle metrics |
| `retry-carrier-mutator.ts` | Retry path mutation |
| `dlq-carrier-enricher.ts` | DLQ path enrichment |
| `redrive-carrier-cloner.ts` | Redrive path cloning |
| `carrier-size-limiter.ts` | Size enforcement |
| `carrier-version-upgrade.ts` | V1→V2 upgrade |
| `manifest-admin.controller.ts` | Admin redrive endpoint |

## Revision History

| Date | Version | Change |
|------|---------|--------|
| 2026-02-04 | 1.0 | Initial contract (design lock, no implementation) |
| 2026-02-05 | 1.1 | P0+P1 implementation complete (Phase 10.4) |
| 2026-02-05 | 1.2 | Added nested job rules, anti-patterns, alert definition |
| 2026-02-06 | 1.3 | Phase 10.5: Carrier lifecycle, size policy, redrive clone semantics |
