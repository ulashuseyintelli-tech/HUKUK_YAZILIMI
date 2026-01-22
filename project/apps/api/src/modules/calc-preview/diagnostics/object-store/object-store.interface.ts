/**
 * Object Store Interface
 * 
 * Phase 9C - Task 0: Foundation Gates
 * 
 * Vendor-agnostic interface for S3/MinIO operations.
 * Domain code depends on this interface, not AWS SDK directly.
 * 
 * @see .kiro/specs/phase-9c-object-storage-migration/PHASE-9C-IMPLEMENTATION-CHECKLIST.md
 */

import { Readable } from 'stream';

// ============================================================================
// Injection Token
// ============================================================================

export const OBJECT_STORE_CLIENT = Symbol('OBJECT_STORE_CLIENT');

// ============================================================================
// Types
// ============================================================================

/**
 * Input for putObject operation
 */
export interface PutObjectInput {
  /** S3 object key */
  key: string;
  
  /** Object content */
  body: Buffer | Readable | string;
  
  /** MIME content type */
  contentType: string;
  
  /** Custom metadata (x-amz-meta-*) */
  metadata?: Record<string, string>;
  
  /** Object tags for lifecycle rules */
  tags?: Record<string, string>;
  
  /** 
   * Conditional write: only succeed if object doesn't exist
   * Uses If-None-Match: * header
   */
  ifNoneMatch?: boolean;
}

/**
 * Result of putObject operation
 */
export interface PutObjectResult {
  /** S3 ETag (MD5 hash for non-multipart) */
  etag: string;
  
  /** Version ID (if versioning enabled) */
  versionId?: string | undefined;
}

/**
 * Result of headObject operation
 */
export interface HeadObjectResult {
  /** Object exists */
  exists: true;
  
  /** Object size in bytes */
  size: number;
  
  /** S3 ETag */
  etag: string;
  
  /** Version ID (if versioning enabled) */
  versionId?: string | undefined;
  
  /** Content type */
  contentType: string;
  
  /** Custom metadata */
  metadata: Record<string, string>;
  
  /** Last modified timestamp */
  lastModified: Date;
}

/**
 * Result when object doesn't exist
 */
export interface HeadObjectNotFound {
  exists: false;
}

/**
 * Result of getObject operation
 */
export interface GetObjectResult {
  /** Object content as Buffer */
  body: Buffer;
  
  /** Content type */
  contentType: string;
  
  /** S3 ETag */
  etag: string;
  
  /** Custom metadata */
  metadata: Record<string, string>;
}

/**
 * Result of deleteObjects operation
 */
export interface DeleteObjectsResult {
  /** Successfully deleted keys */
  deleted: string[];
  
  /** Failed deletions */
  errors: Array<{
    key: string;
    code: string;
    message: string;
  }>;
}

// ============================================================================
// Interface
// ============================================================================

/**
 * Result of putWriteOnce operation
 * 
 * Extends PutObjectResult with HEAD verification data.
 */
export interface PutWriteOnceResult extends PutObjectResult {
  /** Verified: HEAD returned same etag as PUT */
  verified: true;
  
  /** HEAD response data for forensics */
  headVerification: {
    etag: string;
    versionId?: string;
    size: number;
    lastModified: Date;
  };
}

/**
 * Object store client interface
 * 
 * Abstracts S3/MinIO operations for evidence bundle storage.
 * Implementations must handle retries and error mapping.
 */
export interface IObjectStoreClient {
  /**
   * Upload object to S3 (general purpose)
   * 
   * NOTE: For write-once semantics, use putWriteOnce() instead.
   * 
   * @param input Upload parameters
   * @returns Upload result with etag
   * @throws ObjectStoreError on failure
   * @throws ObjectAlreadyExistsError if ifNoneMatch=true and object exists
   */
  putObject(input: PutObjectInput): Promise<PutObjectResult>;
  
  /**
   * Upload object with write-once guarantee
   * 
   * This method enforces write-once semantics:
   * 1. PUT with If-None-Match: * header
   * 2. HEAD verification after PUT
   * 3. ETag/VersionId consistency check
   * 
   * USE THIS FOR:
   * - Manifest uploads (REQUIRED)
   * - Item uploads (RECOMMENDED)
   * 
   * @param input Upload parameters (ifNoneMatch is forced to true)
   * @returns Upload result with HEAD verification data
   * @throws ObjectAlreadyExistsError if object already exists (412)
   * @throws WriteOnceViolationError if HEAD verification fails
   * @throws ObjectStoreError on other failures
   */
  putWriteOnce(input: Omit<PutObjectInput, 'ifNoneMatch'>): Promise<PutWriteOnceResult>;
  
  /**
   * Check if object exists and get metadata
   * 
   * @param key S3 object key
   * @returns Object metadata or { exists: false }
   * @throws ObjectStoreError on failure (not for 404)
   */
  headObject(key: string): Promise<HeadObjectResult | HeadObjectNotFound>;
  
  /**
   * Download object content
   * 
   * @param key S3 object key
   * @returns Object content and metadata
   * @throws ObjectNotFoundError if object doesn't exist
   * @throws ObjectStoreError on failure
   */
  getObject(key: string): Promise<GetObjectResult>;
  
