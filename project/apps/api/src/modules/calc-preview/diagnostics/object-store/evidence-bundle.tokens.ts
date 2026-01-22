/**
 * Evidence Bundle DI Tokens
 * 
 * Phase 9C - Task 0: Foundation Gates
 * 
 * Dependency injection tokens for evidence bundle module.
 * 
 * @see .kiro/specs/phase-9c-object-storage-migration/PHASE-9C-IMPLEMENTATION-CHECKLIST.md
 */

// ============================================================================
// Injection Tokens
// ============================================================================

/**
 * Object store client token
 * 
 * Inject with: @Inject(OBJECT_STORE_CLIENT)
 * Type: IObjectStoreClient
 */
export const OBJECT_STORE_CLIENT = Symbol('OBJECT_STORE_CLIENT');

/**
 * Evidence bundle pointer repository token
 * 
 * Inject with: @Inject(EVIDENCE_BUNDLE_POINTER_REPOSITORY)
 * Type: IEvidenceBundlePointerRepository
 */
export const EVIDENCE_BUNDLE_POINTER_REPOSITORY = Symbol('EVIDENCE_BUNDLE_POINTER_REPOSITORY');

/**
 * Object store configuration token
 * 
 * Inject with: @Inject(OBJECT_STORE_CONFIG)
 * Type: ObjectStoreConfig
 */
export const OBJECT_STORE_CONFIG = Symbol('OBJECT_STORE_CONFIG');

// ============================================================================
// Error Types
// ============================================================================

/**
 * Error thrown when evidence bundle feature is disabled but service is called.
 * 
 * This should NEVER happen in production if module loading is correct.
 * If this error is thrown, it indicates a DI configuration bug.
 */
export class EvidenceBundleDisabledError extends Error {
  readonly code = 'EVIDENCE_BUNDLE_DISABLED';
  
  constructor() {
    super(
      'Evidence Bundle S3 feature is disabled. ' +
      'Set EVIDENCE_BUNDLE_S3_ENABLED=true to enable. ' +
      'This error indicates a DI configuration bug - the module should not be loaded when disabled.',
    );
    this.name = 'EvidenceBundleDisabledError';
  }
}
