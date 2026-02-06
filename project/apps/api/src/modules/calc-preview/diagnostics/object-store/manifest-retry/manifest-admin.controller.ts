/**
 * Manifest Admin Controller
 * 
 * Phase 10 - Task 10.1.8-11
 * Phase 10.5 - Task 7: Admin Controller Integration
 * 
 * Admin endpoints for manifest retry queue and DLQ management.
 * 
 * CRITICAL: Admin retry endpoint MUST enqueue job, MUST NOT do direct write.
 * 
 * Task 7 Additions:
 * - Carrier clone semantics for redrive (new correlationId, parent link)
 * - Response includes correlationId and parentCorrelationId
 * - Audit events with full correlation chain
 * - Controller-specific metrics
 * 
 * @see .kiro/specs/phase-10-retry-signature/PHASE-10-WORKER-ARCHITECTURE.md
 */

import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
  PayloadTooLargeException,
  UseGuards,
  UseInterceptors,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { IdempotencyGateInterceptor } from './idempotency/idempotency-gate.interceptor';
import { IdempotencyAction } from './idempotency/idempotency.decorators';
import { IManifestRetryQueueRepository } from './manifest-retry-queue.repository';
import { IManifestDlqRepository } from './manifest-dlq.repository';
import { ManifestWriter } from '../bundle-manifest/bundle-manifest.writer';
import { CursorValidationError } from './cursor-pagination';
import { ManifestAdminAuthGuard } from './guards/manifest-admin-auth.guard';
import { ManifestAdminRateLimitGuard } from './guards/manifest-admin-rate-limiter.service';
import { ManifestAdminAuditService } from './audit/manifest-admin-audit.service';
import {
  AdminRetryResponseDto,
  RetryQueueStatsResponseDto,
  DlqQueryDto,
  DlqQueryResponseDto,
  DlqEntryDto,
  DlqResolveDto,
  DlqResolveResponseDto,
  DlqRedriveResponseDto,
  DlqCursorQueryDto,
  DlqCursorQueryResponseDto,
  JobCursorQueryDto,
  JobCursorQueryResponseDto,
  JobEntryDto,
  PAGINATION_DEFAULTS,
} from './manifest-admin.dto';
import { DlqQueryOptions, RetryQueueJob } from './manifest-retry.types';

// Task 7: Carrier lifecycle imports
import { cloneCarrierForRedrive, RedriveCloneResult } from './idempotency/carrier-lifecycle/redrive-carrier-cloner';
import { enforceCarrierSizeLimit } from './idempotency/carrier-lifecycle/carrier-size-limiter';
import { IdempotencyContextCarrierV2, CarrierSizeExceededError } from './idempotency/carrier-lifecycle/carrier-lifecycle.types';
import { redriveClonedMetric, redriveRejectedMetric } from './idempotency/carrier-lifecycle/carrier-lifecycle-metrics';

@Controller('admin/manifest')
@UseGuards(ManifestAdminAuthGuard, ManifestAdminRateLimitGuard)
@UseInterceptors(IdempotencyGateInterceptor)
export class ManifestAdminController {
  private readonly logger = new Logger(ManifestAdminController.name);

  constructor(
    private readonly retryQueue: IManifestRetryQueueRepository,
    private readonly dlqRepo: IManifestDlqRepository,
    private readonly manifestWriter: ManifestWriter,
    private readonly auditService: ManifestAdminAuditService,
  ) {}

  // ==========================================================================
  // POST /admin/bundles/{bundleId}/manifest/retry
  // CRITICAL: ENQUEUE ONLY - NEVER DIRECT WRITE
  // ==========================================================================

