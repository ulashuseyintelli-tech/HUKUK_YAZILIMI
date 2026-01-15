import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FeeEngineService } from './fee-engine.service';
import type { GeneratedFeeItem } from '@shared/types';

interface CalculateFeesDto {
  caseType: string;
  principalAmount: number;
  accruedInterest?: number;
  debtorCount?: number;
  postageType?: string;
  tariffYear?: number;
}

/**
 * Preview Request DTO - Lightweight hesaplama için
 * Audit log tutulmaz, cache'lenir
 */
interface FeePreviewDto {
  principalAmount: number;
  caseType?: string;
  debtorCount?: number;
}

interface FeePreviewResponse {
  success: boolean;
  data?: {
    estimatedFees: number;
    estimatedAttorneyFee: number;
    tariffYear: number;
    breakdown: {
      basvurmaHarci: number;
      vekaletHarci: number;
      pesinHarc: number;
      dosyaGideri: number;
      tebligatGideri: number;
      vekaletPulu: number;
    };
  };
  error?: {
    code: 'INVALID_INPUT' | 'SERVICE_UNAVAILABLE';
    message: string;
  };
  cached: boolean;
  cacheExpiry?: string;
}

@Controller('fee-engine')
@UseGuards(JwtAuthGuard)
export class FeeEngineController {
  constructor(private readonly feeEngineService: FeeEngineService) {}

  /**
   * POST /fee-engine/preview
   * 
   * Lightweight preview endpoint - NO audit log, cached
   * Frontend form preview için kullanılır
   * 
   * @see docs/single-source-of-truth-architecture.md
   */
  @Post('preview')
  preview(@Body() dto: FeePreviewDto): FeePreviewResponse {
    try {
      // Validate input
      if (!dto.principalAmount || dto.principalAmount <= 0) {
        return {
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: 'principalAmount must be greater than 0',
          },
          cached: false,
        };
      }

      const debtorCount = dto.debtorCount || 1;
      const caseType = dto.caseType || 'ILAMSIZ_GENEL';
      const tariffYear = this.feeEngineService.getCurrentTariffYear();

      // Calculate fees
      const items = this.feeEngineService.calculateOpeningFees(
        caseType,
        dto.principalAmount,
        0,
        debtorCount,
        'NORMAL',
        tariffYear,
      );

      const estimatedFees = this.feeEngineService.calculateTotalFees(items);

      // Calculate attorney fee
      const estimatedAttorneyFee = this.calculateAttorneyFeePreview(dto.principalAmount);

      // Extract breakdown
      const breakdown = {
        basvurmaHarci: items.find(i => i.type === 'BASVURMA_HARCI' || i.tariffCode === 'BASVURMA_HARCI')?.amount || 0,
        vekaletHarci: items.find(i => i.type === 'VEKALET_HARCI' || i.tariffCode === 'VEKALET_HARCI')?.amount || 0,
        pesinHarc: items.find(i => i.type === 'PESIN_HARC' || i.tariffCode === 'PESIN_HARC')?.amount || 0,
        dosyaGideri: items.find(i => i.type === 'DOSYA_GIDERI' || i.tariffCode === 'DOSYA_GIDERI')?.amount || 0,
        tebligatGideri: items.find(i => i.type === 'TEBLIGAT_GIDERI' || i.tariffCode === 'TEBLIGAT_GIDERI')?.amount || 0,
        vekaletPulu: items.find(i => i.type === 'VEKALET_PULU' || i.tariffCode === 'VEKALET_PULU')?.amount || 0,
      };

      // Cache expiry: 5 minutes
      const cacheExpiry = new Date(Date.now() + 5 * 60 * 1000).toISOString();

      return {
        success: true,
        data: {
          estimatedFees,
          estimatedAttorneyFee,
          tariffYear,
          breakdown,
        },
        cached: false, // TODO: Implement caching
        cacheExpiry,
      };
    } catch (error) {
      console.error('[FeeEngine] Preview error:', error);
      return {
        success: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Fee calculation service is temporarily unavailable',
        },
        cached: false,
      };
    }
  }

  /**
   * Calculate attorney fee for preview
   * Based on 2025 tariff
   */
  private calculateAttorneyFeePreview(takipTutari: number): number {
    const tarifeler = [
      { min: 0, max: 55000, fixed: 11000, rate: 0 },
      { min: 55000, max: 130000, fixed: 11000, rate: 0.14 },
      { min: 130000, max: 390000, fixed: 21500, rate: 0.12 },
      { min: 390000, max: 780000, fixed: 52700, rate: 0.08 },
      { min: 780000, max: 1950000, fixed: 83900, rate: 0.04 },
      { min: 1950000, max: Infinity, fixed: 130700, rate: 0.01 },
    ];
    const minimum = 11000;
    
    for (const tarife of tarifeler) {
      if (takipTutari <= tarife.max) {
        const ucret = tarife.fixed + ((takipTutari - tarife.min) * tarife.rate);
        return Math.max(ucret, minimum);
      }
    }
    
    const sonTarife = tarifeler[tarifeler.length - 1];
    return sonTarife.fixed + ((takipTutari - sonTarife.min) * sonTarife.rate);
  }

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
