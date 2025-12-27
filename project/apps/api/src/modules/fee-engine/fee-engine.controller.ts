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
}
