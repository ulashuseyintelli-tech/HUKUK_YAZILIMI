/**
 * Tenant Context Types
 * 
 * Single source of truth for tenant identity across the system.
 * All tenant context must flow through TenantContextResolver.
 * 
 * @see design.md "Gate 1: TenantContext Source Authority is Singular"
 */

/**
 * Authentication type indicating how tenant identity was established
 */
export type TenantAuthType = 'JWT' | 'SERVICE_ACCOUNT' | 'INTERNAL_HMAC';

/**
 * Actor identity - who is making the request
 */
export interface ActorIdentity {
  /** Unique identifier for the actor */
  id: string;
  /** Actor type */
  type: 'USER' | 'SERVICE' | 'SYSTEM';
  /** Display name (for audit logs) */
  name?: string;
  /** Email (for audit logs, if available) */
  email?: string;
}

/**
 * Canonical tenant context - the ONLY way tenant identity flows through the system
 * 
 * INVARIANT: This is produced exclusively by TenantContextResolver.
 * No other component may construct this from raw request data.
 */
export interface TenantContext {
  /** Tenant identifier - the primary isolation boundary */
  readonly tenantId: string;
  
  /** Actor making the request */
  readonly actor: ActorIdentity;
  
  /** How the tenant identity was established */
  readonly authType: TenantAuthType;
  
  /** Scopes/permissions granted to this context */
  readonly scopes: readonly string[];
  
  /** Timestamp when context was resolved */
  readonly resolvedAt: string;
  
  /** Correlation ID for tracing */
  readonly correlationId: string;
}

/**
 * Result of tenant context resolution
 */
export type TenantContextResult = 
  | { success: true; context: TenantContext }
  | { success: false; error: TenantContextError };

/**
 * Tenant context resolution errors
 */
export interface TenantContextError {
  code: TenantContextErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

export type TenantContextErrorCode =
  | 'MISSING_AUTH'           // No authentication provided
  | 'INVALID_JWT'            // JWT validation failed
  | 'MISSING_TENANT_CLAIM'   // JWT valid but no tenantId claim
  | 'INVALID_HMAC'           // HMAC signature validation failed
  | 'MISSING_HMAC'           // Internal header present but no signature
  | 'EXPIRED_TOKEN'          // Token has expired
  | 'INVALID_ISSUER'         // Token issuer not trusted
  | 'INVALID_AUDIENCE';      // Token audience mismatch

/**
 * Configuration for tenant context resolution
 */
export interface TenantContextConfig {
  /** JWT configuration */
  jwt: {
    /** Expected issuer(s) */
    issuers: string[];
    /** Expected audience(s) */
    audiences: string[];
    /** Claim name for tenant ID */
    tenantIdClaim: string;
  };
  
  /** Internal HMAC configuration */
  internalHmac: {
    /** Whether HMAC auth is enabled for internal calls */
    enabled: boolean;
    /** Header name for tenant ID */
    tenantIdHeader: string;
    /** Header name for HMAC signature */
    signatureHeader: string;
    /** Header name for timestamp */
    timestampHeader: string;
    /** Max age for timestamp (replay protection) */
    maxTimestampAgeMs: number;
  };
  
  /** Service account JWT configuration */
  serviceAccount: {
    /** Expected issuer for service accounts */
    issuer: string;
    /** Expected audience for service accounts */
    audience: string;
  };
}

/**
 * Default configuration
 */
export const DEFAULT_TENANT_CONTEXT_CONFIG: TenantContextConfig = {
  jwt: {
    issuers: ['https://auth.example.com'],
    audiences: ['calc-preview-api'],
    tenantIdClaim: 'tenantId',
  },
  internalHmac: {
    enabled: true,
    tenantIdHeader: 'x-internal-tenant-id',
    signatureHeader: 'x-internal-signature',
    timestampHeader: 'x-internal-timestamp',
    maxTimestampAgeMs: 5 * 60 * 1000, // 5 minutes
  },
  serviceAccount: {
    issuer: 'https://auth.example.com/service',
    audience: 'calc-preview-api-internal',
  },
};
