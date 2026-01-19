# Design Document: Sprint 9B PostgreSQL Migration

## Status: CORE IMPLEMENTATION COMPLETE ✅

**Completed**: 2026-01-18
- Prisma schema with SimulationRun and SimulationSnapshot models
- Migration applied to PostgreSQL
- Repository interfaces with full contract documentation
- Prisma repository implementations with all invariant enforcement
- Integration tests (33 tests passing)

**Remaining**: Service integration, module wiring, production deployment

---

## Overview

Sprint 9B migrates the Truth Layer from in-memory storage to PostgreSQL. This layer handles authoritative data that must be preserved: incidents, snapshots, and simulation runs. The migration preserves the existing interface while adding PostgreSQL as the primary backend.

### Risk Profile

**Data Integrity** - Wrong implementation means wrong legal decisions or lost audit trails. This is the highest-risk layer because:
1. Data is authoritative and cannot be reconstructed
2. Legal holds have compliance implications
3. Simulation determinism depends on consistent data

### Migration Strategy

1. Implement PostgreSQL adapters with same interface as in-memory
2. Create schema migrations with rollback support
3. Run existing tests against both backends
4. Deploy with feature flag, NO fallback to in-memory (integrity requirement)
5. Monitor metrics, validate data integrity continuously

---

## Truth Layer Contract (LOCKED)

**Lock Date**: 2026-01-18
**Lock Version**: v1.0.0

This section defines the immutable contract for the Truth Layer. Changes require RFC + approval.

### 0. Purpose

PostgreSQL is the single source of truth for SimulationRun + Snapshot. If DB is down, the system does NOT degrade - it fails closed with a clear error. In-memory exists only for shadow-compare during migration; it never produces production decisions.

### 1. Domain Hierarchy

```
Incident (hukuki olay / case'e bağlı)
    │
    ├── SimulationRun (1:N) - incident üzerinde yapılan simülasyon
    │       │
    │       ├── current_snapshot_id (FK) ──┐
    │       └── baseline_snapshot_id (FK) ─┼──► Snapshot
    │                                      │
    └── Snapshot (1:N) - hesaplama sonucu ─┘
```

**Key Decision**: Run → Snapshot explicit FK
- `SimulationRun.current_snapshot_id` → produced snapshot
- `SimulationRun.baseline_snapshot_id` → reference baseline
- Eliminates "which snapshot belongs to which run?" ambiguity
- Enables baseline uniqueness enforcement

### 2. Table Definitions

#### 2.1 simulation_runs

| Column | Type | Constraints | Mutable |
|--------|------|-------------|---------|
| run_id | TEXT | PRIMARY KEY | ❌ Immutable |
| incident_id | TEXT | NOT NULL, FK → incidents | ❌ Immutable |
| tenant_id | TEXT | NOT NULL, INDEX | ❌ Immutable |
| scenario_id | TEXT | NOT NULL | ❌ Immutable |
| seed | INTEGER | NOT NULL | ❌ Immutable |
| simulation_version | TEXT | NOT NULL | ❌ Immutable |
| engine_version | TEXT | NULL | ❌ Immutable |
| status | TEXT | NOT NULL, CHECK | ✅ Mutable |
| started_at | TIMESTAMPTZ | NOT NULL | ❌ Immutable |
| finished_at | TIMESTAMPTZ | NULL | ✅ Mutable |
| error_code | TEXT | NULL | ✅ Mutable |
| error_message | TEXT | NULL | ✅ Mutable |
| current_snapshot_id | TEXT | NULL, FK → snapshots | ✅ Mutable (once) |
| baseline_snapshot_id | TEXT | NULL, FK → snapshots | ✅ Mutable (once) |

**Status Values**: `PENDING`, `RUNNING`, `COMPLETED`, `FAILED`

**Status Monotonicity**: 
- `PENDING` → `RUNNING` → `COMPLETED` | `FAILED`
- No backward transitions allowed

#### 2.2 simulation_snapshots

| Column | Type | Constraints | Mutable |
|--------|------|-------------|---------|
| snapshot_id | TEXT | PRIMARY KEY | ❌ Immutable |
| incident_id | TEXT | NOT NULL, FK → incidents | ❌ Immutable |
| tenant_id | TEXT | NOT NULL, INDEX | ❌ Immutable |
| run_id | TEXT | NULL, FK → simulation_runs | ❌ Immutable |
| snapshot_kind | TEXT | NOT NULL, CHECK | ❌ Immutable |
| is_baseline | BOOLEAN | NOT NULL DEFAULT FALSE | ✅ Mutable (upgrade only) |
| verdict | TEXT | NOT NULL | ❌ Immutable |
| drift_score | DECIMAL(10,6) | NOT NULL | ❌ Immutable |
| calc_result | JSONB | NOT NULL | ❌ Immutable |
| calc_result_norm | JSONB | NOT NULL | ❌ Immutable |
| calc_hash | TEXT | NOT NULL | ❌ Immutable |
| legal_hold | BOOLEAN | NOT NULL DEFAULT FALSE | ✅ Mutable (upgrade only) |
| legal_hold_reason | TEXT | NULL | ✅ Mutable |
| retention_policy | TEXT | NOT NULL DEFAULT 'STANDARD' | ✅ Mutable (upgrade only) |
| created_at | TIMESTAMPTZ | NOT NULL | ❌ Immutable |
| expires_at | TIMESTAMPTZ | NULL | ✅ Mutable |