  @Post('/bundles/:bundleId/retry')
  @HttpCode(HttpStatus.OK)
  @IdempotencyAction({
    actionType: 'ADMIN_RETRY',
    resourceType: 'BUNDLE',
    resourceIdParam: 'bundleId',
  })
  async retryManifest(
    @Param('bundleId') bundleId: string,
  ): Promise<AdminRetryResponseDto> {
    this.logger.log(`[retryManifest] Admin retry request: bundleId=${bundleId}`);

    // 1. Check if manifest already exists (no-op success)
    const exists = await this.manifestWriter.manifestExists(bundleId);
    if (exists) {
      this.logger.log(`[retryManifest] Manifest already exists: bundleId=${bundleId}`);
      return {
        enqueued: false,
        bundleId,
        reason: 'MANIFEST_EXISTS',
      };
    }

    // 2. ENQUEUE ONLY - Never direct write
    const result = await this.retryQueue.enqueue({
      bundleId,
      source: 'admin_retry',
    });

    if (result.enqueued) {
      this.logger.log(`[retryManifest] Job enqueued: bundleId=${bundleId}, jobId=${result.jobId}`);
      const response: AdminRetryResponseDto = {
        enqueued: true,
        bundleId,
        reason: 'CREATED',
      };
      if (result.jobId !== undefined) {
        response.jobId = result.jobId;
      }
      if (result.nextAttemptAt !== undefined) {
        response.nextAttemptAt = result.nextAttemptAt.toISOString();
      }
      return response;
    }

    // Already queued
    this.logger.log(`[retryManifest] Already queued: bundleId=${bundleId}, existingJobId=${result.existingJobId}`);
    const response: AdminRetryResponseDto = {
      enqueued: false,
      bundleId,
      reason: 'ALREADY_QUEUED',
    };
    if (result.existingJobId !== undefined) {
      response.existingJobId = result.existingJobId;
    }
    if (result.nextAttemptAt !== undefined) {
      response.nextAttemptAt = result.nextAttemptAt.toISOString();
    }
    return response;
  }

  // ==========================================================================
  // GET /admin/manifest/retry-queue
  // ==========================================================================

  @Get('/retry-queue')
  async getRetryQueueStats(): Promise<RetryQueueStatsResponseDto> {
    const stats = await this.retryQueue.getStats();
    const response: RetryQueueStatsResponseDto = {
      pending: stats.pending,
      inProgress: stats.inProgress,
      retryScheduled: stats.retryScheduled,
      done: stats.done,
      total: stats.total,
    };
    if (stats.oldestPendingAge !== undefined) {
      response.oldestPendingAge = stats.oldestPendingAge;
    }
    return response;
  }


  // ==========================================================================
  // GET /admin/manifest/dlq (Legacy offset pagination)
  // ==========================================================================

  @Get('/dlq')
  async queryDlq(@Query() query: DlqQueryDto): Promise<DlqQueryResponseDto> {
    const queryOptions: DlqQueryOptions = {};
    if (query.status !== undefined) {
      queryOptions.status = query.status;
    }
    if (query.limit !== undefined) {
      queryOptions.limit = query.limit;
    }
    if (query.offset !== undefined) {
      queryOptions.offset = query.offset;
    }
    
    const result = await this.dlqRepo.query(queryOptions);

    const response: DlqQueryResponseDto = {
      entries: result.entries.map(this.mapDlqEntryToDto),
      total: result.total,
    };
    if (result.oldestAge !== undefined) {
      response.oldestAge = result.oldestAge;
    }
    return response;
  }

  // ==========================================================================
  // GET /admin/manifest-retry/dlq (Cursor pagination - Phase 10.2)
  // ==========================================================================

  @Get('/retry/dlq')
  async queryDlqWithCursor(@Query() query: DlqCursorQueryDto): Promise<DlqCursorQueryResponseDto> {
    try {
      const limit = query.limit ?? PAGINATION_DEFAULTS.DEFAULT_LIMIT;
      
      const result = await this.dlqRepo.queryWithCursor({
        status: query.status ?? null,
        limit,
        cursor: query.cursor ?? null,
      });

      return {
        items: result.items.map(this.mapDlqEntryToDto),
        page: {
          limit: result.page.limit,
          nextCursor: result.page.nextCursor,
          hasMore: result.page.hasMore,
        },
      };
    } catch (error) {
      if (error instanceof CursorValidationError) {
        throw new BadRequestException({
          code: 'INVALID_CURSOR',
          message: error.message,
        });
      }
      throw error;
    }
  }

