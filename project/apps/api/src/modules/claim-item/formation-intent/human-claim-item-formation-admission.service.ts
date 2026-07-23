import {
  CLAIM_ITEM_FORMATION_CANONICAL_SERIALIZATION_VERSION,
  CLAIM_ITEM_FORMATION_EXPIRY_MS,
  CLAIM_ITEM_FORMATION_INTENT_CONTRACT_VERSION,
  CLAIM_ITEM_FORMATION_NORMALIZED_INPUT_VERSION,
  CLAIM_ITEM_FORMATION_SOURCE_IDENTITY_VERSION,
  CLAIM_ITEM_FORMATION_SOURCE_SLOT,
  ClaimItemFormationAdmissionError,
  parseHumanClaimItemFormationCommand,
  readFormationCaseId,
  validateHumanClaimItemFormationContext,
  type ClaimFormationJsonValue,
  type ClaimItemFormationAdmissionErrorCode,
  type HumanClaimItemFormationAdmissionContext,
} from './claim-item-formation-intent.contract';
import {
  buildCaseDocumentSourceIdentityHash,
  buildClaimItemFormationIntentChecksum,
  canonicalFormationPayload,
  domainSeparatedFormationHash,
  isSha256Hex,
} from './claim-item-formation-canonical';
import {
  CaseDocumentExactVersionResolverPort,
  HumanClaimItemFormationAuthorizationPort,
  LegalBasisExactVersionResolverPort,
  type ExactCaseDocumentSourceV1,
  type ExactLegalBasisBindingV1,
  type ResolveExactLegalBasisFailureCode,
  type ResolveExactLegalBasisResult,
} from './claim-item-formation-resolver.ports';
import {
  assertLegalBasisEligible,
  type LegalBasisEligibilityFailureCode,
} from './claim-item-formation-legal-basis-eligibility';
import {
  ClaimItemFormationOfficeApprovalAdapter,
  type ClaimItemFormationAdmissionResult,
  type PersistClaimItemFormationIntentInput,
} from './claim-item-formation-office-approval.adapter';

export interface HumanClaimItemFormationAdmissionOptions {
  readonly enabled?: boolean;
  readonly clock?: () => Date;
}

/**
 * Dormant typed-admission service. No Nest provider or production call-site is
 * registered by I02B. A later owner-gated package may supply exact resolvers and
 * explicitly enable it after live migration readiness is established.
 */
export class HumanClaimItemFormationAdmissionService {
  private readonly enabled: boolean;
  private readonly clock: () => Date;

  constructor(
    private readonly authorization: HumanClaimItemFormationAuthorizationPort,
    private readonly documentResolver: CaseDocumentExactVersionResolverPort,
    private readonly legalBasisResolver: LegalBasisExactVersionResolverPort,
    private readonly atomicWriter: ClaimItemFormationOfficeApprovalAdapter,
    options: HumanClaimItemFormationAdmissionOptions = {},
  ) {
    this.enabled = options.enabled ?? false;
    this.clock = options.clock ?? (() => new Date());
  }

