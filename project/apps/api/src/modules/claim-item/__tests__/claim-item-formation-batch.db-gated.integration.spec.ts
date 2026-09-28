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
import { ClaimItemFormationOfficeApprovalAdapter } from '../formation-intent/claim-item-formation-office-approval.adapter';
import {
  CaseDocumentExactVersionResolverPort,
  HumanClaimItemFormationAuthorizationPort,
  LegalBasisExactVersionResolverPort,
  type ExactCaseDocumentSourceV1,
  type ExactLegalBasisBindingV1,
} from '../formation-intent/claim-item-formation-resolver.ports';
import { HumanClaimItemFormationAdmissionService } from '../formation-intent/human-claim-item-formation-admission.service';
import {
  CLAIM_ITEM_FORMATION_BATCH_APPROVAL_REF_VERSION,
  CLAIM_ITEM_FORMATION_BATCH_APPROVAL_TARGET_TYPE,
  CLAIM_ITEM_FORMATION_SOURCE_IDENTITY_VERSION_V2,
  ClaimItemFormationAdmissionError,
} from '../formation-intent/claim-item-formation-intent.contract';
import { TransactionalClaimItemFormationFinalizerService } from '../formation-finalizer/transactional-claim-item-formation-finalizer.service';
import { ClaimItemFormationFinalizationError } from '../formation-finalizer/claim-item-formation-finalizer.contract';
import { syntheticProjectionBindingSource } from './claim-item-formation-projection-binding.fixture';

/**
 * K3 AUTO-GENERATE FORMATION — toplu formation temeli (owner GO 2026-09-28), disposable PostgreSQL.
 *
 * Aynı belgeden iki bileşen (ör. çek bedeli + çek tazminatı) TEK OfficeApproval talebine değişmez içerikle bağlanır
 * (`createBatchAtomic`); onaydan ÖNCE kesin ClaimItem yoktur; onaylı talep `finalizeApprovedBatchInTransaction` ile
 * aynı transaction'da kalemlerin TAMAMINI oluşturur. Hukuki dayanak/belge çözücüleri burada SENTETİKTİR (gerçek ÇEK
 * çözücüleri ayrı değişiklikte); ölçülen: yazma sözleşmesi, idempotensi, atomiklik, bayat kaynak reddi, slot'lu kaynak
 * kimliği ve DB tetikleyicisinin konum eşitliği.
 */
const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('K3 formation batch DB gate requires TEST_DATABASE_URL in CI.');
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;
const CREATED_AT = new Date('2026-09-28T09:00:00.000Z');
const DECIDED_AT = new Date('2026-09-28T10:00:00.000Z');
const EXECUTION_AT = new Date('2026-09-28T11:00:00.000Z');

type Component = 'PRINCIPAL' | 'PENALTY';

