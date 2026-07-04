import { CollectionDispositionLineType } from '@prisma/client';

/**
 * S8-B FAZ-1a — Dağıtım önerisi girdi/çıktı kontratı (advisory-only · preview).
 * recommend-ONLY: persist YOK, P4 YOK, finansal etki YOK. Üretilen satırlar mevcut
 * recommend()→approve()→post() lifecycle'ına beslenir (otorite orada).
 */

/** Manuel avukatlık ücreti. FAZ-1a yalnız AMOUNT (oran×baz fee modeli = FAZ-2). */
export interface AttorneyFeeInput {
  mode: 'AMOUNT';
  /** faithful decimal-string; guard: 0 <= amount <= gross */
  amount: string;
  note?: string;
}

export interface GenerateDistributionRecommendationDto {
  attorneyFee?: AttorneyFeeInput;
  // FAZ-1a: expense auto-apply YOK. FAZ-1b: includeApprovedExpenses?: boolean
}

/** Önerilen disposition satırı — FE pre-fill eder, kullanıcı düzenleyebilir, recommend() persist eder. */
export interface SuggestedDistributionLine {
  type: CollectionDispositionLineType; // FAZ-1a: CONTRACTUAL_FEE_WITHHELD | CLIENT_PAYABLE
  amount: string; // faithful decimal (BE Prisma.Decimal)
  caseClientId: string | null;
  // FAZ-2: 'FEE_AGREEMENT' — CaseFeeAgreement'tan hesaplanan ücret (flag-gated; manuel override yoksa).
  origin: 'FEE_MANUAL' | 'FEE_AGREEMENT' | 'CLIENT_PAYABLE_RESIDUAL';
  editable: true;
  note?: string;
  /** FAZ-2 provenance: origin='FEE_AGREEMENT' ise kaynak CaseFeeAgreement id'si; aksi halde undefined. */
  feeAgreementId?: string;
}

/** Masraf adayı — YALNIZ BİLGİ (FAZ-1a auto-apply devre dışı). */
export interface ExpenseCandidate {
  expenseRequestId: string;
  caseId: string;
  status: string;
  remaining: string; // computeExpenseRequestUnpaid (canonical reuse, READ-ONLY)
  applied: false;
  note: string;
}

export interface DistributionRecommendation {
  dispositionId: string;
  status: 'HELD_PENDING_DISTRIBUTION';
  currency: string;
  gross: string; // = disposition.totalAmount (faithful)
  beneficiaryScope: string;
  recommendOnly: true;
  financialEffect: false;
  suggestedLines: SuggestedDistributionLine[];
  sumCheck: { sum: string; equalsGross: boolean };
  expenseModule: {
    autoApplyEnabled: false;
    disabledReason: 'EXPENSE_APPROVAL_FIELD_MISSING';
    candidates: ExpenseCandidate[];
  };
  warnings: string[];
}
