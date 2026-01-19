# Design Document: Sprint 9C Object Storage Migration

## Overview

Sprint 9C migrates the Infrastructure Layer from in-memory storage to S3/MinIO object storage. This layer handles large binary/JSON artifacts with lifecycle policies: evidence bundles and their retention management. The migration preserves the existing interface while adding S3 as the primary backend with a bounded retry queue for resilience.

### Risk Profile

**Cost/Scale** - Wrong implementation means burning money on storage or losing evidence. This layer has unique concerns:
1. Large objects (bundles can be MBs)
2. Cost implications of storage and transfer
3. Legal hold requirements for evidence preservation
4. Retention policies for cost control

### Migration Strategy

1. Implement S3 adapter with same interface as in-memory
2. Add retry queue for upload resilience
3. Configure lifecycle policies for retention
4. Run existing tests against MinIO
5. Deploy with feature flag, monitor costs

## Architecture

### Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Infrastructure Layer Services                         │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    IBundleRepository Interface                       │   │
│  │  (Same as current in-memory implementation)                          │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│              ┌─────────────────────┴─────────────────────┐                 │
│              ▼                                           ▼                  │
│  ┌─────────────────────┐                    ┌─────────────────────┐        │
│  │ S3BundleRepository  │                    │InMemoryBundleRepo   │        │
│  │ (Primary)           │                    │(Test only)          │        │
│  └──────────┬──────────┘                    └─────────────────────┘        │
│             │                                                               │
│  ┌──────────┴──────────────────────────────────────────────────────┐       │
│  │                                                                  │       │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │       │
│  │  │ S3Client        │  │ RetryQueue      │  │ RetentionManager│  │       │
│  │  │ (AWS SDK)       │  │ (Bounded: 100)  │  │ (Lifecycle)     │  │       │
│  │  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘  │       │
│  │           │                    │                    │           │       │
│  └───────────┼────────────────────┼────────────────────┼───────────┘       │
│              │                    │                    │                    │
└──────────────┼────────────────────┼────────────────────┼────────────────────┘
               │                    │                    │
               ▼                    ▼                    ▼
          ┌─────────┐         ┌──────────┐        ┌──────────────┐
          │ S3/MinIO│         │ In-Memory│        │ S3 Lifecycle │
          │ Bucket  │         │ Queue    │        │ Rules        │
          └─────────┘         └──────────┘        └──────────────┘
```

### Upload Flow with Retry Queue

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Bundle Upload Flow                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  exportBundle()                                                              │
│       │                                                                      │
│       ▼                                                                      │
│  ┌─────────────┐     Success     ┌─────────────┐                            │
│  │ Upload to   │────────────────►│ Return      │                            │
│  │ S3          │                 │ bundleId    │                            │
│  └──────┬──────┘                 └─────────────┘                            │
│         │                                                                    │
│         │ Failure                                                            │
│         ▼                                                                    │
│  ┌─────────────┐     Queue Full   ┌─────────────┐                           │
│  │ Add to      │─────────────────►│ Reject with │                           │
│  │ RetryQueue  │                  │ Error       │                           │
│  └──────┬──────┘                  └─────────────┘                           │
│         │                                                                    │
│         │ Queued                                                             │
│         ▼                                                                    │
│  ┌─────────────┐                                                            │
│  │ Return      │                                                            │
│  │ bundleId    │  (async retry in background)                               │
│  │ (pending)   │                                                            │
│  └─────────────┘                                                            │
│                                                                              │
│  Background Retry Worker:                                                    │
│  ┌─────────────┐     Success     ┌─────────────┐                            │
│  │ Process     │────────────────►│ Remove from │                            │
│  │ Queue Item  │                 │ Queue       │                            │
│  └──────┬──────┘                 └─────────────┘                            │
│         │                                                                    │
│         │ Failure (< 3 retries)                                             │
│         ▼                                                                    │
│  ┌─────────────┐                                                            │
│  │ Exponential │                                                            │
│  │ Backoff     │                                                            │
│  └─────────────┘                                                            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### IBundleRepository Interface

```typescript
/**
 * Bundle repository interface - same as current in-memory implementation
 * Both S3 and in-memory adapters implement this interface
 */
