import { stableJsonHash } from '../../permission-diagnostics/guided-edge/canonical-json';
import {
  ClaimItemFormationAdmissionError,
  CLAIM_ITEM_FORMATION_APPROVAL_REF_VERSION,
  CLAIM_ITEM_FORMATION_EXPIRY_MS,
  parseHumanClaimItemFormationCommand,
} from '../formation-intent/claim-item-formation-intent.contract';
import {
  CaseDocumentExactVersionResolverPort,
  HumanClaimItemFormationAuthorizationPort,
  LegalBasisExactVersionResolverPort,
  type ExactCaseDocumentSourceV1,
  type ExactLegalBasisBindingV1,
} from '../formation-intent/claim-item-formation-resolver.ports';
import { ClaimItemFormationOfficeApprovalAdapter } from '../formation-intent/claim-item-formation-office-approval.adapter';
import { HumanClaimItemFormationAdmissionService } from '../formation-intent/human-claim-item-formation-admission.service';

const NOW = new Date('2026-07-23T12:00:00.000Z');
const TENANT = 'tenant-formation';
const CASE = 'case-formation';
const ACTOR = 'user-requester';
const HASH = (value: string) => stableJsonHash({ value });

function command(overrides: Record<string, unknown> = {}) {
  return {
    caseId: CASE,
    idempotencyKey: 'formation-command-1',
    source: {
      documentId: 'document-1',
      requestedVersionId: 'document-version-1',
    },
    component: {
      category: 'PRINCIPAL',
      subtypeCode: 'CONTRACT_PRINCIPAL',
    },
    legalBasis: {
      code: 'CONTRACTUAL_RECEIVABLE',
      requestedVersion: '1',
    },
    money: {
      originalAmountMinor: '10000',
      demandedAmountMinor: '8000',
      currency: 'TRY',
      minorUnit: 2,
    },
    effectiveAt: '2026-07-22T00:00:00.000Z',
    liabilityContext: {
      payload: { liableDebtorRefs: ['debtor:opaque-1'], jointLiability: false },
    },
    ...overrides,
  };
}

function source(overrides: Partial<ExactCaseDocumentSourceV1> = {}): ExactCaseDocumentSourceV1 {
  return {
    tenantId: TENANT,
    caseId: CASE,
    sourceType: 'CASE_DOCUMENT',
    documentId: 'document-1',
    versionId: 'document-version-1',
    version: '1',
    binaryContentHash: HASH('binary'),
    documentEnvelopeHash: HASH('envelope'),
    classificationHash: HASH('classification'),
    canonicalSourceFingerprint: HASH('fingerprint'),
    fingerprintAlgorithm: 'SHA-256',
    fingerprintVersion: 'DocumentFingerprintV1',
    fingerprintVerified: true,
    documentType: 'CONTRACT',
    claimItemDocumentSourceType: 'SOZLESME',
    documentClassificationVersion: 'DocumentClassificationV1',
    lifecycleStatus: 'ACTIVE',
    availabilityStatus: 'AVAILABLE',
    availableForFormation: true,
    evidenceClasses: ['SIGNED_CONTRACT'],
    opaqueEvidenceRefs: ['evidence:document-1:v1'],
    resolutionContractVersion: 'DocumentSourceResolutionV1',
    resolutionHash: HASH('document-resolution'),
    ...overrides,
  };
}

function legalBasis(
  overrides: Partial<ExactLegalBasisBindingV1> = {},
): ExactLegalBasisBindingV1 {
  return {
    legalBasisCode: 'CONTRACTUAL_RECEIVABLE',
    legalBasisVersion: '1',
    legalBasisChecksum: HASH('legal-basis'),
    registryReleaseId: 'legal-basis-release-1',
    registryReleaseChecksum: HASH('release'),
    status: 'ACTIVE',
    effectiveFrom: '2020-01-01T00:00:00.000Z',
    effectiveTo: null,
    subtypeRecognized: true,
    componentCategory: 'PRINCIPAL',
    componentSubtypeCode: 'CONTRACT_PRINCIPAL',
    componentSubtypeVersion: '1',
    componentSubtypeChecksum: HASH('subtype'),
    allowedDocumentTypes: ['CONTRACT'],
    requiredEvidenceClasses: ['SIGNED_CONTRACT'],
    liabilityCompatible: true,
    interestEligibility: 'NO_INTEREST',
    interestPolicyRef: null,
    interestPolicyVersion: null,
    ruleRef: null,
    ruleVersion: null,
    legalReviewRequired: false,
    resolutionContractVersion: 'LegalBasisResolutionV1',
    resolutionHash: HASH('legal-basis-resolution'),
    claimItemProjection: {
      itemType: 'PRINCIPAL',
      interestAccrualStatus: 'NO_INTEREST',
      interestType: null,
      interestRate: null,
      interestStartDate: null,
      interestStartDateProvenance: null,
      isAllDebtorsLiable: false,
      liableDebtorIds: ['debtor:opaque-1'],
    },
    ...overrides,
  };
}

