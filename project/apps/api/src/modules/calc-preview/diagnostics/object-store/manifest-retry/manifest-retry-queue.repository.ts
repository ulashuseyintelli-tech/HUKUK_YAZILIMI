/**
 * Manifest Retry Queue Repository
 * 
 * Phase 10 - Task 10.1.4
 * 
 * PostgreSQL-based retry queue with:
 * - Per-bundle de-dup (partial unique index)
 * - SKIP LOCKED claim (concurrent-safe)
 * - Lease-based processing
 * 
 * LOCKED CONTRACT - See design.md for state machine.
 * 
 * @see .kiro/specs/phase-10-retry-signature/design.md
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../../prisma/prisma.service';
import { ManifestErrorCode } from './manifest-error-classifier';
import {
  RetryQueueJob,
  RetryQueueStatus,
  DoneReason,
  RetrySource,
  CreateRetryJobInput,
  EnqueueResult,
  ClaimResult,
  ScheduleRetryInput,
  MarkDoneInput,
  BACKOFF_CONFIG,
} from './manifest-retry.types';
import {
  decodeCursor,
  createCursorFromRecord,
  CursorValidationError,
} from './cursor-pagination';

// ============================================================================
// Repository Interface
// ============================================================================

export interface IManifestRetryQueueRepository {
  /**
   * Enqueue a new retry job for a bundle.
   * Returns ALREADY_QUEUED if active job exists (de-dup).
   */
  enqueue(input: CreateRetryJobInput): Promise<EnqueueResult>;
  
  /**
   * Claim next available job for processing.
   * Uses FOR UPDATE SKIP LOCKED for concurrent safety.
   */
  claimNext(workerId: string, leaseMs?: number): Promise<ClaimResult>;
  
  /**
   * Schedule retry for a job (transient error).
   * Updates attempt count, next_attempt_at, and error info.
   */
  scheduleRetry(input: ScheduleRetryInput): Promise<void>;
  
  /**
   * Mark job as done (success, DONE_NOOP, or DLQ).
   */
  markDone(input: MarkDoneInput): Promise<void>;
  
  /**
   * Extend lease for a job (heartbeat).
   */
  extendLease(jobId: string, workerId: string, leaseMs?: number): Promise<boolean>;
  
  /**
   * Get job by ID.
   */
  getById(jobId: string): Promise<RetryQueueJob | null>;
  
  /**
   * Get active job for bundle (if exists).
   */
  getActiveByBundleId(bundleId: string): Promise<RetryQueueJob | null>;
  
  /**
   * Get queue statistics.
   */
  getStats(): Promise<RetryQueueStats>;
  
  /**
   * Query jobs with cursor-based pagination.
   * 
   * Uses (created_at, id) tuple for stable ordering.
   * Supports optional status filter.
   * 
   * @param options - Query options with cursor, limit, status
   * @returns Paginated result with items, nextCursor, hasMore
   */
  queryWithCursor(options: JobCursorQueryOptions): Promise<JobCursorQueryResult>;
}

export interface RetryQueueStats {
  pending: number;
  inProgress: number;
  retryScheduled: number;
  done: number;
  total: number;
  oldestPendingAge?: number; // seconds
}

/**
 * Cursor-based pagination query options for retry queue
 */
export interface JobCursorQueryOptions {
  /** Status filter (optional - null means all statuses) */
  status?: RetryQueueStatus | null;
  /** Maximum items per page (default: 50, max: 200) */
  limit: number;
  /** Cursor from previous page (null for first page) */
  cursor?: string | null;
}

/**
 * Cursor-based pagination result for retry queue
 */
export interface JobCursorQueryResult {
  items: RetryQueueJob[];
  page: {
    limit: number;
    nextCursor: string | null;
    hasMore: boolean;
  };
}

// ============================================================================
// Prisma Implementation
// ============================================================================

@Injectable()
export class PrismaManifestRetryQueueRepository implements IManifestRetryQueueRepository {
  private readonly logger = new Logger(PrismaManifestRetryQueueRepository.name);
  
  constructor(private readonly prisma: PrismaService) {}
  
  // ==========================================================================
  // Enqueue
  // ==========================================================================
  