interface IBundleRepository {
  // Upload
  save(bundle: BundleData): Promise<BundleSaveResult>;
  
  // Retrieval
  findById(bundleId: string): Promise<Bundle | null>;
  getContent(bundleId: string): Promise<BundleContent | null>;
  generatePresignedUrl(bundleId: string, expirySeconds?: number): Promise<string>;
  
  // Verification
  verify(bundleId: string): Promise<BundleVerifyResult>;
  verifyBatch(bundleIds: string[]): Promise<BundleVerifyResult[]>;
  
  // Metadata
  findByIncidentId(incidentId: string): Promise<BundleMetadata[]>;
  findByTenantId(tenantId: string): Promise<BundleMetadata[]>;
}

interface BundleData {
  bundleId: string;
  tenantId: string;
  incidentId: string;
  runId: string;
  content: object; // JSON content
  createdAt: string;
}

interface BundleSaveResult {
  bundleId: string;
  contentHash: string;
  status: 'UPLOADED' | 'QUEUED';
}

interface Bundle {
  bundleId: string;
  tenantId: string;
  incidentId: string;
  runId: string;
  contentHash: string;
  size: number;
  createdAt: string;
  legalHold: boolean;
}

interface BundleContent {
  bundleId: string;
  content: object;
  contentHash: string;
}

interface BundleVerifyResult {
  bundleId: string;
  ok: boolean;
  expectedHash: string;
  actualHash: string;
}

interface BundleMetadata {
  bundleId: string;
  incidentId: string;
  runId: string;
  contentHash: string;
  size: number;
  createdAt: string;
  expiresAt?: string | undefined;
  legalHold: boolean;
}
```

### S3BundleRepository Implementation

```typescript
@Injectable()
class S3BundleRepository implements IBundleRepository {
  constructor(
    private readonly s3Client: S3Client,
    private readonly retryQueue: RetryQueue,
    private readonly clock: IClock,
    private readonly metrics: IMetricsEmitter,
    private readonly config: S3Config,
  ) {}

  async save(bundle: BundleData): Promise<BundleSaveResult> {
    const start = this.clock.nowMs();
    const content = JSON.stringify(bundle.content);
    const contentHash = this.computeHash(content);
    const key = this.buildKey(bundle.tenantId, bundle.incidentId, bundle.bundleId);
    
    try {
      const command = bundle.content.length > 5 * 1024 * 1024
        ? this.createMultipartUpload(key, content, bundle, contentHash)
        : this.createPutObject(key, content, bundle, contentHash);
      
      await this.s3Client.send(command);
      
      this.metrics.histogram('s3.operation.latency', this.clock.nowMs() - start, {
        operation: 'save',
        status: 'success',
      });
      
      return { bundleId: bundle.bundleId, contentHash, status: 'UPLOADED' };
    } catch (error) {
      this.metrics.counter('s3.operation.error', 1, { operation: 'save' });
      
      // Queue for retry
      const queued = await this.retryQueue.enqueue({
        bundleId: bundle.bundleId,
        key,
        content,
        metadata: this.buildMetadata(bundle, contentHash),
        retryCount: 0,
      });
      
      if (!queued) {
        throw new StorageQueueFullError('Retry queue is full');
      }
      
      return { bundleId: bundle.bundleId, contentHash, status: 'QUEUED' };
    }
  }

  async findById(bundleId: string): Promise<Bundle | null> {
    // First check metadata index (PostgreSQL from 9B)
    // Then verify object exists in S3
    const metadata = await this.metadataStore.findById(bundleId);
    if (!metadata) return null;
    
    try {
      const headCommand = new HeadObjectCommand({
        Bucket: this.config.bucket,
        Key: this.buildKeyFromMetadata(metadata),
      });
      await this.s3Client.send(headCommand);
      return this.mapToBundle(metadata);
    } catch (error) {
      if (error.name === 'NotFound') return null;
      throw error;
    }
  }

