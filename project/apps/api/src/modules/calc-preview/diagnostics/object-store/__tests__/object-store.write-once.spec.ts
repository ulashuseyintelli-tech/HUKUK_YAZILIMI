/**
 * Object Store Write-Once Tests
 * 
 * Phase 9C - Task 1: Object Model & Keyspace
 * 
 * Tests for:
 * - putWriteOnce() behavior
 * - 412 Precondition Failed handling
 * - HEAD verification (fallback guard)
 * - ETag/VersionId consistency
 */

import {
  MinioObjectStoreClient,
  ObjectStoreConfig,
  ObjectAlreadyExistsError,
  WriteOnceViolationError,
} from '../index';

// Mock AWS SDK v3
jest.mock('@aws-sdk/client-s3', () => {
  const mockSend = jest.fn();
  return {
    S3Client: jest.fn().mockImplementation(() => ({
      send: mockSend,
    })),
    PutObjectCommand: jest.fn().mockImplementation((input) => ({ input })),
    HeadObjectCommand: jest.fn().mockImplementation((input) => ({ input })),
    GetObjectCommand: jest.fn(),
    DeleteObjectCommand: jest.fn(),
    DeleteObjectsCommand: jest.fn(),
    PutObjectTaggingCommand: jest.fn(),
    __mockSend: mockSend,
  };
});

