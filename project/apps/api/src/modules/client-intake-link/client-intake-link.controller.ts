import { Controller, Get, Post, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { ClientIntakeLinkStatus } from '@prisma/client';
import { ClientIntakeLinkService } from './client-intake-link.service';
import { CreateClientIntakeLinkDto } from './dto/client-intake-link.dto';
import { AuditService } from '../audit/audit.service';
import { OfficeApprovalService } from '../office-approval/office-approval.service';
import {
  CLIENT_WORKSPACE_COMMAND,
  ClientWorkspaceCommandType,
  runAuthorizedClientWorkspaceCommand,
} from '../client/client-workspace-command-authority';

interface AuthRequest extends Request {
  user: { id: string; tenantId: string; role?: string };
}

/**
 * Müvekkil İntake Linki controller (Faz 4.3) — personel/JWT.
 * Yalnız link üretimi + revoke + read. Public submit YOK (4.4). rawToken yalnız create yanıtında.
 */
@Controller('client-intake-links')
@UseGuards(AuthGuard('jwt'))
export class ClientIntakeLinkController {
  constructor(
    private readonly service: ClientIntakeLinkService,
    private readonly officeApproval: OfficeApprovalService,
    private readonly audit: AuditService,
  ) {}

  /**
   * X3-B02 — C2-R5 frozen primitive tüketim noktası.
   *
   * @remarks Çağrıldığı yerler:
   * - create() → POST /client-intake-links/case/:caseId
   * - revoke() → POST /client-intake-links/:id/revoke
   */
  private runWorkspaceCommand<T>(
    req: AuthRequest,
    clientId: string,
    commandType: ClientWorkspaceCommandType,
    execute: () => Promise<T>,
    resultMeta?: (result: T) => Record<string, unknown>,
  ): Promise<T> {
    return runAuthorizedClientWorkspaceCommand(
      {
        isApproverEligible: (userId, tenantId) =>
          this.officeApproval.isApproverEligible(userId, tenantId),
        auditLog: (input) => this.audit.log(input),
      },
      { userId: req.user.id, tenantId: req.user.tenantId, role: req.user.role },
      { tenantId: req.user.tenantId, clientId, commandType },
      execute,
      resultMeta,
    );
  }

  /** Link üret (ACTIVE) + mail — POST /client-intake-links/case/:caseId. Yanıt: { link, rawToken, intakeUrl } (tek sefer). */
  @Post('case/:caseId')
  async create(
    @Req() req: AuthRequest,
    @Param('caseId') caseId: string,
    @Body() dto: CreateClientIntakeLinkDto,
  ) {
    return this.runWorkspaceCommand(
      req,
      dto.clientId,
      CLIENT_WORKSPACE_COMMAND.INTAKE_LINK_CREATE,
      () => this.service.create(req.user.tenantId, caseId, req.user.id, dto),
      (result) => ({ status: (result as { link?: { status?: string } })?.link?.status ?? null }),
    );
  }

  /** İptal (ACTIVE → REVOKED) — POST /client-intake-links/:id/revoke */
  @Post(':id/revoke')
  async revoke(@Req() req: AuthRequest, @Param('id') id: string) {
    const link = await this.service.findOne(req.user.tenantId, id);
    return this.runWorkspaceCommand(
      req,
      link.clientId,
      CLIENT_WORKSPACE_COMMAND.INTAKE_LINK_REVOKE,
      () => this.service.revoke(req.user.tenantId, id, req.user.id),
      (result) => ({ status: (result as { status?: string })?.status ?? null }),
    );
  }

  /** Dosya bazlı liste (token DÖNMEZ) — GET /client-intake-links/case/:caseId?status= */
  @Get('case/:caseId')
  async listByCase(
    @Req() req: AuthRequest,
    @Param('caseId') caseId: string,
    @Query('status') status?: ClientIntakeLinkStatus,
  ) {
    return this.service.listByCase(req.user.tenantId, caseId, status);
  }

  /** Detay (token DÖNMEZ) — GET /client-intake-links/:id */
  @Get(':id')
  async findOne(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.service.findOne(req.user.tenantId, id);
  }
}