  async enqueue(input: CreateRetryJobInput): Promise<EnqueueResult> {
    const { bundleId, source, errorCode, errorMessage } = input;
    
    // Check for existing active job (de-dup)
    const existing = await this.getActiveByBundleId(bundleId);
    if (existing) {
      this.logger.debug(`[enqueue] Already queued: bundleId=${bundleId}, jobId=${existing.id}`);
      return {
        enqueued: false,
        reason: 'ALREADY_QUEUED',
        existingJobId: existing.id,
        nextAttemptAt: existing.nextAttemptAt ?? undefined,
      };
    }
    
    // Insert new job
    try {
      const result = await this.prisma.$queryRaw<{ id: string }[]>`
        INSERT INTO manifest_retry_queue (
          bundle_id, status, attempt, max_attempts, source, 
          last_error_code, last_error_message, created_at, updated_at
        )
        VALUES (
          ${bundleId}::uuid, 'PENDING', 0, ${BACKOFF_CONFIG.maxAttempts}, ${source},
          ${errorCode ?? null}, ${errorMessage ?? null}, NOW(), NOW()
        )
        ON CONFLICT DO NOTHING
        RETURNING id
      `;
      
      if (result.length === 0) {
        // Conflict - another job was inserted concurrently
        const concurrent = await this.getActiveByBundleId(bundleId);
        return {
          enqueued: false,
          reason: 'ALREADY_QUEUED',
          existingJobId: concurrent?.id,
          nextAttemptAt: concurrent?.nextAttemptAt ?? undefined,
        };
      }
      
      this.logger.debug(`[enqueue] Created job: bundleId=${bundleId}, jobId=${result[0].id}`);
      return {
        enqueued: true,
        jobId: result[0].id,
        reason: 'CREATED',
      };
    } catch (error) {
      this.logger.error(`[enqueue] Failed: bundleId=${bundleId}`, error);
      throw error;
    }
  }
  
  // ==========================================================================
  // Claim Next (SKIP LOCKED)
  // ==========================================================================
  
  async claimNext(workerId: string, leaseMs: number = BACKOFF_CONFIG.leaseMs): Promise<ClaimResult> {
    const leaseInterval = `${leaseMs} milliseconds`;
    
    try {
      // Atomic claim with FOR UPDATE SKIP LOCKED
      const result = await this.prisma.$queryRaw<RawRetryQueueJob[]>`
        WITH candidate AS (
          SELECT id
          FROM manifest_retry_queue
          WHERE status IN ('PENDING', 'RETRY_SCHEDULED')
            AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
            AND (leased_until IS NULL OR leased_until < NOW())
          ORDER BY COALESCE(next_attempt_at, created_at) ASC
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        )
        UPDATE manifest_retry_queue q
        SET 
          status = 'IN_PROGRESS',
          leased_until = NOW() + ${leaseInterval}::interval,
          leased_by = ${workerId},
          updated_at = NOW()
        FROM candidate
        WHERE q.id = candidate.id
        RETURNING 
          q.id,
          q.bundle_id,
          q.status,
          q.attempt,
          q.max_attempts,
          q.next_attempt_at,
          q.leased_until,
          q.leased_by,
          q.last_error_code,
          q.last_error_message,
          q.done_reason,
          q.source,
          q.created_at,
          q.updated_at
      `;
      
      if (result.length === 0) {
        return { claimed: false, reason: 'NO_JOBS_AVAILABLE' };
      }
      
      const job = this.mapRawToJob(result[0]);
      this.logger.debug(`[claimNext] Claimed job: jobId=${job.id}, bundleId=${job.bundleId}, workerId=${workerId}`);
      
      return { claimed: true, job, reason: 'CLAIMED' };
    } catch (error) {
      this.logger.error(`[claimNext] Failed: workerId=${workerId}`, error);
      throw error;
    }
  }
  
  // ==========================================================================
  // Schedule Retry
  // ==========================================================================
  
  async scheduleRetry(input: ScheduleRetryInput): Promise<void> {
    const { jobId, errorCode, errorMessage, nextAttemptAt } = input;
    
    try {
      await this.prisma.$executeRaw`
        UPDATE manifest_retry_queue
        SET 
          status = 'RETRY_SCHEDULED',
          attempt = attempt + 1,
          next_attempt_at = ${nextAttemptAt},
          leased_until = NULL,
          leased_by = NULL,
          last_error_code = ${errorCode},
          last_error_message = ${errorMessage ?? null},
          updated_at = NOW()
        WHERE id = ${jobId}::uuid
          AND status = 'IN_PROGRESS'
      `;
      
      this.logger.debug(`[scheduleRetry] Scheduled: jobId=${jobId}, nextAttemptAt=${nextAttemptAt.toISOString()}`);
    } catch (error) {
      this.logger.error(`[scheduleRetry] Failed: jobId=${jobId}`, error);
      throw error;
    }
  }
  
