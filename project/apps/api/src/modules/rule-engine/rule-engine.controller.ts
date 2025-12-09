import { Controller, Get, Post, Param, Query, UseGuards } from '@nestjs/common';
import { RuleEngineService } from './rule-engine.service';
import { TcmbService } from './tcmb.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('rule-engine')
@UseGuards(JwtAuthGuard)
export class RuleEngineController {
  constructor(
    private readonly ruleEngineService: RuleEngineService,
    private readonly tcmbService: TcmbService,
  ) {}

  /**
   * Döviz kuru sorgula
   * GET /api/rule-engine/exchange-rate?currency=USD&date=2024-01-15
   */
  @Get('exchange-rate')
  async getExchangeRate(
    @Query('currency') currency: string = 'USD',
    @Query('date') date?: string,
  ) {
    const dateObj = date ? new Date(date) : undefined;
    return this.ruleEngineService.getExchangeRate(currency, dateObj);
  }

  /**
   * Döviz tutarını TL'ye çevir
   * GET /api/rule-engine/convert?amount=1000&currency=USD&type=ODEME_TARIHI
   */
  @Get('convert')
  async convertToTL(
    @Query('amount') amount: string,
    @Query('currency') currency: string = 'USD',
    @Query('type') type: 'TAKIP_TARIHI' | 'ODEME_TARIHI' = 'ODEME_TARIHI',
    @Query('date') date?: string,
  ) {
    const dateObj = date ? new Date(date) : undefined;
    return this.ruleEngineService.convertToTL(
      parseFloat(amount),
      currency,
      type,
      dateObj,
    );
  }

  /**
   * Yasal faiz hesapla
   * GET /api/rule-engine/interest?principal=10000&startDate=2024-01-01&rate=24
   */
  @Get('interest')
  calculateInterest(
    @Query('principal') principal: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate?: string,
    @Query('rate') rate?: string,
  ) {
    return this.ruleEngineService.calculateLegalInterest(
      parseFloat(principal),
      new Date(startDate),
      endDate ? new Date(endDate) : undefined,
      rate ? parseFloat(rate) : undefined,
    );
  }

  /**
   * Nafaka dönemlerini hesapla
   * GET /api/rule-engine/nafaka-periods?startDate=2024-01-01&monthlyAmount=5000
   */
  @Get('nafaka-periods')
  calculateNafakaPeriods(
    @Query('startDate') startDate: string,
    @Query('monthlyAmount') monthlyAmount: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.ruleEngineService.calculateNafakaPeriods(
      new Date(startDate),
      parseFloat(monthlyAmount),
      endDate ? new Date(endDate) : undefined,
    );
  }

  /**
   * Dosya için sonraki aksiyonu belirle
   * GET /api/rule-engine/cases/:id/next-action
   */
  @Get('cases/:id/next-action')
  async getNextAction(@Param('id') caseId: string) {
    return this.ruleEngineService.determineNextAction(caseId);
  }

  /**
   * Dosya özet bilgisi
   * GET /api/rule-engine/cases/:id/summary
   */
  @Get('cases/:id/summary')
  async getCaseSummary(@Param('id') caseId: string) {
    return this.ruleEngineService.getCaseSummary(caseId);
  }

  /**
   * Nafaka dosyasına yeni dönem ekle
   * POST /api/rule-engine/cases/:id/add-nafaka-period
   */
  @Post('cases/:id/add-nafaka-period')
  async addNafakaPeriod(@Param('id') caseId: string) {
    return this.ruleEngineService.addNafakaPeriodToCase(caseId);
  }

  /**
   * Döviz dosyası kur güncelle
   * POST /api/rule-engine/cases/:id/update-exchange-rate
   */
  @Post('cases/:id/update-exchange-rate')
  async updateExchangeRate(@Param('id') caseId: string) {
    return this.ruleEngineService.updateCaseExchangeRate(caseId);
  }

  // ============================================
  // TCMB KUR SERVİSİ
  // ============================================

  /**
   * TCMB'den güncel kur al
   * GET /api/rule-engine/tcmb/rate?currency=USD
   */
  @Get('tcmb/rate')
  async getTcmbRate(
    @Query('currency') currency: string = 'USD',
    @Query('date') date?: string,
  ) {
    const dateObj = date ? new Date(date) : undefined;
    return this.tcmbService.getExchangeRate(currency, dateObj);
  }

  /**
   * Tüm TCMB kurlarını al
   * GET /api/rule-engine/tcmb/all-rates
   */
  @Get('tcmb/all-rates')
  async getAllTcmbRates() {
    return this.tcmbService.getAllRates();
  }

  /**
   * Desteklenen para birimleri
   * GET /api/rule-engine/tcmb/currencies
   */
  @Get('tcmb/currencies')
  getSupportedCurrencies() {
    return this.tcmbService.getSupportedCurrencies();
  }

  /**
   * TCMB ile TL'ye çevir
   * GET /api/rule-engine/tcmb/convert-to-tl?amount=1000&currency=USD
   */
  @Get('tcmb/convert-to-tl')
  async tcmbConvertToTL(
    @Query('amount') amount: string,
    @Query('currency') currency: string = 'USD',
    @Query('date') date?: string,
  ) {
    const dateObj = date ? new Date(date) : undefined;
    return this.tcmbService.convertToTL(parseFloat(amount), currency, dateObj);
  }
}
