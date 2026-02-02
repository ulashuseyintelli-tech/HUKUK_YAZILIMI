# Design Document: Phase 9C Task 2 - Evidence Bundle DB Migration

## Overview

This design establishes the PostgreSQL schema for Evidence Bundle state management with "legal-grade" guarantees. The schema enforces critical invariants at the database level, eliminating reliance on application-level guards for data integrity.

## Architecture

### Schema Design

```
┌─────────────────────────────────────────────────────────────────┐
│                      evidence_bundles                            │
├─────────────────────────────────────────────────────────────────┤
│ bundle_id      UUID PK DEFAULT gen_random_uuid()                │
│ tenant_id      VARCHAR(64) NOT NULL                             │
│ incident_id    VARCHAR(128) NOT NULL                            │
│ state          VARCHAR(16) NOT NULL DEFAULT 'OPEN'              │
│ sealed_hash    VARCHAR(128) NULL                                │
│ created_at     TIMESTAMPTZ NOT NULL DEFAULT now()               │
│ sealed_at      TIMESTAMPTZ NULL                                 │
├─────────────────────────────────────────────────────────────────┤
│ CHECK: state IN ('OPEN', 'SEALED')                              │
│ CHECK: (state='SEALED') = (sealed_hash IS NOT NULL)             │
│ CHECK: (state='SEALED') = (sealed_at IS NOT NULL)               │
│ PARTIAL UNIQUE: (tenant_id, incident_id) WHERE state='OPEN'     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ FK (bundle_id)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      evidence_objects                            │
├─────────────────────────────────────────────────────────────────┤
│ bundle_id      UUID NOT NULL REFERENCES evidence_bundles        │
│ object_key     VARCHAR(512) NOT NULL                            │
│ tenant_id      VARCHAR(64) NOT NULL (denormalized)              │
│ etag           VARCHAR(64) NOT NULL                             │
│ version_id     VARCHAR(128) NULL                                │
│ content_type   VARCHAR(128) NOT NULL                            │
│ size_bytes     BIGINT NOT NULL                                  │
│ created_at     TIMESTAMPTZ NOT NULL DEFAULT now()               │
├─────────────────────────────────────────────────────────────────┤
│ PRIMARY KEY: (bundle_id, object_key)                            │
│ TRIGGER: block_insert_on_sealed_bundle (BEFORE INSERT)          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ FK (bundle_id)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    bundle_seal_events                            │
├─────────────────────────────────────────────────────────────────┤
│ id             UUID PK DEFAULT gen_random_uuid()                │
│ bundle_id      UUID NOT NULL REFERENCES evidence_bundles        │
│ run_id         VARCHAR(128) NOT NULL                            │
│ hash           VARCHAR(128) NOT NULL                            │
│ object_count   INT NOT NULL                                     │
│ total_size_bytes BIGINT NOT NULL                                │
│ created_at     TIMESTAMPTZ NOT NULL DEFAULT now()               │
├─────────────────────────────────────────────────────────────────┤
│ UNIQUE: (bundle_id, run_id)                                     │
└─────────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

#### 1. Partial Unique Index for Single Open Bundle

PostgreSQL partial unique index ensures only one OPEN bundle per tenant+incident:

```sql
CREATE UNIQUE INDEX idx_one_open_bundle 
ON evidence_bundles (tenant_id, incident_id) 
WHERE state = 'OPEN';
```

**Rationale:** Prisma doesn't support partial unique indexes natively. Raw SQL migration required.

#### 2. State Invariant CHECK Constraints

```sql
CONSTRAINT chk_sealed_hash_invariant CHECK (
  (state = 'SEALED') = (sealed_hash IS NOT NULL)
),
CONSTRAINT chk_sealed_at_invariant CHECK (
  (state = 'SEALED') = (sealed_at IS NOT NULL)
)
```

**Rationale:** Application bugs cannot create inconsistent state. DB enforces "SEALED implies hash+timestamp".

#### 3. Composite Primary Key for Evidence Objects

```sql
PRIMARY KEY (bundle_id, object_key)
```

**Rationale:** 
- Object key is natural key (Task 1 keyspace hardening)
- Same key cannot exist twice in bundle
- No surrogate UUID overhead
- Efficient joins on bundle_id

#### 4. Denormalized tenant_id in Evidence Objects

**Rationale:**
- Join-free tenant filtering
- Future partitioning support
- Performance for tenant-scoped queries

#### 5. DB Trigger for Sealed Bundle Immutability

```sql
CREATE OR REPLACE FUNCTION fn_block_insert_on_sealed_bundle()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM evidence_bundles 
    WHERE bundle_id = NEW.bundle_id AND state = 'SEALED'
  ) THEN
    RAISE EXCEPTION 'Cannot insert object into sealed bundle'
      USING ERRCODE = 'P0001',
            HINT = 'SEALED_BUNDLE_VIOLATION';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_block_insert_on_sealed_bundle
