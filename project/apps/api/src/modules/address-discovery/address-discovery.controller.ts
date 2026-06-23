import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AddressDiscoveryService } from './address-discovery.service';
import { ClientInfoRequestService } from './client-info-request.service';
import { ConfidenceScoreService } from './confidence-score.service';
import { CrossFileService } from './cross-file.service';
import { UyapQueryService } from './uyap-query.service';
import { InstitutionLetterService } from './institution-letter.service';
import { CreateClientInfoRequestDto } from './dto/client-info-request.dto';
import { CreateUyapQueryDto, UpdateUyapQueryResponseDto, ProcessQueryAddressesDto } from './dto/uyap-query.dto';
import { CreateInstitutionLetterDto, MarkLetterAsSentDto, MarkLetterAsRespondedDto } from './dto/institution-letter.dto';

@Controller('address-discovery')
@UseGuards(JwtAuthGuard)
export class AddressDiscoveryController {
  constructor(
    private addressDiscoveryService: AddressDiscoveryService,
    private clientInfoRequestService: ClientInfoRequestService,
    private confidenceScoreService: ConfidenceScoreService,
    private crossFileService: CrossFileService,
    private uyapQueryService: UyapQueryService,
    private institutionLetterService: InstitutionLetterService,
  ) {}

  // ==================== CLIENT INFO REQUEST ====================

  /**
   * Müvekkil bilgi talebi oluştur ve gönder
   */
  @Post('client-info-request')
  async createClientInfoRequest(
    @Request() req: any,
    @Body() dto: CreateClientInfoRequestDto,
  ) {
    return this.clientInfoRequestService.createRequest(req.user.tenantId, dto);
  }

  /**
   * Dosya için müvekkil bilgi taleplerini getir
   */
  @Get('client-info-request/case/:caseId')
  async getClientInfoRequestsForCase(
    @Request() req: any,
    @Param('caseId') caseId: string,
  ) {
    return this.clientInfoRequestService.getRequestsForCase(req.user.tenantId, caseId);
  }

  /**
   * Tek bir talebi getir
   */
  @Get('client-info-request/:id')
  async getClientInfoRequest(
    @Request() req: any,
    @Param('id') id: string,
  ) {
    return this.clientInfoRequestService.getRequest(req.user.tenantId, id);
  }

  /**
   * Yanıt alındı olarak işaretle
   */
  @Put('client-info-request/:id/respond')
  async markClientInfoRequestAsResponded(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: { notes?: string },
  ) {
    return this.clientInfoRequestService.markAsResponded(
      req.user.tenantId,
      id,
      body.notes,
    );
  }

  /**
   * Hatırlatma gönder
   */
  @Post('client-info-request/:id/reminder')
  async sendClientInfoRequestReminder(
    @Request() req: any,
    @Param('id') id: string,
  ) {
    return this.clientInfoRequestService.sendReminder(req.user.tenantId, id);
  }

  /**
   * Yanıt yok olarak işaretle
   */
  @Put('client-info-request/:id/no-response')
  async markClientInfoRequestAsNoResponse(
    @Request() req: any,
    @Param('id') id: string,
  ) {
    return this.clientInfoRequestService.markAsNoResponse(req.user.tenantId, id);
  }

  // ==================== CROSS-FILE ====================

  /**
   * Aynı borçluyu diğer dosyalarda bul
   */
  @Get('cross-file/:debtorId')
  async findSameDebtor(
    @Request() req: any,
    @Param('debtorId') debtorId: string,
  ) {
    return this.crossFileService.findSameDebtor(req.user.tenantId, debtorId);
  }

  /**
   * Diğer dosyalardaki adresleri getir
   */
  @Get('cross-file/:debtorId/addresses')
  async getCrossFileAddresses(
    @Request() req: any,
    @Param('debtorId') debtorId: string,
    @Query('currentCaseId') currentCaseId: string,
  ) {
    return this.crossFileService.getAddressesFromOtherCases(
      req.user.tenantId,
      debtorId,
      currentCaseId,
    );
  }

  /**
   * Adresi mevcut dosyaya kopyala
   */
  @Post('cross-file/copy-address')
  async copyAddressToCase(
    @Request() req: any,
    @Body() body: { sourceAddressId: string; targetDebtorId: string },
  ) {
    return this.crossFileService.copyAddressToCase(
      req.user.tenantId,
      body.sourceAddressId,
      body.targetDebtorId,
    );
  }

  /**
   * Cross-file adres sayısını getir
   */
  @Get('cross-file/:debtorId/count')
  async getCrossFileAddressCount(
    @Request() req: any,
    @Param('debtorId') debtorId: string,
    @Query('currentCaseId') currentCaseId: string,
  ) {
    const count = await this.crossFileService.getCrossFileAddressCount(
      req.user.tenantId,
      debtorId,
      currentCaseId,
    );
    return { count };
  }

