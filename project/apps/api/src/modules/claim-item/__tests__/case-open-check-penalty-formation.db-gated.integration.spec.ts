import { CanActivate, ExecutionContext, INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { OfficeApprovalExecutionStatus, OfficeApprovalStatus, PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import * as request from 'supertest';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { AuditService } from '../../audit/audit.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CaseService } from '../../case/case.service';
import { buildCaseInstrumentData } from '../../case/ocr-instrument-to-case-instrument.mapper';
import { ClaimItemModule } from '../claim-item.module';
import {
  CEK_AUTO_GENERATE_FORMATION_OPTIONS,
  CekAutoGenerateFormationService,
} from '../formation-cek/cek-auto-generate-formation.service';
import { previewCekFormation } from '../formation-cek/cek-formation-preview';

/**
 * K3-L Faz 2b (owner GO 2026-09-29 §4) — DOSYA AÇILIŞINDA çek tazminatı K3 bağlantısı, gerçek zincirle:
 * taslak önizleme (POST /claim-items/cek-formation/preview) → dosya açılışındaki commit-sonrası talep
 * (CaseService.requestCheckPenaltyFormationAfterCommit → mevcut CekAutoGenerateFormationService) → ikinci avukat onayı
 * (POST /office-approvals/:id/approve) → kesin kalem. Gerçek Nest grafiği (ClaimItemModule → OfficeApprovalModule) +
 * disposable PostgreSQL. K3 bayrakları (varsayılan KAPALI) yalnız bu izole test uygulamasında açılır.
 *
 * Kanıtlananlar: onaydan önce kalem yok (TASLAK); tekrar istek mükerrer talep/kalem üretmez; girdi onaydan ÖNCE
 * değişirse eski onay uygulanmaz; gösterilen önizleme kaydedilen girdiyle uyuşmuyorsa talep hiç açılmaz; veri eksikse
 * kör hesap yapılmaz; bayrak kapalıyken dosya açılışı etkilenmez ve hiçbir talep/kalem oluşmaz.
 */
const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('K3-L case-open check penalty formation DB gate requires TEST_DATABASE_URL in CI.');
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

describeWithDisposableDb('K3-L dosya açılışında çek tazminatı K3 bağlantısı (disposable PostgreSQL)', () => {
  jest.setTimeout(120_000);

  let prisma: PrismaClient;
  let enabledApp: INestApplication;
  let disabledApp: INestApplication;
  let enabledFormation: CekAutoGenerateFormationService;
  let disabledFormation: CekAutoGenerateFormationService;
  const tenantIds = new Set<string>();

  async function buildApp(options: { enabled: boolean; allowDraftLegalContent: boolean }) {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), ClaimItemModule],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(new DbUserIdentityGuard(() => prisma))
      .overrideProvider(CEK_AUTO_GENERATE_FORMATION_OPTIONS)
      .useValue(options)
      .compile();
    const app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe(PRODUCTION_VALIDATION_OPTIONS));
    await app.init();
    return { app, formation: moduleRef.get(CekAutoGenerateFormationService, { strict: false }) };
  }

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await prisma.$connect();
    const enabled = await buildApp({ enabled: true, allowDraftLegalContent: true });
    enabledApp = enabled.app;
    enabledFormation = enabled.formation;
    const disabled = await buildApp({ enabled: false, allowDraftLegalContent: false });
    disabledApp = disabled.app;
    disabledFormation = disabled.formation;
  });

  afterAll(async () => {
    await enabledApp?.close();
    await disabledApp?.close();
    for (const tenantId of tenantIds) {
      await prisma.auditLog.deleteMany({ where: { tenantId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  const post = (path: string, userId: string, body: Record<string, unknown>) =>
    request(enabledApp.getHttpServer()).post(path).set('x-test-user-id', userId).send(body);

  /** CaseService'in yalnız commit-sonrası K3 adımı — gerçek talep servisi ve gerçek denetim yazıcısıyla. */
  const caseServiceWith = (formation: CekAutoGenerateFormationService | undefined) =>
    Object.assign(Object.create(CaseService.prototype), {
      cekFormation: formation,
      auditService: new AuditService(prisma as never),
      logger: { warn: jest.fn(), log: jest.fn(), error: jest.fn() },
    }) as CaseService;

  /** POST /cases'in ürettiği kayıtların aynısı: çek kaydı (karşılıksız bilgisiyle) + kanonik çek bedeli kalemi. */
  async function openedCase(
    label: string,
    opts: { bounced?: boolean; amount?: number; openerCasePermissions?: Record<string, boolean> | null } = {},
  ) {
    const suffix = randomUUID().slice(0, 8);
    const tenantId = `test-ci-k3l2b-${label}-${suffix}`;
    tenantIds.add(tenantId);
    await prisma.tenant.create({ data: { id: tenantId, name: `CI K3L 2b ${label}`, slug: tenantId } });
    const office = await prisma.office.create({ data: { tenantId, name: `CI K3L 2b ofis ${label}` } });
    const legalCase = await prisma.case.create({
      data: { tenantId, fileNumber: `CI-K3L-2B-${label}-${suffix}`, type: 'CHECK' },
    });
    async function actor(key: string, rank: 'LAWYER' | 'PARTNER', casePermissions: Record<string, boolean> | null | undefined) {
      const user = await prisma.user.create({
        data: { tenantId, email: `${key}-${suffix}@example.test`, name: key, surname: 'K3L', role: 'USER' },
      });
      const lawyer = await prisma.lawyer.create({
        data: { tenantId, officeId: office.id, userId: user.id, name: key, surname: 'K3L', lawyerRank: rank },
      });
      if (casePermissions !== undefined) {
        // null: POST /cases'in ürettiği varsayılan atama (casePermissions YOK, permissionSource DEFAULT)
        await prisma.caseLawyer.create({
          data: { caseId: legalCase.id, lawyerId: lawyer.id, ...(casePermissions ? { casePermissions } : {}) },
        });
      }
      return { userId: user.id };
    }
    const opener = await actor(
      'opener',
      'LAWYER',
      opts.openerCasePermissions === undefined ? { canEditFinance: true } : opts.openerCasePermissions,
    );
    const approver = await actor('approver', 'PARTNER', undefined);
    const kesideci = await prisma.debtor.create({ data: { tenantId, type: 'COMPANY', name: `2b kesideci ${label}` } as never });
    const ciranta = await prisma.debtor.create({ data: { tenantId, type: 'COMPANY', name: `2b ciranta ${label}` } as never });
    const caseDebtors = [
      { debtorId: kesideci.id, role: 'KESIDECI' },
      { debtorId: ciranta.id, role: 'CIRANTA' },
    ];
    for (const cd of caseDebtors) {
      await prisma.caseDebtor.create({ data: { caseId: legalCase.id, debtorId: cd.debtorId, role: cd.role as never } });
    }
    const amount = opts.amount ?? 12345.67;
    const bounced = opts.bounced ?? true;
    const instrumentInput = {
      type: 'CEK',
      amount,
      issueDate: '2026-08-01',
      documentNo: `2B-${suffix}`,
      currency: 'TRY',
      dueDate: '2026-08-31',
      ...(bounced ? { isBounced: true, bounceDate: '2026-09-01' } : {}),
    };
    // Dosya açılışındaki gerçek eşleyici: karşılıksız bilgisi çek kaydına buradan yazılır
    const instrument = await prisma.caseInstrument.create({
      data: buildCaseInstrumentData(tenantId, legalCase.id, instrumentInput as never, 'CEK' as never),
    });
    await prisma.claimItem.create({
      data: {
        tenantId,
        caseId: legalCase.id,
        itemType: 'PRINCIPAL',
        originalAmount: amount,
        demandedAmount: amount,
        amount,
        currency: 'TRY',
        instrumentId: instrument.id,
        liableDebtorIds: [],
      },
    });
    const createdRef = {
      id: instrument.id,
      amount,
      currency: 'TRY',
      isBounced: instrument.isBounced === true,
      bounceDate: instrument.bounceDate ? instrument.bounceDate.toISOString().slice(0, 10) : null,
    };
    return { tenantId, caseId: legalCase.id, opener, approver, kesideciId: kesideci.id, cirantaId: ciranta.id, caseDebtors, instrument, createdRef, amount };
  }
  type Opened = Awaited<ReturnType<typeof openedCase>>;

  /** Sihirbazın gördüğü taslak önizleme — gerçek HTTP ucu (yazma yapmaz). */
  async function wizardPreview(f: Opened, over: { amount?: number } = {}) {
    const res = await post('/claim-items/cek-formation/preview', f.opener.userId, {
      instruments: [{ amount: over.amount ?? f.amount, currency: 'TRY', isBounced: true, bounceDate: '2026-09-01' }],
      debtors: f.caseDebtors.map((d) => ({ tempId: d.debtorId, role: d.role })),
    });
    expect(res.status).toBe(201);
    return res.body.data as { durum: string; previewHash: string; uyari: string; tazminat: { tutar: number; sorumluTempIds: string[] } | null };
  }

  /** Sihirbazın kullanıcıya GÖSTERDİĞİ önizleme hash'i (açılıştaki kayıtlarla aynı girdi) — K6 gereği talepte zorunlu. */
  const shownPreviewHash = (f: Opened) =>
    previewCekFormation({
      instruments: [{ amount: String(f.createdRef.amount), currency: f.createdRef.currency, isBounced: f.createdRef.isBounced, bounceDate: f.createdRef.bounceDate }],
      debtors: f.caseDebtors.map((d) => ({ tempId: d.debtorId, role: d.role })),
    }).previewHash;

  const openWithFormation = (
    f: Opened,
    formation: CekAutoGenerateFormationService | undefined,
    checkPenaltyFormation: Record<string, unknown>,
  ) =>
    (caseServiceWith(formation) as any).requestCheckPenaltyFormationAfterCommit(
      f.tenantId,
      f.opener.userId,
      {
        caseDebtors: f.caseDebtors,
        checkPenaltyFormation:
          checkPenaltyFormation.requested && !('previewHash' in checkPenaltyFormation)
            ? { ...checkPenaltyFormation, previewHash: shownPreviewHash(f) }
            : checkPenaltyFormation,
      },
      f.caseId,
      [f.createdRef],
    );

  const penaltyItems = (f: Opened) =>
    prisma.claimItem.findMany({ where: { tenantId: f.tenantId, itemType: 'CHECK_PENALTY' } });
  const approvals = (f: Opened) => prisma.officeApprovalRequest.findMany({ where: { tenantId: f.tenantId } });

  it('önizleme ucu yazma yapmaz ve tutarı sunucuda hesaplar (TASLAK); veri eksikse tutar üretmez', async () => {
    const f = await openedCase('preview');
    const before = await prisma.claimItem.count({ where: { tenantId: f.tenantId } });
    const preview = await wizardPreview(f);
    expect(preview).toMatchObject({
      durum: 'HESAPLANDI',
      uyari: 'Taslak — onay bekliyor, gönderime hazır değil',
      tazminat: { tutar: 1234.57, sorumluTempIds: [f.kesideciId] },
    });
    const missing = await post('/claim-items/cek-formation/preview', f.opener.userId, {
      instruments: [{ amount: f.amount, currency: 'TRY' }],
      debtors: f.caseDebtors.map((d) => ({ tempId: d.debtorId, role: d.role })),
    });
    expect(missing.body.data).toMatchObject({ durum: 'VERI_EKSIK', kod: 'CHECK_NOT_DISHONOURED', tazminat: null });
    expect(await prisma.claimItem.count({ where: { tenantId: f.tenantId } })).toBe(before);
    expect(await approvals(f)).toHaveLength(0);
  });

  it('açık seçimle açılış: talep onay bekler (kalem YOK); ikinci avukat onayıyla tazminat kesinleşir, yalnız keşideci sorumlu', async () => {
    const f = await openedCase('happy');
    const preview = await wizardPreview(f);
    const outcome = await openWithFormation(f, enabledFormation, {
      requested: true,
      idempotencyKey: `wizard-${f.caseId}`,
      previewHash: preview.previewHash,
    });
    expect(outcome).toMatchObject({
      requested: true,
      taslak: true,
      serverPreviewHash: preview.previewHash,
      results: [{ instrumentId: f.instrument.id, status: 'REQUESTED' }],
    });
    // Onaydan önce kesin kalem yok: tazminat iç bakiyeye/mahsuba girmez
    expect(await penaltyItems(f)).toHaveLength(0);
    const [approval] = await approvals(f);
    expect(approval).toMatchObject({ id: outcome.results[0].approvalRequestId, status: OfficeApprovalStatus.PENDING_APPROVAL });
    // Önizleme ↔ talep ↔ onay bağı denetimde
    const audit = await prisma.auditLog.findFirst({
      where: { tenantId: f.tenantId, action: 'CASE_OPEN_CHECK_PENALTY_FORMATION_REQUESTED', entityId: f.caseId },
    });
    expect((audit?.metadata as any)?.previewHash).toBe(preview.previewHash);
    expect((audit?.metadata as any)?.results?.[0]?.approvalRequestId).toBe(approval.id);

    const approve = await post(`/office-approvals/${approval.id}/approve`, f.approver.userId, { note: 'uygun' });
    expect(approve.status).toBe(201);
    const items = await penaltyItems(f);
    expect(items.map((i) => [i.demandedAmount.toString(), i.liableDebtorIds, i.instrumentId])).toEqual([
      ['1234.57', [f.kesideciId], f.instrument.id],
    ]);
    // Çek bedeli açılışta bir kez yazıldı; onay ikinci bedel kalemi üretmez (mükerrer sayım yok)
    expect(await prisma.claimItem.count({ where: { tenantId: f.tenantId, itemType: 'PRINCIPAL' } })).toBe(1);
  });

  it('tekrar istek mükerrer kayıt üretmez: aynı anahtar → aynı talep (REPLAYED); onay sonrası tekrar → kalem tek', async () => {
    const f = await openedCase('replay');
    const selection = { requested: true, idempotencyKey: `wizard-${f.caseId}` };
    const first = await openWithFormation(f, enabledFormation, selection);
    const second = await openWithFormation(f, enabledFormation, selection);
    expect(first.results[0].status).toBe('REQUESTED');
    expect(second.results[0]).toMatchObject({ status: 'REPLAYED', approvalRequestId: first.results[0].approvalRequestId });
    expect(await approvals(f)).toHaveLength(1);

    const approve = await post(`/office-approvals/${first.results[0].approvalRequestId}/approve`, f.approver.userId, {});
    expect(approve.status).toBe(201);
    const third = await openWithFormation(f, enabledFormation, selection);
    expect(third.results[0].status).toBe('REPLAYED');
    expect(await penaltyItems(f)).toHaveLength(1);
    expect(await approvals(f)).toHaveLength(1);
  });

  it('DEĞİŞEN GİRDİ: talepten sonra çek tutarı değişirse eski onay kullanılamaz; hiçbir kalem oluşmaz', async () => {
    const f = await openedCase('stale');
    const outcome = await openWithFormation(f, enabledFormation, { requested: true, idempotencyKey: `wizard-${f.caseId}` });
    await prisma.caseInstrument.update({ where: { id: f.instrument.id }, data: { amount: '20000.00' } });
    const approve = await post(`/office-approvals/${outcome.results[0].approvalRequestId}/approve`, f.approver.userId, {});
    expect(approve.status).toBe(409);
    expect(approve.body.code).toBe('FORMATION_SOURCE_MISMATCH');
    expect(await penaltyItems(f)).toHaveLength(0);
    const [approval] = await approvals(f);
    expect(approval.status).toBe(OfficeApprovalStatus.PENDING_APPROVAL);
    expect(approval.executionStatus).toBe(OfficeApprovalExecutionStatus.NOT_RUN);
  });

  it('DEĞİŞEN GİRDİ: talepten sonra keşidecinin rolü değişirse eski onay kullanılamaz', async () => {
    const f = await openedCase('role');
    const outcome = await openWithFormation(f, enabledFormation, { requested: true, idempotencyKey: `wizard-${f.caseId}` });
    await prisma.caseDebtor.updateMany({ where: { caseId: f.caseId, debtorId: f.kesideciId }, data: { role: 'CIRANTA' } });
    const approve = await post(`/office-approvals/${outcome.results[0].approvalRequestId}/approve`, f.approver.userId, {});
    expect(approve.status).toBe(409);
    expect(approve.body.code).toBe('LIABILITY_ROLE_CHANGED');
    expect(await penaltyItems(f)).toHaveLength(0);
  });

  it('gösterilen önizleme kaydedilen girdiyle uyuşmuyorsa talep HİÇ açılmaz', async () => {
    const f = await openedCase('mismatch');
    const shown = await wizardPreview(f, { amount: 9000 }); // kullanıcı 9.000 TL üzerinden önizleme gördü
    const outcome = await openWithFormation(f, enabledFormation, {
      requested: true,
      idempotencyKey: `wizard-${f.caseId}`,
      previewHash: shown.previewHash,
    });
    expect(outcome).toMatchObject({ skippedReason: 'PREVIEW_INPUT_CHANGED', results: [] });
    expect(await approvals(f)).toHaveLength(0);
    expect(await penaltyItems(f)).toHaveLength(0);
  });

  it('karşılıksız bilgisi olmayan çekte kör hesap yok: talep açılmaz', async () => {
    const f = await openedCase('notbounced', { bounced: false });
    expect(f.instrument.isBounced).toBe(false);
    const outcome = await openWithFormation(f, enabledFormation, { requested: true, idempotencyKey: `wizard-${f.caseId}` });
    expect(outcome).toMatchObject({ skippedReason: 'CHECK_NOT_DISHONOURED', results: [], tazminat: null });
    expect(await approvals(f)).toHaveLength(0);
  });

  it('kullanıcı seçmediyse ya da K3 bayrağı KAPALIYSA hiçbir talep/kalem oluşmaz; red yutulmaz', async () => {
    const f = await openedCase('flagoff');
    expect(await openWithFormation(f, enabledFormation, { requested: false })).toBeUndefined();
    const outcome = await openWithFormation(f, disabledFormation, { requested: true, idempotencyKey: `wizard-${f.caseId}` });
    expect(outcome.results).toHaveLength(1);
    expect(outcome.results[0]).toMatchObject({ instrumentId: f.instrument.id, status: 'REJECTED' });
    expect(String(outcome.results[0].errorCode)).toMatch(/FORMATION/);
    expect(await approvals(f)).toHaveLength(0);
    expect(await penaltyItems(f)).toHaveLength(0);
  });

  it('GERÇEK AÇILIŞ YETKİ DURUMU: POST /cases avukatı yetkisiz atar → mevcut kapı talebi REDDEDER (atlanmaz); hiçbir kayıt yok, neden açık', async () => {
    const f = await openedCase('noperm', { openerCasePermissions: null });
    const assignment = await prisma.caseLawyer.findFirstOrThrow({ where: { caseId: f.caseId } });
    expect(assignment.casePermissions).toBeNull();
    const outcome = await openWithFormation(f, enabledFormation, { requested: true, idempotencyKey: `wizard-${f.caseId}` });
    expect(outcome.results).toEqual([
      {
        instrumentId: f.instrument.id,
        status: 'REJECTED',
        errorCode: 'CASE_FINANCE_PERMISSION_REQUIRED',
        message: expect.stringContaining('mali düzenleme yetkiniz yok'),
      },
    ]);
    expect(await approvals(f)).toHaveLength(0);
    expect(await penaltyItems(f)).toHaveLength(0);
    // Ret dosya açılışını geri almaz; çek bedeli kalemi yerinde
    expect(await prisma.claimItem.count({ where: { tenantId: f.tenantId, itemType: 'PRINCIPAL' } })).toBe(1);
  });

  it('K6: gösterilen önizlemenin hash\'i olmadan talep AÇILMAZ; atlanan talep denetime yazılır', async () => {
    const f = await openedCase('nohash');
    const outcome = await openWithFormation(f, enabledFormation, {
      requested: true,
      idempotencyKey: `wizard-${f.caseId}`,
      previewHash: undefined,
    });
    expect(outcome).toMatchObject({ skippedReason: 'PREVIEW_REQUIRED', results: [] });
    expect(await approvals(f)).toHaveLength(0);
    expect(await penaltyItems(f)).toHaveLength(0);
    const audit = await prisma.auditLog.findFirst({
      where: { tenantId: f.tenantId, action: 'CASE_OPEN_CHECK_PENALTY_FORMATION_SKIPPED', entityId: f.caseId },
    });
    expect((audit?.metadata as any)?.skippedReason).toBe('PREVIEW_REQUIRED');
  });
});
