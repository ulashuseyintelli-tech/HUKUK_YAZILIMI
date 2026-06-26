import { Controller, Get, Post, Body, Param, Query, UseGuards, Req, Res } from '@nestjs/common';
import { Response } from 'express';
import { UyapService } from './uyap.service';
import { UyapXmlService } from './uyap-xml.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
// CPE Integration - Phase 3
import { CpeRequired, ScopeResolvers } from '@/modules/policy-engine';
import { ActionCode } from '@/modules/policy-engine/types/action-code.enum';
import { GuidedOpenObserveService } from '../permission-diagnostics/guided-open-observe.service';

@Controller('uyap')
@UseGuards(JwtAuthGuard)
export class UyapController {
  constructor(
    private uyapService: UyapService,
    private uyapXmlService: UyapXmlService,
    // P2b-2: Guided-Open observe adapter (diagnostic only; engelleme yok)
    private guidedOpenObserve: GuidedOpenObserveService,
  ) {}

  /**
   * Vekalet geçerliliğini kontrol et (UYAP işlemi öncesi)
   * @query clientId - Müvekkil ID
   * @query lawyerId - Avukat ID
   */
  @Get('poa/validate')
  async validatePoa(
    @Query('clientId') clientId: string,
    @Query('lawyerId') lawyerId: string,
    @Req() req: any,
  ) {
    const tenantId = req.user?.tenantId;
    const result = await this.uyapService.validatePowerOfAttorney(clientId, lawyerId, tenantId);
    return {
      ...result,
      canProceedToUyap: result.isValid,
    };
  }

  /**
   * Takip için tüm vekaletleri kontrol et (UYAP gönderimi öncesi)
   * @param caseId - Takip ID
   */
  @Get('poa/validate/case/:caseId')
  async validateCasePoa(@Param('caseId') caseId: string, @Req() req: any) {
    const tenantId = req.user?.tenantId;
    const result = await this.uyapService.validateCasePoaForUyap(caseId, tenantId);
    return {
      ...result,
      canProceedToUyap: result.isValid,
      errorCount: result.errors.length,
    };
  }

  /**
   * UYAP bağlantı durumu
   */
  @Get('status')
  async getStatus() {
    const isConnected = await this.uyapService.checkConnection();
    const stats = await this.uyapService.getStats();

    return {
      connected: isConnected,
      mode: 'STUB', // Gerçek entegrasyon yapıldığında 'LIVE' olacak
      message: 'UYAP entegrasyonu henüz aktif değil. Stub modunda çalışıyor.',
      stats,
    };
  }

  /**
   * İstek istatistikleri
   */
  @Get('stats')
  async getStats() {
    return this.uyapService.getStats();
  }

  /**
   * Ödeme emri gönder (test)
   */
  @Post('test/payment-order')
  async testPaymentOrder(@Body() body: any) {
    return this.uyapService.sendPaymentOrder({
      caseId: body.caseId || 'test-case',
      executionOfficeCode: body.executionOfficeCode || 'TEST-001',
      creditor: body.creditor || { name: 'Test Alacaklı' },
      debtor: body.debtor || { name: 'Test Borçlu' },
      amount: body.amount || 10000,
      currency: body.currency || 'TRY',
    });
  }

  /**
   * Tebligat durumu sorgula
   */
  @Get('tebligat/:id')
  async checkTebligat(@Param('id') id: string) {
    return this.uyapService.checkTebligatStatus(id);
  }

  /**
   * MTS durumu sorgula
   */
  @Get('mts/:referenceNo')
  async checkMts(@Param('referenceNo') referenceNo: string) {
    return this.uyapService.checkMtsStatus(referenceNo);
  }

  /**
   * Başarısız istekleri yeniden dene
   */
  @Post('retry-failed')
  async retryFailed() {
    const count = await this.uyapService.retryFailedRequests();
    return {
      message: `${count} istek yeniden denendi`,
      retriedCount: count,
    };
  }

  /**
   * UYAP'a evrak gönder
   */
  @Post('document/submit')
  async submitDocument(@Body() body: any, @Req() req: any) {
    const tenantId = req.user?.tenantId;
    return this.uyapService.submitDocument({
      caseId: body.caseId,
      documentType: body.documentType,
      documentContent: body.documentContent,
      documentName: body.documentName,
      clientId: body.clientId,
      lawyerId: body.lawyerId,
      tenantId,
    });
  }

