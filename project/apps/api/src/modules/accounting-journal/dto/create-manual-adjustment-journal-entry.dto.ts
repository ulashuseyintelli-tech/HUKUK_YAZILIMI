import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MinLength,
  ValidateNested,
} from 'class-validator';
import type { AccountingAccountCode, AccountingJournalDirection } from '../accounting-journal.types';

/**
 * Whitelisted account codes accepted on a manual adjustment line.
 * Kept in sync with AccountingAccountCode (accounting-journal.types.ts). The domain
 * validator remains the authoritative gate; this list fails malformed input early at the
 * HTTP boundary (400) instead of surfacing it as a domain draft rejection (409).
 */
const MANUAL_ADJUSTMENT_ACCOUNT_CODES: AccountingAccountCode[] = [
  'CASH_CLEARING',
  'CLIENT_PAYABLE',
  'CLIENT_EXPENSE_REIMBURSEMENT_PAYABLE',
  'CLIENT_EXPENSE_RECEIVABLE',
  'ATTORNEY_FEE_REVENUE',
  'FIRM_EXPENSE_REIMBURSEMENT',
  'CLIENT_ADVANCE_BALANCE',
];

const MANUAL_ADJUSTMENT_DIRECTIONS: AccountingJournalDirection[] = ['DEBIT', 'CREDIT'];

/** Positive money string with up to 2 decimals (e.g. "10", "10.5", "10.50"). */
const MONEY_PATTERN = /^\d+(\.\d{1,2})?$/;

/**
 * One debit/credit leg of a manual adjustment. Source-specific financial dimensions
 * (collectionId, payoutId, offsetId, expense*) are intentionally NOT accepted here — the
 * global ValidationPipe (forbidNonWhitelisted) rejects them at the boundary and the domain
 * validator forbids them on the built draft as a second gate.
 */
export class ManualAdjustmentJournalLineDto {
  @IsIn(MANUAL_ADJUSTMENT_ACCOUNT_CODES)
  accountCode: AccountingAccountCode;

  @IsIn(MANUAL_ADJUSTMENT_DIRECTIONS)
  direction: AccountingJournalDirection;

  @IsString()
  @Matches(MONEY_PATTERN, { message: 'Manual adjustment line amount must be a positive money value with up to 2 decimals.' })
  amount: string;

  @IsOptional()
  @IsString()
  caseId?: string | null;

  @IsOptional()
  @IsString()
  clientId?: string | null;

  @IsOptional()
  @IsString()
  caseClientId?: string | null;
}

/**
 * Manual accounting journal adjustment request body. tenantId/actorUserId are always taken
 * from JWT context — never from the body. idempotencyKey is the caller-supplied idempotency
 * handle (mapped to the journal sourceId); replaying the same key with the same payload
 * returns the existing entry, while the same key with a different payload is a conflict.
 */
export class CreateManualAdjustmentJournalEntryDto {
  @IsString()
  @MinLength(1)
  idempotencyKey: string;

  @IsString()
  @MinLength(1)
  sourceName: string;

  @IsString()
  @MinLength(10, { message: 'Manual adjustment reason must be at least 10 characters.' })
  reason: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  evidenceRef?: string;

  @IsString()
  @Matches(MONEY_PATTERN, { message: 'Manual adjustment amount must be a positive money value with up to 2 decimals.' })
  amount: string;

  @IsString()
  @Matches(/^[A-Z]{3}$/, { message: 'Manual adjustment currency must be a 3-letter uppercase ISO code.' })
  currency: string;

  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => ManualAdjustmentJournalLineDto)
  lines: ManualAdjustmentJournalLineDto[];
}