  // ==========================================================================
  // Mark Done
  // ==========================================================================
  
  async markDone(input: MarkDoneInput): Promise<void> {
    const { jobId, reason } = input;
    
    try {
      await this.prisma.$executeRaw`
        UPDATE manifest_retry_queue
        SET 
          status = 'DONE',
          done_reason = ${reason},
          leased_until = NULL,
          leased_by = NULL,
          updated_at = NOW()
        WHERE id = ${jobId}::uuid
          AND status = 'IN_PROGRESS'
      `;
      
      this.logger.debug(`[markDone] Done: jobId=${jobId}, reason=${reason}`);
    } catch (error) {
      this.logger.error(`[markDone] Failed: jobId=${jobId}`, error);
      throw error;
    }
  }
  
  // ==========================================================================
  // Extend Lease
  // ==========================================================================
  
  async extendLease(jobId: string, workerId: string, leaseMs: number = BACKOFF_CONFIG.leaseMs): Promise<boolean> {
    const leaseInterval = `${leaseMs} milliseconds`;
    
    try {
      const result = await this.prisma.$executeRaw`
        UPDATE manifest_retry_queue
        SET 
          leased_until = NOW() + ${leaseInterval}::interval,
          updated_at = NOW()
        WHERE id = ${jobId}::uuid
          AND status = 'IN_PROGRESS'
          AND leased_by = ${workerId}
      `;
      
      return result > 0;
    } catch (error) {
      this.logger.error(`[extendLease] Failed: jobId=${jobId}`, error);
      throw error;
    }
  }
  
  // ==========================================================================
  // Get By ID
  // ==========================================================================
  
  async getById(jobId: string): Promise<RetryQueueJob | null> {
    try {
      const result = await this.prisma.$queryRaw<RawRetryQueueJob[]>`
        SELECT 
          id, bundle_id, status, attempt, max_attempts,
          next_attempt_at, leased_until, leased_by,
          last_error_code, last_error_message, done_reason,
          source, created_at, updated_at
        FROM manifest_retry_queue
        WHERE id = ${jobId}::uuid
      `;
      
      return result.length > 0 ? this.mapRawToJob(result[0]) : null;
    } catch (error) {
      this.logger.error(`[getById] Failed: jobId=${jobId}`, error);
      throw error;
    }
  }
  
  // ==========================================================================
  // Get Active By Bundle ID
  // ==========================================================================
  
  async getActiveByBundleId(bundleId: string): Promise<RetryQueueJob | null> {
    try {
      const result = await this.prisma.$queryRaw<RawRetryQueueJob[]>`
        SELECT 
          id, bundle_id, status, attempt, max_attempts,
          next_attempt_at, leased_until, leased_by,
          last_error_code, last_error_message, done_reason,
          source, created_at, updated_at
        FROM manifest_retry_queue
        WHERE bundle_id = ${bundleId}::uuid
          AND status IN ('PENDING', 'IN_PROGRESS', 'RETRY_SCHEDULED')
        LIMIT 1
      `;
      
      return result.length > 0 ? this.mapRawToJob(result[0]) : null;
    } catch (error) {
      this.logger.error(`[getActiveByBundleId] Failed: bundleId=${bundleId}`, error);
      throw error;
    }
  }
  
  // ==========================================================================
  // Get Stats
  // ==========================================================================
  
  async getStats(): Promise<RetryQueueStats> {
    try {
      const result = await this.prisma.$queryRaw<{
        status: string;
        count: bigint;
        oldest_age_seconds: number | null;
      }[]>`
        SELECT 
          status,
          COUNT(*) as count,
          EXTRACT(EPOCH FROM (NOW() - MIN(created_at)))::integer as oldest_age_seconds
        FROM manifest_retry_queue
        GROUP BY status
      `;
      
      const stats: RetryQueueStats = {
        pending: 0,
        inProgress: 0,
        retryScheduled: 0,
        done: 0,
        total: 0,
      };
      
      for (const row of result) {
        const count = Number(row.count);
        stats.total += count;
        
        switch (row.status) {
          case 'PENDING':
            stats.pending = count;
            if (row.oldest_age_seconds !== null) {
              stats.oldestPendingAge = row.oldest_age_seconds;
            }
            break;
          case 'IN_PROGRESS':
            stats.inProgress = count;
            break;
          case 'RETRY_SCHEDULED':
            stats.retryScheduled = count;
            break;
          case 'DONE':
            stats.done = count;
            break;
        }
      }
      
      return stats;
    } catch (error) {
      this.logger.error('[getStats] Failed', error);
      throw error;
    }
  }
  
