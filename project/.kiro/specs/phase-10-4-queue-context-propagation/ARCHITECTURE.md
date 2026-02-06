# Phase 10.4 - Queue Context Propagation Architecture

## Overview

Phase 10.4 implements ADR-008, completing the context propagation architecture started in Phase 10.3 (ADR-007).

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    COMPLETE CONTEXT PROPAGATION MAP                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     HTTP BOUNDARY (ADR-007)                          │   │
│  │                                                                      │   │
│  │   HTTP Request                                                       │   │
│  │        │                                                             │   │
│  │        │ IdempotencyGateInterceptor                                 │   │
│  │        │ → IdempotencyALS.run(ctx, handler)                         │   │
│  │        ▼                                                             │   │
│  │   ┌──────────────────────────────────────────────────────────┐      │   │
│  │   │              Request Scope (ALS Active)                   │      │   │
│  │   │                                                           │      │   │
│  │   │   getIdempotencyContext() → ctx ✓                        │      │   │
│  │   │   Services auto-enrich audit events                      │      │   │
│  │   │                                                           │      │   │
│  │   └──────────────────────────────────────────────────────────┘      │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                              │                                              │
│                              │ PROCESS BOUNDARY                             │
│                              ▼                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    QUEUE BOUNDARY (ADR-008)                          │   │
│  │                                                                      │   │
│  │   Producer (inside ALS)                                              │   │
│  │        │                                                             │   │
│  │        │ enqueueWithContext(queue, 'job', data)                     │   │
│  │        │ → captureCurrentCarrier()                                  │   │
│  │        │ → contextToCarrier(ctx)                                    │   │
│  │        ▼                                                             │   │
│  │   ┌──────────────────────────────────────────────────────────┐      │   │
│  │   │              Queue Payload                                │      │   │
│  │   │                                                           │      │   │
│  │   │   {                                                       │      │   │
│  │   │     ...data,                                              │      │   │
│  │   │     idempotencyContext: {                                 │      │   │
│  │   │       version: 1,                                         │      │   │
│  │   │       requestId, actionId, actionType,                    │      │   │
│  │   │       resourceType, resourceId,                           │      │   │
│  │   │       takeover, previousActorId                           │      │   │
│  │   │     }                                                     │      │   │
│  │   │   }                                                       │      │   │
│  │   │                                                           │      │   │
│  │   └──────────────────────────────────────────────────────────┘      │   │
│  │                              │                                       │   │
│  │                              │ Queue Transport                       │   │
│  │                              ▼                                       │   │
│  │   Consumer (Worker Process)                                          │   │
│  │        │                                                             │   │
│  │        │ runJobWithCarrier(carrier, fn)                             │   │
│  │        │ → validateCarrier(carrier)                                 │   │
│  │        │                                                             │   │
│  │        ├─── valid ──────────────────────────────────────────┐       │   │
│  │        │                                                     │       │   │
│  │        │    IdempotencyALS.run(ctx, fn)                     │       │   │
│  │        │    recordContextRestored()                          │       │   │
│  │        │                                                     ▼       │   │
│  │        │    ┌────────────────────────────────────────────┐          │   │
│  │        │    │         Worker Scope (ALS Restored)        │          │   │
│  │        │    │                                             │          │   │
│  │        │    │   getIdempotencyContext() → ctx ✓          │          │   │
│  │        │    │   Audit correlation preserved              │          │   │
│  │        │    │                                             │          │   │
│  │        │    └────────────────────────────────────────────┘          │   │
│  │        │                                                             │   │
│  │        └─── invalid ────────────────────────────────────────┐       │   │
│  │                                                              │       │   │
│  │             logger.warn('Invalid carrier')                   │       │   │
│  │             recordDegradedCorrelation(reason)                │       │   │
│  │             fn() // Run without ALS                          ▼       │   │
│  │             ┌────────────────────────────────────────────┐          │   │
│  │             │         Worker Scope (Degraded)            │          │   │
│  │             │                                             │          │   │
│  │             │   getIdempotencyContext() → undefined      │          │   │
│  │             │   Audit correlation lost (metric tracked)  │          │   │
│  │             │                                             │          │   │
│  │             └────────────────────────────────────────────┘          │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Component Map

```
idempotency/
├── idempotency-context.ts              # ALS wrapper (Phase 10.3)
├── idempotency-gate.interceptor.ts     # HTTP boundary (Phase 10.3)
├── idempotency-carrier.types.ts        # Carrier types (Phase 10.4)
├── idempotency-carrier.validation.ts   # validateCarrier() (Phase 10.4)
├── idempotency-carrier.converters.ts   # contextToCarrier/carrierToContext (Phase 10.4)
├── carrier-metrics.ts                  # Degraded correlation metrics (Phase 10.4)
├── enqueue-with-context.ts             # Producer helper (Phase 10.4)
├── run-job-with-carrier.ts             # Consumer helper (Phase 10.4)
└── dashboards/
    └── carrier-degraded-alerts.yaml    # Prometheus alerts (Phase 10.4)
```

