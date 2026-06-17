import { IsEnum, IsOptional, IsString, IsDateString, MinLength } from 'class-validator';
import {
  ClientApprovalChannel,
  ClientApprovalDecision,
  ClientApprovalSubjectType,
} from '@prisma/client';

/**
 * Müvekkil onay talebi oluşturma DTO'su (status=DRAFT).
 * subjectId POLİMORFİK: FK yok. subjectType=EXPENSE_REQUEST ise servis SOFT-validate eder
 * (bulunursa subjectLabel zenginleşir; bulunamazsa kayıt yine kabul edilir).
 */
export class CreateClientApprovalRequestDto {
  @IsString()
  @MinLength(1)
  clientId: string;

  @IsEnum(ClientApprovalSubjectType)
  subjectType: ClientApprovalSubjectType;

  @IsString()
  @IsOptional()
  subjectId?: string;

  @IsString()
  @IsOptional()
  subjectLabel?: string;

  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(ClientApprovalChannel)
  @IsOptional()
  channel?: ClientApprovalChannel;

  @IsDateString()
  @IsOptional()
  expiresAt?: string;
}

/** SENT → APPROVED/REJECTED kararı. */
export class DecisionClientApprovalDto {
  @IsEnum(ClientApprovalDecision)
  decision: ClientApprovalDecision;

  @IsString()
  @IsOptional()
  note?: string;
}

/** send / cancel / expire için ortak gövde — yalnız opsiyonel not. */
export class TransitionClientApprovalDto {
  @IsString()
  @IsOptional()
  note?: string;
}
