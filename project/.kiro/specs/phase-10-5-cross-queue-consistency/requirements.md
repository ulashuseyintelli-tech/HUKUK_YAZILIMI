# Phase 10.5 — Cross-Queue Consistency: Requirements

## Overview

Phase 10.5 defines carrier behavior rules for Retry, DLQ, and Redrive paths. This closes the 10.x series by establishing deterministic context propagation across all queue transitions.

## Problem Statement

Phase 10.4 established carrier propagation for Queue → Job boundary. However:
- What happens to carrier when job fails and goes to retry?
- What happens when job exhausts retries and moves to DLQ?
- What happens when operator triggers redrive from DLQ?

Without explicit rules, these edge cases lead to:
- Lost correlation IDs
- Incorrect retry counts in metrics
- Ambiguous audit trails
- Non-deterministic behavior across deployments

## Requirements

### REQ-1: Retry Path Carrier Rules
**Priority:** P0

When a job fails and is scheduled for retry:
- Carrier MUST be preserved (not cloned, not reset)
- `attemptNumber` field MUST be incremented
- `originalEnqueuedAt` MUST remain unchanged
- New field `lastFailedAt` MUST be added

### REQ-2: DLQ Path Carrier Rules
**Priority:** P0

When a job exhausts retries and moves to DLQ:
- Carrier MUST be preserved with all history
- New field `dlqReason` MUST be added (EXHAUSTED | POISON | MANUAL)
- New field `movedToDlqAt` MUST be added
- `attemptNumber` MUST reflect final attempt count

### REQ-3: Redrive Path Carrier Rules
**Priority:** P0

When operator triggers redrive from DLQ:
- Carrier MUST be cloned (new correlationId)
- `parentCorrelationId` MUST reference original carrier
- `attemptNumber` MUST reset to 1
- `redriveSource` MUST be set (DLQ queue name)
- `redrivenAt` MUST be set
- `redrivenBy` MUST capture operator identity

### REQ-4: Carrier Size Limit
**Priority:** P1

To prevent abuse and unbounded growth:
- Carrier payload MUST NOT exceed 4KB
- If exceeded: truncate history arrays, preserve core fields
- Metric: `carrier_size_exceeded_total{action=truncated|rejected}`

### REQ-5: Anti-Pattern Documentation
**Priority:** P1

ADR-008 MUST be updated with:
- "When NOT to propagate" section
- Explicit anti-patterns (e.g., cross-tenant carrier sharing)
- Decision tree for carrier reset vs preserve

## Definition of Done

- [ ] Retry carrier mutation logic implemented
- [ ] DLQ carrier enrichment implemented
- [ ] Redrive carrier clone logic implemented
- [ ] Size limit enforcement implemented
- [ ] ADR-008 v1.3 with anti-patterns
- [ ] All tests passing (target: 40+ tests)
- [ ] Metrics for all transitions
- [ ] PHASE-10-5-LOCK.md signed off

## Out of Scope

- Multi-queue topology (Phase 11)
- Cross-tenant isolation (Phase 11)
- Carrier encryption (future)

## Dependencies

- Phase 10.4 LOCKED ✅
- ADR-008 v1.2 ✅
