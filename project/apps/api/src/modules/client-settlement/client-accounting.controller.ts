import { Controller, Get, Param, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ClientSettlementReadService } from './client-settlement-read.service';

/** actor compile-time shape — req.user.tenantId auth context. */
interface AuthRequest {
  user: { id: string; tenantId: string };
}

/**
 * TM3 Faz 7 read addendum — müvekkil muhasebe giriş yüzeyi (read-only).
 *
 * clientId yalnız sayfa bağlamı; finansal scope caseClientId. Bu controller müvekkilin
 * dosyalarını + her dosyadaki caseClientId'yi döner (caseClientId-resolve + client-cases gap).
 */
@Controller('clients/:clientId/accounting')
@UseGuards(JwtAuthGuard)
export class ClientAccountingController {
  constructor(private readonly readService: ClientSettlementReadService) {}

  /** Müvekkilin (eligible) dosyaları + caseClientId resolve. tenant-scoped. */
  @Get('cases')
  async cases(@Request() req: AuthRequest, @Param('clientId') clientId: string) {
    const data = await this.readService.listClientCases(req.user.tenantId, clientId);
    return { data };
  }

  /**
   * Faz A — Müvekkil Genel Cari (client-level read-only projection). A grubu müvekkile özgü,
   * B grubu dosya geneli + dosya kırılımı. Mutation/yeni-defter/migration YOK.
   * GET /clients/:clientId/accounting/summary?currency=TRY
   */
  @Get('summary')
  async summary(
    @Request() req: AuthRequest,
    @Param('clientId') clientId: string,
    @Query('currency') currency?: string,
  ) {
    const data = await this.readService.getClientAccountingSummary(req.user.tenantId, clientId, currency || 'TRY');
    return { data };
  }
}
