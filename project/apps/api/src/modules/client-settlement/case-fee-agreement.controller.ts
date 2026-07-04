import { Controller, Get, Post, Body, Param, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CpeRequired } from '../policy-engine/decorators/cpe-required.decorator';
import { ActionCode } from '../policy-engine/types/action-code.enum';
import { CaseFeeAgreementService } from './case-fee-agreement.service';
import {
  CreateCaseFeeAgreementInput,
  UpdateCaseFeeAgreementInput,
} from './dto/case-fee-agreement.dto';

interface AuthRequest {
  user: { id: string; tenantId: string };
}

/**
 * S8-B FAZ-2 — Akdi Ücret Sözleşmesi (CaseFeeAgreement) controller.
 *
 * GÜVENLİK: @CpeRequired(MANAGE_FEE_AGREEMENT) YALNIZ future-compat metadata (CpeRequiredGuard dormant) —
 * yetki BUNA bağlı DEĞİL. Asıl enforcement CaseFeeAgreementService içinde explicit (assertCanManage →
 * isApproverEligible: PARTNER/canApproveOfficeActions-only; aksi 403). Okuma endpoint'lerinde ek capability
 * gate YOK (owner kararı R3); tenant izolasyonu daima servis üzerinden. tenantId/actorUserId daima
 * req.user'dan (body/query'den ALINMAZ). Servis davranışı bu controller ile DEĞİŞMEZ (ince HTTP kabuğu).
 */
@Controller('case-fee-agreements')
@UseGuards(JwtAuthGuard)
export class CaseFeeAgreementController {
  constructor(private readonly service: CaseFeeAgreementService) {}

  /**
   * caseClient için ACTIVE ücret sözleşmesi (recommendation kaynağının aynısı; yoksa null). Read-only.
   *
   * /// <remarks>
   * /// Çağrıldığı yerler:
   * ///  - (FE) CaseFeeAgreement editör kartı → GET /case-fee-agreements/case-client/:caseClientId/active (ayrı PR; henüz YOK)
   * /// </remarks>
   */
  @Get('case-client/:caseClientId/active')
  async active(@Request() req: AuthRequest, @Param('caseClientId') caseClientId: string) {
    return this.service.getActiveForCaseClient(req.user.tenantId, caseClientId);
  }

  /**
   * caseClient sözleşme geçmişi (yeni → eski; ACTIVE/SUPERSEDED/TERMINATED dahil). Read-only.
   *
   * /// <remarks>
   * /// Çağrıldığı yerler:
   * ///  - (FE) CaseFeeAgreement geçmiş listesi → GET /case-fee-agreements/case-client/:caseClientId (ayrı PR; henüz YOK)
   * /// </remarks>
   */
  @Get('case-client/:caseClientId')
  async listForCaseClient(@Request() req: AuthRequest, @Param('caseClientId') caseClientId: string) {
    return this.service.listForCaseClient(req.user.tenantId, caseClientId);
  }

  /**
   * Tek sözleşme (tenant-scoped); yoksa 404. Read-only.
   *
   * /// <remarks>
   * /// Çağrıldığı yerler:
   * ///  - (FE) geçmiş satır detayı → GET /case-fee-agreements/:agreementId (ayrı PR; henüz YOK)
   * /// </remarks>
   */
  @Get(':agreementId')
  async getById(@Request() req: AuthRequest, @Param('agreementId') agreementId: string) {
    return this.service.getById(req.user.tenantId, agreementId);
  }

  /**
   * Yeni ücret sözleşmesi (ACTIVE). Service-level PARTNER/yetkili enforce (MANAGE_FEE_AGREEMENT).
   * Aynı caseClient için zaten ACTIVE varsa 409 (güncelleme kullanılmalı).
   *
   * /// <remarks>
   * /// Çağrıldığı yerler:
   * ///  - (FE) "Yeni sözleşme" → POST /case-fee-agreements (ayrı PR; henüz YOK)
   * /// </remarks>
   */
  @Post()
  @CpeRequired(ActionCode.MANAGE_FEE_AGREEMENT)
  async create(@Request() req: AuthRequest, @Body() input: CreateCaseFeeAgreementInput) {
    return this.service.create(req.user.tenantId, input, { userId: req.user.id });
  }

  /**
   * Düzenleme = yeni versiyon (eski SUPERSEDED + yeni ACTIVE). Service-level PARTNER/yetkili enforce.
   * caseClientId devralınır (değiştirilemez). Yalnız ACTIVE sözleşme güncellenebilir (aksi 409).
   *
   * /// <remarks>
   * /// Çağrıldığı yerler:
   * ///  - (FE) "Düzenle" (yalnız ACTIVE satır) → POST /case-fee-agreements/:agreementId (ayrı PR; henüz YOK)
   * /// </remarks>
   */
  @Post(':agreementId')
  @CpeRequired(ActionCode.MANAGE_FEE_AGREEMENT)
  async update(
    @Request() req: AuthRequest,
    @Param('agreementId') agreementId: string,
    @Body() input: UpdateCaseFeeAgreementInput,
  ) {
    return this.service.update(req.user.tenantId, agreementId, input, { userId: req.user.id });
  }

  /**
   * Sözleşmeyi sonlandır: ACTIVE → TERMINATED. Service-level PARTNER/yetkili enforce. Yeni satır yazılmaz.
   *
   * /// <remarks>
   * /// Çağrıldığı yerler:
   * ///  - (FE) "Sonlandır" → POST /case-fee-agreements/:agreementId/terminate (ayrı PR; henüz YOK)
   * /// </remarks>
   */
  @Post(':agreementId/terminate')
  @CpeRequired(ActionCode.MANAGE_FEE_AGREEMENT)
  async terminate(@Request() req: AuthRequest, @Param('agreementId') agreementId: string) {
    return this.service.terminate(req.user.tenantId, agreementId, { userId: req.user.id });
  }
}
