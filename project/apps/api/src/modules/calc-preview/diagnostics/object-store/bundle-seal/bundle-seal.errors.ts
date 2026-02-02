/**
 * Phase 9C Task 2.5 - Bundle Seal Errors
 * 
 * Exception classes and SQLSTATE → HTTP error mapper.
 * 
 * ERROR CODE REFERENCE:
 * ┌─────────┬────────────────────────────────────┬─────────────────────────────┐
 * │ ERRCODE │ EXCEPTION NAME                     │ HTTP / App Error            │
 * ├─────────┼────────────────────────────────────┼─────────────────────────────┤
 * │ 55P03   │ lock_not_available (NOWAIT)        │ 423 Locked                  │
 * │ 45000   │ sealed_bundle_write_forbidden      │ 409 WriteOnceViolation      │
 * │ 45001   │ tenant_mismatch                    │ 403 TenantMismatchError     │
 * │ 45002   │ seal_event_requires_sealed_bundle  │ 409 InvalidStateTransition  │
 * │ 23503   │ bundle_not_found (FK semantics)    │ 404 BundleNotFoundError     │
 * │ 23505   │ unique_violation                   │ 409 DuplicateBundle         │
 * └─────────┴────────────────────────────────────┴─────────────────────────────┘
 */

/** Base class for bundle seal errors */
export abstract class BundleSealError extends Error {
  abstract readonly httpStatus: number;
  abstract readonly errorCode: string;
  
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

/** 423 Locked - Bundle is currently locked by another process */
export class BundleLockedError extends BundleSealError {
  readonly httpStatus = 423;
  readonly errorCode = 'BUNDLE_LOCKED';
  
  constructor(bundleId: string) {
    super(`Bundle ${bundleId} is currently locked by another process`);
  }
}

/** 404 Not Found - Bundle does not exist */
export class BundleNotFoundError extends BundleSealError {
  readonly httpStatus = 404;
  readonly errorCode = 'BUNDLE_NOT_FOUND';
  
  constructor(bundleId: string) {
    super(`Bundle ${bundleId} not found`);
  }
}

/** 409 Conflict - Bundle is already sealed */
export class BundleAlreadySealedError extends BundleSealError {
  readonly httpStatus = 409;
  readonly errorCode = 'BUNDLE_ALREADY_SEALED';
  
  readonly sealedHash: string;
  readonly sealedAt: Date;
  
  constructor(bundleId: string, sealedHash: string, sealedAt: Date) {
    super(`Bundle ${bundleId} is already sealed`);
    this.sealedHash = sealedHash;
    this.sealedAt = sealedAt;
  }
}

/** 409 Conflict - Write-once violation (ERRCODE 45000) */
export class WriteOnceViolationError extends BundleSealError {
  readonly httpStatus = 409;
  readonly errorCode = 'WRITE_ONCE_VIOLATION';
  
  constructor(bundleId: string) {
    super(`Cannot modify sealed bundle ${bundleId}`);
  }
}

/** 403 Forbidden - Tenant mismatch (ERRCODE 45001) */
export class TenantMismatchError extends BundleSealError {
  readonly httpStatus = 403;
  readonly errorCode = 'TENANT_MISMATCH';
  
  constructor(message: string) {
    super(message);
  }
}

/** 409 Conflict - Invalid state transition (ERRCODE 45002) */
export class InvalidStateTransitionError extends BundleSealError {
  readonly httpStatus = 409;
  readonly errorCode = 'INVALID_STATE_TRANSITION';
  
  constructor(bundleId: string, currentState: string, expectedState: string) {
    super(`Bundle ${bundleId} is in state ${currentState}, expected ${expectedState}`);
  }
}

/** 409 Conflict - Duplicate bundle (ERRCODE 23505) */
export class DuplicateBundleError extends BundleSealError {
  readonly httpStatus = 409;
  readonly errorCode = 'DUPLICATE_BUNDLE';
  
  constructor(tenantId: string, incidentId: string) {
    super(`An OPEN bundle already exists for tenant ${tenantId}, incident ${incidentId}`);
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
// SQLSTATE → Error Mapper
// ═══════════════════════════════════════════════════════════════════════════════

/** PostgreSQL error with code property */
interface PrismaError {
  code?: string;
  message?: string;
  meta?: {
    code?: string;
    message?: string;
  };
}

/** SQLSTATE codes from PostgreSQL */
const SQLSTATE = {
  LOCK_NOT_AVAILABLE: '55P03',      // FOR UPDATE NOWAIT failed
  FOREIGN_KEY_VIOLATION: '23503',   // FK constraint / bundle_not_found
  UNIQUE_VIOLATION: '23505',        // Unique constraint violation
  SEALED_BUNDLE_WRITE: '45000',     // Custom: sealed_bundle_write_forbidden
  TENANT_MISMATCH: '45001',         // Custom: tenant_mismatch
  SEAL_EVENT_INVALID: '45002',      // Custom: seal_event_requires_sealed_bundle
} as const;

/**
 * Extracts SQLSTATE code from Prisma error.
 * Prisma wraps PostgreSQL errors differently depending on query type.
 */
function extractSqlState(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  
  const prismaError = error as PrismaError;
  
  // Direct code (raw query errors)
  if (prismaError.code) return prismaError.code;
  
  // Meta code (some Prisma errors)
  if (prismaError.meta?.code) return prismaError.meta.code;
  
  // Check message for SQLSTATE pattern
  const message = prismaError.message ?? '';
  
  // Pattern: "error: ... SQLSTATE[XXXXX]" or just the code in message
  const match = message.match(/(?:SQLSTATE\[)?([0-9A-Z]{5})(?:\])?/);
  if (match) return match[1];
  
  return undefined;
}

/**
 * Maps Prisma/PostgreSQL errors to domain-specific BundleSealError.
 * 
 * @param error - Error from Prisma query
 * @param bundleId - Bundle ID for error context
 * @returns Mapped BundleSealError or original error if not mappable
 */
export function mapPrismaError(error: unknown, bundleId: string): Error {
  const sqlState = extractSqlState(error);
  const message = (error as PrismaError)?.message ?? '';
  
  switch (sqlState) {
    case SQLSTATE.LOCK_NOT_AVAILABLE:
      return new BundleLockedError(bundleId);
      
    case SQLSTATE.FOREIGN_KEY_VIOLATION:
      // Could be bundle_not_found from trigger
      if (message.includes('bundle_not_found')) {
        return new BundleNotFoundError(bundleId);
      }
      return new BundleNotFoundError(bundleId);
      
    case SQLSTATE.UNIQUE_VIOLATION:
      // Could be idempotency constraint or partial unique index
      if (message.includes('idx_evidence_bundles_one_open')) {
        // Extract tenant/incident from message if possible
        return new DuplicateBundleError('unknown', 'unknown');
      }
      // Idempotency constraint - not an error in our flow
      return error as Error;
      
    case SQLSTATE.SEALED_BUNDLE_WRITE:
      return new WriteOnceViolationError(bundleId);
      
    case SQLSTATE.TENANT_MISMATCH:
      return new TenantMismatchError(message);
      
    case SQLSTATE.SEAL_EVENT_INVALID:
      return new InvalidStateTransitionError(bundleId, 'OPEN', 'SEALED');
      
    default:
      // Return original error if not mappable
      return error instanceof Error ? error : new Error(String(error));
  }
}

/**
 * Type guard to check if error is a BundleSealError.
 */
export function isBundleSealError(error: unknown): error is BundleSealError {
  return error instanceof BundleSealError;
}
