import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { BankService } from './bank.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('bank')
@UseGuards(JwtAuthGuard)
export class BankController {
  constructor(private bankService: BankService) {}

  // ==================== HESAP YÖNETİMİ ====================

  /**
   * Banka hesabı ekle
   */
  @Post('accounts')
  async addAccount(@CurrentUser('tenantId') tenantId: string, @Body() body: any) {
    return this.bankService.addBankAccount(tenantId, body);
  }

  /**
   * Banka hesaplarını listele
   */
  @Get('accounts')
  async getAccounts(
    @CurrentUser('tenantId') tenantId: string,
    @Query('ownerType') ownerType?: string,
    @Query('ownerId') ownerId?: string,
    @Query('isActive') isActive?: string,
    @Query('isIntegrated') isIntegrated?: string,
  ) {
    return this.bankService.getBankAccounts(tenantId, {
      ownerType,
      ownerId,
      isActive: isActive === 'true' ? true : isActive === 'false' ? false : undefined,
      isIntegrated: isIntegrated === 'true' ? true : isIntegrated === 'false' ? false : undefined,
    });
  }

  /**
   * Hesap bakiyesi sorgula
   */
  @Get('accounts/:id/balance')
  async getBalance(@Param('id') id: string) {
    return this.bankService.getBalance(id);
  }

  // ==================== HESAP HAREKETLERİ ====================

  /**
   * Hesap hareketlerini senkronize et
   */
  @Post('accounts/:id/sync')
  async syncTransactions(
    @Param('id') id: string,
    @Body() body: { startDate?: string; endDate?: string },
  ) {
    return this.bankService.syncTransactions(
      id,
      body.startDate ? new Date(body.startDate) : undefined,
      body.endDate ? new Date(body.endDate) : undefined,
    );
  }

  /**
   * Hesap hareketlerini listele
   */
  @Get('accounts/:id/transactions')
  async getTransactions(
    @Param('id') id: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('transactionType') transactionType?: string,
    @Query('isMatched') isMatched?: string,
    @Query('limit') limit?: string,
  ) {
    return this.bankService.getTransactions(id, {
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      transactionType,
      isMatched: isMatched === 'true' ? true : isMatched === 'false' ? false : undefined,
      limit: limit ? parseInt(limit) : undefined,
    });
  }

  /**
   * İşlemi dosyayla eşleştir
   */
  @Post('transactions/:id/match')
  async matchTransaction(
    @Param('id') id: string,
    @Body() body: { caseId: string },
    @CurrentUser('id') userId: string,
  ) {
    return this.bankService.matchTransaction(id, body.caseId, userId);
  }

  /**
   * Eşleşmemiş işlemleri getir
   */
  @Get('transactions/unmatched')
  async getUnmatchedTransactions(
    @CurrentUser('tenantId') tenantId: string,
    @Query('limit') limit?: string,
  ) {
    return this.bankService.getUnmatchedTransactions(tenantId, limit ? parseInt(limit) : undefined);
  }

  // ==================== TRANSFER ====================

  /**
   * EFT/Havale gönder
   */
  @Post('transfer')
  async sendTransfer(
    @CurrentUser('tenantId') tenantId: string,
    @Body() body: {
      fromIban: string;
      toIban: string;
      amount: number;
      currency?: string;
      description?: string;
      referenceNo?: string;
    },
  ) {
    return this.bankService.sendTransfer(tenantId, {
      fromIban: body.fromIban,
      toIban: body.toIban,
      amount: body.amount,
      currency: body.currency || 'TRY',
      description: body.description,
      referenceNo: body.referenceNo,
    });
  }

  // ==================== İSTATİSTİKLER ====================

  /**
   * Banka istatistikleri
   */
  @Get('stats')
  async getStats(@CurrentUser('tenantId') tenantId: string) {
    return this.bankService.getStats(tenantId);
  }
}
