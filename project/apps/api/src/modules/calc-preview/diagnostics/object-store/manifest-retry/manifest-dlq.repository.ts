/**
 * Manifest Dead Letter Queue Repository
 * 
 * Phase 10 - Task 10.1.5
 * 
 * PostgreSQL-based DLQ for permanent manifest failures.
 * 
 * LOCKED CONTRACT - See design.md for state machine.
 * 
 * @see .kiro/specs/phase-10-retry-signature/design.md
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../../prisma/prisma.service';
import { ManifestErrorCode } from './manifest-error-classifier';
import {
  DlqEntry,
  DlqStatus,
  CreateDlqEntryInput,
  ResolveDlqInput,
  DlqQueryOptions,
  DlqQueryResult,
} from './manifest-retry.types';
import {
  decodeCursor,
  createCursorFromRecord,
  CursorValidationError,
} from './cursor-pagination';

// ============================================================================
// Repository Interface
// ============================================================================

export interface IManifestDlqRepository {
  /**
   * Create or update DLQ entry for a bundle.
   * If entry exists, updates last_failed_at and attempt count.
   */
  upsert(input: CreateDlqEntryInput): Promise<DlqEntry>;
  
  /**
   * Get DLQ entry by ID.
   */
  getById(dlqId: string): Promise<DlqEntry | null>;
  
  /**
   * Get DLQ entry by bundle ID.
   */
  getByBundleId(bundleId: string): Promise<DlqEntry | null>;
  
  /**
   * Query DLQ entries with pagination.
   */
  query(options?: DlqQueryOptions): Promise<DlqQueryResult>;
  
  /**
   * Query DLQ entries with cursor-based pagination.
   * 
   * Uses (created_at, id) tuple for stable ordering.
   * Supports optional status filter.
   * 
   * @param options - Query options with cursor, limit, status
   * @returns Paginated result with items, nextCursor, hasMore
   */
  queryWithCursor(options: DlqCursorQueryOptions): Promise<DlqCursorQueryResult>;
  
  /**
   * Resolve DLQ entry (manual resolution).
   */
  resolve(input: ResolveDlqInput): Promise<DlqEntry>;
  
  /**
   * Mark entry as redriven.
   * @deprecated Use atomicRedrive for transactional safety
   */
  markRedriven(dlqId: string, redrivenBy?: string): Promise<void>;
  
  /**
   * Atomically redrive a DLQ entry back to the retry queue.
   * Transactional: UPDATE DLQ + INSERT retry job in single transaction.
   * 
   * @param dlqId - DLQ entry ID
   * @param redrivenBy - User ID who initiated the redrive
   * @param nextAttemptAt - When to schedule the retry (null = immediate)
   * @returns Object with dlqEntry and newJobId
   * @throws DlqRedriveError if entry not found or already resolved
   */
  atomicRedrive(
    dlqId: string,
    redrivenBy: string,
    nextAttemptAt?: Date | null,
  ): Promise<{ dlqEntry: DlqEntry; newJobId: string }>;
  
  /**
   * Get DLQ statistics.
   */
  getStats(): Promise<DlqStats>;
}

export interface DlqStats {
  open: number;
  resolved: number;
  redriven: number;
  total: number;
  oldestOpenAge?: number; // seconds
}

/**
 * Cursor-based pagination query options
 */
export interface DlqCursorQueryOptions {
  /** Status filter (optional - null means all statuses) */
  status?: DlqStatus | null;
  /** Maximum items per page (default: 50, max: 200) */
  limit: number;
  /** Cursor from previous page (null for first page) */
  cursor?: string | null;
}

/**
 * Cursor-based pagination result
 */
export interface DlqCursorQueryResult {
  items: DlqEntry[];
  page: {
    limit: number;
    nextCursor: string | null;
    hasMore: boolean;
  };
}

// ============================================================================
// Errors
// ============================================================================

/**
 * DLQ Redrive Error Codes
 * 
 * ALREADY_REDRIVEN - Entry was already redriven (status = DLQ_REDROVE)
 * ALREADY_RESOLVED - Entry was manually resolved (status = DLQ_RESOLVED)
 * NOT_DLQ_OPEN     - Entry exists but not in DLQ_OPEN status (general case)
 * NOT_FOUND        - Entry does not exist
 * JOB_CREATE_FAILED - Failed to create retry job (DB error)
 * ALREADY_QUEUED   - Retry job already exists for this bundle (no requestId)
 */