  async verify(bundleId: string): Promise<BundleVerifyResult> {
    const bundle = await this.findById(bundleId);
    if (!bundle) {
      throw new BundleNotFoundError(bundleId);
    }
    
    const content = await this.getContent(bundleId);
    if (!content) {
      throw new BundleNotFoundError(bundleId);
    }
    
    const actualHash = this.computeHash(JSON.stringify(content.content));
    const ok = actualHash === bundle.contentHash;
    
    if (!ok) {
      this.logger.warn('[S3] Bundle integrity mismatch', {
        bundleId,
        expectedHash: bundle.contentHash,
        actualHash,
      });
      this.metrics.counter('s3.integrity.mismatch', 1);
    }
    
    return {
      bundleId,
      ok,
      expectedHash: bundle.contentHash,
      actualHash,
    };
  }

  async generatePresignedUrl(bundleId: string, expirySeconds = 3600): Promise<string> {
    const bundle = await this.findById(bundleId);
    if (!bundle) {
      throw new BundleNotFoundError(bundleId);
    }
    
    const command = new GetObjectCommand({
      Bucket: this.config.bucket,
      Key: this.buildKeyFromBundle(bundle),
    });
    
    return getSignedUrl(this.s3Client, command, { expiresIn: expirySeconds });
  }

  private computeHash(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }

  private buildKey(tenantId: string, incidentId: string, bundleId: string): string {
    return `bundles/${tenantId}/${incidentId}/${bundleId}.json`;
  }

  private buildMetadata(bundle: BundleData, contentHash: string): Record<string, string> {
    return {
      'x-amz-meta-tenant-id': bundle.tenantId,
      'x-amz-meta-incident-id': bundle.incidentId,
      'x-amz-meta-run-id': bundle.runId,
      'x-amz-meta-content-hash': contentHash,
      'x-amz-meta-created-at': bundle.createdAt,
    };
  }
}
```

### RetryQueue Implementation

```typescript
interface QueueItem {
  bundleId: string;
  key: string;
  content: string;
  metadata: Record<string, string>;
  retryCount: number;
  nextRetryAt: number;
}

@Injectable()
class RetryQueue {
  private readonly queue: Map<string, QueueItem> = new Map();
  private readonly MAX_QUEUE_SIZE = 100;
  private readonly MAX_RETRIES = 3;
  private readonly BASE_DELAY_MS = 1000;

  constructor(
    private readonly s3Client: S3Client,
    private readonly clock: IClock,
    private readonly metrics: IMetricsEmitter,
    private readonly config: S3Config,
  ) {
    this.startWorker();
  }

  async enqueue(item: QueueItem): Promise<boolean> {
    if (this.queue.size >= this.MAX_QUEUE_SIZE) {
      this.metrics.counter('s3.retry_queue.rejected', 1);
      return false;
    }
    
    item.nextRetryAt = this.clock.nowMs() + this.calculateDelay(item.retryCount);
    this.queue.set(item.bundleId, item);
    this.metrics.gauge('s3.retry_queue.size', this.queue.size);
    
    return true;
  }

  private async processQueue(): Promise<void> {
    const now = this.clock.nowMs();
    
    for (const [bundleId, item] of this.queue) {
      if (item.nextRetryAt > now) continue;
      
      try {
        await this.uploadItem(item);
        this.queue.delete(bundleId);
        this.metrics.counter('s3.retry_queue.success', 1);
      } catch (error) {
        item.retryCount++;
        
        if (item.retryCount >= this.MAX_RETRIES) {
          this.queue.delete(bundleId);
          this.metrics.counter('s3.retry_queue.exhausted', 1);
          this.logger.error('[S3] Retry exhausted for bundle', { bundleId });
        } else {
          item.nextRetryAt = now + this.calculateDelay(item.retryCount);
          this.metrics.counter('s3.retry_queue.retry', 1);
        }
      }
    }
    
    this.metrics.gauge('s3.retry_queue.size', this.queue.size);
  }

  private calculateDelay(retryCount: number): number {
    // Exponential backoff: 1s, 2s, 4s
    return this.BASE_DELAY_MS * Math.pow(2, retryCount);
  }