  // ==========================================================================
  // GET /admin/manifest-retry/jobs (Cursor pagination - Phase 10.2)
  // ==========================================================================

  @Get('/retry/jobs')
  async queryJobsWithCursor(@Query() query: JobCursorQueryDto): Promise<JobCursorQueryResponseDto> {
    try {
      const limit = query.limit ?? PAGINATION_DEFAULTS.DEFAULT_LIMIT;
      
      const result = await this.retryQueue.queryWithCursor({
        status: query.status ?? null,
        limit,
        cursor: query.cursor ?? null,
      });

      return {
        items: result.items.map(this.mapJobEntryToDto),
        page: {
          limit: result.page.limit,
          nextCursor: result.page.nextCursor,
          hasMore: result.page.hasMore,
        },
      };
    } catch (error) {
      if (error instanceof CursorValidationError) {
        throw new BadRequestException({
          code: 'INVALID_CURSOR',
          message: error.message,
        });
      }
      throw error;
    }
  }

  // ==========================================================================
  // POST /admin/manifest/dlq/{dlqId}/redrive
  // Task 7: Full carrier clone semantics with audit
  // ==========================================================================

  @Post('/dlq/:dlqId/redrive')
  @HttpCode(HttpStatus.OK)
  @IdempotencyAction({
    actionType: 'DLQ_REDRIVE',
    resourceType: 'DLQ_ENTRY',
    resourceIdParam: 'dlqId',
  })
  async redriveDlqEntry(
    @Param('dlqId') dlqId: string,
    @Req() req: Request,
  ): Promise<DlqRedriveResponseDto> {
    this.logger.log(`[redriveDlqEntry] Redrive request: dlqId=${dlqId}`);

    // Get actor from request context (set by auth guard)
    const redrivenBy = (req as any).user?.id ?? 'admin@system';
    const requestId = (req as any).requestId ?? `redrive-${Date.now()}`;
    
    try {
      // 1. Fetch DLQ entry first to get carrier data
      const dlqEntry = await this.dlqRepo.getById(dlqId);
      if (!dlqEntry) {
        redriveRejectedMetric.inc({ reason: 'NOT_FOUND' });
        throw new NotFoundException(`DLQ entry not found: ${dlqId}`);
      }
      
      // 2. Build carrier from DLQ entry (or use stored carrier if available)
      // For now, create a minimal carrier - in production, carrier would be stored with DLQ entry
      const originalCarrier: IdempotencyContextCarrierV2 = {
        version: 2,
        requestId: dlqEntry.id, // Use DLQ ID as original correlation
        actionId: `dlq-${dlqEntry.id}`,
        actionType: 'DLQ_REDRIVE',
        resourceType: 'BUNDLE',
        resourceId: dlqEntry.bundleId,
        takeover: false,
        previousActorId: null,
        attemptNumber: dlqEntry.attempt,
        // dlqReason omitted - type mismatch with ManifestErrorCode
        movedToDlqAt: dlqEntry.lastFailedAt.toISOString(),
        finalAttemptNumber: dlqEntry.attempt,
      };
      
      // 3. Clone carrier for redrive (Task 7 core logic)
      let cloneResult: RedriveCloneResult;
      try {
        cloneResult = cloneCarrierForRedrive(
          originalCarrier,
          { dlqName: 'manifest_dlq', operatorId: redrivenBy },
        );
      } catch (upgradeError) {
        this.logger.warn(`[redriveDlqEntry] Carrier upgrade failed: dlqId=${dlqId}`, upgradeError);
        redriveRejectedMetric.inc({ reason: 'UPGRADE_FAILED' });
        throw new BadRequestException({
          code: 'INVALID_CARRIER',
          message: 'Failed to upgrade carrier for redrive',
          dlqId,
        });
      }
      
      // 4. Enforce size limit on cloned carrier (reject policy for admin redrive)
      try {
        enforceCarrierSizeLimit(cloneResult.carrier, { allowTruncation: false });
        // If we get here, size is OK
      } catch (sizeError) {
        if (sizeError instanceof CarrierSizeExceededError) {
          this.logger.warn(
            `[redriveDlqEntry] Carrier size exceeded: dlqId=${dlqId}, size=${sizeError.originalSizeBytes}`
          );
          redriveRejectedMetric.inc({ reason: 'SIZE' });
          throw new PayloadTooLargeException({
            code: 'CARRIER_SIZE_EXCEEDED',
            message: `Carrier size ${sizeError.originalSizeBytes} exceeds limit ${sizeError.maxSizeBytes}`,
            dlqId,
            size: sizeError.originalSizeBytes,
          });
        }
        throw sizeError;
      }
      
      // 5. Perform atomic redrive (DB transaction)
      const { dlqEntry: updatedDlqEntry, newJobId } = await this.dlqRepo.atomicRedrive(
        dlqId,
        redrivenBy,
        null, // immediate retry
      );
      
      // 6. Record success metric
      redriveClonedMetric.inc();
      
      // 7. Append audit event with full correlation chain
      this.auditService.append({
        eventType: 'DLQ_REDRIVE',
        actor: redrivenBy,
        requestId,
        ipAddress: req.ip ?? null,
        userAgent: req.get('user-agent') ?? null,
        resourceType: 'DLQ_ENTRY',
        resourceId: dlqId,
        targetBundleId: updatedDlqEntry.bundleId,
        beforeState: {
          status: 'DLQ_OPEN',
          correlationId: cloneResult.originalCorrelationId,
          attemptNumber: originalCarrier.attemptNumber,
        },
        afterState: {
          status: 'DLQ_REDROVE',
          correlationId: cloneResult.newCorrelationId,
          parentCorrelationId: cloneResult.originalCorrelationId,
          newJobId,
          attemptNumber: 0, // Reset for redrive
        },
        reason: 'Admin redrive initiated',
        actionId: cloneResult.carrier.actionId,
        outcome: 'SUCCESS',
      });
      
      this.logger.log(
        `[redriveDlqEntry] Redriven: dlqId=${dlqId}, newJobId=${newJobId}, ` +
        `correlationId=${cloneResult.newCorrelationId}, parentCorrelationId=${cloneResult.originalCorrelationId}`
      );
      
      return {
        redriven: true,
        dlqId,
        bundleId: updatedDlqEntry.bundleId,
        reason: 'REDRIVEN',
        newJobId,
        correlationId: cloneResult.newCorrelationId,
        parentCorrelationId: cloneResult.originalCorrelationId,
      };
    } catch (error) {
      // Handle DlqRedriveError from repository
      if (error && typeof error === 'object' && 'code' in error) {
        const redriveError = error as { code: string; message: string; existingJobId?: string };
        
        // Map error codes to response - use 409 Conflict for state transition errors
        switch (redriveError.code) {
          case 'NOT_FOUND':
            redriveRejectedMetric.inc({ reason: 'NOT_FOUND' });
            throw new NotFoundException(`DLQ entry not found: ${dlqId}`);
            
          case 'ALREADY_REDRIVEN':
            // 409 Conflict: already redriven
            throw new ConflictException({
              code: 'ALREADY_REDRIVEN',
              message: `DLQ entry already redriven: ${dlqId}`,
              dlqId,
            });
            
          case 'ALREADY_RESOLVED':
            // 409 Conflict: already resolved
            throw new ConflictException({
              code: 'ALREADY_RESOLVED',
              message: `DLQ entry already resolved: ${dlqId}`,
              dlqId,
            });
            
          case 'ALREADY_QUEUED':
            // 409 Conflict: already queued
            throw new ConflictException({
              code: 'ALREADY_QUEUED',
              message: `Bundle already queued for retry`,
              dlqId,
              existingJobId: redriveError.existingJobId,
            });
            
          case 'NOT_DLQ_OPEN':
            // 409 Conflict: not in DLQ_OPEN state
            throw new ConflictException({
              code: 'NOT_DLQ_OPEN',
              message: `DLQ entry not in DLQ_OPEN state: ${dlqId}`,
              dlqId,
            });
        }
      }
      
      // Re-throw HTTP exceptions as-is
      if (error instanceof NotFoundException || 
          error instanceof ConflictException || 
          error instanceof BadRequestException ||
          error instanceof PayloadTooLargeException) {
        throw error;
      }
      
      // Re-throw unexpected errors
      throw error;
    }
  }


