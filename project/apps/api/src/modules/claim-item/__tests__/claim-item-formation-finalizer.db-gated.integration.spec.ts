import { randomUUID } from 'node:crypto';
import {
  OfficeApprovalExecutionStatus,
  OfficeApprovalStatus,
  PrismaClient,
} from '@prisma/client';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { AuditService } from '../../audit/audit.service';
import { DomainEventIngestService } from '../../icrabot/domain-event-ingest';
import { stableJsonHash } from '../../permission-diagnostics/guided-edge/canonical-json';
import { CLAIM_ITEM_HIGH_IMPACT_ACTION_CODE } from '../claim-item-approval.constants';
import {
  ClaimItemFormationOfficeApprovalAdapter,
} from '../formation-intent/claim-item-formation-office-approval.adapter';
import {
  CaseDocumentExactVersionResolverPort,
  HumanClaimItemFormationAuthorizationPort,
  LegalBasisExactVersionResolverPort,
  type ExactCaseDocumentSourceV1,
  type ExactLegalBasisBindingV1,
  type ResolveExactLegalBasisFailureCode,
} from '../formation-intent/claim-item-formation-resolver.ports';
import { HumanClaimItemFormationAdmissionService } from '../formation-intent/human-claim-item-formation-admission.service';
import {
  buildClaimItemFormationIntentChecksum,
  domainSeparatedFormationHash,
} from '../formation-intent/claim-item-formation-canonical';
import {
  CLAIM_ITEM_FORMATION_APPROVAL_REF_VERSION,
  CLAIM_ITEM_FORMATION_APPROVAL_TARGET_TYPE,
} from '../formation-intent/claim-item-formation-intent.contract';
import {
  type LegalBasisProjectionBindingPersistenceEnvelopeV1,
} from '../formation-intent/legal-basis-projection-binding-persistence';
import { createLegalBasisProjectionBindingV1 } from '../formation-intent/legal-basis-projection-binding.contract';
import { TransactionalClaimItemFormationFinalizerService } from '../formation-finalizer/transactional-claim-item-formation-finalizer.service';
import { syntheticProjectionBindingSource } from './claim-item-formation-projection-binding.fixture';

const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('RCV-CLAIM-FORM-P02-S08-I03 DB gate requires TEST_DATABASE_URL in CI.');
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;
const CREATED_AT = new Date('2026-07-23T09:00:00.000Z');
const DECIDED_AT = new Date('2026-07-23T10:00:00.000Z');
const EXECUTION_AT = new Date('2026-07-23T11:00:00.000Z');

