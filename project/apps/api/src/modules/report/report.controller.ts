import { Controller, Get, Query, Param, UseGuards } from '@nestjs/common';
import { ReportService } from './report.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportController {
  constructor(private readonly service: ReportService) {}

  // Dashboard istatistikleri
  @Get('dashboard')
  async getDashboard(@CurrentUser('tenantId') tenantId: string) {
    const data = await this.service.getDashboardStats(tenantId);
    return { success: true, data };
  }

  // Müvekkil bazlı durum raporu
  @Get('client')
  async getClientReport(
    @CurrentUser('tenantId') tenantId: string,
    @Query('clientId') clientId?: string,
  ) {
    const data = await this.service.getClientReport(tenantId, clientId);
    return { success: true, data };
  }

  // Personel performans raporu
  @Get('personel')
  async getPersonelReport(
    @CurrentUser('tenantId') tenantId: string,
    @Query('personelId') personelId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const data = await this.service.getPersonelReport(tenantId, personelId, startDate, endDate);
    return { success: true, data };
  }

  // Risk yönetimi raporu
  @Get('risk')
  async getRiskReport(
    @CurrentUser('tenantId') tenantId: string,
    @Query('riskId') riskId?: string,
  ) {
    const data = await this.service.getRiskReport(tenantId, riskId);
    return { success: true, data };
  }

  // Grup/portföy raporu
  @Get('group/:groupId')
  async getGroupReport(
    @CurrentUser('tenantId') tenantId: string,
    @Param('groupId') groupId: string,
  ) {
    const data = await this.service.getGroupReport(tenantId, groupId);
    return { success: true, data };
  }

  // Durum etiketi raporu
  @Get('durum-etiketi')
  async getDurumEtiketiReport(
    @CurrentUser('tenantId') tenantId: string,
    @Query('durumEtiketiId') durumEtiketiId?: string,
  ) {
    const data = await this.service.getDurumEtiketiReport(tenantId, durumEtiketiId);
    return { success: true, data };
  }

  // Dosya listesi - Raporlama özeti ile (Filtreleme destekli)
  @Get('cases-with-summary')
  async getCasesWithSummary(
    @CurrentUser('tenantId') tenantId: string,
    @Query('takipTuruId') takipTuruId?: string,
    @Query('mahiyetTipiId') mahiyetTipiId?: string,
    @Query('riskId') riskId?: string,
    @Query('durumEtiketiId') durumEtiketiId?: string,
    @Query('sorumluPersonelId') sorumluPersonelId?: string,
    @Query('caseStatus') caseStatus?: string,
    @Query('search') search?: string,
  ) {
    const data = await this.service.getCasesWithSummary(tenantId, {
      takipTuruId,
      mahiyetTipiId,
      riskId,
      durumEtiketiId,
      sorumluPersonelId,
      caseStatus,
      search,
    });
    return { success: true, data };
  }

  // Risk özeti (Dashboard için)
  @Get('risk-summary')
  async getRiskSummary(@CurrentUser('tenantId') tenantId: string) {
    const data = await this.service.getRiskSummary(tenantId);
    return { success: true, data };
  }

  // Excel/CSV Export
  @Get('export/cases')
  async exportCases(
    @CurrentUser('tenantId') tenantId: string,
    @Query('takipTuruId') takipTuruId?: string,
    @Query('mahiyetTipiId') mahiyetTipiId?: string,
    @Query('riskId') riskId?: string,
    @Query('durumEtiketiId') durumEtiketiId?: string,
    @Query('sorumluPersonelId') sorumluPersonelId?: string,
    @Query('caseStatus') caseStatus?: string,
  ) {
    const csvData = await this.service.exportCasesAsCsv(tenantId, {
      takipTuruId,
      mahiyetTipiId,
      riskId,
      durumEtiketiId,
      sorumluPersonelId,
      caseStatus,
    });
    return { success: true, data: csvData, contentType: 'text/csv' };
  }

  // ==================== YENİ RAPORLAR ====================

  // Dosya Borç Raporu (Kapak Hesabı)
  @Get('case-debt/:caseId')
  async getCaseDebtReport(
    @CurrentUser('tenantId') tenantId: string,
    @Param('caseId') caseId: string,
    @Query('calculationDate') calculationDate?: string,
  ) {
    const data = await this.service.getCaseDebtReport(tenantId, caseId, calculationDate);
    return { success: true, data };
  }

  // Faiz Raporu
  @Get('interest/:caseId')
  async getInterestReport(
    @CurrentUser('tenantId') tenantId: string,
    @Param('caseId') caseId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const data = await this.service.getInterestReport(tenantId, caseId, startDate, endDate);
    return { success: true, data };
  }

  // Tahsilat Geçmişi Raporu
  @Get('collection-history')
  async getCollectionHistoryReport(
    @CurrentUser('tenantId') tenantId: string,
    @Query('caseId') caseId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('channels') channels?: string,
    @Query('statuses') statuses?: string,
  ) {
    const data = await this.service.getCollectionHistoryReport(tenantId, {
      caseId,
      startDate,
      endDate,
      channels: channels ? channels.split(',') : undefined,
      statuses: statuses ? statuses.split(',') : undefined,
    });
    return { success: true, data };
  }

  // Tahsilat Özet Raporu
  @Get('collection-summary')
  async getCollectionSummary(
    @CurrentUser('tenantId') tenantId: string,
    @Query('period') period?: 'week' | 'month' | 'year',
  ) {
    const data = await this.service.getCollectionSummary(tenantId, period);
    return { success: true, data };
  }
}
