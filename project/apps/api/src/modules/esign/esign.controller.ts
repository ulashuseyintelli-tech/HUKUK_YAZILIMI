import { Controller, Get, Post, Body, Param, Query, UseGuards, ServiceUnavailableException } from '@nestjs/common';
import { ESignService, ESignRequest } from './esign.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

// CLIENT-SEC-H2A: EsignLog modelinde tenantId kolonu yok — /history ve /stats tenant-scope
// UYGULANAMAZ (şema-seviyesi eksiklik, kod-only fix yok). Kalıcı şema/migration çözümü ayrı
// ve yetkilendirilmemiş bir iştir (CLIENT-SEC-H2C). Bu, o çözüme kadar fail-closed containment'tır.
const H2A_CONTAINMENT_ERROR = {
  error: 'TENANT_SCOPED_HISTORY_TEMPORARILY_UNAVAILABLE',
  message: 'Bu uç nokta güvenlik incelemesi nedeniyle geçici olarak kullanılamıyor.',
};

@Controller('esign')
@UseGuards(JwtAuthGuard)
export class ESignController {
  constructor(private esignService: ESignService) {}

  /**
   * Provider durumunu kontrol et
   */
  @Get('status')
  async getStatus() {
    const status = await this.esignService.checkProviderStatus();
    const stats = await this.esignService.getStats();
    return { ...status, stats };
  }

  /**
   * İmza isteği başlat
   */
  @Post('sign')
  async requestSignature(@Body() body: ESignRequest) {
    return this.esignService.requestSignature(body);
  }

  /**
   * Toplu imza isteği
   */
  @Post('sign/bulk')
  async requestBulkSignature(@Body() body: { requests: ESignRequest[] }) {
    return this.esignService.requestBulkSignature(body.requests);
  }

  /**
   * İmza durumunu sorgula
   */
  @Get('status/:transactionId')
  async checkSignatureStatus(@Param('transactionId') transactionId: string) {
    return this.esignService.checkStatus(transactionId);
  }

  /**
   * İmzalı belgeyi doğrula
   */
  @Post('verify')
  async verifySignature(@Body() body: { signedDocument: string }) {
    return this.esignService.verifySignature(body.signedDocument);
  }

  /**
   * İmza geçmişi
   */
  @Get('history')
  async getHistory(
    @Query('documentId') _documentId?: string,
    @Query('signerId') _signerId?: string,
    @Query('status') _status?: string,
    @Query('limit') _limit?: string,
  ) {
    // CLIENT-SEC-H2A: fail-closed — service/Prisma'ya hiç ulaşılmaz.
    throw new ServiceUnavailableException(H2A_CONTAINMENT_ERROR);
  }

  /**
   * İstatistikler
   */
  @Get('stats')
  async getStats() {
    // CLIENT-SEC-H2A: fail-closed — service/Prisma'ya hiç ulaşılmaz.
    // NOT: /esign/status kendi getStats() çağrısını KORUR — bu yalnız bu route'a özgüdür.
    throw new ServiceUnavailableException(H2A_CONTAINMENT_ERROR);
  }
}