describeWithDisposableDb('RCV-CLAIM-FORM-P02-S08-I03 transactional finalizer', () => {
  jest.setTimeout(90_000);

  const prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
  const audit = new AuditService(prisma as any);
  const atomicWriter = new ClaimItemFormationOfficeApprovalAdapter(prisma as any, audit);
  let tenantId: string;
  let caseId: string;
  let requesterUserId: string;
  let approverUserId: string;
  let basisBinding: ExactLegalBasisBindingV1;

  const hash = (value: string) => stableJsonHash({ value });

  beforeAll(async () => {
    await prisma.$connect();
    const suffix = randomUUID().slice(0, 8);
    tenantId = (
      await prisma.tenant.create({
        data: { name: 'I03 Finalizer Tenant', slug: `i03-finalizer-${suffix}` },
      })
    ).id;
    requesterUserId = (
      await prisma.user.create({
        data: {
          tenantId,
          email: `i03-requester-${suffix}@example.test`,
          name: 'I03',
          surname: 'Requester',
        },
      })
    ).id;
    approverUserId = (
      await prisma.user.create({
        data: {
          tenantId,
          email: `i03-approver-${suffix}@example.test`,
          name: 'I03',
          surname: 'Approver',
        },
      })
    ).id;
    caseId = (
      await prisma.case.create({
        data: {
          tenantId,
          fileNumber: `I03-${suffix}`,
          type: 'GENERAL_EXECUTION',
        },
      })
    ).id;
    basisBinding = {
      legalBasisCode: 'CONTRACTUAL_RECEIVABLE',
      legalBasisVersion: '1',
      legalBasisChecksum: hash('legal-basis'),
      registryReleaseId: 'legal-basis-release-1',
      registryReleaseChecksum: hash('release'),
      status: 'ACTIVE',
      effectiveFrom: '2020-01-01T00:00:00.000Z',
      effectiveTo: null,
      subtypeRecognized: true,
      componentCategory: 'PRINCIPAL',
      componentSubtypeCode: 'DEFAULT_INTEREST',
      componentSubtypeVersion: '1',
      componentSubtypeChecksum: hash('subtype'),
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
      resolutionHash: hash('legal-basis-resolution'),
      ...syntheticProjectionBindingSource({
        legalBasisCode: 'CONTRACTUAL_RECEIVABLE',
        componentCategory: 'PRINCIPAL',
      }),
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
    };
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function createSource(label: string): Promise<ExactCaseDocumentSourceV1> {
    const documentId = (
      await prisma.caseDocument.create({
        data: {
          caseId,
          documentType: 'OTHER',
          title: `I03 exact source ${label}`,
          isSourceDocument: true,
        },
      })
    ).id;
    return {
      tenantId,
      caseId,
      sourceType: 'CASE_DOCUMENT',
      documentId,
      versionId: `document-version-${label}`,
      version: '1',
      binaryContentHash: hash(`binary-${label}`),
      documentEnvelopeHash: hash(`envelope-${label}`),
      classificationHash: hash(`classification-${label}`),
      canonicalSourceFingerprint: hash(`fingerprint-${label}`),
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
      opaqueEvidenceRefs: [`evidence:document-${label}:v1`],
      resolutionContractVersion: 'DocumentSourceResolutionV1',
      resolutionHash: hash(`document-resolution-${label}`),
    };
  }

  async function approvedIntent(
    label: string,
    projectionBinding?: LegalBasisProjectionBindingPersistenceEnvelopeV1,
  ) {
    const sourceBinding = await createSource(label);
    const writer = projectionBinding
      ? ({
          createAtomic: (input: Parameters<typeof atomicWriter.createAtomic>[0]) =>
            atomicWriter.createAtomic({
              ...input,
              legalBasisProjectionBinding: projectionBinding,
            }),
        } as unknown as ClaimItemFormationOfficeApprovalAdapter)
      : atomicWriter;
    const admission = new HumanClaimItemFormationAdmissionService(
      { assertAuthorized: jest.fn(async () => undefined) } as unknown as HumanClaimItemFormationAuthorizationPort,
      { resolveExactVersion: jest.fn(async () => sourceBinding) } as unknown as CaseDocumentExactVersionResolverPort,
      { resolveExactVersion: jest.fn(async () => ({ ok: true, value: basisBinding })) } as unknown as LegalBasisExactVersionResolverPort,
      writer,
      { enabled: true, clock: () => new Date(CREATED_AT) },
    );
    const result = await admission.admit(
      {
        tenantId,
        actorUserId: requesterUserId,
        correlationId: `i03-correlation-${label}`,
        causationId: `i03-causation-${label}`,
      },
      {
        caseId,
        idempotencyKey: `i03-intent-${label}-${randomUUID()}`,
        source: {
          documentId: sourceBinding.documentId,
          requestedVersionId: sourceBinding.versionId,
        },
        component: { category: 'PRINCIPAL', subtypeCode: 'DEFAULT_INTEREST' },
        legalBasis: { code: 'CONTRACTUAL_RECEIVABLE', requestedVersion: '1' },
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
      },
    );
    await prisma.officeApprovalRequest.update({
      where: { id: result.approval.id },
      data: {
        status: OfficeApprovalStatus.APPROVED,
        approverUserId,
        decidedAt: DECIDED_AT,
      },
    });
    return { intent: result.intent, source: sourceBinding };
  }

  function finalizer(
    document: ExactCaseDocumentSourceV1,
    basis = basisBinding,
    domainEvent = new DomainEventIngestService(),
    basisResolverFailureCode?: ResolveExactLegalBasisFailureCode,
  ) {
    return new TransactionalClaimItemFormationFinalizerService(
      prisma as any,
      audit,
      domainEvent,
      { resolveExactVersion: jest.fn(async () => document) } as unknown as CaseDocumentExactVersionResolverPort,
      {
        resolveExactVersion: jest.fn(async () =>
          basisResolverFailureCode === undefined
            ? { ok: true, value: basis }
            : { ok: false, failure: { code: basisResolverFailureCode } },
        ),
      } as unknown as LegalBasisExactVersionResolverPort,
      { enabled: true, clock: () => new Date(EXECUTION_AT) },
    );
  }

  function exactProjectionBinding(): LegalBasisProjectionBindingPersistenceEnvelopeV1 {
    return createLegalBasisProjectionBindingV1({
      legalBasis: basisBinding,
      admittedAt: CREATED_AT.toISOString(),
    }).envelope;
  }

  function executionRefs(intent: { id: string; intentChecksum: string }) {
    const identity = domainSeparatedFormationHash(
      'ClaimItemFormationExecutionV1',
      {
        tenantId,
        formationIntentId: intent.id,
        intentChecksum: intent.intentChecksum,
      },
    );
    return {
      claimItemId: `claim-formation:${identity}`,
      snapshotId: `claim-snapshot:${identity}`,
      commandId: `claim-command:${identity}`,
    };
  }

  it('atomically creates the ClaimItem, immutable snapshot, audit/event/outbox and completion state', async () => {
    const { intent, source } = await approvedIntent('success');
    const result = await finalizer(source).finalize({ tenantId, formationIntentId: intent.id });
    const expected = executionRefs(intent);

    expect(result.replayed).toBe(false);
    expect(result.claimItemId).toBe(expected.claimItemId);
    expect(result.snapshotId).toBe(expected.snapshotId);
    const [claimItem, snapshot, approval, auditCount, timelineCount, outboxCount] =
      await Promise.all([
        prisma.claimItem.findUnique({ where: { id: result.claimItemId } }),
        prisma.claimFormationSnapshot.findUnique({ where: { id: result.snapshotId } }),
        prisma.officeApprovalRequest.findUnique({ where: { id: intent.approvalRequestId } }),
        prisma.auditLog.count({
          where: {
            tenantId,
            OR: [
              { action: 'CLAIM_ITEM_FORMATION_FINALIZED', entityId: result.claimItemId },
              { action: 'OFFICE_APPROVAL_EXECUTION_SUCCEEDED', entityId: intent.approvalRequestId },
            ],
          },
        }),
        prisma.icrabotTimelineEntry.count({
          where: { tenantId, caseId, type: 'CLAIM_ITEM_CREATED' },
        }),
        prisma.icrabotOutboxAction.count({
          where: { tenantId, caseId, actionType: 'EVENT_PUBLISHED:CLAIM_ITEM_CREATED' },
        }),
      ]);
    expect(claimItem).toMatchObject({
      originalAmount: expect.objectContaining({}),
      demandedAmount: expect.objectContaining({}),
      itemType: 'PRINCIPAL',
      sourceDocumentId: source.documentId,
      createdById: requesterUserId,
    });
    expect(claimItem?.originalAmount.toFixed(2)).toBe('100.00');
    expect(claimItem?.demandedAmount.toFixed(2)).toBe('80.00');
    expect(snapshot).toMatchObject({
      formationIntentId: intent.id,
      claimItemId: result.claimItemId,
      intentChecksum: intent.intentChecksum,
      snapshotVersion: 1,
      legalBasisProjectionBindingContractVersion: '1',
      legalBasisProjectionBindingCanonicalPayload: expect.stringContaining(
        'RCV-CLAIM-LEGAL-BASIS-PROJECTION-BINDING',
      ),
      legalBasisProjectionBindingChecksum: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(approval?.executionStatus).toBe(OfficeApprovalExecutionStatus.SUCCEEDED);
    expect(auditCount).toBe(2);
    expect(timelineCount).toBeGreaterThanOrEqual(1);
    expect(outboxCount).toBeGreaterThanOrEqual(1);
  });

  it('persists an exact bound snapshot and rejects every intent/snapshot binding mismatch', async () => {
    const binding = exactProjectionBinding();
    const { intent, source } = await approvedIntent('projection-binding', binding);
    const result = await finalizer(source).finalize({
      tenantId,
      formationIntentId: intent.id,
    });
    const sourceSnapshot = await prisma.claimFormationSnapshot.findUniqueOrThrow({
      where: { id: result.snapshotId },
    });
    expect(sourceSnapshot).toMatchObject({
      legalBasisProjectionBindingContractVersion: binding.contractVersion,
      legalBasisProjectionBindingCanonicalPayload: binding.canonicalPayload,
      legalBasisProjectionBindingChecksum: binding.checksum,
    });
    await expect(
      prisma.$executeRawUnsafe(
        `UPDATE "ClaimFormationSnapshot" SET "legalBasisProjectionBindingCanonicalPayload" = '{}' WHERE "id" = '${sourceSnapshot.id}'`,
      ),
    ).rejects.toThrow(/immutable_violation/);

    const createTarget = async (
      label: string,
      intentBinding: LegalBasisProjectionBindingPersistenceEnvelopeV1 | undefined,
    ) => {
      const suffix = randomUUID();
      const sourceIdentityHash = hash(`pb01-source-identity-${label}-${suffix}`);
      const targetIntent = await prisma.claimItemFormationIntent.create({
        data: {
          ...intent,
          id: `pb01-intent-${suffix}`,
          idempotencyKey: `pb01-idempotency-${suffix}`,
          approvalRequestId: `pb01-approval-${suffix}`,
          sourceId: `pb01-document-${suffix}`,
          sourceVersionId: `pb01-document-version-${suffix}`,
          sourceIdentityHash,
          canonicalSourceFingerprint: hash(`pb01-fingerprint-${suffix}`),
          sourceResolutionHash: hash(`pb01-source-resolution-${suffix}`),
          correlationId: `pb01-correlation-${suffix}`,
          legalBasisProjectionBindingContractVersion:
            intentBinding?.contractVersion ?? null,
          legalBasisProjectionBindingCanonicalPayload:
            intentBinding?.canonicalPayload ?? null,
          legalBasisProjectionBindingChecksum: intentBinding?.checksum ?? null,
        } as any,
      });
      const claimItem = await prisma.claimItem.create({
        data: {
          tenantId,
          caseId,
          itemType: 'PRINCIPAL',
          originalAmount: 100,
          demandedAmount: 80,
          amount: 80,
          currency: 'TRY',
          liableDebtorIds: [],
        },
      });
      return { targetIntent, claimItem };
    };

    const insertSnapshot = async (
      label: string,
      target: Awaited<ReturnType<typeof createTarget>>,
      overrides: Record<string, unknown>,
    ) =>
      prisma.claimFormationSnapshot.create({
        data: {
          ...sourceSnapshot,
          id: `pb01-snapshot-${label}-${randomUUID()}`,
          claimItemId: target.claimItem.id,
          formationIntentId: target.targetIntent.id,
          approvalRequestId: target.targetIntent.approvalRequestId,
          sourceId: target.targetIntent.sourceId,
          sourceVersionId: target.targetIntent.sourceVersionId,
          sourceIdentityHash: target.targetIntent.sourceIdentityHash,
          canonicalSourceFingerprint: target.targetIntent.canonicalSourceFingerprint,
          sourceResolutionHash: target.targetIntent.sourceResolutionHash,
          correlationId: target.targetIntent.correlationId,
          commandId: `pb01-command-${randomUUID()}`,
          ...overrides,
        } as any,
      });

    const exactTarget = await createTarget('exact', binding);
    await expect(
      insertSnapshot('exact', exactTarget, {}),
    ).resolves.toBeDefined();

    const mismatchCases: Array<[
      string,
      LegalBasisProjectionBindingPersistenceEnvelopeV1 | undefined,
      Record<string, unknown>,
    ]> = [
      [
        'bound-to-unbound',
        binding,
        {
          legalBasisProjectionBindingContractVersion: null,
          legalBasisProjectionBindingCanonicalPayload: null,
          legalBasisProjectionBindingChecksum: null,
        },
      ],
      [
        'unbound-to-bound',
        undefined,
        {
          legalBasisProjectionBindingContractVersion: binding.contractVersion,
          legalBasisProjectionBindingCanonicalPayload: binding.canonicalPayload,
          legalBasisProjectionBindingChecksum: binding.checksum,
        },
      ],
      [
        'version',
        binding,
        { legalBasisProjectionBindingContractVersion: '2' },
      ],
      [
        'partial',
        binding,
        {
          legalBasisProjectionBindingCanonicalPayload: null,
          legalBasisProjectionBindingChecksum: null,
        },
      ],
      [
        'blank-payload',
        binding,
        { legalBasisProjectionBindingCanonicalPayload: '   ' },
      ],
      [
        'bad-checksum-format',
        binding,
        { legalBasisProjectionBindingChecksum: binding.checksum.toUpperCase() },
      ],
      [
        'payload',
        binding,
        { legalBasisProjectionBindingCanonicalPayload: '{}' },
      ],
      [
        'checksum',
        binding,
        { legalBasisProjectionBindingChecksum: '0'.repeat(64) },
      ],
    ];
    for (const [label, intentBinding, overrides] of mismatchCases) {
      const target = await createTarget(label, intentBinding);
      await expect(insertSnapshot(label, target, overrides)).rejects.toThrow(
        /intent_mismatch|projection_binding/,
      );
      expect(
        await prisma.claimFormationSnapshot.count({
          where: { formationIntentId: target.targetIntent.id },
        }),
      ).toBe(0);
    }
  });

  it('serializes concurrent retries and returns one canonical ClaimItem/snapshot', async () => {
    const { intent, source } = await approvedIntent('concurrent');
    const service = finalizer(source);
    const results = await Promise.all([
      service.finalize({ tenantId, formationIntentId: intent.id }),
      service.finalize({ tenantId, formationIntentId: intent.id }),
    ]);

    expect(new Set(results.map((result) => result.claimItemId)).size).toBe(1);
    expect(new Set(results.map((result) => result.snapshotId)).size).toBe(1);
    expect(results.filter((result) => result.replayed)).toHaveLength(1);
    expect(
      await prisma.claimFormationSnapshot.count({
        where: { tenantId, formationIntentId: intent.id },
      }),
    ).toBe(1);
  });

  it('rolls back every write when event/outbox continuity fails', async () => {
    const { intent, source } = await approvedIntent('rollback');
    const expected = executionRefs(intent);
    const failingEvents = {
      appendInTransaction: jest.fn(async () => {
        throw new Error('forced-event-failure');
      }),
    } as unknown as DomainEventIngestService;

    await expect(
      finalizer(source, basisBinding, failingEvents).finalize({
        tenantId,
        formationIntentId: intent.id,
      }),
    ).rejects.toThrow('forced-event-failure');

    expect(
      await prisma.claimFormationSnapshot.count({
        where: { tenantId, formationIntentId: intent.id },
      }),
    ).toBe(0);
    expect(
      await prisma.claimItem.count({
        where: { id: expected.claimItemId, tenantId, caseId },
      }),
    ).toBe(0);
    expect(
      await prisma.auditLog.count({
        where: { tenantId, entityId: expected.claimItemId },
      }),
    ).toBe(0);
    expect(
      await prisma.icrabotOutboxAction.count({
        where: { idempotencyKey: `evt:${expected.commandId}` },
      }),
    ).toBe(0);
    expect(
      (
        await prisma.officeApprovalRequest.findUnique({
          where: { id: intent.approvalRequestId },
        })
      )?.executionStatus,
    ).toBe(OfficeApprovalExecutionStatus.NOT_RUN);

    const retry = await finalizer(source).finalize({
      tenantId,
      formationIntentId: intent.id,
    });
    expect(retry).toMatchObject({
      claimItemId: expected.claimItemId,
      snapshotId: expected.snapshotId,
      replayed: false,
    });
  });

  it('fails before writes when exact document or legal-basis versions drift', async () => {
    const { intent: documentIntent, source: documentSource } =
      await approvedIntent('document-drift');
    await expect(
      finalizer(
        { ...documentSource, canonicalSourceFingerprint: hash('drifted') },
        basisBinding,
      ).finalize({ tenantId, formationIntentId: documentIntent.id }),
    ).rejects.toMatchObject({ code: 'FORMATION_SOURCE_MISMATCH' });

    const { intent: basisIntent, source: basisSource } = await approvedIntent('basis-drift');
    await expect(
      finalizer(basisSource, {
        ...basisBinding,
        legalBasisChecksum: hash('drifted-basis'),
      }).finalize({ tenantId, formationIntentId: basisIntent.id }),
    ).rejects.toMatchObject({ code: 'FORMATION_LEGAL_BASIS_MISMATCH' });

    expect(
      await prisma.claimFormationSnapshot.count({
        where: { tenantId, formationIntentId: { in: [documentIntent.id, basisIntent.id] } },
      }),
    ).toBe(0);
  });

  it('rejects a legacy unbound intent before resolver or financial writes', async () => {
    const { intent: boundIntent, source } = await approvedIntent('legacy-unbound-source');
    const suffix = randomUUID();
    const legacyIntentId = `legacy-unbound-intent-${suffix}`;
    const legacyApprovalId = `legacy-unbound-approval-${suffix}`;
    const legacyIdempotencyKey = `legacy-unbound-idempotency-${suffix}`;
    const legacyIntent = {
      ...boundIntent,
      id: legacyIntentId,
      idempotencyKey: legacyIdempotencyKey,
      approvalRequestId: legacyApprovalId,
      correlationId: `legacy-unbound-correlation-${suffix}`,
      causationId: `legacy-unbound-causation-${suffix}`,
      legalBasisProjectionBindingContractVersion: null,
      legalBasisProjectionBindingCanonicalPayload: null,
      legalBasisProjectionBindingChecksum: null,
    };
    const intentChecksum = buildClaimItemFormationIntentChecksum(
      legacyIntent.contractVersion,
      legacyIntent,
    );
    const savedIntent = {
      version: CLAIM_ITEM_FORMATION_APPROVAL_REF_VERSION,
      tenantId,
      caseId,
      formationIntentId: legacyIntentId,
      intentChecksum,
      sourceIdentityHash: legacyIntent.sourceIdentityHash,
    };
    const approvalReferenceHash = stableJsonHash(savedIntent);

    await prisma.officeApprovalRequest.create({
      data: {
        id: legacyApprovalId,
        tenantId,
        actionCode: CLAIM_ITEM_HIGH_IMPACT_ACTION_CODE,
        targetType: CLAIM_ITEM_FORMATION_APPROVAL_TARGET_TYPE,
        targetRef: legacyIntentId,
        requesterUserId,
        approverUserId,
        status: OfficeApprovalStatus.APPROVED,
        executionStatus: OfficeApprovalExecutionStatus.NOT_RUN,
        savedIntent,
        payloadHash: approvalReferenceHash,
        idempotencyKey: `claim-item-formation:${legacyIdempotencyKey}`,
        createdAt: CREATED_AT,
        decidedAt: DECIDED_AT,
        expiresAt: legacyIntent.expiresAt,
      },
    });
    await prisma.claimItemFormationIntent.create({
      data: {
        ...legacyIntent,
        intentChecksum,
        approvalReferenceHash,
      } as any,
    });

    const documentResolver = {
      resolveExactVersion: jest.fn(async () => source),
    } as unknown as CaseDocumentExactVersionResolverPort;
    const legalBasisResolver = {
      resolveExactVersion: jest.fn(async () => ({ ok: true, value: basisBinding })),
    } as unknown as LegalBasisExactVersionResolverPort;
    const service = new TransactionalClaimItemFormationFinalizerService(
      prisma as any,
      audit,
      new DomainEventIngestService(),
      documentResolver,
      legalBasisResolver,
      { enabled: true, clock: () => new Date(EXECUTION_AT) },
    );

    await expect(
      service.finalize({ tenantId, formationIntentId: legacyIntentId }),
    ).rejects.toMatchObject({ code: 'FORMATION_LEGAL_BASIS_BINDING_REQUIRED' });
    expect(documentResolver.resolveExactVersion).not.toHaveBeenCalled();
    expect(legalBasisResolver.resolveExactVersion).not.toHaveBeenCalled();
    expect(
      await prisma.claimFormationSnapshot.count({
        where: { tenantId, formationIntentId: legacyIntentId },
      }),
    ).toBe(0);
    expect(
      await prisma.claimItem.count({
        where: { id: executionRefs({ id: legacyIntentId, intentChecksum }).claimItemId },
      }),
    ).toBe(0);
  });

  // S08-D02-R01 (RECEIVABLE-GOVERNANCE.md §23.27.5, PR #1570): any resolver-level
  // disposition maps uniformly to FORMATION_LEGAL_BASIS_MISMATCH with no partial
  // write — one representative code proves the fail-closed branch end-to-end;
  // all nine share the exact same handling (no per-code finalizer logic).
  it('resolver-level disposition (e.g. AUTHORITY_UNAVAILABLE) fails closed with no partial write', async () => {
    const { intent, source } = await approvedIntent('legal-basis-resolver-failure');
    await expect(
      finalizer(source, basisBinding, undefined, 'AUTHORITY_UNAVAILABLE').finalize({
        tenantId,
        formationIntentId: intent.id,
      }),
    ).rejects.toMatchObject({ code: 'FORMATION_LEGAL_BASIS_MISMATCH' });
    expect(
      await prisma.claimFormationSnapshot.count({
        where: { tenantId, formationIntentId: intent.id },
      }),
    ).toBe(0);
    expect(
      await prisma.claimItem.count({
        where: { id: executionRefs(intent).claimItemId, tenantId, caseId },
      }),
    ).toBe(0);
  });

  it('parity fix (D1): rejects a REVOKED legal basis at finalization time — previously unenforced', async () => {
    const { intent, source } = await approvedIntent('legal-basis-revoked');
    await expect(
      finalizer(source, { ...basisBinding, status: 'REVOKED' }).finalize({
        tenantId,
        formationIntentId: intent.id,
      }),
    ).rejects.toMatchObject({ code: 'FORMATION_LEGAL_BASIS_MISMATCH' });
    expect(
      await prisma.claimFormationSnapshot.count({
        where: { tenantId, formationIntentId: intent.id },
      }),
    ).toBe(0);
  });

  it('D1: accepts a SUPERSEDED legal basis at finalization when the exact bound version/checksum still matches', async () => {
    const { intent, source } = await approvedIntent('legal-basis-superseded');
    const result = await finalizer(source, { ...basisBinding, status: 'SUPERSEDED' }).finalize({
      tenantId,
      formationIntentId: intent.id,
    });
    expect(result.replayed).toBe(false);
    expect(await prisma.claimItem.findUnique({ where: { id: result.claimItemId } })).not.toBeNull();
  });

  it('fails before writes when approval target binding is not exact', async () => {
    const { intent, source } = await approvedIntent('approval-drift');
    await prisma.officeApprovalRequest.update({
      where: { id: intent.approvalRequestId },
      data: { targetRef: 'formation-intent:tampered' },
    });

    await expect(
      finalizer(source).finalize({ tenantId, formationIntentId: intent.id }),
    ).rejects.toMatchObject({ code: 'FORMATION_APPROVAL_MISMATCH' });
    expect(
      await prisma.claimFormationSnapshot.count({
        where: { tenantId, formationIntentId: intent.id },
      }),
    ).toBe(0);
    expect(
      await prisma.claimItem.count({
        where: { id: executionRefs(intent).claimItemId, tenantId, caseId },
      }),
    ).toBe(0);
  });

  it('treats an expired unconsumed intent as inactive and writes nothing', async () => {
    const { intent, source } = await approvedIntent('expired');
    const expiredFinalizer = new TransactionalClaimItemFormationFinalizerService(
      prisma as any,
      audit,
      new DomainEventIngestService(),
      { resolveExactVersion: jest.fn(async () => source) } as unknown as CaseDocumentExactVersionResolverPort,
      { resolveExactVersion: jest.fn(async () => ({ ok: true, value: basisBinding })) } as unknown as LegalBasisExactVersionResolverPort,
      {
        enabled: true,
        clock: () => new Date(intent.expiresAt.getTime() + 1),
      },
    );

    await expect(
      expiredFinalizer.finalize({ tenantId, formationIntentId: intent.id }),
    ).rejects.toMatchObject({ code: 'FORMATION_INTENT_EXPIRED' });
    expect(
      await prisma.claimFormationSnapshot.count({
        where: { tenantId, formationIntentId: intent.id },
      }),
    ).toBe(0);
    expect(
      await prisma.claimItem.count({
        where: { id: executionRefs(intent).claimItemId, tenantId, caseId },
      }),
    ).toBe(0);
  });

  it('is default-disabled and performs no database lookup or write', async () => {
    const disabled = new TransactionalClaimItemFormationFinalizerService(
      prisma as any,
      audit,
      new DomainEventIngestService(),
      { resolveExactVersion: jest.fn() } as unknown as CaseDocumentExactVersionResolverPort,
      { resolveExactVersion: jest.fn() } as unknown as LegalBasisExactVersionResolverPort,
    );
    await expect(
      disabled.finalize({ tenantId, formationIntentId: 'intent-disabled' }),
    ).rejects.toMatchObject({ code: 'FINALIZER_DISABLED' });
  });
});
