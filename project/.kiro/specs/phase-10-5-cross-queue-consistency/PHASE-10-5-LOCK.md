# Phase 10.5 — Cross-Queue Consistency: LOCK DOCUMENT

**Status:** 🔒 LOCKED + SIGNED OFF  
**Lock Date:** 2026-02-05  
**Sign-Off Date:** 2026-02-06  
**Phase:** 10.5 (Final phase of 10.x series)

---

## Summary

Phase 10.5 implements carrier lifecycle management across queue boundaries:
- **Retry Path:** Preserve + mutate (attemptNumber++, failureHistory)
- **DLQ Path:** Preserve + enrich (dlqReason, movedToDlqAt)
- **Redrive Path:** Clone + reset (new correlationId, parentCorrelationId link)

This phase completes the 10.x series, establishing deterministic carrier behavior for all queue transitions.

---

## Implemented Components

### Core Modules

| File | Purpose |
|------|---------|
| `carrier-lifecycle.types.ts` | V2 carrier schema with lifecycle tracking |
| `carrier-version-upgrade.ts` | V1 → V2 explicit upgrade converter |
| `retry-carrier-mutator.ts` | Retry path: preserve + mutate |
| `dlq-carrier-enricher.ts` | DLQ path: preserve + enrich |
| `redrive-carrier-cloner.ts` | Redrive path: clone + reset |
| `carrier-size-limiter.ts` | Size enforcement (4KB max, reject default) |
| `carrier-lifecycle-metrics.ts` | Prometheus metrics |
| `index.ts` | Module exports |

### Test Suites

| File | Tests |
|------|-------|
| `carrier-lifecycle.types.spec.ts` | Type guards, constants |
| `carrier-version-upgrade.spec.ts` | V1 → V2 upgrade |
| `retry-carrier-mutator.spec.ts` | Retry mutation |
| `dlq-carrier-enricher.spec.ts` | DLQ enrichment |
| `redrive-carrier-cloner.spec.ts` | Redrive cloning |
| `carrier-size-limiter.spec.ts` | Size enforcement |
| `carrier-lifecycle.integration.spec.ts` | Full lifecycle |

---

## Key Design Decisions

### 1. attemptNumber Semantics
- **First attempt = 0** (not 1)
- Increment happens on retry, not on initial enqueue
- Deterministic: same input → same output

### 2. Size Limit Policy
- **Default: REJECT** (no silent truncation)
- Allowlist truncation: `failureHistory` only
- Max size: 4096 bytes (4KB)
- Truncation keeps last 3 failures

### 3. Redrive Correlation
- **NEW correlationId** generated on redrive
- `parentCorrelationId` links to original (IMMUTABLE)
- Chain traceable: redrive2 → redrive1 → original

### 4. V1 → V2 Upgrade
- **Explicit converter** required (`upgradeCarrierToV2`)
- No implicit upgrades in production code
- Auto-upgrade in mutator/enricher for convenience

---

## Metrics

| Metric | Labels | Description |
|--------|--------|-------------|
| `carrier_mutated_total` | `path` | Carrier mutations (path=retry) |
| `carrier_dlq_enrichment_total` | `reason` | DLQ enrichments (EXHAUSTED/POISON/MANUAL) |
| `carrier_redrive_clone_total` | `source_dlq` | Redrive clones (FIXED ENUM) |
| `carrier_size_enforcement_total` | `action` | Size enforcement (OK/TRUNCATED/REJECTED) |
| `carrier_redrive_cloned_total` | - | Admin redrive success |
| `carrier_redrive_rejected_total` | `reason` | Admin redrive rejected (SIZE/INVALID/UPGRADE_FAILED/NOT_FOUND) |

### Metrics Cardinality Rules (FIXED)

All label values are FIXED ENUMS. Adding new values requires ADR update.

```
source_dlq: manifest_dlq | bundle_dlq | notification_dlq
reason (dlq): EXHAUSTED | POISON | MANUAL
reason (reject): SIZE | INVALID | UPGRADE_FAILED | NOT_FOUND
action: OK | TRUNCATED | REJECTED
path: retry
```

