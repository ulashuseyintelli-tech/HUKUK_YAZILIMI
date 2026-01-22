# Phase 9B.5 — Design Document

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        PHASE 9B.5 - SNAPSHOT STORE CUTOVER                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         CONSUMERS                                    │   │
│  │  BaselineResolverService    EvidenceBundleService                   │   │
│  │  LegalHoldInventoryService  LegalHoldController                     │   │
│  │  SnapshotCleanupOrchestrator (via ISnapshotCleanupRepository)       │   │
│  └───────────────────────────────┬─────────────────────────────────────┘   │
│                                  │                                          │
│                                  ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      ISnapshotStore                                  │   │
│  │  (Domain Contract - Platform Anayasa Katmanı)                       │   │
│  │                                                                      │   │
│  │  Invariants:                                                        │   │
│  │  ├─ tenant isolation: all ops require tenantId                      │   │
│  │  ├─ immutability: LEGAL_HOLD/PROMOTED/BASELINE never deleted        │   │
│  │  ├─ retention: expiresAt from retention-policy.ts                   │   │
│  │  └─ idempotency: (tenantId,incidentId,runId,hash) unique            │   │
│  └───────────────────────────────┬─────────────────────────────────────┘   │
│                                  │                                          │
│           ┌──────────────────────┴──────────────────────┐                  │
│           │                                              │                  │
│           ▼                                              ▼                  │
│  ┌─────────────────────────┐                ┌─────────────────────────┐    │
│  │  SnapshotStoreService   │                │  InMemorySnapshotStore  │    │
│  │  (Postgres - PROD)      │                │  (TEST ONLY)            │    │
│  │                         │                │                         │    │
│  │  ├─ Policy enforcement  │                │  ❌ FORBIDDEN in prod   │    │
│  │  ├─ Metrics emission    │                │  ✅ Allowed in test     │    │
│  │  └─ Logging             │                │  ✅ Allowed in dev      │    │
│  └───────────┬─────────────┘                └─────────────────────────┘    │
│              │                                                              │
│              ▼                                                              │
│  ┌─────────────────────────┐                                               │
│  │  ISnapshotRepository    │                                               │
│  │  (Phase 9B - LOCKED)    │                                               │
│  └───────────┬─────────────┘                                               │
│              │                                                              │
│              ▼                                                              │
│  ┌─────────────────────────┐                                               │
│  │  PrismaSnapshotRepo     │                                               │
│  │  (PostgreSQL)           │                                               │
│  └─────────────────────────┘                                               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Interface Contract

### ISnapshotStore

```typescript
/**
 * Snapshot Store Interface
 * 
 * Platform contract for all snapshot operations.
 * Implementations MUST enforce all invariants.
 */
export interface ISnapshotStore {
  // ========== CREATE ==========
  
  /**
   * Create a new snapshot
   * 
   * @throws SNAPSHOT_ALREADY_EXISTS if (tenantId, incidentId, runId, calcHash) exists
   * @throws INVALID_TENANT_ID if tenantId is empty/null
   * @throws INVALID_CALC_HASH if hash format invalid
   */
  createSnapshot(params: CreateSnapshotParams): Promise<Snapshot>;
  
  // ========== READ ==========
  
  /**
   * Find snapshot by ID
   * 
   * @returns null if not found OR wrong tenant (enumeration protection)
   */
  findById(tenantId: string, snapshotId: string): Promise<Snapshot | null>;
  
  /**
   * Find snapshots by incident
   */
  findByIncident(tenantId: string, incidentId: string): Promise<Snapshot[]>;
  
  /**
   * Find baseline snapshot for incident
   * 
   * @returns null if no baseline exists
   */
  findBaseline(tenantId: string, incidentId: string): Promise<Snapshot | null>;
  
  /**
   * List snapshots with pagination
   */
  list(tenantId: string, options: ListOptions): Promise<PaginatedResult<Snapshot>>;
  
  // ========== UPDATE (Flag Operations Only) ==========
  
  /**
   * Promote snapshot to baseline
   * 
   * @throws SNAPSHOT_NOT_FOUND if not found or wrong tenant
   * @throws BASELINE_ALREADY_EXISTS if incident already has baseline
   */
  promoteToBaseline(tenantId: string, snapshotId: string): Promise<Snapshot>;
  
  /**
   * Apply legal hold
   * 
   * @throws SNAPSHOT_NOT_FOUND if not found or wrong tenant
   */
  applyLegalHold(tenantId: string, snapshotId: string, reason: string): Promise<Snapshot>;
  
  /**
   * Remove legal hold
   * 
   * @throws SNAPSHOT_NOT_FOUND if not found or wrong tenant
   * @throws CANNOT_REMOVE_LEGAL_HOLD if snapshot is also PROMOTED/BASELINE
   */
  removeLegalHold(tenantId: string, snapshotId: string): Promise<Snapshot>;
  
  // ========== DELETE ==========
  
  /**
   * Delete snapshot (soft or hard based on config)
   * 
   * @throws SNAPSHOT_NOT_FOUND if not found or wrong tenant
   * @throws CANNOT_DELETE_IMMUTABLE if LEGAL_HOLD/PROMOTED/BASELINE
   */
  delete(tenantId: string, snapshotId: string): Promise<void>;
}
```

### Supporting Types