function buildHarness(options: {
  enabled?: boolean;
  source?: ExactCaseDocumentSourceV1 | null;
  legalBasis?: ExactLegalBasisBindingV1 | null;
} = {}) {
  const order: string[] = [];
  const authorization = {
    assertAuthorized: jest.fn(async () => {
      order.push('authorization');
    }),
  } as unknown as HumanClaimItemFormationAuthorizationPort;
  const documentResolver = {
    resolveExactVersion: jest.fn(async () => {
      order.push('document');
      return options.source === undefined ? source() : options.source;
    }),
  } as unknown as CaseDocumentExactVersionResolverPort;
  const basisResolver = {
    resolveExactVersion: jest.fn(async () => {
      order.push('legal-basis');
      const value = options.legalBasis === undefined ? legalBasis() : options.legalBasis;
      return value === null
        ? { ok: false as const, failure: { code: 'NOT_FOUND' as const } }
        : { ok: true as const, value };
    }),
  } as unknown as LegalBasisExactVersionResolverPort;
  const result = {
    intent: { id: 'intent-1' },
    approval: { id: 'approval-1' },
    replayed: false,
  };
  const atomicWriter = {
    createAtomic: jest.fn(async () => {
      order.push('atomic-write');
      return result;
    }),
  } as unknown as ClaimItemFormationOfficeApprovalAdapter;
  const service = new HumanClaimItemFormationAdmissionService(
    authorization,
    documentResolver,
    basisResolver,
    atomicWriter,
    { enabled: options.enabled ?? true, clock: () => new Date(NOW) },
  );
  return { service, authorization, documentResolver, basisResolver, atomicWriter, order, result };
}

