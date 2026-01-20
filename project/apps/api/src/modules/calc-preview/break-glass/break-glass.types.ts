/**
 * Break-Glass Core Types
 * 
 * Types for the cross-tenant break-glass access system.
 * 
 * @see design.md "Cross-Tenant Break-Glass Access Architecture"
 */

/**
 * Break-glass reason categories
 */
export type BreakGlassReasonCategory =
  | 'CUSTOMER_SUPPORT'
  | 'INCIDENT_RESPONSE'
  | 'LEGAL_REQUEST'
  | 'AUDIT';

/**
 * Structured reason for break-glass request
 * 
 * All break-glass requests must include a structured reason
 * for audit and compliance purposes.
 */
export interface BreakGlassReason {
  /** Category of the request */
  category: BreakGlassReasonCategory;
  
  /** Ticket reference (e.g., JIRA-123, INC-456) */
  ticketRef: string;
  
  /** Optional description (max 500 chars) */
  description?: string;
}

/**
 * Break-glass request status
 */
export type BreakGlassRequestStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'DENIED'
  | 'EXPIRED'
  | 'REVOKED';

/**
 * Break-glass request
 */
export interface BreakGlassRequest {
  /** Unique request identifier */
  requestId: string;
  
  /** ID of the user who created the request */
  requesterId: string;
  
  /** Requester's name (for audit) */
  requesterName?: string;
  
  /** Target tenant to access */
  targetTenantId: string;
  
  /** Requested scopes */
  requestedScopes: string[];
  
  /** Structured reason */
  reason: BreakGlassReason;
  
  /** Request creation timestamp */
  requestedAt: string;
  
  /** Request expiration timestamp (for approval window) */
  expiresAt: string;
  
  /** Current status */
  status: BreakGlassRequestStatus;
  
  /** Denial reason (if denied) */
  denialReason?: string;
}

/**
 * Revocation reason categories
 * 
 * Used for forensics and audit trail.
 * - manual: User-initiated revocation
 * - expiry: Automatic expiration
 * - circuit_breaker: Circuit breaker triggered
 * - security_incident: Security event detected
 */
export type RevocationReason =
  | 'manual'
  | 'expiry'
  | 'circuit_breaker'
  | 'security_incident';

/**
 * Revocation audit details
 * 
 * Captures who revoked, why, and when for forensics.
 * 
 * KVKK/PII Safety:
 * - description is max 200 chars
 * - description MUST NOT contain PII (validated before storage)
 * - Use predefined reason codes when possible
 */
export interface RevocationAudit {
  /** Who revoked the grant (actor ID or 'system' for auto-revoke) */
  revokedBy: string;
  
  /** Reason category */
  reason: RevocationReason;
  
  /** 
   * Optional description (max 200 chars, NO PII allowed)
   * Validated by validateRevocationDescription()
   */
  description?: string;
  
  /** Revocation timestamp */
  revokedAt: string;
}

/**
 * PII patterns for description validation
 */
const PII_PATTERNS = {
  TCKN: /\b\d{11}\b/,
  PHONE: /\+?90?\s*\d{3}\s*\d{3}\s*\d{2}\s*\d{2}/,
  EMAIL: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,
};

/**
 * Max description length for revocation audit
 */
export const MAX_REVOCATION_DESCRIPTION_LENGTH = 200;

/**
 * Validate revocation description for PII safety
 * 
 * @returns { valid: boolean, errors: string[] }
 */
export function validateRevocationDescription(description: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Length check
  if (description.length > MAX_REVOCATION_DESCRIPTION_LENGTH) {
    errors.push(`Description must be at most ${MAX_REVOCATION_DESCRIPTION_LENGTH} characters`);
  }
  
  // PII checks
  if (PII_PATTERNS.TCKN.test(description)) {
    errors.push('Description must not contain TCKN (11-digit number)');
  }
  if (PII_PATTERNS.PHONE.test(description)) {
    errors.push('Description must not contain phone numbers');
  }
  if (PII_PATTERNS.EMAIL.test(description)) {
    errors.push('Description must not contain email addresses');
  }
  
  return { valid: errors.length === 0, errors };
}

/**
 * Break-glass grant (issued after approval)
 */
export interface BreakGlassGrant {
  /** Unique grant identifier */
  grantId: string;
  
  /** Associated request ID */
  requestId: string;
  
  /** ID of the user who approved */
  approverId: string;
  
  /** Approver's name (for audit) */
  approverName?: string;
  
  /** Target tenant */
  targetTenantId: string;
  
  /** Granted scopes */
  grantedScopes: string[];
  
  /** Grant creation timestamp */
  grantedAt: string;
  
  /** Grant expiration timestamp */
  expiresAt: string;
  
  /** Number of times renewed */
  renewalCount: number;
  
  /** Maximum allowed renewals */
  maxRenewals: number;
  
  /** Whether grant is currently active */
  isActive: boolean;
  
  /** Revocation timestamp (if revoked) - DEPRECATED: use revocation.revokedAt */
  revokedAt?: string;
  
  /** Revocation reason (if revoked) - DEPRECATED: use revocation.reason */
  revocationReason?: string;
  
  /** Structured revocation audit (new) */
  revocation?: RevocationAudit;
}

/**
 * Break-glass token claims
 * 
 * GATE 2: This token structure is distinct from user JWTs.
 * - Different issuer: 'break-glass-authority'
 * - Different audience: 'internal-ops'
 * - Required claim: bg: true
 * 
 * Actor Binding (Option A):
 * - authorizedActors: explicit ID list of who can use this token
 * - No role-based expansion - only IDs
 * - Min 1, Max 5 actors
 * 
 * Security Note:
 * - ticketRef is NOT included in token (minimum disclosure principle)
 * - Use requestId for audit lookup if needed
 * - renewalsLeft is for informational purposes; enforcement is in renew API only
 * - jti is used for replay/anomaly detection
 */
