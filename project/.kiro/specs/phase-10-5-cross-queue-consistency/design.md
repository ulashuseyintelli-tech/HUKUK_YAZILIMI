# Phase 10.5 — Cross-Queue Consistency: Design

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    CARRIER LIFECYCLE ACROSS QUEUES                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────┐    success    ┌──────────┐                                │
│  │  Queue   │──────────────▶│ Complete │                                │
│  │  (Job)   │               └──────────┘                                │
│  └────┬─────┘                                                           │
│       │ failure                                                          │
│       ▼                                                                  │
│  ┌──────────────────────────────────────┐                               │
│  │  RETRY PATH                          │                               │
│  │  ─────────────────────────────────── │                               │
│  │  carrier.attemptNumber++             │                               │
│  │  carrier.lastFailedAt = now()        │                               │
│  │  carrier.failureHistory.push(err)    │                               │
│  │  → Same correlationId                │                               │
│  └────┬─────────────────────────────────┘                               │
│       │ exhausted                                                        │
│       ▼                                                                  │
│  ┌──────────────────────────────────────┐                               │
│  │  DLQ PATH                            │                               │
│  │  ─────────────────────────────────── │                               │
│  │  carrier.dlqReason = EXHAUSTED       │                               │
│  │  carrier.movedToDlqAt = now()        │                               │
│  │  carrier.finalAttemptNumber = N      │                               │
│  │  → Same correlationId                │                               │
│  └────┬─────────────────────────────────┘                               │
│       │ redrive (operator)                                               │
│       ▼                                                                  │
│  ┌──────────────────────────────────────┐                               │
│  │  REDRIVE PATH                        │                               │
│  │  ─────────────────────────────────── │                               │
│  │  newCarrier = cloneCarrier(old)      │                               │
│  │  newCarrier.correlationId = uuid()   │                               │
│  │  newCarrier.parentCorrelationId = old│                               │
│  │  newCarrier.attemptNumber = 1        │                               │
│  │  newCarrier.redriveSource = dlqName  │                               │
│  │  newCarrier.redrivenAt = now()       │                               │
│  │  newCarrier.redrivenBy = operator    │                               │
│  │  → NEW correlationId (linked)        │                               │
│  └──────────────────────────────────────┘                               │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## Type Extensions

```typescript
// Extended carrier type for Phase 10.5
interface IdempotencyCarrierV2 extends IdempotencyCarrier {
  version: 2;
  
  // Retry tracking
  attemptNumber: number;
  lastFailedAt?: string;           // ISO timestamp
  failureHistory?: FailureEntry[]; // Capped array
  
  // DLQ tracking
  dlqReason?: 'EXHAUSTED' | 'POISON' | 'MANUAL';
  movedToDlqAt?: string;
  finalAttemptNumber?: number;
  
  // Redrive tracking
  parentCorrelationId?: string;    // Links to original
  redriveSource?: string;          // DLQ queue name
  redrivenAt?: string;
  redrivenBy?: string;             // Operator identity
}

interface FailureEntry {
  timestamp: string;
  errorCode: string;
  errorMessage: string;  // Truncated to 200 chars
}
```

## Component Design

### 1. RetryCarrierMutator

```typescript
// retry-carrier-mutator.ts
export function mutateCarrierForRetry(
  carrier: IdempotencyCarrier,
  failure: JobFailure,
): IdempotencyCarrierV2 {
  const v2 = upgradeToV2(carrier);
  
  return {
    ...v2,
    attemptNumber: v2.attemptNumber + 1,
    lastFailedAt: new Date().toISOString(),
    failureHistory: appendFailure(v2.failureHistory, failure),
  };
}

function appendFailure(
  history: FailureEntry[] = [],
  failure: JobFailure,
): FailureEntry[] {
  const entry: FailureEntry = {
    timestamp: new Date().toISOString(),
    errorCode: failure.code,
    errorMessage: truncate(failure.message, 200),
  };
  
  // Cap at 10 entries, FIFO
  const updated = [...history, entry];
  return updated.slice(-10);
}
```

### 2. DlqCarrierEnricher

```typescript
// dlq-carrier-enricher.ts
export type DlqReason = 'EXHAUSTED' | 'POISON' | 'MANUAL';

export function enrichCarrierForDlq(
  carrier: IdempotencyCarrier,
  reason: DlqReason,
): IdempotencyCarrierV2 {
  const v2 = upgradeToV2(carrier);
  
  return {
    ...v2,
    dlqReason: reason,
    movedToDlqAt: new Date().toISOString(),
    finalAttemptNumber: v2.attemptNumber,
  };
}
```

### 3. RedriveCarrierCloner

```typescript
// redrive-carrier-cloner.ts
export interface RedriveContext {
  dlqName: string;
  operatorId: string;
}

export function cloneCarrierForRedrive(
  original: IdempotencyCarrierV2,
  ctx: RedriveContext,
): IdempotencyCarrierV2 {
  return {
    version: 2,
    correlationId: generateUUID(),
    requestId: generateUUID(),
    tenantId: original.tenantId,
    userId: original.userId,
    
    // Reset attempt tracking
    attemptNumber: 1,
    
    // Link to parent
    parentCorrelationId: original.correlationId,
    
    // Redrive metadata
    redriveSource: ctx.dlqName,
    redrivenAt: new Date().toISOString(),
    redrivenBy: ctx.operatorId,
    
    // Clear DLQ fields (fresh start)
    dlqReason: undefined,
    movedToDlqAt: undefined,
    failureHistory: undefined,
  };
}
```

### 4. CarrierSizeLimiter

