import { Controller, Get, Post, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { ClientStatementStatus } from '@prisma/client';
import { ClientStatementService } from './client-statement.service';
import {
  CreateClientStatementDto,
  CreateClientLevelStatementDto,
  SupersedeClientStatementDto,
  VoidClientStatementDto,
} from './dto/client-statement.dto';

interface AuthRequest extends Request {
  user: { id: string; tenantId: string };
}

/**
 * Müvekkil Ekstresi controller (PR-3).
 * Yalnız create(generate) + supersede + void + read. İçerik PATCH/PUT/DELETE YOK (immutability).
 * tenantId/userId daima CurrentUser'dan.
 */
@Controller('client-statements')
@UseGuards(AuthGuard('jwt'))
export class ClientStatementController {
  constructor(private readonly service: ClientStatementService) {}

  /** Ekstre üret (ACTIVE) — POST /client-statements/case/:caseId */
  @Post('case/:caseId')
  async create(
    @Req() req: AuthRequest,
    @Param('caseId') caseId: string,
    @Body() dto: CreateClientStatementDto,
  ) {
    return this.service.create(req.user.tenantId, caseId, req.user.id, dto);
  }

  /**
   * Faz B — CLIENT-LEVEL (genel) ekstre üret (caseId=null; tüm eligible dosyalar, yalnız CLIENT_SPECIFIC).
   * POST /client-statements/client/:clientId  (':id/...' route'larından ÖNCE; static 'client' segment ayırır)
   */
  @Post('client/:clientId')
  async createClientLevel(
    @Req() req: AuthRequest,
    @Param('clientId') clientId: string,
    @Body() dto: CreateClientLevelStatementDto,
  ) {
    return this.service.createClientLevel(req.user.tenantId, clientId, req.user.id, dto);
  }

  /** Supersede (eskisi SUPERSEDED + yeni ACTIVE) — POST /client-statements/:id/supersede */
  @Post(':id/supersede')
  async supersede(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() dto: SupersedeClientStatementDto,
  ) {
    return this.service.supersede(req.user.tenantId, id, req.user.id, dto);
  }

  /** Void (ACTIVE → VOID) — POST /client-statements/:id/void */
  @Post(':id/void')
  async void(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: VoidClientStatementDto,
  ) {
    return this.service.void(req.user.tenantId, id, req.user.id, body.note);
  }

  /** Dosya bazlı liste (default ACTIVE) — GET /client-statements/case/:caseId?status= */
  @Get('case/:caseId')
  async listByCase(
    @Req() req: AuthRequest,
    @Param('caseId') caseId: string,
    @Query('status') status?: ClientStatementStatus,
  ) {
    return this.service.listByCase(req.user.tenantId, caseId, status);
  }

  /**
   * Faz B — CLIENT-LEVEL (genel) ekstre listesi (caseId=null; default ACTIVE) — GET /client-statements/client/:clientId?status=
   * (':id' detay route'undan ÖNCE; 'client' static segment iki-segment match ile ayırır.)
   */
  @Get('client/:clientId')
  async listByClient(
    @Req() req: AuthRequest,
    @Param('clientId') clientId: string,
    @Query('status') status?: ClientStatementStatus,
  ) {
    return this.service.listByClient(req.user.tenantId, clientId, status);
  }

  /** Detay + satırlar — GET /client-statements/:id */
  @Get(':id')
  async findOne(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.service.findOne(req.user.tenantId, id);
  }
}