---

## Behavior Matrix

| Transition | correlationId | attemptNumber | failureHistory | DLQ Fields |
|------------|---------------|---------------|----------------|------------|
| Retry | PRESERVE | INCREMENT | APPEND | - |
| DLQ | PRESERVE | PRESERVE | PRESERVE | SET |
| Redrive | NEW | RESET (0) | CLEAR | CLEAR |

---

## Anti-Patterns (Do NOT)

1. ❌ Silent truncation without metric
2. ❌ Implicit V1 → V2 upgrade in production
3. ❌ Reusing correlationId on redrive
4. ❌ Modifying parentCorrelationId after set
5. ❌ Skipping size check after mutation

---

## Dependencies

- Phase 10.4: Queue Context Propagation (LOCKED)
- ADR-008 v1.3: Queue/Job Boundary Context Propagation

---

## Sign-Off Checklist

- [x] All core modules implemented
- [x] All test suites created
- [x] TypeScript diagnostics: 0 errors
- [x] Metrics defined and exported
- [x] Design decisions documented
- [x] Anti-patterns documented
- [x] Task 6: attempt_number label removed (cardinality fix)
- [x] Task 7: Admin Controller Integration (clone semantics, reject policy)
- [x] Task 8: ADR-008 v1.3 updated (lifecycle matrix, size policy, fixed labels)
- [x] Code ↔ ADR consistency verified (MAX_CARRIER_SIZE_BYTES = 4096)

---

## 10.x Series Status

| Phase | Description | Status |
|-------|-------------|--------|
| 10.0 | Retry Signature | 🔒 LOCKED |
| 10.1 | Production Hardening | 🔒 LOCKED |
| 10.2 | Audit & Observability | 🔒 LOCKED |
| 10.3 | Idempotency Hardening | 🔒 LOCKED |
| 10.4 | Queue Context Propagation | 🔒 LOCKED |
| 10.5 | Cross-Queue Consistency | 🔒 LOCKED |

**10.x Series: COMPLETE** ✅

---

## Next Steps (Post-Lock)

1. **CI Release Gate:** Add LOCK file hash check (see below)
2. **Phase 11 Backlog:** Worker degraded mode, DLQ carrier storage, redrive chain depth limit
3. **Monitoring:** Alert on `carrier_size_enforcement_total{action=REJECTED} > 0`
4. **Documentation:** Update ARCHITECTURE.md with carrier lifecycle diagram

---

## CI Release Gate (Recommended)

Add to `.github/workflows/ci.yml` to prevent accidental LOCK file modifications:

```yaml
- name: Verify Phase 10.x LOCK files unchanged
  run: |
    # Generate hash of all LOCK files
    LOCK_HASH=$(find .kiro/specs -name "*LOCK*.md" -exec sha256sum {} \; | sort | sha256sum | cut -d' ' -f1)
    EXPECTED_HASH="<computed-hash-after-merge>"
    
    if [ "$LOCK_HASH" != "$EXPECTED_HASH" ]; then
      echo "❌ LOCK files modified! Phase 10.x is sealed."
      echo "   If intentional, update EXPECTED_HASH in CI."
      exit 1
    fi
    echo "✅ LOCK files unchanged"
```

---

## Locked Invariants (DO NOT MODIFY)

These invariants are sealed with Phase 10.x:

| Invariant | Value | Rationale |
|-----------|-------|-----------|
| MAX_CARRIER_SIZE_BYTES | 4096 | Queue payload budget |
| MAX_FAILURE_HISTORY_SIZE | 10 | Bounded growth |
| MIN_FAILURE_HISTORY_SIZE | 3 | Truncation floor |
| Retry: attemptNumber | INCREMENT | Deterministic |
| Redrive: correlationId | NEW | Audit trail |
| Redrive: parentCorrelationId | IMMUTABLE | Lineage |
| Admin redrive: truncation | REJECT | Data integrity |
| Worker retry: truncation | ALLOW | Graceful degradation |

---

*This document is immutable after lock. Any changes require a new phase.*