BEFORE INSERT ON evidence_objects
FOR EACH ROW EXECUTE FUNCTION fn_block_insert_on_sealed_bundle();
```

**Rationale:** Application-level guard is not sufficient for legal-grade. DB trigger is the last line of defense.

### Dual Seal Mode Support

#### Background Worker (Batch)

```sql
SELECT bundle_id FROM evidence_bundles 
WHERE state = 'OPEN' AND ...ready_condition...
ORDER BY created_at ASC
FOR UPDATE SKIP LOCKED
LIMIT 1;
```

- Multiple workers can run in parallel
- Worker skips bundles locked by others
- Fire-and-forget semantics

#### API On-Demand

```sql
SELECT * FROM evidence_bundles 
WHERE bundle_id = $1
FOR UPDATE NOWAIT;
```

- Deterministic response required
- Lock failure → 423 Locked
- Already sealed → 409 Conflict

### Index Strategy

| Index | Purpose |
|-------|---------|
| `idx_bundles_tenant_incident` | Efficient bundle lookup by tenant+incident |
| `idx_one_open_bundle` (partial) | Enforce single open bundle constraint |
| `idx_objects_tenant_created` | Tenant-scoped object queries |
| `idx_seal_events_bundle_created` | Seal event history queries |

## Correctness Properties

### Property 1: Single Open Bundle Invariant

**Validates: Requirements 1.5**

For any (tenant_id, incident_id) pair, at most one bundle with state='OPEN' can exist.

```
∀ t, i: COUNT(bundles WHERE tenant_id=t AND incident_id=i AND state='OPEN') ≤ 1
```

### Property 2: Sealed State Consistency

**Validates: Requirements 1.3, 1.4**

A bundle's sealed_hash and sealed_at are both NULL or both NOT NULL, matching state.

```
∀ b: (b.state='SEALED') ⟺ (b.sealed_hash IS NOT NULL ∧ b.sealed_at IS NOT NULL)
```

### Property 3: Sealed Bundle Immutability

**Validates: Requirements 4.1, 4.2**

No evidence object can be inserted into a sealed bundle.

```
∀ b, o: (b.state='SEALED') → INSERT(o INTO b) FAILS
```

### Property 4: Seal Event Idempotency

**Validates: Requirements 3.2, 6.3**

Same (bundle_id, run_id) pair cannot create duplicate seal events.

```
∀ b, r: COUNT(seal_events WHERE bundle_id=b AND run_id=r) ≤ 1
```

## Migration Strategy

### Prisma Schema (Partial)

Prisma handles basic table structure. Raw SQL handles PostgreSQL-specific features.

```prisma
model EvidenceBundle {
  bundleId    String   @id @default(dbgenerated("gen_random_uuid()")) @map("bundle_id") @db.Uuid
  tenantId    String   @map("tenant_id") @db.VarChar(64)
  incidentId  String   @map("incident_id") @db.VarChar(128)
  state       String   @default("OPEN") @db.VarChar(16)
  sealedHash  String?  @map("sealed_hash") @db.VarChar(128)
  createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz
  sealedAt    DateTime? @map("sealed_at") @db.Timestamptz
  
  objects     EvidenceObject[]
  sealEvents  BundleSealEvent[]
  
  @@map("evidence_bundles")
}
```

### Raw SQL Migration

Required for:
1. CHECK constraints with complex logic
2. Partial unique index
3. Trigger function and trigger

## Error Codes

| Error | HTTP Status | Description |
|-------|-------------|-------------|
| `SEALED_BUNDLE_VIOLATION` | 409 Conflict | Attempt to insert object into sealed bundle |
| `DUPLICATE_OPEN_BUNDLE` | 409 Conflict | Attempt to create second open bundle |
| `DUPLICATE_SEAL_EVENT` | 409 Conflict | Attempt to create duplicate seal event |

## Dependencies

- PostgreSQL 14+ (for gen_random_uuid())
- Prisma 5.x
- Existing Phase 9C object storage infrastructure