  async admit(
    context: HumanClaimItemFormationAdmissionContext,
    rawCommand: unknown,
  ): Promise<ClaimItemFormationAdmissionResult> {
    if (!this.enabled) {
      throw new ClaimItemFormationAdmissionError('FORMATION_CONTEXT_REQUIRED');
    }

    validateHumanClaimItemFormationContext(context);
    const caseId = readFormationCaseId(rawCommand);
    await this.authorization.assertAuthorized({
      tenantId: context.tenantId,
      caseId,
      actorUserId: context.actorUserId,
    });

    const command = parseHumanClaimItemFormationCommand(rawCommand);
    if (command.caseId !== caseId) {
      throw new ClaimItemFormationAdmissionError('INVALID_FORMATION_CONTEXT');
    }

    const source = await this.documentResolver.resolveExactVersion({
      tenantId: context.tenantId,
      caseId: command.caseId,
      documentId: command.source.documentId,
      requestedVersionId: command.source.requestedVersionId,
    });
    this.assertSourceBinding(source, context.tenantId, command.caseId, command.source);

    const legalBasisResolution = await this.legalBasisResolver.resolveExactVersion({
      tenantId: context.tenantId,
      caseId: command.caseId,
      legalBasisCode: command.legalBasis.code,
      requestedVersion: command.legalBasis.requestedVersion,
      effectiveAt: command.effectiveAt,
      componentCategory: command.component.category,
      componentSubtypeCode: command.component.subtypeCode,
      documentType: source.documentType,
      evidenceClasses: source.evidenceClasses,
      liabilityContext: command.liabilityContext.payload,
    });
    const legalBasis = this.resolveLegalBasis(legalBasisResolution, command, source);

    const createdAt = this.clock();
    if (!Number.isFinite(createdAt.getTime())) {
      throw new ClaimItemFormationAdmissionError('INVALID_FORMATION_CONTEXT');
    }
    const expiresAt = new Date(createdAt.getTime() + CLAIM_ITEM_FORMATION_EXPIRY_MS);
    const sourceIdentityHash = buildCaseDocumentSourceIdentityHash({
      tenantId: context.tenantId,
      caseId: command.caseId,
      documentId: source.documentId,
    });

    const liability = canonicalFormationPayload(command.liabilityContext.payload);
    const evidence = canonicalFormationPayload(
      Object.freeze({
        refs: Object.freeze([...source.opaqueEvidenceRefs].sort()),
      }) as ClaimFormationJsonValue,
    );
    const provenance = canonicalFormationPayload(
      Object.freeze({
        actor: Object.freeze({ type: 'HUMAN', userId: context.actorUserId }),
        source: Object.freeze({
          sourceType: source.sourceType,
          documentId: source.documentId,
          versionId: source.versionId,
          version: source.version,
          canonicalSourceFingerprint: source.canonicalSourceFingerprint,
          resolutionContractVersion: source.resolutionContractVersion,
          resolutionHash: source.resolutionHash,
        }),
        legalBasis: Object.freeze({
          code: legalBasis.legalBasisCode,
          version: legalBasis.legalBasisVersion,
          checksum: legalBasis.legalBasisChecksum,
          registryReleaseId: legalBasis.registryReleaseId,
          registryReleaseChecksum: legalBasis.registryReleaseChecksum,
          resolutionContractVersion: legalBasis.resolutionContractVersion,
          resolutionHash: legalBasis.resolutionHash,
        }),
      }) as ClaimFormationJsonValue,
    );
    const normalizedInput = Object.freeze({
      tenantId: context.tenantId,
      caseId: command.caseId,
      actorUserId: context.actorUserId,
      idempotencyKey: command.idempotencyKey,
      source: Object.freeze({
        documentId: command.source.documentId,
        requestedVersionId: command.source.requestedVersionId,
      }),
      component: command.component,
      legalBasis: command.legalBasis,
      money: Object.freeze({
        originalAmountMinor: command.money.originalAmountMinor.toString(),
        demandedAmountMinor: command.money.demandedAmountMinor.toString(),
        currency: command.money.currency,
        minorUnit: command.money.minorUnit,
      }),
      effectiveAt: command.effectiveAt,
      liabilityContext: command.liabilityContext.payload,
    }) as ClaimFormationJsonValue;
    const normalizedInputChecksum = domainSeparatedFormationHash(
      CLAIM_ITEM_FORMATION_NORMALIZED_INPUT_VERSION,
      normalizedInput,
    );
    const intentChecksum = buildClaimItemFormationIntentChecksum(
      CLAIM_ITEM_FORMATION_INTENT_CONTRACT_VERSION,
      {
        normalizedInputChecksum,
        sourceIdentityHash,
        sourceVersionId: source.versionId,
        canonicalSourceFingerprint: source.canonicalSourceFingerprint,
        sourceResolutionHash: source.resolutionHash,
        componentCategory: legalBasis.componentCategory,
        componentSubtypeCode: legalBasis.componentSubtypeCode,
        componentSubtypeVersion: legalBasis.componentSubtypeVersion,
        componentSubtypeChecksum: legalBasis.componentSubtypeChecksum,
        legalBasisCode: legalBasis.legalBasisCode,
        legalBasisVersion: legalBasis.legalBasisVersion,
        legalBasisChecksum: legalBasis.legalBasisChecksum,
        legalBasisResolutionHash: legalBasis.resolutionHash,
        originalAmountMinor: command.money.originalAmountMinor,
        demandedAmountMinor: command.money.demandedAmountMinor,
        currency: command.money.currency,
        minorUnit: command.money.minorUnit,
        effectiveAt: command.effectiveAt,
        liabilityContextHash: liability.hash,
        evidenceRefsHash: evidence.hash,
        provenanceHash: provenance.hash,
      },
    );

    const persistence: PersistClaimItemFormationIntentInput = {
      tenantId: context.tenantId,
      caseId: command.caseId,
      requesterUserId: context.actorUserId,
      createdAt,
      expiresAt,
      idempotencyKey: command.idempotencyKey,
      normalizedInputChecksum,
      normalizedInputContractVersion: CLAIM_ITEM_FORMATION_NORMALIZED_INPUT_VERSION,
      intentChecksum,
      checksumAlgorithm: 'SHA-256',
      canonicalSerializationVersion: CLAIM_ITEM_FORMATION_CANONICAL_SERIALIZATION_VERSION,
      correlationId: context.correlationId,
      causationId: context.causationId ?? null,
      sourceIdentityVersion: CLAIM_ITEM_FORMATION_SOURCE_IDENTITY_VERSION,
      sourceType: 'CASE_DOCUMENT',
      sourceId: source.documentId,
      sourceSlot: CLAIM_ITEM_FORMATION_SOURCE_SLOT,
      sourceIdentityHash,
      sourceVersionId: source.versionId,
      sourceVersion: source.version,
      canonicalSourceFingerprint: source.canonicalSourceFingerprint,
      fingerprintAlgorithm: source.fingerprintAlgorithm,
      fingerprintVersion: source.fingerprintVersion,
      sourceResolutionContractVersion: source.resolutionContractVersion,
      sourceResolutionHash: source.resolutionHash,
      componentCategory: legalBasis.componentCategory,
      componentSubtypeCode: legalBasis.componentSubtypeCode,
      componentSubtypeVersion: legalBasis.componentSubtypeVersion,
      componentSubtypeChecksum: legalBasis.componentSubtypeChecksum,
      legalBasisCode: legalBasis.legalBasisCode,
      legalBasisVersion: legalBasis.legalBasisVersion,
      legalBasisChecksum: legalBasis.legalBasisChecksum,
      legalBasisRegistryReleaseId: legalBasis.registryReleaseId,
      legalBasisRegistryReleaseChecksum: legalBasis.registryReleaseChecksum,
      legalBasisResolutionContractVersion: legalBasis.resolutionContractVersion,
      legalBasisResolutionHash: legalBasis.resolutionHash,
      originalAmountMinor: command.money.originalAmountMinor,
      demandedAmountMinor: command.money.demandedAmountMinor,
      currency: command.money.currency,
      minorUnit: command.money.minorUnit,
      effectiveAt: new Date(command.effectiveAt),
      liabilityContextVersion: 'ClaimItemLiabilityContextV1',
      liabilityContextCanonicalPayload: liability.canonicalPayload,
      liabilityContextHash: liability.hash,
      interestEligibility: legalBasis.interestEligibility,
      interestPolicyRef: legalBasis.interestPolicyRef,
      interestPolicyVersion: legalBasis.interestPolicyVersion,
      ruleRef: legalBasis.ruleRef,
      ruleVersion: legalBasis.ruleVersion,
      evidenceRefsContractVersion: 'ClaimItemFormationEvidenceRefsV1',
      evidenceRefsCanonicalPayload: evidence.canonicalPayload,
      evidenceRefsHash: evidence.hash,
      provenanceContractVersion: 'ClaimItemFormationProvenanceV1',
      provenanceCanonicalPayload: provenance.canonicalPayload,
      provenanceHash: provenance.hash,
    };
    return this.atomicWriter.createAtomic(persistence);
  }