  /**
   * Takip durumunu sorgula
   */
  @Get('case/:caseId/status')
  async queryCaseStatus(
    @Param('caseId') caseId: string,
    @Query('uyapDosyaId') uyapDosyaId?: string,
  ) {
    return this.uyapService.queryCaseStatus(caseId, uyapDosyaId);
  }

  /**
   * Borçlu mal varlığı sorgula
   */
  @Post('debtor/assets')
  async queryDebtorAssets(@Body() body: { debtorIdentityNo: string; caseId: string }) {
    return this.uyapService.queryDebtorAssets(body.debtorIdentityNo, body.caseId);
  }

  /**
   * UYAP istek geçmişi
   */
  @Get('history')
  async getRequestHistory(
    @Query('caseId') caseId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.uyapService.getRequestHistory(caseId, limit ? parseInt(limit) : 50);
  }

  /**
   * Haciz talebi gönder
   * 
   * @CpeRequired - Haciz talebi HIGH risk aksiyon
   */
  @Post('haciz')
  @CpeRequired(ActionCode.TRIGGER_HACIZ, ScopeResolvers.fromBody)
  async pushHacizRequest(@Body() body: any, @Req() req: any) {
    const tenantId = req.user?.tenantId;
    return this.uyapService.pushHacizRequest({
      caseId: body.caseId,
      targetType: body.targetType,
      targetDetails: body.targetDetails,
      amount: body.amount,
      clientId: body.clientId,
      lawyerId: body.lawyerId,
      tenantId,
      userId: req.user?.id, // PR-D4e-6: karar-anı audit aktörü
    });
  }

  // ==================== İLGİLİ DAVA AÇMA ENDPOINT'LERİ ====================

  /**
   * UYAP'a ceza davası (şikayet) gönder
   * Karşılıksız çek, dolandırıcılık vb.
   */
  @Post('lawsuit/criminal')
  async submitCriminalComplaint(@Body() body: any, @Req() req: any) {
    const tenantId = req.user?.tenantId;
    return this.uyapService.submitCriminalComplaint({
      caseId: body.caseId,
      lawsuitType: body.lawsuitType,
      uyapDavaTuru: body.uyapDavaTuru,
      courtType: body.courtType,
      documentContent: body.documentContent,
      documentName: body.documentName,
      complainant: body.complainant,
      suspect: body.suspect,
      instrumentInfo: body.instrumentInfo,
      clientId: body.clientId,
      lawyerId: body.lawyerId,
      tenantId,
    });
  }

  /**
   * UYAP'a hukuk davası gönder
   * İtirazın iptali, tasarrufun iptali vb.
   */
  @Post('lawsuit/civil')
  async submitCivilLawsuit(@Body() body: any, @Req() req: any) {
    const tenantId = req.user?.tenantId;
    return this.uyapService.submitCivilLawsuit({
      caseId: body.caseId,
      lawsuitType: body.lawsuitType,
      uyapDavaTuru: body.uyapDavaTuru,
      courtType: body.courtType,
      documentContent: body.documentContent,
      documentName: body.documentName,
      plaintiff: body.plaintiff,
      defendant: body.defendant,
      claimAmount: body.claimAmount,
      currency: body.currency,
      relatedExecutionFile: body.relatedExecutionFile,
      clientId: body.clientId,
      lawyerId: body.lawyerId,
      tenantId,
    });
  }

  /**
   * İlgili dava durumunu sorgula
   */
  @Get('lawsuit/status/:evkNo')
  async queryRelatedLawsuitStatus(@Param('evkNo') evkNo: string) {
    return this.uyapService.queryRelatedLawsuitStatus(evkNo);
  }

  // ==================== E-TAKİP XML ENDPOINT'LERİ ====================