  // ==================== CONFIDENCE SCORE ====================

  /**
   * Adres güven skorunu getir
   */
  @Get('confidence/:addressId')
  async getConfidenceScore(
    @Request() req: any,
    @Param('addressId') addressId: string,
  ) {
    // Tenant boundary: ham addressId başka tenant'ın adresine erişemesin (cross-tenant okuma+yazma engeli).
    await this.confidenceScoreService.assertAddressBelongsToTenant(req.user.tenantId, addressId);
    const score = await this.confidenceScoreService.updateAddressScore(addressId);
    return { score };
  }

  /**
   * Güven skoru detaylarını getir
   */
  @Get('confidence/:addressId/breakdown')
  async getConfidenceScoreBreakdown(
    @Request() req: any,
    @Param('addressId') addressId: string,
  ) {
    // Tenant boundary: ham addressId başka tenant'ın adresine erişemesin.
    await this.confidenceScoreService.assertAddressBelongsToTenant(req.user.tenantId, addressId);
    // Önce adresi al
    const address = await this.confidenceScoreService['prisma'].debtorAddress.findUnique({
      where: { id: addressId },
      include: {
        serviceHistory: { select: { toStatus: true } },
      },
    });

    if (!address) {
      return { error: 'Adres bulunamadı' };
    }

    const totalNotifications = address.serviceHistory.length;
    const successfulNotifications = address.serviceHistory.filter(
      (h: any) => h.toStatus === 'DELIVERED'
    ).length;

    return this.confidenceScoreService.getScoreBreakdown({
      source: address.source,
      verified: address.verified,
      verifiedAt: address.verifiedAt,
      updatedAt: address.updatedAt,
      totalNotifications,
      successfulNotifications,
    });
  }

  /**
   * Borçlunun tüm adreslerinin skorlarını güncelle
   */
  @Post('confidence/debtor/:debtorId/update-all')
  async updateAllScoresForDebtor(
    @Request() req: any,
    @Param('debtorId') debtorId: string,
  ) {
    // Tenant boundary: ham debtorId başka tenant'ın borçlusuna erişemesin (cross-tenant yazma engeli).
    await this.confidenceScoreService.assertDebtorBelongsToTenant(req.user.tenantId, debtorId);
    await this.confidenceScoreService.updateAllScoresForDebtor(debtorId);
    return { success: true };
  }

  // ==================== RESEARCH STATUS ====================

  /**
   * Araştırma durumunu getir
   */
  @Get('research/:caseDebtorId')
  async getResearchStatus(
    @Request() req: any,
    @Param('caseDebtorId') caseDebtorId: string,
  ) {
    return this.addressDiscoveryService.getResearchStatus(
      req.user.tenantId,
      caseDebtorId,
    );
  }

  /**
   * Araştırmayı başlat
   */
  @Post('research/:caseDebtorId/start')
  async startResearch(
    @Request() req: any,
    @Param('caseDebtorId') caseDebtorId: string,
  ) {
    return this.addressDiscoveryService.startResearch(
      req.user.tenantId,
      caseDebtorId,
    );
  }

  /**
   * Sonraki aksiyonu öner
   */
  @Get('research/:caseDebtorId/suggestions')
  async getSuggestions(
    @Request() req: any,
    @Param('caseDebtorId') caseDebtorId: string,
  ) {
    return this.addressDiscoveryService.suggestNextAction(
      req.user.tenantId,
      caseDebtorId,
    );
  }

  /**
   * Araştırma timeline'ını getir
   */
  @Get('research/:caseDebtorId/timeline')
  async getResearchTimeline(
    @Request() req: any,
    @Param('caseDebtorId') caseDebtorId: string,
  ) {
    return this.addressDiscoveryService.getResearchTimeline(
      req.user.tenantId,
      caseDebtorId,
    );
  }

  /**
   * Araştırmayı tamamla
   */
  @Put('research/:caseDebtorId/complete')
  async completeResearch(
    @Request() req: any,
    @Param('caseDebtorId') caseDebtorId: string,
  ) {
    return this.addressDiscoveryService.completeResearch(
      req.user.tenantId,
      caseDebtorId,
    );
  }

  /**
   * Araştırmayı tükendi olarak işaretle
   */
  @Put('research/:caseDebtorId/exhausted')
  async markAsExhausted(
    @Request() req: any,
    @Param('caseDebtorId') caseDebtorId: string,
  ) {
    return this.addressDiscoveryService.markAsExhausted(
      req.user.tenantId,
      caseDebtorId,
    );
  }

  // ==================== UYAP QUERIES ====================

