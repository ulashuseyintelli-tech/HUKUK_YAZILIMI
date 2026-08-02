/**
 * Playbook Controller
 * 
 * Phase 7B - Sprint 3 - Task 3.4
 * 
 * İnce controller, kalın service prensibi.
 * Controller: auth, validation, DTO dönüşümü
 * Service: tüm iş mantığı
 * 
 * @see .kiro/specs/ops-playbook/design.md
 */

import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Headers,
  HttpCode,
  HttpStatus,
  BadRequestException,
  NotFoundException,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import {
  TenantContextGuard,
  TenantCtx,
} from '../../tenant-context/tenant-context.guard';
import { TenantContext } from '../../tenant-context/tenant-context.types';
import {
  PlaybookAction,
  PlaybookAuthorizationGuard,
} from './playbook-authorization.guard';
import { PlaybookAuditInterceptor } from './playbook-audit.interceptor';
import { PlaybookService } from './playbook.service';
import {
  PlaybookMode,
  PauseScope,
  PlaybookStateResponse,
  PlaybookListResponse,
  PlaybookDetailResponse,
  EvaluateResponse,
  RunResponse,
  HealthResponse,
  AcknowledgeResponse,
  ResolveResponse,
  LeaseResponse,
} from './playbook-controller.types';

// ============================================================================
// REQUEST DTOs
// ============================================================================

interface ModeChangeDto {
  mode: PlaybookMode;
}

interface PauseDto {
  scope?: PauseScope;
  incidentId?: string;
  tenantId?: string;
}

interface ResumeDto {
  scope?: PauseScope;
  incidentId?: string;
  tenantId?: string;
}

interface EvaluateDto {
  incidentId: string;
}

interface RunDto {
  incidentId: string;
  mode?: PlaybookMode;
}

interface AcknowledgeDto {
  userId: string;
  note?: string;
}

interface ResolveDto {
  userId: string;
  resolutionNote: string;
}

interface ExtendLeaseDto {
  durationMs: number;
}

// ============================================================================
// CONTROLLER
// ============================================================================

@Controller('calc/diagnostics/playbooks')
@UseGuards(JwtAuthGuard, TenantContextGuard, PlaybookAuthorizationGuard)
@UseInterceptors(PlaybookAuditInterceptor)
export class PlaybookController {
  constructor(
    private readonly playbookService: PlaybookService,
  ) {}

  // ============================================================================
  // ENVANTER - LIST & GET
  // ============================================================================

  /**
   * GET /playbooks
   * List all playbooks with optional filters
   */
  @Get()
  @PlaybookAction('playbook.list')
  async listPlaybooks(
    @TenantCtx() ctx: TenantContext,
    @Query('enabled') enabled?: string,
    @Query('tag') tag?: string,
  ): Promise<PlaybookListResponse> {
    return this.playbookService.listPlaybooks({
      enabled: enabled === 'true' ? true : enabled === 'false' ? false : undefined,
      tag,
      tenantId: ctx.tenantId,
    });
  }

  /**
   * GET /playbooks/_health
   *
   * Keep this static route ahead of /:id so the health surface cannot be
   * interpreted as a playbook identifier.
   */
  @Get('_health')
  @PlaybookAction('playbook.health')
  async getHealth(@TenantCtx() _ctx: TenantContext): Promise<HealthResponse> {
    return this.playbookService.getHealth();
  }

  /**
   * GET /playbooks/:id
   * Get playbook details
   */
  @Get(':id')
  @PlaybookAction('playbook.read')
  async getPlaybook(
    @Param('id') id: string,
    @TenantCtx() ctx: TenantContext,
  ): Promise<PlaybookDetailResponse> {
    const result = await this.playbookService.getPlaybook(id, ctx.tenantId);
    
    if (!result) {
      throw new NotFoundException(`Playbook ${id} not found`);
    }
    
    return result;
  }

  // ============================================================================
  // STATE MANAGEMENT - ENABLE/DISABLE/MODE
  // ============================================================================

