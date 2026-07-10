import type { LegalCaseStatus } from '@prisma/client';

export const FINANCIAL_CASE_CLOSE_ACTION_CODE = 'FINANCIAL_CASE_CLOSE';
export const FINANCIAL_CASE_CLOSE_TARGET_TYPE = 'LegalCase';
export const FINANCIAL_CASE_CLOSE_INTENT_VERSION = 'OWN29C_FINANCIAL_CASE_CLOSE_V1';

export const FINANCIAL_CASE_CLOSE_STATUSES: ReadonlySet<string> = new Set([
  'HITAM',
  'INFAZ',
  'MUVEKKILE_IADE',
  'ACIZ',
  'BATAK',
  'MAHSUP',
  'TEMLIK',
]);

export interface FinancialCaseCloseSavedIntent {
  version: typeof FINANCIAL_CASE_CLOSE_INTENT_VERSION;
  caseId: string;
  status: LegalCaseStatus;
  reason: string | null;
}
