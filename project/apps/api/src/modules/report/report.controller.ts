import { Controller, Get, Query, Param, UseGuards, ForbiddenException } from '@nestjs/common';
import { ReportService } from './report.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { WarnOnlyAuditService } from '../permission-diagnostics/warn-only-audit.service';

@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportController {
  constructor(
    private readonly service: ReportService,
    private readonly warnOnlyAudit: WarnOnlyAuditService,
  ) {}

  // Dashboard istatistikleri
  @Get('dashboard')
  async getDashboard(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('id') userId: string,
  ) {
    const data = await this.service.getDashboardStats(tenantId);
    // WP-4d-2: Phase 2 warn-only — response AYNEN döner; ek olarak diagnostic audit (best-effort, block YOK).
    await this.warnOnlyAudit.recordWouldDeny('reports.dashboard', {
      tenantId,
      actorUserId: userId,
      requestPath: '/reports/dashboard',
    });
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

  // Personel performans raporu (DOSYA bazlı — eski rapor, değişmedi)
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

  /**
   * K3 — Kategori bazlı GÖREV performansı (ham metrik). Yönetici (ADMIN) gate: performans
   * verisi hassastır, salt-JWT yetmez. people=MANUAL, system=AUTO_SYSTEM, unattributed=legacy.
   */
  @Get('task-performance')
  async getTaskPerformanceReport(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('role') role: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('taskCategory') taskCategory?: string,
    @Query('resolutionType') resolutionType?: string,
  ) {
    if (role !== 'ADMIN') {
      throw new ForbiddenException('Bu rapora yalnız yönetici (ADMIN) erişebilir');
    }
    const data = await this.service.getTaskPerformanceReport(tenantId, { from, to, taskCategory, resolutionType });
    return { success: true, data };
  }

  /**
   * D4e-8 — Pre-haciz risk DAĞILIM/TEŞHİS raporu (READ-ONLY ölçüm). ADMIN gate: kalibrasyon
   * verisi yönetimseldir. Kör tarama yok: limit cap'li (default 100, max 500). Ağırlık/eşik DEĞİŞMEZ.
   */
  @Get('pre-haciz-risk-distribution')
  async getPreHacizRiskDistribution(
    @CurrentUser('tenantId') tenantId: string,
    @CurrentUser('role') role: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    if (role !== 'ADMIN') {
      throw new ForbiddenException('Bu rapora yalnız yönetici (ADMIN) erişebilir');
    }
    const data = await this.service.getPreHacizRiskDistribution(tenantId, {
      limit: limit ? parseInt(limit, 10) : undefined,
      status,
    });
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
    @Query('responsibleLawyerId') responsibleLawyerId?: string,
    @Query('responsibleStaffId') responsibleStaffId?: string,
    @Query('caseStatus') caseStatus?: string,
    @Query('search') search?: string,
  ) {
    const data = await this.service.getCasesWithSummary(tenantId, {
      takipTuruId,
      mahiyetTipiId,
      riskId,
      durumEtiketiId,
      sorumluPersonelId,
      responsibleLawyerId,
      responsibleStaffId,
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
    @CurrentUser('id') userId: string,
    @Query('takipTuruId') takipTuruId?: string,
    @Query('mahiyetTipiId') mahiyetTipiId?: string,
    @Query('riskId') riskId?: string,
    @Query('durumEtiketiId') durumEtiketiId?: string,
    @Query('sorumluPersonelId') sorumluPersonelId?: string,
    @Query('responsibleLawyerId') responsibleLawyerId?: string,
    @Query('responsibleStaffId') responsibleStaffId?: string,
    @Query('caseStatus') caseStatus?: string,
  ) {
    const csvData = await this.service.exportCasesAsCsv(tenantId, {
      takipTuruId,
      mahiyetTipiId,
      riskId,
      durumEtiketiId,
      sorumluPersonelId,
      responsibleLawyerId,
      responsibleStaffId,
      caseStatus,
    });
    // WP-4d-2: Phase 2 warn-only — response AYNEN döner; ek olarak diagnostic audit (best-effort, block YOK).
    await this.warnOnlyAudit.recordWouldDeny('reports.exportCases', {
      tenantId,
      actorUserId: userId,
      requestPath: '/reports/export/cases',
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
