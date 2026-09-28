import { CanActivate, ExecutionContext, INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { OfficeApprovalExecutionStatus, OfficeApprovalStatus, PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import * as request from 'supertest';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ClaimItemModule } from '../claim-item.module';
import { CEK_AUTO_GENERATE_FORMATION_OPTIONS } from '../formation-cek/cek-auto-generate-formation.service';

/**
 * K3 AUTO-GENERATE FORMATION PR-3 — ÇEK için `POST /claim-items/auto-generate` → ikinci avukat onayı
 * (`POST /office-approvals/:id/approve`) → kesin kalemler; gerçek HTTP + main.ts ValidationPipe + gerçek Nest grafiği
 * (ClaimItemModule → OfficeApprovalModule) + disposable PostgreSQL. Yalnız JWT imza doğrulaması DB'den okunan test
 * kimliğiyle değiştirilir; bayraklar (varsayılan KAPALI) yalnız bu izole test uygulamasında açılır.
 */
const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('K3 CEK auto-generate HTTP DB gate requires TEST_DATABASE_URL in CI.');
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;

const PRODUCTION_VALIDATION_OPTIONS = { whitelist: true, forbidNonWhitelisted: true, transform: true } as const;

class DbUserIdentityGuard implements CanActivate {
  constructor(private readonly db: () => PrismaClient) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const user = await this.db().user.findUnique({
      where: { id: String(req.headers['x-test-user-id']) },
      include: { tenant: true },
    });
    if (!user || !user.isActive) throw new UnauthorizedException();
    req.user = user;
    return true;
  }
}

