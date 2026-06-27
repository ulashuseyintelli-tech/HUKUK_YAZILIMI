import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { CaseStatusService } from './case-status.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { GuidedOpenObserveService } from '../permission-diagnostics/guided-open-observe.service';
import { GuidedEdgeGateService } from '../permission-diagnostics/guided-edge/guided-edge-gate.service';
import { ActionCode } from '../policy-engine/types/action-code.enum';
import { LegalCaseStatus } from '@prisma/client';

// P3-2C: confirm token binding'in sabit yüzey kimliği (issue↔consume aynı olmalı).
const CHANGE_STATUS_SURFACE = 'POST /case-status/:caseId/change';

@Controller('case-status')
export class CaseStatusController {
  constructor(
    private readonly caseStatusService: CaseStatusService,
    // P2b-2c-2: CHANGE_STATUS Guided-Open observe adapter (diagnostic only; engelleme yok)
    private readonly guidedOpenObserve: GuidedOpenObserveService,
    // P3-2C: guarded-edge confirm gate (VARSAYILAN OFF → PROCEED → mevcut davranış)
    private readonly guidedEdgeGate: GuidedEdgeGateService,
  ) {}

  // Tüm statüleri listele
  @Get('list')
  getStatusList() {
    return {
      success: true,
      data: this.caseStatusService.getStatusList(),
    };
  }

  /// <remarks>
  /// Çağrıldığı yerler:
  /// - CaseStatusController.changeStatus() → POST /case-status/:caseId/change (frontend BulkOperationsPanel → api.changeCaseStatus)
  /// P2b-2c-1 hardening: METHOD-level JwtAuthGuard + truthful @CurrentUser actor/tenant; body.userId YOK SAYILIR; cross-tenant → 404.
  /// P2b-2c-2: PRE-action CHANGE_STATUS observe (diagnostic only; enforced=false, best-effort; mutation davranışı/response DEĞİŞMEDİ).
  /// </remarks>
  // Dosya statüsünü değiştir
  @Post(':caseId/change')
  @UseGuards(JwtAuthGuard)
  async changeStatus(
    @CurrentUser('id') actorUserId: string,
    @CurrentUser('tenantId') tenantId: string,
    @Param('caseId') caseId: string,
    // body.userId DEPRECATED: artık OTORİTER DEĞİL, YOK SAYILIR (truthful actor @CurrentUser("id")'dan gelir).
    // P3-2C: body.confirmationToken OPSİYONEL; yalnız confirm-gate AÇIKKEN retry için anlamlı (default OFF → yok sayılır).
    @Body() body: { status: LegalCaseStatus; reason?: string; userId?: string; confirmationToken?: string },
  ) {
    // P2b-2c-2 CHANGE_STATUS observe (PRE-action; JwtAuthGuard'dan SONRA; enforced=false, best-effort, engelleme YOK).
    // GİZLİLİK: body.status/reason observe'a GEÇMEZ (yalnız actionCode + caseId). body.userId YOK SAYILIR.
    await this.guidedOpenObserve.observe({
      actorUserId,
      tenantId,
      caseId,
      actionCode: ActionCode.CHANGE_STATUS,
    });
    // P3-2C: guarded-edge confirm gate. VARSAYILAN OFF → {kind:'PROCEED'} → statü AYNEN değişir (davranış değişmez).
    // Flag AÇIKKEN: CONFIRM_REQUIRED → structured-200 envelope (statü DEĞİŞMEZ, token issue edilir);
    //              geçerli token retry → consume → PROCEED; geçersiz/expired token → typed 400 (NO 500).
    const gate = await this.guidedEdgeGate.evaluate({
      actorUserId,
      tenantId,
      actionCode: ActionCode.CHANGE_STATUS,
      caseId,
      surface: CHANGE_STATUS_SURFACE,
      payload: { status: body.status, reason: body.reason ?? null },
      confirmationToken: body.confirmationToken,
      message: 'Bu statü değişikliği için onay gerekiyor.',
    });
    if (gate.kind === 'ENVELOPE') {
      return gate.envelope; // structured-200; statü DEĞİŞMEDİ
    }
    const result = await this.caseStatusService.changeStatus(
      tenantId,
      caseId,
      body.status,
      actorUserId,
      body.reason,
    );
    return {
      success: true,
      data: result,
      message: 'Statü başarıyla değiştirildi',
    };
  }

  // Statü geçmişi
  @Get(':caseId/history')
  async getStatusHistory(@Param('caseId') caseId: string) {
    const history = await this.caseStatusService.getStatusHistory(caseId);
    return {
      success: true,
      data: history,
    };
  }
}