  private startWorker(): void {
    setInterval(() => this.processQueue(), 1000);
  }
}
```

### RetentionManager Implementation

```typescript
@Injectable()
class RetentionManager {
  private readonly DEFAULT_RETENTION_DAYS = 90;

  constructor(
    private readonly s3Client: S3Client,
    private readonly snapshotRepository: ISnapshotRepository,
    private readonly clock: IClock,
    private readonly metrics: IMetricsEmitter,
    private readonly config: S3Config,
  ) {}

  async configureLifecycleRules(): Promise<void> {
    const command = new PutBucketLifecycleConfigurationCommand({
      Bucket: this.config.bucket,
      LifecycleConfiguration: {
        Rules: [
          {
            ID: 'bundle-retention',
            Status: 'Enabled',
            Filter: {
              Prefix: 'bundles/',
            },
            Expiration: {
              Days: this.config.retentionDays ?? this.DEFAULT_RETENTION_DAYS,
            },
            // Legal hold objects are excluded via Object Lock
          },
        ],
      },
    });
    
    await this.s3Client.send(command);
  }

  async setLegalHold(bundleId: string, hold: boolean): Promise<void> {
    const bundle = await this.bundleRepository.findById(bundleId);
    if (!bundle) {
      throw new BundleNotFoundError(bundleId);
    }
    
    const command = new PutObjectLegalHoldCommand({
      Bucket: this.config.bucket,
      Key: this.buildKeyFromBundle(bundle),
      LegalHold: {
        Status: hold ? 'ON' : 'OFF',
      },
    });
    
    await this.s3Client.send(command);
    
    // Update metadata
    await this.metadataStore.updateLegalHold(bundleId, hold);
  }

  async getBundlesApproachingExpiry(daysThreshold: number): Promise<BundleMetadata[]> {
    const expiryDate = new Date(this.clock.nowMs());
    expiryDate.setDate(expiryDate.getDate() + daysThreshold);
    
    return this.metadataStore.findExpiringBefore(expiryDate.toISOString());
  }

  async emitExpiryMetrics(): Promise<void> {
    const approaching7Days = await this.getBundlesApproachingExpiry(7);
    const approaching30Days = await this.getBundlesApproachingExpiry(30);
    
    this.metrics.gauge('s3.bundles.expiring_7d', approaching7Days.length);
    this.metrics.gauge('s3.bundles.expiring_30d', approaching30Days.length);
  }
}
```

### S3 Configuration

```typescript
interface S3Config {
  endpoint: string;           // S3/MinIO endpoint
  bucket: string;             // Bucket name
  region: string;             // AWS region
  accessKeyId: string;        // Access key
  secretAccessKey: string;    // Secret key
  retentionDays: number;      // Default: 90
  forcePathStyle: boolean;    // true for MinIO
}

const defaultS3Config: Partial<S3Config> = {
  retentionDays: 90,
  forcePathStyle: false,
};
```

## Data Models

### S3 Key Schema

| Key Pattern | Content Type | Metadata |
|-------------|--------------|----------|
| `bundles/{tenantId}/{incidentId}/{bundleId}.json` | application/json | tenant-id, incident-id, run-id, content-hash, created-at |

### S3 Object Metadata

```typescript
interface S3ObjectMetadata {
  'x-amz-meta-tenant-id': string;
  'x-amz-meta-incident-id': string;
  'x-amz-meta-run-id': string;
  'x-amz-meta-content-hash': string;
  'x-amz-meta-created-at': string;
}
```

### Metrics Schema

```typescript
interface S3Metrics {
  // Latency histogram (ms)
  's3.operation.latency': {
    operation: 'save' | 'get' | 'verify' | 'delete';
    status: 'success' | 'error';
  };
  
  // Error counter
  's3.operation.error': {
    operation: string;
    errorType: string;
  };
  
  // Integrity counter
  's3.integrity.mismatch': {};
  
  // Retry queue gauges
  's3.retry_queue.size': {};
  's3.retry_queue.success': {};
  's3.retry_queue.retry': {};
  's3.retry_queue.exhausted': {};
  's3.retry_queue.rejected': {};
  
