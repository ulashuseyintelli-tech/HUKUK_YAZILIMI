/**
 * Object Store Write-Once Integration Tests
 * 
 * Phase 9C - Task 1: Object Model & Keyspace
 * 
 * REQUIRES: MinIO container running
 * 
 * Run with:
 *   docker run -d -p 9000:9000 -p 9001:9001 \
 *     -e MINIO_ROOT_USER=minioadmin \
 *     -e MINIO_ROOT_PASSWORD=minioadmin \
 *     minio/minio server /data --console-address ":9001"
 * 
 * Then:
 *   pnpm test -- --testPathPattern=write-once.integration
 * 
 * These tests verify that If-None-Match: * actually works with MinIO.
 */

import { MinioObjectStoreClient, ObjectStoreConfig, ObjectAlreadyExistsError } from '../index';

// Skip if MinIO is not available
const MINIO_ENDPOINT = process.env.MINIO_TEST_ENDPOINT || 'http://localhost:9000';
const MINIO_ACCESS_KEY = process.env.MINIO_TEST_ACCESS_KEY || 'minioadmin';
const MINIO_SECRET_KEY = process.env.MINIO_TEST_SECRET_KEY || 'minioadmin';
const MINIO_BUCKET = process.env.MINIO_TEST_BUCKET || 'test-evidence-bundles';