  // ==========================================================================
  // Query With Cursor (Phase 10.2 - Task 4.5)
  // ==========================================================================
  
  /**
   * Query retry jobs with cursor-based pagination.
   * 
   * SQL Pattern:
   * - Optional status filter: ($1::text IS NULL OR status = $1::text)
   * - Cursor filter: (created_at, id) < ($cursor_created_at, $cursor_id)
   * - Stable ordering: ORDER BY created_at DESC, id DESC
   * - Fetch limit + 1 to determine hasMore
   * 
   * @param options - Query options
   * @returns Paginated result with items, page metadata
   * @throws CursorValidationError if cursor is invalid (400 INVALID_CURSOR)
   */
  async queryWithCursor(options: JobCursorQueryOptions): Promise<JobCursorQueryResult> {
    const { status, limit, cursor } = options;
    
    try {
      // Decode cursor if provided
      const decodedCursor = cursor ? decodeCursor(cursor) : null;
      
      // Build query with optional status filter and cursor
      let entries: RawRetryQueueJob[];
      
      if (decodedCursor) {
        // With cursor: filter by (created_at, id) < (cursor_created_at, cursor_id)
        entries = await this.prisma.$queryRaw<RawRetryQueueJob[]>`
          SELECT 
            id, bundle_id, status, attempt, max_attempts,
            next_attempt_at, leased_until, leased_by,
            last_error_code, last_error_message, done_reason,
            source, created_at, updated_at
          FROM manifest_retry_queue
          WHERE (${status}::text IS NULL OR status = ${status}::text)
            AND (created_at, id) < (${decodedCursor.createdAt}, ${decodedCursor.id}::uuid)
          ORDER BY created_at DESC, id DESC
          LIMIT ${limit + 1}
        `;
      } else {
        // First page: no cursor filter
        entries = await this.prisma.$queryRaw<RawRetryQueueJob[]>`
          SELECT 
            id, bundle_id, status, attempt, max_attempts,
            next_attempt_at, leased_until, leased_by,
            last_error_code, last_error_message, done_reason,
            source, created_at, updated_at
          FROM manifest_retry_queue
          WHERE (${status}::text IS NULL OR status = ${status}::text)
          ORDER BY created_at DESC, id DESC
          LIMIT ${limit + 1}
        `;
      }
      
      // Process results
      const hasMore = entries.length > limit;
      const items = hasMore ? entries.slice(0, limit) : entries;
      const mappedItems = items.map(this.mapRawToJob);
      
      // Generate next cursor from last item
      const lastItem = mappedItems[mappedItems.length - 1];
      const nextCursor = hasMore && lastItem 
        ? createCursorFromRecord(lastItem) 
        : null;
      
      return {
        items: mappedItems,
        page: {
          limit,
          nextCursor,
          hasMore,
        },
      };
    } catch (error) {
      // Re-throw cursor validation errors as-is
      if (error instanceof CursorValidationError) {
        throw error;
      }
      this.logger.error('[queryWithCursor] Failed', error);
      throw error;
    }
  }
  
  // ==========================================================================
  // Private Helpers
  // ==========================================================================
  
  private mapRawToJob(raw: RawRetryQueueJob): RetryQueueJob {
    return {
      id: raw.id,
      bundleId: raw.bundle_id,
      status: raw.status as RetryQueueStatus,
      attempt: raw.attempt,
      maxAttempts: raw.max_attempts,
      nextAttemptAt: raw.next_attempt_at,
      leasedUntil: raw.leased_until,
      leasedBy: raw.leased_by,
      lastErrorCode: raw.last_error_code as ManifestErrorCode | null,
      lastErrorMessage: raw.last_error_message,
      doneReason: raw.done_reason as DoneReason | null,
      source: raw.source as RetrySource,
      createdAt: raw.created_at,
      updatedAt: raw.updated_at,
    };
  }
}

// ============================================================================
// Raw Types (DB row shape)
// ============================================================================

interface RawRetryQueueJob {
  id: string;
  bundle_id: string;
  status: string;
  attempt: number;
  max_attempts: number;
  next_attempt_at: Date | null;
  leased_until: Date | null;
  leased_by: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  done_reason: string | null;
  source: string;
  created_at: Date;
  updated_at: Date;
}
