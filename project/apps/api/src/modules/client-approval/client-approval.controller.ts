import { Controller, Get, Post, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { ClientApprovalStatus } from '@prisma/client';
import { ClientApprovalService } from './client-approval.service';
import {
  CreateClientApprovalRequestDto,
  DecisionClientApprovalDto,
  TransitionClientApprovalDto,
} from './dto/client-approval.dto';

interface AuthRequest extends Request {
  user: { id: string; tenantId: string };
}

/**
 * Müvekkil Onay Defteri controller (PR-2).
 * Yalnız create + transition (send/decision/cancel/expire) + read.
 * İçerik PATCH/PUT/DELETE YOK (immutability). tenantId/userId daima CurrentUser'dan.
 */
@Controller('client-approvals')
@UseGuards(AuthGuard('jwt'))
export class ClientApprovalController {
  constructor(private readonly service: ClientApprovalService) {}

  /** Onay talebi oluştur (DRAFT) — POST /client-approvals/case/:caseId */
  @Post('case/:caseId')
  async create(
    @Req() req: AuthRequest,
    @Param('caseId') caseId: string,
    @Body() dto: CreateClientApprovalRequestDto,
  ) {
    return this.service.create(req.user.tenantId, caseId, req.user.id, dto);
  }

  /** Gönderildi işaretle (DRAFT → SENT) — POST /client-approvals/:id/send */
  @Post(':id/send')
  async send(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: TransitionClientApprovalDto,
  ) {
    return this.service.send(req.user.tenantId, id, req.user.id, body.note);
  }

  /** Müvekkil kararı (SENT → APPROVED/REJECTED) — POST /client-approvals/:id/decision */
  @Post(':id/decision')
  async decision(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() dto: DecisionClientApprovalDto,
  ) {
    return this.service.decision(req.user.tenantId, id, req.user.id, dto);
  }

  /** İptal (DRAFT|SENT → CANCELLED) — POST /client-approvals/:id/cancel */
  @Post(':id/cancel')
  async cancel(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: TransitionClientApprovalDto,
  ) {
    return this.service.cancel(req.user.tenantId, id, req.user.id, body.note);
  }

  /** Süresi doldu — manuel (SENT → EXPIRED) — POST /client-approvals/:id/expire */
  @Post(':id/expire')
  async expire(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: TransitionClientApprovalDto,
  ) {
    return this.service.expire(req.user.tenantId, id, req.user.id, body.note);
  }

  /** Dosya bazlı liste — GET /client-approvals/case/:caseId?status= */
  @Get('case/:caseId')
  async listByCase(
    @Req() req: AuthRequest,
    @Param('caseId') caseId: string,
    @Query('status') status?: ClientApprovalStatus,
  ) {
    return this.service.listByCase(req.user.tenantId, caseId, status);
  }

  /** Detay + event geçmişi — GET /client-approvals/:id */
  @Get(':id')
  async findOne(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.service.findOne(req.user.tenantId, id);
  }
}
