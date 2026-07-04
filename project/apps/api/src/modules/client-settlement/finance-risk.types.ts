import { CollectionDispositionLineType } from '@prisma/client';

export enum FinanceRiskActionCode {
  COLLECTION_DISPOSITION_RECOMMEND = 'COLLECTION_DISPOSITION_RECOMMEND',
  COLLECTION_DISPOSITION_POST = 'COLLECTION_DISPOSITION_POST',
}

export enum FinanceRiskDecision {
  ALLOW_DIRECT = 'ALLOW_DIRECT',
  REQUIRE_APPROVAL = 'REQUIRE_APPROVAL',
  MANUAL_REVIEW = 'MANUAL_REVIEW',
  BLOCK = 'BLOCK',
}

export enum FinanceRiskReasonCode {
  POLICY_REQUIRES_APPROVAL = 'POLICY_REQUIRES_APPROVAL',
  POLICY_OVERRIDE = 'POLICY_OVERRIDE',
  FEE_THRESHOLD_EXCEEDED = 'FEE_THRESHOLD_EXCEEDED',
  MANUAL_ADJUSTMENT = 'MANUAL_ADJUSTMENT',
  OTHER_BUCKET_USED = 'OTHER_BUCKET_USED',
  MISSING_CORRELATION = 'MISSING_CORRELATION',
  CURRENCY_MISMATCH = 'CURRENCY_MISMATCH',
  TENANT_MISMATCH = 'TENANT_MISMATCH',
  MANUAL_REVERSAL = 'MANUAL_REVERSAL',
  HIGH_VALUE_TRANSACTION = 'HIGH_VALUE_TRANSACTION',
  ROLE_RESTRICTION = 'ROLE_RESTRICTION',
  AMOUNT_MISMATCH = 'AMOUNT_MISMATCH',
  INVALID_SOURCE_STATE = 'INVALID_SOURCE_STATE',
}

export type FinanceRiskSeverity = 'INFO' | 'WARNING' | 'HIGH' | 'BLOCKER';

export interface FinanceRiskReason {
  code: FinanceRiskReasonCode;
  severity: FinanceRiskSeverity;
  publicMessage: string;
  internalMessage: string;
  field?: string;
  sourceType?: string;
  sourceId?: string;
}

export interface FinanceRiskEvaluation {
  actionCode: FinanceRiskActionCode;
  decision: FinanceRiskDecision;
  reasons: FinanceRiskReason[];
  priorityRank: number;
  canCreateOfficeApproval: boolean;
  canProceedDirectly: boolean;
  requiresManualReview: boolean;
  blocksMutation: boolean;
}

export interface FinanceRiskDispositionLine {
  id?: string;
  type: CollectionDispositionLineType;
  amount: string;
  caseClientId: string | null;
  note: string | null;
}

export interface FinanceRiskCollectionDispositionInput {
  tenantId: string;
  dispositionId: string;
  caseId: string;
  collectionId: string;
  status: string;
  totalAmount: string;
  currency: string;
  lines: FinanceRiskDispositionLine[];
  manualReversalRequiredAt?: Date | string | null;
}

export const FINANCE_RISK_POLICY_VERSION = 'S9H-1';
