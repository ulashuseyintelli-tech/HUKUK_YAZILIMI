import { Prisma } from '@prisma/client';
import { isSha256Hex } from './claim-item-formation-canonical';
import { type ClaimItemFormationComponentCategory } from './claim-item-formation-intent.contract';
import {
  type ClaimItemFormationInterestEligibility,
  type ExactLegalBasisBindingV1,
} from './claim-item-formation-resolver.ports';

/**
 * RCV-CLAIM-FORM-P02-S08-D01B-CONTRACT-PARITY-I01.
 *
 * Single shared Legal Basis eligibility/binding validator, used by BOTH the
 * human admission service (mode ADMISSION) and the dormant transactional
 * formation finalizer (mode FINALIZATION), so the two consumers can never
 * contradict each other on accept/reject — even though each maps failures
 * onto its own pre-existing, unrenamed error-code vocabulary. Pure: throws
 * nothing, returns a discriminated result; callers translate `failure.code`
 * to their own HttpException.
 */
export type LegalBasisEligibilityMode = 'ADMISSION' | 'FINALIZATION';

export interface LegalBasisEligibilityRequestedIdentity {
  readonly legalBasisCode: string;
  readonly legalBasisVersion: string;
}

export interface LegalBasisEligibilityRequestedComponent {
  readonly category: ClaimItemFormationComponentCategory;
  readonly subtypeCode: string;
}

/**
 * FINALIZATION-only: the persisted Intent's previously-bound registry,
 * component-subtype, interest-policy and resolution-contract fields.
 * Absent for ADMISSION — a first-time resolution has no prior binding to
 * compare against. `componentCategory`/`componentSubtypeCode` are NOT
 * repeated here: they are already carried by `requestedComponent`, which
 * for FINALIZATION callers is the persisted Intent's own component fields,
 * so the component-binding check (category 6) already covers them
 * uniformly for both modes.
 *
 * D6 PROJECTION DRIFT COVERAGE: PARTIAL (owner-confirmed, not silently
 * assumed). Every field below is exactly what the persisted
 * `ClaimItemFormationIntent` schema actually stores and can be compared
 * for exact equality — identity/version/checksum fields only.
 * `resolutionHash` is one such existing field, compared here like any
 * other; this file makes NO claim that it additionally covers
 * `claimItemProjection`'s content. No canonical evidence establishes what
 * a concrete resolver adapter's `resolutionHash` computation covers (the
 * resolver is dormant/abstract in this slice — no concrete adapter exists
 * to inspect), and the Intent schema does not persist any of the 8
 * `claimItemProjection` fields (itemType, interestAccrualStatus,
 * interestType, interestRate, interestStartDate,
 * interestStartDateProvenance, isAllDebtorsLiable, liableDebtorIds)
   * directly. The canonical NAFAKA exact-version adapter therefore binds all
   * 8 fields into `resolutionHash`; this generic validator still compares the
   * hash only and must not infer that coverage for another adapter.
 */
export interface LegalBasisEligibilityExpectedBinding {
  readonly legalBasisChecksum: string;
  readonly registryReleaseId: string;
  readonly registryReleaseChecksum: string;
  readonly componentSubtypeVersion: string;
  readonly componentSubtypeChecksum: string;
  readonly interestEligibility: ClaimItemFormationInterestEligibility;
  readonly interestPolicyRef: string | null;
  readonly interestPolicyVersion: string | null;
  readonly ruleRef: string | null;
  readonly ruleVersion: string | null;
  readonly resolutionContractVersion: string;
  readonly resolutionHash: string;
}

