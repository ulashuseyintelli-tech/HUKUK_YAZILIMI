import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { stableJsonHash } from '../../permission-diagnostics/guided-edge/canonical-json';
import type { HumanClaimItemFormationAdmissionContext } from '../formation-intent/claim-item-formation-intent.contract';
import { ClaimItemFormationOfficeApprovalAdapter } from '../formation-intent/claim-item-formation-office-approval.adapter';
import {
  CaseDocumentExactVersionResolverPort,
  HumanClaimItemFormationAuthorizationPort,
  LegalBasisExactVersionResolverPort,
  type ExactCaseDocumentSourceV1,
  type ExactLegalBasisBindingV1,
} from '../formation-intent/claim-item-formation-resolver.ports';
import { HumanClaimItemFormationAdmissionService } from '../formation-intent/human-claim-item-formation-admission.service';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';

const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('RCV-CLAIM-FORM-P02-S08-I02B DB gate blocked: TEST_DATABASE_URL is required.');
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;
const HASH = (value: string) => stableJsonHash({ value });

describeWithDisposableDb(
  'RCV-CLAIM-FORM-P02-S08-I02B — atomic intent + OfficeApproval disposable PostgreSQL',
  () => {
    jest.setTimeout(60_000);

    const prisma = new PrismaService({ datasources: { db: { url: TEST_DB_URL } } });
    let tenantId: string;
    let caseId: string;
    let requesterUserId: string;

    beforeAll(async () => {
      await prisma.$connect();
      const suffix = randomUUID().slice(0, 8);
      tenantId = (
        await prisma.tenant.create({
          data: { name: 'I02B Tenant', slug: `i02b-${suffix}` },
        })
      ).id;
      requesterUserId = (
        await prisma.user.create({
          data: {
            tenantId,
            email: `i02b-requester-${suffix}@example.test`,
            name: 'I02B',
            surname: 'Requester',
          },
        })
      ).id;
      caseId = (
        await prisma.case.create({
          data: {
            tenantId,
            fileNumber: `I02B-${suffix}`,
            type: 'GENERAL_EXECUTION',
          },
        })
      ).id;
    });

    afterAll(async () => {
      await prisma.$disconnect();
    });

    function source(overrides: Partial<ExactCaseDocumentSourceV1> = {}) {
      return {
        tenantId,
        caseId,
        sourceType: 'CASE_DOCUMENT',
        documentId: 'document-i02b',
        versionId: 'document-i02b-version-1',
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
        opaqueEvidenceRefs: ['evidence:document-i02b:v1'],
        resolutionContractVersion: 'DocumentSourceResolutionV1',
        resolutionHash: HASH('document-resolution'),
        ...overrides,
      } satisfies ExactCaseDocumentSourceV1;
    }

    function legalBasis(overrides: Partial<ExactLegalBasisBindingV1> = {}) {
      return {
        legalBasisCode: 'CONTRACTUAL_RECEIVABLE',
        legalBasisVersion: '1',
        legalBasisChecksum: HASH('basis'),
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
        resolutionHash: HASH('basis-resolution'),
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
      } satisfies ExactLegalBasisBindingV1;
    }

    function command(idempotencyKey: string, demandedAmountMinor = '8000') {
      return {
        caseId,
        idempotencyKey,
        source: {
          documentId: 'document-i02b',
          requestedVersionId: 'document-i02b-version-1',
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
          demandedAmountMinor,
          currency: 'TRY',
          minorUnit: 2,
        },
        effectiveAt: '2026-07-22T00:00:00.000Z',
        liabilityContext: {
          payload: { liableDebtorRefs: ['debtor:opaque-1'], jointLiability: false },
        },
      };
    }

    function context(): HumanClaimItemFormationAdmissionContext {
      return {
        tenantId,
        actorUserId: requesterUserId,
        correlationId: `correlation-${randomUUID()}`,
      };
    }

    function service(options: {
      source?: ExactCaseDocumentSourceV1 | null;
      audit?: AuditService;
    } = {}) {
      const authorization = {
        assertAuthorized: jest.fn().mockResolvedValue(undefined),
      } as unknown as HumanClaimItemFormationAuthorizationPort;
      const documentResolver = {
        resolveExactVersion: jest.fn().mockResolvedValue(
          options.source === undefined ? source() : options.source,
        ),
      } as unknown as CaseDocumentExactVersionResolverPort;
      const basisResolver = {
        resolveExactVersion: jest.fn().mockResolvedValue({ ok: true, value: legalBasis() }),
      } as unknown as LegalBasisExactVersionResolverPort;
      const writer = new ClaimItemFormationOfficeApprovalAdapter(
        prisma,
        options.audit ?? new AuditService(prisma),
      );
      return new HumanClaimItemFormationAdmissionService(
        authorization,
        documentResolver,
        basisResolver,
        writer,
        { enabled: true, clock: () => new Date('2026-07-23T12:00:00.000Z') },
      );
    }

    it('atomically creates intent, pending approval and request audit; replay is side-effect free', async () => {
      const idempotencyKey = `i02b-atomic-${randomUUID()}`;
      const admission = service();
      const first = await admission.admit(context(), command(idempotencyKey));

      expect(first.replayed).toBe(false);
      expect(first.approval).toMatchObject({
        actionCode: 'CLAIM_ITEM_HIGH_IMPACT_CHANGE',
        targetType: 'CLAIM_ITEM_FORMATION_INTENT',
        targetRef: first.intent.id,
        requesterUserId,
        status: 'PENDING_APPROVAL',
        executionStatus: 'NOT_RUN',
      });
      expect(first.intent.approvalRequestId).toBe(first.approval.id);
      expect(first.approval.payloadHash).toBe(first.intent.approvalReferenceHash);
      expect(first.intent.expiresAt.getTime() - first.intent.createdAt.getTime()).toBe(
        24 * 60 * 60 * 1000,
      );
      expect(first.approval.savedIntent).toEqual({
        version: 'CLAIM_ITEM_FORMATION_APPROVAL_REF_V1',
        tenantId,
        caseId,
        formationIntentId: first.intent.id,
        intentChecksum: first.intent.intentChecksum,
        sourceIdentityHash: first.intent.sourceIdentityHash,
      });

      const beforeReplay = await counts(idempotencyKey);
      const replay = await admission.admit(context(), command(idempotencyKey));
      const afterReplay = await counts(idempotencyKey);
      expect(replay.replayed).toBe(true);
      expect(replay.intent.id).toBe(first.intent.id);
      expect(replay.approval.id).toBe(first.approval.id);
      expect(afterReplay).toEqual(beforeReplay);

      await expect(
        admission.admit(context(), command(idempotencyKey, '7000')),
      ).rejects.toMatchObject({ code: 'DUPLICATE_FORMATION_CONFLICT' });
      expect(await counts(idempotencyKey)).toEqual(beforeReplay);
    });

    it('invalid source produces zero intent/approval/audit/ClaimItem/snapshot writes', async () => {
      const idempotencyKey = `i02b-invalid-${randomUUID()}`;
      const admission = service({ source: null });
      const before = await counts(idempotencyKey);

      await expect(admission.admit(context(), command(idempotencyKey))).rejects.toMatchObject({
        code: 'FORMATION_SOURCE_UNAVAILABLE',
      });
      expect(await counts(idempotencyKey)).toEqual(before);
    });

    it('audit failure rolls back both intent and OfficeApproval', async () => {
      const idempotencyKey = `i02b-audit-rollback-${randomUUID()}`;
      const audit = {
        logInTransaction: jest.fn().mockRejectedValue(new Error('audit unavailable')),
      } as unknown as AuditService;
      const admission = service({ audit });
      const before = await counts(idempotencyKey);

      await expect(admission.admit(context(), command(idempotencyKey))).rejects.toThrow(
        'audit unavailable',
      );
      expect(await counts(idempotencyKey)).toEqual(before);
    });

    async function counts(idempotencyKey: string) {
      const approvalIdempotencyKey = `claim-item-formation:${idempotencyKey}`;
      const [intent, approval, audit, claimItem, snapshot] = await Promise.all([
        prisma.claimItemFormationIntent.count({ where: { tenantId, idempotencyKey } }),
        prisma.officeApprovalRequest.count({
          where: { tenantId, idempotencyKey: approvalIdempotencyKey },
        }),
        prisma.auditLog.count({
          where: {
            tenantId,
            action: 'OFFICE_APPROVAL_REQUESTED',
            entityType: 'OFFICE_APPROVAL',
          },
        }),
        prisma.claimItem.count({ where: { tenantId, caseId } }),
        prisma.claimFormationSnapshot.count({ where: { tenantId, caseId } }),
      ]);
      return { intent, approval, audit, claimItem, snapshot };
    }
  },
);
