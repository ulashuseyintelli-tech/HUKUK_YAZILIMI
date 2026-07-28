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

export interface LegalBasisProjectionAuthoritySourceV1 {
  readonly releaseVersion: string;
  readonly registryId: 'RCV-CLAIM-LEGAL-SUBTYPE-REGISTRY';
  readonly registryVersion: string;
  readonly registryChecksum: string;
}

export interface LegalBasisDecisionProjectionSourceV1 {
  readonly legalCharacter: string;
  readonly legalBasisBinding: Readonly<{
    readonly allowedLegalBasisCodes: readonly string[];
    readonly bindingMode: 'EXACTLY_ONE' | 'EXACTLY_ONE_OF';
    readonly requiredLegalBasisCodes: readonly string[];
  }>;
  readonly requiredSourceTypes: readonly string[];
  readonly requiredEvidenceTypes: readonly string[];
  readonly liabilityCompatibility: Readonly<{
    readonly allowedLiabilityTypes: readonly string[];
    readonly crossLiabilityUse: 'PROHIBITED';
    readonly scope: 'EXACT_SAME_DEBTOR_AND_LIABILITY_RELATIONSHIP';
  }>;
  readonly interestEligibility: Readonly<{
    readonly componentAccruesFurtherInterest: false;
    readonly eligibilityRule: string;
    readonly requiresExactInterestPolicy: boolean;
    readonly requiresExactRateAuthority: boolean;
  }>;
  readonly amountSemantics: Readonly<{
    readonly fixedAtFormation: boolean;
    readonly minorUnitRepresentation: 'POSITIVE_INTEGER_STRING';
    readonly roundingFallback: 'PROHIBITED';
    readonly semanticAuthority: string;
  }>;
  readonly currencySemantics: Readonly<{
    readonly conversion: 'PROHIBITED';
    readonly currencyAuthority: string;
    readonly minorUnitAuthority: 'ISO_CURRENCY_MINOR_UNIT';
  }>;
  readonly calculationSemantics: Readonly<{
    readonly futureAccrual: 'INTEREST_POLICY_ONLY' | 'PROHIBITED';
    readonly rule: string;
    readonly sourceAmountDerivation: string;
  }>;
  readonly allowedFormationPaths: readonly string[];
  readonly forbiddenFormationPaths: readonly string[];
  readonly admissionRequirements: readonly string[];
  readonly finalizationRequirements: readonly string[];
  readonly snapshotRequirements: readonly string[];
}

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
  /** Exact Legal Basis release and Subtype Registry identities used by PB01. */
  readonly projectionAuthority: LegalBasisProjectionAuthoritySourceV1;
  /** Decision-driving SR01 semantics; display-only labels are excluded. */
  readonly decisionProjection: LegalBasisDecisionProjectionSourceV1;
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
 * RCV-CLAIM-FORM-P02-S08-D01B-CONTRACT-PARITY-I01 (owner-ratified D3):
 * deliberately excludes a `retryability` classification — whether a failed
 * resolution should be retried is an orchestration/application-policy
 * decision, out of scope for this resolver contract.
 *
 * Canonical resolver-level disposition union, aligned with the S08-D02-R01
 * exact-version source readiness contract ratified in
 * RECEIVABLE-GOVERNANCE.md §23.27.5 (PR #1570). This is exact-version/
 * release/authority resolution failure only — a binding this port
 * successfully resolves is separately subject to application-eligibility
 * validation (lifecycle status × mode, temporal validity, etc.) in
 * `claim-item-formation-legal-basis-eligibility.ts`, which has its own,
 * unrelated failure vocabulary. Only `AUTHORITY_UNAVAILABLE` is
 * retryable (transient); the other eight are not.
 */
export const EXACT_LEGAL_BASIS_RESOLUTION_FAILURE_CODES = [
  'VERSION_NOT_FOUND',
  'RELEASE_NOT_FOUND',
  'AUTHORITY_UNAVAILABLE',
  'REVOKED',
  'SUPERSEDED',
  'CHECKSUM_MISMATCH',
  'FINGERPRINT_MISMATCH',
  'SCOPE_MISMATCH',
  'LEGACY_UNRESOLVED',
] as const;
export type ResolveExactLegalBasisFailureCode =
  (typeof EXACT_LEGAL_BASIS_RESOLUTION_FAILURE_CODES)[number];

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