  /**
   * UYAP sorgusu oluştur
   */
  @Post('uyap-query')
  async createUyapQuery(
    @Request() req: any,
    @Body() dto: CreateUyapQueryDto,
  ) {
    return this.uyapQueryService.createQuery(
      req.user.tenantId,
      req.user.id,
      dto,
    );
  }

  /**
   * Borçlu için UYAP sorgularını getir
   */
  @Get('uyap-query/debtor/:caseDebtorId')
  async getUyapQueriesForDebtor(
    @Request() req: any,
    @Param('caseDebtorId') caseDebtorId: string,
  ) {
    return this.uyapQueryService.getQueriesForDebtor(
      req.user.tenantId,
      caseDebtorId,
    );
  }

  /**
   * Tek bir sorguyu getir
   */
  @Get('uyap-query/:id')
  async getUyapQuery(
    @Request() req: any,
    @Param('id') id: string,
  ) {
    return this.uyapQueryService.getQuery(req.user.tenantId, id);
  }

  /**
   * Sorgu sonucunu kaydet (manuel giriş)
   */
  @Put('uyap-query/:id/response')
  async recordUyapQueryResponse(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateUyapQueryResponseDto,
  ) {
    return this.uyapQueryService.recordQueryResponse(
      req.user.tenantId,
      id,
      dto,
    );
  }

  /**
   * Sorgudan gelen adresleri işle
   */
  @Post('uyap-query/:id/process-addresses')
  async processUyapQueryAddresses(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: ProcessQueryAddressesDto,
  ) {
    return this.uyapQueryService.processQueryAddresses(
      req.user.tenantId,
      id,
      dto.addresses,
    );
  }

  /**
   * Önerilen sorguları getir
   */
  @Get('uyap-query/debtor/:caseDebtorId/suggestions')
  async getSuggestedUyapQueries(
    @Request() req: any,
    @Param('caseDebtorId') caseDebtorId: string,
  ) {
    return this.uyapQueryService.getSuggestedQueries(
      req.user.tenantId,
      caseDebtorId,
    );
  }

  /**
   * Tüm sorgu tiplerini getir
   */
  @Get('uyap-query-types')
  async getUyapQueryTypes() {
    return this.uyapQueryService.getAllQueryTypes();
  }

  // ==================== INSTITUTION LETTERS ====================

  /**
   * Kurum yazısı oluştur
   */
  @Post('institution-letter')
  async createInstitutionLetter(
    @Request() req: any,
    @Body() dto: CreateInstitutionLetterDto,
  ) {
    return this.institutionLetterService.createLetter(req.user.tenantId, dto);
  }

  /**
   * Borçlu için kurum yazılarını getir
   */
  @Get('institution-letter/debtor/:caseDebtorId')
  async getInstitutionLettersForDebtor(
    @Request() req: any,
    @Param('caseDebtorId') caseDebtorId: string,
  ) {
    return this.institutionLetterService.getLettersForDebtor(
      req.user.tenantId,
      caseDebtorId,
    );
  }

  /**
   * Tek bir yazıyı getir
   */
  @Get('institution-letter/:id')
  async getInstitutionLetter(
    @Request() req: any,
    @Param('id') id: string,
  ) {
    return this.institutionLetterService.getLetter(req.user.tenantId, id);
  }

  /**
   * Yazıyı gönderildi olarak işaretle
   */
  @Put('institution-letter/:id/sent')
  async markInstitutionLetterAsSent(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: MarkLetterAsSentDto,
  ) {
    return this.institutionLetterService.markAsSent(
      req.user.tenantId,
      id,
      dto,
    );
  }

  /**
   * Yanıt alındı olarak işaretle
   */
  @Put('institution-letter/:id/responded')
  async markInstitutionLetterAsResponded(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: MarkLetterAsRespondedDto,
  ) {
    return this.institutionLetterService.markAsResponded(
      req.user.tenantId,
      id,
      dto,
    );
  }

  /**
   * Yanıt yok olarak işaretle
   */
  @Put('institution-letter/:id/no-response')
  async markInstitutionLetterAsNoResponse(
    @Request() req: any,
    @Param('id') id: string,
  ) {
    return this.institutionLetterService.markAsNoResponse(req.user.tenantId, id);
  }

  /**
   * Yazıyı sil (sadece taslak)
   */
  @Delete('institution-letter/:id')
  async deleteInstitutionLetter(
    @Request() req: any,
    @Param('id') id: string,
  ) {
    return this.institutionLetterService.deleteLetter(req.user.tenantId, id);
  }

  /**
   * Kurum şablonlarını getir
   */
  @Get('institution-templates')
  async getInstitutionTemplates() {
    return this.institutionLetterService.getInstitutionTemplates();
  }
}