describeWithDisposableDb('K3 toplu formation temeli (tek onay → çok kalem, atomik)', () => {
  jest.setTimeout(90_000);

  const prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
  const audit = new AuditService(prisma as any);
  const adapter = new ClaimItemFormationOfficeApprovalAdapter(prisma as any, audit);
  const hash = (value: string) => stableJsonHash({ value });
  let tenantId: string;
  let caseId: string;
  let requesterUserId: string;
  let approverUserId: string;

  const binding = (component: Component): ExactLegalBasisBindingV1 => {
    const principal = component === 'PRINCIPAL';
    const code = principal ? 'SYNTH_CHECK_PRINCIPAL' : 'SYNTH_CHECK_PENALTY';
    const category = principal ? 'PRINCIPAL' : 'ANCILLARY';
    return {
      legalBasisCode: code,
      legalBasisVersion: '1',
      legalBasisChecksum: hash(`lb-${code}`),
      registryReleaseId: 'synthetic-release-1',
      registryReleaseChecksum: hash('synthetic-release'),
      status: 'ACTIVE',
      effectiveFrom: '2020-01-01T00:00:00.000Z',
      effectiveTo: null,
      subtypeRecognized: true,
      componentCategory: category,
      // Sentetik: bağlama sözlüğündeki mevcut kodlar (gerçek ÇEK alt türleri ayrı değişiklikte).
      componentSubtypeCode: principal ? 'INTERIM_MAINTENANCE' : 'DELAY_DAMAGE',
      componentSubtypeVersion: '1',
      componentSubtypeChecksum: hash(`subtype-${code}`),
      allowedDocumentTypes: ['CEK'],
      requiredEvidenceClasses: ['SIGNED_CONTRACT'],
      liabilityCompatible: true,
      interestEligibility: 'NO_INTEREST',
      interestPolicyRef: null,
      interestPolicyVersion: null,
      ruleRef: null,
      ruleVersion: null,
      legalReviewRequired: false,
      resolutionContractVersion: 'SyntheticResolutionV1',
      resolutionHash: hash(`resolution-${code}`),
      ...syntheticProjectionBindingSource({ legalBasisCode: code, componentCategory: category }),
      claimItemProjection: {
        itemType: principal ? 'PRINCIPAL' : 'CHECK_PENALTY',
        interestAccrualStatus: 'NO_INTEREST',
        interestType: null,
        interestRate: null,
        interestStartDate: null,
        interestStartDateProvenance: null,
        isAllDebtorsLiable: false,
        liableDebtorIds: ['debtor:opaque-1'],
      },
    };
  };

  const legalBasisResolver = {
    resolveExactVersion: jest.fn(async (input: { componentSubtypeCode: string }) => ({
      ok: true,
      value: binding(input.componentSubtypeCode === 'INTERIM_MAINTENANCE' ? 'PRINCIPAL' : 'PENALTY'),
    })),
  } as unknown as LegalBasisExactVersionResolverPort;

  beforeAll(async () => {
    await prisma.$connect();
    const suffix = randomUUID().slice(0, 8);
    tenantId = (await prisma.tenant.create({ data: { name: 'K3 batch', slug: `test-k3-batch-${suffix}` } })).id;
    requesterUserId = (
      await prisma.user.create({ data: { tenantId, email: `k3-req-${suffix}@example.test`, name: 'K3', surname: 'Req' } })
    ).id;
    approverUserId = (
      await prisma.user.create({ data: { tenantId, email: `k3-appr-${suffix}@example.test`, name: 'K3', surname: 'Appr' } })
    ).id;
    caseId = (
      await prisma.case.create({ data: { tenantId, fileNumber: `K3-BATCH-${suffix}`, type: 'GENERAL_EXECUTION' } })
    ).id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function source(label: string): Promise<ExactCaseDocumentSourceV1> {
    const documentId = (
      await prisma.caseDocument.create({
        data: { caseId, documentType: 'OTHER', title: `K3 batch ${label}`, isSourceDocument: true },
      })
    ).id;
    return {
      tenantId,
      caseId,
      sourceType: 'CASE_DOCUMENT',
      documentId,
      versionId: `cdv:${label}`,
      version: '1',
      binaryContentHash: hash(`binary-${label}`),
      documentEnvelopeHash: hash(`envelope-${label}`),
      classificationHash: hash(`classification-${label}`),
      canonicalSourceFingerprint: hash(`fingerprint-${label}`),
      fingerprintAlgorithm: 'SHA-256',
      fingerprintVersion: 'SyntheticFingerprintV1',
      fingerprintVerified: true,
      documentType: 'CEK',
      claimItemDocumentSourceType: 'CEK',
      documentClassificationVersion: 'SyntheticClassificationV1',
      lifecycleStatus: 'ACTIVE',
      availabilityStatus: 'AVAILABLE',
      availableForFormation: true,
      evidenceClasses: ['SIGNED_CONTRACT'],
      opaqueEvidenceRefs: [`evidence:${label}`],
      resolutionContractVersion: 'SyntheticDocumentResolutionV1',
      resolutionHash: hash(`document-resolution-${label}`),
    };
  }

  function admission(src: ExactCaseDocumentSourceV1) {
    return new HumanClaimItemFormationAdmissionService(
      { assertAuthorized: jest.fn(async () => undefined) } as unknown as HumanClaimItemFormationAuthorizationPort,
      { resolveExactVersion: jest.fn(async () => src) } as unknown as CaseDocumentExactVersionResolverPort,
      legalBasisResolver,
      adapter,
      { enabled: true, clock: () => new Date(CREATED_AT) },
    );
  }

  async function prepareBatch(label: string, src: ExactCaseDocumentSourceV1, key = `k3-${label}-${randomUUID()}`) {
    const service = admission(src);
    const context = { tenantId, actorUserId: requesterUserId, correlationId: `k3-batch-${label}` };
    const component = async (kind: Component, amount: string) =>
      service.prepare(
        context,
        {
          caseId,
          idempotencyKey: `${key}:${kind}`,
          source: { documentId: src.documentId, requestedVersionId: src.versionId },
          component: {
            category: kind === 'PRINCIPAL' ? 'PRINCIPAL' : 'ANCILLARY',
            subtypeCode: kind === 'PRINCIPAL' ? 'INTERIM_MAINTENANCE' : 'DELAY_DAMAGE',
          },
          legalBasis: { code: kind === 'PRINCIPAL' ? 'SYNTH_CHECK_PRINCIPAL' : 'SYNTH_CHECK_PENALTY', requestedVersion: '1' },
          money: { originalAmountMinor: amount, demandedAmountMinor: amount, currency: 'TRY', minorUnit: 2 },
          effectiveAt: '2026-09-20T00:00:00.000Z',
          liabilityContext: { payload: { liabilityType: 'TAM', liableDebtorRefs: ['debtor:opaque-1'] } },
        },
        { sourceSlot: `CEK:${kind}` },
      );
    return { key, items: [await component('PRINCIPAL', '1000000'), await component('PENALTY', '100000')] };
  }

  async function approve(approvalRequestId: string) {
    await prisma.officeApprovalRequest.update({
      where: { id: approvalRequestId },
      data: { status: OfficeApprovalStatus.APPROVED, approverUserId, decidedAt: DECIDED_AT },
    });
  }

  function finalizer(document: ExactCaseDocumentSourceV1) {
    return new TransactionalClaimItemFormationFinalizerService(
      prisma as any,
      audit,
      new DomainEventIngestService(),
      { resolveExactVersion: jest.fn(async () => document) } as unknown as CaseDocumentExactVersionResolverPort,
      legalBasisResolver,
      { enabled: true, clock: () => new Date(EXECUTION_AT) },
    );
  }

  const finalizeInTx = (service: TransactionalClaimItemFormationFinalizerService, approvalRequestId: string) =>
    prisma.$transaction((tx) => service.finalizeApprovedBatchInTransaction(tx, { tenantId, approvalRequestId }));

  const claimItemsOf = (documentId: string) =>
    prisma.claimItem.findMany({ where: { tenantId, caseId, sourceDocumentId: documentId }, orderBy: { itemType: 'asc' } });

  it('talep: tek onay + iki değişmez intent (konum 0/1, slot kimliği V2); onaydan ÖNCE kesin kalem YOK', async () => {
    const src = await source('request');
    const batch = await prepareBatch('request', src);
    const result = await adapter.createBatchAtomic({ batchIdempotencyKey: batch.key, items: batch.items });

    expect(result.replayed).toBe(false);
    expect(result.approval.targetType).toBe(CLAIM_ITEM_FORMATION_BATCH_APPROVAL_TARGET_TYPE);
    expect(result.approval.status).toBe(OfficeApprovalStatus.PENDING_APPROVAL);
    expect((result.approval.savedIntent as any).version).toBe(CLAIM_ITEM_FORMATION_BATCH_APPROVAL_REF_VERSION);
    expect(result.approval.payloadHash).toBe(stableJsonHash(result.approval.savedIntent as any));
    expect(result.intents.map((intent) => intent.approvalBatchPosition)).toEqual([0, 1]);
    expect(result.intents.map((intent) => intent.sourceSlot)).toEqual(['CEK:PRINCIPAL', 'CEK:PENALTY']);
    expect(new Set(result.intents.map((intent) => intent.sourceIdentityVersion))).toEqual(
      new Set([CLAIM_ITEM_FORMATION_SOURCE_IDENTITY_VERSION_V2]),
    );
    expect(new Set(result.intents.map((intent) => intent.sourceIdentityHash)).size).toBe(2);
    expect(await claimItemsOf(src.documentId)).toHaveLength(0);
    expect(
      await prisma.auditLog.count({ where: { tenantId, action: 'OFFICE_APPROVAL_REQUESTED', entityId: result.approval.id } }),
    ).toBe(1);
  });

  it('tekrarlanan istek aynı toplu talebi döner (replayed); aynı anahtar + farklı içerik → DUPLICATE_FORMATION_CONFLICT', async () => {
    const src = await source('replay');
    const batch = await prepareBatch('replay', src);
    const first = await adapter.createBatchAtomic({ batchIdempotencyKey: batch.key, items: batch.items });
    const again = await adapter.createBatchAtomic({ batchIdempotencyKey: batch.key, items: batch.items });

    expect(again.replayed).toBe(true);
    expect(again.approval.id).toBe(first.approval.id);
    expect(again.intents.map((intent) => intent.id)).toEqual(first.intents.map((intent) => intent.id));

    const altered = { ...batch.items[1], intentChecksum: hash('altered'), idempotencyKey: `${batch.key}:PENALTY` };
    await expect(
      adapter.createBatchAtomic({ batchIdempotencyKey: batch.key, items: [batch.items[0], altered] }),
    ).rejects.toBeInstanceOf(ClaimItemFormationAdmissionError);
    expect(await prisma.officeApprovalRequest.count({ where: { tenantId, targetRef: first.approval.targetRef } })).toBe(1);
  });

  it('eşzamanlı çift istek tek toplu talep üretir', async () => {
    const src = await source('concurrent');
    const batch = await prepareBatch('concurrent', src);
    const results = await Promise.all([
      adapter.createBatchAtomic({ batchIdempotencyKey: batch.key, items: batch.items }),
      adapter.createBatchAtomic({ batchIdempotencyKey: batch.key, items: batch.items }),
    ]);

    expect(new Set(results.map((result) => result.approval.id)).size).toBe(1);
    expect(results.filter((result) => result.replayed)).toHaveLength(1);
    expect(
      await prisma.claimItemFormationIntent.count({ where: { tenantId, approvalRequestId: results[0].approval.id } }),
    ).toBe(2);
  });

  it('talep tx içi yetki kontrolü fırlatırsa hiçbir satır yazılmaz', async () => {
    const src = await source('authz');
    const batch = await prepareBatch('authz', src);
    await expect(
      adapter.createBatchAtomic({
        batchIdempotencyKey: batch.key,
        items: batch.items,
        authorizeInTransaction: async () => {
          throw new Error('K3 yetki iptal edildi');
        },
      }),
    ).rejects.toThrow('K3 yetki iptal edildi');
    expect(await prisma.claimItemFormationIntent.count({ where: { tenantId, idempotencyKey: { startsWith: batch.key } } })).toBe(0);
  });

  it('onay: kalemlerin TAMAMI aynı transaction\'da doğru tutar/tür/kaynakla oluşur; yürütme SUCCEEDED', async () => {
    const src = await source('finalize');
    const batch = await prepareBatch('finalize', src);
    const { approval } = await adapter.createBatchAtomic({ batchIdempotencyKey: batch.key, items: batch.items });
    await approve(approval.id);

    const result = await finalizeInTx(finalizer(src), approval.id);
    expect(result.items).toHaveLength(2);

    const items = await claimItemsOf(src.documentId);
    expect(items.map((item) => [item.itemType, item.demandedAmount.toString()]).sort()).toEqual([
      ['CHECK_PENALTY', '1000'],
      ['PRINCIPAL', '10000'],
    ]);
    const snapshots = await prisma.claimFormationSnapshot.findMany({
      where: { tenantId, approvalRequestId: approval.id },
      orderBy: { approvalBatchPosition: 'asc' },
    });
    expect(snapshots.map((snapshot) => snapshot.approvalBatchPosition)).toEqual([0, 1]);
    const after = await prisma.officeApprovalRequest.findUniqueOrThrow({ where: { id: approval.id } });
    expect(after.executionStatus).toBe(OfficeApprovalExecutionStatus.SUCCEEDED);
  });

  it('atomiklik: ikinci bileşen yeniden doğrulamada düşerse BİRİNCİ kalem de kalmaz; yürütme NOT_RUN', async () => {
    const src = await source('atomic');
    const batch = await prepareBatch('atomic', src);
    const { approval } = await adapter.createBatchAtomic({ batchIdempotencyKey: batch.key, items: batch.items });
    await approve(approval.id);

    let calls = 0;
    const flaky = new TransactionalClaimItemFormationFinalizerService(
      prisma as any,
      audit,
      new DomainEventIngestService(),
      {
        resolveExactVersion: jest.fn(async () => (++calls === 1 ? src : { ...src, canonicalSourceFingerprint: hash('drift') })),
      } as unknown as CaseDocumentExactVersionResolverPort,
      legalBasisResolver,
      { enabled: true, clock: () => new Date(EXECUTION_AT) },
    );
    await expect(finalizeInTx(flaky, approval.id)).rejects.toMatchObject({ code: 'FORMATION_SOURCE_MISMATCH' });
    expect(calls).toBe(2);
    expect(await claimItemsOf(src.documentId)).toHaveLength(0);
    expect(await prisma.claimFormationSnapshot.count({ where: { tenantId, approvalRequestId: approval.id } })).toBe(0);
    const after = await prisma.officeApprovalRequest.findUniqueOrThrow({ where: { id: approval.id } });
    expect(after.executionStatus).toBe(OfficeApprovalExecutionStatus.NOT_RUN);
  });

  it('bayat kaynak: onay beklerken belge değişirse (parmak izi farklı) eski onay içeriği UYGULANMAZ', async () => {
    const src = await source('stale');
    const batch = await prepareBatch('stale', src);
    const { approval } = await adapter.createBatchAtomic({ batchIdempotencyKey: batch.key, items: batch.items });
    await approve(approval.id);

    const changed = { ...src, versionId: 'cdv:stale-changed', canonicalSourceFingerprint: hash('changed') };
    await expect(finalizeInTx(finalizer(changed), approval.id)).rejects.toBeInstanceOf(ClaimItemFormationFinalizationError);
    expect(await claimItemsOf(src.documentId)).toHaveLength(0);
  });

  it('onaysız / ret / revizyon kesin kalem oluşturmaz', async () => {
    for (const status of [
      OfficeApprovalStatus.PENDING_APPROVAL,
      OfficeApprovalStatus.REJECTED,
      OfficeApprovalStatus.REVISION_REQUESTED,
    ]) {
      const src = await source(`status-${status}`);
      const batch = await prepareBatch(`status-${status}`, src);
      const { approval } = await adapter.createBatchAtomic({ batchIdempotencyKey: batch.key, items: batch.items });
      if (status !== OfficeApprovalStatus.PENDING_APPROVAL) {
        await prisma.officeApprovalRequest.update({
          where: { id: approval.id },
          data: { status, approverUserId, decidedAt: DECIDED_AT },
        });
      }
      await expect(finalizeInTx(finalizer(src), approval.id)).rejects.toBeInstanceOf(ClaimItemFormationFinalizationError);
      expect(await claimItemsOf(src.documentId)).toHaveLength(0);
    }
  });

  it('tekrar deneme: başarılı toplu kayıttan sonra ikinci finalize yazmaz (mükerrer kalem yok)', async () => {
    const src = await source('retry');
    const batch = await prepareBatch('retry', src);
    const { approval } = await adapter.createBatchAtomic({ batchIdempotencyKey: batch.key, items: batch.items });
    await approve(approval.id);
    await finalizeInTx(finalizer(src), approval.id);

    await expect(finalizeInTx(finalizer(src), approval.id)).rejects.toBeInstanceOf(ClaimItemFormationFinalizationError);
    expect(await claimItemsOf(src.documentId)).toHaveLength(2);
  });

  it('aynı belge + aynı slot başka toplu talepte ikinci kez kesinleşemez (kaynak kimliği tekilliği)', async () => {
    const src = await source('dup-source');
    const first = await prepareBatch('dup-source-1', src);
    const second = await prepareBatch('dup-source-2', src);
    const a = await adapter.createBatchAtomic({ batchIdempotencyKey: first.key, items: first.items });
    const b = await adapter.createBatchAtomic({ batchIdempotencyKey: second.key, items: second.items });
    await approve(a.approval.id);
    await approve(b.approval.id);
    await finalizeInTx(finalizer(src), a.approval.id);

    await expect(finalizeInTx(finalizer(src), b.approval.id)).rejects.toThrow();
    expect(await claimItemsOf(src.documentId)).toHaveLength(2);
  });

  it('kaynak/tetikleyici: snapshot konumu intent konumundan farklı yazılamaz (DB)', async () => {
    const src = await source('trigger');
    const batch = await prepareBatch('trigger', src);
    const { approval, intents } = await adapter.createBatchAtomic({ batchIdempotencyKey: batch.key, items: batch.items });
    await approve(approval.id);
    await finalizeInTx(finalizer(src), approval.id);
    const snapshot = await prisma.claimFormationSnapshot.findFirstOrThrow({
      where: { tenantId, formationIntentId: intents[1].id },
    });
    await expect(
      prisma.$executeRawUnsafe(
        `UPDATE "ClaimFormationSnapshot" SET "approvalBatchPosition" = 0 WHERE "id" = $1`,
        snapshot.id,
      ),
    ).rejects.toThrow();
  });
});
