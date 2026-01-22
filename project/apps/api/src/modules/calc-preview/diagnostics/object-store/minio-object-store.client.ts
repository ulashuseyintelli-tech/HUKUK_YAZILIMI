/**
 * MinIO/S3 Object Store Client
 * 
 * Phase 9C - Task 0: Foundation Gates
 * 
 * AWS SDK v3 implementation of IObjectStoreClient.
 * Compatible with MinIO and AWS S3.
 * 
 * NOTE: Requires @aws-sdk/client-s3 package.
 * Install with: pnpm add @aws-sdk/client-s3
 * 
 * @see .kiro/specs/phase-9c-object-storage-migration/PHASE-9C-IMPLEMENTATION-CHECKLIST.md
 */

import { Injectable, Logger } from '@nestjs/common';
// AWS SDK v3 - install with: pnpm add @aws-sdk/client-s3
// eslint-disable-next-line @typescript-eslint/no-require-imports
import type {
  S3Client as S3ClientType,
  PutObjectCommandOutput,
  HeadObjectCommandOutput,
  GetObjectCommandOutput,
  DeleteObjectsCommandOutput,
} from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { ObjectStoreConfig } from './object-store.config';
import {
  IObjectStoreClient,
  PutObjectInput,
  PutObjectResult,
  PutWriteOnceResult,
  HeadObjectResult,
  HeadObjectNotFound,
  GetObjectResult,
  DeleteObjectsResult,
  ObjectStoreError,
  ObjectNotFoundError,
  ObjectAlreadyExistsError,
  ObjectStoreAccessDeniedError,
  ObjectStoreConnectionError,
  WriteOnceViolationError,
} from './object-store.interface';

// ============================================================================
// Dynamic Import Helper (AWS SDK v3)
// ============================================================================

let s3Module: typeof import('@aws-sdk/client-s3') | null = null;

async function getS3Module(): Promise<typeof import('@aws-sdk/client-s3')> {
  if (!s3Module) {
    s3Module = await import('@aws-sdk/client-s3');
  }
  return s3Module;
}

// ============================================================================
// Implementation
// ============================================================================

@Injectable()
export class MinioObjectStoreClient implements IObjectStoreClient {
  private readonly logger = new Logger(MinioObjectStoreClient.name);
  private s3: S3ClientType | null = null;
  private readonly bucket: string;
  private readonly configData: ObjectStoreConfig;
  private initPromise: Promise<void> | null = null;

  constructor(config: ObjectStoreConfig) {
    this.bucket = config.bucket;
    this.configData = config;
    
    this.logger.log(`[MinioObjectStoreClient] Initialized for bucket=${config.bucket}`);
  }

  /**
   * Lazy initialization of S3 client
   */
  private async ensureInitialized(): Promise<S3ClientType> {
    if (this.s3) {
      return this.s3;
    }
    
    if (!this.initPromise) {
      this.initPromise = this.initializeClient();
    }
    
    await this.initPromise;
    return this.s3!;
  }

  private async initializeClient(): Promise<void> {
    const { S3Client } = await getS3Module();
    
    this.s3 = new S3Client({
      endpoint: this.configData.endpoint,
      region: this.configData.region,
      credentials: {
        accessKeyId: this.configData.accessKeyId,
        secretAccessKey: this.configData.secretAccessKey,
      },
      forcePathStyle: this.configData.forcePathStyle,
      // TLS configuration for local MinIO
      ...(this.configData.tlsInsecure && {
        tls: false,
      }),
    });
    
    this.logger.log(`[MinioObjectStoreClient] S3 client initialized`);
  }

  // ==========================================================================
  // Write Operations
  // ==========================================================================

