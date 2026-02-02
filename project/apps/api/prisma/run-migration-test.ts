/**
 * Phase 9C Task 2 - Migration Test Script
 * 
 * Bu script:
 * 1. Tabloları ve constraint'leri oluşturur
 * 2. Trigger'ları oluşturur
 * 3. Testleri çalıştırır
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function createTables() {
  console.log('1. Creating tables and constraints...');

  // Extension
  await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);

  // evidence_bundles table
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS evidence_bundles (
      bundle_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id   VARCHAR(64)  NOT NULL,
      incident_id VARCHAR(128) NOT NULL,
      state       VARCHAR(16)  NOT NULL DEFAULT 'OPEN',
      sealed_hash VARCHAR(128) NULL,
      created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
      sealed_at   TIMESTAMPTZ  NULL
    )
  `);

  // Add constraints if not exist
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE evidence_bundles 
      ADD CONSTRAINT evidence_bundles_state_chk CHECK (state IN ('OPEN','SEALED'))
    `);
  } catch (e: any) {
    if (!e.message?.includes('already exists')) throw e;
  }

  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE evidence_bundles 
      ADD CONSTRAINT evidence_bundles_seal_invariant_chk CHECK (
        (state = 'OPEN' AND sealed_hash IS NULL AND sealed_at IS NULL)
        OR
        (state = 'SEALED' AND sealed_hash IS NOT NULL AND sealed_at IS NOT NULL)
      )
    `);
  } catch (e: any) {
    if (!e.message?.includes('already exists')) throw e;
  }

  // evidence_objects table
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS evidence_objects (
      bundle_id     UUID         NOT NULL,
      object_key    VARCHAR(512) NOT NULL,
      tenant_id     VARCHAR(64)  NOT NULL,
      etag          VARCHAR(64)  NOT NULL,
      version_id    VARCHAR(128) NULL,
      content_type  VARCHAR(128) NOT NULL,
      size_bytes    BIGINT       NOT NULL,
      created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
      CONSTRAINT evidence_objects_pk PRIMARY KEY (bundle_id, object_key),
      CONSTRAINT evidence_objects_bundle_fk FOREIGN KEY (bundle_id) 
        REFERENCES evidence_bundles(bundle_id) ON DELETE CASCADE,
      CONSTRAINT evidence_objects_size_chk CHECK (size_bytes >= 0)
    )
  `);

  // bundle_seal_events table
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS bundle_seal_events (
      id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
      bundle_id         UUID         NOT NULL,
      run_id            VARCHAR(128) NOT NULL,
      hash              VARCHAR(128) NOT NULL,
      object_count      INT          NOT NULL,
      total_size_bytes  BIGINT       NOT NULL,
      created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
      CONSTRAINT bundle_seal_events_bundle_fk FOREIGN KEY (bundle_id) 
        REFERENCES evidence_bundles(bundle_id) ON DELETE CASCADE,
      CONSTRAINT bundle_seal_events_object_count_chk CHECK (object_count >= 0),
      CONSTRAINT bundle_seal_events_total_size_chk CHECK (total_size_bytes >= 0)
    )
  `);

  // Idempotency constraint
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE bundle_seal_events 
      ADD CONSTRAINT bundle_seal_events_idempotency_uniq UNIQUE (bundle_id, run_id)
    `);
  } catch (e: any) {
    if (!e.message?.includes('already exists')) throw e;
  }

  console.log('   ✅ Tables created\n');
}

async function createIndexes() {
  console.log('2. Creating indexes...');

  // Partial unique index
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_evidence_bundles_one_open 
    ON evidence_bundles (tenant_id, incident_id) WHERE state = 'OPEN'
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_evidence_bundles_tenant_incident 
    ON evidence_bundles (tenant_id, incident_id)
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_evidence_bundles_state 
    ON evidence_bundles (state)
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_evidence_objects_tenant_created 
    ON evidence_objects (tenant_id, created_at)
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_evidence_objects_bundle 
    ON evidence_objects (bundle_id)
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_bundle_seal_events_bundle_created 
    ON bundle_seal_events (bundle_id, created_at)
  `);

  console.log('   ✅ Indexes created\n');
}

async function createTriggers() {
  console.log('3. Creating triggers...');

  // Trigger function for evidence_objects INSERT guard
  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION trg_evidence_object_insert_guard()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $func$
    DECLARE
      v_state VARCHAR(16);
      v_tenant_id VARCHAR(64);
    BEGIN
      SELECT state, tenant_id INTO v_state, v_tenant_id
      FROM evidence_bundles
      WHERE bundle_id = NEW.bundle_id;

      IF v_state IS NULL THEN
        RAISE EXCEPTION 'bundle_not_found: %', NEW.bundle_id USING ERRCODE = '23503';
      END IF;

      IF v_state = 'SEALED' THEN
        RAISE EXCEPTION 'sealed_bundle_write_forbidden: %', NEW.bundle_id USING ERRCODE = '45000';
      END IF;

      IF v_tenant_id != NEW.tenant_id THEN
        RAISE EXCEPTION 'tenant_mismatch: object tenant_id (%) does not match bundle tenant_id (%)', 
          NEW.tenant_id, v_tenant_id USING ERRCODE = '45001';
      END IF;

      RETURN NEW;
    END;
    $func$
  `);

  await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS evidence_object_insert_guard ON evidence_objects`);
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER evidence_object_insert_guard
    BEFORE INSERT ON evidence_objects
    FOR EACH ROW EXECUTE FUNCTION trg_evidence_object_insert_guard()
  `);

  // Trigger function for bundle_seal_events INSERT guard
  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION trg_bundle_seal_event_guard()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $func$
    DECLARE
      v_state VARCHAR(16);
    BEGIN
      SELECT state INTO v_state
      FROM evidence_bundles
      WHERE bundle_id = NEW.bundle_id;

      IF v_state IS NULL THEN
        RAISE EXCEPTION 'bundle_not_found: %', NEW.bundle_id USING ERRCODE = '23503';
      END IF;

      IF v_state != 'SEALED' THEN
        RAISE EXCEPTION 'seal_event_requires_sealed_bundle: bundle % is in state %, expected SEALED',
          NEW.bundle_id, v_state USING ERRCODE = '45002';
      END IF;

      RETURN NEW;
    END;
    $func$
  `);

  await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS bundle_seal_event_guard ON bundle_seal_events`);
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER bundle_seal_event_guard
    BEFORE INSERT ON bundle_seal_events
    FOR EACH ROW EXECUTE FUNCTION trg_bundle_seal_event_guard()
  `);

  console.log('   ✅ Triggers created\n');
}

async function testPartialUniqueIndex() {
  console.log('4. Testing partial unique index (one OPEN bundle per tenant+incident)...');

  const tenantId = 'test-tenant-' + Date.now();
  const incidentId = 'test-incident-1';

  try {
    // First insert should succeed
    await prisma.$executeRawUnsafe(`
      INSERT INTO evidence_bundles (tenant_id, incident_id, state)
      VALUES ('${tenantId}', '${incidentId}', 'OPEN')
    `);
    console.log('   ✅ First OPEN bundle created');

    // Second insert should fail
    try {
      await prisma.$executeRawUnsafe(`
        INSERT INTO evidence_bundles (tenant_id, incident_id, state)
        VALUES ('${tenantId}', '${incidentId}', 'OPEN')
      `);
      console.log('   ❌ FAIL: Second OPEN bundle should have been rejected!');
      process.exit(1);
    } catch (err: any) {
      if (err.message?.includes('unique') || err.code === 'P2002' || 
          err.message?.includes('idx_evidence_bundles_one_open') ||
          err.message?.includes('23505') || err.message?.includes('already exists')) {
        console.log('   ✅ Second OPEN bundle correctly rejected (unique violation)');
        console.log('      Error code: 23505 (unique_violation)');
      } else {
        throw err;
      }
    }

    // Cleanup
    await prisma.$executeRawUnsafe(`DELETE FROM evidence_bundles WHERE tenant_id = '${tenantId}'`);
    console.log('   ✅ Cleanup done\n');
  } catch (err: any) {
    console.error('   ❌ Test failed:', err.message);
    throw err;
  }
}

async function testSealedBundleWriteBlock() {
  console.log('5. Testing SEALED bundle write block (trigger)...');

  const tenantId = 'test-tenant-sealed-' + Date.now();
  const incidentId = 'test-incident-sealed';

  try {
    // Create bundle
    const result = await prisma.$queryRawUnsafe<{ bundle_id: string }[]>(`
      INSERT INTO evidence_bundles (tenant_id, incident_id, state)
      VALUES ('${tenantId}', '${incidentId}', 'OPEN')
      RETURNING bundle_id
    `);
    const bundleId = result[0].bundle_id;
    console.log('   ✅ Bundle created:', bundleId);

    // Add object while OPEN (should succeed)
    await prisma.$executeRawUnsafe(`
      INSERT INTO evidence_objects (bundle_id, object_key, tenant_id, etag, content_type, size_bytes)
      VALUES ('${bundleId}', 'test-key-1', '${tenantId}', 'etag1', 'application/json', 100)
    `);
    console.log('   ✅ Object added to OPEN bundle');

    // Seal the bundle
    await prisma.$executeRawUnsafe(`
      UPDATE evidence_bundles 
      SET state = 'SEALED', sealed_hash = 'test-hash-123', sealed_at = now()
      WHERE bundle_id = '${bundleId}'
    `);
    console.log('   ✅ Bundle sealed');

    // Try to add object to SEALED bundle (should fail with 45000)
    try {
      await prisma.$executeRawUnsafe(`
        INSERT INTO evidence_objects (bundle_id, object_key, tenant_id, etag, content_type, size_bytes)
        VALUES ('${bundleId}', 'test-key-2', '${tenantId}', 'etag2', 'application/json', 200)
      `);
      console.log('   ❌ FAIL: Insert to SEALED bundle should have been rejected!');
      process.exit(1);
    } catch (err: any) {
      if (err.message?.includes('sealed_bundle_write_forbidden') || err.message?.includes('45000')) {
        console.log('   ✅ Insert to SEALED bundle correctly rejected (ERRCODE 45000)');
        console.log('      Error:', err.message.substring(0, 80) + '...');
      } else {
        throw err;
      }
    }

    // Cleanup
    await prisma.$executeRawUnsafe(`DELETE FROM evidence_bundles WHERE bundle_id = '${bundleId}'`);
    console.log('   ✅ Cleanup done\n');
  } catch (err: any) {
    console.error('   ❌ Test failed:', err.message);
    throw err;
  }
}

async function testTenantMismatch() {
  console.log('6. Testing tenant mismatch validation (trigger)...');

  const tenantId = 'test-tenant-mismatch-' + Date.now();
  const wrongTenantId = 'wrong-tenant-' + Date.now();
  const incidentId = 'test-incident-mismatch';

  try {
    // Create bundle
    const result = await prisma.$queryRawUnsafe<{ bundle_id: string }[]>(`
      INSERT INTO evidence_bundles (tenant_id, incident_id, state)
      VALUES ('${tenantId}', '${incidentId}', 'OPEN')
      RETURNING bundle_id
    `);
    const bundleId = result[0].bundle_id;
    console.log('   ✅ Bundle created for tenant:', tenantId);

    // Try to add object with different tenant (should fail with 45001)
    try {
      await prisma.$executeRawUnsafe(`
        INSERT INTO evidence_objects (bundle_id, object_key, tenant_id, etag, content_type, size_bytes)
        VALUES ('${bundleId}', 'test-key-1', '${wrongTenantId}', 'etag1', 'application/json', 100)
      `);
      console.log('   ❌ FAIL: Tenant mismatch should have been rejected!');
      process.exit(1);
    } catch (err: any) {
      if (err.message?.includes('tenant_mismatch') || err.message?.includes('45001')) {
        console.log('   ✅ Tenant mismatch correctly rejected (ERRCODE 45001)');
        console.log('      Error:', err.message.substring(0, 80) + '...');
      } else {
        throw err;
      }
    }

    // Cleanup
    await prisma.$executeRawUnsafe(`DELETE FROM evidence_bundles WHERE bundle_id = '${bundleId}'`);
    console.log('   ✅ Cleanup done\n');
  } catch (err: any) {
    console.error('   ❌ Test failed:', err.message);
    throw err;
  }
}

async function testSealEventValidation() {
  console.log('7. Testing seal event validation (trigger)...');

  const tenantId = 'test-tenant-seal-event-' + Date.now();
  const incidentId = 'test-incident-seal-event';

  try {
    // Create OPEN bundle
    const result = await prisma.$queryRawUnsafe<{ bundle_id: string }[]>(`
      INSERT INTO evidence_bundles (tenant_id, incident_id, state)
      VALUES ('${tenantId}', '${incidentId}', 'OPEN')
      RETURNING bundle_id
    `);
    const bundleId = result[0].bundle_id;
    console.log('   ✅ OPEN bundle created');

    // Try to create seal event for OPEN bundle (should fail with 45002)
    try {
      await prisma.$executeRawUnsafe(`
        INSERT INTO bundle_seal_events (bundle_id, run_id, hash, object_count, total_size_bytes)
        VALUES ('${bundleId}', 'run-1', 'hash-1', 0, 0)
      `);
      console.log('   ❌ FAIL: Seal event for OPEN bundle should have been rejected!');
      process.exit(1);
    } catch (err: any) {
      if (err.message?.includes('seal_event_requires_sealed_bundle') || err.message?.includes('45002')) {
        console.log('   ✅ Seal event for OPEN bundle correctly rejected (ERRCODE 45002)');
        console.log('      Error:', err.message.substring(0, 80) + '...');
      } else {
        throw err;
      }
    }

    // Now seal the bundle and try again
    await prisma.$executeRawUnsafe(`
      UPDATE evidence_bundles 
      SET state = 'SEALED', sealed_hash = 'test-hash', sealed_at = now()
      WHERE bundle_id = '${bundleId}'
    `);
    console.log('   ✅ Bundle sealed');

    // Create seal event for SEALED bundle (should succeed)
    await prisma.$executeRawUnsafe(`
      INSERT INTO bundle_seal_events (bundle_id, run_id, hash, object_count, total_size_bytes)
      VALUES ('${bundleId}', 'run-1', 'hash-1', 0, 0)
    `);
    console.log('   ✅ Seal event created for SEALED bundle');

    // Cleanup
    await prisma.$executeRawUnsafe(`DELETE FROM evidence_bundles WHERE bundle_id = '${bundleId}'`);
    console.log('   ✅ Cleanup done\n');
  } catch (err: any) {
    console.error('   ❌ Test failed:', err.message);
    throw err;
  }
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║     Phase 9C Task 2: Evidence Bundle Migration Test          ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  try {
    await createTables();
    await createIndexes();
    await createTriggers();
    await testPartialUniqueIndex();
    await testSealedBundleWriteBlock();
    await testTenantMismatch();
    await testSealEventValidation();

    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║                    ALL TESTS PASSED ✅                       ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
  } catch (err) {
    console.error('\n╔══════════════════════════════════════════════════════════════╗');
    console.error('║                    TEST SUITE FAILED ❌                       ║');
    console.error('╚══════════════════════════════════════════════════════════════╝');
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
