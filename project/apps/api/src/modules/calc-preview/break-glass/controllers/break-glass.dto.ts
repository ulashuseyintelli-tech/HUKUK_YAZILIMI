/**
 * Break-Glass Controller DTOs
 * 
 * Request/Response DTOs for break-glass management endpoints.
 */

import {
  BreakGlassReasonCategory,
  BreakGlassRequestStatus,
  CrossTenantAuditEvent,
} from '../break-glass.types';

// ============================================================================
// Request DTOs
// ============================================================================

/**
 * Create break-glass request DTO
 */
export interface CreateBreakGlassRequestDto {
  /** Target tenant to access */
  targetTenantId: string;
  
  /** Requested scopes (e.g., ['cross_tenant_read:snapshot']) */
  requestedScopes: string[];
  
  /** Structured reason */
  reason: {
    category: BreakGlassReasonCategory;
    ticketRef: string;
    description?: string;
  };
}

/**
 * Approve break-glass request DTO
 */
export interface ApproveBreakGlassRequestDto {
  /** Request ID to approve */
  requestId: string;
}

/**
 * Deny break-glass request DTO
 */
export interface DenyBreakGlassRequestDto {
  /** Request ID to deny */
  requestId: string;
  
  /** Optional denial reason (max 200 chars) */
  denialReason?: string;
}

/**
 * Revoke break-glass grant DTO
 */
export interface RevokeBreakGlassGrantDto {
  /** Grant ID to revoke */
  grantId: string;
  
  /** Optional revocation reason */
  reason?: string;
}

/**
 * Renew break-glass grant DTO
 */
export interface RenewBreakGlassGrantDto {
  /** Grant ID to renew */
  grantId: string;
  
  /** Ticket reference (must match original) */
  ticketRef: string;
}

// ============================================================================
// Response DTOs
// ============================================================================

/**
 * Break-glass request response
 */
export interface BreakGlassRequestResponseDto {
  requestId: string;
  requesterId: string;
  requesterName?: string;
  targetTenantId: string;
  requestedScopes: string[];
  reason: {
    category: string;
    ticketRef: string;
    description?: string;
  };
  requestedAt: string;
  expiresAt: string;
  status: BreakGlassRequestStatus;
  denialReason?: string;
}

/**
 * Break-glass grant response
 */
export interface BreakGlassGrantResponseDto {
  grantId: string;
  requestId: string;
  approverId: string;
  approverName?: string;
  targetTenantId: string;
  grantedScopes: string[];
  grantedAt: string;
  expiresAt: string;
  renewalCount: number;
  maxRenewals: number;
  isActive: boolean;
}

/**
 * Create request response
 */
export interface CreateRequestResponseDto {
  requestId: string;
  expiresAt: string;
}

/**
 * Approve request response
 */
export interface ApproveRequestResponseDto {
  grantId: string;
  token: string;
  expiresAt: string;
}

/**
 * Deny request response
 */
export interface DenyRequestResponseDto {
  requestId: string;
  status: 'DENIED';
  denialReason?: string;
}

/**
 * Revoke grant response
 */
export interface RevokeGrantResponseDto {
  success: boolean;
  grantId: string;
  revokedAt: string;
}

/**
 * Renew grant response
 */
export interface RenewGrantResponseDto {
  grantId: string;
  token: string;
  expiresAt: string;
  renewalCount: number;
  renewalsLeft: number;
}

/**
 * Request status response
 */
export interface RequestStatusResponseDto {
  request: BreakGlassRequestResponseDto;
  grant?: BreakGlassGrantResponseDto;
  auditTrail: CrossTenantAuditEvent[];
}

// ============================================================================
// Error Response DTOs
// ============================================================================

/**
 * Standard error response
 */
export interface ErrorResponseDto {
  error: string;
  message: string;
  details?: Record<string, unknown>;
}

