/**
 * Legal Hold Controller
 * 
 * Sprint 2F - Task 9.1-9.3
 * Phase 9B.5 - Migrated to ISnapshotStore interface
 * Phase 9B.6 - Step 4: Full tenant-aware wiring + HTTP error mapping
 * 
 * REST endpoints for legal hold management:
 * - GET /legal-holds (tenant-wide or incident-scoped via query param)
 * - POST /legal-holds/:snapshotId/archive
 * - GET /legal-holds/stats
 * 
 * RED LINE: Baseline snapshots cannot be archived (409)
 * 
 * TENANT ISOLATION:
 * - tenant-admin: ALWAYS filtered to own tenant (tenantId query IGNORED, logged)
 * - internal-ops: MUST specify tenantId query param (400 if missing)
 * - Tenant mismatch returns 404 (no information leakage)
 * 
 * ERROR MAPPING:
 * - SNAPSHOT_NOT_FOUND → 404 (includes tenant mismatch)
 * - NOT_LEGAL_HOLD → 400 (wrong resource type)
 * - IS_BASELINE → 409 (state conflict)
 * 
 * @see .kiro/specs/simulation-api-2f/design.md
 * @see .kiro/specs/phase-9b-postgresql-migration/PHASE-9B-LOCK.md
 */

import {
  Controller,
  Post,
  Get,
  Param,
  Query,
  UseGuards,
  Logger,
  Inject,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { SimulationFeatureFlagGuard } from './guards/simulation-feature-flag.guard';
import { SimulationRBACGuard, SimulationTenant, SimulationTenantContext } from './guards/simulation-rbac.guard';
import { LegalHoldInventoryService } from '../simulation/legal-hold-inventory.service';
import { 
  ISnapshotStore, 
  SNAPSHOT_STORE,
} from '../persistence/snapshot-store.interface';
import {
  LegalHoldEntryDto,
  LegalHoldListResponseDto,
  ArchiveResponseDto,
  LegalHoldStatsResponseDto,
} from './simulation.dto';
import {
  CannotArchiveBaselineException,
} from './simulation-error.types';

// ============================================================================
// Controller
// ============================================================================

@Controller('legal-holds')
export class LegalHoldController {
  private readonly logger = new Logger(LegalHoldController.name);

  constructor(
    private readonly legalHoldService: LegalHoldInventoryService,
    @Inject(SNAPSHOT_STORE)
    private readonly snapshotStore: ISnapshotStore,
  ) {}

  // ============================================================================
  // Private: Tenant Resolution
  // ============================================================================

  /**
   * Resolve effective tenantId from context and query params
   * 
   * RULES:
   * - tenant-admin: ALWAYS uses ctx.tenantId (query param IGNORED + logged)
   * - internal-ops: MUST provide tenantId query param (400 if missing)
   * - Guard guarantees ctx.tenantId exists (no fallback needed)
   * 
   * @throws HttpException 400 if internal-ops without tenantId query
   */
  private resolveEffectiveTenantId(
    ctx: SimulationTenantContext,
    tenantIdQuery: string | undefined,
    endpoint: string,
  ): string {
    if (ctx.role === 'tenant-admin') {
      // tenant-admin: ALWAYS use own tenant, ignore query param
      if (tenantIdQuery && tenantIdQuery !== ctx.tenantId) {
        // Log potential misuse/attack attempt
        this.logger.warn('[LegalHoldController] tenant-admin tried to use tenantId query (ignored)', {
          endpoint,
          ctxTenantId: ctx.tenantId,
          queryTenantId: tenantIdQuery,
          userId: ctx.userId,
        });
      }
      return ctx.tenantId;
    }

    if (ctx.role === 'internal-ops') {
      // internal-ops: MUST specify tenantId query param
      if (!tenantIdQuery) {
        throw new HttpException(
          {
            statusCode: HttpStatus.BAD_REQUEST,
            error: 'Bad Request',
            message: 'tenantId query parameter is required for internal-ops role',
          },
          HttpStatus.BAD_REQUEST,
        );
      }
      return tenantIdQuery;
    }

    // Fallback (should not reach here if guard works correctly)
    return ctx.tenantId;
  }

  // ============================================================================
  // GET /legal-holds
  // ============================================================================

  /**
   * List legal hold snapshots
   * 
   * Guards: RBAC (403)
   * 
   * Query params:
   * - incidentId (optional): Filter by incident → uses listLegalHoldsByIncident
   * - tenantId (internal-ops only, required): Target tenant
   * 
   * DISPATCH:
   * - incidentId provided → service.listLegalHoldsByIncident(tenantId, incidentId)
   * - incidentId not provided → service.listLegalHolds(tenantId)
   * 
   * @returns LegalHoldListResponseDto (deterministic order: createdAt DESC, snapshotId ASC)
   */
  @Get()
  @UseGuards(SimulationRBACGuard)
  async listLegalHolds(
    @Query('incidentId') incidentId?: string,
    @Query('tenantId') tenantId?: string,
    @SimulationTenant() ctx?: SimulationTenantContext,
  ): Promise<LegalHoldListResponseDto> {
    // Guard guarantees ctx exists
    if (!ctx) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    this.logger.debug('[LegalHoldController] GET /legal-holds', {
      incidentId,
      tenantIdQuery: tenantId,
      ctxTenantId: ctx.tenantId,
      role: ctx.role,
    });

    // Resolve effective tenant
    const effectiveTenantId = this.resolveEffectiveTenantId(ctx, tenantId, 'GET /legal-holds');

    // Dispatch to appropriate service method
    const entries = incidentId
      ? await this.legalHoldService.listLegalHoldsByIncident(effectiveTenantId, incidentId)
      : await this.legalHoldService.listLegalHolds(effectiveTenantId);

    // Map to DTOs (service already returns sorted, deterministic order)
    const holds: LegalHoldEntryDto[] = entries.map(entry => ({
      snapshotId: entry.snapshotId,
      incidentId: entry.incidentId,
      createdAt: entry.appliedAt,
      reason: 'LEGAL_HOLD', // Service doesn't expose reason yet, default
      archived: entry.archived,
      isBaseline: entry.isBaseline,
    }));

    return {
      holds,
      totalCount: holds.length,
    };
  }

  // ============================================================================
  // POST /legal-holds/:snapshotId/archive
  // ============================================================================

  /**
   * Archive a legal hold snapshot
   * 
   * Guards: FeatureFlag (503), RBAC (403)
   * 
   * ERROR MAPPING:
   * - SNAPSHOT_NOT_FOUND → 404 (includes tenant mismatch - no leakage)
   * - NOT_LEGAL_HOLD → 400 (wrong resource type)
   * - IS_BASELINE → 409 (state conflict)
   * 
   * RED LINE: Baseline snapshots cannot be archived (409)
   * 
   * @param snapshotId Snapshot ID to archive
   * @param ctx Tenant context (from guard)
   * @returns ArchiveResponseDto
   */
  @Post(':snapshotId/archive')
  @UseGuards(SimulationFeatureFlagGuard, SimulationRBACGuard)
  async archiveLegalHold(
    @Param('snapshotId') snapshotId: string,
    @SimulationTenant() ctx: SimulationTenantContext,
  ): Promise<ArchiveResponseDto> {
    this.logger.debug('[LegalHoldController] POST /legal-holds/:snapshotId/archive', {
      snapshotId,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      role: ctx.role,
    });

    // Determine effective tenant for archive operation
    let effectiveTenantId: string;

    if (ctx.role === 'internal-ops') {
      // internal-ops: need to get snapshot first to determine its tenant
      const snapshot = await this.snapshotStore.findById(snapshotId);
      if (!snapshot) {
        throw new HttpException(
          {
            statusCode: HttpStatus.NOT_FOUND,
            error: 'Not Found',
            message: `Snapshot ${snapshotId} not found`,
          },
          HttpStatus.NOT_FOUND,
        );
      }
      effectiveTenantId = snapshot.tenantId;
    } else {
      // tenant-admin: use own tenant
      effectiveTenantId = ctx.tenantId;
    }

    // Call service (handles tenant verification internally)
    // Phase 10: Pass actor (userId) and reason for audit trail
    const result = await this.legalHoldService.archiveLegalHold(
      effectiveTenantId, 
      snapshotId,
      ctx.userId, // actor for audit
      undefined,  // reason (could be added as request body param)
    );

    // Map service errors to HTTP errors
    if (!result.success) {
      switch (result.error) {
        case 'SNAPSHOT_NOT_FOUND':
          // Includes tenant mismatch (no information leakage)
          throw new HttpException(
            {
              statusCode: HttpStatus.NOT_FOUND,
              error: 'Not Found',
              message: `Snapshot ${snapshotId} not found`,
            },
            HttpStatus.NOT_FOUND,
          );

        case 'NOT_LEGAL_HOLD':
          // Wrong resource type - 400 Bad Request
          throw new HttpException(
            {
              statusCode: HttpStatus.BAD_REQUEST,
              error: 'Bad Request',
              message: result.errorMessage || `Snapshot ${snapshotId} is not under legal hold`,
            },
            HttpStatus.BAD_REQUEST,
          );

        case 'IS_BASELINE':
          // State conflict - 409 Conflict
          throw new CannotArchiveBaselineException(snapshotId);

        default:
          // Unknown error
          throw new HttpException(
            {
              statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
              error: 'Internal Server Error',
              message: result.errorMessage || 'Failed to archive snapshot',
            },
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
      }
    }

    this.logger.debug('[LegalHoldController] Snapshot archived', {
      snapshotId,
      changed: result.changed,
      tenantId: effectiveTenantId,
      archivedAt: result.archivedAt,
    });

    return {
      archived: true,
      changed: result.changed,
      archivedAt: result.archivedAt, // Phase 10: Include timestamp
    };
  }

  // ============================================================================
  // GET /legal-holds/stats
  // ============================================================================

  /**
   * Get legal hold statistics
   * 
   * Guards: RBAC (403)
   * 
   * Query params:
   * - tenantId (internal-ops only, required): Target tenant
   * 
   * @returns LegalHoldStatsResponseDto
   */
  @Get('stats')
  @UseGuards(SimulationRBACGuard)
  async getStats(
    @Query('tenantId') tenantId?: string,
    @SimulationTenant() ctx?: SimulationTenantContext,
  ): Promise<LegalHoldStatsResponseDto> {
    // Guard guarantees ctx exists
    if (!ctx) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    this.logger.debug('[LegalHoldController] GET /legal-holds/stats', {
      tenantIdQuery: tenantId,
      ctxTenantId: ctx.tenantId,
      role: ctx.role,
    });

    // Resolve effective tenant
    const effectiveTenantId = this.resolveEffectiveTenantId(ctx, tenantId, 'GET /legal-holds/stats');

    // Get stats from store (efficient aggregation)
    const stats = await this.snapshotStore.getLegalHoldStats(effectiveTenantId);

    return {
      totalCount: stats.totalCount,
      byIncidentCount: stats.byIncidentCount,
      oldestHoldAt: stats.oldestHoldAt,
      averageAgeDays: Math.round(stats.averageAgeDays * 100) / 100, // 2 decimal places
    };
  }
}
