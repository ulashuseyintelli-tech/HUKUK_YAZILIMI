/**
 * Idempotency Gate Types
 * 
 * Phase 10.3 - PR-2
 * 
 * Type definitions for admin action idempotency gate.
 * 
 * @see .kiro/specs/phase-10-3-idempotency-hardening/design.md
 */

// ============================================================================
// Gate Result Types
// ============================================================================

/**
 * Result of checkAndAcquire operation.
 * 
 * PROCEED: Caller should execute the action
 * CACHED: Action already completed, return cached result
 * IN_PROGRESS: Action in progress by another caller, retry later
 */
export type GateResult =
  | {
      type: 'PROCEED';
      actionId: string;      // uuid
      ownerToken: string;    // uuid
      takeover: boolean;
      previousActorId?: string;
    }
  | {
      type: 'CACHED';
      actionId: string;
      httpStatus: number;
      payload: unknown;
    }
  | {
      type: 'IN_PROGRESS';
      actionId: string;
      retryAfterSeconds: number;
    };

// ============================================================================
// Input Types
// ============================================================================

export interface GateAcquireInput {
  requestId: string;
  actionType: string;
  endpoint: string;
  resourceType: string;
  resourceId: string | null;
  actorId: string;
  actorEmail: string | null;
  ipHash: string | null;
  leaseSeconds: number;
  retentionDays: number;
}

export interface GateCompleteInput {
  actionId: string;
  ownerToken: string;
  httpStatus: number;
  resultCode: string;
  resultJson: unknown;
}

export interface GateFailInput {
  actionId: string;
  ownerToken: string;
  httpStatus: number;
  resultCode: string;
  errorJson: unknown;
}

export interface GateExtendLeaseInput {
  actionId: string;
  ownerToken: string;
  leaseSeconds: number;
  maxTotalSeconds: number;
}

// ============================================================================
// Action Status
// ============================================================================

export type AdminActionStatus = 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';

// ============================================================================
// Raw DB Row Type
// ============================================================================

export interface AdminActionRow {
  id: string;
  request_id: string;
  status: AdminActionStatus;
  http_status: number | null;
  result_code: string | null;
  result_json: unknown | null;
  action_type: string;
  endpoint: string;
  resource_type: string;
  resource_id: string | null;
  actor_id: string;
  actor_email: string | null;
  ip_hash: string | null;
  owner_token: string;
  lease_expires_at: Date;
  created_at: Date;
  completed_at: Date | null;
  expires_at: Date;
}

// ============================================================================
// Configuration
// ============================================================================

export interface IdempotencyGateConfig {
  defaultLeaseSeconds: number;
  defaultRetentionDays: number;
  retryAfterSeconds: number;
}

export const DEFAULT_IDEMPOTENCY_CONFIG: IdempotencyGateConfig = {
  defaultLeaseSeconds: 30,
  defaultRetentionDays: 7,
  retryAfterSeconds: 3,
};
