/**
 * Scripted Fake Object Store
 * 
 * Phase 10.1.6 - Integration Test Infrastructure
 * 
 * In-memory fake object store with scripted responses for testing
 * the manifest retry worker without requiring MinIO container.
 * 
 * Supports modes:
 * - success: Normal successful write
 * - already_exists: 412 Precondition Failed (idempotent)
 * - timeout: AbortError (simulates 30s timeout)
 * - 503: Service Unavailable (retryable)
 * - 403: Access Denied (non-retryable → DLQ)
 * - slow_success: 25s delay then success (tests timeout boundary)
 * - connection_reset: ECONNRESET (retryable)
 * - dns_failure: ENOTFOUND (retryable)
 * 
 * @see PHASE-10-WORKER-ARCHITECTURE.md Section 13.2
 */

import { Readable } from 'stream';
import type {
  IObjectStoreClient,
  PutObjectInput,
  PutObjectResult,
  PutWriteOnceResult,
  HeadObjectResult,
  HeadObjectNotFound,
  GetObjectResult,
  DeleteObjectsResult,
} from '../../object-store.interface';
import {
  ObjectStoreError,
  ObjectNotFoundError,
  ObjectAlreadyExistsError,
  ObjectStoreAccessDeniedError,
  ObjectStoreConnectionError,
} from '../../object-store.interface';

// ============================================================================
// Types
// ============================================================================

export type FakeStoreMode =
  | 'success'
  | 'already_exists'
  | 'timeout'
  | '503'
  | '403'
  | 'slow_success'
  | 'connection_reset'
  | 'dns_failure';

export interface ScriptedResponse {
  mode: FakeStoreMode;
  /** Delay in ms before responding (for slow_success) */
  delayMs?: number;
}

export interface FakeStoreStats {
  putCalls: number;
  getCalls: number;
  headCalls: number;
  deleteCalls: number;
}

// ============================================================================
// Errors
// ============================================================================

class FakeAbortError extends Error {
  constructor() {
    super('Operation aborted');
    this.name = 'AbortError';
  }
}

class FakeServiceUnavailableError extends ObjectStoreError {
  constructor() {
    super('Service Unavailable', 'ServiceUnavailable');
    (this as any).$metadata = { httpStatusCode: 503 };
  }
}

class FakeConnectionResetError extends ObjectStoreConnectionError {
  constructor() {
    super('Connection reset by peer');
    (this as any).code = 'ECONNRESET';
  }
}

class FakeDnsError extends ObjectStoreConnectionError {
  constructor() {
    super('getaddrinfo ENOTFOUND fake-bucket.s3.amazonaws.com');
    (this as any).code = 'ENOTFOUND';
  }
}

// ============================================================================
// Implementation
// ============================================================================

export class ScriptedFakeObjectStore implements IObjectStoreClient {
  private responses: ScriptedResponse[] = [];
  private responseIndex = 0;
  private readonly storage = new Map<string, Buffer>();
  private readonly metadata = new Map<string, Record<string, string>>();
  
  public stats: FakeStoreStats = {
    putCalls: 0,
    getCalls: 0,
    headCalls: 0,
    deleteCalls: 0,
  };

  // ==========================================================================
  // Configuration
  // ==========================================================================

  /**
   * Set a single response for the next call
   */
  setNextResponse(response: ScriptedResponse): void {
    this.responses = [response];
    this.responseIndex = 0;
  }

  /**
   * Set multiple responses for sequential calls
   */
  setResponses(responses: ScriptedResponse[]): void {
    this.responses = responses;
    this.responseIndex = 0;
  }

  /**
   * Reset to default (success) mode
   */
  reset(): void {
    this.responses = [];
    this.responseIndex = 0;
    this.storage.clear();
    this.metadata.clear();
    this.stats = {
      putCalls: 0,
      getCalls: 0,
      headCalls: 0,
      deleteCalls: 0,
    };
  }

  /**
   * Pre-populate storage with existing object
   */
  prePopulate(key: string, content: Buffer, meta?: Record<string, string>): void {
    this.storage.set(key, content);
    if (meta) {
      this.metadata.set(key, meta);
    }
  }

  /**
   * Check if object exists in storage
   */
  hasObject(key: string): boolean {
    return this.storage.has(key);
  }

