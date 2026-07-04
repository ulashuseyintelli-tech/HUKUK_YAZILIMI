import { IsOptional, IsString, MinLength } from 'class-validator';

/** Generic AccountingJournalEntry reversal request body. tenantId/actorUserId are always taken from JWT context. */
export class ReverseAccountingJournalEntryDto {
  @IsString()
  @MinLength(10, { message: 'Accounting journal reversal reason must be at least 10 characters.' })
  reason: string;

  @IsString()
  @IsOptional()
  @MinLength(1)
  evidenceRef?: string;
}