**Snapshot Kind Values**: `BASELINE`, `CURRENT`, `INTERMEDIATE`

**Retention Policy Values**: `STANDARD`, `PROMOTED`, `LEGAL_HOLD`

**Retention Upgrade Only**: `STANDARD` → `PROMOTED` → `LEGAL_HOLD` (no downgrade)

### 3. Critical Invariants

#### Invariant A: Single Baseline Per Incident
```sql
-- Partial unique index enforces this at DB level
CREATE UNIQUE INDEX idx_snapshots_single_baseline 
ON simulation_snapshots(incident_id) 
WHERE is_baseline = TRUE;
```

#### Invariant B: Baseline Requires Completed Run
```
IF run.status != 'COMPLETED' THEN
  run.baseline_snapshot_id MUST BE NULL
```
**Enforcement**: Application layer + property test (no DB trigger for simplicity)

#### Invariant C: Immutable Fields on UPSERT
```
ON CONFLICT (run_id) DO UPDATE:
  - status: allowed (forward only)
  - finished_at: allowed
  - current_snapshot_id: allowed IF currently NULL
  - baseline_snapshot_id: allowed IF currently NULL
  - ALL OTHER FIELDS: must match existing or reject
```

#### Invariant D: Status Monotonicity
```
PENDING → RUNNING → COMPLETED
PENDING → RUNNING → FAILED
RUNNING → COMPLETED (no reversal)
RUNNING → FAILED (no reversal)
```

#### Invariant E: Snapshot Insert-Only
Snapshots are immutable after creation. Only these fields can change:
- `is_baseline`: FALSE → TRUE (never TRUE → FALSE)
- `legal_hold`: FALSE → TRUE (never TRUE → FALSE)
- `retention_policy`: upgrade only
- `expires_at`: recalculated on policy change
- `legal_hold_reason`: can be set when legal_hold = TRUE

### 4. Numeric Determinism

**Problem**: PostgreSQL DECIMAL vs JavaScript number precision mismatch breaks determinism.

**Solution**: Normalized JSON storage

| Field | Storage | Purpose |
|-------|---------|---------|
| `drift_score` | DECIMAL(10,6) | Source of truth for drift |
| `calc_result` | JSONB | Raw result (debug/audit) |
| `calc_result_norm` | JSONB | Normalized for hash (all numbers as strings with 6 decimal places) |
| `calc_hash` | TEXT | SHA256(canonicalStringify(calc_result_norm)) |

**Normalization Rule**:
```typescript
function normalizeForHash(value: unknown): unknown {
  if (typeof value === 'number') {
    return value.toFixed(6); // String with 6 decimals
  }
  if (Array.isArray(value)) {
    return value.map(normalizeForHash);
  }
  if (value && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = normalizeForHash((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}
```

### 5. Transaction Boundaries

Each repository method is atomic:

| Method | Transaction Scope |
|--------|-------------------|
| `SimulationRunRepository.upsert(run)` | Single transaction, immutable field protection |
| `SimulationRunRepository.updateStatus(runId, status)` | Single transaction, monotonicity check |
| `SnapshotRepository.insert(snapshot)` | Single transaction, insert-only |
| `SnapshotRepository.setBaseline(snapshotId)` | Single transaction, uniqueness check |
| `SnapshotRepository.setLegalHold(snapshotId)` | Single transaction, upgrade-only |

**Cross-Table Operations**: Use `TransactionManager.executeInTransaction()` for:
- Creating run + snapshot together
- Setting baseline + updating run.baseline_snapshot_id

### 6. Migration Strategy: Shadow-Read

**NOT dual-write** - Phase 9B has NO FALLBACK rule.

