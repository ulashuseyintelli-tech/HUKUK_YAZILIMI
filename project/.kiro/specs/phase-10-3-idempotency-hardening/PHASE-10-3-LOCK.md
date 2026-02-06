# Phase 10.3 - Idempotency Hardening: LOCKED

**Status:** 🔒 LOCKED  
**Date:** 2026-02-04  
**Sign-off:** Platform Team

## Summary

Phase 10.3 establishes the complete context propagation architecture for idempotency:

- **HTTP Boundary:** ALS-only access (ADR-007)
- **Process Boundary:** Typed carrier contract (ADR-008)

## Locked Decisions

### ADR-007: ALS-Only Context Access
- `req.idempotencyContext` pattern BANNED
- Services use `getIdempotencyContext()` only
- CI grep gate enforces compliance

### ADR-008: Queue/Job Context Propagation
- `IdempotencyContextCarrier` typed payload
- Producer: capture context before enqueue
- Consumer: validate + restore ALS
- Degraded mode: warn + metric + run without context

## Test Results

| Suite | Result |
|-------|--------|
| idempotency-context.spec | 11/11 ✅ |
| idempotency-gate.integration.spec | 12/12 ✅ |
| manifest-admin-audit.service.spec | 21/21 ✅ |
| **Total** | **44/44 PASS** |

## Verification

```bash
# ADR-007 compliance
grep -r "req\.idempotencyContext\s*=" apps/api/src/
# Expected: 0 matches ✅
```

## Files

### ADRs
- `docs/adr/ADR-007-ALS-ONLY-CONTEXT-ACCESS.md`
- `docs/adr/ADR-008-QUEUE-JOB-CONTEXT-PROPAGATION.md`

### Implementation
- `idempotency/idempotency-context.ts` (ALS wrapper)
- `idempotency/idempotency-gate.interceptor.ts` (ALS.run integration)
- `audit/manifest-admin-audit.service.ts` (ALS enrichment)

### CI
- `.github/workflows/ci.yml` (grep gate)

## Context Propagation Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    CONTEXT PROPAGATION MAP                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  HTTP Request                                                   │
│       │                                                         │
│       │ ADR-007: IdempotencyALS.run()                          │
│       ▼                                                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Request Scope (ALS)                         │   │
│  │  getIdempotencyContext() → ctx                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│       │                                                         │
│       │ ADR-008: contextToCarrier()                            │
│       ▼                                                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Queue/Job Payload                           │   │
│  │  { data, idempotencyContext: carrier }                  │   │
│  └─────────────────────────────────────────────────────────┘   │
│       │                                                         │
│       │ ADR-008: validateCarrier() + carrierToContext()        │
│       ▼                                                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Worker Scope (ALS restored)                 │   │
│  │  getIdempotencyContext() → ctx                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Next Phase

Phase 10.4 will implement ADR-008 when queue infrastructure is added:
- P0: Type definitions + validation
- P1: Wrapper + metrics + tests
- P2: ESLint rule + dashboard

## Change Policy

This phase is LOCKED. Changes require:
1. ADR amendment with justification
2. Platform team review
3. Test coverage for new behavior
