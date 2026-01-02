import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FeeEngineService, GeneratedFeeItem } from './fee-engine.service';

interface CalculateFeesDto {
  caseType: string;
  principalAmount: number;
  accruedInterest?: number;
  debtorCount?: number;
  postageType?: string;
  tariffYear?: number;
}

@Controller('fee-engine')
@UseGuards(JwtAuthGuard)
export class FeeEngineController {
  constructor(private readonly feeEngineService: FeeEngineService) {}

  /**
   * Açılış masraflarını hesapla
   */
  @Post('calculate-opening-fees')
  calculateOpeningFees(@Body() dto: CalculateFeesDto): {
    items: GeneratedFeeItem[];
    total: number;
    tariffYear: number;
  } {
    const items = this.feeEngineService.calculateOpeningFees(
      dto.caseType,
      dto.principalAmount,
      dto.accruedInterest || 0,
      dto.debtorCount || 1,
      dto.postageType || 'NORMAL',
      dto.tariffYear,
    );

    return {
      items,
      total: this.feeEngineService.calculateTotalFees(items),
      tariffYear: dto.tariffYear || this.feeEngineService.getCurrentTariffYear(),
    };
  }

  /**
   * Faiz oranını getir
   */
  @Get('interest-rate')
  getInterestRate(
    @Query('currency') currency: string = 'TRY',
    @Query('interestType') interestType: string = 'YASAL',
    @Query('date') date?: string,
  ): { rate: number; currency: string; interestType: string } {
    const rate = this.feeEngineService.getInterestRate(
      currency,
      interestType,
      date ? new Date(date) : undefined,
    );

    return { rate, currency, interestType };
  }

  /**
   * Tebligat türlerini getir
   */
  @Get('postage-types')
  getPostageTypes(
    @Query('caseType') caseType?: string,
  ): Array<{ code: string; label: string; amount: number | null; allowed: boolean }> {
    const allTypes = this.feeEngineService.getPostageTypes();
    const allowedTypes = caseType 
      ? this.feeEngineService.getAllowedPostageTypes(caseType)
      : allTypes.map(t => t.code);

    return allTypes.map(type => ({
      ...type,
      allowed: allowedTypes.includes(type.code),
    }));
  }

  /**
   * Ceza/tazminat hesapla
   */
  @Post('calculate-penalty')
  calculatePenalty(
    @Body() dto: { penaltyType: string; principalAmount: number; customRate?: number },
  ): { amount: number; penaltyType: string; rate: number } {
    const amount = this.feeEngineService.calculatePenalty(
      dto.penaltyType,
      dto.principalAmount,
      dto.customRate,
    );

    return {
      amount,
      penaltyType: dto.penaltyType,
      rate: dto.customRate || 0.10,
    };
  }

  /**
   * Mevcut tarife yılını getir
   */
  @Get('current-tariff-year')
  getCurrentTariffYear(): { year: number } {
    return { year: this.feeEngineService.getCurrentTariffYear() };
  }

  /**
   * Faiz hesapla
   */
  @Post('calculate-interest')
  calculateInterest(
    @Body() dto: { 
      principal: number; 
      startDate: string; 
      endDate: string; 
      interestType?: string;
      currency?: string;
    },
  ): { 
    principal: number; 
    interest: number; 
    total: number; 
    rate: number;
    days: number;
    startDate: string;
    endDate: string;
    interestType: string;
  } {
    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);
    const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    
    const rate = this.feeEngineService.getInterestRate(
      dto.currency || 'TRY',
      dto.interestType || 'YASAL',
      startDate,
    );
    
    // Yıllık faiz oranını günlük faize çevir ve hesapla
    const dailyRate = rate / 100 / 365;
    const interest = dto.principal * dailyRate * days;
    
    return {
      principal: dto.principal,
      interest: Math.round(interest * 100) / 100,
      total: Math.round((dto.principal + interest) * 100) / 100,
      rate,
      days,
      startDate: dto.startDate,
      endDate: dto.endDate,
      interestType: dto.interestType || 'YASAL',
    };
  }

  /**
   * Masraf hesapla (basit)
   */
  @Post('calculate')
  calculate(
    @Body() dto: { 
      principal: number; 
      caseType?: string;
      profile?: string;
    },
  ): { 
    principal: number;
    fees: Array<{ name: string; amount: number }>;
    total: number;
    profile: string;
  } {
    const items = this.feeEngineService.calculateOpeningFees(
      dto.caseType || 'ILAMSIZ_GENEL',
      dto.principal,
      0,
      1,
      'NORMAL',
    );
    
    const fees = items.map(item => ({
      name: item.label,
      amount: item.amount,
    }));
    
    const total = this.feeEngineService.calculateTotalFees(items);
    
    return {
      principal: dto.principal,
      fees,
      total,
      profile: dto.profile || 'STANDART',
    };
  }
}