  private assertSourceBinding(
    source: ExactCaseDocumentSourceV1 | null,
    tenantId: string,
    caseId: string,
    requested: { readonly documentId: string; readonly requestedVersionId: string },
  ): asserts source is ExactCaseDocumentSourceV1 {
    if (!source) throw new ClaimItemFormationAdmissionError('FORMATION_SOURCE_UNAVAILABLE');
    if (
      source.tenantId !== tenantId ||
      source.caseId !== caseId ||
      source.sourceType !== 'CASE_DOCUMENT' ||
      source.documentId !== requested.documentId ||
      source.versionId !== requested.requestedVersionId ||
      !source.availableForFormation
    ) {
      throw new ClaimItemFormationAdmissionError('FORMATION_SOURCE_UNAVAILABLE');
    }
    if (
      source.fingerprintAlgorithm !== 'SHA-256' ||
      !source.fingerprintVerified ||
      !isSha256Hex(source.binaryContentHash) ||
      !isSha256Hex(source.documentEnvelopeHash) ||
      !isSha256Hex(source.classificationHash) ||
      !isSha256Hex(source.canonicalSourceFingerprint) ||
      !isSha256Hex(source.resolutionHash)
    ) {
      throw new ClaimItemFormationAdmissionError('SOURCE_FINGERPRINT_MISMATCH');
    }
    if (
      !source.version ||
      !source.claimItemDocumentSourceType ||
      !source.fingerprintVersion ||
      !source.documentType ||
      !source.documentClassificationVersion ||
      !source.lifecycleStatus ||
      !source.availabilityStatus ||
      !source.resolutionContractVersion ||
      !this.isOpaqueReferenceList(source.opaqueEvidenceRefs) ||
      !this.isOpaqueReferenceList(source.evidenceClasses)
    ) {
      throw new ClaimItemFormationAdmissionError('INVALID_FORMATION_CONTEXT');
    }
  }