```
┌─────────────────────────────────────────────────────────────┐
│                    Shadow-Read Strategy                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Phase 1: Shadow Compare                                     │
│  ┌──────────────┐    ┌──────────────┐                       │
│  │  PostgreSQL  │    │  In-Memory   │                       │
│  │   (write)    │    │   (read)     │                       │
│  └──────┬───────┘    └──────┬───────┘                       │
│         │                   │                                │
│         └───────┬───────────┘                                │
│                 ▼                                            │
│         ┌──────────────┐                                     │
│         │   Compare    │ → Mismatch? → Alert + Log           │
│         └──────────────┘                                     │
│                                                              │
│  Phase 2: Cutover                                            │
│  ┌──────────────┐                                            │
│  │  PostgreSQL  │ ← All reads + writes                       │
│  │   (primary)  │                                            │
│  └──────────────┘                                            │
│                                                              │
│  In-memory disabled, comparison mode off                     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 7. Property Test Requirements

| # | Property | Validates |
|---|----------|-----------|
| 1 | Determinism | Same input → same run_id |
| 2 | Idempotent UPSERT | Same run_id save() → immutable fields unchanged |
| 3 | Baseline Uniqueness | Max 1 baseline per incident |
| 4 | Referential Integrity | No orphan snapshots/runs |
| 5 | Atomicity | Failure → no partial state |
| 6 | Status Monotonicity | COMPLETED never reverts to RUNNING |
| 7 | Hash Stability | Same input → same calc_hash |
| 8 | Shadow Compare | DB vs in-memory semantic equality (IDs excluded) |

### 8. Locked Decisions Summary

| Decision | Status |
|----------|--------|
| Incident is center entity | 🔒 LOCKED |
| Run → Snapshot explicit FK | 🔒 LOCKED |
| Snapshot insert-only, immutable | 🔒 LOCKED |
| Single baseline invariant (partial unique index) | 🔒 LOCKED |
| NO FALLBACK: DB down = system down | 🔒 LOCKED |
| Numeric normalization for determinism | 🔒 LOCKED |
| Shadow-compare migration (not dual-write) | 🔒 LOCKED |
| App-layer invariant enforcement (no triggers) | 🔒 LOCKED |
| Run→Snapshot FK yok (cycle/migration karmaşıklığını azaltmak için) | 🔒 LOCKED |
| incident_id her iki tabloda String (canonical format) | 🔒 LOCKED |
| Prisma ORM kullan (pg paketi yok) | 🔒 LOCKED |

### 9. Design Notes (Future Reference)

**Run→Snapshot FK Kararı**: `simulation_runs.current_snapshot_id` ve `baseline_snapshot_id` alanları için DB FK constraint bilinçli olarak eklenmedi. Nedenleri:
1. Cyclic FK riski (snapshot→run FK zaten var)
2. Migration sırası karmaşıklığı
3. App-layer'da incident mismatch kontrolü yeterli

Bu karar, 3 ay sonra "niye FK yok?" diye gelen birinin yanlış "iyileştirme" yapmasını engellemek için dokümante edilmiştir.

**incident_id Tip Garantisi**: `incident_id` her iki tabloda da `String` tipinde ve canonical format'ta tutulur. Bu, app-layer'daki incident mismatch kontrolünün güvenilir çalışmasını sağlar. Eğer Incident entity'si Prisma'ya eklenirse, tip uyumu kontrol edilmelidir.

### 10. Additional Locked Decisions (Task 3)

| Decision | Status | Rationale |
|----------|--------|-----------|
| Baseline selection yalnızca `isBaseline=true` üzerinden yapılır | 🔒 LOCKED | `snapshotKind` baseline için kullanılmaz - tek kaynak |
| Tenant mismatch için ayrı `TenantMismatchError` | 🔒 LOCKED | Debug kolaylığı - incident vs tenant hatası ayrımı |
| Linking methodları tenant/incident'i DB'den okuyarak doğrular | 🔒 LOCKED | Caller hatası önlenir |
| `setCurrentSnapshot(runId, snapshotId)` - snapshotIncidentId parametresi yok | 🔒 LOCKED | Repo DB'den okur |
| `markAsBaseline(snapshotId)` returns `void` | 🔒 LOCKED | Idempotent, hata varsa throw |
| `snapshotKind` immutable, insert-time set edilir | 🔒 LOCKED | `isBaseline` ayrı upgrade-only flag |

---

## Architecture

### Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Truth Layer Services                               │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    Repository Interfaces                             │   │
│  │  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐        │   │
│  │  │ISimulationRun   │ │IIncident        │ │ISnapshot        │        │   │
│  │  │Repository       │ │Repository       │ │Repository       │        │   │
│  │  └────────┬────────┘ └────────┬────────┘ └────────┬────────┘        │   │
│  └───────────┼───────────────────┼───────────────────┼──────────────────┘   │
│              │                   │                   │                      │
│  ┌───────────┼───────────────────┼───────────────────┼──────────────────┐   │
│  │           ▼                   ▼                   ▼                  │   │
│  │  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐        │   │
│  │  │PostgreSQL       │ │PostgreSQL       │ │PostgreSQL       │        │   │
│  │  │SimulationRun    │ │Incident         │ │Snapshot         │        │   │
│  │  │Repository       │ │Repository       │ │Repository       │        │   │
│  │  └────────┬────────┘ └────────┬────────┘ └────────┬────────┘        │   │
│  │           │                   │                   │                  │   │
│  │           └───────────────────┼───────────────────┘                  │   │
│  │                               │                                      │   │
│  │                    ┌──────────▼──────────┐                           │   │
│  │                    │  TransactionManager │                           │   │
│  │                    │  (ACID compliance)  │                           │   │
│  │                    └──────────┬──────────┘                           │   │
│  │                               │                                      │   │
│  │                    ┌──────────▼──────────┐                           │   │
│  │                    │   ConnectionPool    │                           │   │
│  │                    │   (5-20 connections)│                           │   │
│  │                    └──────────┬──────────┘                           │   │
│  │                               │                                      │   │
│  │                    ┌──────────▼──────────┐                           │   │
│  │                    │  FailoverHandler    │                           │   │
│  │                    │  (No in-memory FB)  │                           │   │
│  │                    └─────────────────────┘                           │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                             ┌──────────────┐
                             │  PostgreSQL  │
                             └──────────────┘
```

### Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Database Schema                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────┐       ┌─────────────────────┐                      │
│  │     incidents       │       │   simulation_runs   │                      │
│  ├─────────────────────┤       ├─────────────────────┤                      │
│  │ id (PK)             │       │ id (PK)             │                      │
│  │ incident_id (UQ)    │◄──────│ incident_id (FK)    │                      │
│  │ tenant_id (IDX)     │       │ tenant_id (IDX)     │                      │
│  │ case_id             │       │ run_id (UQ)         │                      │
│  │ status              │       │ scenario_id         │                      │
│  │ created_at          │       │ seed                │                      │
│  │ updated_at          │       │ verdict (JSONB)     │                      │
│  │ deleted_at          │       │ drift_score         │                      │
│  └─────────────────────┘       │ status              │                      │
│           │                    │ created_at          │                      │
│           │                    │ completed_at        │                      │
│           │                    └─────────────────────┘                      │
│           │                                                                  │
│           │                    ┌─────────────────────┐                      │
│           │                    │     snapshots       │                      │
│           │                    ├─────────────────────┤                      │
│           └───────────────────►│ id (PK)             │                      │
│                                │ snapshot_id (UQ)    │                      │
│                                │ incident_id (FK)    │                      │
│                                │ tenant_id (IDX)     │                      │
│                                │ calc_result (JSONB) │                      │
│                                │ is_baseline         │                      │
│                                │ legal_hold          │                      │
│                                │ legal_hold_reason   │                      │
│                                │ created_at          │                      │
│                                └─────────────────────┘                      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### ISimulationRunRepository Interface

```typescript
/**
 * Simulation run repository interface - same as current in-memory implementation
 * Both PostgreSQL and in-memory adapters implement this interface
 */
interface ISimulationRunRepository {
  // Create/Update
  save(run: SimulationRun): Promise<SimulationRun>;
  updateStatus(runId: string, status: RunStatus, finishedAt?: string): Promise<void>;
  
  // Snapshot links (Truth Layer Contract)
  setCurrentSnapshot(runId: string, snapshotId: string): Promise<void>;
  setBaselineSnapshot(runId: string, snapshotId: string): Promise<void>;
  
  // Query
  findById(runId: string): Promise<SimulationRun | null>;
  findByIncidentId(
    incidentId: string,
    options?: { limit?: number; cursor?: string },
  ): Promise<{ runs: SimulationRun[]; nextCursor?: string }>;
  findLatestByIncidentId(incidentId: string): Promise<SimulationRun | null>;
  
  // Count
  countByIncidentId(incidentId: string): Promise<number>;
  countByTenantId(tenantId: string, date?: string): Promise<number>;
}

interface SimulationRun {
  runId: string;
  incidentId: string;
  tenantId: string;
  scenarioId: string;
  seed: number;
  simulationVersion: string;
  engineVersion?: string | undefined;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  startedAt: string;
  finishedAt?: string | undefined;
  errorCode?: string | undefined;
  errorMessage?: string | undefined;
  // Snapshot links (Truth Layer Contract)
  currentSnapshotId?: string | undefined;
  baselineSnapshotId?: string | undefined;
}
```

### IIncidentRepository Interface

```typescript
/**
 * Incident repository interface
 */
interface IIncidentRepository {
  // Create/Update
  save(incident: Incident): Promise<Incident>;
  updateStatus(incidentId: string, status: IncidentStatus): Promise<void>;
  softDelete(incidentId: string): Promise<void>;
  
  // Query
  findById(incidentId: string): Promise<Incident | null>;
  findByTenantId(
    tenantId: string,
    options?: { includeDeleted?: boolean },
  ): Promise<Incident[]>;
  
  // Validation
  exists(incidentId: string): Promise<boolean>;
}

interface Incident {
  incidentId: string;
  tenantId: string;
  caseId: string;
  status: 'OPEN' | 'CLOSED' | 'ARCHIVED';
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | undefined;
}
```

### ISnapshotRepository Interface