  // ==========================================================================
  // POST /admin/manifest/dlq/{dlqId}/resolve
  // ==========================================================================

  @Post('/dlq/:dlqId/resolve')
  @HttpCode(HttpStatus.OK)
  @IdempotencyAction({
    actionType: 'DLQ_RESOLVE',
    resourceType: 'DLQ_ENTRY',
    resourceIdParam: 'dlqId',
  })
  async resolveDlqEntry(
    @Param('dlqId') dlqId: string,
    @Body() body: DlqResolveDto,
  ): Promise<DlqResolveResponseDto> {
    this.logger.log(`[resolveDlqEntry] Resolve request: dlqId=${dlqId}, resolution=${body.resolution}`);

    // 1. Get DLQ entry
    const entry = await this.dlqRepo.getById(dlqId);
    if (!entry) {
      throw new NotFoundException(`DLQ entry not found: ${dlqId}`);
    }

    // 2. Check if already resolved
    if (entry.status !== 'DLQ_OPEN') {
      // 409 Conflict: state transition not allowed
      throw new ConflictException({
        code: 'ALREADY_RESOLVED',
        message: `DLQ entry already resolved: ${dlqId}`,
        dlqId,
        currentStatus: entry.status,
      });
    }

    // 3. Build resolution note
    const resolutionNote = body.notes 
      ? `[${body.resolution}] ${body.notes}`
      : `[${body.resolution}]`;

    // 4. Resolve
    // TODO: Get actual admin user from request context
    const resolvedBy = 'admin@system';
    
    const resolved = await this.dlqRepo.resolve({
      dlqId,
      resolvedBy,
      resolutionNote,
    });

    this.logger.log(`[resolveDlqEntry] Resolved: dlqId=${dlqId}, resolvedBy=${resolvedBy}`);

    return {
      resolved: true,
      dlqId,
      resolvedBy,
      resolvedAt: resolved.resolvedAt?.toISOString() ?? new Date().toISOString(),
    };
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private mapDlqEntryToDto(entry: {
    id: string;
    bundleId: string;
    attempt: number;
    finalErrorCode: string;
    finalErrorMessage: string | null;
    firstFailedAt: Date;
    lastFailedAt: Date;
    status: string;
    resolvedAt: Date | null;
    resolvedBy: string | null;
    resolutionNote: string | null;
    createdAt: Date;
  }): DlqEntryDto {
    return {
      id: entry.id,
      bundleId: entry.bundleId,
      attempt: entry.attempt,
      finalErrorCode: entry.finalErrorCode,
      finalErrorMessage: entry.finalErrorMessage,
      firstFailedAt: entry.firstFailedAt.toISOString(),
      lastFailedAt: entry.lastFailedAt.toISOString(),
      status: entry.status as 'DLQ_OPEN' | 'DLQ_RESOLVED' | 'DLQ_REDROVE',
      resolvedAt: entry.resolvedAt?.toISOString() ?? null,
      resolvedBy: entry.resolvedBy,
      resolutionNote: entry.resolutionNote,
      createdAt: entry.createdAt.toISOString(),
    };
  }

  private mapJobEntryToDto(job: RetryQueueJob): JobEntryDto {
    return {
      id: job.id,
      bundleId: job.bundleId,
      status: job.status,
      attempt: job.attempt,
      maxAttempts: job.maxAttempts,
      nextAttemptAt: job.nextAttemptAt?.toISOString() ?? null,
      leasedUntil: job.leasedUntil?.toISOString() ?? null,
      leasedBy: job.leasedBy ?? null,
      lastErrorCode: job.lastErrorCode ?? null,
      lastErrorMessage: job.lastErrorMessage ?? null,
      doneReason: job.doneReason ?? null,
      source: job.source,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
    };
  }
}

