import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { CaseStatusService } from './case-status.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { LegalCaseStatus } from '@prisma/client';

@Controller('case-status')
export class CaseStatusController {
  constructor(private readonly caseStatusService: CaseStatusService) {}

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
  /// </remarks>
  // Dosya statüsünü değiştir
  @Post(':caseId/change')
  @UseGuards(JwtAuthGuard)
  async changeStatus(
    @CurrentUser('id') actorUserId: string,
    @CurrentUser('tenantId') tenantId: string,
    @Param('caseId') caseId: string,
    // body.userId DEPRECATED: artık OTORİTER DEĞİL, YOK SAYILIR (truthful actor @CurrentUser("id")'dan gelir).
    @Body() body: { status: LegalCaseStatus; reason?: string; userId?: string },
  ) {
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
