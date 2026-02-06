/**
 * Manifest Admin Audit Types
 * 
 * Phase 10.2 - Task 2.1
 * 
 * Type definitions for admin audit service.
 */

// ============================================================================
// Audit Event Types
// ============================================================================

export type AuditEventType =
  | 'DLQ_RESOLVE'
  | 'DLQ_REDRIVE'
  | 'DLQ_BULK_REDRIVE'
  | 'WORKER_RESUME'
  | 'WORKER_PAUSE'
  | 'CB_OVERRIDE'
  | 'ADMIN_ACTION'
  | 'IDEMPOTENCY_TAKEOVER';

export type AuditResourceType = 'DLQ_ENTRY' | 'RETRY_JOB' | 'WORKER' | 'BUNDLE';

/**
 * Audit outcome for ADMIN_ACTION events
 */
export type AuditOutcome = 'SUCCESS' | 'FAILED' | 'TAKEOVER';

/**
 * Input for creating an audit event
 */
export interface AuditEventInput {
  eventType: AuditEventType;
  actor: string;
  requestId: string;
  ipAddress: string | null;
  userAgent: string | null;
  resourceType: AuditResourceType;
  resourceId: string;
  targetBundleId: string | null;
  beforeState: Record<string, unknown> | null;
  afterState: Record<string, unknown> | null;
  reason: string | null;
  /** Idempotency gate action ID (PR-4) */
  actionId?: string;
  /** Outcome for ADMIN_ACTION events (PR-4) */
  outcome?: AuditOutcome;
  /** Previous actor ID for takeover events (PR-4) */
  takeoverFrom?: string | null;
  /** Error code for failed actions (PR-4) */
  errorCode?: string;
  /** Error message for failed actions, max 512 chars (PR-4) */
  errorMessage?: string;
}

/**
 * Internal audit event with timestamp
 * 
 * Note: Uses Omit to override optional fields from AuditEventInput
 * with required null-safe versions for internal storage.
 */
export interface AuditEvent extends Omit<AuditEventInput, 'actionId' | 'outcome' | 'takeoverFrom' | 'errorCode' | 'errorMessage'> {
  /** Append time (when event was created) */
  createdAt: Date;
  /** Hashed IP (null if no secret or no IP) */
  ipHash: string | null;
  /** Idempotency gate action ID (PR-4) - normalized to null */
  actionId: string | null;
  /** Outcome for ADMIN_ACTION events (PR-4) - normalized to null */
  outcome: AuditOutcome | null;
  /** Previous actor ID for takeover events (PR-4) - normalized to null */
  takeoverFrom: string | null;
  /** Error code for failed actions (PR-4) - normalized to null */
  errorCode: string | null;
  /** Error message for failed actions (PR-4) - normalized to null */
  errorMessage: string | null;
}

// ============================================================================
// Service State Types
// ============================================================================

export type AuditServiceMode = 'NORMAL' | 'DEGRADED';

export type FlushReason = 'timer' | 'size' | 'shutdown' | 'manual';

export interface AuditServiceState {
  mode: AuditServiceMode;
  consecutiveFailures: number;
  degradedSince: Date | null;
  lastHealthCheckAt: Date | null;
  bufferSize: number;
  totalFlushed: number;
  totalDropped: number;
  totalFileSinkWrites: number;
}

// ============================================================================
// Configuration
// ============================================================================

export interface AuditServiceConfig {
  /** Maximum buffer size before dropping events */
  maxBufferSize: number;
  /** Flush interval in milliseconds */
  flushIntervalMs: number;
  /** Consecutive failures before degraded mode */
  consecutiveFailThreshold: number;
  /** Health check interval in degraded mode (ms) */
  recoveryCheckIntervalMs: number;
  /** Shutdown flush timeout (ms) */
  shutdownFlushTimeoutMs: number;
  /** File sink path */
  fileSinkPath: string;
  /** File sink max bytes per file */
  fileSinkMaxBytes: number;
  /** File sink max files for rotation */
  fileSinkMaxFiles: number;
  /** HMAC secret for IP hashing (null = no hashing, IP stored as null) */
  ipHashSecret: string | null;
}

export const DEFAULT_AUDIT_CONFIG: AuditServiceConfig = {
  maxBufferSize: 1000,
  flushIntervalMs: 5000,
  consecutiveFailThreshold: 3,
  recoveryCheckIntervalMs: 30000,
  shutdownFlushTimeoutMs: 2000,
  fileSinkPath: process.env.AUDIT_FILE_SINK_PATH || '/tmp/audit-degraded.jsonl',
  fileSinkMaxBytes: 50 * 1024 * 1024, // 50MB
  fileSinkMaxFiles: 10,
  ipHashSecret: process.env.AUDIT_IP_HASH_SECRET || null,
};
