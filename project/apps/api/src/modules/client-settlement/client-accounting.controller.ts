import { Controller, Get, Param, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ClientAccountingMovementsReadService } from './client-accounting-movements-read.service';
import { ClientAccountingSummaryReadService } from './client-accounting-summary-read.service';
import { ClientSettlementReadService } from './client-settlement-read.service';

/** actor compile-time shape â€” req.user.tenantId auth context. */
interface AuthRequest {
  user: { id: string; tenantId: string };
}

/**
 * TM3 Faz 7 read addendum â€” mÃ¼vekkil muhasebe giriÅŸ yÃ¼zeyi (read-only).
 *
 * clientId yalnÄ±z sayfa baÄŸlamÄ±; finansal scope caseClientId. Bu controller mÃ¼vekkilin
 * dosyalarÄ±nÄ± + her dosyadaki caseClientId'yi dÃ¶ner (caseClientId-resolve + client-cases gap).
 */
@Controller('clients/:clientId/accounting')
@UseGuards(JwtAuthGuard)
export class ClientAccountingController {
  constructor(
    private readonly readService: ClientSettlementReadService,
    private readonly summaryReadService: ClientAccountingSummaryReadService,
    private readonly movementsReadService: ClientAccountingMovementsReadService,
  ) {}

  /** MÃ¼vekkilin (eligible) dosyalarÄ± + caseClientId resolve. tenant-scoped. */
  @Get('cases')
  async cases(@Request() req: AuthRequest, @Param('clientId') clientId: string) {
    const data = await this.readService.listClientCases(req.user.tenantId, clientId);
    return { data };
  }

  /**
   * Faz A â€” MÃ¼vekkil Genel Cari (client-level read-only projection). A grubu mÃ¼vekkile Ã¶zgÃ¼,
   * B grubu dosya geneli + dosya kÄ±rÄ±lÄ±mÄ±. Mutation/yeni-defter/migration YOK.
   * GET /clients/:clientId/accounting/summary?currency=TRY
   */
  @Get('summary')
  async summary(
    @Request() req: AuthRequest,
    @Param('clientId') clientId: string,
    @Query('currency') currency?: string,
  ) {
    const data = await this.summaryReadService.getClientAccountingSummary(req.user.tenantId, clientId, currency || 'TRY');
    return { data };
  }

  /**
   * Faz A-MOV â€” MÃ¼vekkil Genel Cari birleÅŸik hareket listesi (read-only projection).
   * Summary'deki A/B (CLIENT_SPECIFIC / CASE_CONTEXT) ayrÄ±mÄ± korunur; yeni defter/mutation YOK.
   * GET /clients/:clientId/accounting/movements?scope=client|case&caseId=&group=&currency=&page=&pageSize=&from=&to=
   */
  @Get('movements')
  async movements(
    @Request() req: AuthRequest,
    @Param('clientId') clientId: string,
    @Query('scope') scope?: 'client' | 'case',
    @Query('caseId') caseId?: string,
    @Query('group') group?: 'CLIENT_SPECIFIC' | 'CASE_CONTEXT',
    @Query('currency') currency?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const data = await this.movementsReadService.getClientAccountingMovements(req.user.tenantId, clientId, {
      scope,
      caseId,
      group,
      currency: currency || 'TRY',
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      from,
      to,
    });
    return { data };
  }
}
