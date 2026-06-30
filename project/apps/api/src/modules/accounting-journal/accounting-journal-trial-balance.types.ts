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
  | 'NO_JOURNAL_LINES'
  | 'TRIAL_BALANCE_IMBALANCE';

export type AccountingJournalTrialBalanceEvidenceStatus =
  | 'NO_LINES'
  | 'BALANCED'
  | 'IMBALANCED'
  | 'DIMENSION_SCOPED';

export interface AccountingJournalTrialBalanceUnbalancedCurrency {
  currency: string;
  debit: string;
  credit: string;
  difference: string;
}

export interface AccountingJournalTrialBalanceDiagnostics {
  balanced: boolean;
  dimensionScoped: boolean;
  partialEntryScope: boolean;
  dateBasis: 'postedAt';
  generatedAt: string;
  lineCount: number;
  entryCount: number;
  currencyCount: number;
  evidenceStatus: AccountingJournalTrialBalanceEvidenceStatus;
  unbalancedCurrencies: AccountingJournalTrialBalanceUnbalancedCurrency[];
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
