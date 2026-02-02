/**
 * Object Store Module Exports
 * 
 * Phase 9C - Task 0: Foundation Gates
 * Phase 9C - Task 1: Object Model & Keyspace
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
  WriteOnceViolationReason,
  InvalidObjectKeyError,
  InvalidKeyValidationCode,
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

// Key Builders (Task 1)
export {
  DEFAULT_BUNDLE_KEY_PREFIX,
  BUNDLE_ITEM_TYPES,
  BundleItemType,
  validateKeySegment,
  validateItemType,
  buildBundleRootKey,
  buildManifestKey,
  buildItemKey,
  parseManifestKey,
  parseItemKey,
  buildTenantListPrefix,
  buildIncidentListPrefix,
} from './evidence-bundle.keys';

// Implementation (for testing/direct use)
export { MinioObjectStoreClient } from './minio-object-store.client';