export type DlqRedriveErrorCode = 
  | 'ALREADY_REDRIVEN'
  | 'ALREADY_RESOLVED' 
  | 'NOT_DLQ_OPEN'
  | 'NOT_FOUND'
  | 'JOB_CREATE_FAILED'
  | 'ALREADY_QUEUED';

/**
 * Error thrown when DLQ redrive fails
 */
export class DlqRedriveError extends Error {
  readonly code: DlqRedriveErrorCode;
  /** Current status of the DLQ entry (if found) */
  readonly currentStatus: string | undefined;
  /** Existing job ID if ALREADY_QUEUED */
  readonly existingJobId: string | undefined;
  
  constructor(
    message: string, 
    code: DlqRedriveErrorCode,
    options?: { currentStatus?: string; existingJobId?: string }
  ) {
    super(message);
    this.name = 'DlqRedriveError';
    this.code = code;
    this.currentStatus = options?.currentStatus ?? undefined;
    this.existingJobId = options?.existingJobId ?? undefined;
  }
}

// ============================================================================
// Prisma Implementation
// ============================================================================

@Injectable()
export class PrismaManifestDlqRepository implements IManifestDlqRepository {
  private readonly logger = new Logger(PrismaManifestDlqRepository.name);
  
  constructor(private readonly prisma: PrismaService) {}
  
  // ==========================================================================
  // Upsert
  // ==========================================================================
  
  async upsert(input: CreateDlqEntryInput): Promise<DlqEntry> {
    const { 
      bundleId, attempt, errorCode, errorMessage, firstFailedAt, lastFailedAt,
      carrierJson, carrierVersion, carrierTruncated 
    } = input;
    
    try {
      const result = await this.prisma.$queryRaw<RawDlqEntry[]>`
        INSERT INTO manifest_dead_letter_queue (
          bundle_id, attempt, final_error_code, final_error_message,
          first_failed_at, last_failed_at, status, created_at,
          carrier_json, carrier_version, carrier_truncated
        )
        VALUES (
          ${bundleId}::uuid, ${attempt}, ${errorCode}, ${errorMessage ?? null},
          ${firstFailedAt}, ${lastFailedAt}, 'DLQ_OPEN', NOW(),
          ${carrierJson ?? null}, ${carrierVersion ?? null}, ${carrierTruncated ?? false}
        )
        ON CONFLICT (bundle_id) DO UPDATE SET
          attempt = EXCLUDED.attempt,
          final_error_code = EXCLUDED.final_error_code,
          final_error_message = EXCLUDED.final_error_message,
          last_failed_at = EXCLUDED.last_failed_at,
          status = 'DLQ_OPEN',
          resolved_at = NULL,
          resolved_by = NULL,
          resolution_note = NULL,
          redriven_at = NULL,
          redriven_by = NULL,
          carrier_json = EXCLUDED.carrier_json,
          carrier_version = EXCLUDED.carrier_version,
          carrier_truncated = EXCLUDED.carrier_truncated
        RETURNING 
          id, bundle_id, attempt, final_error_code, final_error_message,
          first_failed_at, last_failed_at, status, resolved_at, resolved_by,
          resolution_note, redriven_at, redriven_by, created_at,
          carrier_json, carrier_version, carrier_truncated
      `;
      
      const entry = this.mapRawToEntry(result[0]);
      this.logger.debug(`[upsert] DLQ entry: bundleId=${bundleId}, dlqId=${entry.id}`);
      
      return entry;
    } catch (error) {
      this.logger.error(`[upsert] Failed: bundleId=${bundleId}`, error);
      throw error;
    }
  }
  
  // ==========================================================================
  // Get By ID
  // ==========================================================================
  
