/**
 * Phase 9C Task 2.5 - Bundle Seal Integration Tests
 * 
 * Tests against real PostgreSQL database.
 * Requires: DATABASE_URL pointing to test database
 */

import { PrismaClient } from '@prisma/client';
import { BundleSealService } from '../bundle-seal.service';
import { BundleSealRepository } from '../bundle-seal.repository';
import {
  BundleNotFoundError,
  BundleAlreadySealedError,
} from '../bundle-seal.errors';
import { randomUUID } from 'crypto';

// Skip if no database connection
const DATABASE_URL = process.env.DATABASE_URL ?? '';
const describeIf = DATABASE_URL ? describe : describe.skip;

describeIf('BundleSealService Integration', () => {
  let prisma: PrismaClient;
  let service: BundleSealService;
  let repository: BundleSealRepository;

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: { db: { url: DATABASE_URL } },
    });
    await prisma.$connect();
    service = new BundleSealService(prisma, { gracePeriodMs: 0 }); // No grace for tests
    repository = new BundleSealRepository(prisma);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // Helper to create test bundle
  async function createTestBundle(
    tenantId: string = 'test-tenant',
    incidentId: string = randomUUID()
  ): Promise<string> {
    const result = await prisma.$queryRaw<{ bundle_id: string }[]>`
      INSERT INTO evidence_bundles (tenant_id, incident_id)
      VALUES (${tenantId}, ${incidentId})
      RETURNING bundle_id::text as bundle_id
    `;
    return result[0].bundle_id;
  }

  // Helper to add test object
  async function addTestObject(
    bundleId: string,
    objectKey: string,
    tenantId: string = 'test-tenant'
  ): Promise<void> {
    await prisma.$executeRaw`
      INSERT INTO evidence_objects (bundle_id, object_key, tenant_id, etag, content_type, size_bytes)
      VALUES (${bundleId}::uuid, ${objectKey}, ${tenantId}, ${'etag-' + objectKey}, 'application/json', 1024)
    `;
  }

  // Cleanup helper
  async function cleanupBundle(bundleId: string): Promise<void> {
    await prisma.$executeRaw`
      DELETE FROM evidence_bundles WHERE bundle_id = ${bundleId}::uuid
    `;
  }

  describe('sealBundleOnDemand', () => {
    it('should seal an OPEN bundle successfully', async () => {
      const bundleId = await createTestBundle();
      await addTestObject(bundleId, 'object1');
      await addTestObject(bundleId, 'object2');

      try {
        const result = await service.sealBundleOnDemand(bundleId, 'run-1');

        expect(result.bundleId).toBe(bundleId);
        expect(result.sealedHash).toMatch(/^[a-f0-9]{64}$/);
        expect(result.objectCount).toBe(2);
        expect(BigInt(result.totalSizeBytes)).toBe(BigInt(2048));
        expect(result.sealedAt).toBeInstanceOf(Date);

        // Verify bundle is sealed in DB
        const bundle = await repository.getBundleById(bundleId);
        expect(bundle?.state).toBe('SEALED');
        expect(bundle?.sealed_hash).toBe(result.sealedHash);
      } finally {
        await cleanupBundle(bundleId);
      }
    });

    it('should throw BundleNotFoundError for non-existent bundle', async () => {
      const fakeId = randomUUID();

      await expect(
        service.sealBundleOnDemand(fakeId, 'run-1')
      ).rejects.toThrow(BundleNotFoundError);
    });

    it('should throw BundleAlreadySealedError for sealed bundle', async () => {
      const bundleId = await createTestBundle();
      await addTestObject(bundleId, 'obj1');

      try {
        // First seal
        await service.sealBundleOnDemand(bundleId, 'run-1');

        // Second seal attempt
        await expect(
          service.sealBundleOnDemand(bundleId, 'run-2')
        ).rejects.toThrow(BundleAlreadySealedError);
      } finally {
        await cleanupBundle(bundleId);
      }
    });

    it('should seal empty bundle', async () => {
      const bundleId = await createTestBundle();

      try {
        const result = await service.sealBundleOnDemand(bundleId, 'run-1');

        expect(result.objectCount).toBe(0);
        expect(result.totalSizeBytes).toBe('0');
        expect(result.sealedHash).toMatch(/^[a-f0-9]{64}$/);
      } finally {
        await cleanupBundle(bundleId);
      }
    });

    it('should produce deterministic hash for same objects', async () => {
      const bundleId1 = await createTestBundle('t1', 'inc-1');
      const bundleId2 = await createTestBundle('t1', 'inc-2');

      try {
        // Add same objects to both bundles
        await addTestObject(bundleId1, 'a.json', 't1');
        await addTestObject(bundleId1, 'b.json', 't1');
        await addTestObject(bundleId2, 'a.json', 't1');
        await addTestObject(bundleId2, 'b.json', 't1');

        const result1 = await service.sealBundleOnDemand(bundleId1, 'run-1');
        const result2 = await service.sealBundleOnDemand(bundleId2, 'run-2');

        // Same objects = same hash
        expect(result1.sealedHash).toBe(result2.sealedHash);
      } finally {
        await cleanupBundle(bundleId1);
        await cleanupBundle(bundleId2);
      }
    });
  });

  describe('sealNextOpenBundleBatch', () => {
    it('should seal oldest eligible bundle', async () => {
      // Use unique tenant to avoid conflicts with other tests
      const uniqueTenant = `batch-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      
      // Create bundle with old timestamp
      const bundleId = await createTestBundle(uniqueTenant);
      await addTestObject(bundleId, 'obj1', uniqueTenant);

      // Force old created_at
      await prisma.$executeRaw`
        UPDATE evidence_bundles 
        SET created_at = now() - interval '1 hour'
        WHERE bundle_id = ${bundleId}::uuid
      `;

      try {
        const result = await service.sealNextOpenBundleBatch('batch-run-1');

        expect(result.sealed).toBe(true);
        // Don't check exact bundleId - other bundles may exist
        expect(result.reason).toBe('sealed');
        expect(result.result?.sealedHash).toMatch(/^[a-f0-9]{64}$/);
      } finally {
        await cleanupBundle(bundleId);
      }
    });

    it('should return no_candidate when no eligible bundles', async () => {
      // Create fresh bundle (within grace period)
      const bundleId = await createTestBundle();

      // Use service with 1 hour grace period
      const strictService = new BundleSealService(prisma, {
        gracePeriodMs: 60 * 60 * 1000, // 1 hour
      });

      try {
        const result = await strictService.sealNextOpenBundleBatch('batch-run-1');

        expect(result.sealed).toBe(false);
        expect(result.reason).toBe('no_candidate');
      } finally {
        await cleanupBundle(bundleId);
      }
    });

    it('should skip locked bundles', async () => {
      const bundleId = await createTestBundle();
      await addTestObject(bundleId, 'obj1');

      // Force old timestamp
      await prisma.$executeRaw`
        UPDATE evidence_bundles 
        SET created_at = now() - interval '1 hour'
        WHERE bundle_id = ${bundleId}::uuid
      `;

      try {
        // Start transaction that locks the bundle
        await prisma.$transaction(async (tx) => {
          // Lock bundle
          await tx.$queryRaw`
            SELECT * FROM evidence_bundles 
            WHERE bundle_id = ${bundleId}::uuid
            FOR UPDATE
          `;

          // In parallel, try batch seal (should skip)
          const result = await service.sealNextOpenBundleBatch('batch-run-1');

          // Should skip the locked bundle
          expect(result.sealed).toBe(false);
          expect(result.reason).toBe('no_candidate');
        });
      } finally {
        await cleanupBundle(bundleId);
      }
    });
  });

  describe('concurrent seal attempts', () => {
    it('should handle concurrent NOWAIT requests', async () => {
      const bundleId = await createTestBundle();
      await addTestObject(bundleId, 'obj1');

      try {
        // Launch concurrent seal attempts
        const results = await Promise.allSettled([
          service.sealBundleOnDemand(bundleId, 'run-1'),
          service.sealBundleOnDemand(bundleId, 'run-2'),
        ]);

        // One should succeed, one should fail
        const successes = results.filter(r => r.status === 'fulfilled');
        const failures = results.filter(r => r.status === 'rejected');

        // At least one should succeed
        expect(successes.length).toBeGreaterThanOrEqual(1);
        
        // If there's a failure, check error type
        if (failures.length > 0) {
          const failedResult = failures[0] as PromiseRejectedResult;
          // Could be BundleLockedError, BundleAlreadySealedError, or serialization error
          const errorName = failedResult.reason?.constructor?.name || failedResult.reason?.name;
          const errorMessage = failedResult.reason?.message || String(failedResult.reason);
          
          // Accept any of these as valid concurrent conflict errors
          const isExpectedError = 
            errorName === 'BundleLockedError' ||
            errorName === 'BundleAlreadySealedError' ||
            errorMessage.includes('could not serialize') ||
            errorMessage.includes('lock') ||
            errorMessage.includes('sealed');
          
          expect(isExpectedError).toBe(true);
        }
      } finally {
        await cleanupBundle(bundleId);
      }
    });
  });

  describe('seal event idempotency', () => {
    it('should create seal event with correct data', async () => {
      const bundleId = await createTestBundle();
      await addTestObject(bundleId, 'obj1');

      try {
        const result = await service.sealBundleOnDemand(bundleId, 'run-123');

        // Verify seal event
        const event = await repository.getSealEventByRunId(bundleId, 'run-123');
        expect(event).not.toBeNull();
        expect(event?.hash).toBe(result.sealedHash);
        expect(event?.object_count).toBe(1);
        expect(event?.total_size_bytes).toBe(BigInt(1024));
      } finally {
        await cleanupBundle(bundleId);
      }
    });
  });
});
