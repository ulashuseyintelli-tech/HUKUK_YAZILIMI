# Ops Playbook System - Tasks

## Overview

Phase 7B: Incident'ları otomatik aksiyonlara, bildirimlere ve escalation'lara bağlayan operasyonel playbook sistemi.

**3 Sprint Yapısı:**
1. Sprint 1: Playbook Foundation (Registry, Matcher, YAML Validation)
2. Sprint 2: Action Execution (Executor, PolicyGuard, LeaseManager)
3. Sprint 3: Notification, Escalation & Quality

---

## Sprint 1: Playbook Foundation

### Task 1.1: Core Types & Interfaces ✅ DONE

**Requirement:** REQ-1, REQ-3
**File:** `diagnostics/playbook/playbook.types.ts`

**Acceptance Criteria:**
- [x] All types from design.md implemented
- [x] Playbook, PlaybookAction, SafetyPolicy, LeaseConfig types
- [x] AutoActionType enum with all supported actions
- [x] Execution and audit types
- [x] No `any` types

---

### Task 1.2: Playbook YAML Schema (Zod) ✅ DONE

**Requirement:** REQ-1.2
**File:** `diagnostics/playbook/playbook-yaml-validator.service.ts`

**Acceptance Criteria:**
- [x] Zod schemas for all playbook structures
- [x] Unknown fields rejected
- [x] Required fields enforced
- [x] Value constraints (max_multiplier <= 10, max_escalations <= 5)
- [x] Unit tests for schema validation

---

### Task 1.3: Semantic Validation ✅ DONE

**Requirement:** REQ-1.3
**File:** `diagnostics/playbook/playbook-yaml-validator.service.ts` (extend)

**Acceptance Criteria:**
- [x] Unknown action type → REJECT
- [x] Unknown incident type → REJECT
- [x] when clause field whitelist enforced
- [x] Escalation loop detection
- [x] Safety policy required for auto-actions
- [x] Lease required for temporary actions
- [x] Unit tests for each rule

---


### Task 1.4: Playbook Registry ✅ DONE

**Requirement:** REQ-1.1, REQ-1.4
**File:** `diagnostics/playbook/playbook-registry.service.ts`

**Acceptance Criteria:**
- [x] YAML file loading from directory
- [x] Schema + semantic validation on load
- [x] Version tracking per playbook
- [x] Hot reload support
- [x] Validation errors logged with details
- [x] Unit tests with mock YAML files

---

### Task 1.5: Playbook Matcher ✅ DONE

**Requirement:** REQ-2.1, REQ-2.2
**File:** `diagnostics/playbook/playbook-matcher.service.ts`

**Acceptance Criteria:**
- [x] Incident type exact match
- [x] Severity list match
- [x] Tenant scope filter
- [x] Priority resolution (higher priority wins)
- [x] Tenant-specific > global playbook
- [x] When clause evaluation (whitelist DSL)
- [x] Unit tests for matching logic

---

### Task 1.6: Sample Playbooks ✅ DONE

**Requirement:** REQ-1.1
**Files:** `diagnostics/playbook/playbooks/*.yaml`

Created 3 sample playbooks (dry-run only):
- `circuit-breaker-open.yaml`
- `high-error-rate.yaml`
- `slo-breach.yaml`

**Acceptance Criteria:**
- [x] 3 playbooks created (Sprint 1 scope)
- [x] Each playbook passes schema + semantic validation
- [x] Appropriate safety policies defined
- [x] Lease configs for temporary actions
- [x] Türkçe descriptions and recommendations
- [x] All playbooks set to dryRun: true

---

### Task 1.7: Module Registration ✅ DONE

**Requirement:** N/A (infrastructure)
**File:** `diagnostics/playbook/playbook.module.ts`

**Acceptance Criteria:**
- [x] Module compiles without errors
- [x] All dependencies injected correctly
- [x] Registry loads playbooks on init
- [x] Integrated into DiagnosticsModule

---

### Sprint 1 Checkpoint ✅ COMPLETE

**Exit Criteria:**
- [x] Playbook YAML schema validation working
- [x] Semantic validation rules enforced
- [x] Registry loads and validates playbooks
- [x] Matcher finds correct playbook for incident
- [x] 3 sample playbooks created and valid (dry-run only)
- [x] All unit tests passing

---

## Sprint 2: Action Execution

### Task 2.1: Action Policy Guard (KRİTİK) ✅ DONE

**Requirement:** REQ-3.2, REQ-3.3, REQ-3.5
**File:** `diagnostics/playbook/action-policy-guard.service.ts`

