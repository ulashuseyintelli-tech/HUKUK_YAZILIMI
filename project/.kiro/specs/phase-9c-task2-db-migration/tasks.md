# Implementation Plan: Phase 9C Task 2 - Evidence Bundle DB Migration

## Overview

This task establishes the PostgreSQL schema foundation for Evidence Bundle state management. The migration creates three tables with legal-grade constraints, indexes, and a trigger for sealed bundle immutability.

## Tasks

- [ ] 1. Prisma Schema Definition
  - [ ] 1.1 Add EvidenceBundle model to schema.prisma
    - Define all columns with correct types
    - Add basic indexes
    - _Requirements: 1.1, 1.2_
  
  - [ ] 1.2 Add EvidenceObject model to schema.prisma
    - Define composite primary key (bundle_id, object_key)
    - Add FK relationship to EvidenceBundle
    - Add denormalized tenant_id
    - _Requirements: 2.1, 2.2, 2.3_
  
  - [ ] 1.3 Add BundleSealEvent model to schema.prisma
    - Define all columns including object_count, total_size_bytes
    - Add FK relationship to EvidenceBundle
    - _Requirements: 3.1, 3.3_

- [ ] 2. Raw SQL Migration - Constraints
  - [ ] 2.1 Create CHECK constraint for state values
    - `CHECK (state IN ('OPEN', 'SEALED'))`
    - _Requirements: 1.2_
  
  - [ ] 2.2 Create CHECK constraint for sealed_hash invariant
    - `CHECK ((state = 'SEALED') = (sealed_hash IS NOT NULL))`
    - _Requirements: 1.3, 1.4_
  
  - [ ] 2.3 Create CHECK constraint for sealed_at invariant
    - `CHECK ((state = 'SEALED') = (sealed_at IS NOT NULL))`
    - _Requirements: 1.3, 1.4_
  
  - [ ] 2.4 Create partial unique index for single open bundle
    - `CREATE UNIQUE INDEX idx_one_open_bundle ON evidence_bundles (tenant_id, incident_id) WHERE state = 'OPEN'`
    - _Requirements: 1.5_
  
  - [ ] 2.5 Create unique constraint for seal event idempotency
    - `UNIQUE (bundle_id, run_id)`
    - _Requirements: 3.2_

- [ ] 3. Raw SQL Migration - Trigger
  - [ ] 3.1 Create trigger function for sealed bundle protection
    - Function: `fn_block_insert_on_sealed_bundle()`
    - Raise exception with ERRCODE 'P0001' and HINT 'SEALED_BUNDLE_VIOLATION'
    - _Requirements: 4.1, 4.2_
  
  - [ ] 3.2 Create BEFORE INSERT trigger on evidence_objects
    - Trigger: `trg_block_insert_on_sealed_bundle`
    - Execute function for each row
    - _Requirements: 4.3_

- [ ] 4. Raw SQL Migration - Indexes
  - [ ] 4.1 Create index on evidence_bundles(tenant_id, incident_id)
    - _Requirements: 5.1_
  
  - [ ] 4.2 Create index on evidence_objects(tenant_id, created_at)
    - _Requirements: 5.2, 2.4_
  
  - [ ] 4.3 Create index on bundle_seal_events(bundle_id, created_at)
    - _Requirements: 5.3, 3.4_

- [ ] 5. Generate and Apply Migration
  - [ ] 5.1 Run `prisma migrate dev` to generate migration
  - [ ] 5.2 Add raw SQL to migration file
  - [ ] 5.3 Run migration against test database
  - [ ] 5.4 Verify migration is idempotent
    - _Requirements: 7.1_

- [ ] 6. DB-Level Tests
  - [ ] 6.1 Test: Single open bundle constraint
    - Create bundle for tenant+incident
    - Attempt to create second open bundle → FAIL
    - Seal first bundle
    - Create new open bundle → SUCCESS
    - **Validates: Requirements 1.5**
  
  - [ ] 6.2 Test: Sealed bundle immutability trigger
    - Create bundle, add object → SUCCESS
    - Seal bundle
    - Attempt to add object → FAIL with SEALED_BUNDLE_VIOLATION
    - **Validates: Requirements 4.1, 4.2**
  
  - [ ] 6.3 Test: Seal event idempotency
    - Create seal event with run_id
    - Attempt to create duplicate seal event with same run_id → FAIL
    - **Validates: Requirements 3.2**
  
  - [ ] 6.4 Test: State invariant CHECK constraints
    - Attempt to set state='SEALED' with sealed_hash=NULL → FAIL
    - Attempt to set state='OPEN' with sealed_hash='abc' → FAIL
    - **Validates: Requirements 1.3, 1.4**

