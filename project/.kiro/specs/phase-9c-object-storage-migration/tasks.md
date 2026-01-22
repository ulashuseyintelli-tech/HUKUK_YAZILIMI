# Implementation Plan: Sprint 9C Object Storage Migration

## Overview

This sprint migrates the Infrastructure Layer (evidence bundles) from in-memory storage to S3/MinIO object storage. The implementation preserves the existing interface while adding S3 as the primary backend with a bounded retry queue for resilience.

## Current Status

**Task 0: Foundation Gates - COMPLETE ✓**

See `PHASE-9C-IMPLEMENTATION-CHECKLIST.md` for detailed checklist.

## Tasks

- [x] 0. Foundation Gates (Task 0)
  - [x] 0.1 Feature flag: `EVIDENCE_BUNDLE_S3_ENABLED`
  - [x] 0.2 Config validation with Zod schema
  - [x] 0.3 IObjectStoreClient interface
  - [x] 0.4 MinioObjectStoreClient implementation (AWS SDK v3)
  - [x] 0.5 EvidenceBundleModule with conditional loading
  - [x] 0.6 DI tokens (OBJECT_STORE_CLIENT, etc.)
  - [x] 0.7 Prisma schema: EvidenceBundlePointer model
  - [x] 0.8 Feature flag tests (23 tests passing)
  - _Files: object-store/*.ts, prisma/schema.prisma_

- [ ] 1. Object Model ve Keyspace
  - [ ] 1.1 Add S3 dependencies
    - Add `@aws-sdk/client-s3` package
    - Add `@aws-sdk/s3-request-presigner` for presigned URLs
    - _Requirements: 1.1, 2.4_
  
  - [ ] 1.2 Create S3 configuration module
    - Create `s3-config.ts` with connection settings
    - Define `S3Config` interface
    - Implement environment variable parsing
    - Add validation for required settings
    - _Requirements: 1.1_

- [ ] 2. Implement IBundleRepository interface
  - [ ] 2.1 Extract interface from current implementation
    - Create `bundle-repository.interface.ts`
    - Define `IBundleRepository` interface with all methods
    - _Requirements: 8.1_

  - [ ] 2.2 Create InMemoryBundleRepository adapter
    - Extract current in-memory logic to separate class
    - Implement `IBundleRepository` interface
    - Ensure all existing tests still pass
    - _Requirements: 8.1, 8.3_

- [ ] 3. Implement S3BundleRepository
  - [ ] 3.1 Implement save method
    - Implement `save` with PutObject
    - Add multipart upload for bundles > 5MB
    - Store metadata as S3 object metadata
    - Compute and store SHA-256 content hash
    - _Requirements: 1.1, 1.2, 1.3, 1.4_
  
  - [ ] 3.2 Write property test for persistence round-trip
    - **Property 1: Bundle Persistence Round-Trip**
    - **Validates: Requirements 1.1, 2.1, 2.2**
  
  - [ ] 3.3 Implement retrieval methods
    - Implement `findById` with HeadObject
    - Implement `getContent` with GetObject
    - Implement `generatePresignedUrl`
    - _Requirements: 2.1, 2.4, 2.5_
  
  - [ ] 3.4 Write property test for content hash integrity
    - **Property 2: Content Hash Integrity**
    - **Validates: Requirements 1.1, 3.1, 3.2**
  
  - [ ] 3.5 Implement verify methods
    - Implement `verify` with hash comparison
    - Implement `verifyBatch` for multiple bundles
    - Log mismatches for audit
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_
  
  - [ ] 3.6 Write property test for verify consistency
    - **Property 3: Verify Consistency**
    - **Validates: Requirements 3.3**
  
  - [ ] 3.7 Write property test for presigned URL validity
    - **Property 6: Presigned URL Validity**
    - **Validates: Requirements 2.4**

- [ ] 4. Checkpoint - Core S3 operations
  - Ensure all S3 operations work correctly with MinIO
  - Run existing bundle tests against S3 adapter
  - _Requirements: 8.3_

- [ ] 5. Implement retry queue
  - [ ] 5.1 Create RetryQueue class
    - Implement bounded queue (max 100 items)
    - Add exponential backoff (1s, 2s, 4s)
    - Implement background worker for processing
    - _Requirements: 6.1, 6.2, 6.3_
  
  - [ ] 5.2 Write property test for bounded queue
    - **Property 4: Retry Queue Bounded**
    - **Validates: Requirements 6.2**
  
  - [ ] 5.3 Integrate retry queue with S3BundleRepository
    - Queue failed uploads automatically
    - Process queue on S3 recovery
    - Emit metrics for queue operations
    - _Requirements: 6.4, 6.5, 6.6_

- [ ] 6. Checkpoint - Retry behavior
  - Test retry queue activation on S3 failure
  - Test queue processing on recovery
  - Verify bounded queue behavior
  - _Requirements: 6.1, 6.2_

- [ ] 7. Implement retention management
  - [ ] 7.1 Create RetentionManager class
    - Configure S3 lifecycle rules
    - Set default retention period (90 days)
    - _Requirements: 4.1, 4.3_
  
  - [ ] 7.2 Implement legal hold integration
    - Use S3 Object Lock for legal hold
    - Sync with snapshot legal hold status
    - _Requirements: 5.1, 5.2, 5.3, 5.4_
  
  - [ ] 7.3 Write property test for legal hold protection
    - **Property 5: Legal Hold Protection**
    - **Validates: Requirements 5.1, 5.5**
  
  - [ ] 7.4 Write property test for retention lifecycle
    - **Property 7: Retention Lifecycle**
    - **Validates: Requirements 4.1, 4.4**
  
  - [ ] 7.5 Implement expiry metrics
    - Track bundles approaching expiration
    - Emit metrics for 7-day and 30-day thresholds
    - _Requirements: 4.5_

- [ ] 8. Implement metrics and observability
  - [ ] 8.1 Add latency histogram
    - Emit histogram for all S3 operations
    - Include operation name and status tags
    - _Requirements: 7.1_
  
  - [ ] 8.2 Add error and queue counters
    - Emit counter for S3 operation failures
    - Emit gauge for retry queue size
    - Emit counter for integrity mismatches
    - _Requirements: 7.2, 7.5_
  
  - [ ] 8.3 Add storage metrics
    - Emit gauge for total storage size per tenant
    - Emit counter for bundles approaching expiry
    - _Requirements: 7.3, 7.4_

- [ ] 9. Wire up and integrate
  - [ ] 9.1 Update EvidenceBundleService
    - Inject IBundleRepository instead of using internal state
    - Add feature flag check for S3 vs in-memory
    - _Requirements: 8.1_
  
  - [ ] 9.2 Update module configuration
    - Add S3 providers to module
    - Configure based on environment variables
    - Default to in-memory in test environment
    - _Requirements: 8.2, 8.5_

- [ ] 10. Test compatibility verification
  - [ ] 10.1 Run existing tests with S3 backend
    - Configure tests to use MinIO
    - Verify all evidence bundle tests pass
    - _Requirements: 8.3, 8.4_
  
  - [ ] 10.2 Write property test for test compatibility
    - **Property 8: Test Compatibility**
    - **Validates: Requirements 8.3**
  
  - [ ] 10.3 Add dual-backend test configuration
    - Create test helper for running tests against both backends
    - Add CI configuration with MinIO
    - _Requirements: 8.3_

- [ ] 11. Final Checkpoint
  - Ensure all tests pass with S3 backend
  - Verify retry queue works correctly
  - Verify retention lifecycle is configured
  - Confirm metrics are being emitted
  - Document deployment configuration
  - _Requirements: 8.3_

## Notes

- Each property test references a specific property from the design document
- Checkpoints ensure incremental validation before proceeding
- Use MinIO for local and CI testing, AWS S3 for staging/production
- Retry queue provides resilience without blocking uploads
- All property tests are required for comprehensive coverage