**Acceptance Criteria:**
- [x] Value limits enforced (maxTtlMs, maxMultiplier)
- [x] Namespace allowlist enforced
- [x] Role allowlist enforced
- [x] Cooldown period enforced
- [x] Idempotency check (incident_id + action_id)
- [x] Rejection reason logged
- [x] Guard bypass YASAK (no exceptions)
- [x] Unit tests for each check type

---

### Task 2.2: Action Lease Manager ✅ DONE

**Requirement:** REQ-3.4
**File:** `diagnostics/playbook/action-lease-manager.service.ts`

**Acceptance Criteria:**
- [x] Lease creation with original state capture
- [x] Active lease tracking
- [x] Lease revocation (early rollback)
- [x] Background job for expired leases (30s interval)
- [x] Auto-rollback execution
- [x] Rollback failure retry + alert
- [x] Unit tests for lease lifecycle

---


### Task 2.3: Auto-Action Implementations ✅ DONE

**Requirement:** REQ-3.1
**File:** `diagnostics/playbook/action-executor.service.ts`

Implemented auto-action handlers:
- `extend_cache_ttl`: VersionedCacheService TTL multiplier
- `force_circuit_half_open`: CircuitBreakerService state change
- `enable_stale_serve`: VersionedCacheService stale-while-revalidate
- `increase_timeout`: CircuitBreakerService timeout multiplier
- `reduce_rate_limit`: Rate limit factor reduction

**Acceptance Criteria:**
- [x] All 5 auto-action types implemented
- [x] Each action captures original state for rollback
- [x] Each action respects safety policy
- [x] Rollback handlers for each action
- [x] Unit tests for each action type

---

### Task 2.4: Action Executor ✅ DONE

**Requirement:** REQ-3.1
**File:** `diagnostics/playbook/action-executor.service.ts`

**Acceptance Criteria:**
- [x] Dry-run mode: notification + audit only
- [x] Policy guard check before each auto-action
- [x] Lease creation for temporary actions
- [x] Execution result with all action results
- [x] Error handling (partial success)
- [x] Unit tests for execution flow

---

### Task 2.5: Playbook Audit Service ✅ DONE

**Requirement:** REQ-7
**File:** `diagnostics/playbook/playbook-audit.service.ts`

**Acceptance Criteria:**
- [x] Immutable audit logs
- [x] Execution logging with all fields
- [x] Action logging with result and rejection reason
- [x] Lease logging (created, expired, revoked, rolled_back)
- [x] Ring buffer (MAX_LOGS = 100000)
- [x] JSON format for external aggregation
- [x] Unit tests for audit logging

---

### Task 2.6: Playbook Metrics Service ✅ DONE

**Requirement:** REQ-8
**File:** `diagnostics/playbook/playbook-metrics.service.ts`

**Acceptance Criteria:**
- [x] All metrics from design.md implemented
- [x] Counter and histogram metrics
- [x] Tenant-scoped metrics
- [x] Metrics export format (Prometheus-compatible)
- [x] Unit tests for metric recording

---

### Sprint 2 Checkpoint ✅ COMPLETE

**Exit Criteria:**
- [x] Policy guard enforces all safety checks
- [x] Idempotency prevents duplicate execution
- [x] Lease manager handles lifecycle
- [x] Auto-rollback works on lease expiry
- [x] All 5 auto-action types working
- [x] Audit logs complete
- [x] Metrics being recorded
- [ ] All unit tests passing

---

## Sprint 3: Notification, Escalation & Quality

### Task 3.1: Notification Service

**Requirement:** REQ-4
**File:** `diagnostics/playbook/notification.service.ts`

```typescript
// Implement NotificationService:
// - send(channel, notification): NotificationResult
// - renderTemplate(template, variables): string
// - retry(notificationId): NotificationResult
```

**Acceptance Criteria:**
- [ ] Console channel (development)
- [ ] Webhook channel (HTTP POST)
- [ ] Template rendering with variables
- [ ] At-least-once delivery
- [ ] Retry with exponential backoff (3 attempts)
- [ ] Dead letter queue for failed notifications
- [ ] Unit tests for each channel

---

### Task 3.2: Notification Templates

**Requirement:** REQ-4.2
**Files:** `diagnostics/playbook/templates/*.ts`

Create notification templates:
- `circuit_breaker_alert`
- `error_rate_alert`
- `rate_limit_alert`
- `degraded_service_alert`
- `slo_breach_alert`

**Acceptance Criteria:**
- [ ] All 5 templates created
- [ ] Türkçe content
- [ ] All template variables supported
- [ ] Markdown format for Slack compatibility

---


### Task 3.3: Escalation Service

**Requirement:** REQ-5
**File:** `diagnostics/playbook/escalation.service.ts`

