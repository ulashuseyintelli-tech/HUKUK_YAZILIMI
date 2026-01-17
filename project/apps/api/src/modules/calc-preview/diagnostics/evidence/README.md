# Evidence Module

Phase 8 - What-if Simulation + Condition-based Escalation

## Overview

Evidence modülü, simülasyon ve escalation kararları için kanıt toplama ve değerlendirme altyapısını sağlar.

## Gate Hierarchy (HARD)

```
EvidenceGate → PolicyGuard → Executor
```

**Kritik Kural**: EvidenceGate fail ⇒ PolicyGuard ve Executor çalıştırılamaz.

Bu hiyerarşi "policy passed but evidence stale" gibi karma durumların oluşmasını engeller.

## Evidence Thresholds

| Flag | Threshold | Condition |
|------|-----------|-----------|
| `STALE_EVIDENCE` | 60 sec | `snapshotAgeSec > 60` |
| `STALE_DATA` | 120 sec | `freshnessSec > 120` (any point) |
| `LOW_CONFIDENCE` | 0.5 | `confidence < 0.5` (critical metrics only) |

### Critical Metrics

Sadece kritik metrikler LOW_CONFIDENCE flag'ini tetikler:
- `error_rate`
- `slo_burn_rate`
- `latency_p99`

## Components

### ClockService

Tüm zaman hesaplamaları için tek kaynak. Clock drift sorunlarını önler.

```typescript
// Production
const clock = new ClockService();

// Testing
const mockClock = new MockClockService(new Date('2026-01-17T12:00:00Z'));
mockClock.advanceSeconds(120);
```

### EvidenceAggregatorService

Metrik kaynaklarından evidence point'leri toplar.

```typescript
const snapshot = aggregator.captureSnapshot(tenantId, incidentId, windowSec);
```

**Minimum Metrikler (Sprint 1A)**:
- `error_rate` - Hata oranı (%)
- `latency_p99` - p99 latency (ms)
- `slo_burn_rate` - SLO burn rate (ratio)

### EvidenceGateService

Snapshot kalitesini değerlendirir ve downstream gate'lere geçişi kontrol eder.

```typescript
const result = evidenceGate.evaluate(snapshot);

if (!evidenceGate.canProceed(result)) {
  // DO NOT call PolicyGuard or Executor
  return evidenceGate.createBlockedResponse(result);
}

// Safe to proceed
const policyResult = policyGuard.evaluate(...);
```

## Blocked Response Format

EvidenceGate fail olduğunda deterministik response:

```json
{
  "scenarios": [],
  "ranking": [],
  "blockedReason": "EVIDENCE_GATE_FAILED",
  "blockedFlags": ["STALE_EVIDENCE"],
  "autoEscalationAllowed": false,
  "promoteAllowed": false,
  "snapshotAgeSec": 120,
  "flags": ["STALE_EVIDENCE"]
}
```

## Usage Example

```typescript
// 1. Capture evidence
const snapshot = aggregator.captureSnapshot(tenantId, incidentId);

// 2. Evaluate gate
const gateResult = evidenceGate.evaluate(snapshot);

// 3. Check if can proceed
if (!evidenceGate.canProceed(gateResult)) {
  return evidenceGate.createBlockedResponse(gateResult);
}

// 4. Proceed with simulation/escalation
// ...
```

## Testing

```bash
# Run evidence tests
npx jest --testPathPattern=evidence
```

## Snapshot Retention (Sprint 1B)

### TTL Policy

| Snapshot Type | Retention | Calculation |
|---------------|-----------|-------------|
| Non-promoted | 72 hours | `expiresAt = createdAt + 72h` |
| Promoted | 168 hours (7 days) | `expiresAt = createdAt + 168h` |

**Key Decisions**:
- `expiresAt` is calculated from `createdAt` (persist time), not `capturedAt`
- `markPromoted()` is idempotent: first promote wins, subsequent calls don't extend retention
- `deleteExpired()` is idempotent: second call returns 0, no error

### SnapshotStore Interface

```typescript
interface SnapshotStore {
  save(snapshot: EvidenceSnapshot): string;           // returns snapshotId
  get(snapshotId: string): StoredSnapshot | null;
  listByIncident(incidentId: string): StoredSnapshot[]; // capturedAt DESC
  markPromoted(snapshotId: string): boolean;          // idempotent
  deleteExpired(): number;                            // returns deleted count
}
```

### Cleanup Job

```typescript
const cleanup = new SnapshotCleanupService(store, {
  intervalMs: 10 * 60 * 1000, // 10 minutes
});
cleanup.start();
```

- Boolean concurrency lock prevents overlapping runs
- Logs deleted count after each run

## Drift Detection (Sprint 1B)

### Drift Formula

```
For each common metric:
  rel = abs(new - old) / max(eps, abs(old))
  weighted = rel * weight

driftScore = sqrt(sum(weighted²) / sum(weight²))
```

### Drift Weights

| Metric | Weight | Rationale |
|--------|--------|-----------|
| `error_rate` | 2.0 | Critical - user impact |
| `slo_burn_rate` | 2.0 | Critical - SLO breach |
| `latency_p99` | 1.0 | Important - tail latency |
| `latency_p95` | 1.0 | Important - tail latency |
| `saturation_cpu` | 0.5 | Secondary - resource |
| `queue_depth` | 0.5 | Secondary - backpressure |

### Drift Threshold

```typescript
const DRIFT_THRESHOLD = 0.15;

// Comparison: >= (0.15 or above blocks)
if (driftScore >= DRIFT_THRESHOLD) {
  // Block promote, suggest RESIMULATE
}
```

### Edge Cases

| Scenario | Result |
|----------|--------|
| Identical snapshots | `driftScore = 0` |
| No common metrics | `driftScore = 1.0`, `noComparableMetrics = true` |
| Empty snapshots | `driftScore = 1.0`, `noComparableMetrics = true` |
| Single metric | Formula applies normally |

### Usage

```typescript
import { calculateDrift, DRIFT_THRESHOLD, shouldBlockOnDrift } from './drift-utils';

const result = calculateDrift(baselineSnapshot, currentSnapshot);

if (shouldBlockOnDrift(result)) {
  return {
    blocked: true,
    reason: 'DRIFT_TOO_HIGH',
    suggestion: 'RESIMULATE',
    driftScore: result.driftScore,
    driftDetails: result.metricDrifts,
  };
}
```

## Files

- `clock.service.ts` - Time operations
- `evidence-gate.service.ts` - Gate evaluation
- `evidence-aggregator.service.ts` - Metric collection
- `snapshot-store.types.ts` - Store interfaces
- `snapshot-store.service.ts` - InMemory store implementation
- `snapshot-cleanup.service.ts` - TTL cleanup job
- `drift-utils.ts` - Drift calculation utilities
- `index.ts` - Module exports
