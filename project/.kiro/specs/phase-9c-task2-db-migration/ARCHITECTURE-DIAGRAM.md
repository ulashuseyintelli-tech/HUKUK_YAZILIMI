# Phase 9C Task 2 - Evidence Bundle DB Architecture

## Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           EVIDENCE BUNDLE SYSTEM                                 │
│                        (Legal-Grade Audit Trail)                                │
└─────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────┐
│                              evidence_bundles                                    │
├─────────────────────────────────────────────────────────────────────────────────┤
│ PK  bundle_id      UUID         DEFAULT gen_random_uuid()                       │
│     tenant_id      VARCHAR(64)  NOT NULL                                        │
│     incident_id    VARCHAR(128) NOT NULL                                        │
│     state          VARCHAR(16)  NOT NULL DEFAULT 'OPEN'  CHECK(OPEN|SEALED)     │
│     sealed_hash    VARCHAR(128) NULL     (SHA-256 at seal time)                 │
│     created_at     TIMESTAMPTZ  NOT NULL DEFAULT now()                          │
│     sealed_at      TIMESTAMPTZ  NULL                                            │
├─────────────────────────────────────────────────────────────────────────────────┤
│ CONSTRAINTS:                                                                     │
│   • state_chk: state IN ('OPEN', 'SEALED')                                      │
│   • seal_invariant_chk: (OPEN ↔ hash=NULL, at=NULL) OR (SEALED ↔ both NOT NULL) │
├─────────────────────────────────────────────────────────────────────────────────┤
│ INDEXES:                                                                         │
│   • idx_evidence_bundles_one_open: UNIQUE(tenant_id, incident_id) WHERE OPEN    │
│   • idx_evidence_bundles_tenant_incident: (tenant_id, incident_id)              │
│   • idx_evidence_bundles_state: (state)                                         │
└─────────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ 1:N
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              evidence_objects                                    │
├─────────────────────────────────────────────────────────────────────────────────┤
│ PK  (bundle_id, object_key)  COMPOSITE                                          │
│ FK  bundle_id      UUID         NOT NULL → evidence_bundles(bundle_id) CASCADE  │
│     object_key     VARCHAR(512) NOT NULL  (S3 key)                              │
│     tenant_id      VARCHAR(64)  NOT NULL  (denormalized, trigger-validated)     │
│     etag           VARCHAR(64)  NOT NULL  (S3 ETag for integrity)               │
│     version_id     VARCHAR(128) NULL      (S3 version if versioning enabled)    │
│     content_type   VARCHAR(128) NOT NULL                                        │
│     size_bytes     BIGINT       NOT NULL  CHECK(>= 0)                           │
│     created_at     TIMESTAMPTZ  NOT NULL DEFAULT now()                          │
├─────────────────────────────────────────────────────────────────────────────────┤
│ TRIGGER: evidence_object_insert_guard (BEFORE INSERT)                           │
│   1. Bundle must exist (ERRCODE 23503: bundle_not_found)                        │
│   2. Bundle must be OPEN (ERRCODE 45000: sealed_bundle_write_forbidden)         │
│   3. tenant_id must match bundle (ERRCODE 45001: tenant_mismatch)               │
├─────────────────────────────────────────────────────────────────────────────────┤
│ INDEXES:                                                                         │
│   • idx_evidence_objects_tenant_created: (tenant_id, created_at)                │
│   • idx_evidence_objects_bundle: (bundle_id)                                    │
└─────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────┐
│                              evidence_bundles                                    │
└─────────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ 1:N
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                            bundle_seal_events                                    │
├─────────────────────────────────────────────────────────────────────────────────┤
│ PK  id               UUID         DEFAULT gen_random_uuid()                     │
│ FK  bundle_id        UUID         NOT NULL → evidence_bundles(bundle_id) CASCADE│
│     run_id           VARCHAR(128) NOT NULL  (job/process identifier)            │
│     hash             VARCHAR(128) NOT NULL  (SHA-256 of bundle at seal)         │
│     object_count     INT          NOT NULL  CHECK(>= 0)                         │
│     total_size_bytes BIGINT       NOT NULL  CHECK(>= 0)                         │
│     created_at       TIMESTAMPTZ  NOT NULL DEFAULT now()                        │
├─────────────────────────────────────────────────────────────────────────────────┤
│ CONSTRAINTS:                                                                     │
│   • bundle_seal_events_idempotency_uniq: UNIQUE(bundle_id, run_id)              │
├─────────────────────────────────────────────────────────────────────────────────┤
│ TRIGGER: bundle_seal_event_guard (BEFORE INSERT)                                │
│   1. Bundle must exist (ERRCODE 23503: bundle_not_found)                        │
│   2. Bundle must be SEALED (ERRCODE 45002: seal_event_requires_sealed_bundle)   │
├─────────────────────────────────────────────────────────────────────────────────┤
│ INDEXES:                                                                         │
│   • idx_bundle_seal_events_bundle_created: (bundle_id, created_at)              │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## State Machine