```typescript
/**
 * Snapshot repository interface
 * NOTE: Snapshots are INSERT-ONLY. No update except for upgrade-only fields.
 */
interface ISnapshotRepository {
  // Create (insert-only, no update)
  insert(snapshot: Snapshot): Promise<Snapshot>;
  
  // Upgrade-only mutations (Truth Layer Contract)
  setBaseline(snapshotId: string, incidentId: string): Promise<void>;
  setLegalHold(snapshotId: string, reason?: string): Promise<void>;
  setRetentionPolicy(snapshotId: string, policy: RetentionPolicy): Promise<void>;
  
  // Query
  findById(snapshotId: string): Promise<Snapshot | null>;
  findByIncidentId(incidentId: string): Promise<Snapshot[]>;
  findBaseline(incidentId: string): Promise<Snapshot | null>;
  findWithLegalHold(tenantId?: string): Promise<Snapshot[]>;
  findByRunId(runId: string): Promise<Snapshot[]>;
  
  // Stats
  getLegalHoldStats(tenantId?: string): Promise<LegalHoldStats>;
}

interface Snapshot {
  snapshotId: string;
  incidentId: string;
  tenantId: string;
  runId?: string | undefined;
  snapshotKind: 'BASELINE' | 'CURRENT' | 'INTERMEDIATE';
  verdict: EvidenceVerdict;
  driftScore: number;
  calcResult: CalcResult; // JSONB - raw result
  calcResultNorm: CalcResult; // JSONB - normalized for hash
  calcHash: string; // SHA256(canonicalStringify(calcResultNorm))
  isBaseline: boolean;
  legalHold: boolean;
  legalHoldReason?: string | undefined;
  retentionPolicy: 'STANDARD' | 'PROMOTED' | 'LEGAL_HOLD';
  createdAt: string;
  expiresAt?: string | undefined;
}

interface LegalHoldStats {
  totalCount: number;
  byIncidentCount: Record<string, number>;
  oldestHoldAt: string | null;
  averageAgeDays: number;
}
```

### TransactionManager Interface

```typescript
/**
 * Transaction manager for ACID compliance
 */
interface ITransactionManager {
  // Execute within transaction
  executeInTransaction<T>(
    operation: (tx: TransactionContext) => Promise<T>,
  ): Promise<T>;
  
  // Savepoint support
  createSavepoint(tx: TransactionContext, name: string): Promise<void>;
  rollbackToSavepoint(tx: TransactionContext, name: string): Promise<void>;
}

interface TransactionContext {
  // Repositories bound to this transaction
  simulationRuns: ISimulationRunRepository;
  incidents: IIncidentRepository;
  snapshots: ISnapshotRepository;
}
```

### PostgreSQL Repository Implementation

```typescript
@Injectable()
class PostgresSimulationRunRepository implements ISimulationRunRepository {
  constructor(
    private readonly pool: Pool,
    private readonly clock: IClock,
    private readonly metrics: IMetricsEmitter,
  ) {}

  async save(run: SimulationRun): Promise<SimulationRun> {
    const start = this.clock.nowMs();
    
    try {
      const result = await this.pool.query(
        `INSERT INTO simulation_runs 
         (run_id, incident_id, tenant_id, scenario_id, seed, verdict, drift_score, status, created_at, completed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (run_id) DO UPDATE SET
           status = EXCLUDED.status,
           completed_at = EXCLUDED.completed_at
         RETURNING *`,
        [
          run.runId,
          run.incidentId,
          run.tenantId,
          run.scenarioId,
          run.seed,
          JSON.stringify(run.verdict),
          run.driftScore,
          run.status,
          run.createdAt,
          run.completedAt,
        ],
      );
      
      this.metrics.histogram('postgres.operation.latency', this.clock.nowMs() - start, {
        operation: 'save',
        table: 'simulation_runs',
      });
      
      return this.mapRow(result.rows[0]);
    } catch (error) {
      this.metrics.counter('postgres.operation.error', 1, {
        operation: 'save',
        table: 'simulation_runs',
      });
      throw error;
    }
  }

  async findByIncidentId(
    incidentId: string,
    options?: { limit?: number; cursor?: string },
  ): Promise<{ runs: SimulationRun[]; nextCursor?: string }> {
    const limit = options?.limit ?? 20;
    const cursor = options?.cursor;
    
    let query = `
      SELECT * FROM simulation_runs
      WHERE incident_id = $1
    `;
    const params: any[] = [incidentId];
    
    if (cursor) {
      query += ` AND created_at < $2`;
      params.push(cursor);
    }
    
    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit + 1); // Fetch one extra to determine hasMore
    
    const result = await this.pool.query(query, params);
    const runs = result.rows.slice(0, limit).map(this.mapRow);
    const hasMore = result.rows.length > limit;
    
    return {
      runs,
      nextCursor: hasMore ? runs[runs.length - 1].createdAt : undefined,
    };
  }

  async findLatestByIncidentId(incidentId: string): Promise<SimulationRun | null> {
    const result = await this.pool.query(
      `SELECT * FROM simulation_runs
       WHERE incident_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [incidentId],
    );
    
    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
  }

  private mapRow(row: any): SimulationRun {
    return {
      runId: row.run_id,
      incidentId: row.incident_id,
      tenantId: row.tenant_id,
      scenarioId: row.scenario_id,
      seed: row.seed,
      verdict: row.verdict,
      driftScore: parseFloat(row.drift_score),
      status: row.status,
      createdAt: row.created_at.toISOString(),
      completedAt: row.completed_at?.toISOString(),
    };
  }
}
```

### ConnectionPool Configuration

```typescript
interface PostgresPoolConfig {
  minConnections: number;      // Default: 5
  maxConnections: number;      // Default: 20
  idleTimeoutMs: number;       // Default: 60_000
  connectionTimeoutMs: number; // Default: 5_000
  statementTimeoutMs: number;  // Default: 30_000
}

