import { Controller, Get, Post, Body, Param, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CpeRequired } from '../policy-engine/decorators/cpe-required.decorator';
import { ActionCode } from '../policy-engine/types/action-code.enum';
import { ClientOffsetService } from './client-offset.service';
import { CreateClientOffsetDto, ReverseClientOffsetDto, PreviewClientOffsetDto } from './dto/client-offset.dto';

interface AuthRequest {
  user: { id: string; tenantId: string };
}

/**
 * TM3 Faz C C-1 — Müvekkil Mahsubu (ClientOffset) controller.
 *
 * GÜVENLİK: @CpeRequired YALNIZ future-compat metadata (CpeRequiredGuard dormant) — yetki BUNA bağlı DEĞİL.
 * Asıl enforcement ClientOffsetService içinde explicit (PARTNER/MANAGER-only; aksi 403). JWT'den ayrı
 * service-level gate; tenantId/actorUserId daima req.user'dan (payload'dan ALINMAZ).
 */
@Controller('client-offsets')
@UseGuards(JwtAuthGuard)
export class ClientOffsetController {
  constructor(private readonly service: ClientOffsetService) {}

  /** Mahsuba uygun payable bucket'lar + ödenmemiş ExpenseRequest'ler + canApply (read-only; otomatik eşleme YOK). */
  @Get('client/:clientId/eligibility')
  async eligibility(@Request() req: AuthRequest, @Param('clientId') clientId: string, @Query('currency') currency?: string) {
    return this.service.getEligibility(req.user.tenantId, req.user.id, clientId, currency || 'TRY');
  }

  /**
   * C-2a — non-persistent mahsup önizlemesi (D3+D4). MUTATE/CREATE/AUDIT YOK; JWT-only read. Hesap backend'de
   * (after/net/netUnchanged); FE yalnız render. amount>max → OFFSET_EXCEEDS_AVAILABLE. Apply yetkisi GEREKMEZ.
   */
  @Post('preview')
  async preview(@Request() req: AuthRequest, @Body() dto: PreviewClientOffsetDto) {
    return this.service.previewOffset(req.user.tenantId, req.user.id, dto);
  }

  /** Müvekkilin mahsupları (APPLY+REVERSAL). */
  @Get('client/:clientId')
  async list(
    @Request() req: AuthRequest,
    @Param('clientId') clientId: string,
    @Query('currency') currency?: string,
    @Query('kind') kind?: 'APPLY' | 'REVERSAL',
  ) {
    return this.service.listOffsets(req.user.tenantId, clientId, { currency, kind });
  }

  /** Mahsup uygula (kind=APPLY). Service-level PARTNER/MANAGER enforce (CLIENT_OFFSET_APPLY). */
  @Post()
  @CpeRequired(ActionCode.CLIENT_OFFSET_APPLY)
  async create(@Request() req: AuthRequest, @Body() dto: CreateClientOffsetDto) {
    return this.service.createOffset(req.user.tenantId, req.user.id, dto);
  }

  /** Mahsup iptali (kind=REVERSAL). Service-level PARTNER/MANAGER enforce (CLIENT_OFFSET_REVERSE) + reason≥10. */
  @Post(':offsetId/reverse')
  @CpeRequired(ActionCode.CLIENT_OFFSET_REVERSE)
  async reverse(@Request() req: AuthRequest, @Param('offsetId') offsetId: string, @Body() dto: ReverseClientOffsetDto) {
    return this.service.reverseOffset(req.user.tenantId, req.user.id, offsetId, dto);
  }
}