```
                    ┌──────────────────────────────────────┐
                    │           BUNDLE LIFECYCLE           │
                    └──────────────────────────────────────┘

    ┌─────────┐                                      ┌─────────┐
    │  OPEN   │ ─────────── seal() ─────────────────▶│ SEALED  │
    │         │                                      │         │
    │ • Accept│                                      │ • No new│
    │   new   │                                      │   objects│
    │   objects                                      │ • Hash  │
    │         │                                      │   locked│
    └─────────┘                                      └─────────┘
         │                                                │
         │ INSERT object                                  │ INSERT object
         ▼                                                ▼
    ┌─────────┐                                      ┌─────────┐
    │   OK    │                                      │  ERROR  │
    │         │                                      │ 45000   │
    └─────────┘                                      └─────────┘
```

## Error Code Reference

| ERRCODE | Exception Name | HTTP Status | Application Error |
|---------|----------------|-------------|-------------------|
| 45000 | sealed_bundle_write_forbidden | 409 | WriteOnceViolation |
| 45001 | tenant_mismatch | 403 | TenantMismatchError |
| 45002 | seal_event_requires_sealed_bundle | 409 | InvalidStateTransition |
| 23503 | bundle_not_found (FK semantics) | 404 | BundleNotFoundError |

## Key Invariants

1. **One OPEN Bundle Per Incident**: Partial unique index ensures only one OPEN bundle exists per (tenant_id, incident_id) combination.

2. **Write-Once Semantics**: SEALED bundles cannot accept new objects. Trigger enforces this at DB level.

3. **Tenant Isolation**: Cross-table tenant_id validation via trigger prevents data leakage.

4. **Seal Event Ordering**: seal_events can only be created for SEALED bundles, ensuring audit trail integrity.

5. **Idempotent Sealing**: (bundle_id, run_id) unique constraint prevents duplicate seal events from same job.

## Typical Flow

```
1. CREATE bundle (state=OPEN)
   └─▶ INSERT INTO evidence_bundles (tenant_id, incident_id)

2. ADD objects (while OPEN)
   └─▶ INSERT INTO evidence_objects (bundle_id, object_key, ...)
       └─▶ Trigger validates: bundle exists, is OPEN, tenant matches

3. SEAL bundle (atomic)
   └─▶ BEGIN
       │   UPDATE evidence_bundles SET state='SEALED', sealed_hash=..., sealed_at=now()
       │   INSERT INTO bundle_seal_events (bundle_id, run_id, hash, ...)
       └─▶ COMMIT

4. VERIFY (any time)
   └─▶ SELECT * FROM bundle_seal_events WHERE bundle_id = ?
       └─▶ Compare hash with recalculated hash from objects
```

## Test Scenarios

### Partial Unique Index Test
```sql
-- First OPEN bundle: OK
INSERT INTO evidence_bundles (tenant_id, incident_id) VALUES ('t1', 'inc1');

-- Second OPEN bundle for same tenant+incident: FAIL (unique violation)
INSERT INTO evidence_bundles (tenant_id, incident_id) VALUES ('t1', 'inc1');
-- ERROR: duplicate key value violates unique constraint "idx_evidence_bundles_one_open"
```

### Sealed Bundle Write Test
```sql
-- Create and seal bundle
INSERT INTO evidence_bundles (bundle_id, tenant_id, incident_id) 
VALUES ('uuid-1', 't1', 'inc1');

UPDATE evidence_bundles 
SET state='SEALED', sealed_hash='abc123', sealed_at=now() 
WHERE bundle_id='uuid-1';

-- Try to add object to sealed bundle: FAIL
INSERT INTO evidence_objects (bundle_id, object_key, tenant_id, etag, content_type, size_bytes)
VALUES ('uuid-1', 'key1', 't1', 'etag1', 'application/json', 100);
-- ERROR: sealed_bundle_write_forbidden: uuid-1 (ERRCODE 45000)
```

### Tenant Mismatch Test
```sql
-- Create bundle for tenant t1
INSERT INTO evidence_bundles (bundle_id, tenant_id, incident_id) 
VALUES ('uuid-2', 't1', 'inc2');

-- Try to add object with different tenant: FAIL
INSERT INTO evidence_objects (bundle_id, object_key, tenant_id, etag, content_type, size_bytes)
VALUES ('uuid-2', 'key1', 't2', 'etag1', 'application/json', 100);
-- ERROR: tenant_mismatch: object tenant_id (t2) does not match bundle tenant_id (t1) (ERRCODE 45001)
```