export interface LegalBasisEligibilityInput {
  readonly mode: LegalBasisEligibilityMode;
  readonly legalBasis: ExactLegalBasisBindingV1 | null;
  readonly requestedIdentity: LegalBasisEligibilityRequestedIdentity;
  readonly requestedComponent: LegalBasisEligibilityRequestedComponent;
  readonly documentType: string;
  readonly evidenceClasses: readonly string[];
  /**
   * Legal applicability time (owner-ratified D2): the command's
   * `effectiveAt` for ADMISSION, the persisted Intent's `effectiveAt` for
   * FINALIZATION. Never `approval.decidedAt`, never transaction/system
   * time. The caller — not this function — is responsible for sourcing
   * the correct value for its mode.
   */
  readonly effectiveAt: string;
  /** Required in practice when `mode === 'FINALIZATION'`; ignored otherwise. */
  readonly expectedBinding?: LegalBasisEligibilityExpectedBinding;
}

export type LegalBasisEligibilityFailureCode =
  | 'NOT_FOUND'
  | 'IDENTITY_MISMATCH'
  | 'LIFECYCLE_NOT_ELIGIBLE'
  | 'NOT_EFFECTIVE_AT_DATE'
  | 'REGISTRY_RELEASE_INVALID'
  | 'RESOLUTION_CONTRACT_INVALID'
  | 'COMPONENT_UNSUPPORTED'
  | 'COMPONENT_MISMATCH'
  | 'DOCUMENT_EVIDENCE_INCOMPATIBLE'
  | 'LIABILITY_INCOMPATIBLE'
  | 'LEGAL_REVIEW_REQUIRED'
  | 'INTEREST_POLICY_INVALID'
  | 'PROJECTION_UNSUPPORTED'
  | 'BINDING_DRIFT';

export type LegalBasisEligibilityResult =
  | { readonly ok: true; readonly legalBasis: ExactLegalBasisBindingV1 }
  | {
      readonly ok: false;
      readonly failure: { readonly code: LegalBasisEligibilityFailureCode };
    };

const OPAQUE_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/;

function isOpaqueReferenceList(value: readonly string[]): boolean {
  return (
    Array.isArray(value) &&
    value.length <= 32 &&
    new Set(value).size === value.length &&
    value.every((entry) => OPAQUE_REFERENCE.test(entry))
  );
}

function reject(code: LegalBasisEligibilityFailureCode): LegalBasisEligibilityResult {
  return { ok: false, failure: { code } };
}

/**
 * Owner-ratified D1: lifecycle status × mode admissibility matrix.
 * ADMISSION: only ACTIVE is admissible (subject to temporal validity).
 * FINALIZATION: ACTIVE and SUPERSEDED are admissible (each still subject to
 * temporal validity AND exact immutable-binding equality — SUPERSEDED has
 * no separate mechanism: the unconditional binding-drift check below
 * already requires the exact same version/release/checksum, and the
 * temporal check below already requires the Intent's `effectiveAt` to fall
 * within that exact version's own historical interval). REVOKED is always
 * rejected. ARCHIVED is always rejected in this slice (including at
 * FINALIZATION, per explicit owner instruction).
 */
function isLifecycleEligible(
  status: ExactLegalBasisBindingV1['status'],
  mode: LegalBasisEligibilityMode,
): boolean {
  if (status === 'REVOKED' || status === 'ARCHIVED') return false;
  if (mode === 'ADMISSION') return status === 'ACTIVE';
  return status === 'ACTIVE' || status === 'SUPERSEDED';
}

/** Owner-ratified D2: `effectiveFrom <= effectiveAt < effectiveTo`; null `effectiveTo` is open-ended. */
function isEffectiveAtDate(legalBasis: ExactLegalBasisBindingV1, effectiveAt: string): boolean {
  const at = new Date(effectiveAt).getTime();
  const from = new Date(legalBasis.effectiveFrom).getTime();
  const to = legalBasis.effectiveTo === null ? null : new Date(legalBasis.effectiveTo).getTime();
  return (
    Number.isFinite(at) &&
    Number.isFinite(from) &&
    (to === null || Number.isFinite(to)) &&
    at >= from &&
    (to === null || at < to)
  );
}

function parseDecimalOrNull(value: string): Prisma.Decimal | null {
  try {
    return new Prisma.Decimal(value);
  } catch {
    return null;
  }
}