const defaultPoolConfig: PostgresPoolConfig = {
  minConnections: 5,
  maxConnections: 20,
  idleTimeoutMs: 60_000,
  connectionTimeoutMs: 5_000,
  statementTimeoutMs: 30_000,
};
```

### FailoverHandler (No In-Memory Fallback)

```typescript
/**
 * PostgreSQL failover handler - NO in-memory fallback for truth layer
 * Data integrity is paramount - we fail clearly rather than silently
 */
@Injectable()
class PostgresFailoverHandler {
  private consecutiveFailures = 0;
  private readonly MAX_FAILURES_BEFORE_ALERT = 5;
  private readonly RECONNECT_INTERVAL_MS = 10_000;

  constructor(
    private readonly pool: Pool,
    private readonly clock: IClock,
    private readonly metrics: IMetricsEmitter,
    private readonly alertService: IAlertService,
    private readonly logger: Logger,
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      return this.onFailure(error);
    }
  }

  private onSuccess(): void {
    if (this.consecutiveFailures > 0) {
      this.logger.log('[PostgreSQL] Connection restored');
      this.metrics.counter('postgres.failover.recovered', 1);
    }
    this.consecutiveFailures = 0;
  }

  private onFailure(error: Error): never {
    this.consecutiveFailures++;
    this.metrics.counter('postgres.connection.failure', 1);
    this.logger.error('[PostgreSQL] Operation failed', { error: error.message });

    if (this.consecutiveFailures >= this.MAX_FAILURES_BEFORE_ALERT) {
      this.alertService.critical('PostgreSQL connection failure', {
        consecutiveFailures: this.consecutiveFailures,
        error: error.message,
      });
    }

    // NO FALLBACK - throw clear error
    throw new DatabaseUnavailableError(
      'PostgreSQL is unavailable. Data integrity requires persistent storage.',
      { cause: error },
    );
  }
}
```

## Data Models

### Implementation Note: Prisma ORM

Phase 9B uses **Prisma ORM** (already in use by the project) instead of raw SQL migrations.

**Key files:**
- `apps/api/prisma/schema.prisma` - Prisma schema with SimulationRun and SimulationSnapshot models
- `apps/api/prisma/migrations/20260118000000_phase_9b_truth_layer/migration.sql` - Generated migration with partial unique index

**Why Prisma:**
- Project already uses Prisma for all DB operations
- Type-safe queries with `@prisma/client`
- No need for additional `pg` package
- Consistent with existing codebase patterns

**Partial Unique Index (raw SQL):**
Prisma cannot express partial unique indexes in schema. The migration SQL includes:
```sql
CREATE UNIQUE INDEX "ux_sim_snap_one_baseline_per_incident" 
    ON "simulation_snapshots"("tenant_id", "incident_id") 
    WHERE "is_baseline" = true;
```

### Database Schema (SQL) - Truth Layer Contract Compliant

```sql
-- Migration: 001_create_truth_layer_tables.sql
-- Phase 9B - Truth Layer Contract v1.0.0

-- ============================================================================
-- INCIDENTS TABLE (existing, referenced by runs and snapshots)
-- ============================================================================

CREATE TABLE IF NOT EXISTS incidents (
  id SERIAL PRIMARY KEY,
  incident_id TEXT NOT NULL UNIQUE,
  tenant_id TEXT NOT NULL,
  case_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  severity TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  run_count INTEGER NOT NULL DEFAULT 0,
  baseline_snapshot_id TEXT,  -- Denormalized for quick access
  baseline_set_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  
  CONSTRAINT incidents_status_check CHECK (status IN ('OPEN', 'CLOSED', 'ARCHIVED')),
  CONSTRAINT incidents_severity_check CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'))
);

CREATE INDEX idx_incidents_tenant_id ON incidents(tenant_id);
CREATE INDEX idx_incidents_status ON incidents(status) WHERE deleted_at IS NULL;

