import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ViewerWriteDenyGuard } from '../auth/guards/viewer-write-deny.guard';
import { CaseViewScoped } from '../case/case-view-scope.guard';
import { ClaimLiabilitySelectionService } from './claim-liability-selection.service';
import { ClaimLiabilityPreviewDto, ClaimLiabilityRequestDto } from './dto/claim-liability.dto';

/**
 * Seçimlik kalem bazlı borçlu sorumluluğu — seçim uçları.
 *
 * Okuma (kalem başına durum) `GET /cases/:id/claim-liability` ucundadır (CaseController) ve bayraktan bağımsızdır.
 * Buradaki önizleme ve talep uçları `CLAIM_LIABILITY_SELECTION_ENABLED` bayrağı kapalıyken 409 döner.
 */
@Controller('cases')
@UseGuards(JwtAuthGuard, ViewerWriteDenyGuard)
export class ClaimLiabilityController {
  constructor(private readonly selection: ClaimLiabilitySelectionService) {}

  /** Seçim geçmişi (salt okuma; bayraktan bağımsız). GET /cases/:caseId/claim-liability/history */
  @Get(':caseId/claim-liability/history')
  @CaseViewScoped()
  history(
    @CurrentUser('tenantId') tenantId: string,
    @Param('caseId') caseId: string,
    @Query('claimItemId') claimItemId?: string,
  ) {
    return this.selection.history(tenantId, caseId, claimItemId || undefined);
  }

  /** Önce / sonra önizlemesi — YAZMAZ. POST /cases/:caseId/claim-liability/preview */
  @Post(':caseId/claim-liability/preview')
  @CaseViewScoped()
  preview(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('id') actorUserId: string,
    @Param('caseId') caseId: string,
    @Body() body: ClaimLiabilityPreviewDto,
  ) {
    return this.selection.preview(tenantId, actorUserId, caseId, body.selections);
  }

  /**
   * Seçim talebi — mevcut yüksek etkili kalem değişikliği onay kaydını açar; seçim onaylanınca yazılır.
   * POST /cases/:caseId/claim-liability/request
   */
  @Post(':caseId/claim-liability/request')
  @CaseViewScoped()
  request(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('id') actorUserId: string,
    @Param('caseId') caseId: string,
    @Body() body: ClaimLiabilityRequestDto,
  ) {
    return this.selection.request(tenantId, actorUserId, caseId, {
      selections: body.selections,
      onizlemeOzeti: body.onizlemeOzeti,
    });
  }
}
