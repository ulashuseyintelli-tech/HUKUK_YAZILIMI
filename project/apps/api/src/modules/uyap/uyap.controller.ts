import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { UyapService } from './uyap.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('uyap')
@UseGuards(JwtAuthGuard)
export class UyapController {
  constructor(private uyapService: UyapService) {}

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
}