```typescript
// Implement EscalationService:
// - scheduleEscalation(incident, escalation): EscalationTimer
// - cancelEscalation(incidentId): void
// - processDueEscalations(): void (background job)
// - checkEscalationLoop(incidentId): boolean
```

**Acceptance Criteria:**
- [ ] Time-based escalation scheduling
- [ ] Escalation cancellation on incident resolve
- [ ] Background job for due escalations (30s interval)
- [ ] Maximum escalation count enforced
- [ ] Loop prevention (max escalations per incident)
- [ ] Unit tests for escalation lifecycle

---

### Task 3.4: Playbook Controller

**Requirement:** REQ-9
**File:** `diagnostics/playbook/playbook.controller.ts`

```typescript
// Implement PlaybookController:
// - GET /calc/diagnostics/playbooks
// - GET /calc/diagnostics/playbooks/:id
// - GET /calc/diagnostics/playbooks/:id/history
// - POST /calc/diagnostics/playbooks/:id/trigger
// - POST /calc/diagnostics/incidents/:id/acknowledge
// - POST /calc/diagnostics/incidents/:id/resolve
// - GET /calc/diagnostics/leases/active
// - POST /calc/diagnostics/leases/:id/revoke
```

**Acceptance Criteria:**
- [ ] All endpoints from REQ-9 implemented
- [ ] RBAC guard applied
- [ ] Rate limit guard applied
- [ ] Dry-run support in trigger endpoint
- [ ] Proper error responses
- [ ] Integration tests for all endpoints

---

### Task 3.5: Playbook Service

**Requirement:** REQ-2, REQ-3, REQ-6
**File:** `diagnostics/playbook/playbook.service.ts`

```typescript
// Implement PlaybookService:
// - triggerPlaybook(playbookId, incidentId, options): ExecutionResult
// - acknowledgeIncident(incidentId, userId, note?): AcknowledgeResult
// - resolveIncident(incidentId, userId, resolutionNote): ResolveResult
// - getActiveLeases(tenantId): Lease[]
// - revokeLease(leaseId, userId): RevokeResult
```

**Acceptance Criteria:**
- [ ] Playbook trigger with dry-run support
- [ ] Incident acknowledgement with SLA timer
- [ ] Incident resolution with note
- [ ] Lease management
- [ ] Tenant isolation enforced
- [ ] Unit tests for service methods

---

### Task 3.6: Human Action Tracking

**Requirement:** REQ-6
**File:** `diagnostics/playbook/playbook.service.ts` (extend)

**Acceptance Criteria:**
- [ ] Task assignment to role
- [ ] SLA timer start on assignment
- [ ] Acknowledgement tracking (user + timestamp)
- [ ] Resolution tracking with note
- [ ] SLA compliance calculation
- [ ] Unit tests for human action flow

---

### Task 3.7: Property-Based Tests

**Requirement:** All properties from design.md
**File:** `diagnostics/playbook/__tests__/playbook.property.spec.ts`

```typescript
// Implement property tests for:
// - Property 1: Auto-Action Safety
// - Property 2: Idempotency
// - Property 3: Lease Auto-Rollback
// - Property 4: Escalation Loop Prevention
// - Property 5: Dry-Run Isolation
// - Property 6: Tenant Isolation
```

**Acceptance Criteria:**
- [ ] fast-check library used
- [ ] Minimum 100 iterations per property
- [ ] All 6 properties covered
- [ ] Test tags include requirement references

---

### Task 3.8: Contract Tests

**Requirement:** N/A (quality)
**File:** `diagnostics/playbook/__tests__/playbook.contract.spec.ts`

```typescript
// Contract tests for:
// - Playbook YAML schema
// - API response schemas
// - Audit log schemas
// - Execution result schema
```

**Acceptance Criteria:**
- [ ] Zod schemas for all responses
- [ ] Schema validation in tests
- [ ] Backward compatibility check

---

### Task 3.9: Golden Scenario Tests

**Requirement:** N/A (quality)
**File:** `diagnostics/playbook/__tests__/playbook.golden.spec.ts`

```typescript
// Golden scenarios:
// 1. Circuit breaker open → extend cache TTL → lease expires → rollback
// 2. High error rate → notification → escalation after 30min
// 3. Dry-run execution → notification sent, no auto-action
// 4. Cooldown active → action rejected
// 5. Escalation loop detected → playbook rejected at load
// 6. Idempotent execution → second call skipped
```

**Acceptance Criteria:**
- [ ] All 6 scenarios covered
- [ ] Deterministic fixtures
- [ ] Snapshot files committed
- [ ] CI runs golden tests

---


### Task 3.10: Integration Tests

