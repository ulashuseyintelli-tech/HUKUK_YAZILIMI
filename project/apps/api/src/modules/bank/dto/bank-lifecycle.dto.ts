import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { BankSettlementEvidenceOutcome } from '@prisma/client';

const trimString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class AppendBankSettlementEvidenceDto {
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  idempotencyKey!: string;

  @IsEnum(BankSettlementEvidenceOutcome)
  outcome!: BankSettlementEvidenceOutcome;

  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  evidenceReference!: string;

  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  evidenceHash!: string;

  @IsDateString({}, { message: 'observedAt must be a valid ISO 8601 date string' })
  observedAt!: string;
}

export class TransitionBankCandidateFinalityDto {
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  idempotencyKey!: string;

  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  settlementEvidenceId!: string;
}
