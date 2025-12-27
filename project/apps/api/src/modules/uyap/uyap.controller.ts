import { Controller, Get, Post, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { UyapService } from './uyap.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('uyap')
@UseGuards(JwtAuthGuard)
export class UyapController {
  constructor(private uyapService: UyapService) {}

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
   */
  @Post('haciz')
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
    });
  }
}
