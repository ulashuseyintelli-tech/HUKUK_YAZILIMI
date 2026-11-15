import { CanActivate, ExecutionContext, INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { OfficeApprovalExecutionStatus, OfficeApprovalStatus, PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import * as request from 'supertest';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { AccountingJournalWriterService } from '../../accounting-journal/accounting-journal.writer';
import { AuditService } from '../../audit/audit.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CaseDebtorLifecycleGuardService } from '../../case-debtor-lifecycle-guard/case-debtor-lifecycle-guard.service';
import { ClaimItemModule } from '../../claim-item/claim-item.module';
import { CollectionService } from '../../collection/collection.service';
import { CollectionType, type CreateCollectionDto } from '../../collection/dto/collection.dto';
import { ReceiptObjectScopeAuthorizationService } from '../../collection/receipt-object-scope-authorization.service';
import { DomainEventIngestService } from '../../icrabot/domain-event-ingest';
import { TBK100AllocatorService } from '../../interest-engine/allocation/tbk100-allocator.service';
import { OfficeApprovalService } from '../../office-approval/office-approval.service';
import { SummaryEngineService } from '../../summary-engine/summary-engine.service';
import { ClaimLiabilityModule } from '../claim-liability.module';

/**
 * SEÇİMLİK KALEM BAZLI BORÇLU SORUMLULUĞU — seçim komutları (karar günlüğü 2026-11-15).
 * GERÇEK HTTP + üretim ValidationPipe + kalem yazma kapısı + mevcut iki kişi onayı + onay yürütmesi + disposable PostgreSQL.
 *
 * Kanıtlananlar: seçim → onay bekler → onay → sürüm etkin, izdüşüm yazılmış; ret → değişiklik yok; talep eden
 * kendi talebini onaylayamaz (AT-18); bayat önizleme (AT-19); toplu uygulama ya hep ya hiç (AT-20); değişiklik — tasarım
 * Örnek 4 (AT-21); reddedilen girdiler (AT-22); etkin seçim varken eski alan yaması (AT-23); bayrak (AT-24).
 * Tutarlar SENTETİKTİR.
 */
const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('Claim liability selection DB gate requires TEST_DATABASE_URL in CI.');
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;
const PRODUCTION_VALIDATION_OPTIONS = { whitelist: true, forbidNonWhitelisted: true, transform: true } as const;
const FLAG = 'CLAIM_LIABILITY_SELECTION_ENABLED';

/** JwtStrategy → validateUser sözleşmesi: req.user DB'den okunan tam User satırı; pasif kullanıcı reddedilir. */
class DbUserIdentityGuard implements CanActivate {
  constructor(private readonly db: () => PrismaClient) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const user = await this.db().user.findUnique({ where: { id: String(req.headers['x-test-user-id']) }, include: { tenant: true } });
    if (!user || !user.isActive) throw new UnauthorizedException();
    req.user = user;
    return true;
  }
}

describeWithDisposableDb('Seçimlik borçlu sorumluluğu — seçim, onay ve geçmiş (HTTP + disposable PostgreSQL)', () => {
  jest.setTimeout(180_000);

  let prisma: PrismaClient;
  let app: INestApplication;
  let approvals: OfficeApprovalService;
  let engine: SummaryEngineService;
  const previousFlag = process.env[FLAG];

  beforeAll(async () => {
    process.env[FLAG] = 'true';
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await prisma.$connect();
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), ClaimItemModule, ClaimLiabilityModule],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(new DbUserIdentityGuard(() => prisma))
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe(PRODUCTION_VALIDATION_OPTIONS));
    await app.init();
    approvals = app.get(OfficeApprovalService);
    engine = new SummaryEngineService(prisma as never, new TBK100AllocatorService());
    await engine.onModuleInit();
  });

  beforeEach(() => {
    process.env[FLAG] = 'true';
  });

  afterAll(async () => {
    await app?.close();
    await prisma.$disconnect();
    if (previousFlag === undefined) delete process.env[FLAG];
    else process.env[FLAG] = previousFlag;
  });

  const collections = () =>
    new CollectionService(
      prisma as any,
      new DomainEventIngestService(),
      new CaseDebtorLifecycleGuardService(prisma as any),
      engine,
      new AccountingJournalWriterService(prisma as any),
      undefined,
      new AuditService(prisma as any),
      new ReceiptObjectScopeAuthorizationService(prisma as any, { isSecretConfigured: () => false } as any),
    );

  type Fixture = Awaited<ReturnType<typeof fixture>>;

  async function fixture(label: string, amounts: number[] = [12000]) {
    const suffix = randomUUID().slice(0, 8);
    const tenantId = `test-liab-sel-${label}-${suffix}`;
    await prisma.tenant.create({ data: { id: tenantId, name: `LIAB SEL ${label}`, slug: tenantId } });
    const office = await prisma.office.create({ data: { tenantId, name: `LIAB office ${label}` } });
    const requesterUser = await prisma.user.create({ data: { tenantId, email: `liab-req-${suffix}@example.test`, name: 'Talep', surname: 'Eden', role: 'USER' } });
    const requesterLawyer = await prisma.lawyer.create({
      data: { tenantId, officeId: office.id, userId: requesterUser.id, name: 'Talep', surname: 'Eden', lawyerRank: 'LAWYER' },
    });
    const approverUser = await prisma.user.create({ data: { tenantId, email: `liab-appr-${suffix}@example.test`, name: 'Onay', surname: 'Veren', role: 'ADMIN' } });
    await prisma.lawyer.create({
      data: { tenantId, officeId: office.id, userId: approverUser.id, name: 'Onay', surname: 'Veren', lawyerRank: 'PARTNER' },
    });
    const legalCase = await prisma.case.create({
      data: { tenantId, fileNumber: `LIAB-SEL-${label}-${suffix}`, type: 'GENERAL_EXECUTION', caseStatus: 'DERDEST', status: 'ACTIVE', currency: 'TRY' } as never,
    });
    await prisma.caseLawyer.create({ data: { caseId: legalCase.id, lawyerId: requesterLawyer.id, casePermissions: { canEditFinance: true } } });
    const debtors: Array<{ caseDebtorId: string; debtorId: string }> = [];
    for (let index = 1; index <= 2; index += 1) {
      const debtor = await prisma.debtor.create({ data: { tenantId, type: 'INDIVIDUAL', name: `Sentetik Borçlu ${index}` } as never });
      const caseDebtor = await prisma.caseDebtor.create({ data: { caseId: legalCase.id, debtorId: debtor.id, role: 'ASIL_BORCLU' } });
      debtors.push({ caseDebtorId: caseDebtor.id, debtorId: debtor.id });
    }
    const itemIds: string[] = [];
    for (const [index, amount] of amounts.entries()) {
      const item = await prisma.claimItem.create({
        data: {
          tenantId,
          caseId: legalCase.id,
          itemType: 'PRINCIPAL',
          originalAmount: amount,
          demandedAmount: amount,
          amount,
          currency: 'TRY',
          interestAccrualStatus: 'NO_INTEREST',
          liableDebtorIds: [],
          sortOrder: index + 1,
        },
      });
      itemIds.push(item.id);
    }
    return {
      tenantId,
      caseId: legalCase.id,
      requesterUserId: requesterUser.id,
      approverUserId: approverUser.id,
      b1: debtors[0],
      b2: debtors[1],
      itemIds,
      k1: itemIds[0],
    };
  }

  const http = () => request(app.getHttpServer());
  const preview = (f: Fixture, selections: unknown[], userId = f.requesterUserId) =>
    http().post(`/cases/${f.caseId}/claim-liability/preview`).set('x-test-user-id', userId).send({ selections });
  const requestSelection = (f: Fixture, selections: unknown[], onizlemeOzeti: string, userId = f.requesterUserId) =>
    http().post(`/cases/${f.caseId}/claim-liability/request`).set('x-test-user-id', userId).send({ selections, onizlemeOzeti });
  const history = (f: Fixture, claimItemId?: string) =>
    http().get(`/cases/${f.caseId}/claim-liability/history${claimItemId ? `?claimItemId=${claimItemId}` : ''}`).set('x-test-user-id', f.requesterUserId);

  const joint = (f: Fixture, claimItemId = f.k1) => ({
    claimItemId,
    mode: 'JOINT_AND_SEVERAL',
    basis: 'COURT_JUDGMENT',
    parties: [{ caseDebtorId: f.b1.caseDebtorId }, { caseDebtorId: f.b2.caseDebtorId }],
  });
  const proportional = (f: Fixture, weights: [number, number] = [1, 1], claimItemId = f.k1) => ({
    claimItemId,
    mode: 'PROPORTIONAL',
    basis: 'CONTRACT',
    parties: [
      { caseDebtorId: f.b1.caseDebtorId, shareWeight: weights[0] },
      { caseDebtorId: f.b2.caseDebtorId, shareWeight: weights[1] },
    ],
  });

  /** Önizle → talep et; onay kaydını döndürür (seçim henüz YAZILMAMIŞTIR). */
  async function ask(f: Fixture, selections: unknown[]) {
    const previewed = await preview(f, selections);
    expect(previewed.status).toBe(201);
    const requested = await requestSelection(f, selections, previewed.body.onizlemeOzeti);
    expect(requested.status).toBe(201);
    expect(requested.body).toEqual(expect.objectContaining({ applied: false, approvalRequired: true, status: OfficeApprovalStatus.PENDING_APPROVAL }));
    return { preview: previewed.body, approvalRequestId: requested.body.approvalRequestId as string };
  }
  async function apply(f: Fixture, selections: unknown[]) {
    const asked = await ask(f, selections);
    await approvals.approve(asked.approvalRequestId, f.approverUserId);
    return asked;
  }

  const pay = (f: Fixture, amount: number, caseDebtorId?: string) =>
    collections().create(
      f.tenantId,
      {
        caseId: f.caseId,
        idempotencyKey: `liab-sel-pay-${randomUUID()}`,
        amount,
        currency: 'TRY',
        type: CollectionType.BANK_TRANSFER,
        date: '2026-09-20T09:00:00.000Z',
        ...(caseDebtorId ? { caseDebtorId } : {}),
      } as CreateCollectionDto,
      `actor-${f.tenantId}`,
    );

  const sets = (f: Fixture) =>
    prisma.claimItemLiabilitySet.findMany({ where: { caseId: f.caseId }, include: { parties: { orderBy: { sortOrder: 'asc' } } }, orderBy: [{ claimItemId: 'asc' }, { version: 'asc' }] });
  const item = (id: string) => prisma.claimItem.findUniqueOrThrow({ where: { id } });
  const financialSnapshot = async (f: Fixture) => ({
    ledgerEntries: await prisma.ledgerEntry.count({ where: { caseId: f.caseId } }),
    ledgerAllocations: await prisma.ledgerAllocation.count({ where: { ledgerEntry: { caseId: f.caseId } } }),
    collected: (await prisma.claimItem.findMany({ where: { caseId: f.caseId }, orderBy: { sortOrder: 'asc' } })).map((row) => Number(row.collectedAmount)),
    collections: (await prisma.collection.findMany({ where: { caseId: f.caseId }, orderBy: { createdAt: 'asc' } })).map((row) => [Number(row.amount), row.caseDebtorId]),
  });

  it('AT-18 seçim → onay bekler → onay → sürüm 1 etkin, izdüşüm yazılmış; talep eden kendi talebini onaylayamaz', async () => {
    const f = await fixture('approve');
    const { preview: previewBody, approvalRequestId } = await ask(f, [proportional(f, [6000, 4000])]);
    expect(previewBody).toMatchObject({ uygulamaTuru: 'SINGLE', uygulanabilir: true });
    expect(previewBody.kalemler[0]).toMatchObject({ oncekiTur: 'BELIRLENMEDI', sonrakiTur: 'PAYLI', engeller: [], girdiHatalari: [] });
    expect(previewBody.kalemler[0].borclular.map((row: any) => [row.oncekiKalanSorumluluk, row.sonrakiKalanSorumluluk, row.sonrakiPay]).sort()).toEqual([
      [null, 4800, 4800],
      [null, 7200, 7200],
    ]);

    // Onaydan önce hiçbir şey yazılmadı; talep mevcut yüksek etkili kalem değişikliği yolunda
    const pending = await prisma.officeApprovalRequest.findUniqueOrThrow({ where: { id: approvalRequestId } });
    expect(pending).toMatchObject({ actionCode: 'CLAIM_ITEM_HIGH_IMPACT_CHANGE', targetType: 'CLAIM_ITEM', targetRef: f.k1, requesterUserId: f.requesterUserId });
    expect(await sets(f)).toEqual([]);
    expect(await item(f.k1)).toMatchObject({ isAllDebtorsLiable: true, liableDebtorIds: [] });
    // Onaylayan gördüğünü onaylar: kayıtlı niyet okunur özeti taşır (yalnız gösterim; pay burada hesaplanmaz)
    expect((pending.savedIntent as any).selections[0].display).toEqual({
      kalem: 'PRINCIPAL',
      tur: 'PAYLI',
      taraflar: ['Sentetik Borçlu 1: pay ağırlığı 6000 / 10000', 'Sentetik Borçlu 2: pay ağırlığı 4000 / 10000'],
      dayanak: 'CONTRACT',
    });

    // Mevcut kural: talep eden kendi talebini onaylayamaz
    await expect(approvals.approve(approvalRequestId, f.requesterUserId)).rejects.toThrow();
    expect(await sets(f)).toEqual([]);

    const decisionResult = await approvals.approve(approvalRequestId, f.approverUserId);
    // Onay yanıtı, alan eşitlemesi SONRASI kaydı taşır: aynı işlemde uygulanan seçim "çalışmadı" görünmez.
    expect(decisionResult).toMatchObject({ status: OfficeApprovalStatus.APPROVED, executionStatus: OfficeApprovalExecutionStatus.SUCCEEDED });
    const executed = await prisma.officeApprovalRequest.findUniqueOrThrow({ where: { id: approvalRequestId } });
    expect(executed).toMatchObject({ status: OfficeApprovalStatus.APPROVED, executionStatus: OfficeApprovalExecutionStatus.SUCCEEDED });
    const written = await sets(f);
    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({
      tenantId: f.tenantId,
      claimItemId: f.k1,
      version: 1,
      mode: 'PROPORTIONAL',
      status: 'ACTIVE',
      basis: 'CONTRACT',
      limitScope: null,
      appliedVia: 'SINGLE',
      bulkOperationId: null,
      approvalRequestId,
      decidedByUserId: f.requesterUserId,
    });
    expect(written[0].parties.map((party) => [party.caseDebtorId, party.shareWeight])).toEqual([
      [f.b1.caseDebtorId, 6000],
      [f.b2.caseDebtorId, 4000],
    ]);
    // İzdüşüm: paylı → kısıtlı kalem, BOŞ liste (eski kod bu kaleme mahsup yapamaz)
    expect(await item(f.k1)).toMatchObject({ isAllDebtorsLiable: false, liableDebtorIds: [] });
    expect(await prisma.auditLog.count({ where: { tenantId: f.tenantId, entityId: f.k1, action: 'CLAIM_ITEM_LIABILITY_SELECTION_APPLIED' } })).toBe(1);
  });

  it('AT-18 ret → hiçbir değişiklik yok', async () => {
    const f = await fixture('reject');
    const before = await item(f.k1);
    const { approvalRequestId } = await ask(f, [joint(f)]);
    await approvals.reject(approvalRequestId, f.approverUserId, 'sentetik ret');
    expect(await sets(f)).toEqual([]);
    const after = await item(f.k1);
    expect(after).toMatchObject({ isAllDebtorsLiable: true, liableDebtorIds: [] });
    expect(after.updatedAt.toISOString()).toBe(before.updatedAt.toISOString());
  });

  it('önizlemenin "sonraki" türü onayda yazılacak izdüşümle hesaplanır: seçili türden belirlenmediye dönüş "BELIRLENMEDI" görünür ve onay sonrası gerçek durumla aynıdır', async () => {
    const undetermined = (f: Fixture) => ({ claimItemId: f.k1, mode: 'UNDETERMINED' });

    // Müteselsil seçimin izdüşümü: kısıtlı + sorumlu listesi. Önizleme bu ESKİ izdüşümü görüp "kayıttan kısıtlı" dememeli.
    const f = await fixture('preview-after-joint');
    await apply(f, [joint(f)]);
    expect(await item(f.k1)).toMatchObject({ isAllDebtorsLiable: false });
    const { preview: previewBody } = await apply(f, [undetermined(f)]);
    expect(previewBody.kalemler[0]).toMatchObject({ oncekiTur: 'MUTESELSIL', sonrakiTur: 'BELIRLENMEDI', engeller: [], girdiHatalari: [] });
    // Onaydan sonra oluşan gerçek durum, önizlemenin söylediğiyle aynı: izdüşüm (herkes, boş liste), etkin sürüm belirlenmedi.
    expect(await item(f.k1)).toMatchObject({ isAllDebtorsLiable: true, liableDebtorIds: [] });
    expect((await sets(f)).map((set) => [set.version, set.mode, set.status])).toEqual([
      [1, 'JOINT_AND_SEVERAL', 'SUPERSEDED'],
      [2, 'UNDETERMINED', 'ACTIVE'],
    ]);
    // Yeniden önizlemede "önceki" tür artık belirlenmedi: önizlemenin "sonraki" değeri ile sonraki okumanın "önceki" değeri tutarlı.
    const again = await preview(f, [joint(f)]);
    expect(again.body.kalemler[0]).toMatchObject({ oncekiTur: 'BELIRLENMEDI', sonrakiTur: 'MUTESELSIL' });

    // Paylı seçimin izdüşümü: kısıtlı + BOŞ liste. Aynı kural.
    const g = await fixture('preview-after-prop');
    await apply(g, [proportional(g, [1, 1])]);
    expect(await item(g.k1)).toMatchObject({ isAllDebtorsLiable: false, liableDebtorIds: [] });
    const previewed = await preview(g, [undetermined(g)]);
    expect(previewed.status).toBe(201);
    expect(previewed.body.kalemler[0]).toMatchObject({ oncekiTur: 'PAYLI', sonrakiTur: 'BELIRLENMEDI', engeller: [] });
  });

  it('AT-19 bayat önizleme: önizleme ile onay arasında tahsilat gelirse yürütme reddedilir; seçim yazılmaz', async () => {
    const f = await fixture('stale');
    const { approvalRequestId } = await ask(f, [proportional(f)]);
    await pay(f, 1000); // arada tahsilat (seçim henüz yok → bugünkü yolla, atıfsız)
    await expect(approvals.approve(approvalRequestId, f.approverUserId)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'LIABILITY_SELECTION_STALE' }),
    });
    expect(await sets(f)).toEqual([]);
    expect(await item(f.k1)).toMatchObject({ isAllDebtorsLiable: true, liableDebtorIds: [] });
    // Karar da geri alındı: talep hâlâ onay bekliyor, yürütülmedi
    expect(await prisma.officeApprovalRequest.findUniqueOrThrow({ where: { id: approvalRequestId } })).toMatchObject({
      status: OfficeApprovalStatus.PENDING_APPROVAL,
      executionStatus: OfficeApprovalExecutionStatus.NOT_RUN,
    });
    // Talep aşamasında da: eski önizleme özetiyle talep reddedilir
    const g = await fixture('stale-request');
    const previewed = await preview(g, [proportional(g)]);
    await pay(g, 500);
    const stale = await requestSelection(g, [proportional(g)], previewed.body.onizlemeOzeti);
    expect(stale.status).toBe(409);
    expect(await prisma.officeApprovalRequest.count({ where: { tenantId: g.tenantId } })).toBe(0);
  });

  it('AT-20 toplu uygulama: bir kalem engelliyse hiçbir kaleme yazılmaz; engelsizse tek talep, ya hep ya hiç', async () => {
    const f = await fixture('bulk', [8000, 6000]);
    const [k1, k2] = f.itemIds;
    // Seçimsiz dosyada borçlusuz tahsilat yalnız ilk kaleme düşer → k1'de atıfsız mahsup var
    await pay(f, 300);
    expect((await financialSnapshot(f)).collected).toEqual([300, 0]);
    const selections = [proportional(f, [1, 1], k1), proportional(f, [1, 1], k2)];
    const previewed = await preview(f, selections);
    expect(previewed.body).toMatchObject({ uygulamaTuru: 'BULK', uygulanabilir: false });
    expect(previewed.body.kalemler.map((row: any) => row.engeller.map((engel: any) => engel.kod))).toEqual([['UNATTRIBUTED_COLLECTION'], []]);
    const blocked = await requestSelection(f, selections, previewed.body.onizlemeOzeti);
    expect(blocked.status).toBe(409);
    expect(blocked.body).toEqual(expect.objectContaining({ code: 'LIABILITY_SELECTION_BLOCKED' }));
    expect(await prisma.officeApprovalRequest.count({ where: { tenantId: f.tenantId } })).toBe(0);
    expect(await sets(f)).toEqual([]);

    // Müteselsil kısa yolu (dosyadaki kalemlere uygula): dayanak ve onay yine gerekir; tek talep
    const bulk = [joint(f, k1), joint(f, k2)];
    const { approvalRequestId } = await ask(f, bulk);
    expect(await prisma.officeApprovalRequest.findUniqueOrThrow({ where: { id: approvalRequestId } })).toMatchObject({ targetType: 'CLAIM_ITEM_CASE', targetRef: f.caseId });
    expect(await sets(f)).toEqual([]);
    await approvals.approve(approvalRequestId, f.approverUserId);
    const written = await sets(f);
    expect(written.map((set) => [set.mode, set.appliedVia, set.version, set.status])).toEqual([
      ['JOINT_AND_SEVERAL', 'BULK', 1, 'ACTIVE'],
      ['JOINT_AND_SEVERAL', 'BULK', 1, 'ACTIVE'],
    ]);
    expect(new Set(written.map((set) => set.bulkOperationId)).size).toBe(1);
    expect(written[0].bulkOperationId).toBeTruthy();
    for (const id of [k1, k2]) {
      const row = await item(id);
      expect(row.isAllDebtorsLiable).toBe(false);
      expect([...row.liableDebtorIds].sort()).toEqual([f.b1.debtorId, f.b2.debtorId].sort());
    }
  });

  it('toplu uygulamada etkin seçimiyle aynı olan kalem ATLANIR: talep yalnız değişen kalemi taşır, atlanan kaleme yazılmaz; hepsi aynıysa talep açılmaz', async () => {
    const f = await fixture('bulk-skip', [8000, 6000, 4000]);
    const [k1, k2, k3] = f.itemIds;
    // k1 zaten müteselsil (tek kalem seçimiyle)
    await apply(f, [joint(f, k1)]);
    const k1Before = await item(k1);

    // "Tümü müteselsil": k1 değişmiyor → atlanır; k2 ve k3 için TEK toplu talep
    const bulk = [joint(f, k1), joint(f, k2), joint(f, k3)];
    const previewed = await preview(f, bulk);
    expect(previewed.status).toBe(201);
    expect(previewed.body).toMatchObject({ uygulamaTuru: 'BULK', uygulanabilir: true, uygulanacakKalemSayisi: 2, atlananKalemSayisi: 1 });
    expect(previewed.body.kalemler.map((row: any) => [row.claimItemId, row.degisiklikYok])).toEqual([
      [k1, true],
      [k2, false],
      [k3, false],
    ]);
    const requested = await requestSelection(f, bulk, previewed.body.onizlemeOzeti);
    expect(requested.status).toBe(201);
    expect(requested.body).toMatchObject({ applied: false, approvalRequired: true, uygulanacakKalemSayisi: 2, atlananKalemler: [k1] });
    const pending = await prisma.officeApprovalRequest.findUniqueOrThrow({ where: { id: requested.body.approvalRequestId } });
    // Kullanıcının eylemi topludur: hedef dosya, tek onay; niyet YALNIZ yazılacak kalemleri taşır.
    expect(pending).toMatchObject({ targetType: 'CLAIM_ITEM_CASE', targetRef: f.caseId, status: OfficeApprovalStatus.PENDING_APPROVAL });
    const intent = pending.savedIntent as any;
    expect(intent.appliedVia).toBe('BULK');
    expect(intent.bulkOperationId).toBeTruthy();
    expect(intent.selections.map((row: any) => row.claimItemId)).toEqual([k2, k3]);

    await approvals.approve(requested.body.approvalRequestId, f.approverUserId);
    expect((await sets(f)).map((set) => [set.claimItemId, set.version, set.mode, set.appliedVia, set.status])).toEqual(
      [
        [k1, 1, 'JOINT_AND_SEVERAL', 'SINGLE', 'ACTIVE'],
        [k2, 1, 'JOINT_AND_SEVERAL', 'BULK', 'ACTIVE'],
        [k3, 1, 'JOINT_AND_SEVERAL', 'BULK', 'ACTIVE'],
      ].sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    );
    // Atlanan kaleme hiç dokunulmadı: yeni sürüm yok, kalem satırı aynı.
    expect((await item(k1)).updatedAt.toISOString()).toBe(k1Before.updatedAt.toISOString());

    // Toplu uygulamada tek kalem değişse de talep TOPLUDUR (tek kalem talebine dönüşmez)
    const g = await fixture('bulk-skip-one', [5000, 3000]);
    const [g1, g2] = g.itemIds;
    await apply(g, [joint(g, g1)]);
    const oneLeft = [joint(g, g1), joint(g, g2)];
    const onePreview = await preview(g, oneLeft);
    expect(onePreview.body).toMatchObject({ uygulamaTuru: 'BULK', uygulanabilir: true, uygulanacakKalemSayisi: 1, atlananKalemSayisi: 1 });
    const oneRequest = await requestSelection(g, oneLeft, onePreview.body.onizlemeOzeti);
    expect(oneRequest.status).toBe(201);
    const onePending = await prisma.officeApprovalRequest.findUniqueOrThrow({ where: { id: oneRequest.body.approvalRequestId } });
    expect(onePending).toMatchObject({ targetType: 'CLAIM_ITEM_CASE', targetRef: g.caseId });
    expect((onePending.savedIntent as any).selections.map((row: any) => row.claimItemId)).toEqual([g2]);
    await approvals.approve(oneRequest.body.approvalRequestId, g.approverUserId);
    expect((await sets(g)).filter((set) => set.claimItemId === g2).map((set) => [set.version, set.appliedVia, set.status])).toEqual([[1, 'BULK', 'ACTIVE']]);

    // Hepsi zaten aynı seçimde: önizleme uygulanamaz, talep açılmaz
    const allSame = [joint(g, g1), joint(g, g2)];
    const samePreview = await preview(g, allSame);
    expect(samePreview.body).toMatchObject({ uygulanabilir: false, uygulanacakKalemSayisi: 0, atlananKalemSayisi: 2 });
    const requestsBefore = await prisma.officeApprovalRequest.count({ where: { tenantId: g.tenantId } });
    const sameRequest = await requestSelection(g, allSame, samePreview.body.onizlemeOzeti);
    expect(sameRequest.status).toBe(400);
    expect(sameRequest.body).toEqual(expect.objectContaining({ code: 'LIABILITY_SELECTION_NO_CHANGE' }));
    expect([...sameRequest.body.claimItemIds].sort()).toEqual([g1, g2].sort());
    expect(await prisma.officeApprovalRequest.count({ where: { tenantId: g.tenantId } })).toBe(requestsBefore);
  });

  it('toplu uygulamada atlanan kalem öteki kalemin engelini KALDIRMAZ: engelli kalem varsa hiçbir kaleme yazılmaz', async () => {
    const f = await fixture('bulk-skip-blocked', [8000, 6000]);
    const [k1, k2] = f.itemIds;
    await apply(f, [proportional(f, [1, 1], k1)]);
    // k1 aynı seçim (atlanırdı), k2 geçersiz girdi (yüzde toplamı 99,99) → talep reddedilir, hiçbir şey yazılmaz
    const invalidK2 = {
      claimItemId: k2,
      mode: 'PROPORTIONAL',
      basis: 'CONTRACT',
      parties: [
        { caseDebtorId: f.b1.caseDebtorId, sharePercent: '60' },
        { caseDebtorId: f.b2.caseDebtorId, sharePercent: '39.99' },
      ],
    };
    const mixed = [proportional(f, [1, 1], k1), invalidK2];
    const previewed = await preview(f, mixed);
    expect(previewed.body.uygulanabilir).toBe(false);
    expect(previewed.body.kalemler[0].degisiklikYok).toBe(true);
    expect(previewed.body.kalemler[1].girdiHatalari.length).toBeGreaterThan(0);
    const requestsBefore = await prisma.officeApprovalRequest.count({ where: { tenantId: f.tenantId } });
    const rejected = await requestSelection(f, mixed, previewed.body.onizlemeOzeti);
    expect(rejected.status).toBe(400);
    expect(rejected.body).toEqual(expect.objectContaining({ code: 'LIABILITY_SELECTION_INVALID' }));
    expect(await prisma.officeApprovalRequest.count({ where: { tenantId: f.tenantId } })).toBe(requestsBefore);
    expect((await sets(f)).map((set) => [set.claimItemId, set.version])).toEqual([[k1, 1]]);
  });

  it('AT-21 değişiklik — tasarım Örnek 4: borçlusu kayıtlı geçmiş tahsilatta önce / sonra; defter ve sayaç değişmez; geçmiş sürüm kapanır', async () => {
    const f = await fixture('change');
    await apply(f, [joint(f)]);
    await pay(f, 4000, f.b1.caseDebtorId);
    const before = await financialSnapshot(f);

    const selections = [proportional(f, [1, 1])];
    const previewed = await preview(f, selections);
    expect(previewed.body.uygulanabilir).toBe(true);
    const rows = Object.fromEntries(previewed.body.kalemler[0].borclular.map((row: any) => [row.caseDebtorId, row]));
    // Önce: müteselsil — ikisi de 8.000,00. Sonra: B1 2.000,00, B2 6.000,00. Toplam 8.000,00 = ortak kalan.
    expect(rows[f.b1.caseDebtorId]).toMatchObject({ borcluHesabinaMahsup: 4000, oncekiKalanSorumluluk: 8000, sonrakiKalanSorumluluk: 2000, sonrakiPay: 6000 });
    expect(rows[f.b2.caseDebtorId]).toMatchObject({ borcluHesabinaMahsup: 0, oncekiKalanSorumluluk: 8000, sonrakiKalanSorumluluk: 6000, sonrakiPay: 6000 });
    expect(previewed.body.kalemler[0]).toMatchObject({ oncekiTur: 'MUTESELSIL', sonrakiTur: 'PAYLI', ortakKalan: 8000, oncekiSecimSurumu: 1 });

    await apply(f, selections);
    // Hiçbir geçmiş mahsup taşınmadı ya da yeniden atfedilmedi
    expect(await financialSnapshot(f)).toEqual(before);
    const written = await sets(f);
    expect(written.map((set) => [set.version, set.mode, set.status])).toEqual([
      [1, 'JOINT_AND_SEVERAL', 'SUPERSEDED'],
      [2, 'PROPORTIONAL', 'ACTIVE'],
    ]);
    expect(written[0].supersededBySetId).toBe(written[1].id);
    expect(written[0].supersededAt).not.toBeNull();
    expect(await item(f.k1)).toMatchObject({ isAllDebtorsLiable: false, liableDebtorIds: [] });

    const historyRes = await history(f, f.k1);
    expect(historyRes.status).toBe(200);
    expect(historyRes.body.surumler.map((row: any) => [row.surum, row.tur, row.durum])).toEqual([
      [2, 'PAYLI', 'ACTIVE'],
      [1, 'MUTESELSIL', 'SUPERSEDED'],
    ]);

    // Aynı seçim yeniden istenirse: değişiklik yok
    const again = await preview(f, selections);
    expect(again.body.kalemler[0].degisiklikYok).toBe(true);
    expect((await requestSelection(f, selections, again.body.onizlemeOzeti)).status).toBe(400);
  });

  it('AT-21 borçlusu kayıtsız tahsilatta DURUR; payı aşan atıfta DURUR; defter ve sayaç değişmez', async () => {
    // (a) borçlusu kayıtlı değil
    const a = await fixture('change-unattributed');
    await pay(a, 4000);
    const beforeA = await financialSnapshot(a);
    const previewA = await preview(a, [proportional(a)]);
    expect(previewA.body.uygulanabilir).toBe(false);
    expect(previewA.body.kalemler[0].engeller).toEqual([expect.objectContaining({ kod: 'UNATTRIBUTED_COLLECTION', tutar: 4000 })]);
    const requestA = await requestSelection(a, [proportional(a)], previewA.body.onizlemeOzeti);
    expect(requestA.status).toBe(409);
    expect(await sets(a)).toEqual([]);
    expect(await financialSnapshot(a)).toEqual(beforeA);
    // Kullanıcı kalemi müteselsil bırakabilir (atıf hesaba girmez)
    await apply(a, [joint(a)]);
    expect((await sets(a)).map((set) => set.mode)).toEqual(['JOINT_AND_SEVERAL']);

    // (b) borçlu hesabına sayılan tutar yeni payı aşıyor
    const b = await fixture('change-exceeds');
    await apply(b, [joint(b)]);
    await pay(b, 7000, b.b1.caseDebtorId);
    const beforeB = await financialSnapshot(b);
    const previewB = await preview(b, [proportional(b)]);
    expect(previewB.body.kalemler[0].engeller).toEqual([
      expect.objectContaining({ kod: 'ATTRIBUTION_EXCEEDS_SHARE', tutar: 7000, sinir: 6000, borcluAdi: 'Sentetik Borçlu 1' }),
    ]);
    expect((await requestSelection(b, [proportional(b)], previewB.body.onizlemeOzeti)).status).toBe(409);
    expect((await sets(b)).map((set) => [set.version, set.mode, set.status])).toEqual([[1, 'JOINT_AND_SEVERAL', 'ACTIVE']]);
    expect(await financialSnapshot(b)).toEqual(beforeB);
    // Oranlar yeniden ölçeklenmez: kullanıcı ancak 7.000,00'i karşılayan bir oran girerse uygulanır (%60 → pay 7.200,00)
    const ok = await preview(b, [proportional(b, [6000, 4000])]);
    expect(ok.body.uygulanabilir).toBe(true);
  });

  it('AT-22 reddedilen girdiler: yüzde toplamı 99,99; hepsi sınırsız; edilgen borçlu; pay + tavan; dayanaksız; biçimsiz gövde', async () => {
    const f = await fixture('invalid');
    const codesOf = async (selection: Record<string, unknown>) => {
      const res = await preview(f, [selection]);
      expect(res.status).toBe(201);
      expect(res.body.uygulanabilir).toBe(false);
      return res.body.kalemler[0].girdiHatalari.map((row: any) => row.kod);
    };
    const parties = [{ caseDebtorId: f.b1.caseDebtorId }, { caseDebtorId: f.b2.caseDebtorId }];
    expect(
      await codesOf({ claimItemId: f.k1, mode: 'PROPORTIONAL', basis: 'CONTRACT', parties: [{ ...parties[0], sharePercent: '60' }, { ...parties[1], sharePercent: '39.99' }] }),
    ).toEqual(['SHARE_PERCENT_TOTAL_INVALID']);
    expect(await codesOf({ claimItemId: f.k1, mode: 'CAPPED', basis: 'CONTRACT', parties: parties.map((row) => ({ ...row, unlimited: true })) })).toContain('ALL_PARTIES_UNLIMITED');
    expect(
      await codesOf({ claimItemId: f.k1, mode: 'PROPORTIONAL', basis: 'CONTRACT', parties: [{ ...parties[0], shareWeight: 1, limitAmount: '100.00' }, { ...parties[1], shareWeight: 1 }] }),
    ).toContain('SHARE_AND_LIMIT_MIXED');
    expect(await codesOf({ claimItemId: f.k1, mode: 'JOINT_AND_SEVERAL', parties })).toEqual(['BASIS_REQUIRED']);
    // Edilgen borçlu seçime alınamaz
    await prisma.caseDebtor.update({ where: { id: f.b2.caseDebtorId }, data: { lifecycleStatus: 'PASSIVE' } });
    expect(await codesOf({ claimItemId: f.k1, mode: 'JOINT_AND_SEVERAL', basis: 'COURT_JUDGMENT', parties })).toEqual(['PARTY_NOT_ACTIVE_CASE_DEBTOR']);
    // Geçersiz girdiyle talep açılmaz
    const bad = { claimItemId: f.k1, mode: 'JOINT_AND_SEVERAL', parties: [parties[0]] };
    const previewed = await preview(f, [bad]);
    const res = await requestSelection(f, [bad], previewed.body.onizlemeOzeti);
    expect(res.status).toBe(400);
    expect(res.body).toEqual(expect.objectContaining({ code: 'LIABILITY_SELECTION_INVALID' }));
    // Üretim ValidationPipe: tanımsız alan ve boş liste
    expect((await preview(f, [{ ...bad, uydurma: 1 }])).status).toBe(400);
    expect((await preview(f, [])).status).toBe(400);
    expect(await prisma.officeApprovalRequest.count({ where: { tenantId: f.tenantId } })).toBe(0);
    expect(await sets(f)).toEqual([]);
  });

  it('AT-23 etkin seçimi olan kalemde iki eski alanın doğrudan yaması reddedilir; seçimsiz kalemde eski yol aynen çalışır', async () => {
    const f = await fixture('legacy-patch', [5000, 5000]);
    const [selected, plain] = f.itemIds;
    await apply(f, [joint(f, selected)]);
    const requestsBefore = await prisma.officeApprovalRequest.count({ where: { tenantId: f.tenantId } });
    for (const body of [{ isAllDebtorsLiable: true }, { liableDebtorIds: [f.b1.debtorId] }]) {
      const res = await http().put(`/claim-items/${selected}`).set('x-test-user-id', f.requesterUserId).send(body);
      expect(res.status).toBe(409);
      expect(res.body).toEqual(expect.objectContaining({ code: 'CLAIM_ITEM_LIABILITY_SELECTION_ACTIVE' }));
    }
    expect(await prisma.officeApprovalRequest.count({ where: { tenantId: f.tenantId } })).toBe(requestsBefore);
    // İlgisiz alan ve seçimsiz kalem etkilenmez (mevcut onaylı yol)
    const other = await http().put(`/claim-items/${plain}`).set('x-test-user-id', f.requesterUserId).send({ isAllDebtorsLiable: false, liableDebtorIds: [f.b1.debtorId] });
    expect(other.status).toBe(200);
    expect(other.body.data).toEqual(expect.objectContaining({ applied: false, approvalRequired: true }));
    // Seçimden ÖNCE açılmış eski yol talebi, seçimden sonra yürütülemez
    await apply(f, [joint(f, plain)]);
    await expect(approvals.approve(other.body.data.approvalRequestId, f.approverUserId)).rejects.toThrow();
    const row = await item(plain);
    expect([...row.liableDebtorIds].sort()).toEqual([f.b1.debtorId, f.b2.debtorId].sort());
  });

  it('AT-24 bayrak kapalıyken yazma uçları ve onay yürütmesi kapalı; okuma ve mevcut seçimlerin mahsubu çalışır', async () => {
    const f = await fixture('flag');
    await apply(f, [proportional(f, [1, 1])]);
    const pendingWhileOn = await ask(f, [proportional(f, [6000, 4000])]);

    process.env[FLAG] = 'false';
    const previewOff = await preview(f, [joint(f)]);
    expect(previewOff.status).toBe(409);
    expect(previewOff.body).toEqual(expect.objectContaining({ code: 'CLAIM_LIABILITY_SELECTION_DISABLED' }));
    expect((await requestSelection(f, [joint(f)], 'x')).status).toBe(409);
    // Bekleyen talep bayrak kapalıyken yürütülemez; talep bekler, seçim değişmez
    await expect(approvals.approve(pendingWhileOn.approvalRequestId, f.approverUserId)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'CLAIM_LIABILITY_SELECTION_DISABLED' }),
    });
    expect((await sets(f)).map((set) => [set.version, set.status])).toEqual([[1, 'ACTIVE']]);
    // Okuma çalışır
    const historyOff = await history(f);
    expect(historyOff.status).toBe(200);
    expect(historyOff.body.surumler).toHaveLength(1);
    // Mevcut seçim etkisizleşmez: sorumluluk sınırı ve mahsup bayraktan bağımsız
    const created = await pay(f, 7000, f.b1.caseDebtorId); // pay 6.000,00
    expect(Number((await item(f.k1)).collectedAmount)).toBe(6000);
    const overpayment = await prisma.collectionOverpayment.findUniqueOrThrow({ where: { collectionId: (created as any).id } });
    expect([Number(overpayment.amount), overpayment.caseDebtorId]).toEqual([1000, f.b1.caseDebtorId]);
    // Borçlusuz ödeme yine bekletilir
    const held = await pay(f, 100);
    expect(await prisma.collectionAllocationHold.findUniqueOrThrow({ where: { collectionId: (held as any).id } })).toMatchObject({ holdReason: 'ON_BEHALF_DEBTOR_REQUIRED' });

    process.env[FLAG] = 'true';
    // Bayrak açılınca bekleyen talep bayatladığı için (arada tahsilat) yine uygulanmaz
    await expect(approvals.approve(pendingWhileOn.approvalRequestId, f.approverUserId)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'LIABILITY_SELECTION_STALE' }),
    });
  });

  it('yetki ve kiracı sınırı: dosyada mali yazma yetkisi olmayan ya da başka kiracının kullanıcısı önizleyemez / talep edemez', async () => {
    const f = await fixture('authz');
    const other = await fixture('authz-other');
    // Başka kiracının kullanıcısı
    const cross = await preview(f, [joint(f)], other.requesterUserId);
    expect([403, 404]).toContain(cross.status);
    // Aynı kiracıda, dosyaya atanmamış avukat
    const suffix = randomUUID().slice(0, 8);
    const outsider = await prisma.user.create({ data: { tenantId: f.tenantId, email: `liab-out-${suffix}@example.test`, name: 'Dış', surname: 'Avukat', role: 'USER' } });
    await prisma.lawyer.create({ data: { tenantId: f.tenantId, userId: outsider.id, name: 'Dış', surname: 'Avukat', lawyerRank: 'LAWYER' } });
    expect((await preview(f, [joint(f)], outsider.id)).status).toBe(403);
    // Başka dosyanın kalemi bu dosyanın ucundan seçilemez
    const foreignItem = await preview(f, [joint(f, other.k1)]);
    expect([403, 404]).toContain(foreignItem.status);
    expect(await prisma.officeApprovalRequest.count({ where: { tenantId: { in: [f.tenantId, other.tenantId] } } })).toBe(0);
  });
});