- [ ] 7. Service-Level Tests
  - [ ] 7.1 Test: Worker SKIP LOCKED behavior
    - Start two parallel workers
    - One worker processes bundle, other gets NOOP
    - **Validates: Requirements 6.1**
  
  - [ ] 7.2 Test: API NOWAIT behavior
    - Start seal operation
    - Parallel request gets 423 Locked
    - **Validates: Requirements 6.2**
  
  - [ ] 7.3 Test: API conflict on already sealed
    - Seal bundle via API
    - Second seal request gets 409 Conflict
    - **Validates: Requirements 6.2**

- [ ] 8. Down Migration (Optional but Recommended)
  - [ ] 8.1 Create down migration script
    - Drop trigger
    - Drop trigger function
    - Drop indexes
    - Drop tables
    - _Requirements: 7.2_

## Raw SQL Reference

### Complete Migration SQL

```sql
-- CHECK constraints
ALTER TABLE evidence_bundles
ADD CONSTRAINT chk_state_values CHECK (state IN ('OPEN', 'SEALED'));

ALTER TABLE evidence_bundles
ADD CONSTRAINT chk_sealed_hash_invariant CHECK (
  (state = 'SEALED') = (sealed_hash IS NOT NULL)
);

ALTER TABLE evidence_bundles
ADD CONSTRAINT chk_sealed_at_invariant CHECK (
  (state = 'SEALED') = (sealed_at IS NOT NULL)
);

-- Partial unique index
CREATE UNIQUE INDEX idx_one_open_bundle 
ON evidence_bundles (tenant_id, incident_id) 
WHERE state = 'OPEN';

-- Performance indexes
CREATE INDEX idx_bundles_tenant_incident 
ON evidence_bundles (tenant_id, incident_id);

CREATE INDEX idx_objects_tenant_created 
ON evidence_objects (tenant_id, created_at);

CREATE INDEX idx_seal_events_bundle_created 
ON bundle_seal_events (bundle_id, created_at);

-- Trigger function
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

-- Trigger
CREATE TRIGGER trg_block_insert_on_sealed_bundle
BEFORE INSERT ON evidence_objects
FOR EACH ROW EXECUTE FUNCTION fn_block_insert_on_sealed_bundle();
```

### Down Migration SQL

```sql
DROP TRIGGER IF EXISTS trg_block_insert_on_sealed_bundle ON evidence_objects;
DROP FUNCTION IF EXISTS fn_block_insert_on_sealed_bundle();
DROP INDEX IF EXISTS idx_seal_events_bundle_created;
DROP INDEX IF EXISTS idx_objects_tenant_created;
DROP INDEX IF EXISTS idx_bundles_tenant_incident;
DROP INDEX IF EXISTS idx_one_open_bundle;
ALTER TABLE evidence_bundles DROP CONSTRAINT IF EXISTS chk_sealed_at_invariant;
ALTER TABLE evidence_bundles DROP CONSTRAINT IF EXISTS chk_sealed_hash_invariant;
ALTER TABLE evidence_bundles DROP CONSTRAINT IF EXISTS chk_state_values;
DROP TABLE IF EXISTS bundle_seal_events;
DROP TABLE IF EXISTS evidence_objects;
DROP TABLE IF EXISTS evidence_bundles;
```

## Notes

- Prisma generates base migration, raw SQL adds PostgreSQL-specific features
- All CHECK constraints use boolean equivalence for clarity
- Trigger uses ERRCODE 'P0001' (raise_exception) with custom HINT for error mapping
- Partial unique index is the key to single-open-bundle guarantee
- Down migration is optional but recommended for rollback capability

## Next Step: Task 2.5 (BundleSealJob)

After this migration is complete:
1. Seal transaction writes to both `bundle_seal_events` and updates `evidence_bundles`
2. Object list snapshot uses deterministic ordering
3. Hash computed from sorted object keys
4. Idempotency guaranteed by (bundle_id, run_id) unique constraint
