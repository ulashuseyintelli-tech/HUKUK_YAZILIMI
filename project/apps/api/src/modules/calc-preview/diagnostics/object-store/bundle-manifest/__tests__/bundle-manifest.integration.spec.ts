/**
 * Phase 9C Task 3 - Bundle Manifest Integration Tests
 * 
 * Tests the complete flow: seal → manifest → verify
 */

import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { BundleSealService } from '../../bundle-seal/bundle-seal.service';
import { ManifestWriter } from '../bundle-manifest.writer';
import { ManifestBuilder } from '../bundle-manifest.builder';
import { verifyManifest, verifyManifestDetailed } from '../bundle-manifest.verifier';
import type { IObjectStoreClient, PutObjectInput, PutWriteOnceResult, HeadObjectResult, HeadObjectNotFound, GetObjectResult } from '../../object-store.interface';
import type { BundleManifestV1 } from '../bundle-manifest.types';
import { describeDb } from '../../../../../../../test/describe-db';

// Mock object store for testing
class MockObjectStore implements IObjectStoreClient {
  private storage = new Map<string, { body: Buffer; contentType: string; etag: string }>();

  async putObject(input: PutObjectInput) {
    const body = Buffer.isBuffer(input.body) ? input.body : Buffer.from(input.body as string);
    const etag = `"${randomUUID()}"`;
    this.storage.set(input.key, { body, contentType: input.contentType, etag });
    return { etag };
  }

  async putWriteOnce(input: Omit<PutObjectInput, 'ifNoneMatch'>): Promise<PutWriteOnceResult> {
    if (this.storage.has(input.key)) {
      const error = new Error('Object already exists');
      error.name = 'ObjectAlreadyExistsError';
      throw error;
    }
    const body = Buffer.isBuffer(input.body) ? input.body : Buffer.from(input.body as string);
    const etag = `"${randomUUID()}"`;
    this.storage.set(input.key, { body, contentType: input.contentType, etag });
    return {
      etag,
      verified: true,
      headVerification: {
        etag,
        versionId: undefined,
        size: body.length,
        lastModified: new Date(),
      },
    };
  }

  async headObject(key: string): Promise<HeadObjectResult | HeadObjectNotFound> {
    const obj = this.storage.get(key);
    if (!obj) return { exists: false };
    return {
      exists: true,
      size: obj.body.length,
      etag: obj.etag,
      contentType: obj.contentType,
      metadata: {},
      lastModified: new Date(),
    };
  }

  async getObject(key: string): Promise<GetObjectResult> {
    const obj = this.storage.get(key);
    if (!obj) throw new Error('OBJECT_NOT_FOUND');
    return {
      body: obj.body,
      contentType: obj.contentType,
      etag: obj.etag,
      metadata: {},
    };
  }

  async getObjectStream(): Promise<never> { throw new Error('Not implemented'); }
  async putObjectTagging() {}
  async deleteObject(key: string) { this.storage.delete(key); }
  async deleteObjects(keys: string[]) {
    keys.forEach(k => this.storage.delete(k));
    return { deleted: keys, errors: [] };
  }

  // Test helpers
  getStoredManifest(bundleId: string): BundleManifestV1 | null {
    const key = `bundles/${bundleId}/manifest.json`;
    const obj = this.storage.get(key);
    if (!obj) return null;
    return JSON.parse(obj.body.toString('utf8'));
  }

  clear() {
    this.storage.clear();
  }
}

