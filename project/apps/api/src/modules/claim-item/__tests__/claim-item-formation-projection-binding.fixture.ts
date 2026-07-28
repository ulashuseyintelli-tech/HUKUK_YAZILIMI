import type {
  ClaimItemFormationComponentCategory,
} from '../formation-intent/claim-item-formation-intent.contract';
import type {
  ExactLegalBasisBindingV1,
  LegalBasisDecisionProjectionSourceV1,
  LegalBasisProjectionAuthoritySourceV1,
} from '../formation-intent/claim-item-formation-resolver.ports';

const REGISTRY_CHECKSUM =
  '320f671ed2262314a560703bc8f15f9cd8b5e0743d8dfa4e5ce49b1e62c26e64';

/** Explicitly synthetic PB01 fixture. It is never a production Legal Basis release. */
export function syntheticProjectionBindingSource(input: {
  readonly legalBasisCode: string;
  readonly componentCategory: ClaimItemFormationComponentCategory;
  readonly requiresExactInterestPolicy?: boolean;
}): Pick<ExactLegalBasisBindingV1, 'projectionAuthority' | 'decisionProjection'> {
  const projectionAuthority: LegalBasisProjectionAuthoritySourceV1 = {
    releaseVersion: '1',
    registryId: 'RCV-CLAIM-LEGAL-SUBTYPE-REGISTRY',
    registryVersion: '1',
    registryChecksum: REGISTRY_CHECKSUM,
  };
  const decisionProjection: LegalBasisDecisionProjectionSourceV1 = {
    legalCharacter: 'SYNTHETIC_TEST_ONLY',
    legalBasisBinding: {
      allowedLegalBasisCodes: [input.legalBasisCode],
      bindingMode: 'EXACTLY_ONE',
      requiredLegalBasisCodes: [input.legalBasisCode],
    },
    requiredSourceTypes: ['EXACT_DOCUMENT_SOURCE_VERSION'],
    requiredEvidenceTypes: ['SIGNED_CONTRACT'],
    liabilityCompatibility: {
      allowedLiabilityTypes: ['TAM'],
      crossLiabilityUse: 'PROHIBITED',
      scope: 'EXACT_SAME_DEBTOR_AND_LIABILITY_RELATIONSHIP',
    },
    interestEligibility: {
      componentAccruesFurtherInterest: false,
      eligibilityRule: 'SYNTHETIC_TEST_ONLY',
      requiresExactInterestPolicy: input.requiresExactInterestPolicy ?? false,
      requiresExactRateAuthority: input.requiresExactInterestPolicy ?? false,
    },
    amountSemantics: {
      fixedAtFormation: true,
      minorUnitRepresentation: 'POSITIVE_INTEGER_STRING',
      roundingFallback: 'PROHIBITED',
      semanticAuthority: 'SYNTHETIC_TEST_ONLY',
    },
    currencySemantics: {
      conversion: 'PROHIBITED',
      currencyAuthority: 'EXACT_SOURCE_CURRENCY',
      minorUnitAuthority: 'ISO_CURRENCY_MINOR_UNIT',
    },
    calculationSemantics: {
      futureAccrual: 'PROHIBITED',
      rule: 'SYNTHETIC_TEST_ONLY',
      sourceAmountDerivation: 'EXACT_SOURCE_EVIDENCE_REQUIRED',
    },
    allowedFormationPaths: ['CLAIM_ITEM_FORMATION_INTENT_V1_APPROVED_FINALIZATION'],
    forbiddenFormationPaths: [
      'CURRENT_LATEST_OR_DEFAULT_RESOLUTION',
      'DIRECT_CLAIM_ITEM_WRITE',
    ],
    admissionRequirements: ['Exact synthetic test authority'],
    finalizationRequirements: ['Exact synthetic test authority revalidation'],
    snapshotRequirements: ['Exact PB01 binding envelope'],
  };
  return { projectionAuthority, decisionProjection };
}