describe('RCV-CLAIM-FORM-P02-S08-I02B typed formation intent admission', () => {
  it('is default-disabled and performs no authorization, resolution or write', async () => {
    const harness = buildHarness({ enabled: false });

    await expect(
      harness.service.admit(
        { tenantId: TENANT, actorUserId: ACTOR, correlationId: 'correlation-1' },
        command(),
      ),
    ).rejects.toMatchObject({ code: 'FORMATION_CONTEXT_REQUIRED' });

    expect(harness.authorization.assertAuthorized).not.toHaveBeenCalled();
    expect(harness.documentResolver.resolveExactVersion).not.toHaveBeenCalled();
    expect(harness.basisResolver.resolveExactVersion).not.toHaveBeenCalled();
    expect(harness.atomicWriter.createAtomic).not.toHaveBeenCalled();
  });

  it('authorizes first, resolves exact bindings, then submits one canonical atomic write', async () => {
    const harness = buildHarness();
    const context = {
      tenantId: TENANT,
      actorUserId: ACTOR,
      correlationId: 'correlation-1',
      causationId: 'causation-1',
    };

    await expect(harness.service.admit(context, command())).resolves.toBe(harness.result);

    expect(harness.order).toEqual(['authorization', 'document', 'legal-basis', 'atomic-write']);
    expect(harness.authorization.assertAuthorized).toHaveBeenCalledWith({
      tenantId: TENANT,
      caseId: CASE,
      actorUserId: ACTOR,
    });
    const persisted = (harness.atomicWriter.createAtomic as jest.Mock).mock.calls[0][0];
    expect(persisted).toMatchObject({
      tenantId: TENANT,
      caseId: CASE,
      requesterUserId: ACTOR,
      sourceType: 'CASE_DOCUMENT',
      sourceId: 'document-1',
      sourceVersionId: 'document-version-1',
      componentCategory: 'PRINCIPAL',
      componentSubtypeCode: 'CONTRACT_PRINCIPAL',
      legalBasisCode: 'CONTRACTUAL_RECEIVABLE',
      legalBasisVersion: '1',
      originalAmountMinor: 10_000n,
      demandedAmountMinor: 8_000n,
      currency: 'TRY',
      minorUnit: 2,
      correlationId: 'correlation-1',
      causationId: 'causation-1',
    });
    expect(persisted.expiresAt.getTime() - persisted.createdAt.getTime()).toBe(
      CLAIM_ITEM_FORMATION_EXPIRY_MS,
    );
    for (const field of [
      'normalizedInputChecksum',
      'intentChecksum',
      'sourceIdentityHash',
      'liabilityContextHash',
      'evidenceRefsHash',
      'provenanceHash',
    ]) {
      expect(persisted[field]).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it.each([
    ['OTHER', 'UNSUPPORTED_COMPONENT'],
    ['UNKNOWN', 'UNSUPPORTED_COMPONENT'],
  ])('rejects unsupported category %s before any resolver or write', async (category, code) => {
    const harness = buildHarness();
    const invalid = command({
      component: { category, subtypeCode: 'CONTRACT_PRINCIPAL' },
    });

    await expect(
      harness.service.admit(
        { tenantId: TENANT, actorUserId: ACTOR, correlationId: 'correlation-1' },
        invalid,
      ),
    ).rejects.toMatchObject({ code });
    expect(harness.documentResolver.resolveExactVersion).not.toHaveBeenCalled();
    expect(harness.atomicWriter.createAtomic).not.toHaveBeenCalled();
  });

  it.each([
    [{ originalAmountMinor: 100.5, demandedAmountMinor: '100', currency: 'TRY', minorUnit: 2 }],
    [{ originalAmountMinor: '100', demandedAmountMinor: 100, currency: 'TRY', minorUnit: 2 }],
    [{ originalAmountMinor: '100.00', demandedAmountMinor: '100', currency: 'TRY', minorUnit: 2 }],
  ])('rejects non-exact minor-unit money without silent rounding', async (money) => {
    const harness = buildHarness();
    await expect(
      harness.service.admit(
        { tenantId: TENANT, actorUserId: ACTOR, correlationId: 'correlation-1' },
        command({ money }),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_FORMATION_CONTEXT' });
    expect(harness.atomicWriter.createAtomic).not.toHaveBeenCalled();
  });

  it.each([
    [null, 'FORMATION_SOURCE_UNAVAILABLE'],
    [source({ availableForFormation: false }), 'FORMATION_SOURCE_UNAVAILABLE'],
    [source({ fingerprintVerified: false }), 'SOURCE_FINGERPRINT_MISMATCH'],
    [source({ canonicalSourceFingerprint: 'bad' }), 'SOURCE_FINGERPRINT_MISMATCH'],
  ])('fails closed for unavailable or unverifiable exact source', async (resolved, code) => {
    const harness = buildHarness({ source: resolved as ExactCaseDocumentSourceV1 | null });
    await expect(
      harness.service.admit(
        { tenantId: TENANT, actorUserId: ACTOR, correlationId: 'correlation-1' },
        command(),
      ),
    ).rejects.toMatchObject({ code });
    expect(harness.basisResolver.resolveExactVersion).not.toHaveBeenCalled();
    expect(harness.atomicWriter.createAtomic).not.toHaveBeenCalled();
  });

  it.each([
    [null, 'LEGAL_BASIS_VERSION_NOT_FOUND'],
    [legalBasis({ status: 'REVOKED' }), 'LEGAL_BASIS_NOT_EFFECTIVE'],
    // D1: SUPERSEDED is admissible at FINALIZATION but never at ADMISSION.
    [legalBasis({ status: 'SUPERSEDED' }), 'LEGAL_BASIS_NOT_EFFECTIVE'],
    [legalBasis({ subtypeRecognized: false }), 'UNSUPPORTED_COMPONENT'],
    [legalBasis({ componentCategory: 'COST' }), 'LEGAL_BASIS_COMPONENT_MISMATCH'],
    [legalBasis({ requiredEvidenceClasses: ['COURT_ORDER'] }), 'LEGAL_BASIS_EVIDENCE_MISMATCH'],
    [legalBasis({ legalReviewRequired: true }), 'LEGAL_REVIEW_REQUIRED'],
    [legalBasis({ liabilityCompatible: false }), 'INVALID_FORMATION_CONTEXT'],
    // Parity fix: itemType OTHER is now rejected at admission time too, so it
    // can never reach finalization as an unfinalizable dead end.
    [
      legalBasis({
        claimItemProjection: { ...legalBasis().claimItemProjection, itemType: 'OTHER' as any },
      }),
      'INVALID_FORMATION_CONTEXT',
    ],
  ])('fails closed for unresolved or incompatible legal basis', async (resolved, code) => {
    const harness = buildHarness({ legalBasis: resolved as ExactLegalBasisBindingV1 | null });
    await expect(
      harness.service.admit(
        { tenantId: TENANT, actorUserId: ACTOR, correlationId: 'correlation-1' },
        command(),
      ),
    ).rejects.toMatchObject({ code });
    expect(harness.atomicWriter.createAtomic).not.toHaveBeenCalled();
  });

  it('rejects client-supplied server authority/version/checksum fields', () => {
    expect(() =>
      parseHumanClaimItemFormationCommand(
        command({
          tenantId: TENANT,
          actorUserId: ACTOR,
          intentChecksum: HASH('client-forged'),
          version: CLAIM_ITEM_FORMATION_APPROVAL_REF_VERSION,
        }),
      ),
    ).toThrow(ClaimItemFormationAdmissionError);
  });
});
