import { IsString, IsNumber, IsOptional, IsArray, IsEnum, IsBoolean, ValidateNested, IsDateString, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { InterestTypeCode, RateSourceType, Currency } from '../types';

// Currency values for validation
const CURRENCY_VALUES: Currency[] = ['TRY', 'USD', 'EUR', 'GBP', 'CHF'];

// ============================================================================
// PRINCIPAL ITEM DTO
// ============================================================================

export class PrincipalItemDto {
  @IsString()
  id: string;

  @IsNumber()
  amount: number;

  @IsIn(CURRENCY_VALUES)
  currency: Currency;

  @IsDateString()
  startDate: string;

  @IsEnum(InterestTypeCode)
  interestType: InterestTypeCode;

  @IsOptional()
  @IsNumber()
  dayCountBasis?: 365 | 360;

  @IsOptional()
  @IsBoolean()
  compounding?: boolean;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  ibrazTarihi?: string;

  @IsOptional()
  @IsDateString()
  vadeTarihi?: string;
}

// ============================================================================
// PAYMENT DTO
// ============================================================================

export class PaymentDto {
  @IsString()
  id: string;

  @IsDateString()
  date: string;

  @IsNumber()
  amount: number;

  @IsIn(CURRENCY_VALUES)
  currency: Currency;

  @IsOptional()
  @IsString()
  source?: string;
}

// ============================================================================
// CALCULATION OPTIONS DTO
// ============================================================================

export class CalculationOptionsDto {
  @IsOptional()
  @IsBoolean()
  includeKarsilisizCekTazminati?: boolean;
}

// ============================================================================
// INTEREST CALCULATION REQUEST DTO
// ============================================================================

export class InterestCalculationRequestDto {
  @IsString()
  caseId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PrincipalItemDto)
  principalItems: PrincipalItemDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentDto)
  payments?: PaymentDto[];

  @IsDateString()
  asOfDate: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CalculationOptionsDto)
  options?: CalculationOptionsDto;
}

// ============================================================================
// CREATE RATE DTO
// ============================================================================

export class CreateRateDto {
  @IsEnum(InterestTypeCode)
  interestType: InterestTypeCode;

  @IsDateString()
  validFrom: string;

  @IsOptional()
  @IsDateString()
  validTo?: string;

  @IsNumber()
  annualRate: number;

  @IsEnum(RateSourceType)
  source: RateSourceType;

  @IsOptional()
  @IsString()
  sourceRef?: string;
}

// ============================================================================
// QUERY PARAMS DTOs
// ============================================================================

export class GetRatesQueryDto {
  @IsEnum(InterestTypeCode)
  type: InterestTypeCode;

  @IsDateString()
  from: string;

  @IsDateString()
  to: string;
}

export class CalculateForCaseQueryDto {
  @IsDateString()
  asOfDate: string;
}
