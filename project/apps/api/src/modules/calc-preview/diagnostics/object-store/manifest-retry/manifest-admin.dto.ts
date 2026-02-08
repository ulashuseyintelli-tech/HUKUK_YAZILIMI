/**
 * Manifest Admin API DTOs
 * 
 * Phase 10 - Task 10.1.8-11
 * Phase 10.2 - Task 4.5 (Cursor Pagination)
 * 
 * Request/Response DTOs for admin endpoints.
 */

import { IsString, IsOptional, IsEnum, IsInt, Min, Max } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { DlqStatus, RetryQueueStatus } from './manifest-retry.types';

// ============================================================================
// Status Allowlists (Single Source of Truth)
// ============================================================================

/**
 * DLQ Status Allowlist
 * CRITICAL: Must match DB enum exactly
 */
export const DLQ_STATUS_ALLOWLIST = ['DLQ_OPEN', 'DLQ_RESOLVED', 'DLQ_REDROVE'] as const;
export type DlqStatusAllowlist = typeof DLQ_STATUS_ALLOWLIST[number];

/**
 * Job Status Allowlist
 * CRITICAL: Must match DB enum exactly
 */
export const JOB_STATUS_ALLOWLIST = ['PENDING', 'IN_PROGRESS', 'RETRY_SCHEDULED', 'DONE'] as const;
export type JobStatusAllowlist = typeof JOB_STATUS_ALLOWLIST[number];

// ============================================================================
// Pagination Constants
// ============================================================================

export const PAGINATION_DEFAULTS = {
  DEFAULT_LIMIT: 50,
  MAX_LIMIT: 200,
} as const;

// ============================================================================
// Retry Endpoint DTOs
// ============================================================================

export class AdminRetryResponseDto {
  enqueued!: boolean;
  bundleId!: string;
  jobId?: string;
  reason?: 'CREATED' | 'ALREADY_QUEUED' | 'MANIFEST_EXISTS';
  existingJobId?: string;
  nextAttemptAt?: string;
}

// ============================================================================
// Retry Queue Stats DTOs
// ============================================================================

export class RetryQueueStatsResponseDto {
  pending!: number;
  inProgress!: number;
  retryScheduled!: number;
  done!: number;
  total!: number;
  oldestPendingAge?: number;
}

// ============================================================================
// DLQ Query DTOs
// ============================================================================

export class DlqQueryDto {
  @IsOptional()
  @IsEnum(['DLQ_OPEN', 'DLQ_RESOLVED', 'DLQ_REDROVE'])
  status?: DlqStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;
}

// ============================================================================
// Cursor Pagination DTOs (Phase 10.2 - Task 4.5)
// ============================================================================

/**
 * DLQ Cursor Query DTO
 * 
 * Query params:
 * - status: optional, must be in DLQ_STATUS_ALLOWLIST
 * - limit: default 50, max 200 (silent clamp)
 * - cursor: optional, base64url encoded
 */
export class DlqCursorQueryDto {
  @IsOptional()
  @IsEnum(DLQ_STATUS_ALLOWLIST, {
    message: `status must be one of: ${DLQ_STATUS_ALLOWLIST.join(', ')}`,
  })
  status?: DlqStatusAllowlist;

  @IsOptional()
  @Type(() => Number)
  @Transform(({ value }) => {
    const num = Number(value);
    if (isNaN(num)) return PAGINATION_DEFAULTS.DEFAULT_LIMIT;
    return Math.min(Math.max(1, Math.floor(num)), PAGINATION_DEFAULTS.MAX_LIMIT);
  })
  limit?: number = PAGINATION_DEFAULTS.DEFAULT_LIMIT;

  @IsOptional()
  @IsString()
  cursor?: string;
}

/**
 * Job Cursor Query DTO
 * 
 * Query params:
 * - status: optional, must be in JOB_STATUS_ALLOWLIST
 * - limit: default 50, max 200 (silent clamp)
 * - cursor: optional, base64url encoded
 */
export class JobCursorQueryDto {
  @IsOptional()
  @IsEnum(JOB_STATUS_ALLOWLIST, {
    message: `status must be one of: ${JOB_STATUS_ALLOWLIST.join(', ')}`,
  })
  status?: JobStatusAllowlist;

  @IsOptional()
  @Type(() => Number)
  @Transform(({ value }) => {
    const num = Number(value);
    if (isNaN(num)) return PAGINATION_DEFAULTS.DEFAULT_LIMIT;
    return Math.min(Math.max(1, Math.floor(num)), PAGINATION_DEFAULTS.MAX_LIMIT);
  })
  limit?: number = PAGINATION_DEFAULTS.DEFAULT_LIMIT;