describeWithDisposableDb('K3 ÇEK auto-generate formation (HTTP + ikinci avukat onayı + disposable PostgreSQL)', () => {
  jest.setTimeout(120_000);

  let prisma: PrismaClient;
  let app: INestApplication;
  const tenantIds = new Set<string>();

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await prisma.$connect();
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), ClaimItemModule],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(new DbUserIdentityGuard(() => prisma))
      .overrideProvider(CEK_AUTO_GENERATE_FORMATION_OPTIONS)
      .useValue({ enabled: true, allowDraftLegalContent: true })
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe(PRODUCTION_VALIDATION_OPTIONS));
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    for (const tenantId of tenantIds) {
      await prisma.auditLog.deleteMany({ where: { tenantId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  const post = (path: string, userId: string, body: Record<string, unknown>) =>
    request(app.getHttpServer()).post(path).set('x-test-user-id', userId).send(body);

  async function fixture(label: string, opts: { amount?: string; bounced?: boolean; canonicalPrincipal?: boolean } = {}) {
    const suffix = randomUUID().slice(0, 8);
    const tenantId = `test-ci-k3cek-${label}-${suffix}`;
    tenantIds.add(tenantId);
    await prisma.tenant.create({ data: { id: tenantId, name: `CI K3 CEK ${label}`, slug: tenantId } });
    const office = await prisma.office.create({ data: { tenantId, name: `CI K3 CEK ofis ${label}` } });
    const legalCase = await prisma.case.create({
      data: { tenantId, fileNumber: `CI-K3-CEK-${label}-${suffix}`, type: 'GENERAL_EXECUTION' },
    });
    async function actor(
      key: string,
      role: 'USER' | 'VIEWER',
      rank: 'LAWYER' | 'PARTNER',
      casePermissions: Record<string, boolean> | null,
    ) {
      const user = await prisma.user.create({
        data: { tenantId, email: `${key}-${suffix}@example.test`, name: key, surname: 'K3', role },
      });
      const lawyer = await prisma.lawyer.create({
        data: { tenantId, officeId: office.id, userId: user.id, name: key, surname: 'K3', lawyerRank: rank },
      });
      if (casePermissions) {
        await prisma.caseLawyer.create({ data: { caseId: legalCase.id, lawyerId: lawyer.id, casePermissions } });
      }
      return { userId: user.id, lawyerId: lawyer.id };
    }
    const requester = await actor('req', 'USER', 'LAWYER', { canEditFinance: true });
    const viewer = await actor('viewer', 'VIEWER', 'LAWYER', { canEditFinance: true });
    const financeViewer = await actor('viewonly', 'USER', 'LAWYER', { canViewFinance: true });
    const approver = await actor('appr', 'USER', 'PARTNER', null);
    const approver2 = await actor('appr2', 'USER', 'PARTNER', null);
    const viewerPartner = await actor('vpartner', 'VIEWER', 'PARTNER', null);
    const debtor = await prisma.debtor.create({ data: { tenantId, type: 'COMPANY', name: `K3 borclu ${label}` } as never });
    await prisma.caseDebtor.create({ data: { caseId: legalCase.id, debtorId: debtor.id } });
    const strangerDebtor = await prisma.debtor.create({ data: { tenantId, type: 'COMPANY', name: `K3 yabanci ${label}` } as never });
    const bounced = opts.bounced ?? true;
    const instrument = await prisma.caseInstrument.create({
      data: {
        tenantId,
        caseId: legalCase.id,
        instrumentType: 'CEK',
        serialNo: `K3-${suffix}`,
        amount: opts.amount ?? '12345.67',
        currency: 'TRY',
        issueDate: new Date('2026-08-01T00:00:00.000Z'),
        presentmentDate: new Date('2026-08-31T00:00:00.000Z'),
        isBounced: bounced,
        bounceDate: bounced ? new Date('2026-09-01T00:00:00.000Z') : null,
      },
    });
    if (opts.canonicalPrincipal) {
      // POST /cases'in CASE_INSTRUMENT_GENERATOR ile ürettiği kanonik çek bedelini temsil eder.
      await prisma.claimItem.create({
        data: {
          tenantId,
          caseId: legalCase.id,
          itemType: 'PRINCIPAL',
          originalAmount: opts.amount ?? '12345.67',
          demandedAmount: opts.amount ?? '12345.67',
          amount: opts.amount ?? '12345.67',
          currency: 'TRY',
          instrumentId: instrument.id,
          liableDebtorIds: [debtor.id],
        },
      });
    }
    return {
      tenantId,
      caseId: legalCase.id,
      requester,
      viewer,
      financeViewer,
      approver,
      approver2,
      viewerPartner,
      debtorId: debtor.id,
      strangerDebtorId: strangerDebtor.id,
      instrumentId: instrument.id,
    };
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;

  const body = (f: Fixture, extra: Record<string, unknown> = {}) => ({
    caseId: f.caseId,
    documentId: f.instrumentId,
    documentType: 'CEK',
    idempotencyKey: `k3-cek-${randomUUID()}`,
    liableDebtorIds: [f.debtorId],
    totalAmount: 12345.67,
    currency: 'TRY',
    checkPenaltyRate: 10,
    ...extra,
  });

  async function requestFormation(f: Fixture, extra: Record<string, unknown> = {}) {
    const res = await post('/claim-items/auto-generate', f.requester.userId, body(f, extra));
    expect(res.status).toBe(201);
    return res.body.data as {
      applied: boolean;
      approvalRequired: boolean;
      approvalRequestId: string;
      data: { replayed: boolean; items: { formationIntentId: string; position: number; sourceSlot: string }[] };
    };
  }

  const itemsOf = (f: Fixture) =>
    prisma.claimItem.findMany({ where: { tenantId: f.tenantId }, orderBy: { itemType: 'asc' } });
  const approvalOf = (id: string) => prisma.officeApprovalRequest.findUniqueOrThrow({ where: { id } });
  const snapshotsOf = (f: Fixture) => prisma.claimFormationSnapshot.count({ where: { tenantId: f.tenantId } });

  async function expectNothingFormed(f: Fixture, approvalRequestId: string, expectedItems = 0) {
    expect(await itemsOf(f)).toHaveLength(expectedItems);
    expect(await snapshotsOf(f)).toBe(0);
    const approval = await approvalOf(approvalRequestId);
    expect(approval.status).toBe(OfficeApprovalStatus.PENDING_APPROVAL);
    expect(approval.executionStatus).toBe(OfficeApprovalExecutionStatus.NOT_RUN);
  }

  describe('talep → ikinci avukat onayı → kesin kalemler', () => {
    it('onaydan önce kalem yok; onayda bedel + %10 tazminat aynı işlemde, çek kaydına bağlı ve sunucu tutarlarıyla doğar', async () => {
      const f = await fixture('happy');
      const requested = await requestFormation(f);
      expect(requested).toMatchObject({ applied: false, approvalRequired: true });
      expect(requested.data.items.map((i) => i.sourceSlot)).toEqual([
        'CASE_INSTRUMENT:PRINCIPAL',
        'CASE_INSTRUMENT:CHECK_PENALTY',
      ]);
      expect(await itemsOf(f)).toHaveLength(0);
      // Onaylayan detayda sunucu tutarlarını görür (bağlayıcı olmayan özet).
      const detail = await request(app.getHttpServer())
        .get(`/office-approvals/${requested.approvalRequestId}`)
        .set('x-test-user-id', f.approver.userId);
      expect(detail.status).toBe(200);
      expect(detail.body.data.reason).toContain('Çek bedeli 12345.67 TRY; Çek tazminatı (%10) 1234.57 TRY');

      const approve = await post(`/office-approvals/${requested.approvalRequestId}/approve`, f.approver.userId, { note: 'uygun' });
      expect(approve.status).toBe(201);

      const items = await itemsOf(f);
      const amounts = Object.fromEntries(
        items.map((i) => [i.itemType, [i.demandedAmount.toString(), i.originalAmount.toString()]]),
      );
      expect(amounts).toEqual({
        PRINCIPAL: ['12345.67', '12345.67'],
        CHECK_PENALTY: ['1234.57', '1234.57'], // 12.345,67 × %10 = 1.234,567 → yarıdan yukarı
      });
      for (const item of items) {
        expect(item.instrumentId).toBe(f.instrumentId);
        expect(item.sourceDocumentId).toBeNull();
        expect(item.liableDebtorIds).toEqual([f.debtorId]);
        expect(item.currency).toBe('TRY');
      }
      expect(await snapshotsOf(f)).toBe(2);
      const approval = await approvalOf(requested.approvalRequestId);
      expect(approval.status).toBe(OfficeApprovalStatus.APPROVED);
      expect(approval.approverUserId).toBe(f.approver.userId);
      expect(approval.executionStatus).toBe(OfficeApprovalExecutionStatus.SUCCEEDED);
    });

    it('kanonik çek bedeli zaten varsa pakete yalnız tazminat girer (mükerrer sayım yok)', async () => {
      const f = await fixture('canonical', { canonicalPrincipal: true });
      const requested = await requestFormation(f);
      expect(requested.data.items.map((i) => i.sourceSlot)).toEqual(['CASE_INSTRUMENT:CHECK_PENALTY']);
      const approve = await post(`/office-approvals/${requested.approvalRequestId}/approve`, f.approver.userId, {});
      expect(approve.status).toBe(201);
      const items = await itemsOf(f);
      expect(items.filter((i) => i.itemType === 'PRINCIPAL')).toHaveLength(1);
      expect(items.filter((i) => i.itemType === 'CHECK_PENALTY').map((i) => i.demandedAmount.toString())).toEqual(['1234.57']);
    });

    it('tekrarlanan istek aynı talebi döner; onay sonrası tekrar istek ve tekrar onay mükerrer kalem üretmez', async () => {
      const f = await fixture('replay');
      const payload = body(f);
      const first = await post('/claim-items/auto-generate', f.requester.userId, payload);
      const again = await post('/claim-items/auto-generate', f.requester.userId, payload);
      expect(first.status).toBe(201);
      expect(again.status).toBe(201);
      expect(again.body.data.approvalRequestId).toBe(first.body.data.approvalRequestId);
      expect(again.body.data.data.replayed).toBe(true);
      expect(await prisma.claimItemFormationIntent.count({ where: { tenantId: f.tenantId } })).toBe(2);

      const id = first.body.data.approvalRequestId;
      expect((await post(`/office-approvals/${id}/approve`, f.approver.userId, {})).status).toBe(201);
      const afterApproval = await post('/claim-items/auto-generate', f.requester.userId, payload);
      expect(afterApproval.status).toBe(201);
      expect(afterApproval.body.data).toMatchObject({ approvalRequestId: id, data: { replayed: true, approvalStatus: 'APPROVED' } });
      expect((await post(`/office-approvals/${id}/approve`, f.approver2.userId, {})).status).toBe(409);
      expect(await itemsOf(f)).toHaveLength(2);

      const fresh = await post('/claim-items/auto-generate', f.requester.userId, body(f));
      expect(fresh.status).toBe(409);
      expect(fresh.body.code).toBe('CHECK_PENALTY_ALREADY_EXISTS');
    });

    it('eşzamanlı aynı istek tek talep; eşzamanlı iki onaydan yalnız biri uygular', async () => {
      const f = await fixture('concurrent');
      const payload = body(f);
      const [a, b] = await Promise.all([
        post('/claim-items/auto-generate', f.requester.userId, payload),
        post('/claim-items/auto-generate', f.requester.userId, payload),
      ]);
      expect([a.status, b.status]).toEqual([201, 201]);
      expect(a.body.data.approvalRequestId).toBe(b.body.data.approvalRequestId);
      expect(await prisma.claimItemFormationIntent.count({ where: { tenantId: f.tenantId } })).toBe(2);

      const id = a.body.data.approvalRequestId;
      const decisions = await Promise.all([
        post(`/office-approvals/${id}/approve`, f.approver.userId, {}),
        post(`/office-approvals/${id}/approve`, f.approver2.userId, {}),
      ]);
      expect(decisions.map((d) => d.status).sort()).toEqual([201, 409]);
      expect(await itemsOf(f)).toHaveLength(2);
      expect(await snapshotsOf(f)).toBe(2);
    });
  });

  describe('ret / revizyon / iptal / değiştirerek onay kesin kalem oluşturmaz', () => {
    it.each([
      ['reject', 'appr', { note: 'uygun değil' }, 201, OfficeApprovalStatus.REJECTED],
      ['request-revision', 'appr', { note: 'borçluyu düzeltin' }, 201, OfficeApprovalStatus.REVISION_REQUESTED],
      ['cancel', 'req', {}, 201, OfficeApprovalStatus.CANCELLED],
      ['approve-with-changes', 'appr', { replacementSavedIntent: { any: 'change' } }, 400, OfficeApprovalStatus.PENDING_APPROVAL],
    ] as const)('%s → kalem yok', async (action, who, payload, status, finalStatus) => {
      const f = await fixture(`nonapprove-${action}`);
      const requested = await requestFormation(f);
      const actorId = who === 'req' ? f.requester.userId : f.approver.userId;
      const res = await post(`/office-approvals/${requested.approvalRequestId}/${action}`, actorId, payload);
      expect(res.status).toBe(status);
      expect(await itemsOf(f)).toHaveLength(0);
      expect(await snapshotsOf(f)).toBe(0);
      expect((await approvalOf(requested.approvalRequestId)).status).toBe(finalStatus);
    });
  });

  describe('talep reddi (yazma yok)', () => {
    it('VIEWER, yetkisiz avukat ve başka kiracı kullanıcı talep açamaz', async () => {
      const f = await fixture('deny');
      const other = await fixture('deny-other');
      for (const userId of [f.viewer.userId, f.financeViewer.userId, other.requester.userId]) {
        const res = await post('/claim-items/auto-generate', userId, body(f));
        expect(res.status).toBe(403);
      }
      expect(await prisma.claimItemFormationIntent.count({ where: { tenantId: f.tenantId } })).toBe(0);
      expect(await prisma.officeApprovalRequest.count({ where: { tenantId: f.tenantId } })).toBe(0);
    });

    it.each([
      ['istemci tutarı çek kaydıyla uyuşmuyor', { totalAmount: 99999 }, 400, 'CHECK_AMOUNT_MISMATCH'],
      ['para birimi uyuşmuyor', { currency: 'USD' }, 400, 'CHECK_CURRENCY_MISMATCH'],
      ['desteklenmeyen tazminat oranı', { checkPenaltyRate: 20 }, 400, 'CHECK_PENALTY_RATE_UNSUPPORTED'],
      ['idempotencyKey yok', { idempotencyKey: undefined }, 400, 'FORMATION_IDEMPOTENCY_KEY_REQUIRED'],
      ['sorumlu borçlu yok', { liableDebtorIds: [] }, 400, 'LIABLE_DEBTORS_REQUIRED'],
      ['kaynak kimliği çek kaydı değil', { documentId: 'not-an-instrument-id' }, 404, 'CHECK_RECORD_NOT_FOUND'],
    ])('%s → reddedilir', async (_name, extra, status, code) => {
      const f = await fixture('invalid');
      const res = await post('/claim-items/auto-generate', f.requester.userId, body(f, extra));
      expect(res.status).toBe(status);
      expect(res.body.code).toBe(code);
      expect(await prisma.claimItemFormationIntent.count({ where: { tenantId: f.tenantId } })).toBe(0);
    });

    it('dosyanın borçlusu olmayan borçlu ve karşılıksız olmayan çek reddedilir', async () => {
      const f = await fixture('debtor');
      const stranger = await post('/claim-items/auto-generate', f.requester.userId, body(f, { liableDebtorIds: [f.strangerDebtorId] }));
      expect(stranger.status).toBe(400);
      expect(stranger.body.code).toBe('LIABLE_DEBTOR_NOT_IN_CASE');
      const notBounced = await fixture('not-bounced', { bounced: false });
      const res = await post('/claim-items/auto-generate', notBounced.requester.userId, body(notBounced));
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('CHECK_NOT_DISHONOURED');
      expect(await prisma.claimItemFormationIntent.count({ where: { tenantId: { in: [f.tenantId, notBounced.tenantId] } } })).toBe(0);
    });

    it('aynı çek için onay bekleyen talep varken ikinci talep açılmaz', async () => {
      const f = await fixture('pending');
      await requestFormation(f);
      const second = await post('/claim-items/auto-generate', f.requester.userId, body(f));
      expect(second.status).toBe(409);
      expect(second.body.code).toBe('CHECK_FORMATION_ALREADY_PENDING');
    });
  });

  describe('onay reddi ve onay beklerken değişiklik (hiçbir kısmı kalmaz)', () => {
    it('öz-onay, VIEWER onaylayan ve başka kiracı onaylayan reddedilir', async () => {
      const f = await fixture('approve-deny');
      const other = await fixture('approve-deny-other');
      const requested = await requestFormation(f);
      // Mevcut öz-onay sözleşmesi: 400 SELF_APPROVAL_FORBIDDEN.
      const self = await post(`/office-approvals/${requested.approvalRequestId}/approve`, f.requester.userId, {});
      expect(self.status).toBe(400);
      expect(JSON.stringify(self.body)).toContain('SELF_APPROVAL_FORBIDDEN');
      for (const userId of [f.viewerPartner.userId, other.approver.userId]) {
        const res = await post(`/office-approvals/${requested.approvalRequestId}/approve`, userId, {});
        expect(res.status).toBe(403);
      }
      await expectNothingFormed(f, requested.approvalRequestId);
    });

    it('onay beklerken çek tutarı değişirse eski onay içeriği uygulanmaz (bayat kaynak)', async () => {
      const f = await fixture('stale');
      const requested = await requestFormation(f);
      await prisma.caseInstrument.update({ where: { id: f.instrumentId }, data: { amount: '20000.00' } });
      const res = await post(`/office-approvals/${requested.approvalRequestId}/approve`, f.approver.userId, {});
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('FORMATION_SOURCE_MISMATCH');
      await expectNothingFormed(f, requested.approvalRequestId);
    });

    it('onay beklerken borçlu dosyadan pasifleşirse kalem oluşmaz', async () => {
      const f = await fixture('debtor-passive');
      const requested = await requestFormation(f);
      await prisma.caseDebtor.updateMany({ where: { caseId: f.caseId, debtorId: f.debtorId }, data: { lifecycleStatus: 'PASSIVE' } });
      const res = await post(`/office-approvals/${requested.approvalRequestId}/approve`, f.approver.userId, {});
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('LIABLE_DEBTOR_NOT_IN_CASE');
      await expectNothingFormed(f, requested.approvalRequestId);
    });

    it('onaylayanın rütbesi / talep sahibinin dosya mali yetkisi onay beklerken alınırsa kalem oluşmaz', async () => {
      const f = await fixture('revoked');
      const requested = await requestFormation(f);
      await prisma.lawyer.update({ where: { id: f.approver.lawyerId }, data: { lawyerRank: 'LAWYER' } });
      const approverRevoked = await post(`/office-approvals/${requested.approvalRequestId}/approve`, f.approver.userId, {});
      expect(approverRevoked.status).toBe(403);
      await expectNothingFormed(f, requested.approvalRequestId);

      await prisma.caseLawyer.updateMany({
        where: { caseId: f.caseId, lawyerId: f.requester.lawyerId },
        data: { casePermissions: { canViewFinance: true } },
      });
      const requesterRevoked = await post(`/office-approvals/${requested.approvalRequestId}/approve`, f.approver2.userId, {});
      expect(requesterRevoked.status).toBe(403);
      await expectNothingFormed(f, requested.approvalRequestId);
    });

    it('çok kalemli pakette ikinci kalem düşerse ilk kalem de geri alınır (atomik)', async () => {
      const f = await fixture('atomic');
      const requested = await requestFormation(f);
      expect(requested.data.items).toHaveLength(2);
      // Onay beklerken çeke bağlı bir tazminat kalemi başka yoldan oluştu → 2. konum (CHECK_PENALTY) mükerrer.
      await prisma.claimItem.create({
        data: {
          tenantId: f.tenantId,
          caseId: f.caseId,
          itemType: 'CHECK_PENALTY',
          originalAmount: '1234.57',
          demandedAmount: '1234.57',
          amount: '1234.57',
          currency: 'TRY',
          instrumentId: f.instrumentId,
          liableDebtorIds: [f.debtorId],
        },
      });
      const res = await post(`/office-approvals/${requested.approvalRequestId}/approve`, f.approver.userId, {});
      expect(res.status).toBe(409);
      const items = await itemsOf(f);
      expect(items.map((i) => i.itemType)).toEqual(['CHECK_PENALTY']); // yalnız dışarıdan eklenen; PRINCIPAL geri alındı
      await expectNothingFormed(f, requested.approvalRequestId, 1);
    });
  });
});