```typescript
// carrier-size-limiter.ts
const MAX_CARRIER_SIZE_BYTES = 4096;

export interface SizeLimitResult {
  carrier: IdempotencyCarrierV2;
  action: 'ok' | 'truncated' | 'rejected';
  originalSize: number;
  finalSize: number;
}

export function enforceCarrierSizeLimit(
  carrier: IdempotencyCarrierV2,
): SizeLimitResult {
  const serialized = JSON.stringify(carrier);
  const originalSize = Buffer.byteLength(serialized, 'utf8');
  
  if (originalSize <= MAX_CARRIER_SIZE_BYTES) {
    return { carrier, action: 'ok', originalSize, finalSize: originalSize };
  }
  
  // Try truncation
  const truncated = truncateCarrier(carrier);
  const truncatedSize = Buffer.byteLength(JSON.stringify(truncated), 'utf8');
  
  if (truncatedSize <= MAX_CARRIER_SIZE_BYTES) {
    carrierSizeMetric.inc({ action: 'truncated' });
    return { 
      carrier: truncated, 
      action: 'truncated', 
      originalSize, 
      finalSize: truncatedSize 
    };
  }
  
  // Cannot fit even after truncation
  carrierSizeMetric.inc({ action: 'rejected' });
  throw new CarrierSizeExceededError(originalSize, MAX_CARRIER_SIZE_BYTES);
}

function truncateCarrier(carrier: IdempotencyCarrierV2): IdempotencyCarrierV2 {
  return {
    ...carrier,
    failureHistory: carrier.failureHistory?.slice(-3), // Keep last 3
  };
}
```

## Metrics

```typescript
// carrier-lifecycle-metrics.ts
export const carrierLifecycleMetrics = {
  retryMutation: new Counter({
    name: 'carrier_retry_mutation_total',
    help: 'Carrier mutations for retry path',
    labelNames: ['attempt_number'],
  }),
  
  dlqEnrichment: new Counter({
    name: 'carrier_dlq_enrichment_total',
    help: 'Carrier enrichments for DLQ path',
    labelNames: ['reason'],
  }),
  
  redriveClone: new Counter({
    name: 'carrier_redrive_clone_total',
    help: 'Carrier clones for redrive path',
    labelNames: ['source_dlq'],
  }),
  
  sizeEnforcement: new Counter({
    name: 'carrier_size_enforcement_total',
    help: 'Carrier size limit enforcement actions',
    labelNames: ['action'], // ok, truncated, rejected
  }),
};
```

## Integration Points

### Worker Integration

```typescript
// manifest-retry-worker.service.ts (updated)
async onFailed(job: Job, error: Error) {
  const carrier = job.data.idempotencyContext;
  
  if (job.attemptsMade < job.opts.attempts) {
    // Retry path
    const mutated = mutateCarrierForRetry(carrier, {
      code: error.name,
      message: error.message,
    });
    job.data.idempotencyContext = enforceCarrierSizeLimit(mutated).carrier;
  } else {
    // DLQ path
    const enriched = enrichCarrierForDlq(carrier, 'EXHAUSTED');
    await this.dlqRepository.add({
      ...job.data,
      idempotencyContext: enforceCarrierSizeLimit(enriched).carrier,
    });
  }
}
```

### Admin Controller Integration

```typescript
// manifest-admin.controller.ts (updated)
@Post('dlq/:id/redrive')
async redrive(
  @Param('id') id: string,
  @CurrentUser() operator: User,
) {
  const dlqEntry = await this.dlqRepository.findById(id);
  
  const clonedCarrier = cloneCarrierForRedrive(
    dlqEntry.idempotencyContext,
    { dlqName: 'manifest-dlq', operatorId: operator.id },
  );
  
  await enqueueWithContext(
    this.retryQueue,
    'manifest-retry',
    { ...dlqEntry.payload, idempotencyContext: clonedCarrier },
  );
  
  await this.dlqRepository.markRedriven(id, operator.id);
}
```

## Version Migration

```typescript
// carrier-version-upgrade.ts
export function upgradeToV2(carrier: IdempotencyCarrier): IdempotencyCarrierV2 {
  if (carrier.version === 2) {
    return carrier as IdempotencyCarrierV2;
  }
  
  // V1 → V2 upgrade
  return {
    ...carrier,
    version: 2,
    attemptNumber: 1,
  };
}
```

## Decision Tree: Reset vs Preserve

```
                    ┌─────────────────────┐
                    │ Carrier Transition? │
                    └──────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
              ▼                ▼                ▼
         ┌────────┐       ┌────────┐       ┌─────────┐
         │ Retry  │       │  DLQ   │       │ Redrive │
         └───┬────┘       └───┬────┘       └────┬────┘
             │                │                 │
             ▼                ▼                 ▼
        ┌─────────┐      ┌─────────┐      ┌──────────┐
        │ PRESERVE│      │ PRESERVE│      │  CLONE   │
        │ + mutate│      │ + enrich│      │ + reset  │
        └─────────┘      └─────────┘      └──────────┘
             │                │                 │
             ▼                ▼                 ▼
        Same corrId      Same corrId      NEW corrId
                                          (linked)
```

## File Structure

```
idempotency/
├── carrier-lifecycle/
│   ├── retry-carrier-mutator.ts
│   ├── dlq-carrier-enricher.ts
│   ├── redrive-carrier-cloner.ts
│   ├── carrier-size-limiter.ts
│   ├── carrier-version-upgrade.ts
│   ├── carrier-lifecycle-metrics.ts
│   └── __tests__/
│       ├── retry-carrier-mutator.spec.ts
│       ├── dlq-carrier-enricher.spec.ts
│       ├── redrive-carrier-cloner.spec.ts
│       ├── carrier-size-limiter.spec.ts
│       └── carrier-lifecycle.integration.spec.ts
└── idempotency-carrier.types.ts (updated with V2)
```