```typescript
export interface CreateSnapshotParams {
  tenantId: string;
  incidentId: string;
  runId: string;
  calcHash: string;           // SHA256, validated format
  calcResultNorm: unknown;    // Normalized calc result
  capturedAt: Date;
  retentionClass: RetentionClass;
}

export interface Snapshot {
  id: string;
  tenantId: string;
  incidentId: string;
  runId: string;
  calcHash: string;
  capturedAt: Date;
  createdAt: Date;
  expiresAt: Date | null;     // null = never expires
  
  // Flags
  isBaseline: boolean;
  isPromoted: boolean;
  legalHoldReason: string | null;
  
  // Computed
  isImmutable: boolean;       // isBaseline || isPromoted || legalHoldReason != null
}

export type RetentionClass = 'STANDARD' | 'EXTENDED' | 'PERMANENT';

export interface ListOptions {
  cursor?: string;
  limit?: number;
  orderBy?: 'createdAt' | 'capturedAt';
  orderDir?: 'asc' | 'desc';
}
```

## Module Wiring

### TruthLayerModule (Updated)

```typescript
@Module({
  providers: [
    // Backend selection based on env
    {
      provide: SNAPSHOT_STORE,
      useFactory: (config: ConfigService, prismaRepo: PrismaSnapshotRepository) => {
        const backend = config.get('SNAPSHOT_STORE_BACKEND', 'postgres');
        const nodeEnv = config.get('NODE_ENV', 'development');
        
        if (backend === 'inmemory' && nodeEnv === 'production') {
          throw new Error(
            'FATAL: InMemorySnapshotStore is forbidden in production. ' +
            'Set SNAPSHOT_STORE_BACKEND=postgres'
          );
        }
        
        if (backend === 'inmemory') {
          return new InMemorySnapshotStore();
        }
        
        return new SnapshotStoreService(prismaRepo);
      },
      inject: [ConfigService, PrismaSnapshotRepository],
    },
  ],
  exports: [SNAPSHOT_STORE],
})
export class TruthLayerModule {}
```

### Injection Token

```typescript
export const SNAPSHOT_STORE = Symbol('SNAPSHOT_STORE');
```

## Database Schema (Existing from 9B)

```prisma
model SimulationSnapshot {
  id            String    @id @default(uuid())
  tenantId      String
  incidentId    String
  runId         String
  calcHash      String
  calcResultNorm Json
  capturedAt    DateTime
  createdAt     DateTime  @default(now())
  expiresAt     DateTime?
  
  isBaseline    Boolean   @default(false)
  isPromoted    Boolean   @default(false)
  legalHoldReason String?
  
  // Indexes
  @@unique([tenantId, incidentId, runId, calcHash])
  @@index([tenantId, expiresAt])
  @@index([tenantId, incidentId])
  @@index([tenantId, incidentId, isBaseline])
}
```

## Error Codes

| Code | HTTP | Description |
|------|------|-------------|
| `SNAPSHOT_NOT_FOUND` | 404 | Snapshot doesn't exist or wrong tenant |
| `SNAPSHOT_ALREADY_EXISTS` | 409 | Duplicate (tenantId, incidentId, runId, hash) |
| `INVALID_TENANT_ID` | 400 | Empty or null tenantId |
| `INVALID_CALC_HASH` | 400 | Hash format invalid (not SHA256) |
| `CANNOT_DELETE_IMMUTABLE` | 403 | Snapshot has LEGAL_HOLD/PROMOTED/BASELINE |
| `BASELINE_ALREADY_EXISTS` | 409 | Incident already has a baseline |
| `CANNOT_REMOVE_LEGAL_HOLD` | 403 | Snapshot is also PROMOTED/BASELINE |

## Retention Policy Integration

```typescript
// retention-policy.ts remains SINGLE SOURCE OF TRUTH
// SnapshotStoreService calls it:

async createSnapshot(params: CreateSnapshotParams): Promise<Snapshot> {
  const expiresAt = this.retentionPolicy.calculateExpiry(
    params.retentionClass,
    new Date()
  );
  
  return this.repository.create({
    ...params,
    expiresAt,
  });
}
```

## Cleanup Orchestrator Relationship

Phase 11's `ISnapshotCleanupRepository` remains separate:

```
ISnapshotStore           → CRUD + query (this phase)
ISnapshotCleanupRepository → bulk delete + tenant discovery (Phase 11)
```

Reason: Cleanup has specialized logic (`buildDeletableWhere`) that doesn't belong in generic store.

## Migration Notes

### No Data Migration

- Existing InMemory data is NOT migrated
- InMemory is volatile; data loss is expected on restart anyway
- New snapshots after cutover go to Postgres

### Consumer Migration Checklist

| Consumer | Current | Target |
|----------|---------|--------|
| BaselineResolverService | InMemorySnapshotStore | ISnapshotStore |
| EvidenceBundleService | InMemorySnapshotStore | ISnapshotStore |
| LegalHoldInventoryService | InMemorySnapshotStore | ISnapshotStore |
| LegalHoldController | InMemorySnapshotStore | ISnapshotStore |
| simulation-api.module.ts | Direct wiring | TruthLayerModule import |

## Observability

### Startup Log

```
[TruthLayerModule] Snapshot store backend: postgres
[TruthLayerModule] Shadow compare: disabled
```

### Metrics

| Metric | Type | Labels |
|--------|------|--------|
| `snapshot_store_operation_total` | Counter | `operation`, `status` |
| `snapshot_store_operation_duration_ms` | Histogram | `operation` |
| `snapshot_store_shadow_drift_total` | Counter | — (only if shadow enabled) |

## Security Considerations

### Tenant Isolation

- All methods require `tenantId` as first parameter
- Wrong tenant → `SNAPSHOT_NOT_FOUND` (not `ACCESS_DENIED`)
- Prevents tenant enumeration attacks

### Hash Validation

- `calcHash` must match `/^[a-f0-9]{64}$/i` (SHA256)
- Hash computed ONLY in `determinism.ts` (Phase 9B rule)
- Store validates format, never computes
