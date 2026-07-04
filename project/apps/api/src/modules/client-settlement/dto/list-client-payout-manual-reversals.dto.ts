import {
  ClientPayoutManualReversalClosureMethod,
  ClientPayoutManualReversalStatus,
} from '@prisma/client';
import { IsDateString, IsEnum, IsNumberString, IsOptional, IsString, MinLength } from 'class-validator';

/**
 * TM47D-5A - manual reversal operations read model filters.
 *
 * Read-only boundary: tenantId is always taken from the authenticated request context.
 */
export class ListClientPayoutManualReversalsDto {
  @IsOptional()
  @IsEnum(ClientPayoutManualReversalStatus)
  status?: ClientPayoutManualReversalStatus;

  @IsOptional()
  @IsString()
  @MinLength(1)
  caseId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  caseClientId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  clientId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  currency?: string;

  @IsOptional()
  @IsEnum(ClientPayoutManualReversalClosureMethod)
  closureMethod?: ClientPayoutManualReversalClosureMethod;

  @IsOptional()
  @IsDateString()
  openedFrom?: string;

  @IsOptional()
  @IsDateString()
  openedTo?: string;

  @IsOptional()
  @IsDateString()
  closedFrom?: string;

  @IsOptional()
  @IsDateString()
  closedTo?: string;

  @IsOptional()
  @IsNumberString()
  page?: string;

  @IsOptional()
  @IsNumberString()
  limit?: string;
}
