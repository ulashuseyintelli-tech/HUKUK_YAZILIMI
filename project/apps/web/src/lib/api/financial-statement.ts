import { apiClient } from './client';

/**
 * ACCT-5B — Muhasebe Defteri (AccountingJournal-kaynaklı Financial Statement) API katmanı.
 *
 * Backend: GET /accounting-journal/financial-statements (ACCT-5A, office-wide read — AdminGuard
 * kaldırıldı). Journal-derived READ-ONLY projeksiyon; posting/writer/legal-ledger/TBK100 davranışı
 * YOK. statementType=CLIENT_CASE_STATEMENT ve dateBasis=postedAt HARD-LOCKED (backend tek değer kabul
 * eder) → bu client sabit gönderir, seçilebilir alan olarak sunulmaz.
 *
 * Tek zarf (controller payload'u doğrudan döner, response.data.data DEĞİL).
 *
 * DİKKAT: bu, mevcut "Müvekkil Ekstresi" (ClientStatement, bkz. lib/api/client-statement.ts) ile
 * AYNI ŞEY DEĞİLDİR. Ekstre = immutable, dönemsel snapshot (create/supersede mutation). Bu ise
 * AccountingJournal'dan CANLI okunan, snapshot ALMAYAN bir defter görünümüdür.
 */

export type FinancialStatementDirection = 'DEBIT' | 'CREDIT';

export interface FinancialStatementMovement {
  lineNo: number;
  statementDate: string; // ISO
  accountCode: string;
  direction: FinancialStatementDirection;
  amount: string; // Decimal string
  currency: string;
  caseId: string;
  clientId: string;
  caseClientId: string | null;
  source: {
    sourceType: string;
    sourceAction: string;
    displayRef: string;
  };
  note: string | null;
}

export interface FinancialStatementReconciliationWarning {
  code: string;
  message: string;
}

export interface FinancialStatementReconciliation {
  status: string;
  trialBalanceEvidenceStatus: string;
  legalLedgerComparisonStatus: string;
  warnings: FinancialStatementReconciliationWarning[];
}

export interface FinancialStatementReadReport {
  tenantId: string;
  statementType: 'CLIENT_CASE_STATEMENT';
  surface: string;
  sourceBasis: string;
  period: { from: string; to: string; dateBasis: string };
  currency: string;
  scope: { caseId: string; clientId: string; caseClientId: string | null };
  opening: { amount: string; currency: string };
  movements: FinancialStatementMovement[];
  closing: { amount: string; currency: string };
  reconciliation: FinancialStatementReconciliation;
}

export interface GetClientCaseStatementParams {
  caseId: string;
  clientId: string;
  caseClientId?: string | null;
  /** date-input (YYYY-MM-DD) veya ISO. */
  from: string;
  to: string;
  currency?: string;
}

export const financialStatementApi = {
  /** Dosya+müvekkil bazlı, journal-kaynaklı defter görünümü (read-only, snapshot almaz). */
  async getClientCaseStatement(params: GetClientCaseStatementParams): Promise<FinancialStatementReadReport> {
    const qs = new URLSearchParams({
      statementType: 'CLIENT_CASE_STATEMENT',
      dateBasis: 'postedAt',
      from: params.from,
      to: params.to,
      currency: params.currency ?? 'TRY',
      caseId: params.caseId,
      clientId: params.clientId,
    });
    if (params.caseClientId) qs.set('caseClientId', params.caseClientId);
    const resp = await apiClient.get<FinancialStatementReadReport>(
      `/accounting-journal/financial-statements?${qs.toString()}`,
    );
    return resp.data;
  },
};

/** Domain hesap kodu → hukuk bürosu dili (ham accountCode UI'ya sızmaz). */
export const FINANCIAL_STATEMENT_ACCOUNT_LABELS: Record<string, string> = {
  CLIENT_PAYABLE: 'Müvekkile Borç',
};

export function financialStatementAccountLabel(accountCode: string): string {
  return FINANCIAL_STATEMENT_ACCOUNT_LABELS[accountCode] ?? accountCode;
}