/**
 * Supported-projection category (owner requirement #6, parity fix): the
 * dormant `claimItemProjection` must resolve to a supported, internally
 * consistent ClaimItem shape. `itemType === 'OTHER'` is rejected in BOTH
 * modes now — previously only the finalizer rejected it, leaving
 * admission-approved OTHER-typed intents stuck at an unfinalizable dead
 * end.
 */
function isProjectionSupported(legalBasis: ExactLegalBasisBindingV1): boolean {
  const projection = legalBasis.claimItemProjection;
  if (
    !projection ||
    !projection.itemType ||
    projection.itemType === 'OTHER' ||
    !projection.interestAccrualStatus ||
    !Array.isArray(projection.liableDebtorIds) ||
    !isOpaqueReferenceList(projection.liableDebtorIds)
  ) {
    return false;
  }
  const interestStartDate =
    projection.interestStartDate == null ? null : new Date(projection.interestStartDate);
  const interestRate =
    projection.interestRate == null ? null : parseDecimalOrNull(projection.interestRate);
  if (projection.interestRate != null && interestRate === null) return false;
  if (interestStartDate !== null && !Number.isFinite(interestStartDate.getTime())) return false;

  if (legalBasis.interestEligibility === 'ACCRUES') {
    return (
      projection.interestAccrualStatus === 'ACCRUES' &&
      projection.interestType !== null &&
      projection.interestStartDateProvenance !== null &&
      (projection.interestStartDateProvenance === 'ENFORCEMENT_PROCEEDING_DATE' ||
        interestStartDate !== null) &&
      (interestRate === null ||
        (interestRate.isFinite() &&
          interestRate.decimalPlaces() <= 2 &&
          interestRate.abs().lessThanOrEqualTo('999.99')))
    );
  }
  if (legalBasis.interestEligibility === 'NO_INTEREST') {
    return (
      projection.interestAccrualStatus === 'NO_INTEREST' &&
      projection.interestType === null &&
      projection.interestRate === null &&
      projection.interestStartDate === null &&
      projection.interestStartDateProvenance === null
    );
  }
  return projection.interestAccrualStatus === 'UNKNOWN';
}