**Requirement:** N/A (quality)
**File:** `diagnostics/playbook/__tests__/playbook.integration.spec.ts`

```typescript
// Integration tests:
// - Full playbook execution flow
// - Lease expiry background job
// - Notification delivery
// - Escalation timer
// - RBAC enforcement
// - Rate limiting
```

**Acceptance Criteria:**
- [ ] NestJS testing module used
- [ ] Real guards applied
- [ ] Background jobs tested
- [ ] All endpoints covered

---

### Task 3.11: Documentation

**Requirement:** N/A (documentation)
**Files:**
- `diagnostics/playbook/README.md`
- `docs/OPS-PLAYBOOK-API.md`

**Acceptance Criteria:**
- [ ] API reference (all endpoints)
- [ ] Playbook YAML format documentation
- [ ] Safety policy documentation
- [ ] Lease lifecycle documentation
- [ ] Example playbooks
- [ ] Türkçe açıklamalar

---

### Sprint 3 Checkpoint

**Exit Criteria:**
- [ ] Notification service working (webhook)
- [ ] Escalation timer working
- [ ] All API endpoints functional
- [ ] Human action tracking complete
- [ ] Property tests passing (100+ iterations)
- [ ] Contract tests passing
- [ ] Golden tests passing
- [ ] Integration tests passing
- [ ] Documentation complete

---

## Final Checklist

### Invariants Verified

| Invariant | Test Coverage |
|-----------|---------------|
| Auto-action safety | Property 1, Unit tests |
| Idempotency | Property 2, Unit tests |
| Lease auto-rollback | Property 3, Golden tests |
| Escalation loop prevention | Property 4, Semantic validation |
| Dry-run isolation | Property 5, Golden tests |
| Tenant isolation | Property 6, Integration tests |

### Files Created

```
diagnostics/playbook/
├── playbook.types.ts
├── playbook.module.ts
├── playbook.controller.ts
├── playbook.service.ts
├── playbook-registry.service.ts
├── playbook-matcher.service.ts
├── playbook-yaml-validator.service.ts
├── action-executor.service.ts
├── action-policy-guard.service.ts
├── action-lease-manager.service.ts
├── notification.service.ts
├── escalation.service.ts
├── playbook-audit.service.ts
├── playbook-metrics.service.ts
├── playbooks/
│   ├── circuit-breaker-open.yaml
│   ├── high-error-rate.yaml
│   ├── rate-limit-exhausted.yaml
│   ├── degraded-service.yaml
│   └── slo-breach.yaml
├── templates/
│   ├── circuit_breaker_alert.ts
│   ├── error_rate_alert.ts
│   ├── rate_limit_alert.ts
│   ├── degraded_service_alert.ts
│   └── slo_breach_alert.ts
├── __tests__/
│   ├── playbook-validator.spec.ts
│   ├── playbook-matcher.spec.ts
│   ├── action-policy-guard.spec.ts
│   ├── action-lease-manager.spec.ts
│   ├── playbook.property.spec.ts
│   ├── playbook.contract.spec.ts
│   ├── playbook.golden.spec.ts
│   └── playbook.integration.spec.ts
├── README.md
└── index.ts
```

### Exit Criteria (Phase Complete)

- [ ] All 3 sprints complete
- [ ] 5 playbooks defined and working
- [ ] Auto-actions guarded + leased + idempotent
- [ ] Notification working (webhook channel)
- [ ] Escalation timer working
- [ ] Audit trail complete
- [ ] Self-metrics being produced
- [ ] Playbook YAML validation (schema + semantic)
- [ ] Property tests (6 properties)
- [ ] Contract tests (schema validation)
- [ ] Golden tests (6 scenarios)
- [ ] Integration tests (full flow)
- [ ] Documentation complete

---

## Dependencies

### From Phase 7A (Self-serve Diagnostics)
- `DiagnosticsIncidentService` - incident detection
- `DiagnosticsAuditService` - audit infrastructure
- `DiagnosticsRBACGuard` - tenant isolation
- `DiagnosticsRateLimitGuard` - rate limiting
- `diagnostics.types.ts` - incident types

### From Phase 4.3 (Circuit Breaker)
- `CalcPreviewCircuitBreakerService` - auto-action target
- `CircuitState`, `DependencyName` types

### From Phase 4.4 (Versioned Cache)
- `VersionedCacheService` - auto-action target
- `CacheNamespace`, `CacheConfig` types

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Auto-action causes production issue | Safety policy + lease + idempotency |
| Playbook YAML error in prod | Schema + semantic validation at load |
| Escalation loop | Loop detection at load + max escalations |
| Lease rollback fails | Retry + alert + manual revoke endpoint |
| Notification spam | Cooldown + deduplication |
