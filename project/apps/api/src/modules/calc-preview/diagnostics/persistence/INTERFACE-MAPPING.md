# Interface Mapping - Phase 9B.5 Truth Layer

## Single Source of Truth

This document defines the ONLY valid interfaces for snapshot operations.

## Interface Mapping

| Legacy (DEPRECATED)                          | Truth Layer (USE THIS)                              |
|----------------------------------------------|-----------------------------------------------------|
| `ISnapshotStore` from `snapshot-store.types` | `ISnapshotStore` from `persistence/snapshot-store.interface` |
| `StoredSnapshot`                             | `SimulationSnapshot`                                |
| `snapshot.points[]`                          | `extractPoints(snapshot.calcResult)`                |
| Direct `InMemorySnapshotStore` injection     | `@Inject(SNAPSHOT_STORE)`                           |

## Compile-Time Enforcement

The legacy `ISnapshotStore` has been renamed to `ILegacySnapshotStore`.

If you see this error:
```
Module '"../evidence/snapshot-store.types"' has no exported member 'ISnapshotStore'
```

**FIX:** Change your import to:
```typescript
import { 
  ISnapshotStore, 
  SNAPSHOT_STORE,
  SimulationSnapshot,
} from '../persistence/snapshot-store.interface';
```

## Points - Single Source of Truth

**RULE:** `calcResult` is authoritative. `points[]` is NEVER stored separately.

### Wrong ❌
```typescript
// DO NOT add points to SimulationSnapshot
interface SimulationSnapshot {
  points: EvidencePoint[];  // ❌ WRONG - creates two sources of truth
  calcResult: unknown;
}
```

### Correct ✅
```typescript
import { extractPoints } from '../simulation/calc-result-projection';

// Get points from calcResult
const { points } = extractPoints(snapshot.calcResult);
```

## TenantId Requirement

All query methods require `tenantId` for tenant isolation:

```typescript
// ❌ WRONG - no tenantId
const snapshots = await store.findByIncidentId(incidentId);

// ✅ CORRECT - tenantId required
const snapshots = await store.findByIncidentId(tenantId, incidentId);
```

## CalcHash Contract

`calcHash` must be calculated using the SAME canonicalization:

```typescript
import { canonicalHash, canonicalStringify } from '../simulation/determinism';

// Calculate hash
const calcResultNorm = normalizeNumbers(calcResult);
const calcHash = canonicalHash(calcResultNorm);

// Create snapshot
await store.createSnapshot({
  // ...
  calcResult,
  calcResultNorm,
  calcHash,  // REQUIRED
});
```

## Migration Checklist

- [ ] Replace `ISnapshotStore` import from `snapshot-store.types` → `persistence/snapshot-store.interface`
- [ ] Replace `StoredSnapshot` → `SimulationSnapshot`
- [ ] Replace `snapshot.points[]` → `extractPoints(snapshot.calcResult)`
- [ ] Add `tenantId` to all query calls
- [ ] Use `@Inject(SNAPSHOT_STORE)` instead of direct class injection