describeDb('Bundle Manifest Integration', () => {
  let prisma: PrismaClient;
  let objectStore: MockObjectStore;
  let manifestWriter: ManifestWriter;
  let sealService: BundleSealService;

  const testTenantId = 'test-tenant-001';
  // Use unique incident_id per test to avoid unique constraint violations
  const getTestIncidentId = () => `test-incident-${randomUUID().slice(0, 8)}`;

  beforeAll(async () => {
    prisma = new PrismaClient({
      datasources: { db: { url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5433/truthlayer_test' } },
    });
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(() => {
    objectStore = new MockObjectStore();
    manifestWriter = new ManifestWriter(prisma, objectStore, {
      storage: { provider: 's3', bucket: 'test-bucket', region: 'us-east-1' },
    });
    sealService = new BundleSealService(prisma, {
      manifestWriter,
      manifestErrorLogger: () => {}, // Suppress logs in tests
    });
  });

  afterEach(async () => {
    // Cleanup test data - use bundle_id based cleanup
    try {
      await prisma.$executeRaw`DELETE FROM bundle_seal_events WHERE bundle_id IN (SELECT bundle_id FROM evidence_bundles WHERE tenant_id = ${testTenantId})`;
      await prisma.$executeRaw`DELETE FROM evidence_objects WHERE bundle_id IN (SELECT bundle_id FROM evidence_bundles WHERE tenant_id = ${testTenantId})`;
      await prisma.$executeRaw`DELETE FROM evidence_bundles WHERE tenant_id = ${testTenantId}`;
    } catch {
      // Ignore cleanup errors
    }
    objectStore.clear();
  });

  describe('seal → manifest flow', () => {
    it('should write manifest automatically after seal', async () => {
      // 1. Create bundle with objects
      const bundleId = randomUUID();
      const incidentId = getTestIncidentId();
      await prisma.$executeRaw`
        INSERT INTO evidence_bundles (bundle_id, tenant_id, incident_id, state, created_at)
        VALUES (${bundleId}::uuid, ${testTenantId}, ${incidentId}, 'OPEN', NOW())
      `;

      await prisma.$executeRaw`
        INSERT INTO evidence_objects (bundle_id, object_key, tenant_id, etag, version_id, content_type, size_bytes, created_at)
        VALUES 
          (${bundleId}::uuid, 'doc1.pdf', ${testTenantId}, '"abc123"', NULL, 'application/pdf', 1024, NOW()),
          (${bundleId}::uuid, 'doc2.pdf', ${testTenantId}, '"def456"', NULL, 'application/pdf', 2048, NOW())
      `;

      // 2. Seal bundle (should trigger manifest write)
      const runId = randomUUID();
      const sealResult = await sealService.sealBundleOnDemand(bundleId, runId);

      expect(sealResult.bundleId).toBe(bundleId);
      expect(sealResult.sealedHash).toBeDefined();
      expect(sealResult.objectCount).toBe(2);

      // 3. Verify manifest was written
      const manifest = objectStore.getStoredManifest(bundleId);
      expect(manifest).not.toBeNull();
      expect(manifest!.bundleId).toBe(bundleId);
      expect(manifest!.state).toBe('SEALED');
      expect(manifest!.sealedHash).toBe(sealResult.sealedHash);
      expect(manifest!.objects).toHaveLength(2);
    });

    it('should produce verifiable manifest', async () => {
      // 1. Create and seal bundle
      const bundleId = randomUUID();
      const incidentId = getTestIncidentId();
      await prisma.$executeRaw`
        INSERT INTO evidence_bundles (bundle_id, tenant_id, incident_id, state, created_at)
        VALUES (${bundleId}::uuid, ${testTenantId}, ${incidentId}, 'OPEN', NOW())
      `;

      await prisma.$executeRaw`
        INSERT INTO evidence_objects (bundle_id, object_key, tenant_id, etag, version_id, content_type, size_bytes, created_at)
        VALUES (${bundleId}::uuid, 'evidence.json', ${testTenantId}, '"hash123"', 'v1', 'application/json', 512, NOW())
      `;

      await sealService.sealBundleOnDemand(bundleId, randomUUID());

      // 2. Read manifest
      const manifest = objectStore.getStoredManifest(bundleId);
      expect(manifest).not.toBeNull();

      // 3. Verify manifest integrity
      const verifyResult = verifyManifest(manifest!);
      expect(verifyResult.valid).toBe(true);

      // 4. Detailed verification
      const detailed = verifyManifestDetailed(manifest!);
      expect(detailed.manifestHashValid).toBe(true);
      expect(detailed.sealedHashValid).toBe(true);
      expect(detailed.objectCountValid).toBe(true);
      expect(detailed.totalSizeBytesValid).toBe(true);
      expect(detailed.objectsOrderValid).toBe(true);
      expect(detailed.errors).toHaveLength(0);
    });

    it('should handle empty bundle', async () => {
      const bundleId = randomUUID();
      const incidentId = getTestIncidentId();
      await prisma.$executeRaw`
        INSERT INTO evidence_bundles (bundle_id, tenant_id, incident_id, state, created_at)
        VALUES (${bundleId}::uuid, ${testTenantId}, ${incidentId}, 'OPEN', NOW())
      `;

      await sealService.sealBundleOnDemand(bundleId, randomUUID());

      const manifest = objectStore.getStoredManifest(bundleId);
      expect(manifest).not.toBeNull();
      expect(manifest!.objects).toHaveLength(0);
      expect(manifest!.objectCount).toBe(0);
      expect(manifest!.totalSizeBytes).toBe('0');

      const verifyResult = verifyManifest(manifest!);
      expect(verifyResult.valid).toBe(true);
    });
  });

  describe('manifest idempotency', () => {
    it('should not overwrite existing manifest', async () => {
      const bundleId = randomUUID();
      const incidentId = getTestIncidentId();
      await prisma.$executeRaw`
        INSERT INTO evidence_bundles (bundle_id, tenant_id, incident_id, state, created_at)
        VALUES (${bundleId}::uuid, ${testTenantId}, ${incidentId}, 'OPEN', NOW())
      `;

      // First seal
      await sealService.sealBundleOnDemand(bundleId, randomUUID());
      const firstManifest = objectStore.getStoredManifest(bundleId);

      // Try to write manifest again (should be idempotent)
      const result = await manifestWriter.writeManifestForBundle(bundleId);
      expect(result.success).toBe(true);
      expect(result.alreadyExists).toBe(true);

      // Manifest should be unchanged
      const secondManifest = objectStore.getStoredManifest(bundleId);
      expect(secondManifest!.manifestHash).toBe(firstManifest!.manifestHash);
    });
  });

  describe('ManifestBuilder direct usage', () => {
    it('should build manifest from DB', async () => {
      const bundleId = randomUUID();
      const incidentId = getTestIncidentId();
      
      // Create OPEN bundle first
      await prisma.$executeRaw`
        INSERT INTO evidence_bundles (bundle_id, tenant_id, incident_id, state, created_at)
        VALUES (${bundleId}::uuid, ${testTenantId}, ${incidentId}, 'OPEN', NOW() - INTERVAL '1 hour')
      `;

      // Add object while bundle is OPEN
      await prisma.$executeRaw`
        INSERT INTO evidence_objects (bundle_id, object_key, tenant_id, etag, version_id, content_type, size_bytes, created_at)
        VALUES (${bundleId}::uuid, 'test.pdf', ${testTenantId}, '"etag1"', NULL, 'application/pdf', 1024, NOW())
      `;

      // Now seal the bundle
      await prisma.$executeRaw`
        UPDATE evidence_bundles 
        SET state = 'SEALED', sealed_hash = 'abc123hash', sealed_at = NOW()
        WHERE bundle_id = ${bundleId}::uuid
      `;

      // Add seal event
      await prisma.$executeRaw`
        INSERT INTO bundle_seal_events (bundle_id, run_id, hash, object_count, total_size_bytes, created_at)
        VALUES (${bundleId}::uuid, ${randomUUID()}, 'abc123hash', 1, 1024, NOW())
      `;

      const builder = new ManifestBuilder(prisma);
      const manifest = await builder.buildManifest(bundleId, {
        storage: { provider: 's3', bucket: 'test-bucket' },
      });

      expect(manifest.bundleId).toBe(bundleId);
      expect(manifest.tenantId).toBe(testTenantId);
      expect(manifest.incidentId).toBe(incidentId);
      expect(manifest.state).toBe('SEALED');
      expect(manifest.sealedHash).toBe('abc123hash');
      expect(manifest.objects).toHaveLength(1);
      expect(manifest.manifestHash).toBeDefined();
    });

    it('should throw for non-sealed bundle', async () => {
      const bundleId = randomUUID();
      const incidentId = getTestIncidentId();
      await prisma.$executeRaw`
        INSERT INTO evidence_bundles (bundle_id, tenant_id, incident_id, state, created_at)
        VALUES (${bundleId}::uuid, ${testTenantId}, ${incidentId}, 'OPEN', NOW())
      `;

      const builder = new ManifestBuilder(prisma);
      await expect(
        builder.buildManifest(bundleId, { storage: { provider: 's3', bucket: 'test' } })
      ).rejects.toThrow('not sealed');
    });
  });

  describe('manifest read', () => {
    it('should read manifest via ManifestWriter', async () => {
      const bundleId = randomUUID();
      const incidentId = getTestIncidentId();
      await prisma.$executeRaw`
        INSERT INTO evidence_bundles (bundle_id, tenant_id, incident_id, state, created_at)
        VALUES (${bundleId}::uuid, ${testTenantId}, ${incidentId}, 'OPEN', NOW())
      `;

      await sealService.sealBundleOnDemand(bundleId, randomUUID());

      const manifest = await manifestWriter.readManifest(bundleId);
      expect(manifest).not.toBeNull();
      expect(manifest!.bundleId).toBe(bundleId);
    });

    it('should return null for non-existent manifest', async () => {
      const manifest = await manifestWriter.readManifest(randomUUID());
      expect(manifest).toBeNull();
    });
  });
});
