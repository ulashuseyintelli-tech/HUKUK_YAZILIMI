import { Controller, Get, Post, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { ClientIntelStatus } from '@prisma/client';
import { ClientIntelStatementService } from './client-intel-statement.service';
import {
  CreateClientIntelStatementDto,
  TransitionClientIntelStatementDto,
  SupersedeClientIntelStatementDto,
} from './dto/client-intel-statement.dto';

interface AuthRequest extends Request {
  user: { id: string; tenantId: string };
}

/**
 * Müvekkil İstihbarat Beyanı controller (Faz 4.0).
 * Yalnız create + transition (retract/false-positive/supersede) + read.
 * İçerik PATCH/PUT/DELETE YOK (append-only). tenantId/userId daima CurrentUser'dan.
 */
@Controller('client-intel-statements')
@UseGuards(AuthGuard('jwt'))
export class ClientIntelStatementController {
  constructor(private readonly service: ClientIntelStatementService) {}

  /** Beyan oluştur (ACTIVE) — POST /client-intel-statements/case/:caseId */
  @Post('case/:caseId')
  async create(
    @Req() req: AuthRequest,
    @Param('caseId') caseId: string,
    @Body() dto: CreateClientIntelStatementDto,
  ) {
    return this.service.create(req.user.tenantId, caseId, req.user.id, dto);
  }

  /** Geri al (ACTIVE → RETRACTED) — POST /client-intel-statements/:id/retract */
  @Post(':id/retract')
  async retract(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: TransitionClientIntelStatementDto,
  ) {
    return this.service.retract(req.user.tenantId, id, req.user.id, body.note);
  }

  /** Yanlış çıktı (ACTIVE → FALSE_POSITIVE) — POST /client-intel-statements/:id/false-positive */
  @Post(':id/false-positive')
  async falsePositive(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: TransitionClientIntelStatementDto,
  ) {
    return this.service.falsePositive(req.user.tenantId, id, req.user.id, body.note);
  }

  /** Düzeltme (eski SUPERSEDED + yeni ACTIVE) — POST /client-intel-statements/:id/supersede */
  @Post(':id/supersede')
  async supersede(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() dto: SupersedeClientIntelStatementDto,
  ) {
    return this.service.supersede(req.user.tenantId, id, req.user.id, dto);
  }

  /** Dosya bazlı liste (default ACTIVE) — GET /client-intel-statements/case/:caseId?status= */
  @Get('case/:caseId')
  async listByCase(
    @Req() req: AuthRequest,
    @Param('caseId') caseId: string,
    @Query('status') status?: ClientIntelStatus,
  ) {
    return this.service.listByCase(req.user.tenantId, caseId, status);
  }

  /** Borçlu bazlı liste (default ACTIVE) — GET /client-intel-statements/debtor/:debtorId?status= */
  @Get('debtor/:debtorId')
  async listByDebtor(
    @Req() req: AuthRequest,
    @Param('debtorId') debtorId: string,
    @Query('status') status?: ClientIntelStatus,
  ) {
    return this.service.listByDebtor(req.user.tenantId, debtorId, status);
  }

  /** Detay — GET /client-intel-statements/:id */
  @Get(':id')
  async findOne(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.service.findOne(req.user.tenantId, id);
  }
}