export interface BreakGlassTokenClaims {
  /** Break-glass flag - MUST be true */
  bg: true;
  
  /** JWT ID - unique identifier for replay/anomaly detection */
  jti: string;
  
  /** Grant ID */
  grantId: string;
  
  /** Target tenant ID */
  targetTenantId: string;
  
  /** Granted scopes */
  scopes: string[];
  
  /** Remaining renewals (informational - enforcement in renew API only, NOT guard) */
  renewalsLeft: number;
  
  /**
   * Actor binding - explicit list of actor IDs authorized to use this token
   * Default: [requesterId]
   * If policy allows: [requesterId, approverId]
   * Max: 5 IDs (hardcoded limit)
   * NO role-based expansion
   */
  authorizedActors: string[];
  
  /** Requester ID (for audit trail) */
  requesterId: string;
  
  /** Approver ID (for audit trail) */
  approverId: string;
  
  /** Request ID (for audit lookup - replaces ticketRef in token) */
  requestId: string;
  
  /** Standard JWT claims */
  iss: 'break-glass-authority';
  aud: 'internal-ops';
  sub: string;  // token subject (approver)
  iat: number;
  exp: number;
}

/**
 * Maximum authorized actors per token
 */
export const MAX_AUTHORIZED_ACTORS = 5;

/**
 * Cross-tenant audit event types
 */
export type CrossTenantEventType =
  | 'CROSS_TENANT_ACCESS_REQUESTED'
  | 'CROSS_TENANT_ACCESS_GRANTED'
  | 'CROSS_TENANT_ACCESS_DENIED'
  | 'CROSS_TENANT_ACCESS_USED'
  | 'CROSS_TENANT_ACCESS_EXPIRED'
  | 'CROSS_TENANT_ACCESS_REVOKED';

/**
 * Cross-tenant audit event
 */
export interface CrossTenantAuditEvent {
  /** Event type */
  eventType: CrossTenantEventType;
  
  /** Event ID */
  eventId: string;
  
  /** Request ID */
  requestId: string;
  
  /** Grant ID (if applicable) */
  grantId?: string;
  
  /** Requester ID */
  requesterId: string;
  
  /** Approver ID (if applicable) */
  approverId?: string;
  
  /** Target tenant */
  targetTenantId: string;
  
  /** Resource scope accessed */
  resourceScope?: string;
  
  /** Reason (truncated for audit) */
  reason: {
    category: string;
    ticketRef: string;
    descriptionTruncated?: string;
  };
  
  /** Network information */
  network: {
    ip: string;
    userAgent?: string;
  };
  
  /** Authentication type */
  authType: string;
  
  /** Event timestamp */
  timestamp: string;
  
  /** Outcome */
  outcome: 'ALLOWED' | 'DENIED';
  
  /** Correlation ID */
  correlationId: string;
  
  /** Trace ID */
  traceId?: string;
  
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Resource-specific scopes for cross-tenant access
 */
export const CROSS_TENANT_SCOPES = {
  SNAPSHOT: 'cross_tenant_read:snapshot',
  LEGAL_HOLD: 'cross_tenant_read:legal_hold',
  EVIDENCE_BUNDLE: 'cross_tenant_read:evidence_bundle',
  INCIDENT: 'cross_tenant_read:incident',
} as const;

export type CrossTenantScope = typeof CROSS_TENANT_SCOPES[keyof typeof CROSS_TENANT_SCOPES];

/**
 * Validation patterns
 */
export const BREAK_GLASS_VALIDATION = {
  /** Ticket reference pattern (e.g., JIRA-123, INC-456) */
  TICKET_REF_PATTERN: /^[A-Z]+-\d+$/,
  
  /** Maximum description length */
  MAX_DESCRIPTION_LENGTH: 500,
  
  /** Minimum ticket reference length */
  MIN_TICKET_REF_LENGTH: 3,
} as const;

/**
 * Validate break-glass reason
 */
export function validateBreakGlassReason(reason: BreakGlassReason): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Validate category
  const validCategories: BreakGlassReasonCategory[] = [
    'CUSTOMER_SUPPORT',
    'INCIDENT_RESPONSE',
    'LEGAL_REQUEST',
    'AUDIT',
  ];
  if (!validCategories.includes(reason.category)) {
    errors.push(`Invalid category: ${reason.category}`);
  }

  // Validate ticket reference
  if (!reason.ticketRef || reason.ticketRef.trim().length < BREAK_GLASS_VALIDATION.MIN_TICKET_REF_LENGTH) {
    errors.push('Ticket reference is required and must be at least 3 characters');
  } else if (!BREAK_GLASS_VALIDATION.TICKET_REF_PATTERN.test(reason.ticketRef)) {
    errors.push(`Ticket reference must match pattern: ${BREAK_GLASS_VALIDATION.TICKET_REF_PATTERN}`);
  }

  // Validate description
  if (reason.description && reason.description.length > BREAK_GLASS_VALIDATION.MAX_DESCRIPTION_LENGTH) {
    errors.push(`Description must be at most ${BREAK_GLASS_VALIDATION.MAX_DESCRIPTION_LENGTH} characters`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate scope
 */
export function isValidCrossTenantScope(scope: string): scope is CrossTenantScope {
  return Object.values(CROSS_TENANT_SCOPES).includes(scope as CrossTenantScope);
}
