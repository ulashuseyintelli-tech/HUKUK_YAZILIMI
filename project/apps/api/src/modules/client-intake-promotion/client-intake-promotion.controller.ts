import { Controller, Post, Body, Param, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { ClientIntakePromotionService } from './client-intake-promotion.service';
import { PromoteSubmissionDto } from './dto/promote-submission.dto';
import { PromoteAddressDto } from './dto/promote-address.dto';
import { PromoteSoftDto } from './dto/promote-soft.dto';

interface AuthRequest extends Request {
  user: { id: string; tenantId: string };
}

/**
 * Client Intake PROMOTE controller (Faz 4.6) — personel/JWT.
 * Onaylı soft-intel alanları ClientIntelStatement'a yazar. Public uç promote ETMEZ.
 */
@Controller()
@UseGuards(AuthGuard('jwt'))
export class ClientIntakePromotionController {
  constructor(private readonly service: ClientIntakePromotionService) {}

  /**
   * Promote — POST /client-intake-submissions/:id/promote { debtorId }
   * Yanıt: { submissionStatus, promoted[], skipped[] } (skipped açıkça döner — F46-K4).
   */
  @Post('client-intake-submissions/:id/promote')
  async promote(@Req() req: AuthRequest, @Param('id') id: string, @Body() dto: PromoteSubmissionDto) {
    return this.service.promote(req.user.tenantId, id, req.user.id, dto.debtorId);
  }

  /**
   * ADDRESS alanını DebtorAddress'e promote et (Faz 4.6b — HYBRID, personel structured girer)
   * POST /client-intake-fields/:fieldId/promote-address { debtorId, street, city, ... }
   * Yanıt: { result: PROMOTED|DUPLICATE_ADDRESS, debtorAddressId, submissionStatus }.
   */
  @Post('client-intake-fields/:fieldId/promote-address')
  async promoteAddress(@Req() req: AuthRequest, @Param('fieldId') fieldId: string, @Body() dto: PromoteAddressDto) {
    return this.service.promoteAddress(req.user.tenantId, fieldId, req.user.id, dto);
  }

  /**
   * TEK soft-intel alanını ClientIntelStatement'a promote et (Faz 4.7 PR-C2a — FIELD-LEVEL).
   * Frontend (C2b) yalnız bu ucu kullanır (bulk/tek-tık submission-level promote DEĞİL).
   * POST /client-intake-fields/:fieldId/promote-soft { debtorId }
   * Yanıt: { result: 'PROMOTED', clientIntelStatementId, submissionStatus }.
   */
  @Post('client-intake-fields/:fieldId/promote-soft')
  async promoteSoft(@Req() req: AuthRequest, @Param('fieldId') fieldId: string, @Body() dto: PromoteSoftDto) {
    return this.service.promoteSoftField(req.user.tenantId, fieldId, req.user.id, dto.debtorId);
  }
}
