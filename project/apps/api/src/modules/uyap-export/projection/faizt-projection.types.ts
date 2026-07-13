import {
  ClaimItemStatus,
  InterestAccrualStatus,
  InterestTypeCode,
} from '@prisma/client';

import {
  UyapFaiztInterestCode,
  UyapProjectionEvidence,
  UyapProjectionRequiredContext,
  UyapProjectionVerification,
} from '../../../config/uyap-interest-crosswalk';

export const RECEIVABLE_RELATION_CLASSIFICATIONS = [
  'DUE_ONLY',
  'CLAIM_ITEM_ONLY',
  'MATCHED_PAIR',
  'DUPLICATE_PAIR',
  'AMOUNT_OR_TYPE_DRIFT',
  'INTEREST_IDENTITY_DRIFT',
  'MARKER_MISSING',
  'NAFAKA_EXPECTED_DUE_ONLY',
  'UNCLASSIFIABLE',
] as const;

export type ReceivableRelationClassification =
  (typeof RECEIVABLE_RELATION_CLASSIFICATIONS)[number];

export type DecimalSnapshot =
  | number
  | string
  | Readonly<{ toString(): string }>
  | null
  | undefined;

export interface DueRelationSnapshot {
  readonly dueId: string;
  readonly tenantId: string;
  readonly caseId: string;
  readonly type: string;
  readonly amount: DecimalSnapshot;
  readonly currency: string;
  readonly interestTypeCode: InterestTypeCode | string | null;
  readonly legacyInterestType: string | null;
  readonly interestRate: DecimalSnapshot;
  readonly interestStartDate: Date | string | null;
  readonly interestAccrualStatus: InterestAccrualStatus | string | null;
  readonly exportEligible: boolean;
}

export interface ClaimItemRelationSnapshot {
  readonly claimItemId: string;
  readonly tenantId: string;
  readonly caseId: string;
  readonly itemType: string;
  readonly amount: DecimalSnapshot;
  readonly demandedAmount: DecimalSnapshot;
  readonly originalAmount: DecimalSnapshot;
  readonly currency: string;
  readonly status: ClaimItemStatus | string;
  readonly interestTypeCode: InterestTypeCode | string | null;
  readonly legacyInterestType: string | null;
  readonly interestRate: DecimalSnapshot;
  readonly interestStartDate: Date | string | null;
  readonly interestAccrualStatus: InterestAccrualStatus | string;
  readonly dueSyncSourceDueId: string | null;
  readonly backfillSourceDueId: string | null;
  readonly exportEligible: boolean;
}

export interface ReceivableRelationResult {
  readonly classification: ReceivableRelationClassification;
  readonly tenantId: string;
  readonly caseId: string;
  readonly dueIds: readonly string[];
  readonly claimItemIds: readonly string[];
  readonly sourceExportEligible: boolean;
  readonly reasons: readonly string[];
}

export interface ClaimItemFaiztProjectionInput {
  readonly sourceKind: 'CLAIM_ITEM';
  readonly claimItemId: string;
  readonly tenantId: string;
  readonly caseId: string;
  readonly relation: ReceivableRelationResult;
  readonly interestTypeCode: InterestTypeCode | string | null;
  readonly legacyInterestType: string | null;
  readonly interestRate: DecimalSnapshot;
  readonly interestStartDate: Date | string | null;
  readonly interestAccrualStatus: InterestAccrualStatus | string;
  readonly sourceMarker: Readonly<{
    readonly dueSyncSourceDueId: string | null;
    readonly backfillSourceDueId: string | null;
  }>;
  readonly exportEligible: boolean;
}

export interface NafakaDueFaiztProjectionInput {
  readonly sourceKind: 'NAFAKA_DUE';
  readonly dueId: string;
  readonly tenantId: string;
  readonly caseId: string;
  readonly dueType: 'NAFAKA';
  readonly relation: ReceivableRelationResult;
  readonly interestTypeCode: InterestTypeCode | string | null;
  readonly legacyInterestType: string | null;
  readonly interestRate: DecimalSnapshot;
  readonly interestStartDate: Date | string | null;
  readonly interestAccrualStatus: InterestAccrualStatus | string | null;
  readonly exportEligible: boolean;
}

export type FaiztProjectionInput =
  | ClaimItemFaiztProjectionInput
  | NafakaDueFaiztProjectionInput;

export interface ProjectedFaiztInterest {
  readonly ok: true;
  readonly status: 'PROJECTED';
  readonly sourceId: string;
  readonly sourceAuthority: 'CLAIM_ITEM_RICH';
  readonly relationClassification: 'MATCHED_PAIR' | 'CLAIM_ITEM_ONLY';
  readonly canonicalCode: InterestTypeCode;
  readonly faiztCode: UyapFaiztInterestCode;
  readonly verification: Exclude<UyapProjectionVerification, 'UNVERIFIED'>;
  readonly evidence: UyapProjectionEvidence;
  readonly interestRate: number | null;
  readonly interestStartDate: string;
}

export interface NoInterestFaiztProjection {
  readonly ok: true;
  readonly status: 'NO_INTEREST';
  readonly sourceId: string;
  readonly relationClassification: 'MATCHED_PAIR' | 'CLAIM_ITEM_ONLY';
  readonly omitInterestElement: true;
}

export type FaiztProjectionFailureStatus =
  | 'UNVERIFIED_FAIZT'
  | 'UNKNOWN_CANONICAL_CODE'
  | 'INVALID_RATE'
  | 'MISSING_START_DATE'
  | 'RICH_LEGACY_MISMATCH'
  | 'LEGACY_AMBIGUOUS'
  | 'INVALID_INTEREST_STATE'
  | 'RELATION_DUPLICATE'
  | 'RELATION_DRIFT'
  | 'RELATION_MARKER_MISSING'
  | 'RELATION_UNCLASSIFIABLE'
  | 'NAFAKA_MAPPING_BLOCKED'
  | 'SOURCE_NOT_EXPORTABLE';

export interface RejectedFaiztProjection {
  readonly ok: false;
  readonly status: FaiztProjectionFailureStatus;
  readonly sourceId: string;
  readonly canonicalCode: string | null;
  readonly relationClassification: ReceivableRelationClassification;
  readonly requiredContext: readonly UyapProjectionRequiredContext[];
  readonly detail: string;
}

export type FaiztProjectionResult =
  | ProjectedFaiztInterest
  | NoInterestFaiztProjection
  | RejectedFaiztProjection;

export interface DormantFaiztBatchCaseInput {
  readonly caseId: string;
  readonly projections: readonly FaiztProjectionResult[];
}

export interface DormantFaiztBatchFailure {
  readonly caseId: string;
  readonly sourceId: string;
  readonly status:
    | FaiztProjectionFailureStatus
    | 'BATCH_EMPTY'
    | 'CASE_HAS_NO_PROJECTIONS'
    | 'DUPLICATE_CASE_ID';
}

export type DormantFaiztBatchReadiness =
  | Readonly<{
      status: 'READY';
      policy: 'REJECT_ENTIRE_BATCH';
      artifactProduced: false;
      caseCount: number;
      projectionCount: number;
      failures: readonly [];
    }>
  | Readonly<{
      status: 'REJECTED';
      policy: 'REJECT_ENTIRE_BATCH';
      artifactProduced: false;
      caseCount: number;
      projectionCount: number;
      failures: readonly DormantFaiztBatchFailure[];
    }>;