  async putObject(input: PutObjectInput): Promise<PutObjectResult> {
    const { key, body, contentType, metadata, tags, ifNoneMatch } = input;
    const s3 = await this.ensureInitialized();
    const { PutObjectCommand } = await getS3Module();
    
    try {
      // Build metadata headers
      const s3Metadata: Record<string, string> = {};
      if (metadata) {
        for (const [k, v] of Object.entries(metadata)) {
          s3Metadata[k] = v;
        }
      }
      
      // Build tagging string
      let tagging: string | undefined;
      if (tags && Object.keys(tags).length > 0) {
        tagging = Object.entries(tags)
          .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
          .join('&');
      }
      
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        Metadata: Object.keys(s3Metadata).length > 0 ? s3Metadata : undefined,
        Tagging: tagging,
        // Conditional write: fail if object exists
        ...(ifNoneMatch && { IfNoneMatch: '*' }),
      });
      
      const response: PutObjectCommandOutput = await s3.send(command);
      
      this.logger.debug(`[MinioObjectStoreClient] PUT ${key} success`, {
        etag: response.ETag,
        versionId: response.VersionId,
      });
      
      return {
        etag: response.ETag?.replace(/"/g, '') ?? '',
        versionId: response.VersionId,
      };
    } catch (error) {
      throw this.mapError(error, 'putObject', key);
    }
  }

  async putObjectTagging(key: string, tags: Record<string, string>): Promise<void> {
    const s3 = await this.ensureInitialized();
    const { PutObjectTaggingCommand } = await getS3Module();
    
    try {
      const tagSet = Object.entries(tags).map(([Key, Value]) => ({ Key, Value }));
      
      const command = new PutObjectTaggingCommand({
        Bucket: this.bucket,
        Key: key,
        Tagging: { TagSet: tagSet },
      });
      
      await s3.send(command);
      
      this.logger.debug(`[MinioObjectStoreClient] PUT tagging ${key} success`);
    } catch (error) {
      throw this.mapError(error, 'putObjectTagging', key);
    }
  }

  // ==========================================================================
  // Read Operations
  // ==========================================================================

  async headObject(key: string): Promise<HeadObjectResult | HeadObjectNotFound> {
    const s3 = await this.ensureInitialized();
    const { HeadObjectCommand } = await getS3Module();
    
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });
      
      const response: HeadObjectCommandOutput = await s3.send(command);
      
      return {
        exists: true,
        size: response.ContentLength ?? 0,
        etag: response.ETag?.replace(/"/g, '') ?? '',
        versionId: response.VersionId,
        contentType: response.ContentType ?? 'application/octet-stream',
        metadata: response.Metadata ?? {},
        lastModified: response.LastModified ?? new Date(),
      };
    } catch (error) {
      // 404 is expected - return not found
      if (this.isNotFoundError(error)) {
        return { exists: false };
      }
      throw this.mapError(error, 'headObject', key);
    }
  }

  async getObject(key: string): Promise<GetObjectResult> {
    const s3 = await this.ensureInitialized();
    const { GetObjectCommand } = await getS3Module();
    
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });
      
      const response: GetObjectCommandOutput = await s3.send(command);
      
      // Read body to buffer
      const body = await this.streamToBuffer(response.Body as Readable);
      
      return {
        body,
        contentType: response.ContentType ?? 'application/octet-stream',
        etag: response.ETag?.replace(/"/g, '') ?? '',
        metadata: response.Metadata ?? {},
      };
    } catch (error) {
      throw this.mapError(error, 'getObject', key);
    }
  }

  async getObjectStream(key: string): Promise<Readable> {
    const s3 = await this.ensureInitialized();
    const { GetObjectCommand } = await getS3Module();
    
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });
      
      const response: GetObjectCommandOutput = await s3.send(command);
      
      return response.Body as Readable;
    } catch (error) {
      throw this.mapError(error, 'getObjectStream', key);
    }
  }

  // ==========================================================================
  // Delete Operations
  // ==========================================================================

  async deleteObject(key: string): Promise<void> {
    const s3 = await this.ensureInitialized();
    const { DeleteObjectCommand } = await getS3Module();
    
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });
      
      await s3.send(command);
      
      this.logger.debug(`[MinioObjectStoreClient] DELETE ${key} success`);
    } catch (error) {
      // 404 is not an error for delete
      if (this.isNotFoundError(error)) {
        return;
      }
      throw this.mapError(error, 'deleteObject', key);
    }
  }

  async deleteObjects(keys: string[]): Promise<DeleteObjectsResult> {
    if (keys.length === 0) {
      return { deleted: [], errors: [] };
    }
    
    const s3 = await this.ensureInitialized();
    const { DeleteObjectsCommand } = await getS3Module();
    
    try {
      const command = new DeleteObjectsCommand({
        Bucket: this.bucket,
        Delete: {
          Objects: keys.map(Key => ({ Key })),
          Quiet: false,
        },
      });
      
      const response: DeleteObjectsCommandOutput = await s3.send(command);
      
      const deleted = (response.Deleted ?? []).map((d: { Key?: string }) => d.Key ?? '');
      const errors = (response.Errors ?? []).map((e: { Key?: string; Code?: string; Message?: string }) => ({
        key: e.Key ?? '',
        code: e.Code ?? 'UNKNOWN',
        message: e.Message ?? 'Unknown error',
      }));
      
      this.logger.debug(`[MinioObjectStoreClient] DELETE batch: ${deleted.length} deleted, ${errors.length} errors`);
      
      return { deleted, errors };
    } catch (error) {
      throw this.mapError(error, 'deleteObjects', keys.join(','));
    }
  }

  // ==========================================================================
  // Error Handling
  // ==========================================================================

  private isNotFoundError(error: unknown): boolean {
    if (error && typeof error === 'object' && 'name' in error) {
      const err = error as { name?: string; $metadata?: { httpStatusCode?: number } };
      return err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404;
    }
    return false;
  }

  private isS3ServiceException(error: unknown): error is { 
    name: string; 
    message: string;
    $metadata?: { httpStatusCode?: number };
  } {
    return (
      error !== null &&
      typeof error === 'object' &&
      'name' in error &&
      'message' in error
    );
  }

  private mapError(error: unknown, operation: string, key: string): never {
    // Log the error
    this.logger.error(`[MinioObjectStoreClient] ${operation} failed for ${key}`, {
      error: error instanceof Error ? error.message : String(error),
    });
    
    // S3 service exceptions
    if (this.isS3ServiceException(error)) {
      const statusCode = error.$metadata?.httpStatusCode;
      
      // 404 Not Found
      if (error.name === 'NotFound' || statusCode === 404) {
        throw new ObjectNotFoundError(key);
      }
      
      // 412 Precondition Failed (If-None-Match)
      if (statusCode === 412 || error.name === 'PreconditionFailed') {
        throw new ObjectAlreadyExistsError(key);
      }
      
      // 403 Access Denied
      if (error.name === 'AccessDenied' || statusCode === 403) {
        throw new ObjectStoreAccessDeniedError(operation, key);
      }
      
      // Other S3 errors
      throw new ObjectStoreError(
        `S3 ${operation} failed: ${error.message}`,
        error.name,
        error instanceof Error ? error : undefined,
      );
    }
    
    // Network/connection errors
    if (error instanceof Error) {
      if (error.message.includes('ECONNREFUSED') || 
          error.message.includes('ETIMEDOUT') ||
          error.message.includes('getaddrinfo')) {
        throw new ObjectStoreConnectionError(
          `Failed to connect to S3: ${error.message}`,
          error,
        );
      }
      
      throw new ObjectStoreError(
        `${operation} failed: ${error.message}`,
        'UNKNOWN_ERROR',
        error,
      );
    }
    
    // Unknown error
    throw new ObjectStoreError(
      `${operation} failed: ${String(error)}`,
      'UNKNOWN_ERROR',
    );
  }

  private async streamToBuffer(stream: Readable): Promise<Buffer> {
    const chunks: Buffer[] = [];
    
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    
    return Buffer.concat(chunks);
  }
}
