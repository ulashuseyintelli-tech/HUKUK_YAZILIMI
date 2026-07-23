import {
  ClaimItemType,
  DocumentSourceType,
  InterestAccrualStatus,
  InterestStartDateProvenance,
  InterestType,
} from '@prisma/client';
import {
  type ClaimFormationJsonValue,
  type ClaimItemFormationComponentCategory,
} from './claim-item-formation-intent.contract';

export interface HumanClaimItemFormationAuthorizationInput {
  readonly tenantId: string;
  readonly caseId: string;
  readonly actorUserId: string;
}

export abstract class HumanClaimItemFormationAuthorizationPort {
  abstract assertAuthorized(input: HumanClaimItemFormationAuthorizationInput): Promise<void>;
}

export interface ResolveExactCaseDocumentInput {
  readonly tenantId: string;
  readonly caseId: string;
  readonly documentId: string;
  readonly requestedVersionId: string;
}

export interface ExactCaseDocumentSourceV1 {
  readonly tenantId: string;
  readonly caseId: string;
  readonly sourceType: 'CASE_DOCUMENT';
  readonly documentId: string;
  readonly versionId: string;
  readonly version: string;
  readonly binaryContentHash: string;
  readonly documentEnvelopeHash: string;
  readonly classificationHash: string;
  readonly canonicalSourceFingerprint: string;
  readonly fingerprintAlgorithm: 'SHA-256';
  readonly fingerprintVersion: string;
  readonly fingerprintVerified: boolean;
  readonly documentType: string;
  readonly claimItemDocumentSourceType: DocumentSourceType;
  readonly documentClassificationVersion: string;
  readonly lifecycleStatus: string;
  readonly availabilityStatus: string;
  readonly availableForFormation: boolean;
  readonly evidenceClasses: readonly string[];
  readonly opaqueEvidenceRefs: readonly string[];
  readonly resolutionContractVersion: string;
  readonly resolutionHash: string;
}

export abstract class CaseDocumentExactVersionResolverPort {
  abstract resolveExactVersion(
    input: ResolveExactCaseDocumentInput,
  ): Promise<ExactCaseDocumentSourceV1 | null>;
}

export interface ResolveExactLegalBasisInput {
  readonly tenantId: string;
  readonly caseId: string;
  readonly legalBasisCode: string;
  readonly requestedVersion: string;
  readonly effectiveAt: string;
  readonly componentCategory: ClaimItemFormationComponentCategory;
  readonly componentSubtypeCode: string;
  readonly documentType: string;
  readonly evidenceClasses: readonly string[];
  readonly liabilityContext: ClaimFormationJsonValue;
}

export type ClaimItemFormationInterestEligibility = 'ACCRUES' | 'NO_INTEREST' | 'UNRESOLVED';

/**
 * RCV-CLAIM-FORM-P02-S08-D01B-CONTRACT-PARITY-I01 (owner-ratified D1).
 * ACTIVE and SUPERSEDED remain admissible in specific, mode-dependent
 * circumstances (see LegalBasisEligibilityContext / assertLegalBasisEligible
 * in claim-item-formation-legal-basis-eligibility.ts); REVOKED and ARCHIVED
 * are unconditionally rejected in this slice. This is the application-level
 * canonical vocabulary — it does not create or alter a Prisma enum, and it
 * is not sourced from any existing canonical Legal Basis registry vocabulary
 * (none exists in this repository as of this slice).
 */
export const LEGAL_BASIS_LIFECYCLE_STATUSES = [
  'ACTIVE',
  'SUPERSEDED',
  'REVOKED',
  'ARCHIVED',
] as const;
export type LegalBasisLifecycleStatus = (typeof LEGAL_BASIS_LIFECYCLE_STATUSES)[number];

export interface ExactLegalBasisBindingV1 {
  readonly legalBasisCode: string;
  readonly legalBasisVersion: string;
  readonly legalBasisChecksum: string;
  readonly registryReleaseId: string;
  readonly registryReleaseChecksum: string;
  readonly status: LegalBasisLifecycleStatus;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly subtypeRecognized: boolean;
  readonly componentCategory: ClaimItemFormationComponentCategory;
  readonly componentSubtypeCode: string;
  readonly componentSubtypeVersion: string;
  readonly componentSubtypeChecksum: string;
  readonly allowedDocumentTypes: readonly string[];
  readonly requiredEvidenceClasses: readonly string[];
  readonly liabilityCompatible: boolean;
  readonly interestEligibility: ClaimItemFormationInterestEligibility;
  readonly interestPolicyRef: string | null;
  readonly interestPolicyVersion: string | null;
  readonly ruleRef: string | null;
  readonly ruleVersion: string | null;
  readonly legalReviewRequired: boolean;
  readonly resolutionContractVersion: string;
  readonly resolutionHash: string;
  /**
   * Exact, version-bound projection into the existing ClaimItem persistence
   * vocabulary. The dormant finalizer must never infer these legal semantics
   * from component labels or use a current/latest fallback.
   */
  readonly claimItemProjection: Readonly<{
    itemType: ClaimItemType;
    interestAccrualStatus: InterestAccrualStatus;
    interestType: InterestType | null;
    interestRate: string | null;
    interestStartDate: string | null;
    interestStartDateProvenance: InterestStartDateProvenance | null;
    isAllDebtorsLiable: boolean;
    liableDebtorIds: readonly string[];
  }>;
}

/**
 * RCV-CLAIM-FORM-P02-S08-D01B-CONTRACT-PARITY-I01 (owner-ratified D3).
 * Deliberately excludes a `retryability` classification: whether a failed
 * resolution should be retried is an orchestration/application-policy
 * decision, out of scope for this resolver contract.
 */
export type ResolveExactLegalBasisFailureCode =
  | 'NOT_FOUND'
  | 'STATUS_NOT_ELIGIBLE'
  | 'NOT_EFFECTIVE_AT_DATE'
  | 'RESOLUTION_UNAVAILABLE';

export type ResolveExactLegalBasisResult =
  | { readonly ok: true; readonly value: ExactLegalBasisBindingV1 }
  | {
      readonly ok: false;
      readonly failure: { readonly code: ResolveExactLegalBasisFailureCode };
    };

/**
 * RCV-CLAIM-FORM-P02-S08-D01B-CONTRACT-PARITY-I01 (owner-ratified D4).
 * Implementations must be pure and deterministic: the same exact input
 * against the same registry release state must always resolve to the same
 * result. No implicit current-time, randomness, or nondeterministic
 * fallback. Implementations resolve an already-adapter-verified registry
 * release and carry its identity/checksum — they do not perform
 * signature/certificate/key verification themselves.
 */
export abstract class LegalBasisExactVersionResolverPort {
  abstract resolveExactVersion(
    input: ResolveExactLegalBasisInput,
  ): Promise<ResolveExactLegalBasisResult>;
}