  @IsOptional()
  @IsString()
  cursor?: string;
}

/**
 * Page metadata for cursor pagination responses
 */
export interface PageMetadataDto {
  limit: number;
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * DLQ Cursor Query Response DTO
 */
export class DlqCursorQueryResponseDto {
  items!: DlqEntryDto[];
  page!: PageMetadataDto;
}

/**
 * Job Entry DTO for cursor pagination
 */
export class JobEntryDto {
  id!: string;
  bundleId!: string;
  status!: RetryQueueStatus;
  attempt!: number;
  maxAttempts!: number;
  nextAttemptAt?: string | null;
  leasedUntil?: string | null;
  leasedBy?: string | null;
  lastErrorCode?: string | null;
  lastErrorMessage?: string | null;
  doneReason?: string | null;
  source!: string;
  createdAt!: string;
  updatedAt!: string;
}

/**
 * Job Cursor Query Response DTO
 */
export class JobCursorQueryResponseDto {
  items!: JobEntryDto[];
  page!: PageMetadataDto;
}


export class DlqEntryDto {
  id!: string;
  bundleId!: string;
  attempt!: number;
  finalErrorCode!: string;
  finalErrorMessage?: string | null;
  firstFailedAt!: string;
  lastFailedAt!: string;
  status!: DlqStatus;
  resolvedAt?: string | null;
  resolvedBy?: string | null;
  resolutionNote?: string | null;
  createdAt!: string;
  // Phase 11.3 - Poison tracking
  isPoison!: boolean;
  poisonReason?: string | null;
  // Phase 11.4 - Rate limiting visibility
  redriveCount!: number;
  lastRedrivenAt?: string | null;
  nextAllowedRedriveAt?: string | null;
  rateLimitReason?: string | null;
}

export class DlqQueryResponseDto {
  entries!: DlqEntryDto[];
  total!: number;
  oldestAge?: number;
}

// ============================================================================
// DLQ Resolve DTOs
// ============================================================================

export class DlqResolveDto {
  @IsString()
  resolution!: 'manual_fix' | 'wont_fix' | 'duplicate';

  @IsOptional()
  @IsString()
  notes?: string;
}

export class DlqResolveResponseDto {
  resolved!: boolean;
  dlqId!: string;
  resolvedBy!: string;
  resolvedAt!: string;
}

// ============================================================================
// DLQ Redrive DTOs
// ============================================================================

/**
 * DLQ Redrive Response Reasons
 * 
 * REDRIVEN         - Successfully redriven to retry queue
 * ALREADY_REDRIVEN - Entry was already redriven (status = DLQ_REDROVE)
 * ALREADY_RESOLVED - Entry was manually resolved (status = DLQ_RESOLVED)
 * ALREADY_QUEUED   - Retry job already exists for this bundle
 * NOT_DLQ_OPEN     - Entry exists but not in DLQ_OPEN status
 * SIZE_EXCEEDED    - Carrier size limit exceeded (Task 7)
 * INVALID_CARRIER  - Carrier validation/upgrade failed (Task 7)
 */
export type DlqRedriveReason = 
  | 'REDRIVEN' 
  | 'ALREADY_REDRIVEN'
  | 'ALREADY_RESOLVED' 
  | 'ALREADY_QUEUED'
  | 'NOT_DLQ_OPEN'
  | 'SIZE_EXCEEDED'
  | 'INVALID_CARRIER';

/**
 * DLQ Redrive Response DTO
 * 
 * Task 7 additions:
 * - correlationId: new correlation ID for redriven carrier
 * - parentCorrelationId: original correlation ID (immutable link)
 */
export class DlqRedriveResponseDto {
  redriven!: boolean;
  dlqId!: string;
  bundleId!: string;
  newJobId?: string;
  existingJobId?: string;
  reason?: DlqRedriveReason;
  
  /** New correlation ID for redriven carrier (Task 7) */
  correlationId?: string;
  
  /** Original correlation ID - immutable parent link (Task 7) */
  parentCorrelationId?: string;
  
  /** Current redrive depth (Phase 11.3) */
  currentDepth?: number;

  /** Current enqueue count after this redrive (Phase 11.4) */
  redriveCount?: number;

  /** Next allowed redrive time — ISO 8601 (Phase 11.4) */
  nextAllowedRedriveAt?: string;
}

