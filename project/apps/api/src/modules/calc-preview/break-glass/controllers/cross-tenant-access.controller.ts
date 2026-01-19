/**
 * CrossTenantAccessController
 * 
 * Task 10.5.2 - Cross-tenant read-only access endpoints
 * 
 * Endpoints:
 * - GET /api/v1/internal-ops/cross-tenant/:tenantId/snapshots
 * - GET /api/v1/internal-ops/cross-tenant/:tenantId/snapshots/:snapshotId
 * - GET /api/v1/internal-ops/cross-tenant/:tenantId/legal-holds
 * - GET /api/v1/internal-ops/cross-tenant/:tenantId/legal-holds/:holdId
 * 
 * Guard Chain (in order):
 * 1. KillSwitchGuard - 503 when disabled (Gate 3)
 * 2. NetworkAllowlistGuard - 403 outside VPN (INV-4)
 * 3. TenantContextGuard - Resolves actor identity (Gate 1)
 * 4. InternalOpsGuard - Verifies internal_ops role
 * 5. BreakGlassGrantGuard - 403 without valid grant + actor binding (INV-1, Gate 2)
 * 
 * INV-5: Read-only access - no mutations permitted
 * 
 * AUDIT: CROSS_TENANT_ACCESS_USED is emitted by CrossTenantAccessInterceptor,
 * NOT by controller methods. This ensures consistent audit coverage.
 */

import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  Req,
  Logger,
  NotFoundException,
  ForbiddenException,
  MethodNotAllowedException,
  Post,
  Put,
  Patch,
  Delete,
  UseInterceptors,
} from '@nestjs/common';
import {
  BreakGlassKillSwitchGuard,
  NetworkAllowlistGuard,
  InternalOpsGuard,
  BreakGlassGrantGuard,
  RequestWithBreakGlass,
} from '../guards';
import { TenantContextGuard } from '../../tenant-context';
import { CROSS_TENANT_SCOPES } from '../break-glass.types';
import { CrossTenantAccessInterceptor } from '../interceptors/cross-tenant-access.interceptor';

// ============================================================================
// Response DTOs
// ============================================================================

/**
 * Snapshot summary for list response
 */
export interface SnapshotSummaryDto {
  snapshotId: string;
  incidentId: string;
  createdAt: string;
  status: string;
  isBaseline: boolean;
}

/**
 * Snapshot detail response
 */
export interface SnapshotDetailDto {
  snapshotId: string;
  incidentId: string;
  tenantId: string;
  createdAt: string;
  status: string;
  isBaseline: boolean;
  metadata?: Record<string, unknown>;
}

/**
 * Snapshot list response
 */
export interface SnapshotListResponseDto {
  snapshots: SnapshotSummaryDto[];
  pagination: {
    limit: number;
    cursor?: string;
    nextCursor?: string;
    hasMore: boolean;
  };
}

/**
 * Legal hold summary for list response
 */
export interface LegalHoldSummaryDto {
  holdId: string;
  incidentId: string;
  createdAt: string;
  expiresAt?: string;
  status: 'ACTIVE' | 'RELEASED' | 'EXPIRED';
  reason: string;
}

/**
 * Legal hold detail response
 */
export interface LegalHoldDetailDto {
  holdId: string;
  incidentId: string;
  tenantId: string;
  createdAt: string;
  expiresAt?: string;
  status: 'ACTIVE' | 'RELEASED' | 'EXPIRED';
  reason: string;
  createdBy: string;
  releasedAt?: string;
  releasedBy?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Legal hold list response
 */
export interface LegalHoldListResponseDto {
  legalHolds: LegalHoldSummaryDto[];
  pagination: {
    limit: number;
    cursor?: string;
    nextCursor?: string;
    hasMore: boolean;
  };
}

// ============================================================================
// Controller
// ============================================================================

@Controller('api/v1/internal-ops/cross-tenant')
@UseGuards(
  BreakGlassKillSwitchGuard,
  NetworkAllowlistGuard,
  TenantContextGuard,
  InternalOpsGuard,
  BreakGlassGrantGuard,
)
@UseInterceptors(CrossTenantAccessInterceptor)
export class CrossTenantAccessController {
  private readonly logger = new Logger(CrossTenantAccessController.name);

  // NOTE: Audit is handled by CrossTenantAccessInterceptor, not controller

  // ==========================================================================
  // INV-5: Block all mutation methods
  // ==========================================================================

  @Post(':tenantId/*')
  blockPost(): never {
    throw new MethodNotAllowedException({
      error: 'MUTATION_NOT_ALLOWED',
      message: 'Cross-tenant access is read-only. POST is not permitted.',
    });
  }

  @Put(':tenantId/*')
  blockPut(): never {
    throw new MethodNotAllowedException({
      error: 'MUTATION_NOT_ALLOWED',
      message: 'Cross-tenant access is read-only. PUT is not permitted.',
    });
  }

  @Patch(':tenantId/*')
  blockPatch(): never {
    throw new MethodNotAllowedException({
      error: 'MUTATION_NOT_ALLOWED',
      message: 'Cross-tenant access is read-only. PATCH is not permitted.',
    });
  }

  @Delete(':tenantId/*')
  blockDelete(): never {
    throw new MethodNotAllowedException({
      error: 'MUTATION_NOT_ALLOWED',
      message: 'Cross-tenant access is read-only. DELETE is not permitted.',
    });
  }