  private resolveLegalBasis(
    resolution: ResolveExactLegalBasisResult,
    command: ReturnType<typeof parseHumanClaimItemFormationCommand>,
    source: ExactCaseDocumentSourceV1,
  ): ExactLegalBasisBindingV1 {
    if (!resolution.ok) {
      throw new ClaimItemFormationAdmissionError(this.mapLegalBasisFailure(resolution.failure.code));
    }
    const eligibility = assertLegalBasisEligible({
      mode: 'ADMISSION',
      legalBasis: resolution.value,
      requestedIdentity: {
        legalBasisCode: command.legalBasis.code,
        legalBasisVersion: command.legalBasis.requestedVersion,
      },
      requestedComponent: {
        category: command.component.category,
        subtypeCode: command.component.subtypeCode,
      },
      documentType: source.documentType,
      evidenceClasses: source.evidenceClasses,
      effectiveAt: command.effectiveAt,
    });
    if (!eligibility.ok) {
      throw new ClaimItemFormationAdmissionError(this.mapLegalBasisFailure(eligibility.failure.code));
    }
    return eligibility.legalBasis;
  }

  /**
   * Maps the shared resolver/eligibility failure vocabularies onto this
   * consumer's pre-existing, unrenamed `ClaimItemFormationAdmissionErrorCode`
   * (owner-ratified D3/parity requirement: consumer-facing codes are
   * preserved, not renamed, even though the underlying check now runs
   * through `assertLegalBasisEligible` shared with the finalizer).
   */
  private mapLegalBasisFailure(
    code: ResolveExactLegalBasisFailureCode | LegalBasisEligibilityFailureCode,
  ): ClaimItemFormationAdmissionErrorCode {
    switch (code) {
      case 'NOT_FOUND':
      case 'IDENTITY_MISMATCH':
      case 'STATUS_NOT_ELIGIBLE':
        return 'LEGAL_BASIS_VERSION_NOT_FOUND';
      case 'LIFECYCLE_NOT_ELIGIBLE':
      case 'NOT_EFFECTIVE_AT_DATE':
        return 'LEGAL_BASIS_NOT_EFFECTIVE';
      case 'COMPONENT_UNSUPPORTED':
        return 'UNSUPPORTED_COMPONENT';
      case 'COMPONENT_MISMATCH':
        return 'LEGAL_BASIS_COMPONENT_MISMATCH';
      case 'DOCUMENT_EVIDENCE_INCOMPATIBLE':
        return 'LEGAL_BASIS_EVIDENCE_MISMATCH';
      case 'LEGAL_REVIEW_REQUIRED':
        return 'LEGAL_REVIEW_REQUIRED';
      case 'REGISTRY_RELEASE_INVALID':
      case 'RESOLUTION_CONTRACT_INVALID':
      case 'LIABILITY_INCOMPATIBLE':
      case 'INTEREST_POLICY_INVALID':
      case 'PROJECTION_UNSUPPORTED':
      case 'BINDING_DRIFT':
      case 'RESOLUTION_UNAVAILABLE':
        return 'INVALID_FORMATION_CONTEXT';
    }
  }

  private isOpaqueReferenceList(value: readonly string[]): boolean {
    return (
      Array.isArray(value) &&
      value.length <= 32 &&
      new Set(value).size === value.length &&
      value.every((entry) => /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/.test(entry))
    );
  }
}