  async getById(dlqId: string): Promise<DlqEntry | null> {
    try {
      const result = await this.prisma.$queryRaw<RawDlqEntry[]>`
        SELECT 
          id, bundle_id, attempt, final_error_code, final_error_message,
          first_failed_at, last_failed_at, status, resolved_at, resolved_by,
          resolution_note, redriven_at, redriven_by, created_at,
          carrier_json, carrier_version, carrier_truncated
        FROM manifest_dead_letter_queue
        WHERE id = ${dlqId}::uuid
      `;
      
      return result.length > 0 ? this.mapRawToEntry(result[0]) : null;
    } catch (error) {
      this.logger.error(`[getById] Failed: dlqId=${dlqId}`, error);
      throw error;
    }
  }
  
  // ==========================================================================
  // Get By Bundle ID
  // ==========================================================================
  
  async getByBundleId(bundleId: string): Promise<DlqEntry | null> {
    try {
      const result = await this.prisma.$queryRaw<RawDlqEntry[]>`
        SELECT 
          id, bundle_id, attempt, final_error_code, final_error_message,
          first_failed_at, last_failed_at, status, resolved_at, resolved_by,
          resolution_note, redriven_at, redriven_by, created_at,
          carrier_json, carrier_version, carrier_truncated
        FROM manifest_dead_letter_queue
        WHERE bundle_id = ${bundleId}::uuid
      `;
      
      return result.length > 0 ? this.mapRawToEntry(result[0]) : null;
    } catch (error) {
      this.logger.error(`[getByBundleId] Failed: bundleId=${bundleId}`, error);
      throw error;
    }
  }
  
  // ==========================================================================
  // Query
  // ==========================================================================
  
  async query(options: DlqQueryOptions = {}): Promise<DlqQueryResult> {
    const {
      status,
      limit = 50,
      offset = 0,
      orderBy = 'last_failed_at',
      orderDir = 'desc',
    } = options;
    
    try {
      // Build WHERE clause
      const whereClause = status ? `WHERE status = '${status}'` : '';
      const orderClause = `ORDER BY ${orderBy === 'created_at' ? 'created_at' : 'last_failed_at'} ${orderDir === 'asc' ? 'ASC' : 'DESC'}`;
      
      // Get entries
      const entries = await this.prisma.$queryRawUnsafe<RawDlqEntry[]>(`
        SELECT 
          id, bundle_id, attempt, final_error_code, final_error_message,
          first_failed_at, last_failed_at, status, resolved_at, resolved_by,
          resolution_note, redriven_at, redriven_by, created_at,
          carrier_json, carrier_version, carrier_truncated
        FROM manifest_dead_letter_queue
        ${whereClause}
        ${orderClause}
        LIMIT ${limit} OFFSET ${offset}
      `);
      
      // Get total count
      const countResult = await this.prisma.$queryRawUnsafe<{ count: bigint }[]>(`
        SELECT COUNT(*) as count
        FROM manifest_dead_letter_queue
        ${whereClause}
      `);
      
      // Get oldest open age
      let oldestAge: number | undefined;
      if (!status || status === 'DLQ_OPEN') {
        const ageResult = await this.prisma.$queryRaw<{ oldest_age: number | null }[]>`
          SELECT EXTRACT(EPOCH FROM (NOW() - MIN(last_failed_at)))::integer as oldest_age
          FROM manifest_dead_letter_queue
          WHERE status = 'DLQ_OPEN'
        `;
        if (ageResult[0]?.oldest_age !== null) {
          oldestAge = ageResult[0].oldest_age;
        }
      }
      
      return {
        entries: entries.map(this.mapRawToEntry),
        total: Number(countResult[0].count),
        oldestAge,
      };
    } catch (error) {
      this.logger.error('[query] Failed', error);
      throw error;
    }
  }
  
  // ==========================================================================
  // Query With Cursor (Phase 10.2 - Task 4.5)
  // ==========================================================================
  