  /**
   * Case'den UYAP e-Takip XML'i oluştur
   * GET /uyap/xml/case/:caseId
   */
  /// <remarks>
  /// Çağrıldığı yerler:
  /// - UyapController.generateXmlFromCase() → GET /uyap/xml/case/:caseId (case bazlı UYAP XML üretimi)
  /// </remarks>
  @Get('xml/case/:caseId')
  async generateXmlFromCase(
    @Param('caseId') caseId: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    const xml = await this.uyapXmlService.generateFromCase(caseId, tenantId);
    const validation = this.uyapXmlService.validateXml(xml);
    
    return {
      xml,
      validation,
      version: '2024.03',
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Case'den UYAP e-Takip XML dosyası indir
   * GET /uyap/xml/case/:caseId/download
   */
  /// <remarks>
  /// Çağrıldığı yerler:
  /// - UyapController.downloadXmlFromCase() → GET /uyap/xml/case/:caseId/download (case bazlı UYAP XML indirme)
  /// </remarks>
  @Get('xml/case/:caseId/download')
  async downloadXmlFromCase(
    @Param('caseId') caseId: string,
    @CurrentUser('tenantId') tenantId: string,
    @Res() res: Response,
  ) {
    const xml = await this.uyapXmlService.generateFromCase(caseId, tenantId);
    
    // Dosya adı için case bilgisini al
    const caseData = await this.uyapService.queryCaseStatus(caseId);
    const fileName = `e-takip-${caseData.data?.localStatus || caseId}.xml`;
    
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(xml);
  }

  /**
   * XML doğrulama
   * POST /uyap/xml/validate
   */
  @Post('xml/validate')
  validateXml(@Body() body: { xml: string }) {
    return this.uyapXmlService.validateXml(body.xml);
  }

  /**
   * UYAP'a e-Takip XML gönder (STUB)
   * POST /uyap/xml/submit/:caseId
   * 
   * @CpeRequired - UYAP gönderimi HIGH risk aksiyon
   */
  /// <remarks>
  /// Çağrıldığı yerler:
  /// - UyapController.submitXmlToUyap() → POST /uyap/xml/submit/:caseId (case bazlı UYAP XML gönderimi)
  /// </remarks>
  @Post('xml/submit/:caseId')
  @CpeRequired(ActionCode.UYAP_SEND)
  async submitXmlToUyap(
    @Param('caseId') caseId: string,
    @Req() req: any,
  ) {
    const tenantId = req.user?.tenantId;

    // Önce vekalet kontrolü
    const poaCheck = await this.uyapService.validateCasePoaForUyap(caseId, tenantId);
    if (!poaCheck.isValid) {
      return {
        success: false,
        error: 'POA_VALIDATION_FAILED',
        message: 'Geçerli vekalet bulunamadı',
        errors: poaCheck.errors,
      };
    }

    // P2b-2 observe (PRE-action; POA gate'ten SONRA, business gönderimden ÖNCE; engelleme YOK).
    // UYAP_SEND = HARDWARE → diagnostic yalnız wouldRequireHardware=true yazar.
    // GÜVENLİK: e-imza/UYAP credential observe'a ASLA geçmez (yalnız actionCode + caseId).
    await this.guidedOpenObserve.observe({
      actorUserId: req.user?.id,
      tenantId,
      caseId,
      actionCode: ActionCode.UYAP_SEND,
    });

    // XML oluştur
    const xml = await this.uyapXmlService.generateFromCase(caseId, tenantId);
    
    // XML doğrula
    const validation = this.uyapXmlService.validateXml(xml);
    if (!validation.isValid) {
      return {
        success: false,
        error: 'XML_VALIDATION_FAILED',
        message: 'XML doğrulama hatası',
        errors: validation.errors,
      };
    }

    // UYAP'a gönder (STUB)
    const result = await this.uyapService.submitDocument({
      caseId,
      documentType: 'TAKIP_TALEBI',
      documentContent: Buffer.from(xml).toString('base64'),
      documentName: `e-takip-${caseId}.xml`,
      tenantId,
    });

    return {
      success: result.success,
      evkNo: result.evkNo,
      message: result.success 
        ? 'e-Takip XML UYAP kuyruğuna alındı' 
        : result.errorMessage,
      xml: xml.substring(0, 500) + '...', // İlk 500 karakter
    };
  }

  /**
   * UYAP XML Import - XML'den Case oluştur (STUB)
   * POST /uyap/xml/import
   */
  @Post('xml/import')
  async importXml(@Body() body: { xml: string }, @Req() req: any) {
    // Bu endpoint şimdilik stub - gerçek implementasyon için XML parser gerekli
    return {
      success: false,
      message: 'XML import özelliği henüz aktif değil (STUB)',
      hint: 'Bu özellik UYAP entegrasyonu tamamlandığında aktif olacaktır.',
    };
  }
}