  // Storage gauges
  's3.storage.size_bytes': { tenantId: string };
  's3.bundles.expiring_7d': {};
  's3.bundles.expiring_30d': {};
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Bundle Persistence Round-Trip

*For any* bundle saved to the repository, retrieving by bundleId shall return content that produces the same SHA-256 hash as the original.

**Validates: Requirements 1.1, 2.1, 2.2**

### Property 2: Content Hash Integrity

*For any* bundle, the contentHash stored in metadata shall equal the SHA-256 hash of the actual content.

**Validates: Requirements 1.1, 3.1, 3.2**

### Property 3: Verify Consistency

*For any* bundle that has not been modified, verify() shall return `{ ok: true }` with matching hashes.

**Validates: Requirements 3.3**

### Property 4: Retry Queue Bounded

*For any* sequence of upload failures, the retry queue size shall never exceed MAX_QUEUE_SIZE (100).

**Validates: Requirements 6.2**

### Property 5: Legal Hold Protection

*For any* bundle with legal hold, attempting to delete shall fail with clear error.

**Validates: Requirements 5.1, 5.5**

### Property 6: Presigned URL Validity

*For any* generated presigned URL, the URL shall be valid for the specified expiry duration and allow download of the correct content.

**Validates: Requirements 2.4**

### Property 7: Retention Lifecycle

*For any* bundle without legal hold, the bundle shall be automatically deleted after the retention period expires.

**Validates: Requirements 4.1, 4.4**

### Property 8: Test Compatibility

*For any* test in the existing evidence bundle test suite, the test shall pass when run against the S3 adapter with MinIO.

**Validates: Requirements 8.3**

## Error Handling

### S3 Operation Errors

| Error Type | Detection | Response |
|------------|-----------|----------|
| Connection timeout | Socket timeout | Queue for retry |
| Access denied | 403 error | Log error, fail |
| Bucket not found | 404 error | Log error, fail startup |
| Object not found | 404 error | Return null |
| Integrity mismatch | Hash comparison | Return ok=false, log |
| Queue full | Queue size check | Reject with error |

### Error Response Strategy

```typescript
// Pseudo-code for error handling
async function handleS3Error(error: Error, operation: string): Promise<void> {
  if (isConnectionError(error)) {
    metrics.counter('s3.connection.failure', 1);
    // Queue for retry if upload
    return;
  }
  
  if (isAccessDenied(error)) {
    logger.error('S3 access denied - check credentials');
    throw new StorageAccessError('Access denied');
  }
  
  if (isNotFound(error)) {
    return null; // Expected for missing objects
  }
  
  // Unknown error - log and throw
  logger.error('Unknown S3 error', { error, operation });
  throw new StorageError('Storage operation failed', { cause: error });
}
```

## Testing Strategy

### Test Categories

1. **Unit Tests**: S3 adapter methods with mock S3 client
2. **Integration Tests**: S3 adapter with MinIO (containerized)
3. **Retry Tests**: Queue behavior and backoff
4. **Lifecycle Tests**: Retention policy verification
5. **Property Tests**: Universal properties across all inputs

### Dual Backend Test Pattern

```typescript
describe.each([
  ['in-memory', () => new InMemoryBundleRepository(mockClock)],
  ['s3', () => new S3BundleRepository(minioClient, retryQueue, mockClock, mockMetrics, testConfig)],
])('Bundle Repository (%s)', (name, createRepo) => {
  let repo: IBundleRepository;

  beforeEach(async () => {
    repo = createRepo();
    if (name === 's3') {
      await clearTestBucket();
    }
  });

  it('should save and retrieve bundle', async () => {
    const bundle = createTestBundle();
    const result = await repo.save(bundle);
    const retrieved = await repo.getContent(bundle.bundleId);
    
    expect(retrieved).not.toBeNull();
    expect(computeHash(retrieved!.content)).toBe(result.contentHash);
  });

  // ... more tests
});
```

### Test Environment

| Environment | S3 Backend |
|-------------|------------|
| Unit tests | Mock S3 client |
| Integration | MinIO (Docker) |
| CI | MinIO (Docker) |
| Staging | AWS S3 |
| Production | AWS S3 |