  /**
   * Get stored object content
   */
  getStoredContent(key: string): Buffer | undefined {
    return this.storage.get(key);
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private getNextResponse(): ScriptedResponse {
    if (this.responses.length === 0) {
      return { mode: 'success' };
    }
    
    const response = this.responses[this.responseIndex];
    
    // Advance index, but stay at last response if exhausted
    if (this.responseIndex < this.responses.length - 1) {
      this.responseIndex++;
    }
    
    return response;
  }

  private async applyResponse(response: ScriptedResponse, key: string): Promise<void> {
    // Apply delay if specified
    if (response.delayMs && response.delayMs > 0) {
      await this.sleep(response.delayMs);
    }

    switch (response.mode) {
      case 'success':
        // No error, continue
        break;
        
      case 'already_exists':
        throw new ObjectAlreadyExistsError(key);
        
      case 'timeout':
        throw new FakeAbortError();
        
      case '503':
        throw new FakeServiceUnavailableError();
        
      case '403':
        throw new ObjectStoreAccessDeniedError('putObject', key);
        
      case 'slow_success':
        // Delay already applied, continue with success
        break;
        
      case 'connection_reset':
        throw new FakeConnectionResetError();
        
      case 'dns_failure':
        throw new FakeDnsError();
        
      default:
        throw new Error(`Unknown fake store mode: ${response.mode}`);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private generateEtag(): string {
    return Math.random().toString(36).substring(2, 15);
  }

  // ==========================================================================
  // IObjectStoreClient Implementation
  // ==========================================================================

  async putObject(input: PutObjectInput): Promise<PutObjectResult> {
    this.stats.putCalls++;
    const response = this.getNextResponse();
    
    // Check abort signal (from extended input)
    const signal = (input as any).signal as AbortSignal | undefined;
    if (signal?.aborted) {
      throw new FakeAbortError();
    }
    
    await this.applyResponse(response, input.key);
    
    // Store the object
    const content = typeof input.body === 'string' 
      ? Buffer.from(input.body) 
      : Buffer.isBuffer(input.body)
        ? input.body 
        : await this.streamToBuffer(input.body as Readable);
    
    this.storage.set(input.key, content);
    if (input.metadata) {
      this.metadata.set(input.key, input.metadata);
    }
    
    const etag = this.generateEtag();
    
    return {
      etag,
      versionId: undefined,
    };
  }

  async putWriteOnce(input: Omit<PutObjectInput, 'ifNoneMatch'>): Promise<PutWriteOnceResult> {
    this.stats.putCalls++;
    const response = this.getNextResponse();
    
    // Check abort signal (from extended input)
    const signal = (input as any).signal as AbortSignal | undefined;
    if (signal?.aborted) {
      throw new FakeAbortError();
    }
    
    // Check if already exists (before applying response)
    if (this.storage.has(input.key) && response.mode !== 'already_exists') {
      throw new ObjectAlreadyExistsError(input.key);
    }
    
    await this.applyResponse(response, input.key);
    
    // Store the object
    const content = typeof input.body === 'string' 
      ? Buffer.from(input.body) 
      : Buffer.isBuffer(input.body)
        ? input.body 
        : await this.streamToBuffer(input.body as Readable);
    
    this.storage.set(input.key, content);
    if (input.metadata) {
      this.metadata.set(input.key, input.metadata);
    }
    
    const etag = this.generateEtag();
    const now = new Date();
    
    return {
      etag,
      versionId: undefined,
      verified: true,
      headVerification: {
        etag,
        versionId: undefined,
        size: content.length,
        lastModified: now,
      },
    };
  }

  async headObject(key: string): Promise<HeadObjectResult | HeadObjectNotFound> {
    this.stats.headCalls++;
    
    if (!this.storage.has(key)) {
      return { exists: false };
    }
    
    const content = this.storage.get(key)!;
    const meta = this.metadata.get(key) ?? {};
    
    return {
      exists: true,
      size: content.length,
      etag: this.generateEtag(),
      versionId: undefined,
      contentType: 'application/json',
      metadata: meta,
      lastModified: new Date(),
    };
  }

  async getObject(key: string): Promise<GetObjectResult> {
    this.stats.getCalls++;
    
    if (!this.storage.has(key)) {
      throw new ObjectNotFoundError(key);
    }
    
    const content = this.storage.get(key)!;
    const meta = this.metadata.get(key) ?? {};
    
    return {
      body: content,
      contentType: 'application/json',
      etag: this.generateEtag(),
      metadata: meta,
    };
  }

  async getObjectStream(key: string): Promise<Readable> {
    const result = await this.getObject(key);
    return Readable.from(result.body);
  }

  async putObjectTagging(_key: string, _tags: Record<string, string>): Promise<void> {
    // No-op for tests
  }

  async deleteObject(key: string): Promise<void> {
    this.stats.deleteCalls++;
    this.storage.delete(key);
    this.metadata.delete(key);
  }

  async deleteObjects(keys: string[]): Promise<DeleteObjectsResult> {
    this.stats.deleteCalls++;
    
    const deleted: string[] = [];
    for (const key of keys) {
      this.storage.delete(key);
      this.metadata.delete(key);
      deleted.push(key);
    }
    
    return { deleted, errors: [] };
  }

  private async streamToBuffer(stream: Readable): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
}
