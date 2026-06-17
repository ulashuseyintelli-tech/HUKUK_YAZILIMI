import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { ExpenseBlockReasonCode } from '@prisma/client';

/**
 * Masraf blok gerekçesi oluşturma DTO'su.
 * blockedActionCode SERBEST STRING (M-1 kararı): enum değil — vocabulary olgunlaşmadı.
 * Öneri değerler: VEHICLE_SEIZURE, REAL_ESTATE_SEIZURE, BANK_QUERY, SALE_REQUEST, FIELD_VISIT.
 */
export class CreateExpenseBlockReasonDto {
  @IsString()
  @MinLength(1)
  blockedActionCode: string;

  @IsEnum(ExpenseBlockReasonCode)
  reasonCode: ExpenseBlockReasonCode;

  @IsString()
  @IsOptional()
  note?: string;

  @IsString()
  @IsOptional()
  expenseRequestId?: string;
}

/**
 * resolve / cancel için ortak gövde — yalnız opsiyonel not.
 * Çekirdek alanlar (action/reason/note/case/expenseRequest) DEĞİŞTİRİLEMEZ;
 * bu yüzden transition gövdesi yalnız resolutionNote taşır.
 */
export class TransitionExpenseBlockReasonDto {
  @IsString()
  @IsOptional()
  note?: string;
}
