import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ESignService, ESignRequest } from './esign.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

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
    @Query('documentId') documentId?: string,
    @Query('signerId') signerId?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
  ) {
    return this.esignService.getSignatureHistory({
      documentId,
      signerId,
      status,
      limit: limit ? parseInt(limit) : undefined,
    });
  }

  /**
   * İstatistikler
   */
  @Get('stats')
  async getStats() {
    return this.esignService.getStats();
  }
}
