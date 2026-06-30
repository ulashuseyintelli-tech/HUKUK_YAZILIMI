import type {
  AccountingAccountCode,
  AccountingJournalEntryType,
  AccountingJournalSourceType,
} from './accounting-journal.types';

export interface AccountingJournalTrialBalanceFilters {
  tenantId: string;
  currency?: string;
  caseId?: string;
  clientId?: string;
  caseClientId?: string;
  accountCode?: AccountingAccountCode;
  sourceType?: AccountingJournalSourceType;
  sourceAction?: string;
  entryType?: AccountingJournalEntryType;
  postedFrom?: string | Date;
  postedTo?: string | Date;
}

export interface AccountingJournalTrialBalanceRow {
  accountCode: AccountingAccountCode;
  currency: string;
  debit: string;
  credit: string;
  netDebit: string;
  netCredit: string;
  lineCount: number;
}

export interface AccountingJournalTrialBalanceCurrencyTotal {
  currency: string;
  debit: string;
  credit: string;
  balanced: boolean;
  lineCount: number;
}

export interface AccountingJournalTrialBalanceSourceBreakdown {
  sourceType: AccountingJournalSourceType;
  sourceAction: string;
  currency: string;
  debit: string;
  credit: string;
  balanced: boolean;
  lineCount: number;
}

export type AccountingJournalTrialBalanceWarningCode =
  | 'DIMENSION_SCOPED_IMBALANCE'
  | 'NO_JOURNAL_LINES';

export interface AccountingJournalTrialBalanceDiagnostics {
  balanced: boolean;
  dimensionScoped: boolean;
  partialEntryScope: boolean;
  dateBasis: 'postedAt';
  missingEffectiveDateColumn: true;
  missingSourceVersionColumn: true;
  warningCodes: AccountingJournalTrialBalanceWarningCode[];
}

export interface AccountingJournalTrialBalanceReport {
  tenantId: string;
  filters: AccountingJournalTrialBalanceFilters;
  rows: AccountingJournalTrialBalanceRow[];
  totals: AccountingJournalTrialBalanceCurrencyTotal[];
  sourceBreakdown: AccountingJournalTrialBalanceSourceBreakdown[];
  diagnostics: AccountingJournalTrialBalanceDiagnostics;
}