  // ==========================================================================
  // GET /:tenantId/snapshots - List snapshots
  // ==========================================================================

  @Get(':tenantId/snapshots')
  async listSnapshots(
    @Param('tenantId') tenantId: string,
    @Query('limit') limitStr?: string,
    @Query('cursor') cursor?: string,
    @Query('incidentId') _incidentId?: string,
    @Req() req?: RequestWithBreakGlass,
  ): Promise<SnapshotListResponseDto> {
    this.logger.debug('Cross-tenant snapshot list', {
      tenantId,
      limit: limitStr,
    });

    // Verify scope
    this.verifyScope(req, CROSS_TENANT_SCOPES.SNAPSHOT, tenantId);

    // Parse limit
    const limit = Math.min(Math.max(parseInt(limitStr || '20', 10) || 20, 1), 100);

    // NOTE: USED audit event is emitted by interceptor, not here

    // Build pagination response with conditional cursor
    const pagination: SnapshotListResponseDto['pagination'] = {
      limit,
      hasMore: false,
    };
    if (cursor) {
      pagination.cursor = cursor;
    }

    // TODO: Integrate with actual snapshot store
    // For now, return empty list (placeholder)
    return {
      snapshots: [],
      pagination,
    };
  }

  // ==========================================================================
  // GET /:tenantId/snapshots/:snapshotId - Get snapshot detail
  // ==========================================================================

  @Get(':tenantId/snapshots/:snapshotId')
  async getSnapshot(
    @Param('tenantId') tenantId: string,
    @Param('snapshotId') snapshotId: string,
    @Req() req?: RequestWithBreakGlass,
  ): Promise<SnapshotDetailDto> {
    this.logger.debug('Cross-tenant snapshot detail', {
      tenantId,
      snapshotId,
    });

    // Verify scope
    this.verifyScope(req, CROSS_TENANT_SCOPES.SNAPSHOT, tenantId);

    // NOTE: USED audit event is emitted by interceptor, not here

    // TODO: Integrate with actual snapshot store
    // For now, return 404 (placeholder)
    throw new NotFoundException({
      error: 'SNAPSHOT_NOT_FOUND',
      message: `Snapshot not found: ${snapshotId}`,
    });
  }

  // ==========================================================================
  // GET /:tenantId/legal-holds - List legal holds
  // ==========================================================================

  @Get(':tenantId/legal-holds')
  async listLegalHolds(
    @Param('tenantId') tenantId: string,
    @Query('limit') limitStr?: string,
    @Query('cursor') cursor?: string,
    @Query('status') _status?: 'ACTIVE' | 'RELEASED' | 'EXPIRED',
    @Req() req?: RequestWithBreakGlass,
  ): Promise<LegalHoldListResponseDto> {
    this.logger.debug('Cross-tenant legal hold list', {
      tenantId,
      limit: limitStr,
    });

    // Verify scope
    this.verifyScope(req, CROSS_TENANT_SCOPES.LEGAL_HOLD, tenantId);

    // Parse limit
    const limit = Math.min(Math.max(parseInt(limitStr || '20', 10) || 20, 1), 100);

    // NOTE: USED audit event is emitted by interceptor, not here

    // Build pagination response with conditional cursor
    const pagination: LegalHoldListResponseDto['pagination'] = {
      limit,
      hasMore: false,
    };
    if (cursor) {
      pagination.cursor = cursor;
    }

    // TODO: Integrate with actual legal hold store
    // For now, return empty list (placeholder)
    return {
      legalHolds: [],
      pagination,
    };
  }

  // ==========================================================================
  // GET /:tenantId/legal-holds/:holdId - Get legal hold detail
  // ==========================================================================

  @Get(':tenantId/legal-holds/:holdId')
  async getLegalHold(
    @Param('tenantId') tenantId: string,
    @Param('holdId') holdId: string,
    @Req() req?: RequestWithBreakGlass,
  ): Promise<LegalHoldDetailDto> {
    this.logger.debug('Cross-tenant legal hold detail', {
      tenantId,
      holdId,
    });

    // Verify scope
    this.verifyScope(req, CROSS_TENANT_SCOPES.LEGAL_HOLD, tenantId);

    // NOTE: USED audit event is emitted by interceptor, not here

    // TODO: Integrate with actual legal hold store
    // For now, return 404 (placeholder)
    throw new NotFoundException({
      error: 'LEGAL_HOLD_NOT_FOUND',
      message: `Legal hold not found: ${holdId}`,
    });
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  /**
   * Verify the grant has the required scope for the target tenant
   */
  private verifyScope(
    req: RequestWithBreakGlass | undefined,
    requiredScope: string,
    targetTenantId: string,
  ): void {
    if (!req?.breakGlassGrant) {
      throw new ForbiddenException({
        error: 'NO_GRANT',
        message: 'Break-glass grant not found on request',
      });
    }

    const tokenClaims = req.breakGlassGrant;

    // Verify target tenant matches
    if (tokenClaims.targetTenantId !== targetTenantId) {
      throw new ForbiddenException({
        error: 'TENANT_MISMATCH',
        message: `Grant is for tenant ${tokenClaims.targetTenantId}, not ${targetTenantId}`,
      });
    }

    // Verify scope
    if (!tokenClaims.scopes.includes(requiredScope)) {
      throw new ForbiddenException({
        error: 'SCOPE_NOT_GRANTED',
        message: `Grant does not include scope: ${requiredScope}`,
      });
    }
  }
}
