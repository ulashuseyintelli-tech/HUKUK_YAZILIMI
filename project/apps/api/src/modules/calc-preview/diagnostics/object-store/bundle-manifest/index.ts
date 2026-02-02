/**
 * Phase 9C Task 3 - Bundle Manifest Module
 * 
 * Manifest generation, verification, and storage for sealed evidence bundles.
 */

// Types
export type {
  BundleManifestV1,
  ManifestObjectV1,
  ManifestSignature,
  ManifestStorage as ManifestStorageConfig,
  ManifestWithoutHash,
  ManifestVerificationResult,
  ManifestBuildOptions,
  ManifestWriteResult,
  ManifestReadResult,
  SignatureAlgorithm,
} from './bundle-manifest.types';
export { MANIFEST_VERSION } from './bundle-manifest.types';

// Canonical JSON
export {
  canonicalStringify,
  parseAndSort,
  canonicalEquals,
} from './bundle-manifest.canonical';

// Hasher
export {
  computeManifestHash,
  verifyManifestHash,
  addManifestHash,
} from './bundle-manifest.hasher';

// Keys
export {
  buildManifestKey,
  parseManifestKey,
  buildManifestListPrefix,
  validateBundleId,
  BUNDLE_MANIFEST_PREFIX,
} from './bundle-manifest.keys';

// Builder
export {
  ManifestBuilder,
  BundleNotFoundError,
  BundleNotSealedError,
  SealEventNotFoundError,
} from './bundle-manifest.builder';

// Verifier
export {
  verifyManifest,
  verifyManifestDetailed,
} from './bundle-manifest.verifier';

// Storage
export {
  ManifestStorage,
  ManifestExistsError,
} from './bundle-manifest.storage';

// Writer (Orchestrator)
export {
  ManifestWriter,
  type ManifestWriteOperationResult,
  type ManifestWriterConfig,
} from './bundle-manifest.writer';

// Metrics
export {
  type ManifestWriteMetricLabels,
  type ManifestWriteMetricEvent,
  type IManifestMetricsCollector,
  NoOpManifestMetricsCollector,
  ConsoleManifestMetricsCollector,
  createManifestWriteMetricEvent,
  MANIFEST_METRIC_NAMES,
} from './bundle-manifest.metrics';
