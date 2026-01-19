/**
 * Legal Hold Controller
 * 
 * Sprint 2F - Task 9.1-9.3
 * Phase 9B.5 - Migrated to ISnapshotStore interface
 * 
 * REST endpoints for legal hold management:
 * - GET /legal-holds
 * - POST /legal-holds/:snapshotId/archive
 * - GET /legal-holds/stats
 * 
 * RED LINE: Baseline snapshots cannot be archived (409)
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
} from '@nestjs/common';
import { SimulationFeatureFlagGuard } from './guards/simulation-feature-flag.guard';
import { SimulationRBACGuard, SimulationTenant, SimulationTenantContext } from './guards/simulation-rbac.guard';
import { LegalHoldInventoryService } from '../simulation/legal-hold-inventory.service';
import { 
  ISnapshotStore, 
  SNAPSHOT_STORE,
} from '../persistence/snapshot-store.interface';
import { InMemoryIncidentStore } from '../simulation/incident-store.service';
import {
  LegalHoldEntryDto,
  LegalHoldListResponseDto,
  ArchiveResponseDto,
  LegalHoldStatsResponseDto,
} from './simulation.dto';
import {
  CannotArchiveBaselineException,
} from './simulation-error.types';
import { HttpException, HttpStatus } from '@nestjs/common';

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
    private readonly incidentStore: InMemoryIncidentStore,
  ) {}

  // ============================================================================
  // GET /legal-holds
  // ============================================================================

  /**
   * List legal hold snapshots
   * 
   * Guards: RBAC (403)
   * 
   * RBAC Rules:
   * - tenant-admin: only own tenant (tenantId query ignored)
   * - internal-ops: any tenant (can use tenantId query)
   * 
   * @param incidentId Optional filter by incident
   * @param tenantId Optional filter by tenant (internal-ops only)
   * @param ctx Tenant context
   * @returns LegalHoldListResponseDto
   */
  @Get()
  @UseGuards(SimulationRBACGuard)
  async listLegalHolds(
    @Query('incidentId') incidentId?: string,
    @Query('tenantId') tenantId?: string,
    @SimulationTenant() ctx?: SimulationTenantContext,
  ): Promise<LegalHoldListResponseDto> {
    this.logger.debug('[LegalHoldController] GET /legal-holds', {
      incidentId,
      tenantId,
      ctxTenantId: ctx?.tenantId,
      role: ctx?.role,
    });

    // Determine effective tenant filter
    let effectiveTenantId: string;
    
    if (ctx?.role === 'tenant-admin') {
      // tenant-admin: ALWAYS filter by own tenant (ignore query param)
      effectiveTenantId = ctx.tenantId;
    } else if (ctx?.role === 'internal-ops' && tenantId) {
      // internal-ops: can use tenantId query param
      effectiveTenantId = tenantId;
    } else {
      // Default to context tenant
      effectiveTenantId = ctx?.tenantId ?? 'unknown';
    }

    // Get LEGAL_HOLD snapshots for tenant
    const legalHoldSnapshots = await this.snapshotStore.findWithLegalHold(effectiveTenantId);

    // Apply incident filter if provided
    let filteredSnapshots = legalHoldSnapshots;
    if (incidentId) {
      filteredSnapshots = filteredSnapshots.filter(s => s.incidentId === incidentId);
    }

    // Map to DTOs
    const holds: LegalHoldEntryDto[] = filteredSnapshots.map(s => ({
      snapshotId: s.snapshotId,
      incidentId: s.incidentId,
      tenantId: s.tenantId,
      createdAt: s.createdAt,
      reason: s.legalHoldReason || 'LEGAL_HOLD',
      archived: this.legalHoldService.isArchived(s.snapshotId),
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
   * RED LINE: Baseline snapshots cannot be archived (409)
   * 
   * @param snapshotId Snapshot ID to archive
   * @param ctx Tenant context
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
    });

    // 1. Get snapshot
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

    // 2. Verify tenant access
    if (ctx.role !== 'internal-ops' && snapshot.tenantId !== ctx.tenantId) {
      throw new HttpException(
        {
          statusCode: HttpStatus.NOT_FOUND,
          error: 'Not Found',
          message: `Snapshot ${snapshotId} not found`,
        },
        HttpStatus.NOT_FOUND,
      );
    }

    // 3. Check if baseline (RED LINE: cannot archive baseline)
    const incident = await this.incidentStore.get(snapshot.incidentId);
    if (incident?.baselineSnapshotId === snapshotId) {
      this.logger.warn('[LegalHoldController] Cannot archive baseline snapshot', {
        snapshotId,
        incidentId: snapshot.incidentId,
      });
      throw new CannotArchiveBaselineException(snapshotId);
    }

    // 4. Archive
    const result = await this.legalHoldService.archiveLegalHold(snapshotId);

    if (!result.success) {
      if (result.error === 'IS_BASELINE') {
        throw new CannotArchiveBaselineException(snapshotId);
      }
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          error: 'Bad Request',
          message: result.errorMessage || 'Failed to archive',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    this.logger.debug('[LegalHoldController] Snapshot archived', {
      snapshotId,
      changed: result.changed,
    });

    return {
      archived: true,
      changed: result.changed,
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
   * @param ctx Tenant context
   * @returns LegalHoldStatsResponseDto
   */
  @Get('stats')
  @UseGuards(SimulationRBACGuard)
  async getStats(
    @SimulationTenant() ctx?: SimulationTenantContext,
  ): Promise<LegalHoldStatsResponseDto> {
    this.logger.debug('[LegalHoldController] GET /legal-holds/stats', {
      tenantId: ctx?.tenantId,
      role: ctx?.role,
    });

    // Determine effective tenant
    const effectiveTenantId = ctx?.tenantId ?? 'unknown';

    // Get stats from store
    const stats = await this.snapshotStore.getLegalHoldStats(effectiveTenantId);

    return {
      totalCount: stats.totalCount,
      byIncidentCount: stats.byIncidentCount,
      oldestHoldAt: stats.oldestHoldAt,
      averageAgeDays: Math.round(stats.averageAgeDays * 100) / 100, // 2 decimal places
    };
  }
}
