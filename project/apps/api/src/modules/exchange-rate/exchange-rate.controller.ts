import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ExchangeRateService, ExchangeRate } from './exchange-rate.service';

@Controller('exchange-rate')
@UseGuards(JwtAuthGuard)
export class ExchangeRateController {
  constructor(private readonly exchangeRateService: ExchangeRateService) {}

  // Tum guncel kurlari getir
  @Get()
  getAllRates(): { rates: ExchangeRate[]; lastUpdate: Date | null } {
    return {
      rates: this.exchangeRateService.getAllRates(),
      lastUpdate: this.exchangeRateService.getLastUpdateTime(),
    };
  }

  // Belirli doviz kurunu getir
  @Get('currency')
  getRate(@Query('code') code: string): ExchangeRate | { error: string } {
    const rate = this.exchangeRateService.getRate(code?.toUpperCase());
    if (!rate) {
      return { error: `Kur bulunamadi: ${code}` };
    }
    return rate;
  }

  // Doviz cevirme
  @Get('convert')
  convert(
    @Query('amount') amount: string,
    @Query('currency') currency: string,
  ): { tlAmount: number; rate: number; source: string; currency: string; originalAmount: number } {
    const numAmount = parseFloat(amount) || 0;
    const result = this.exchangeRateService.convertToTRY(numAmount, currency?.toUpperCase() || 'USD');
    return {
      ...result,
      currency: currency?.toUpperCase() || 'USD',
      originalAmount: numAmount,
    };
  }

  // Gecmis tarihli kur
  @Get('historical')
  async getHistoricalRate(
    @Query('currency') currency: string,
    @Query('date') date: string,
  ): Promise<ExchangeRate | { error: string }> {
    const rate = await this.exchangeRateService.getHistoricalRate(
      currency?.toUpperCase() || 'USD',
      new Date(date),
    );
    if (!rate) {
      return { error: `Gecmis kur bulunamadi: ${currency} - ${date}` };
    }
    return rate;
  }

  // Kurlari manuel guncelle
  @Post('refresh')
  async refreshRates(): Promise<{ success: boolean; message: string; rates: ExchangeRate[] }> {
    return this.exchangeRateService.refreshRates();
  }
}
