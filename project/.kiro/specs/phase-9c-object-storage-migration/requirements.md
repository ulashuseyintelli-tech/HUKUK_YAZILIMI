# Requirements Document

## Introduction

Sprint 9C migrates the Infrastructure Layer from in-memory storage to S3/MinIO object storage. This layer handles large binary/JSON artifacts with lifecycle policies: evidence bundles and their retention management. The risk profile is cost/scale - wrong implementation means burning money on storage or losing evidence.

Current in-memory implementations to migrate:
- `BundleStore` (in EvidenceBundleService): Exported evidence bundles with hash verification
- Retention lifecycle policies for automatic cleanup

## Glossary

- **S3_Adapter**: The S3/MinIO-backed implementation of bundle storage
- **Bundle_Repository**: Interface for storing and retrieving evidence bundles
- **Retention_Manager**: Component managing bundle lifecycle and automatic cleanup
- **Content_Hash**: SHA-256 hash of bundle content for integrity verification
- **Lifecycle_Policy**: S3 lifecycle rules for automatic object expiration
- **Multipart_Upload**: S3 feature for uploading large bundles in parts
- **Presigned_URL**: Time-limited URL for direct bundle download

## Requirements

### Requirement 1: Bundle Storage

**User Story:** As a system operator, I want evidence bundles stored in S3/MinIO, so that bundles survive restarts and scale to large sizes.

#### Acceptance Criteria

1. WHEN a bundle is exported, THE S3_Adapter SHALL upload bundle content to S3 with content hash as metadata
2. THE S3_Adapter SHALL use key format: `bundles/{tenantId}/{incidentId}/{bundleId}.json`
3. WHEN bundle size exceeds 5MB, THE S3_Adapter SHALL use multipart upload
4. THE S3_Adapter SHALL store bundle metadata (tenantId, incidentId, runId, createdAt, contentHash) as S3 object metadata
5. WHEN upload fails, THE S3_Adapter SHALL retry up to 3 times with exponential backoff

### Requirement 2: Bundle Retrieval

**User Story:** As a user, I want to retrieve evidence bundles efficiently, so that I can access evidence for legal proceedings.

#### Acceptance Criteria

1. WHEN retrieving a bundle, THE S3_Adapter SHALL download bundle content from S3
2. THE S3_Adapter SHALL verify content hash matches stored hash on retrieval
3. IF content hash mismatch is detected, THEN THE S3_Adapter SHALL return integrity error
4. THE S3_Adapter SHALL support generating presigned URLs for direct download (1 hour expiry)
5. WHEN bundle is not found, THE S3_Adapter SHALL return 404 with clear error message

### Requirement 3: Bundle Verification

**User Story:** As a legal compliance officer, I want to verify bundle integrity, so that I can prove evidence has not been tampered with.

#### Acceptance Criteria

1. WHEN verifying a bundle, THE S3_Adapter SHALL compute SHA-256 hash of current content
2. THE S3_Adapter SHALL compare computed hash with stored hash in metadata
3. IF hashes match, THEN THE S3_Adapter SHALL return `{ ok: true, expectedHash, actualHash }`
4. IF hashes differ, THEN THE S3_Adapter SHALL return `{ ok: false, expectedHash, actualHash }` and log for audit
5. THE S3_Adapter SHALL support batch verification for multiple bundles

### Requirement 4: Retention Lifecycle

**User Story:** As a system operator, I want automatic bundle cleanup based on retention policies, so that storage costs are controlled.

#### Acceptance Criteria

1. THE Retention_Manager SHALL configure S3 lifecycle rules for automatic expiration
2. WHEN bundle has legal hold, THE Retention_Manager SHALL exclude it from automatic deletion
3. THE Retention_Manager SHALL support configurable retention periods (default: 90 days)
4. WHEN retention period expires, THE Retention_Manager SHALL delete bundle unless legal hold exists
5. THE Retention_Manager SHALL emit metrics for bundles approaching expiration

### Requirement 5: Legal Hold Integration

**User Story:** As a legal compliance officer, I want bundles with legal holds protected from deletion, so that evidence is preserved for legal proceedings.

#### Acceptance Criteria

1. WHEN legal hold is set on a snapshot, THE Retention_Manager SHALL protect associated bundles
2. THE Retention_Manager SHALL use S3 Object Lock for legal hold protection
3. WHEN legal hold is released, THE Retention_Manager SHALL allow normal retention policy
4. THE Retention_Manager SHALL track legal hold status in bundle metadata
5. WHEN attempting to delete bundle with legal hold, THE Retention_Manager SHALL reject with clear error

### Requirement 6: Connection and Failover

**User Story:** As a system operator, I want graceful handling when S3 is unavailable, so that the system degrades gracefully.

#### Acceptance Criteria

1. WHEN S3 connection fails during upload, THE S3_Adapter SHALL queue bundle for retry
2. THE S3_Adapter SHALL maintain bounded retry queue (max 100 bundles)
3. WHEN retry queue is full, THE S3_Adapter SHALL reject new uploads with clear error
4. THE S3_Adapter SHALL attempt S3 reconnection every 30 seconds
5. WHEN S3 connection is restored, THE S3_Adapter SHALL process retry queue in order
6. THE S3_Adapter SHALL emit metrics for queue size and retry attempts

### Requirement 7: Metrics and Observability

**User Story:** As a system operator, I want metrics for S3 operations, so that I can monitor storage system health.

#### Acceptance Criteria

1. THE S3_Adapter SHALL emit latency histogram for all S3 operations
2. THE S3_Adapter SHALL emit counter for S3 operation failures
3. THE S3_Adapter SHALL emit gauge for total storage size per tenant
4. THE S3_Adapter SHALL emit counter for bundles approaching retention expiry
5. THE S3_Adapter SHALL emit gauge for retry queue size

### Requirement 8: Test Compatibility

**User Story:** As a developer, I want existing bundle tests to pass with S3 backend, so that I can verify the migration is correct.

#### Acceptance Criteria

1. THE S3_Adapter SHALL implement same interface as current in-memory implementation
2. WHEN running tests, THE S3_Adapter SHALL support MinIO for local testing
3. THE S3_Adapter SHALL pass all existing evidence bundle tests
4. THE S3_Adapter SHALL support deterministic clock injection for time-based tests
5. WHEN test environment is detected, THE S3_Adapter SHALL use MinIO with automatic cleanup

