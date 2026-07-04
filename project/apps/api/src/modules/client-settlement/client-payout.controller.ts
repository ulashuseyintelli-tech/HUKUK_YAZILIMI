import { Controller, Get, Post, Body, Param, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ClientPayoutService } from './client-payout.service';
import { ClientSettlementReadService } from './client-settlement-read.service';
import { CreateClientPayoutDto } from './dto/create-client-payout.dto';

/** actor compile-time shape — req.user.id auth context (body'den ASLA). */
interface AuthRequest {
  user: { id: string; tenantId: string };
}

@Controller('client-payouts')
@UseGuards(JwtAuthGuard)
export class ClientPayoutController {
  constructor(
    private readonly service: ClientPayoutService,
    private readonly readService: ClientSettlementReadService,
  ) {}

  /** ClientPayout listesi (paginated, read). tenant-scoped; cross-tenant/caseClient sızdırmaz. */
  @Get()
  async list(
    @Request() req: AuthRequest,
    @Query('caseId') caseId?: string,
    @Query('caseClientId') caseClientId?: string,
    @Query('currency') currency?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const data = await this.readService.listPayouts(req.user.tenantId, {
      caseId,
      caseClientId,
      currency,
      from,
      to,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
    return { data };
  }

  /**
   * Müvekkile ödeme kaydet (CLIENT_PAYABLE settlement). actor = req.user.id; D1: BalanceLedger DEĞİL.
   * PAYOUT-APPROVAL-2 PR-2a: BİLİNÇLİ OLARAK dokunulmadı — approval-gated DEĞİL (geçici governance-gap,
   * PR-2b'de kapanacak). Onay-gated akış için POST /client-payouts/request + /:id/finalize kullanın.
   */
  @Post()
  async create(@Request() req: AuthRequest, @Body() body: CreateClientPayoutDto) {
    const data = await this.service.create(req.user.tenantId, body, { userId: req.user.id });
    return { data };
  }

  /**
   * PAYOUT-APPROVAL-2 PR-2a (Tasarım B, adım 1/2): yalnız OfficeApprovalRequest oluşturur, ClientPayout
   * satırı henüz yaratılmaz. Onaylandıktan sonra POST /:approvalRequestId/finalize ile kesinleştirilir.
   */
  @Post('request')
  async request(@Request() req: AuthRequest, @Body() body: CreateClientPayoutDto) {
    const data = await this.service.requestPayout(req.user.tenantId, body, { userId: req.user.id });
    return { data };
  }

  /**
   * PAYOUT-APPROVAL-2 PR-2a (Tasarım B, adım 2/2): yalnız APPROVED + payload eşleşen talep için
   * mevcut payout create transaction mantığını çalıştırır (advisory lock + taze outstanding recheck).
   */
  @Post(':approvalRequestId/finalize')
  async finalize(
    @Request() req: AuthRequest,
    @Param('approvalRequestId') approvalRequestId: string,
    @Body() body: CreateClientPayoutDto,
  ) {
    const data = await this.service.finalize(req.user.tenantId, approvalRequestId, body, { userId: req.user.id });
    return { data };
  }
}
