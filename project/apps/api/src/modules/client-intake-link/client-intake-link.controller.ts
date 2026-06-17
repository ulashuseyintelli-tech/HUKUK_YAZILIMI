import { Controller, Get, Post, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { ClientIntakeLinkStatus } from '@prisma/client';
import { ClientIntakeLinkService } from './client-intake-link.service';
import { CreateClientIntakeLinkDto } from './dto/client-intake-link.dto';

interface AuthRequest extends Request {
  user: { id: string; tenantId: string };
}

/**
 * Müvekkil İntake Linki controller (Faz 4.3) — personel/JWT.
 * Yalnız link üretimi + revoke + read. Public submit YOK (4.4). rawToken yalnız create yanıtında.
 */
@Controller('client-intake-links')
@UseGuards(AuthGuard('jwt'))
export class ClientIntakeLinkController {
  constructor(private readonly service: ClientIntakeLinkService) {}

  /** Link üret (ACTIVE) + mail — POST /client-intake-links/case/:caseId. Yanıt: { link, rawToken, intakeUrl } (tek sefer). */
  @Post('case/:caseId')
  async create(
    @Req() req: AuthRequest,
    @Param('caseId') caseId: string,
    @Body() dto: CreateClientIntakeLinkDto,
  ) {
    return this.service.create(req.user.tenantId, caseId, req.user.id, dto);
  }

  /** İptal (ACTIVE → REVOKED) — POST /client-intake-links/:id/revoke */
  @Post(':id/revoke')
  async revoke(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.service.revoke(req.user.tenantId, id, req.user.id);
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