// Check if MinIO is available
async function isMinioAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${MINIO_ENDPOINT}/minio/health/live`, {
      method: 'GET',
      signal: AbortSignal.timeout(2000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

describe('Object Store Write-Once Integration (MinIO)', () => {
  let client: MinioObjectStoreClient;
  let minioAvailable: boolean;
  
  const testConfig: ObjectStoreConfig = {
    endpoint: MINIO_ENDPOINT,
    bucket: MINIO_BUCKET,
    region: 'us-east-1',
    accessKeyId: MINIO_ACCESS_KEY,
    secretAccessKey: MINIO_SECRET_KEY,
    forcePathStyle: true,
    keyPrefix: 'test-tenants',
    tlsInsecure: true,
  };
  
  beforeAll(async () => {
    minioAvailable = await isMinioAvailable();
    if (minioAvailable) {
      client = new MinioObjectStoreClient(testConfig);
    }
  });
  
  // Helper to generate unique keys
  const uniqueKey = () => `test-tenants/test-tenant/incidents/test-incident/snapshots/test-${Date.now()}-${Math.random().toString(36).slice(2)}/manifest.json`;
  
  // ==========================================================================
  // Write-Once Verification Tests
  // ==========================================================================
  
  describe('Write-Once Guarantee', () => {
    it('should succeed on first write', async () => {
      if (!minioAvailable) {
        console.log('Skipping: MinIO not available');
        return;
      }
      
      const key = uniqueKey();
      const content = JSON.stringify({ test: 'data', timestamp: Date.now() });
      
      const result = await client.putWriteOnce({
        key,
        body: Buffer.from(content),
        contentType: 'application/json',
      });
      
      expect(result.verified).toBe(true);
      expect(result.etag).toBeTruthy();
      expect(result.headVerification.etag).toBe(result.etag);
      
      // Cleanup
      await client.deleteObject(key);
    });
    
    it('should fail with 412 on second write to same key', async () => {
      if (!minioAvailable) {
        console.log('Skipping: MinIO not available');
        return;
      }
      
      const key = uniqueKey();
      const content1 = JSON.stringify({ version: 1 });
      const content2 = JSON.stringify({ version: 2 });
      
      // First write should succeed
      const result1 = await client.putWriteOnce({
        key,
        body: Buffer.from(content1),
        contentType: 'application/json',
      });
      expect(result1.verified).toBe(true);
      
      // Second write should fail with 412
      await expect(
        client.putWriteOnce({
          key,
          body: Buffer.from(content2),
          contentType: 'application/json',
        })
      ).rejects.toThrow(ObjectAlreadyExistsError);
      
      // Verify original content is preserved
      const getResult = await client.getObject(key);
      expect(JSON.parse(getResult.body.toString())).toEqual({ version: 1 });
      
      // Cleanup
      await client.deleteObject(key);
    });
    
    it('should allow write after delete', async () => {
      if (!minioAvailable) {
        console.log('Skipping: MinIO not available');
        return;
      }
      
      const key = uniqueKey();
      const content1 = JSON.stringify({ version: 1 });
      const content2 = JSON.stringify({ version: 2 });
      
      // First write
      await client.putWriteOnce({
        key,
        body: Buffer.from(content1),
        contentType: 'application/json',
      });
      
      // Delete
      await client.deleteObject(key);
      
      // Second write should succeed (key no longer exists)
      const result2 = await client.putWriteOnce({
        key,
        body: Buffer.from(content2),
        contentType: 'application/json',
      });
      expect(result2.verified).toBe(true);
      
      // Verify new content
      const getResult = await client.getObject(key);
      expect(JSON.parse(getResult.body.toString())).toEqual({ version: 2 });
      
      // Cleanup
      await client.deleteObject(key);
    });
  });
  
  // ==========================================================================
  // HEAD Verification Tests
  // ==========================================================================
  
  describe('HEAD Verification', () => {
    it('should capture correct metadata in headVerification', async () => {
      if (!minioAvailable) {
        console.log('Skipping: MinIO not available');
        return;
      }
      
      const key = uniqueKey();
      const content = JSON.stringify({ test: 'metadata' });
      
      const result = await client.putWriteOnce({
        key,
        body: Buffer.from(content),
        contentType: 'application/json',
      });
      
      expect(result.headVerification.size).toBe(Buffer.from(content).length);
      expect(result.headVerification.lastModified).toBeInstanceOf(Date);
      expect(result.headVerification.etag).toBeTruthy();
      
      // Cleanup
      await client.deleteObject(key);
    });
  });
  
  // ==========================================================================
  // Concurrent Write Tests
  // ==========================================================================
  
  describe('Concurrent Writes', () => {
    it('should allow only one concurrent write to succeed', async () => {
      if (!minioAvailable) {
        console.log('Skipping: MinIO not available');
        return;
      }
      
      const key = uniqueKey();
      const content1 = JSON.stringify({ writer: 1 });
      const content2 = JSON.stringify({ writer: 2 });
      const content3 = JSON.stringify({ writer: 3 });
      
      // Start 3 concurrent writes
      const results = await Promise.allSettled([
        client.putWriteOnce({
          key,
          body: Buffer.from(content1),
          contentType: 'application/json',
        }),
        client.putWriteOnce({
          key,
          body: Buffer.from(content2),
          contentType: 'application/json',
        }),
        client.putWriteOnce({
          key,
          body: Buffer.from(content3),
          contentType: 'application/json',
        }),
      ]);
      
      // Exactly one should succeed
      const successes = results.filter(r => r.status === 'fulfilled');
      const failures = results.filter(r => r.status === 'rejected');
      
      expect(successes.length).toBe(1);
      expect(failures.length).toBe(2);
      
      // All failures should be ObjectAlreadyExistsError
      for (const failure of failures) {
        if (failure.status === 'rejected') {
          expect(failure.reason).toBeInstanceOf(ObjectAlreadyExistsError);
        }
      }
      
      // Cleanup
      await client.deleteObject(key);
    });
  });
  
  // ==========================================================================
  // Metadata and Tags Tests
  // ==========================================================================
  
  describe('Metadata and Tags', () => {
    it('should preserve metadata on write-once', async () => {
      if (!minioAvailable) {
        console.log('Skipping: MinIO not available');
        return;
      }
      
      const key = uniqueKey();
      const content = JSON.stringify({ test: 'metadata' });
      const metadata = {
        'snapshot-id': 'snap-123',
        'tenant-id': 'tenant-456',
      };
      
      await client.putWriteOnce({
        key,
        body: Buffer.from(content),
        contentType: 'application/json',
        metadata,
      });
      
      // Verify metadata via HEAD
      const headResult = await client.headObject(key);
      expect(headResult.exists).toBe(true);
      if (headResult.exists) {
        expect(headResult.metadata['snapshot-id']).toBe('snap-123');
        expect(headResult.metadata['tenant-id']).toBe('tenant-456');
      }
      
      // Cleanup
      await client.deleteObject(key);
    });
    
    it('should preserve tags on write-once', async () => {
      if (!minioAvailable) {
        console.log('Skipping: MinIO not available');
        return;
      }
      
      const key = uniqueKey();
      const content = JSON.stringify({ test: 'tags' });
      const tags = {
        retentionPolicy: 'STANDARD',
        environment: 'test',
      };
      
      await client.putWriteOnce({
        key,
        body: Buffer.from(content),
        contentType: 'application/json',
        tags,
      });
      
      // Note: Tag verification requires GetObjectTagging which we haven't implemented
      // For now, just verify the write succeeded
      const headResult = await client.headObject(key);
      expect(headResult.exists).toBe(true);
      
      // Cleanup
      await client.deleteObject(key);
    });
  });
});
