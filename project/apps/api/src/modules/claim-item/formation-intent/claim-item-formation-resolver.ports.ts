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

export interface ExactLegalBasisBindingV1 {
  readonly legalBasisCode: string;
  readonly legalBasisVersion: string;
  readonly legalBasisChecksum: string;
  readonly registryReleaseId: string;
  readonly registryReleaseChecksum: string;
  readonly status: string;
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
}

export abstract class LegalBasisExactVersionResolverPort {
  abstract resolveExactVersion(
    input: ResolveExactLegalBasisInput,
  ): Promise<ExactLegalBasisBindingV1 | null>;
}
