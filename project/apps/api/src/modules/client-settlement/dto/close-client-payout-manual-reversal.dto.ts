import { ClientPayoutManualReversalClosureMethod } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';

/**
 * TM47D-4 — Manual reversal closure request.
 *
 * tenantId/closedById body'den alinmaz; controller authenticated request context'ten service'e gecer.
 */
export class CloseClientPayoutManualReversalDto {
  @IsEnum(ClientPayoutManualReversalClosureMethod)
  closureMethod: ClientPayoutManualReversalClosureMethod;

  @IsOptional()
  @IsString()
  @MinLength(1)
  closureNote?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  evidenceRef?: string;
}