## Validation Flow

```
                    ┌─────────────────┐
                    │  carrier input  │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │ null/undefined? │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │ yes          │              │ no
              ▼              │              ▼
    ┌─────────────────┐      │    ┌─────────────────┐
    │ reason=MISSING  │      │    │ typeof object?  │
    └─────────────────┘      │    └────────┬────────┘
                             │             │
                             │   ┌─────────┼─────────┐
                             │   │ no      │         │ yes
                             │   ▼         │         ▼
                             │ ┌───────────┴───┐ ┌─────────────────┐
                             │ │reason=MALFORMED│ │ version === 1?  │
                             │ └───────────────┘ └────────┬────────┘
                             │                            │
                             │              ┌─────────────┼─────────────┐
                             │              │ no          │             │ yes
                             │              ▼             │             ▼
                             │    ┌─────────────────────┐ │ ┌─────────────────┐
                             │    │reason=VERSION_MISMATCH│ │ │ required fields?│
                             │    └─────────────────────┘ │ └────────┬────────┘
                             │                            │          │
                             │                            │ ┌────────┼────────┐
                             │                            │ │ no     │        │ yes
                             │                            │ ▼        │        ▼
                             │                            │ ┌────────┴──────┐ ┌─────────────┐
                             │                            │ │MISSING_REQUIRED│ │ type check? │
                             │                            │ └───────────────┘ └──────┬──────┘
                             │                            │                          │
                             │                            │                ┌─────────┼─────────┐
                             │                            │                │ fail    │         │ pass
                             │                            │                ▼         │         ▼
                             │                            │      ┌─────────────┐     │   ┌───────────┐
                             │                            │      │TYPE_ERROR   │     │   │  VALID    │
                             │                            │      └─────────────┘     │   └───────────┘
                             │                            │                          │
                             └────────────────────────────┴──────────────────────────┘
```

## Nested Job Decision Tree

```
                    ┌─────────────────────────┐
                    │ Job spawns another job  │
                    └───────────┬─────────────┘
                                │
                                ▼
                    ┌─────────────────────────┐
                    │ Same logical action?    │
                    │ (same audit trail)      │
                    └───────────┬─────────────┘
                                │
              ┌─────────────────┼─────────────────┐
              │ yes             │                 │ no
              ▼                 │                 ▼
    ┌─────────────────┐         │       ┌─────────────────┐
    │ Preserve parent │         │       │ Needs own audit │
    │ carrier         │         │       │ trail?          │
    └─────────────────┘         │       └────────┬────────┘
                                │                │
                                │      ┌─────────┼─────────┐
                                │      │ yes     │         │ no
                                │      ▼         │         ▼
                                │ ┌───────────┐  │  ┌─────────────┐
                                │ │ Create new│  │  │ null carrier│
                                │ │ actionId  │  │  │ (no audit)  │
                                │ └───────────┘  │  └─────────────┘
                                │                │
                                └────────────────┘
```

## Metrics Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                      METRICS EMISSION                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   runJobWithCarrier()                                           │
│        │                                                        │
│        ├─── carrier null/undefined                              │
│        │         │                                              │
│        │         └──► audit_degraded_correlation_total          │
│        │                   {reason="MISSING"}                   │
│        │                                                        │
│        ├─── validateCarrier() → invalid                         │
│        │         │                                              │
│        │         └──► audit_degraded_correlation_total          │
│        │                   {reason="VERSION_MISMATCH"}          │
│        │                   {reason="MISSING_REQUIRED"}          │
│        │                   {reason="MALFORMED"}                 │
│        │                   {reason="TYPE_ERROR"}                │
│        │                                                        │
│        └─── validateCarrier() → valid                           │
│                  │                                              │
│                  └──► job_context_restored_total                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Alert Thresholds

| Alert | Condition | Severity | Action |
|-------|-----------|----------|--------|
| DegradedCorrelationSustained | rate > 0 for 10m | warning | Check producer code |
| CarrierVersionMismatchSpike | rate > 0.1/s for 5m | critical | Check deployment |
| MissingCarriersSustained | rate > 0.5/s for 15m | warning | Audit enqueue calls |
| ContextRestorationRateLow | < 95% for 10m | warning | Review all producers |

## ADR Relationship

```
┌─────────────────────────────────────────────────────────────────┐
│                      ADR HIERARCHY                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ADR-007: ALS-Only Context Access                              │
│   ├── Scope: HTTP boundary                                      │
│   ├── Rule: No req.idempotencyContext                          │
│   ├── Enforcement: CI grep gate                                 │
│   └── Phase: 10.3                                               │
│                                                                 │
│   ADR-008: Queue/Job Context Propagation                        │
│   ├── Scope: Process boundary                                   │
│   ├── Rule: Typed carrier + validation                          │
│   ├── Enforcement: Runtime validation + metrics                 │
│   ├── Phase: 10.4                                               │
│   └── Extensions:                                               │
│       ├── Nested job rules                                      │
│       ├── Anti-patterns                                         │
│       └── Alert definitions                                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```