describe('Object Store Write-Once', () => {
  let client: MinioObjectStoreClient;
  let mockSend: jest.Mock;
  
  const testConfig: ObjectStoreConfig = {
    endpoint: 'http://localhost:9000',
    bucket: 'test-bucket',
    region: 'us-east-1',
    accessKeyId: 'test-access-key',
    secretAccessKey: 'test-secret-key',
    forcePathStyle: true,
    keyPrefix: 'tenants',
    tlsInsecure: false,
  };
  
  beforeEach(async () => {
    jest.clearAllMocks();
    
    // Get mock send function
    const s3Module = await import('@aws-sdk/client-s3');
    mockSend = (s3Module as unknown as { __mockSend: jest.Mock }).__mockSend;
    
    client = new MinioObjectStoreClient(testConfig);
  });
  
  // ==========================================================================
  // putWriteOnce Success Tests
  // ==========================================================================
  
  describe('putWriteOnce - Success Path', () => {
    it('should succeed when PUT and HEAD both succeed with matching etag', async () => {
      const testKey = 'tenants/tenant-1/incidents/incident-1/snapshots/snapshot-1/manifest.json';
      const testEtag = 'abc123def456';
      const testVersionId = 'v1';
      const testSize = 1024;
      const testLastModified = new Date();
      
      // Mock PUT response
      mockSend.mockResolvedValueOnce({
        ETag: `"${testEtag}"`,
        VersionId: testVersionId,
      });
      
      // Mock HEAD response
      mockSend.mockResolvedValueOnce({
        ContentLength: testSize,
        ETag: `"${testEtag}"`,
        VersionId: testVersionId,
        ContentType: 'application/json',
        Metadata: {},
        LastModified: testLastModified,
      });
      
      const result = await client.putWriteOnce({
        key: testKey,
        body: Buffer.from('{}'),
        contentType: 'application/json',
      });
      
      expect(result.verified).toBe(true);
      expect(result.etag).toBe(testEtag);
      expect(result.versionId).toBe(testVersionId);
      expect(result.headVerification.etag).toBe(testEtag);
      expect(result.headVerification.versionId).toBe(testVersionId);
      expect(result.headVerification.size).toBe(testSize);
      expect(result.headVerification.lastModified).toEqual(testLastModified);
    });
    
    it('should succeed without versionId when versioning is disabled', async () => {
      const testKey = 'test-key';
      const testEtag = 'abc123';
      
      // Mock PUT response (no versionId)
      mockSend.mockResolvedValueOnce({
        ETag: `"${testEtag}"`,
      });
      
      // Mock HEAD response (no versionId)
      mockSend.mockResolvedValueOnce({
        ContentLength: 100,
        ETag: `"${testEtag}"`,
        ContentType: 'application/json',
        Metadata: {},
        LastModified: new Date(),
      });
      
      const result = await client.putWriteOnce({
        key: testKey,
        body: Buffer.from('{}'),
        contentType: 'application/json',
      });
      
      expect(result.verified).toBe(true);
      expect(result.versionId).toBeUndefined();
    });
    
    it('should pass metadata and tags to PUT', async () => {
      const testKey = 'test-key';
      const testEtag = 'abc123';
      const testMetadata = { 'x-custom': 'value' };
      const testTags = { retention: 'standard' };
      
      mockSend.mockResolvedValueOnce({ ETag: `"${testEtag}"` });
      mockSend.mockResolvedValueOnce({
        ContentLength: 100,
        ETag: `"${testEtag}"`,
        ContentType: 'application/json',
        Metadata: {},
        LastModified: new Date(),
      });
      
      await client.putWriteOnce({
        key: testKey,
        body: Buffer.from('{}'),
        contentType: 'application/json',
        metadata: testMetadata,
        tags: testTags,
      });
      
      // Verify PUT was called with correct parameters
      const putCall = mockSend.mock.calls[0][0];
      expect(putCall.input.Metadata).toEqual(testMetadata);
      expect(putCall.input.Tagging).toBe('retention=standard');
      expect(putCall.input.IfNoneMatch).toBe('*');
    });
  });
  
  // ==========================================================================
  // 412 Precondition Failed Tests
  // ==========================================================================
  
  describe('putWriteOnce - 412 Precondition Failed', () => {
    it('should throw ObjectAlreadyExistsError on 412', async () => {
      const testKey = 'existing-key';
      
      // Mock 412 response
      const error = new Error('Precondition Failed');
      (error as unknown as { name: string; $metadata: { httpStatusCode: number } }).name = 'PreconditionFailed';
      (error as unknown as { $metadata: { httpStatusCode: number } }).$metadata = { httpStatusCode: 412 };
      mockSend.mockRejectedValueOnce(error);
      
      await expect(
        client.putWriteOnce({
          key: testKey,
          body: Buffer.from('{}'),
          contentType: 'application/json',
        })
      ).rejects.toThrow(ObjectAlreadyExistsError);
    });
    
    it('should include key in ObjectAlreadyExistsError', async () => {
      const testKey = 'existing-key';
      
      const error = new Error('Precondition Failed');
      (error as unknown as { $metadata: { httpStatusCode: number } }).$metadata = { httpStatusCode: 412 };
      mockSend.mockRejectedValueOnce(error);
      
      try {
        await client.putWriteOnce({
          key: testKey,
          body: Buffer.from('{}'),
          contentType: 'application/json',
        });
        fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ObjectAlreadyExistsError);
        expect((e as ObjectAlreadyExistsError).message).toContain(testKey);
      }
    });
  });
  
  // ==========================================================================
  // HEAD Verification Failure Tests
  // ==========================================================================
  
  describe('putWriteOnce - HEAD Verification Failures', () => {
    it('should throw WriteOnceViolationError when HEAD returns 404', async () => {
      const testKey = 'disappearing-key';
      
      // Mock successful PUT
      mockSend.mockResolvedValueOnce({
        ETag: '"abc123"',
      });
      
      // Mock HEAD 404
      const notFoundError = new Error('Not Found');
      (notFoundError as unknown as { name: string; $metadata: { httpStatusCode: number } }).name = 'NotFound';
      (notFoundError as unknown as { $metadata: { httpStatusCode: number } }).$metadata = { httpStatusCode: 404 };
      mockSend.mockRejectedValueOnce(notFoundError);
      
      try {
        await client.putWriteOnce({
          key: testKey,
          body: Buffer.from('{}'),
          contentType: 'application/json',
        });
        fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(WriteOnceViolationError);
        expect((e as WriteOnceViolationError).reason).toBe('HEAD_AFTER_PUT_NOT_FOUND');
      }
    });
    
    it('should throw WriteOnceViolationError when HEAD returns empty etag', async () => {
      const testKey = 'no-etag-key';
      
      // Mock successful PUT
      mockSend.mockResolvedValueOnce({
        ETag: '"abc123"',
      });
      
      // Mock HEAD with empty etag
      mockSend.mockResolvedValueOnce({
        ContentLength: 100,
        ETag: '',
        ContentType: 'application/json',
        Metadata: {},
        LastModified: new Date(),
      });
      
      try {
        await client.putWriteOnce({
          key: testKey,
          body: Buffer.from('{}'),
          contentType: 'application/json',
        });
        fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(WriteOnceViolationError);
        expect((e as WriteOnceViolationError).reason).toBe('HEAD_ETAG_MISSING');
      }
    });
    
    it('should throw WriteOnceViolationError when HEAD returns no etag', async () => {
      const testKey = 'missing-etag-key';
      
      // Mock successful PUT
      mockSend.mockResolvedValueOnce({
        ETag: '"abc123"',
      });
      
      // Mock HEAD with undefined etag
      mockSend.mockResolvedValueOnce({
        ContentLength: 100,
        ContentType: 'application/json',
        Metadata: {},
        LastModified: new Date(),
      });
      
      try {
        await client.putWriteOnce({
          key: testKey,
          body: Buffer.from('{}'),
          contentType: 'application/json',
        });
        fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(WriteOnceViolationError);
        expect((e as WriteOnceViolationError).reason).toBe('HEAD_ETAG_MISSING');
      }
    });
    
    it('should throw WriteOnceViolationError when etag mismatch', async () => {
      const testKey = 'etag-mismatch-key';
      const putEtag = 'abc123';
      const headEtag = 'xyz789';
      
      // Mock successful PUT
      mockSend.mockResolvedValueOnce({
        ETag: `"${putEtag}"`,
      });
      
      // Mock HEAD with different etag
      mockSend.mockResolvedValueOnce({
        ContentLength: 100,
        ETag: `"${headEtag}"`,
        ContentType: 'application/json',
        Metadata: {},
        LastModified: new Date(),
      });
      
      try {
        await client.putWriteOnce({
          key: testKey,
          body: Buffer.from('{}'),
          contentType: 'application/json',
        });
        fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(WriteOnceViolationError);
        expect((e as WriteOnceViolationError).reason).toBe('ETAG_MISMATCH_AFTER_PUT');
        expect((e as WriteOnceViolationError).details?.expectedEtag).toBe(putEtag);
        expect((e as WriteOnceViolationError).details?.actualEtag).toBe(headEtag);
      }
    });
    
    it('should throw WriteOnceViolationError when versionId mismatch', async () => {
      const testKey = 'version-mismatch-key';
      const testEtag = 'abc123';
      const putVersionId = 'v1';
      const headVersionId = 'v2';
      
      // Mock successful PUT with versionId
      mockSend.mockResolvedValueOnce({
        ETag: `"${testEtag}"`,
        VersionId: putVersionId,
      });
      
      // Mock HEAD with different versionId
      mockSend.mockResolvedValueOnce({
        ContentLength: 100,
        ETag: `"${testEtag}"`,
        VersionId: headVersionId,
        ContentType: 'application/json',
        Metadata: {},
        LastModified: new Date(),
      });
      
      try {
        await client.putWriteOnce({
          key: testKey,
          body: Buffer.from('{}'),
          contentType: 'application/json',
        });
        fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(WriteOnceViolationError);
        expect((e as WriteOnceViolationError).reason).toBe('VERSION_ID_MISMATCH_AFTER_PUT');
        expect((e as WriteOnceViolationError).details?.expectedVersionId).toBe(putVersionId);
        expect((e as WriteOnceViolationError).details?.actualVersionId).toBe(headVersionId);
      }
    });
  });
  
  // ==========================================================================
  // If-None-Match Header Tests
  // ==========================================================================
  
  describe('putWriteOnce - If-None-Match Header', () => {
    it('should always set If-None-Match: * header', async () => {
      const testKey = 'test-key';
      const testEtag = 'abc123';
      
      mockSend.mockResolvedValueOnce({ ETag: `"${testEtag}"` });
      mockSend.mockResolvedValueOnce({
        ContentLength: 100,
        ETag: `"${testEtag}"`,
        ContentType: 'application/json',
        Metadata: {},
        LastModified: new Date(),
      });
      
      await client.putWriteOnce({
        key: testKey,
        body: Buffer.from('{}'),
        contentType: 'application/json',
      });
      
      // Verify If-None-Match was set
      const putCall = mockSend.mock.calls[0][0];
      expect(putCall.input.IfNoneMatch).toBe('*');
    });
  });
  
  // ==========================================================================
  // Error Type Tests
  // ==========================================================================
  
  describe('WriteOnceViolationError', () => {
    it('should have correct error properties', () => {
      const error = new WriteOnceViolationError('test-key', 'ETAG_MISMATCH_AFTER_PUT', {
        expectedEtag: 'abc',
        actualEtag: 'xyz',
      });
      
      expect(error.name).toBe('WriteOnceViolationError');
      expect(error.code).toBe('WRITE_ONCE_VIOLATION');
      expect(error.reason).toBe('ETAG_MISMATCH_AFTER_PUT');
      expect(error.details?.expectedEtag).toBe('abc');
      expect(error.details?.actualEtag).toBe('xyz');
      expect(error.message).toContain('test-key');
      expect(error.message).toContain('ETAG_MISMATCH_AFTER_PUT');
    });
    
    it('should work without details', () => {
      const error = new WriteOnceViolationError('test-key', 'HEAD_AFTER_PUT_NOT_FOUND');
      
      expect(error.details).toBeUndefined();
      expect(error.reason).toBe('HEAD_AFTER_PUT_NOT_FOUND');
    });
  });
  
  // ==========================================================================
  // putObject vs putWriteOnce Distinction
  // ==========================================================================
  
  describe('putObject vs putWriteOnce', () => {
    it('putObject should not perform HEAD verification', async () => {
      const testKey = 'test-key';
      
      mockSend.mockResolvedValueOnce({
        ETag: '"abc123"',
      });
      
      await client.putObject({
        key: testKey,
        body: Buffer.from('{}'),
        contentType: 'application/json',
      });
      
      // Only PUT should be called, not HEAD
      expect(mockSend).toHaveBeenCalledTimes(1);
    });
    
    it('putWriteOnce should always perform HEAD verification', async () => {
      const testKey = 'test-key';
      const testEtag = 'abc123';
      
      mockSend.mockResolvedValueOnce({ ETag: `"${testEtag}"` });
      mockSend.mockResolvedValueOnce({
        ContentLength: 100,
        ETag: `"${testEtag}"`,
        ContentType: 'application/json',
        Metadata: {},
        LastModified: new Date(),
      });
      
      await client.putWriteOnce({
        key: testKey,
        body: Buffer.from('{}'),
        contentType: 'application/json',
      });
      
      // Both PUT and HEAD should be called
      expect(mockSend).toHaveBeenCalledTimes(2);
    });
    
    it('putObject with ifNoneMatch=false should not set header', async () => {
      const testKey = 'test-key';
      
      mockSend.mockResolvedValueOnce({
        ETag: '"abc123"',
      });
      
      await client.putObject({
        key: testKey,
        body: Buffer.from('{}'),
        contentType: 'application/json',
        ifNoneMatch: false,
      });
      
      const putCall = mockSend.mock.calls[0][0];
      expect(putCall.input.IfNoneMatch).toBeUndefined();
    });
  });
});