  /**
   * Query DLQ entries with cursor-based pagination.
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
  async queryWithCursor(options: DlqCursorQueryOptions): Promise<DlqCursorQueryResult> {
    const { status, limit, cursor } = options;
    
    try {
      // Decode cursor if provided
      const decodedCursor = cursor ? decodeCursor(cursor) : null;
      
      // Build query with optional status filter and cursor
      let entries: RawDlqEntry[];
      
      if (decodedCursor) {
        // With cursor: filter by (created_at, id) < (cursor_created_at, cursor_id)
        entries = await this.prisma.$queryRaw<RawDlqEntry[]>`
          SELECT 
            id, bundle_id, attempt, final_error_code, final_error_message,
            first_failed_at, last_failed_at, status, resolved_at, resolved_by,
            resolution_note, redriven_at, redriven_by, created_at,
            carrier_json, carrier_version, carrier_truncated
          FROM manifest_dead_letter_queue
          WHERE (${status}::text IS NULL OR status = ${status}::text)
            AND (created_at, id) < (${decodedCursor.createdAt}, ${decodedCursor.id}::uuid)
          ORDER BY created_at DESC, id DESC
          LIMIT ${limit + 1}
        `;
      } else {
        // First page: no cursor filter
        entries = await this.prisma.$queryRaw<RawDlqEntry[]>`
          SELECT 
            id, bundle_id, attempt, final_error_code, final_error_message,
            first_failed_at, last_failed_at, status, resolved_at, resolved_by,
            resolution_note, redriven_at, redriven_by, created_at,
            carrier_json, carrier_version, carrier_truncated
          FROM manifest_dead_letter_queue
          WHERE (${status}::text IS NULL OR status = ${status}::text)
          ORDER BY created_at DESC, id DESC
          LIMIT ${limit + 1}
        `;
      }
      
      // Process results
      const hasMore = entries.length > limit;
      const items = hasMore ? entries.slice(0, limit) : entries;
      const mappedItems = items.map(this.mapRawToEntry);
      
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
  // Resolve
  // ==========================================================================
  
  async resolve(input: ResolveDlqInput): Promise<DlqEntry> {
    const { dlqId, resolvedBy, resolutionNote } = input;
    
    try {
      const result = await this.prisma.$queryRaw<RawDlqEntry[]>`
        UPDATE manifest_dead_letter_queue
        SET 
          status = 'DLQ_RESOLVED',
          resolved_at = NOW(),
          resolved_by = ${resolvedBy},
          resolution_note = ${resolutionNote ?? null}
        WHERE id = ${dlqId}::uuid
          AND status = 'DLQ_OPEN'
        RETURNING 
          id, bundle_id, attempt, final_error_code, final_error_message,
          first_failed_at, last_failed_at, status, resolved_at, resolved_by,
          resolution_note, redriven_at, redriven_by, created_at,
          carrier_json, carrier_version, carrier_truncated
      `;
      
      if (result.length === 0) {
        throw new Error(`DLQ entry not found or already resolved: ${dlqId}`);
      }
      
      const entry = this.mapRawToEntry(result[0]);
      this.logger.debug(`[resolve] Resolved: dlqId=${dlqId}, resolvedBy=${resolvedBy}`);
      
      return entry;
    } catch (error) {
      this.logger.error(`[resolve] Failed: dlqId=${dlqId}`, error);
      throw error;
    }
  }
  
  // ==========================================================================
  // Mark Redriven (Phase 10.2 - Updated with redriven_at/redriven_by)
  // ==========================================================================
  
  async markRedriven(dlqId: string, redrivenBy?: string): Promise<void> {
    try {
      await this.prisma.$executeRaw`
        UPDATE manifest_dead_letter_queue
        SET 
          status = 'DLQ_REDROVE',
          redriven_at = NOW(),
          redriven_by = ${redrivenBy ?? null}
        WHERE id = ${dlqId}::uuid
          AND status = 'DLQ_OPEN'
      `;
      
      this.logger.debug(`[markRedriven] Redriven: dlqId=${dlqId}, redrivenBy=${redrivenBy}`);
    } catch (error) {
      this.logger.error(`[markRedriven] Failed: dlqId=${dlqId}`, error);
      throw error;
    }
  }
  
  // ==========================================================================
  // Atomic Redrive (Phase 10.2 - Task 1.4)
  // Transactional: UPDATE DLQ + INSERT retry job
  // ==========================================================================
  
  /**
   * Atomically redrive a DLQ entry back to the retry queue.
   * 
   * This operation is transactional:
   * 1. UPDATE DLQ entry to DLQ_REDROVE status
   * 2. INSERT new retry job
   * 
   * If either operation fails, the entire transaction is rolled back.
   * 
   * @param dlqId - DLQ entry ID
   * @param redrivenBy - User ID who initiated the redrive
   * @param nextAttemptAt - When to schedule the retry (null = immediate)
   * @returns Object with dlqEntry and newJobId
   * @throws Error if DLQ entry not found or already resolved
   */
  async atomicRedrive(
    dlqId: string,
    redrivenBy: string,
    nextAttemptAt: Date | null = null,
  ): Promise<{ dlqEntry: DlqEntry; newJobId: string }> {
    try {
      // Use transaction for atomicity
      const result = await this.prisma.$transaction(async (tx) => {
        // 0. First check if entry exists and get current status
        const existingEntry = await tx.$queryRaw<RawDlqEntry[]>`
          SELECT 
            id, bundle_id, attempt, final_error_code, final_error_message,
            first_failed_at, last_failed_at, status, resolved_at, resolved_by,
            resolution_note, redriven_at, redriven_by, created_at,
            carrier_json, carrier_version, carrier_truncated
          FROM manifest_dead_letter_queue
          WHERE id = ${dlqId}::uuid
          FOR UPDATE
        `;
        
        if (existingEntry.length === 0) {
          throw new DlqRedriveError(
            `DLQ entry not found: ${dlqId}`,
            'NOT_FOUND'
          );
        }
        
        const currentStatus = existingEntry[0].status;
        
        // Check specific status for better error codes
        if (currentStatus === 'DLQ_REDROVE') {
          throw new DlqRedriveError(
            `DLQ entry already redriven: ${dlqId}`,
            'ALREADY_REDRIVEN',
            { currentStatus }
          );
        }
        
        if (currentStatus === 'DLQ_RESOLVED') {
          throw new DlqRedriveError(
            `DLQ entry already resolved: ${dlqId}`,
            'ALREADY_RESOLVED',
            { currentStatus }
          );
        }
        
        if (currentStatus !== 'DLQ_OPEN') {
          throw new DlqRedriveError(
            `DLQ entry not in DLQ_OPEN status: ${dlqId} (current: ${currentStatus})`,
            'NOT_DLQ_OPEN',
            { currentStatus }
          );
        }
        
        // 1. Update DLQ entry
        const dlqResult = await tx.$queryRaw<RawDlqEntry[]>`
          UPDATE manifest_dead_letter_queue
          SET 
            status = 'DLQ_REDROVE',
            redriven_at = NOW(),
            redriven_by = ${redrivenBy}
          WHERE id = ${dlqId}::uuid
            AND status = 'DLQ_OPEN'
          RETURNING 
            id, bundle_id, attempt, final_error_code, final_error_message,
            first_failed_at, last_failed_at, status, resolved_at, resolved_by,
            resolution_note, redriven_at, redriven_by, created_at,
            carrier_json, carrier_version, carrier_truncated
        `;
        
        // Should not happen due to FOR UPDATE lock, but defensive check
        if (dlqResult.length === 0) {
          throw new DlqRedriveError(
            `DLQ entry status changed during transaction: ${dlqId}`,
            'NOT_DLQ_OPEN',
            { currentStatus }
          );
        }
        
        const dlqEntry = this.mapRawToEntry(dlqResult[0]);
        
        // 2. Check if retry job already exists for this bundle
        const existingJob = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM manifest_retry_queue
          WHERE bundle_id = ${dlqEntry.bundleId}::uuid
            AND status IN ('PENDING', 'IN_PROGRESS', 'RETRY_SCHEDULED')
          LIMIT 1
        `;
        
        if (existingJob.length > 0) {
          // Job already exists - this is ALREADY_QUEUED scenario
          // Without requestId, we treat this as a conflict
          throw new DlqRedriveError(
            `Retry job already exists for bundle: ${dlqEntry.bundleId}`,
            'ALREADY_QUEUED',
            { existingJobId: existingJob[0].id }
          );
        }
        
        // 3. Insert new retry job
        const jobResult = await tx.$queryRaw<{ id: string }[]>`
          INSERT INTO manifest_retry_queue (
            bundle_id, status, attempt, max_attempts, source,
            next_attempt_at, last_error_code, last_error_message,
            created_at, updated_at
          )
          VALUES (
            ${dlqEntry.bundleId}::uuid, 
            ${nextAttemptAt ? 'RETRY_SCHEDULED' : 'PENDING'},
            0, 
            7, 
            'admin_retry',
            ${nextAttemptAt},
            ${dlqEntry.finalErrorCode},
            ${dlqEntry.finalErrorMessage ?? null},
            NOW(), 
            NOW()
          )
          RETURNING id
        `;
        
        if (jobResult.length === 0) {
          throw new DlqRedriveError(
            `Failed to create retry job for bundle: ${dlqEntry.bundleId}`,
            'JOB_CREATE_FAILED'
          );
        }
        
        return { dlqEntry, newJobId: jobResult[0].id };
      });
      
      this.logger.debug(
        `[atomicRedrive] Success: dlqId=${dlqId}, bundleId=${result.dlqEntry.bundleId}, newJobId=${result.newJobId}`
      );
      
      return result;
    } catch (error) {
      if (error instanceof DlqRedriveError) {
        this.logger.warn(
          `[atomicRedrive] Rejected: dlqId=${dlqId}, code=${error.code}, msg=${error.message}`
        );
        throw error;
      }
      this.logger.error(`[atomicRedrive] Failed: dlqId=${dlqId}`, error);
      throw error;
    }
  }
  
  // ==========================================================================
  // Get Stats
  // ==========================================================================
  
  async getStats(): Promise<DlqStats> {
    try {
      const result = await this.prisma.$queryRaw<{
        status: string;
        count: bigint;
        oldest_age_seconds: number | null;
      }[]>`
        SELECT 
          status,
          COUNT(*) as count,
          CASE WHEN status = 'DLQ_OPEN' 
            THEN EXTRACT(EPOCH FROM (NOW() - MIN(last_failed_at)))::integer 
            ELSE NULL 
          END as oldest_age_seconds
        FROM manifest_dead_letter_queue
        GROUP BY status
      `;
      
      const stats: DlqStats = {
        open: 0,
        resolved: 0,
        redriven: 0,
        total: 0,
      };
      
      for (const row of result) {
        const count = Number(row.count);
        stats.total += count;
        
        switch (row.status) {
          case 'DLQ_OPEN':
            stats.open = count;
            if (row.oldest_age_seconds !== null) {
              stats.oldestOpenAge = row.oldest_age_seconds;
            }
            break;
          case 'DLQ_RESOLVED':
            stats.resolved = count;
            break;
          case 'DLQ_REDROVE':
            stats.redriven = count;
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
  // Private Helpers
  // ==========================================================================
  
  private mapRawToEntry(raw: RawDlqEntry): DlqEntry {
    return {
      id: raw.id,
      bundleId: raw.bundle_id,
      attempt: raw.attempt,
      finalErrorCode: raw.final_error_code as ManifestErrorCode,
      finalErrorMessage: raw.final_error_message,
      firstFailedAt: raw.first_failed_at,
      lastFailedAt: raw.last_failed_at,
      status: raw.status as DlqStatus,
      resolvedAt: raw.resolved_at,
      resolvedBy: raw.resolved_by,
      resolutionNote: raw.resolution_note,
      redrivenAt: raw.redriven_at,
      redrivenBy: raw.redriven_by,
      createdAt: raw.created_at,
      // Phase 11.0 - Carrier storage (NULL tolerant for pre-11.0 entries)
      carrierJson: raw.carrier_json ?? null,
      carrierVersion: raw.carrier_version ?? null,
      carrierTruncated: raw.carrier_truncated ?? false,
    };
  }
}

// ============================================================================
// Raw Types (DB row shape)
// ============================================================================

interface RawDlqEntry {
  id: string;
  bundle_id: string;
  attempt: number;
  final_error_code: string;
  final_error_message: string | null;
  first_failed_at: Date;
  last_failed_at: Date;
  status: string;
  resolved_at: Date | null;
  resolved_by: string | null;
  resolution_note: string | null;
  // Phase 10.2 - Redrive tracking
  redriven_at: Date | null;
  redriven_by: string | null;
  created_at: Date;
  // Phase 11.0 - Carrier storage
  carrier_json: string | null;
  carrier_version: number | null;
  carrier_truncated: boolean;
}
