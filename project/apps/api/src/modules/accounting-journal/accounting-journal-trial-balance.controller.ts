import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AdminGuard } from '../auth/guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccountingJournalTrialBalanceService } from './accounting-journal-trial-balance.service';
import type {
  AccountingJournalTrialBalanceFilters,
  AccountingJournalTrialBalanceReport,
} from './accounting-journal-trial-balance.types';
import type {
  AccountingAccountCode,
  AccountingJournalEntryType,
  AccountingJournalSourceType,
} from './accounting-journal.types';

type QueryValue = string | string[] | undefined;

interface AccountingJournalTrialBalanceQuery {
  tenantId?: QueryValue;
  currency?: QueryValue;
  caseId?: QueryValue;
  clientId?: QueryValue;
  caseClientId?: QueryValue;
  accountCode?: QueryValue;
  sourceType?: QueryValue;
  sourceAction?: QueryValue;
  entryType?: QueryValue;
  postedFrom?: QueryValue;
  postedTo?: QueryValue;
}

const ACCOUNT_CODES: readonly AccountingAccountCode[] = [
  'CASH_CLEARING',
  'CLIENT_PAYABLE',
  'CLIENT_EXPENSE_REIMBURSEMENT_PAYABLE',
  'CLIENT_EXPENSE_RECEIVABLE',
  'ATTORNEY_FEE_REVENUE',
  'FIRM_EXPENSE_REIMBURSEMENT',
  'CLIENT_ADVANCE_BALANCE',
];

const SOURCE_TYPES: readonly AccountingJournalSourceType[] = [
  'COLLECTION_DISPOSITION_LINE',
  'CLIENT_PAYOUT',
  'CLIENT_OFFSET',
  'BALANCE_LEDGER',
  'EXPENSE_REQUEST',
  'ACCOUNTING_JOURNAL_ENTRY',
];

const ENTRY_TYPES: readonly AccountingJournalEntryType[] = [
  'COLLECTION_DISTRIBUTION_POSTED',
  'CLIENT_PAYOUT_RECORDED',
  'CLIENT_OFFSET_APPLIED',
  'CLIENT_OFFSET_REVERSED',
  'CLIENT_ADVANCE_LEDGER_RECORDED',
  'EXPENSE_REQUEST_RECORDED',
  'EXPENSE_REQUEST_CANCELLED',
  'ACCOUNTING_JOURNAL_REVERSAL',
];

@Controller('accounting-journal')
@UseGuards(JwtAuthGuard)
export class AccountingJournalTrialBalanceController {
  constructor(private readonly trialBalance: AccountingJournalTrialBalanceService) {}

  /// <remarks>
  /// Cagrildigi yerler:
  /// - AccountingJournalTrialBalanceController.getTrialBalance() -> GET /accounting-journal/trial-balance (read-only admin diagnostic evidence).
  /// - AccountingJournalTrialBalanceService.getTrialBalance() -> DB aggregate based persisted journal trial balance reader.
  /// </remarks>
  @Get('trial-balance')
  @UseGuards(AdminGuard)
  async getTrialBalance(
    @CurrentUser('tenantId') tenantId: string,
    @Query() query: AccountingJournalTrialBalanceQuery = {},
  ): Promise<AccountingJournalTrialBalanceReport> {
    return this.trialBalance.getTrialBalance(buildTrialBalanceFilters(tenantId, query));
  }
}

function buildTrialBalanceFilters(
  tenantId: string,
  query: AccountingJournalTrialBalanceQuery,
): AccountingJournalTrialBalanceFilters {
  const currency = queryString('currency', query.currency);
  const caseId = queryString('caseId', query.caseId);
  const clientId = queryString('clientId', query.clientId);
  const caseClientId = queryString('caseClientId', query.caseClientId);
  const sourceAction = queryString('sourceAction', query.sourceAction);
  const accountCode = enumQuery('accountCode', query.accountCode, ACCOUNT_CODES);
  const sourceType = enumQuery('sourceType', query.sourceType, SOURCE_TYPES);
  const entryType = enumQuery('entryType', query.entryType, ENTRY_TYPES);
  const postedFrom = dateQuery('postedFrom', query.postedFrom);
  const postedTo = dateQuery('postedTo', query.postedTo);

  return {
    tenantId,
    ...(currency ? { currency } : {}),
    ...(caseId ? { caseId } : {}),
    ...(clientId ? { clientId } : {}),
    ...(caseClientId ? { caseClientId } : {}),
    ...(accountCode ? { accountCode } : {}),
    ...(sourceType ? { sourceType } : {}),
    ...(sourceAction ? { sourceAction } : {}),
    ...(entryType ? { entryType } : {}),
    ...(postedFrom ? { postedFrom } : {}),
    ...(postedTo ? { postedTo } : {}),
  };
}

function queryString(field: string, value: QueryValue): string | undefined {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) {
    throw new BadRequestException(`${field} must be a single query value.`);
  }
  if (value.trim().length === 0) {
    throw new BadRequestException(`${field} must not be empty.`);
  }
  return value;
}

function enumQuery<T extends string>(
  field: string,
  value: QueryValue,
  allowedValues: readonly T[],
): T | undefined {
  const candidate = queryString(field, value);
  if (candidate === undefined) return undefined;
  if (!allowedValues.includes(candidate as T)) {
    throw new BadRequestException(`${field} must be one of: ${allowedValues.join(', ')}.`);
  }
  return candidate as T;
}

function dateQuery(field: 'postedFrom' | 'postedTo', value: QueryValue): string | undefined {
  const candidate = queryString(field, value);
  if (candidate === undefined) return undefined;

  const date = new Date(candidate);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException(`${field} must be a valid ISO date or Date.`);
  }
  return date.toISOString();
}