export function assertLegalBasisEligible(
  input: LegalBasisEligibilityInput,
): LegalBasisEligibilityResult {
  const { mode, legalBasis, requestedIdentity, requestedComponent, expectedBinding } = input;

  // Precondition: the resolver found nothing for the exact requested version.
  if (!legalBasis) return reject('NOT_FOUND');

  // Category: identity — the returned record actually matches what was
  // requested, and its own identity checksum is well-formed.
  if (
    legalBasis.legalBasisCode !== requestedIdentity.legalBasisCode ||
    legalBasis.legalBasisVersion !== requestedIdentity.legalBasisVersion ||
    !isSha256Hex(legalBasis.legalBasisChecksum)
  ) {
    return reject('IDENTITY_MISMATCH');
  }

  // Category: lifecycle eligibility (D1).
  if (!isLifecycleEligible(legalBasis.status, mode)) return reject('LIFECYCLE_NOT_ELIGIBLE');

  // Category: temporal validity (D2).
  if (!isEffectiveAtDate(legalBasis, input.effectiveAt)) return reject('NOT_EFFECTIVE_AT_DATE');

  // Category: registry release.
  if (
    !legalBasis.registryReleaseId ||
    !isSha256Hex(legalBasis.registryReleaseChecksum) ||
    (mode === 'FINALIZATION' &&
      expectedBinding !== undefined &&
      (legalBasis.registryReleaseId !== expectedBinding.registryReleaseId ||
        legalBasis.registryReleaseChecksum !== expectedBinding.registryReleaseChecksum))
  ) {
    return reject('REGISTRY_RELEASE_INVALID');
  }

  // Category: resolution contract.
  if (
    !legalBasis.resolutionContractVersion ||
    !isSha256Hex(legalBasis.resolutionHash) ||
    (mode === 'FINALIZATION' &&
      expectedBinding !== undefined &&
      (legalBasis.resolutionContractVersion !== expectedBinding.resolutionContractVersion ||
        legalBasis.resolutionHash !== expectedBinding.resolutionHash))
  ) {
    return reject('RESOLUTION_CONTRACT_INVALID');
  }

  // Category: component binding.
  if (!legalBasis.subtypeRecognized) return reject('COMPONENT_UNSUPPORTED');
  if (
    legalBasis.componentCategory !== requestedComponent.category ||
    legalBasis.componentSubtypeCode !== requestedComponent.subtypeCode ||
    !legalBasis.componentSubtypeVersion ||
    !isSha256Hex(legalBasis.componentSubtypeChecksum) ||
    (mode === 'FINALIZATION' &&
      expectedBinding !== undefined &&
      (legalBasis.componentSubtypeVersion !== expectedBinding.componentSubtypeVersion ||
        legalBasis.componentSubtypeChecksum !== expectedBinding.componentSubtypeChecksum))
  ) {
    return reject('COMPONENT_MISMATCH');
  }

  // Category: document/evidence compatibility.
  if (
    !isOpaqueReferenceList(legalBasis.allowedDocumentTypes) ||
    !isOpaqueReferenceList(legalBasis.requiredEvidenceClasses) ||
    !legalBasis.allowedDocumentTypes.includes(input.documentType) ||
    legalBasis.requiredEvidenceClasses.some(
      (requiredClass) => !input.evidenceClasses.includes(requiredClass),
    )
  ) {
    return reject('DOCUMENT_EVIDENCE_INCOMPATIBLE');
  }

  // Category: liability compatibility (D6): `liabilityCompatible` is a
  // real, comparable field, checked directly. Drift in the underlying
  // liability projection (`isAllDebtorsLiable`, `liableDebtorIds`) is NOT
  // covered here — see the PARTIAL coverage note on
  // `LegalBasisEligibilityExpectedBinding` above.
  if (!legalBasis.liabilityCompatible) return reject('LIABILITY_INCOMPATIBLE');

  // Category: legal review — required in BOTH modes (parity already held
  // for this one category; now routed through the shared validator too).
  if (legalBasis.legalReviewRequired) return reject('LEGAL_REVIEW_REQUIRED');

  // Category: immutable binding drift (D6) — remaining FINALIZATION-only
  // exact-equality fields not already covered above.
  if (mode === 'FINALIZATION' && expectedBinding !== undefined) {
    if (
      legalBasis.legalBasisChecksum !== expectedBinding.legalBasisChecksum ||
      legalBasis.interestEligibility !== expectedBinding.interestEligibility ||
      legalBasis.interestPolicyRef !== expectedBinding.interestPolicyRef ||
      legalBasis.interestPolicyVersion !== expectedBinding.interestPolicyVersion ||
      legalBasis.ruleRef !== expectedBinding.ruleRef ||
      legalBasis.ruleVersion !== expectedBinding.ruleVersion
    ) {
      return reject('BINDING_DRIFT');
    }
  }

  // Category: interest-policy internal consistency (ACCRUES <-> policy refs present).
  const policyFields = [
    legalBasis.interestPolicyRef,
    legalBasis.interestPolicyVersion,
    legalBasis.ruleRef,
    legalBasis.ruleVersion,
  ];
  if (
    (legalBasis.interestEligibility === 'ACCRUES' && policyFields.some((value) => !value)) ||
    (legalBasis.interestEligibility !== 'ACCRUES' && policyFields.some((value) => value !== null))
  ) {
    return reject('INTEREST_POLICY_INVALID');
  }

  // Category: supported projection (parity fix — OTHER rejected in both modes now).
  if (!isProjectionSupported(legalBasis)) return reject('PROJECTION_UNSUPPORTED');

  return { ok: true, legalBasis };
}
