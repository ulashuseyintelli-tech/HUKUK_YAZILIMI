import { ForbiddenException, INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { OfficeApprovalExecutionStatus, OfficeApprovalStatus, Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { DomainEventIngestService } from '../../icrabot/domain-event-ingest';
import { ClaimItemModule } from '../claim-item.module';
import { ClaimItemWriterRouterService } from '../claim-item-writer-router.service';
import { CaseInstrumentExactRecordResolverService, decimalToMinor } from '../formation-cek/case-instrument-exact-record.resolver';
import { CekLegalBasisReleaseResolverService } from '../formation-cek/cek-legal-basis-release.resolver';
import { ClaimItemFormationAuthorizationAdapter } from '../formation-cek/claim-item-formation-authorization.adapter';
import { computeCheckPenaltyMinor } from '../formation-cek/cek-penalty';
import { ClaimItemFormationOfficeApprovalAdapter } from '../formation-intent/claim-item-formation-office-approval.adapter';
import { HumanClaimItemFormationAdmissionService } from '../formation-intent/human-claim-item-formation-admission.service';
import { TransactionalClaimItemFormationFinalizerService } from '../formation-finalizer/transactional-claim-item-formation-finalizer.service';

/**
 * K3 AUTO-GENERATE FORMATION PR-2 — GERÇEK ÇEK çözücüleri + gerçek ClaimItem insan yazma kapısı, disposable PostgreSQL.
 * Çek kaydı kaynak çözücüsü, RCV-LB-R2-CEK taslak hukuki dayanak çözücüsü (allowDraftContent — yalnız test) ve
 * yetki adaptörü; admission → toplu talep → onay → finalizer zinciri servis düzeyinde (HTTP bağlama PR-3).
 */
const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('K3 CEK formation resolvers DB gate requires TEST_DATABASE_URL in CI.');
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;
const BOUNCE_DATE = new Date('2026-09-01T00:00:00.000Z');

describeWithDisposableDb('K3 ÇEK formation çözücüleri (gerçek kapı + gerçek çözücüler)', () => {
  jest.setTimeout(90_000);

  let prisma: PrismaClient;
  let app: INestApplication;
  let router: ClaimItemWriterRouterService;
  let db: PrismaService;
  let audit: AuditService;
  let instruments: CaseInstrumentExactRecordResolverService;
  let authorization: ClaimItemFormationAuthorizationAdapter;
  const legalBasis = new CekLegalBasisReleaseResolverService({ allowDraftContent: true });
  const tenantIds = new Set<string>();

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await prisma.$connect();
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), ClaimItemModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    router = app.get(ClaimItemWriterRouterService);
    db = app.get(PrismaService, { strict: false });
    audit = app.get(AuditService, { strict: false });
    instruments = new CaseInstrumentExactRecordResolverService(db);
    authorization = new ClaimItemFormationAuthorizationAdapter(router);
  });

  afterAll(async () => {
    await app?.close();
    for (const tenantId of tenantIds) {
      await prisma.auditLog.deleteMany({ where: { tenantId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  async function seed(label: string, amount = '10000.00') {
    const suffix = randomUUID().slice(0, 8);
    const tenantId = (await prisma.tenant.create({ data: { name: `K3 CEK ${label}`, slug: `test-k3-cek-${label}-${suffix}` } })).id;
    tenantIds.add(tenantId);
    const office = await prisma.office.create({ data: { tenantId, name: `K3 CEK ofis ${label}` } });
    const legalCase = await prisma.case.create({ data: { tenantId, fileNumber: `K3-CEK-${label}-${suffix}`, type: 'GENERAL_EXECUTION' } });
    async function lawyer(key: string, casePermissions: Record<string, boolean> | null, rank: 'LAWYER' | 'PARTNER' = 'LAWYER') {
      const user = await prisma.user.create({ data: { tenantId, email: `${key}-${suffix}@example.test`, name: key, surname: 'K3', role: 'USER' } });
      const lw = await prisma.lawyer.create({ data: { tenantId, officeId: office.id, userId: user.id, name: key, surname: 'K3', lawyerRank: rank } });
      if (casePermissions) await prisma.caseLawyer.create({ data: { caseId: legalCase.id, lawyerId: lw.id, casePermissions } });
      return user.id;
    }
    const requester = await lawyer('req', { canEditFinance: true });
    const financeViewer = await lawyer('viewonly', { canViewFinance: true });
    const approver = await lawyer('appr', null, 'PARTNER');
    const debtor = await prisma.debtor.create({ data: { tenantId, type: 'COMPANY', name: `K3 borclu ${label}` } as never });
    const instrument = await prisma.caseInstrument.create({
      data: {
        tenantId,
        caseId: legalCase.id,
        instrumentType: 'CEK',
        serialNo: `K3-${suffix}`,
        amount,
        currency: 'TRY',
        issueDate: new Date('2026-08-01T00:00:00.000Z'),
        presentmentDate: new Date('2026-08-31T00:00:00.000Z'),
        isBounced: true,
        bounceDate: BOUNCE_DATE,
      },
    });
    return { tenantId, caseId: legalCase.id, requester, financeViewer, approver, debtorId: debtor.id, instrumentId: instrument.id };
  }
  type Seed = Awaited<ReturnType<typeof seed>>;

  describe('çek kaydı kaynak çözücüsü', () => {
    it('kapsamdaki karşılıksız çek: kesin sürüm, iki kanıt sınıfı, çek kaydı kimliği', async () => {
      const s = await seed('resolve');
      const source = await instruments.resolveExactVersion({
        tenantId: s.tenantId,
        caseId: s.caseId,
        sourceType: 'CASE_INSTRUMENT',
        documentId: s.instrumentId,
        requestedVersionId: 'x',
      });
      expect(source).toMatchObject({
        sourceType: 'CASE_INSTRUMENT',
        documentId: s.instrumentId,
        documentType: 'CEK',
        claimItemDocumentSourceType: 'CEK',
        availableForFormation: true,
        evidenceClasses: ['CHECK_DISHONOUR_RECORD', 'CHECK_INSTRUMENT_RECORD'],
      });
      expect(source?.versionId).toMatch(/^civ1:[0-9a-f]{64}$/);
    });

    it('kapsam dışı: başka kiracı / başka dosya / belge kaynağı / çek dışı enstrüman → null', async () => {
      const s = await seed('scope');
      const other = await seed('scope-other');
      const base = { requestedVersionId: 'x', documentId: s.instrumentId, sourceType: 'CASE_INSTRUMENT' as const };
      await expect(instruments.resolveExactVersion({ ...base, tenantId: other.tenantId, caseId: s.caseId })).resolves.toBeNull();
      await expect(instruments.resolveExactVersion({ ...base, tenantId: s.tenantId, caseId: other.caseId })).resolves.toBeNull();
      await expect(
        instruments.resolveExactVersion({ ...base, tenantId: s.tenantId, caseId: s.caseId, sourceType: 'CASE_DOCUMENT' }),
      ).resolves.toBeNull();
      await prisma.caseInstrument.update({ where: { id: s.instrumentId }, data: { instrumentType: 'SENET' } });
      await expect(instruments.resolveExactVersion({ ...base, tenantId: s.tenantId, caseId: s.caseId })).resolves.toBeNull();
    });

    it('hesaplama/hukuk girdisi değişince sürüm değişir; ilgisiz alan (not) değişince DEĞİŞMEZ', async () => {
      const s = await seed('version');
      const read = async () =>
        (await instruments.resolveExactVersion({
          tenantId: s.tenantId,
          caseId: s.caseId,
          sourceType: 'CASE_INSTRUMENT',
          documentId: s.instrumentId,
          requestedVersionId: 'x',
        }))!.versionId;
      const v0 = await read();
      await prisma.caseInstrument.update({ where: { id: s.instrumentId }, data: { notes: 'ilgisiz not' } });
      expect(await read()).toBe(v0);
      await prisma.caseInstrument.update({ where: { id: s.instrumentId }, data: { amount: '10000.01' } });
      const v1 = await read();
      expect(v1).not.toBe(v0);
      await prisma.caseInstrument.update({ where: { id: s.instrumentId }, data: { bounceDate: null } });
      const noBounce = await instruments.resolveExactVersion({
        tenantId: s.tenantId,
        caseId: s.caseId,
        sourceType: 'CASE_INSTRUMENT',
        documentId: s.instrumentId,
        requestedVersionId: 'x',
      });
      expect(noBounce?.versionId).not.toBe(v1);
      expect(noBounce?.evidenceClasses).toEqual(['CHECK_INSTRUMENT_RECORD']);
    });

    it('tutar kuruşa kesin çevrilir', () => {
      expect(decimalToMinor(new Prisma.Decimal('12345.67'))).toBe(1234567n);
      expect(decimalToMinor(new Prisma.Decimal('0'))).toBeNull();
    });
  });

  describe('yetki adaptörü (ClaimItem insan yazma kapısı)', () => {
    it('dosyada mali düzenleme yetkili avukat talep açabilir; yetkisiz 403', async () => {
      const s = await seed('auth');
      await expect(
        authorization.assertAuthorized({ tenantId: s.tenantId, caseId: s.caseId, actorUserId: s.requester }),
      ).resolves.toBeUndefined();
      await expect(
        authorization.assertAuthorized({ tenantId: s.tenantId, caseId: s.caseId, actorUserId: s.financeViewer }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('transaction içi yetki: aktör kilitli güncel satırdan; yetkisi alınmış avukat reddedilir', async () => {
      const s = await seed('auth-tx');
      await prisma.caseLawyer.updateMany({ where: { caseId: s.caseId, lawyer: { userId: s.requester } }, data: { casePermissions: {} } });
      await expect(
        prisma.$transaction((tx) =>
          authorization.assertAuthorizedInTransaction(tx, { tenantId: s.tenantId, caseId: s.caseId, actorUserId: s.requester }),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('gerçek çözücülerle talep → onay → kesin tazminat kalemi (servis düzeyi)', () => {
    const CREATED_AT = new Date('2026-09-28T09:00:00.000Z');
    const DECIDED_AT = new Date('2026-09-28T10:00:00.000Z');
    const adapter = () => new ClaimItemFormationOfficeApprovalAdapter(db, audit);
    const admission = () =>
      new HumanClaimItemFormationAdmissionService(authorization, instruments, legalBasis, adapter(), {
        enabled: true,
        clock: () => new Date(CREATED_AT),
      });
    const finalizer = () =>
      new TransactionalClaimItemFormationFinalizerService(db, audit, new DomainEventIngestService(), instruments, legalBasis, {
        enabled: true,
        clock: () => new Date('2026-09-28T11:00:00.000Z'),
      });

    async function requestPenalty(s: Seed) {
      const cek = await instruments.readCekRecord(s.tenantId, s.caseId, s.instrumentId);
      const source = instruments.project(cek!);
      const penalty = computeCheckPenaltyMinor(cek!.amountMinor, legalBasis.penaltyBasisPoints());
      const key = `k3-cek-${randomUUID()}`;
      const prepared = await admission().prepare(
        { tenantId: s.tenantId, actorUserId: s.requester, correlationId: `k3-cek-${key}` },
        {
          caseId: s.caseId,
          idempotencyKey: `${key}:CHECK_PENALTY`,
          source: { sourceType: 'CASE_INSTRUMENT', documentId: s.instrumentId, requestedVersionId: source.versionId },
          component: { category: 'ANCILLARY', subtypeCode: 'CHECK_PENALTY' },
          legalBasis: { code: 'TTK_CEK_TAZMINATI', requestedVersion: '1' },
          money: {
            originalAmountMinor: penalty.toString(),
            demandedAmountMinor: penalty.toString(),
            currency: cek!.currency,
            minorUnit: 2,
          },
          effectiveAt: cek!.bounceDate!,
          liabilityContext: { payload: { liabilityType: 'TAM', liableDebtorRefs: [s.debtorId] } },
        },
        { sourceSlot: 'CASE_INSTRUMENT:CHECK_PENALTY' },
      );
      return adapter().createBatchAtomic({ batchIdempotencyKey: key, items: [prepared] });
    }

    async function approve(approvalId: string, approver: string) {
      await prisma.officeApprovalRequest.update({
        where: { id: approvalId },
        data: { status: OfficeApprovalStatus.APPROVED, approverUserId: approver, decidedAt: DECIDED_AT },
      });
    }

    it('%10 tazminat onaylı talepten çek kaydına bağlı doğar; onaydan önce kalem yok', async () => {
      const s = await seed('e2e', '12345.67');
      const { approval } = await requestPenalty(s);
      expect(await prisma.claimItem.count({ where: { tenantId: s.tenantId } })).toBe(0);
      await approve(approval.id, s.approver);
      await prisma.$transaction((tx) =>
        finalizer().finalizeApprovedBatchInTransaction(tx, { tenantId: s.tenantId, approvalRequestId: approval.id }),
      );

      const [item] = await prisma.claimItem.findMany({ where: { tenantId: s.tenantId } });
      expect(item).toMatchObject({ itemType: 'CHECK_PENALTY', instrumentId: s.instrumentId, sourceDocumentId: null });
      expect(item.demandedAmount.toString()).toBe('1234.57'); // 12.345,67 × %10 = 1.234,567 → yarıdan yukarı
      expect(item.liableDebtorIds).toEqual([s.debtorId]);
      const after = await prisma.officeApprovalRequest.findUniqueOrThrow({ where: { id: approval.id } });
      expect(after.executionStatus).toBe(OfficeApprovalExecutionStatus.SUCCEEDED);
    });

    it('onay beklerken çek tutarı değişirse eski onay içeriği uygulanmaz (bayat kaynak)', async () => {
      const s = await seed('stale');
      const { approval } = await requestPenalty(s);
      await approve(approval.id, s.approver);
      await prisma.caseInstrument.update({ where: { id: s.instrumentId }, data: { amount: '20000.00' } });

      await expect(
        prisma.$transaction((tx) =>
          finalizer().finalizeApprovedBatchInTransaction(tx, { tenantId: s.tenantId, approvalRequestId: approval.id }),
        ),
      ).rejects.toMatchObject({ code: 'FORMATION_SOURCE_MISMATCH' });
      expect(await prisma.claimItem.count({ where: { tenantId: s.tenantId } })).toBe(0);
    });

    it('yetkisiz avukat talep açamaz (yazma yok)', async () => {
      const s = await seed('e2e-viewonly');
      const cek = await instruments.readCekRecord(s.tenantId, s.caseId, s.instrumentId);
      const source = instruments.project(cek!);
      await expect(
        admission().prepare(
          { tenantId: s.tenantId, actorUserId: s.financeViewer, correlationId: 'k3-viewonly' },
          {
            caseId: s.caseId,
            idempotencyKey: `k3-viewonly-${randomUUID()}`,
            source: { sourceType: 'CASE_INSTRUMENT', documentId: s.instrumentId, requestedVersionId: source.versionId },
            component: { category: 'ANCILLARY', subtypeCode: 'CHECK_PENALTY' },
            legalBasis: { code: 'TTK_CEK_TAZMINATI', requestedVersion: '1' },
            money: { originalAmountMinor: '100000', demandedAmountMinor: '100000', currency: 'TRY', minorUnit: 2 },
            effectiveAt: cek!.bounceDate!,
            liabilityContext: { payload: { liabilityType: 'TAM', liableDebtorRefs: [s.debtorId] } },
          },
          { sourceSlot: 'CASE_INSTRUMENT:CHECK_PENALTY' },
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(await prisma.claimItemFormationIntent.count({ where: { tenantId: s.tenantId } })).toBe(0);
    });
  });
});
