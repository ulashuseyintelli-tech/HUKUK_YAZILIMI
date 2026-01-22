/**
 * Object Store Module Exports
 * 
 * Phase 9C - Task 0: Foundation Gates
 * 
 * Public API for evidence bundle S3/MinIO storage.
 */

// Module
export { EvidenceBundleModule, NullObjectStoreClient } from './evidence-bundle.module';

// Tokens
export {
  OBJECT_STORE_CLIENT,
  OBJECT_STORE_CONFIG,
  EVIDENCE_BUNDLE_POINTER_REPOSITORY,
  EvidenceBundleDisabledError,
} from './evidence-bundle.tokens';

// Interface
export {
  IObjectStoreClient,
  PutObjectInput,
  PutObjectResult,
  HeadObjectResult,
  HeadObjectNotFound,
  GetObjectResult,
  DeleteObjectsResult,
  ObjectStoreError,
  ObjectNotFoundError,
  ObjectAlreadyExistsError,
  ObjectStoreAccessDeniedError,
  ObjectStoreConnectionError,
} from './object-store.interface';

// Config
export {
  ObjectStoreConfig,
  ObjectStoreConfigSchema,
  ObjectStoreConfigError,
  isEvidenceBundleS3Enabled,
  validateObjectStoreConfig,
  loadObjectStoreConfig,
  getObjectStoreLogMessage,
  EVIDENCE_BUNDLE_FEATURE_FLAG,
} from './object-store.config';

// Implementation (for testing/direct use)
export { MinioObjectStoreClient } from './minio-object-store.client';