-- ============================================================================
-- SIMULATION_RUNS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS simulation_runs (
  -- Primary key (deterministic)
  run_id TEXT PRIMARY KEY,
  
  -- Foreign keys
  incident_id TEXT NOT NULL REFERENCES incidents(incident_id),
  
  -- Immutable fields (set on insert, never change)
  tenant_id TEXT NOT NULL,
  scenario_id TEXT NOT NULL,
  seed INTEGER NOT NULL,
  simulation_version TEXT NOT NULL,
  engine_version TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Mutable fields (can be updated)
  status TEXT NOT NULL DEFAULT 'PENDING',
  finished_at TIMESTAMPTZ,
  error_code TEXT,
  error_message TEXT,
  
  -- Snapshot links (mutable once: NULL → value, never value → different value)
  current_snapshot_id TEXT,
  baseline_snapshot_id TEXT,
  
  -- Constraints
  CONSTRAINT simulation_runs_status_check 
    CHECK (status IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED'))
);

-- Indexes
CREATE INDEX idx_simulation_runs_incident_id ON simulation_runs(incident_id);
CREATE INDEX idx_simulation_runs_tenant_id ON simulation_runs(tenant_id);
CREATE INDEX idx_simulation_runs_started_at ON simulation_runs(incident_id, started_at DESC);
CREATE INDEX idx_simulation_runs_status ON simulation_runs(status) WHERE status = 'RUNNING';

-- ============================================================================
-- SIMULATION_SNAPSHOTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS simulation_snapshots (
  -- Primary key (deterministic or UUID)
  snapshot_id TEXT PRIMARY KEY,
  
  -- Foreign keys
  incident_id TEXT NOT NULL REFERENCES incidents(incident_id),
  run_id TEXT REFERENCES simulation_runs(run_id),
  
  -- Immutable fields (set on insert, never change)
  tenant_id TEXT NOT NULL,
  snapshot_kind TEXT NOT NULL,
  verdict TEXT NOT NULL,
  drift_score DECIMAL(10, 6) NOT NULL,
  calc_result JSONB NOT NULL,
  calc_result_norm JSONB NOT NULL,
  calc_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Mutable fields (upgrade-only)
  is_baseline BOOLEAN NOT NULL DEFAULT FALSE,
  legal_hold BOOLEAN NOT NULL DEFAULT FALSE,
  legal_hold_reason TEXT,
  retention_policy TEXT NOT NULL DEFAULT 'STANDARD',
  expires_at TIMESTAMPTZ,
  
  -- Constraints
  CONSTRAINT simulation_snapshots_kind_check 
    CHECK (snapshot_kind IN ('BASELINE', 'CURRENT', 'INTERMEDIATE')),
  CONSTRAINT simulation_snapshots_verdict_check 
    CHECK (verdict IN ('PROCEED', 'BLOCK_DRIFT', 'BLOCK_EVIDENCE', 'BLOCK_POLICY')),
  CONSTRAINT simulation_snapshots_retention_check 
    CHECK (retention_policy IN ('STANDARD', 'PROMOTED', 'LEGAL_HOLD'))
);

-- Indexes
CREATE INDEX idx_snapshots_incident_id ON simulation_snapshots(incident_id);
CREATE INDEX idx_snapshots_tenant_id ON simulation_snapshots(tenant_id);
CREATE INDEX idx_snapshots_run_id ON simulation_snapshots(run_id) WHERE run_id IS NOT NULL;
CREATE INDEX idx_snapshots_legal_hold ON simulation_snapshots(tenant_id) WHERE legal_hold = TRUE;
CREATE INDEX idx_snapshots_expires_at ON simulation_snapshots(expires_at) WHERE expires_at IS NOT NULL;

-- CRITICAL: Single baseline per incident (partial unique index)
CREATE UNIQUE INDEX idx_snapshots_single_baseline 
  ON simulation_snapshots(incident_id) 
  WHERE is_baseline = TRUE;

-- ============================================================================
-- ADD FOREIGN KEYS FOR RUN → SNAPSHOT LINKS
-- ============================================================================

ALTER TABLE simulation_runs 
  ADD CONSTRAINT fk_runs_current_snapshot 
  FOREIGN KEY (current_snapshot_id) 
  REFERENCES simulation_snapshots(snapshot_id);

ALTER TABLE simulation_runs 
  ADD CONSTRAINT fk_runs_baseline_snapshot 
  FOREIGN KEY (baseline_snapshot_id) 
  REFERENCES simulation_snapshots(snapshot_id);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-update updated_at on incidents
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$$ LANGUAGE plpgsql;

CREATE TRIGGER update_incidents_updated_at
  BEFORE UPDATE ON incidents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

### Rollback Script

```sql
-- Rollback: 001_create_truth_layer_tables.sql

-- Drop foreign keys first
ALTER TABLE simulation_runs DROP CONSTRAINT IF EXISTS fk_runs_current_snapshot;
ALTER TABLE simulation_runs DROP CONSTRAINT IF EXISTS fk_runs_baseline_snapshot;

-- Drop triggers
DROP TRIGGER IF EXISTS update_incidents_updated_at ON incidents;
DROP FUNCTION IF EXISTS update_updated_at_column();

-- Drop tables in dependency order
DROP TABLE IF EXISTS simulation_snapshots;
DROP TABLE IF EXISTS simulation_runs;
DROP TABLE IF EXISTS incidents;
```

### Metrics Schema
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_incidents_updated_at
  BEFORE UPDATE ON incidents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

### Metrics Schema

```typescript
interface PostgresMetrics {
  // Latency histogram (ms)
  'postgres.operation.latency': {
    operation: string;
    table: string;
    status: 'success' | 'error';
  };
  
  // Error counter
  'postgres.operation.error': {
    operation: string;
    table: string;
    errorType: string;
  };
  
  // Connection pool gauge
  'postgres.pool.size': {
    state: 'active' | 'idle' | 'waiting';
  };
  
  // Failover counters
  'postgres.connection.failure': {};
  'postgres.failover.recovered': {};
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Simulation Run Persistence Round-Trip

*For any* simulation run saved to the repository, querying by runId shall return the exact same data (all fields match).

**Validates: Requirements 1.1**

### Property 2: Run List Ordering

*For any* incident with multiple simulation runs, listing runs shall return them ordered by createdAt descending (newest first).

**Validates: Requirements 1.2**

### Property 3: Latest Run Consistency

*For any* incident, the latest run returned shall have the maximum createdAt timestamp among all runs for that incident.

**Validates: Requirements 1.3**

### Property 4: Incident Tenant Isolation

*For any* tenant, querying incidents by tenantId shall return only incidents belonging to that tenant and no incidents from other tenants.

**Validates: Requirements 2.2**

### Property 5: Snapshot Legal Hold Filtering

*For any* set of snapshots with mixed legal hold status, querying with legalHold=true shall return only snapshots where legalHold is true.

**Validates: Requirements 3.2**

### Property 6: Single Baseline Per Incident

*For any* incident, at most one snapshot shall have isBaseline=true at any time.

**Validates: Requirements 3.4**

### Property 7: Transaction Atomicity

*For any* transaction containing multiple operations, either all operations succeed or none do (no partial state).

**Validates: Requirements 4.1, 4.2**

### Property 8: Test Compatibility

*For any* test in the existing simulation and snapshot test suites, the test shall pass when run against the PostgreSQL adapter.

**Validates: Requirements 8.3**

## Error Handling

### PostgreSQL Operation Errors

| Error Type | Detection | Response |
|------------|-----------|----------|
| Connection timeout | Socket timeout | Reject with clear error |
| Query timeout | Statement timeout | Reject with clear error |
| Connection refused | ECONNREFUSED | Reject with clear error |
| Auth failure | Auth error | Log error, fail startup |
| Constraint violation | 23xxx error | Return validation error |
| Deadlock | 40P01 error | Retry once, then fail |

### Error Response Strategy

```typescript
// Pseudo-code for error handling
async function handlePostgresError(error: Error): Promise<never> {
  if (isConnectionError(error)) {
    metrics.counter('postgres.connection.failure', 1);
    throw new DatabaseUnavailableError('PostgreSQL connection failed');
  }
  
  if (isConstraintViolation(error)) {
    throw new DataIntegrityError('Constraint violation', { cause: error });
  }
  
  if (isDeadlock(error)) {
    // Retry once
    throw new RetryableError('Deadlock detected', { cause: error });
  }
  
  // Unknown error - log and throw
  logger.error('Unknown PostgreSQL error', { error });
  throw new DatabaseError('Database operation failed', { cause: error });
}
```

## Testing Strategy

### Test Categories

1. **Unit Tests**: Repository methods with mock database
2. **Integration Tests**: Repository with real PostgreSQL (containerized)
3. **Transaction Tests**: ACID compliance verification
4. **Migration Tests**: Schema migration correctness
5. **Property Tests**: Universal properties across all inputs

### Dual Backend Test Pattern

```typescript
describe.each([
  ['in-memory', () => new InMemorySimulationRunRepository(mockClock)],
  ['postgres', () => new PostgresSimulationRunRepository(testPool, mockClock, mockMetrics)],
])('Simulation Run Repository (%s)', (name, createRepo) => {
  let repo: ISimulationRunRepository;

  beforeEach(async () => {
    repo = createRepo();
    if (name === 'postgres') {
      await testPool.query('TRUNCATE simulation_runs CASCADE');
    }
  });

  it('should save and retrieve run', async () => {
    const run = createTestRun();
    await repo.save(run);
    const retrieved = await repo.findById(run.runId);
    expect(retrieved).toEqual(run);
  });

  // ... more tests
});
```

### Test Environment

| Environment | PostgreSQL Backend |
|-------------|-------------------|
| Unit tests | pg-mem (in-memory) |
| Integration | Docker PostgreSQL |
| CI | Docker PostgreSQL |
| Staging | AWS RDS |
| Production | AWS RDS |

