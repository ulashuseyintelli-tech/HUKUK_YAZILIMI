import type {
  AccountingAccountCode,
  AccountingJournalDirection,
  AccountingJournalSourceType,
  MoneyAmount,
} from './accounting-journal.types';
import type { AccountingJournalTrialBalanceEvidenceStatus } from './accounting-journal-trial-balance.types';

export type FinancialStatementType = 'CLIENT_CASE_STATEMENT';

export type FinancialStatementSurface = 'FINANCIAL_STATEMENT';

export type FinancialStatementSourceBasis = 'JOURNAL_DERIVED_PROJECTION';

export type FinancialStatementDateBasis = 'postedAt';

export type FinancialStatementReconciliationStatus =
  | 'READY'
  | 'TRIAL_BALANCE_REQUIRED'
  | 'EVIDENCE_INCOMPLETE';

export type FinancialStatementLegalLedgerComparisonStatus =
  | 'NOT_APPLICABLE'
  | 'PENDING'
  | 'MATCHED'
  | 'MISMATCHED';

export type FinancialStatementWarningCode =
  | 'TRIAL_BALANCE_REQUIRED'
  | 'DIMENSION_SCOPED_EVIDENCE'
  | 'NO_FX_CONVERSION'
  | 'LEGAL_LEDGER_COMPARISON_NOT_AUTHORITATIVE';

export interface FinancialStatementPeriod {
  from: string;
  to: string;
  dateBasis: FinancialStatementDateBasis;
}

export interface FinancialStatementScope {
  caseId: string;
  clientId: string;
  caseClientId: string | null;
}

export interface FinancialStatementReadRequest {
  tenantId: string;
  statementType: FinancialStatementType;
  period: FinancialStatementPeriod;
  currency: string;
  scope: FinancialStatementScope;
}

export interface FinancialStatementBalance {
  amount: MoneyAmount;
  currency: string;
}

export interface FinancialStatementMovementSource {
  sourceType: AccountingJournalSourceType;
  sourceAction: string;
  displayRef: string | null;
}

export interface FinancialStatementMovement {
  lineNo: number;
  statementDate: string;
  accountCode: AccountingAccountCode;
  direction: AccountingJournalDirection;
  amount: MoneyAmount;
  currency: string;
  caseId: string;
  clientId: string;
  caseClientId: string | null;
  source: FinancialStatementMovementSource;
  note: string | null;
}

export interface FinancialStatementReconciliationWarning {
  code: FinancialStatementWarningCode;
  message: string;
}

export interface FinancialStatementReconciliation {
  status: FinancialStatementReconciliationStatus;
  trialBalanceEvidenceStatus: AccountingJournalTrialBalanceEvidenceStatus;
  legalLedgerComparisonStatus: FinancialStatementLegalLedgerComparisonStatus;
  warnings: FinancialStatementReconciliationWarning[];
}

export interface FinancialStatementReadReport {
  tenantId: string;
  statementType: FinancialStatementType;
  surface: FinancialStatementSurface;
  sourceBasis: FinancialStatementSourceBasis;
  period: FinancialStatementPeriod;
  currency: string;
  scope: FinancialStatementScope;
  opening: FinancialStatementBalance;
  movements: FinancialStatementMovement[];
  closing: FinancialStatementBalance;
  reconciliation: FinancialStatementReconciliation;
}