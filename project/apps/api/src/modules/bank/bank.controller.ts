import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { BankService } from './bank.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { GuidedOpenObserveService } from '../permission-diagnostics/guided-open-observe.service';
import { ActionCode } from '../policy-engine/types/action-code.enum';

@Controller('bank')
@UseGuards(JwtAuthGuard)
export class BankController {
  constructor(
    private bankService: BankService,
    // P2b-2: Guided-Open observe adapter (diagnostic only; engelleme yok; finansal mantığa DOKUNMAZ)
    private guidedOpenObserve: GuidedOpenObserveService,
  ) {}

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
  /// <remarks>
  /// Çağrıldığı yerler:
  /// - BankController.getBalance() → GET /bank/accounts/:id/balance (hesap bakiyesi sorgular)
  /// - BankService.getBalance() → tenant kontrollü hesap bakiyesi sorgusu
  /// </remarks>
  @Get('accounts/:id/balance')
  async getBalance(@CurrentUser('tenantId') tenantId: string, @Param('id') id: string) {
    return this.bankService.getBalance(id, tenantId);
  }

  // ==================== HESAP HAREKETLERİ ====================

  /**
   * Hesap hareketlerini senkronize et
   */
  /// <remarks>
  /// Çağrıldığı yerler:
  /// - BankController.syncTransactions() → POST /bank/accounts/:id/sync (hesap hareketlerini senkronize eder)
  /// - BankService.syncTransactions() → tenant kontrollü hesap hareketi senkronizasyonu
  /// </remarks>
  @Post('accounts/:id/sync')
  async syncTransactions(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() body: { startDate?: string; endDate?: string },
  ) {
    return this.bankService.syncTransactions(
      id,
      tenantId,
      body.startDate ? new Date(body.startDate) : undefined,
      body.endDate ? new Date(body.endDate) : undefined,
    );
  }

  /**
   * Hesap hareketlerini listele
   */
  /// <remarks>
  /// Çağrıldığı yerler:
  /// - BankController.getTransactions() → GET /bank/accounts/:id/transactions (hesap hareketlerini listeler)
  /// - BankService.getTransactions() → tenant kontrollü hesap hareketi listesi
  /// </remarks>
  @Get('accounts/:id/transactions')
  async getTransactions(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('transactionType') transactionType?: string,
    @Query('isMatched') isMatched?: string,
    @Query('limit') limit?: string,
  ) {
    return this.bankService.getTransactions(id, tenantId, {
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
  /// <remarks>
  /// Çağrıldığı yerler:
  /// - BankController.matchTransaction() → POST /bank/transactions/:id/match (banka hareketini dosyayla eşleştirir)
  /// - BankService.matchTransaction() → tenant kontrollü banka hareketi eşleştirme
  /// </remarks>
  @Post('transactions/:id/match')
  async matchTransaction(
    @CurrentUser('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() body: { caseId: string },
    @CurrentUser('id') userId: string,
  ) {
    return this.bankService.matchTransaction(id, body.caseId, userId, tenantId);
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
    @CurrentUser('id') userId: string,
    @Body() body: {
      fromIban: string;
      toIban: string;
      amount: number;
      currency?: string;
      description?: string;
      referenceNo?: string;
    },
  ) {
    // P2b-2 observe (PRE-action; JwtAuthGuard'dan SONRA, business transferden ÖNCE; engelleme YOK).
    // BANK_TRANSFER = guarded-edge APPROVAL → diagnostic yalnız wouldRequireApproval=true yazar.
    // GİZLİLİK: IBAN/tutar/açıklama/referenceNo/alıcı observe'a ASLA geçmez; caseId yok (account-scoped).
    await this.guidedOpenObserve.observe({
      actorUserId: userId,
      tenantId,
      actionCode: ActionCode.BANK_TRANSFER,
    });
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
