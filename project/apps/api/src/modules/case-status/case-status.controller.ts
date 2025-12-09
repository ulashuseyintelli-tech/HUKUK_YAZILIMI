import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { CaseStatusService } from './case-status.service';
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

  // Dosya statüsünü değiştir
  @Post(':caseId/change')
  async changeStatus(
    @Param('caseId') caseId: string,
    @Body() body: { status: LegalCaseStatus; reason?: string; userId?: string },
  ) {
    const result = await this.caseStatusService.changeStatus(
      caseId,
      body.status,
      body.userId,
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
