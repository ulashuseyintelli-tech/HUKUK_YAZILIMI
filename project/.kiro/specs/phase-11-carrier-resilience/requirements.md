# Phase 11 — Carrier Resilience & Audit Completeness: Requirements

**Status:** Draft  
**Created:** 2026-02-06  
**Depends On:** Phase 10.5 (LOCKED)

---

## Overview

Phase 11 addresses operational resilience gaps identified in Phase 10.x:
- Worker jobs failing due to invalid carriers
- DLQ entries lacking full carrier context for forensics
- Infinite redrive loops without depth limits
- Large carrier payloads without compression

---

## Functional Requirements

### FR-11.0: DLQ Carrier Column Migration

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-11.0.1 | DLQ table MUST have `carrier_json TEXT NULL` column | P2 |
| FR-11.0.2 | DLQ table MUST have `carrier_version SMALLINT NULL` column | P2 |
| FR-11.0.3 | DLQ table MUST have `carrier_truncated BOOLEAN NOT NULL DEFAULT false` column | P2 |
| FR-11.0.4 | Migration MUST be backward compatible (NULL for existing rows) | P2 |
| FR-11.0.5 | Migration MUST NOT backfill existing rows (no carrier data available) | P2 |

### FR-11.1: Worker Inbound Degraded Mode

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-11.1.1 | Invalid carrier MUST NOT cause job failure | P2 |
| FR-11.1.2 | Invalid carrier MUST trigger warn log + metric | P2 |
| FR-11.1.3 | Invalid carrier MUST disable ALS/idempotency context for job | P2 |
| FR-11.1.4 | Job MUST continue with degraded correlation | P2 |
| FR-11.1.5 | Audit event MUST include `degradedContext` field when degraded | P2 |
| FR-11.1.6 | `degradedContext.reason` MUST be one of fixed enum values | P2 |
| FR-11.1.7 | `degradedContext.carrierSnapshot` MUST be max 500 chars, sanitized | P2 |

### FR-11.2: DLQ Carrier Storage

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-11.2.1 | DLQ insert MUST store full V2 carrier JSON | P2 |
| FR-11.2.2 | Carrier storage MUST be atomic with DLQ record insert | P2 |
| FR-11.2.3 | Admin redrive MUST use stored carrier if available | P2 |
| FR-11.2.4 | Admin redrive MUST fallback to minimal carrier if not available | P2 |
| FR-11.2.5 | Carrier truncation during storage MUST set `carrier_truncated=true` | P2 |
| FR-11.2.6 | Carrier truncation MUST emit metric | P2 |

### FR-11.3: Redrive Chain Depth Limit (Optional)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-11.3.1 | Redrive depth MUST be tracked via parentCorrelationId chain | P3 |
| FR-11.3.2 | Max redrive depth MUST be 3 | P3 |
| FR-11.3.3 | Exceeding depth MUST reject redrive with REDRIVE_DEPTH_EXCEEDED | P3 |
| FR-11.3.4 | Exceeding depth MUST flag DLQ entry as POISON | P3 |
| FR-11.3.5 | POISON entries MUST require manual intervention | P3 |

### FR-11.4: Carrier Compression (Optional)

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-11.4.1 | Storage compression MUST use gzip + base64 for DLQ/DB | P3 |
| FR-11.4.2 | Wire compression MUST use gzip + base64 for queue payload | P3 |
| FR-11.4.3 | Compression MUST be transparent to consumers | P3 |
| FR-11.4.4 | Decompression MUST happen at inbound normalize stage | P3 |

---

## Non-Functional Requirements

### NFR-11.1: Performance

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-11.1.1 | DLQ insert latency increase | < 5ms |
| NFR-11.1.2 | Carrier validation overhead | < 1ms |
| NFR-11.1.3 | Compression/decompression overhead | < 10ms |

### NFR-11.2: Observability

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-11.2.1 | All degraded mode entries MUST emit metric | 100% |
| NFR-11.2.2 | All carrier truncations MUST emit metric | 100% |
| NFR-11.2.3 | Metric labels MUST be fixed enums | No dynamic labels |

### NFR-11.3: Compatibility

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-11.3.1 | Existing DLQ entries MUST remain queryable | 100% |
| NFR-11.3.2 | Existing redrive flow MUST work without carrier_json | 100% |
| NFR-11.3.3 | V1 carriers MUST auto-upgrade to V2 | 100% |

---

## Constraints

### C-11.1: Locked Invariants (from Phase 10.5)

These values are IMMUTABLE and MUST NOT be changed:

| Invariant | Value |
|-----------|-------|
| MAX_CARRIER_SIZE_BYTES | 4096 |
| MAX_FAILURE_HISTORY_SIZE | 10 |
| MIN_FAILURE_HISTORY_SIZE | 3 |
| Retry: attemptNumber | INCREMENT |
| Redrive: correlationId | NEW |
| Redrive: parentCorrelationId | IMMUTABLE |
| Admin redrive: truncation | REJECT |
| Worker retry: truncation | ALLOW |

### C-11.2: Metrics Cardinality

All metric labels MUST use fixed enum values:

```typescript
// CarrierDropReason (degraded mode)
type CarrierDropReason = 
  | 'VERSION_MISMATCH'
  | 'MISSING_REQUIRED'
  | 'MALFORMED'
  | 'TYPE_ERROR'
  | 'UPGRADE_FAILED';

// DLQ source (redrive)
type DlqName = 'manifest_dlq' | 'bundle_dlq' | 'notification_dlq';

// Size enforcement action
type SizeAction = 'OK' | 'TRUNCATED' | 'REJECTED';
```

---

## Acceptance Criteria

### AC-11.0: Migration

- [ ] Migration applies without error
- [ ] Migration rolls back without error
- [ ] Existing DLQ entries have NULL carrier_json
- [ ] New DLQ entries can store carrier_json

### AC-11.1: Degraded Mode

- [ ] Invalid carrier does not fail job
- [ ] Metric `carrier_degraded_total{reason}` increments
- [ ] Audit event contains `degradedContext`
- [ ] Job completes successfully without ALS context

### AC-11.2: DLQ Carrier Storage

- [ ] DLQ insert stores carrier_json atomically
- [ ] Admin redrive uses stored carrier
- [ ] Fallback works when carrier_json is NULL
- [ ] Truncation sets carrier_truncated=true

### AC-11.3: Redrive Depth (Optional)

- [ ] 4th redrive attempt is rejected
- [ ] DLQ entry is flagged as POISON
- [ ] Metric `carrier_redrive_rejected_total{reason="DEPTH_EXCEEDED"}` increments

### AC-11.4: Compression (Optional)

- [ ] Compressed carrier is stored correctly
- [ ] Decompression is transparent
- [ ] Metrics track compressed/uncompressed counts

---

## References

- [ADR-008 v1.3](../../../docs/adr/ADR-008-QUEUE-JOB-CONTEXT-PROPAGATION.md)
- [Phase 10.5 LOCK](../phase-10-5-cross-queue-consistency/PHASE-10-5-LOCK.md)
- [carrier-lifecycle.types.ts](../../../apps/api/src/modules/calc-preview/diagnostics/object-store/manifest-retry/idempotency/carrier-lifecycle/carrier-lifecycle.types.ts)