  /**
   * Get object as readable stream (for large objects)
   * 
   * @param key S3 object key
   * @returns Readable stream
   * @throws ObjectNotFoundError if object doesn't exist
   * @throws ObjectStoreError on failure
   */
  getObjectStream(key: string): Promise<Readable>;
  
  /**
   * Update object tags
   * 
   * @param key S3 object key
   * @param tags New tags (replaces existing)
   * @throws ObjectNotFoundError if object doesn't exist
   * @throws ObjectStoreError on failure
   */
  putObjectTagging(key: string, tags: Record<string, string>): Promise<void>;
  
  /**
   * Delete single object
   * 
   * @param key S3 object key
   * @throws ObjectStoreError on failure (not for 404)
   */
  deleteObject(key: string): Promise<void>;
  
  /**
   * Delete multiple objects
   * 
   * @param keys S3 object keys
   * @returns Deletion results
   * @throws ObjectStoreError on failure
   */
  deleteObjects(keys: string[]): Promise<DeleteObjectsResult>;
}

// ============================================================================
// Errors
// ============================================================================

/**
 * Base error for object store operations
 */
export class ObjectStoreError extends Error {
  readonly code: string;
  
  constructor(
    message: string,
    code: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = 'ObjectStoreError';
    this.code = code;
  }
}

/**
 * Object not found (404)
 */
export class ObjectNotFoundError extends ObjectStoreError {
  constructor(key: string) {
    super(`Object not found: ${key}`, 'OBJECT_NOT_FOUND');
    this.name = 'ObjectNotFoundError';
  }
}

/**
 * Object already exists (412 Precondition Failed)
 * 
 * Thrown when ifNoneMatch=true and object exists.
 */
export class ObjectAlreadyExistsError extends ObjectStoreError {
  constructor(
    key: string,
    public readonly existingEtag?: string,
  ) {
    super(
      `Object already exists: ${key}. Use headObject to verify content.`,
      'OBJECT_ALREADY_EXISTS',
    );
    this.name = 'ObjectAlreadyExistsError';
  }
}

/**
 * Access denied (403)
 */
export class ObjectStoreAccessDeniedError extends ObjectStoreError {
  constructor(operation: string, key: string) {
    super(
      `Access denied for ${operation} on ${key}. Check S3 credentials and bucket policy.`,
      'ACCESS_DENIED',
    );
    this.name = 'ObjectStoreAccessDeniedError';
  }
}

/**
 * Connection/network error
 */
export class ObjectStoreConnectionError extends ObjectStoreError {
  constructor(message: string, cause?: Error) {
    super(message, 'CONNECTION_ERROR', cause);
    this.name = 'ObjectStoreConnectionError';
  }
}

/**
 * Write-once violation detected
 * 
 * Thrown when:
 * - If-None-Match header was bypassed (suspected overwrite)
 * - HEAD after PUT shows unexpected etag/versionId
 * - HEAD after PUT returns 404 (object disappeared)
 * 
 * This is a CRITICAL error indicating potential data integrity issue.
 */
export class WriteOnceViolationError extends ObjectStoreError {
  constructor(
    key: string,
    public readonly reason: WriteOnceViolationReason,
    public readonly details?: {
      expectedEtag?: string;
      actualEtag?: string;
      expectedVersionId?: string;
      actualVersionId?: string;
    },
  ) {
    super(
      `Write-once violation for ${key}: ${reason}`,
      'WRITE_ONCE_VIOLATION',
    );
    this.name = 'WriteOnceViolationError';
  }
}

/**
 * Reasons for write-once violation
 */
export type WriteOnceViolationReason =
  | 'HEAD_AFTER_PUT_NOT_FOUND'      // Object disappeared after PUT
  | 'HEAD_ETAG_MISSING'             // HEAD returned but no etag
  | 'ETAG_MISMATCH_AFTER_PUT'       // PUT etag != HEAD etag
  | 'VERSION_ID_MISMATCH_AFTER_PUT' // PUT versionId != HEAD versionId
  | 'SUSPECTED_OVERWRITE';          // Generic overwrite suspicion

/**
 * Invalid object key error
 * 
 * Thrown when key segment validation fails:
 * - Path traversal attempt (.., //)
 * - Invalid characters
 * - Empty or whitespace
 * - URL-encoded attacks (%2f, %5c)
 */
export class InvalidObjectKeyError extends ObjectStoreError {
  constructor(
    message: string,
    public readonly fieldName: string,
    public readonly validationCode: InvalidKeyValidationCode,
  ) {
    super(message, 'INVALID_OBJECT_KEY');
    this.name = 'InvalidObjectKeyError';
  }
}

/**
 * Validation codes for invalid key errors
 */
export type InvalidKeyValidationCode =
  | 'SEGMENT_REQUIRED'
  | 'SEGMENT_TYPE_INVALID'
  | 'SEGMENT_EMPTY'
  | 'SEGMENT_WHITESPACE'
  | 'SEGMENT_TOO_LONG'
  | 'SEGMENT_UNSAFE_PATTERN'
  | 'SEGMENT_INVALID_CHARS'
  | 'INVALID_ITEM_TYPE';
