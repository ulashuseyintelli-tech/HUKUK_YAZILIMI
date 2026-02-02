/**
 * Phase 9C Task 2.5 - Bundle Seal Module
 * 
 * Evidence bundle sealing with legal-grade audit trail.
 */

// Types
export type {
  EvidenceObjectRow,
  EvidenceBundleRow,
  BundleSealEventRow,
  SealSnapshot,
  SealResult,
  BatchSealResult,
  BundleSealConfig,
} from './bundle-seal.types';
export { DEFAULT_SEAL_CONFIG } from './bundle-seal.types';

// Hasher
export {
  formatObjectForHash,
  computeSealSnapshot,
  computeEmptyBundleSnapshot,
} from './bundle-seal.hasher';

// Errors
export {
  BundleSealError,
  BundleLockedError,
  BundleNotFoundError,
  BundleAlreadySealedError,
  WriteOnceViolationError,
  TenantMismatchError,
  InvalidStateTransitionError,
  DuplicateBundleError,
  mapPrismaError,
  isBundleSealError,
} from './bundle-seal.errors';

// Repository
export { BundleSealRepository } from './bundle-seal.repository';

// Service
export { BundleSealService } from './bundle-seal.service';
