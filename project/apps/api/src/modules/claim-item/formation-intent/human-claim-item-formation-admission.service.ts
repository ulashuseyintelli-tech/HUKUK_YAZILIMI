import { Prisma } from '@prisma/client';
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
} from './claim-item-formation-resolver.ports';
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

    const legalBasis = await this.legalBasisResolver.resolveExactVersion({
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
    this.assertLegalBasisBinding(legalBasis, command, source);

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

  private assertLegalBasisBinding(
    legalBasis: ExactLegalBasisBindingV1 | null,
    command: ReturnType<typeof parseHumanClaimItemFormationCommand>,
    source: ExactCaseDocumentSourceV1,
  ): asserts legalBasis is ExactLegalBasisBindingV1 {
    if (!legalBasis) {
      throw new ClaimItemFormationAdmissionError('LEGAL_BASIS_VERSION_NOT_FOUND');
    }
    if (
      legalBasis.legalBasisCode !== command.legalBasis.code ||
      legalBasis.legalBasisVersion !== command.legalBasis.requestedVersion
    ) {
      throw new ClaimItemFormationAdmissionError('LEGAL_BASIS_VERSION_NOT_FOUND');
    }
    if (
      !isSha256Hex(legalBasis.legalBasisChecksum) ||
      !isSha256Hex(legalBasis.registryReleaseChecksum) ||
      !isSha256Hex(legalBasis.componentSubtypeChecksum) ||
      !isSha256Hex(legalBasis.resolutionHash)
    ) {
      throw new ClaimItemFormationAdmissionError('INVALID_FORMATION_CONTEXT');
    }
    if (!legalBasis.subtypeRecognized) {
      throw new ClaimItemFormationAdmissionError('UNSUPPORTED_COMPONENT');
    }

    const effectiveAt = new Date(command.effectiveAt).getTime();
    const effectiveFrom = new Date(legalBasis.effectiveFrom).getTime();
    const effectiveTo =
      legalBasis.effectiveTo === null ? null : new Date(legalBasis.effectiveTo).getTime();
    if (
      legalBasis.status !== 'ACTIVE' ||
      !Number.isFinite(effectiveFrom) ||
      (effectiveTo !== null && !Number.isFinite(effectiveTo)) ||
      effectiveAt < effectiveFrom ||
      (effectiveTo !== null && effectiveAt >= effectiveTo)
    ) {
      throw new ClaimItemFormationAdmissionError('LEGAL_BASIS_NOT_EFFECTIVE');
    }
    if (
      legalBasis.componentCategory !== command.component.category ||
      legalBasis.componentSubtypeCode !== command.component.subtypeCode
    ) {
      throw new ClaimItemFormationAdmissionError('LEGAL_BASIS_COMPONENT_MISMATCH');
    }
    if (
      !legalBasis.allowedDocumentTypes.includes(source.documentType) ||
      legalBasis.requiredEvidenceClasses.some(
        (requiredClass) => !source.evidenceClasses.includes(requiredClass),
      )
    ) {
      throw new ClaimItemFormationAdmissionError('LEGAL_BASIS_EVIDENCE_MISMATCH');
    }
    if (!legalBasis.liabilityCompatible) {
      throw new ClaimItemFormationAdmissionError('INVALID_FORMATION_CONTEXT');
    }
    if (legalBasis.legalReviewRequired) {
      throw new ClaimItemFormationAdmissionError('LEGAL_REVIEW_REQUIRED');
    }
    if (
      !legalBasis.componentSubtypeVersion ||
      !legalBasis.registryReleaseId ||
      !legalBasis.resolutionContractVersion ||
      !this.isOpaqueReferenceList(legalBasis.allowedDocumentTypes) ||
      !this.isOpaqueReferenceList(legalBasis.requiredEvidenceClasses)
    ) {
      throw new ClaimItemFormationAdmissionError('INVALID_FORMATION_CONTEXT');
    }
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
      throw new ClaimItemFormationAdmissionError('INVALID_FORMATION_CONTEXT');
    }
    this.assertClaimItemProjection(legalBasis);
  }

  private assertClaimItemProjection(legalBasis: ExactLegalBasisBindingV1): void {
    const projection = legalBasis.claimItemProjection;
    const interestStartDate =
      projection?.interestStartDate == null
        ? null
        : new Date(projection.interestStartDate);
    const interestRate =
      projection?.interestRate == null
        ? null
        : this.parseInterestRate(projection.interestRate);
    if (
      !projection ||
      !projection.itemType ||
      !projection.interestAccrualStatus ||
      !Array.isArray(projection.liableDebtorIds) ||
      !this.isOpaqueReferenceList(projection.liableDebtorIds)
    ) {
      throw new ClaimItemFormationAdmissionError('INVALID_FORMATION_CONTEXT');
    }
    if (
      (legalBasis.interestEligibility === 'ACCRUES' &&
        (projection.interestAccrualStatus !== 'ACCRUES' ||
          !projection.interestType ||
          !projection.interestStartDateProvenance ||
          (projection.interestStartDateProvenance !==
            'ENFORCEMENT_PROCEEDING_DATE' &&
            interestStartDate === null) ||
          (interestStartDate !== null &&
            !Number.isFinite(interestStartDate.getTime())) ||
          (interestRate !== null &&
            (!interestRate.isFinite() ||
              interestRate.decimalPlaces() > 2 ||
              interestRate.abs().greaterThan('999.99'))))) ||
      (legalBasis.interestEligibility === 'NO_INTEREST' &&
        (projection.interestAccrualStatus !== 'NO_INTEREST' ||
          projection.interestType !== null ||
          projection.interestRate !== null ||
          projection.interestStartDate !== null ||
          projection.interestStartDateProvenance !== null)) ||
      (legalBasis.interestEligibility === 'UNRESOLVED' &&
        projection.interestAccrualStatus !== 'UNKNOWN')
    ) {
      throw new ClaimItemFormationAdmissionError('INVALID_FORMATION_CONTEXT');
    }
  }

  private parseInterestRate(value: string): Prisma.Decimal {
    try {
      return new Prisma.Decimal(value);
    } catch {
      throw new ClaimItemFormationAdmissionError(
        'INVALID_FORMATION_CONTEXT',
      );
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