  /**
   * POST /playbooks/:id/enable
   */
  @Post(':id/enable')
  @HttpCode(HttpStatus.OK)
  @PlaybookAction('playbook.enable')
  async enablePlaybook(
    @Param('id') id: string,
    @TenantCtx() ctx: TenantContext,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<PlaybookStateResponse> {
    return this.playbookService.enablePlaybook(id, {
      tenantId: ctx.tenantId,
      userId: ctx.actor.id,
      idempotencyKey,
    });
  }

  /**
   * POST /playbooks/:id/disable
   */
  @Post(':id/disable')
  @HttpCode(HttpStatus.OK)
  @PlaybookAction('playbook.disable')
  async disablePlaybook(
    @Param('id') id: string,
    @TenantCtx() ctx: TenantContext,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<PlaybookStateResponse> {
    return this.playbookService.disablePlaybook(id, {
      tenantId: ctx.tenantId,
      userId: ctx.actor.id,
      idempotencyKey,
    });
  }

  /**
   * POST /playbooks/:id/mode
   * Change playbook mode (DRY_RUN | LIVE)
   */
  @Post(':id/mode')
  @HttpCode(HttpStatus.OK)
  @PlaybookAction('playbook.changeMode')
  async changeMode(
    @Param('id') id: string,
    @Body() dto: ModeChangeDto,
    @TenantCtx() ctx: TenantContext,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<PlaybookStateResponse> {
    if (!dto.mode || !['DRY_RUN', 'LIVE'].includes(dto.mode)) {
      throw new BadRequestException('Invalid mode. Must be DRY_RUN or LIVE');
    }
    
    return this.playbookService.changeMode(id, dto.mode, {
      tenantId: ctx.tenantId,
      userId: ctx.actor.id,
      idempotencyKey,
    });
  }

  // ============================================================================
  // PAUSE/RESUME
  // ============================================================================

  /**
   * POST /playbooks/:id/pause
   */
  @Post(':id/pause')
  @HttpCode(HttpStatus.OK)
  @PlaybookAction('playbook.pause')
  async pausePlaybook(
    @Param('id') id: string,
    @Body() dto: PauseDto,
    @TenantCtx() ctx: TenantContext,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<PlaybookStateResponse> {
    const scope = dto.scope || 'TENANT';
    
    if (scope === 'INCIDENT' && !dto.incidentId) {
      throw new BadRequestException('incidentId required for INCIDENT scope');
    }
    
    if (scope === 'GLOBAL') {
      throw new BadRequestException('GLOBAL scope is not permitted for tenant-bound playbooks');
    }

    return this.playbookService.pausePlaybook(id, {
      scope,
      incidentId: dto.incidentId,
      tenantId: ctx.tenantId,
      userId: ctx.actor.id,
      idempotencyKey,
    });
  }

  /**
   * POST /playbooks/:id/resume
   */
  @Post(':id/resume')
  @HttpCode(HttpStatus.OK)
  @PlaybookAction('playbook.resume')
  async resumePlaybook(
    @Param('id') id: string,
    @Body() dto: ResumeDto,
    @TenantCtx() ctx: TenantContext,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<PlaybookStateResponse> {
    const scope = dto.scope || 'TENANT';

    if (scope === 'GLOBAL') {
      throw new BadRequestException('GLOBAL scope is not permitted for tenant-bound playbooks');
    }
    
    return this.playbookService.resumePlaybook(id, {
      scope,
      incidentId: dto.incidentId,
      tenantId: ctx.tenantId,
      userId: ctx.actor.id,
      idempotencyKey,
    });
  }

  // ============================================================================
  // EXECUTION - EVALUATE & RUN
  // ============================================================================

  /**
   * POST /playbooks/:id/evaluate
   * Dry simulation - what would happen?
   */
  @Post(':id/evaluate')
  @HttpCode(HttpStatus.OK)
  @PlaybookAction('playbook.evaluate')
  async evaluatePlaybook(
    @Param('id') id: string,
    @Body() dto: EvaluateDto,
    @TenantCtx() ctx: TenantContext,
  ): Promise<EvaluateResponse> {
    if (!dto.incidentId) {
      throw new BadRequestException('incidentId is required');
    }
    
    return this.playbookService.evaluatePlaybook(id, dto.incidentId, ctx.tenantId);
  }

  /**
   * POST /playbooks/:id/run
   * Execute playbook
   */
  @Post(':id/run')
  @HttpCode(HttpStatus.ACCEPTED)
  @PlaybookAction('playbook.run')
  async runPlaybook(
    @Param('id') id: string,
    @Body() dto: RunDto,
    @TenantCtx() ctx: TenantContext,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<RunResponse> {
    if (!dto.incidentId) {
      throw new BadRequestException('incidentId is required');
    }
    
    const mode = dto.mode || 'DRY_RUN';
    
    return this.playbookService.runPlaybook(id, dto.incidentId, {
      mode,
      tenantId: ctx.tenantId,
      userId: ctx.actor.id,
      idempotencyKey,
    });
  }

  // ============================================================================
  // AUDIT
  // ============================================================================

  /**
   * GET /playbooks/:id/audit
   */
  @Get(':id/audit')
  @PlaybookAction('playbook.audit.read')
  async getAudit(
    @Param('id') id: string,
    @TenantCtx() ctx: TenantContext,
    @Query('limit') limit?: string,
    @Query('since') since?: string,
  ) {
    const limitNum = limit ? parseInt(limit, 10) : 100;
    const sinceDate = since ? new Date(since) : undefined;
    
    return this.playbookService.getPlaybookAudit(id, {
      limit: limitNum,
      since: sinceDate,
      tenantId: ctx.tenantId,
    });
  }

  /**
   * GET /playbooks/:id/audit/export
   */
  @Get(':id/audit/export')
  @PlaybookAction('playbook.audit.export')
  async exportAudit(
    @Param('id') id: string,
    @TenantCtx() ctx: TenantContext,
    @Query('since') since?: string,
  ) {
    const sinceDate = since ? new Date(since) : undefined;
    
    return this.playbookService.exportPlaybookAudit(id, {
      since: sinceDate,
      tenantId: ctx.tenantId,
    });
  }

}

// ============================================================================
// LEASE CONTROLLER
// ============================================================================

@Controller('calc/diagnostics/leases')
export class LeaseController {
  constructor(
    private readonly playbookService: PlaybookService,
  ) {}

  /**
   * GET /leases/active
   */
  @Get('active')
  async getActiveLeases(
    @Query('tenantId') tenantId?: string,
    @Headers('x-tenant-id') headerTenantId?: string,
  ): Promise<LeaseResponse[]> {
    const effectiveTenantId = headerTenantId || tenantId;
    return this.playbookService.getActiveLeases(effectiveTenantId);
  }

  /**
   * POST /leases/:id/revoke
   */
  @Post(':id/revoke')
  @HttpCode(HttpStatus.OK)
  async revokeLease(
    @Param('id') id: string,
    @Headers('x-tenant-id') tenantId?: string,
    @Headers('x-user-id') userId?: string,
  ): Promise<LeaseResponse> {
    return this.playbookService.revokeLease(id, {
      tenantId,
      userId,
    });
  }

  /**
   * POST /leases/:id/extend
   */
  @Post(':id/extend')
  @HttpCode(HttpStatus.OK)
  async extendLease(
    @Param('id') id: string,
    @Body() dto: ExtendLeaseDto,
    @Headers('x-tenant-id') tenantId?: string,
    @Headers('x-user-id') userId?: string,
  ): Promise<LeaseResponse> {
    if (!dto.durationMs || dto.durationMs <= 0) {
      throw new BadRequestException('durationMs must be positive');
    }
    
    return this.playbookService.extendLease(id, dto.durationMs, {
      tenantId,
      userId,
    });
  }
}

// ============================================================================
// INCIDENT CONTROLLER
// ============================================================================

@Controller('calc/diagnostics/incidents')
export class IncidentController {
  constructor(
    private readonly playbookService: PlaybookService,
  ) {}

  /**
   * POST /incidents/:id/acknowledge
   */
  @Post(':id/acknowledge')
  @HttpCode(HttpStatus.OK)
  async acknowledgeIncident(
    @Param('id') id: string,
    @Body() dto: AcknowledgeDto,
    @Headers('x-tenant-id') tenantId?: string,
  ): Promise<AcknowledgeResponse> {
    if (!dto.userId) {
      throw new BadRequestException('userId is required');
    }
    
    return this.playbookService.acknowledgeIncident(id, {
      userId: dto.userId,
      note: dto.note,
      tenantId,
    });
  }

  /**
   * POST /incidents/:id/resolve
   */
  @Post(':id/resolve')
  @HttpCode(HttpStatus.OK)
  async resolveIncident(
    @Param('id') id: string,
    @Body() dto: ResolveDto,
    @Headers('x-tenant-id') tenantId?: string,
  ): Promise<ResolveResponse> {
    if (!dto.userId || !dto.resolutionNote) {
      throw new BadRequestException('userId and resolutionNote are required');
    }
    
    return this.playbookService.resolveIncident(id, {
      userId: dto.userId,
      resolutionNote: dto.resolutionNote,
      tenantId,
    });
  }

  /**
   * GET /incidents/:id/playbook-history
   */
  @Get(':id/playbook-history')
  async getPlaybookHistory(
    @Param('id') id: string,
    @Headers('x-tenant-id') tenantId?: string,
  ) {
    return this.playbookService.getIncidentPlaybookHistory(id, tenantId);
  }
}
