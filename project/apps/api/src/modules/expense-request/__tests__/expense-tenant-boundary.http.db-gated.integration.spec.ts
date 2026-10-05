// CaseModule grafiği `pdf-poppler`'ı yükler; paket Linux'ta yükleme anında process.exit(1) verir
// (CI emsali: opening-expense-fx-basis.http.db-gated.integration.spec.ts).
jest.mock('pdf-poppler', () => ({
  convert: async () => {
    throw new Error('pdf-poppler is stubbed in unit tests');
  },
}));

import { CanActivate, ExecutionContext, INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import * as request from 'supertest';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { StorageModule } from '../../../common/storage/storage.module';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CaseModule } from '../../case/case.module';
import { CostPackageModule } from '../../cost-package/cost-package.module';
import { ErrorLogModule } from '../../error-log/error-log.module';
import { MetricsRegistryModule } from '../../metrics-registry/metrics-registry.module';
import { CasePolicyEngine } from '../../policy-engine/case-policy-engine.service';
import { ActionCode } from '../../policy-engine/types/action-code.enum';
import { StageTriggerModule } from '../../stage-trigger/stage-trigger.module';

/**
 * Masraf kapısı durum uçları ve paket hesabı — büro (tenant) sınırı. GERÇEK HTTP + disposable PostgreSQL.
 *
 * Ölçülen kusur (main ef16f07f): A bürosunun kullanıcısı, B bürosuna ait dosya kimliğini vererek şu dört uçtan B'nin
 * verisini okuyabiliyordu:
 *   - POST /cost-packages/compute                              → B dosyasının anaparası (calcParams.baseValue) + tutarlar
 *   - GET  /expense-requests/case/:caseId/gate-status          → isBlocked, totalPending, blockingExpenses[]
 *   - GET  /expense-requests/case/:caseId/gate-summary         → aynı bilgi + masraf talebi kimlikleri
 *   - GET  /expense-requests/case/:caseId/can-perform/:action  → B dosyasının kilit durumu
 * Neden: dosya yalnız kimliğiyle okunuyor, çağıranın bürosu sorguya hiç girmiyordu.
 *
 * Kural: dört uç çağıranın bürosuna bağlıdır. Başka büronun dosyası, var olmayan dosyayla AYNI yanıtı alır (404
 * "Takip bulunamadı") — var / yok bilgisi dahil hiçbir şey sızmaz. Kendi bürosunun dosyasında yanıt DEĞİŞMEZ.
 */
const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('EXPENSE-TENANT-BOUNDARY DB gate blocked: CI requires an approved TEST_DATABASE_URL.');
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;

const PRODUCTION_VALIDATION_OPTIONS = { whitelist: true, forbidNonWhitelisted: true, transform: true } as const;
const REMAINING_GATE_FLAG = 'EXPENSE_REMAINING_GATE_ENABLED';

/** JwtStrategy → validateUser sözleşmesi: req.user DB'den okunan tam User satırı; pasif kullanıcı reddedilir. */
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

/** Var olmayan dosyanın yanıtı; başka büronun dosyası BİREBİR bunu almalıdır. */
const NOT_FOUND = { status: 404, body: { statusCode: 404, message: 'Takip bulunamadı', error: 'Not Found' } };

/** Depodaki sistem paketi tanımının (prisma/seed-cost-packages.ts, UYAP_PRE) kalemleri. */
const PACKAGE_ITEMS = [
  { itemCode: 'BASVURMA_HARCI', label: 'Başvurma Harcı', defaultAmount: 615.4, sortOrder: 1, isEditable: false },
  { itemCode: 'VEKALET_HARCI', label: 'Vekalet Harcı', defaultAmount: 87.5, sortOrder: 2, isEditable: false },
  {
    itemCode: 'PESIN_HARC',
    label: 'Peşin Harç',
    defaultAmount: 5722.19,
    sortOrder: 3,
    isEditable: true,
    calcRule: { type: 'percentage', rate: 0.005, base: 'principalAmount', min: 100 },
  },
  { itemCode: 'DOSYA_GIDERI', label: 'Dosya Gideri', defaultAmount: 2, sortOrder: 4, isEditable: false },
  {
    itemCode: 'TEBLIGAT_GIDERI',
    label: 'Tebligat Gideri',
    defaultAmount: 15,
    sortOrder: 5,
    isEditable: true,
    calcRule: { type: 'per_unit', unitAmount: 15, multiplier: 'debtorCount' },
  },
  { itemCode: 'VEKALET_PULU', label: 'Vekalet Pulu', defaultAmount: 138, sortOrder: 6, isEditable: false },
];

/** B dosyasının anaparası: sızan değerin (calcParams.baseValue) yanıtta aranabilmesi için ayırt edici seçildi. */
const B_PRINCIPAL = 777_000;

/** 777.000 TL anaparalı, borçlusuz dosyada yukarıdaki paketin bugünkü hesabı (değişmemeli). */
const B_PACKAGE_COMPUTATION = {
  items: [
    { itemCode: 'BASVURMA_HARCI', label: 'Başvurma Harcı', suggestedAmount: 615.4, finalAmount: 615.4, isEditable: false, sortOrder: 1 },
    { itemCode: 'VEKALET_HARCI', label: 'Vekalet Harcı', suggestedAmount: 87.5, finalAmount: 87.5, isEditable: false, sortOrder: 2 },
    {
      itemCode: 'PESIN_HARC',
      label: 'Peşin Harç',
      suggestedAmount: 3885,
      finalAmount: 3885,
      isEditable: true,
      calcParams: { rate: 0.005, base: 'principalAmount', baseValue: B_PRINCIPAL },
      sortOrder: 3,
    },
    { itemCode: 'DOSYA_GIDERI', label: 'Dosya Gideri', suggestedAmount: 2, finalAmount: 2, isEditable: false, sortOrder: 4 },
    {
      itemCode: 'TEBLIGAT_GIDERI',
      label: 'Tebligat Gideri',
      suggestedAmount: 15,
      finalAmount: 15,
      isEditable: true,
      calcParams: { unitAmount: 15, multiplier: 'debtorCount', multiplierValue: 1 },
      sortOrder: 5,
    },
    { itemCode: 'VEKALET_PULU', label: 'Vekalet Pulu', suggestedAmount: 138, finalAmount: 138, isEditable: false, sortOrder: 6 },
  ],
  totalSuggested: 4742.9,
  messageTemplateCode: null,
};

describeWithDisposableDb('Masraf kapısı ve paket hesabı — büro (tenant) sınırı (HTTP + disposable PostgreSQL)', () => {
  jest.setTimeout(180_000);

  let prisma: PrismaClient;
  let app: INestApplication;
  const suffix = randomUUID().slice(0, 8);
  const originalFlag = process.env[REMAINING_GATE_FLAG];

  /** İki büro: A (çağıran / saldıran taraf) ve B (verisi korunan taraf). */
  const office = {
    a: { tenantId: `test-ci-etb-a-${suffix}`, adminId: '', clientId: '', clientName: 'ETB-A müvekkil' },
    b: { tenantId: `test-ci-etb-b-${suffix}`, adminId: '', clientId: '', clientName: 'ETB-B müvekkil' },
  };
  /** Sistem paketi (tüm bürolara açık) ve yalnız B bürosuna ait paketler; ad çakışmasın diye kod eklidir. */
  const systemPackage = { code: `CI_ETB_SYS_${suffix}`, name: 'ETB sistem paketi (UYAP_PRE kopyası)' };
  const privatePackageOfB = { code: `CI_ETB_B_${suffix}`, name: 'ETB B bürosu özel paketi' };
  const uyapPrePackageOfB = { code: 'UYAP_PRE', name: 'ETB B bürosu UYAP öncesi paketi' };

  /** B: müvekkilli dosya (otomatik açılış talebi → kapı kilitli). */
  let caseOfB: string;
  /** B: müvekkilsiz, masraf talebi olmayan dosya (kapı açık). */
  let unblockedCaseOfB: string;
  /** B: bir talebi B, bir talebi A damgalı dosya (sorgu düzeyi süzgeç senaryosu). */
  let mixedStampCaseOfB: string;
  /** A: müvekkilli dosya (çağıranın kendi verisi; A kullanıcısının çalışan bir aktör olduğunun kontrolü). */
  let caseOfA: string;
  /** Hiçbir büroda bulunmayan dosya kimliği. */
  const missingCaseId = `yok-${randomUUID()}`;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await prisma.$connect();
    const identity = new DbUserIdentityGuard(() => prisma);
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        StorageModule,
        ErrorLogModule,
        MetricsRegistryModule,
        CaseModule,
        CostPackageModule,
        StageTriggerModule,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(identity)
      // Masraf, paket ve aşama tetikleme denetleyicileri passport korumasını doğrudan kullanır (AuthGuard('jwt') aynı sınıfı döndürür)
      .overrideGuard(AuthGuard('jwt'))
      .useValue(identity)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe(PRODUCTION_VALIDATION_OPTIONS));
    await app.init();

    for (const [key, entry] of Object.entries(office)) {
      await prisma.tenant.create({ data: { id: entry.tenantId, name: `CI ETB ${key}`, slug: entry.tenantId } });
      const admin = await prisma.user.create({
        data: { tenantId: entry.tenantId, email: `admin-${key}-${suffix}@example.test`, name: 'admin', surname: `ETB-${key}`, role: 'ADMIN' },
      });
      entry.adminId = admin.id;
      const client = await prisma.client.create({
        data: { tenantId: entry.tenantId, type: 'COMPANY', companyName: entry.clientName, displayName: entry.clientName },
      });
      entry.clientId = client.id;
    }

    const packageItems = { create: PACKAGE_ITEMS.map((item) => ({ ...item, isRequired: true })) };
    await prisma.costPackage.create({
      data: { tenantId: null, code: systemPackage.code, name: systemPackage.name, isActive: true, isSystem: true, items: packageItems },
    });
    for (const pkg of [privatePackageOfB, uyapPrePackageOfB]) {
      await prisma.costPackage.create({
        data: { tenantId: office.b.tenantId, code: pkg.code, name: pkg.name, isActive: true, isSystem: false, items: packageItems },
      });
    }

    caseOfB = await openCase(office.b, 'b-muvekkilli', { ...withClient(office.b), dues: [principal(B_PRINCIPAL)] });
    caseOfA = await openCase(office.a, 'a-muvekkilli', { ...withClient(office.a), dues: [principal(10_000)] });
    unblockedCaseOfB = await openCase(office.b, 'b-talepsiz', { dues: [principal(5_000)] });
    mixedStampCaseOfB = await openCase(office.b, 'b-karma-damga', { dues: [principal(5_000)] });
    await waitForOpeningRequest(office.b.tenantId, caseOfB);
    await waitForOpeningRequest(office.a.tenantId, caseOfA);

    // Aynı dosyada iki BLOCKING talep: biri dosyanın bürosu (B), diğeri başka büro (A) damgalı. Ürün yolları ikincisini
    // üretmez (talep açan her yol dosyayı büro altında arar); yalnız sorgu düzeyindeki büro süzgecinin kanıtı içindir.
    for (const [stamp, totalAmount] of [[office.b, 200], [office.a, 111.11]] as const) {
      await prisma.expenseRequest.create({
        data: {
          tenantId: stamp.tenantId,
          caseId: mixedStampCaseOfB,
          clientId: stamp.clientId,
          stageCode: 'SEIZURE',
          gateType: 'BLOCKING',
          totalAmount,
          status: 'PENDING',
          createdById: stamp.adminId,
        },
      });
    }
  });

  afterEach(() => {
    if (originalFlag === undefined) delete process.env[REMAINING_GATE_FLAG];
    else process.env[REMAINING_GATE_FLAG] = originalFlag;
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await app?.close();
    await prisma.costPackage
      .deleteMany({ where: { OR: [{ code: { in: [systemPackage.code, privatePackageOfB.code] } }, { tenantId: office.b.tenantId }] } })
      .catch(() => undefined);
    // Önce B: dosyaları silinince üzerlerindeki (A damgalı olan dahil) masraf talepleri de gider
    for (const entry of [office.b, office.a]) {
      await prisma.auditLog.deleteMany({ where: { tenantId: entry.tenantId } }).catch(() => undefined);
      await prisma.tenant.deleteMany({ where: { id: entry.tenantId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  type Office = (typeof office)['a'];
  const http = () => request(app.getHttpServer());
  const get = (actor: Office, path: string) => http().get(path).set('x-test-user-id', actor.adminId);
  const post = (actor: Office, path: string, body: object = {}) => http().post(path).set('x-test-user-id', actor.adminId).send(body);
  const outcome = (res: request.Response) => ({ status: res.status, body: res.body });

  const principal = (amount: number) => ({ type: 'PRINCIPAL', description: 'Asıl alacak', amount, dueDate: '2026-01-15' });
  const withClient = (owner: Office) => ({ creditors: [{ id: owner.clientId, type: 'COMPANY', name: owner.clientName }] });

  async function openCase(owner: Office, label: string, body: Record<string, unknown>): Promise<string> {
    const res = await post(owner, '/cases', {
      fileNumber: `CI-ETB-${label}-${suffix}`,
      type: 'GENERAL_EXECUTION',
      interestType: 'YASAL',
      startDate: '2026-02-01',
      currency: 'TRY',
      ...body,
    });
    expect({ label, status: res.status }).toEqual({ label, status: 201 });
    return res.body.id as string;
  }

  /** Müvekkilli dosyanın arka plan açılış talebi için sınırlı bekleme (en çok ~8 sn). */
  async function waitForOpeningRequest(tenantId: string, caseId: string): Promise<void> {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const [requests, journalEntries] = await Promise.all([
        prisma.expenseRequest.count({ where: { tenantId, caseId } }),
        prisma.accountingJournalEntry.count({ where: { tenantId, caseId, sourceType: 'EXPENSE_REQUEST' } }),
      ]);
      if (requests > 0 && journalEntries > 0) return;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error(`Açılış masraf talebi oluşmadı: ${caseId}`);
  }

  /** Dosyanın, VERİLEN büro damgalı kilitleyen talepleri — kapı yanıtının beklenen satırları (kaynak: veritabanı). */
  async function blockingRowsOf(tenantId: string, caseId: string) {
    const rows = await prisma.expenseRequest.findMany({
      where: { tenantId, caseId, gateType: 'BLOCKING', status: { in: ['PENDING', 'SENT', 'REMINDED', 'PARTIAL'] } },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) => ({
      id: row.id,
      stageCode: row.stageCode,
      totalAmount: Number(row.totalAmount),
      paidTotal: Number(row.paidTotal),
      remaining: Number(row.totalAmount) - Number(row.paidTotal),
      status: String(row.status),
    }));
  }

  /** Kapı kilitliyken kendi bürosuna dönen üç yanıt (bugünkü biçim; değişmemeli). */
  const blockedGate = (rows: Awaited<ReturnType<typeof blockingRowsOf>>) => {
    const totalPending = rows.reduce((sum, row) => sum + row.remaining, 0);
    return {
      status: {
        isBlocked: true,
        blockingExpenses: rows,
        totalPending,
        message: `${rows.length} adet ödenmemiş masraf talebi var. Toplam: ${totalPending.toFixed(2)} TL`,
      },
      summary: {
        isBlocked: true,
        totalPending,
        blockingCount: rows.length,
        expenses: rows,
        canSubmitToUyap: false,
        canSendNotification: false,
        message: `Masraf ödenmeden UYAP işlemi yapılamaz. Bekleyen: ${totalPending.toFixed(2)} TL`,
      },
    };
  };

  /** B'nin masraf kayıtlarının izi: yabancı istekler bu kayıtlara dokunmamalı. */
  const footprintOfB = async () => ({
    requests: (await prisma.expenseRequest.findMany({ where: { case: { tenantId: office.b.tenantId } }, orderBy: { createdAt: 'asc' } })).map(
      (row) => ({ id: row.id, tenantId: row.tenantId, status: String(row.status), updatedAt: row.updatedAt.toISOString() }),
    ),
    journalEntries: await prisma.accountingJournalEntry.count({ where: { tenantId: office.b.tenantId } }),
    balances: await prisma.caseBalance.count({ where: { tenantId: office.b.tenantId } }),
  });

  /** Dört ucun, verilen dosya için çağrıları (kapı uçlarında işlem türü: kilide tabi SEND ve muaf VIEW). */
  const boundaryCalls = (actor: Office, caseId: string) =>
    [
      ['GET gate-status', () => get(actor, `/expense-requests/case/${caseId}/gate-status`)],
      ['GET gate-summary', () => get(actor, `/expense-requests/case/${caseId}/gate-summary`)],
      ['GET can-perform/SEND', () => get(actor, `/expense-requests/case/${caseId}/can-perform/SEND`)],
      ['GET can-perform/VIEW (kapıdan muaf işlem)', () => get(actor, `/expense-requests/case/${caseId}/can-perform/VIEW`)],
      ['POST compute (sistem paketi)', () => post(actor, '/cost-packages/compute', { caseId, packageCode: systemPackage.code })],
      ['POST compute (B bürosunun özel paketi)', () => post(actor, '/cost-packages/compute', { caseId, packageCode: privatePackageOfB.code })],
      [
        'POST compute (matrah ve adet çağıranca verilmiş)',
        () => post(actor, '/cost-packages/compute', { caseId, packageCode: systemPackage.code, principalAmount: 1, debtorCount: 1, tebligatCount: 1 }),
      ],
    ] as const;

  describe('kendi bürosunun dosyası (pozitif kontrol): yanıt değişmez', () => {
    it.each(['kapalı', 'açık'])('kilitli dosya — kapı durumu, özeti ve işlem izni (kalan-bazlı karar %s)', async (flag) => {
      if (flag === 'açık') process.env[REMAINING_GATE_FLAG] = 'true';
      const rows = await blockingRowsOf(office.b.tenantId, caseOfB);
      // Kurulum boş değil: otomatik açılış talebi var ve tutarı pozitif
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ stageCode: 'OPENING', paidTotal: 0, status: 'PENDING' });
      expect(rows[0].totalAmount).toBeGreaterThan(0);
      const expected = blockedGate(rows);

      expect(outcome(await get(office.b, `/expense-requests/case/${caseOfB}/gate-status`))).toEqual({ status: 200, body: expected.status });
      expect(outcome(await get(office.b, `/expense-requests/case/${caseOfB}/gate-summary`))).toEqual({ status: 200, body: expected.summary });
      expect(outcome(await get(office.b, `/expense-requests/case/${caseOfB}/can-perform/SEND`))).toEqual({
        status: 200,
        body: { canPerform: false, actionType: 'SEND' },
      });
      expect(outcome(await get(office.b, `/expense-requests/case/${caseOfB}/can-perform/VIEW`))).toEqual({
        status: 200,
        body: { canPerform: true, actionType: 'VIEW' },
      });
    });

    it.each(['kapalı', 'açık'])('masraf talebi olmayan dosya — kapı açık, 200 (kalan-bazlı karar %s)', async (flag) => {
      if (flag === 'açık') process.env[REMAINING_GATE_FLAG] = 'true';

      expect(outcome(await get(office.b, `/expense-requests/case/${unblockedCaseOfB}/gate-status`))).toEqual({
        status: 200,
        body: { isBlocked: false, blockingExpenses: [], totalPending: 0 },
      });
      expect(outcome(await get(office.b, `/expense-requests/case/${unblockedCaseOfB}/gate-summary`))).toEqual({
        status: 200,
        body: {
          isBlocked: false,
          totalPending: 0,
          blockingCount: 0,
          expenses: [],
          canSubmitToUyap: true,
          canSendNotification: true,
          message: 'UYAP işlemleri için hazır.',
        },
      });
      expect(outcome(await get(office.b, `/expense-requests/case/${unblockedCaseOfB}/can-perform/SEND`))).toEqual({
        status: 200,
        body: { canPerform: true, actionType: 'SEND' },
      });
    });

    it('paket hesabı — sistem paketi ve büronun kendi paketi, dosyanın anaparasıyla', async () => {
      for (const pkg of [systemPackage, privatePackageOfB]) {
        expect(outcome(await post(office.b, '/cost-packages/compute', { caseId: caseOfB, packageCode: pkg.code }))).toEqual({
          status: 201,
          body: { packageCode: pkg.code, packageName: pkg.name, ...B_PACKAGE_COMPUTATION },
        });
      }
    });

    it('A bürosu kendi dosyasında yalnız kendi verisini görür (çağıran çalışan bir aktördür)', async () => {
      const rows = await blockingRowsOf(office.a.tenantId, caseOfA);
      expect(rows).toHaveLength(1);
      const expected = blockedGate(rows);

      expect(outcome(await get(office.a, `/expense-requests/case/${caseOfA}/gate-status`))).toEqual({ status: 200, body: expected.status });
      expect(outcome(await get(office.a, `/expense-requests/case/${caseOfA}/gate-summary`))).toEqual({ status: 200, body: expected.summary });
      const computed = await post(office.a, '/cost-packages/compute', { caseId: caseOfA, packageCode: systemPackage.code });
      expect(computed.status).toBe(201);
      expect(computed.body.items.find((item: { itemCode: string }) => item.itemCode === 'PESIN_HARC').calcParams.baseValue).toBe(10_000);
    });
  });

  describe('başka büronun dosyası: var olmayan dosyayla AYNI yanıt, hiçbir bilgi sızmaz', () => {
    it.each(['kapalı', 'açık'])('dört uç — 404 "Takip bulunamadı" (kalan-bazlı karar %s)', async (flag) => {
      if (flag === 'açık') process.env[REMAINING_GATE_FLAG] = 'true';
      const before = await footprintOfB();
      const secrets = [...(await blockingRowsOf(office.b.tenantId, caseOfB)).map((row) => row.id), String(B_PRINCIPAL), privatePackageOfB.name];

      const foreign = boundaryCalls(office.a, caseOfB);
      const missing = boundaryCalls(office.a, missingCaseId);
      const observed: Record<string, unknown> = {};
      const expected: Record<string, unknown> = {};
      for (const [index, [name, call]] of foreign.entries()) {
        const foreignResponse = await call();
        const missingResponse = await missing[index][1]();
        observed[name] = {
          foreign: outcome(foreignResponse),
          missing: outcome(missingResponse),
          leaked: secrets.filter((secret) => JSON.stringify(foreignResponse.body).includes(secret)),
        };
        expected[name] = { foreign: NOT_FOUND, missing: NOT_FOUND, leaked: [] };
      }

      expect(observed).toEqual(expected);
      // Yabancı istekler B'nin kayıtlarına dokunmadı
      expect(await footprintOfB()).toEqual(before);
    });

    it('kontrol: B kullanıcısı da var olmayan dosyada ve A bürosunun dosyasında aynı yanıtı alır', async () => {
      for (const caseId of [missingCaseId, caseOfA]) {
        for (const [name, call] of boundaryCalls(office.b, caseId)) {
          expect({ name, ...outcome(await call()) }).toEqual({ name, ...NOT_FOUND });
        }
      }
    });

    it('çağıranın gönderdiği büro kimliği (sorgu / gövde / başlık) dikkate alınmaz: büro yalnız oturumdan gelir', async () => {
      const claimed = office.b.tenantId;
      const spoofed = [
        ['GET gate-status', () => get(office.a, `/expense-requests/case/${caseOfB}/gate-status?tenantId=${claimed}`)],
        ['GET gate-summary', () => get(office.a, `/expense-requests/case/${caseOfB}/gate-summary?tenantId=${claimed}`)],
        ['GET can-perform/SEND', () => get(office.a, `/expense-requests/case/${caseOfB}/can-perform/SEND?tenantId=${claimed}`)],
        [
          'POST compute',
          () => post(office.a, `/cost-packages/compute?tenantId=${claimed}`, { caseId: caseOfB, packageCode: systemPackage.code, tenantId: claimed }),
        ],
      ] as const;

      for (const [name, call] of spoofed) {
        expect({ name, ...outcome(await call().set('x-tenant-id', claimed)) }).toEqual({ name, ...NOT_FOUND });
      }
    });

    it('paket hesabı: gövdede dosya kimliği yoksa ya da metin değilse 404; kimlik süzgeç işleci gibi yorumlanmaz', async () => {
      // B'nin kendi bürosunda dosyaları var: kimlik yok sayılsaydı ya da nesne süzgeç sayılsaydı bunlardan biri seçilir, 201 dönerdi
      expect(await prisma.case.count({ where: { tenantId: office.b.tenantId } })).toBeGreaterThan(1);

      for (const caseId of [undefined, null, '', 42, { not: '' }, { contains: '' }, [caseOfB]]) {
        const res = await post(office.b, '/cost-packages/compute', { caseId, packageCode: systemPackage.code });
        expect({ caseId, ...outcome(res) }).toEqual({ caseId, ...NOT_FOUND });
      }
    });

    it('kontrol: A bürosu kendi dosyasında B bürosunun özel paketini kullanamaz (paket çağıranın bürosunda aranır)', async () => {
      const res = await post(office.a, '/cost-packages/compute', { caseId: caseOfA, packageCode: privatePackageOfB.code });
      expect(outcome(res)).toEqual({
        status: 404,
        body: { statusCode: 404, message: `Masraf paketi bulunamadı: ${privatePackageOfB.code}`, error: 'Not Found' },
      });
    });
  });

  describe('sorgu düzeyi büro süzgeci: dosyada başka büro damgalı talep sayılmaz', () => {
    it.each(['kapalı', 'açık'])('B yalnız kendi damgalı talebini görür; A dosyaya yine erişemez (kalan-bazlı karar %s)', async (flag) => {
      if (flag === 'açık') process.env[REMAINING_GATE_FLAG] = 'true';
      // Kurulum boş değil: dosyada iki kilitleyen talep var, biri A damgalı
      expect(await prisma.expenseRequest.count({ where: { caseId: mixedStampCaseOfB, gateType: 'BLOCKING', status: 'PENDING' } })).toBe(2);
      const ownRows = await blockingRowsOf(office.b.tenantId, mixedStampCaseOfB);
      expect(ownRows.map((row) => row.totalAmount)).toEqual([200]);
      const expected = blockedGate(ownRows);

      expect(outcome(await get(office.b, `/expense-requests/case/${mixedStampCaseOfB}/gate-status`))).toEqual({ status: 200, body: expected.status });
      expect(outcome(await get(office.b, `/expense-requests/case/${mixedStampCaseOfB}/gate-summary`))).toEqual({ status: 200, body: expected.summary });
      for (const [name, call] of boundaryCalls(office.a, mixedStampCaseOfB)) {
        expect({ name, ...outcome(await call()) }).toEqual({ name, ...NOT_FOUND });
      }
    });

    it('yalnız başka büro damgalı talep kalınca B için kapı açıktır (sayım yolu da büro süzgeçli)', async () => {
      await prisma.expenseRequest.updateMany({ where: { caseId: mixedStampCaseOfB, tenantId: office.b.tenantId }, data: { status: 'CANCELLED' } });
      try {
        for (const flag of ['kapalı', 'açık']) {
          if (flag === 'açık') process.env[REMAINING_GATE_FLAG] = 'true';
          expect({ flag, ...outcome(await get(office.b, `/expense-requests/case/${mixedStampCaseOfB}/can-perform/SEND`)) }).toEqual({
            flag,
            status: 200,
            body: { canPerform: true, actionType: 'SEND' },
          });
        }
      } finally {
        await prisma.expenseRequest.updateMany({ where: { caseId: mixedStampCaseOfB, tenantId: office.b.tenantId }, data: { status: 'PENDING' } });
      }
    });
  });

  describe('UYAP gönderim hazırlığı (POST /cases/:caseId/uyap/prepare): paket hesabının ikinci çağıranı', () => {
    /**
     * Politika motoru kararı bu testin konusu değildir (UYAP yetki / erişilebilirlik kapıları ayrı testlerdedir); hazırlığın
     * paket hesabına ulaşabilmesi için karar "izinli" verilir. Ölçülen: hazırlık, dosyanın bürosu için paket hesabını
     * bugünkü gibi yapar ve başka büronun dosyasında hesaba hiç ulaşmaz.
     */
    const allowPolicy = () =>
      jest.spyOn(app.get(CasePolicyEngine, { strict: false }), 'canPerformAction').mockResolvedValue({ allowed: true } as never);

    it('kendi dosyası: bakiye ↔ paket toplamı karşılaştırması bugünkü gibi çalışır', async () => {
      const policy = allowPolicy();
      // Hazırlığın kullandığı paket (UYAP_PRE) ve adetlerle aynı hesap, paket ucundan: karşılaştırmanın beklenen toplamı
      const computed = await post(office.b, '/cost-packages/compute', { caseId: caseOfB, packageCode: uyapPrePackageOfB.code, debtorCount: 1, tebligatCount: 1 });
      expect(computed.status).toBe(201);
      expect(computed.body.items.find((item: { itemCode: string }) => item.itemCode === 'PESIN_HARC').calcParams.baseValue).toBe(B_PRINCIPAL);
      expect(computed.body.totalSuggested).toBeGreaterThan(0);

      // Hazırlık artık önce masraf kapısını uygular (ödenmemiş BLOCKING talep → "Masraf karşılanmadı", satır 2 / owner kararı 9);
      // paket hesabına ulaşmak için açılış talebi bu testte karşılanmış işaretlenir ve test sonunda eski haline döner.
      const openingRows = await prisma.expenseRequest.findMany({
        where: { tenantId: office.b.tenantId, caseId: caseOfB },
        select: { id: true, status: true, paidTotal: true },
      });
      await prisma.expenseRequest.updateMany({ where: { tenantId: office.b.tenantId, caseId: caseOfB }, data: { status: 'PAID', paidTotal: 1 } });
      // Bu dosyada avans satırı YOK: mesaj "0 TL" değil "avans kaydı yok" der (owner kararı 5)
      expect(await prisma.caseBalance.findUnique({ where: { caseId: caseOfB } })).toBeNull();
      let prepared: Awaited<ReturnType<typeof post>>;
      try {
        prepared = await post(office.b, `/cases/${caseOfB}/uyap/prepare`);
      } finally {
        for (const row of openingRows) {
          await prisma.expenseRequest.update({ where: { id: row.id }, data: { status: row.status, paidTotal: row.paidTotal } });
        }
      }
      expect(outcome(prepared)).toEqual({
        status: 201,
        body: {
          action: 'OPEN_EXPENSE_MODAL',
          blockReason: `Yetersiz bakiye. Gerekli: ${computed.body.totalSuggested} TL, Mevcut: avans kaydı yok`,
          suggestion: {
            title: `${computed.body.packageName} için masraf gerekiyor`,
            description: expect.stringMatching(/^Toplam: .+ TL$/),
            packageCode: uyapPrePackageOfB.code,
          },
        },
      });
      expect(policy).toHaveBeenCalledWith(office.b.tenantId, caseOfB, ActionCode.UYAP_SEND, expect.anything());
    });

    it('başka büronun dosyası: 404 "Takip bulunamadı"; politika motoruna ve paket hesabına ulaşılmaz', async () => {
      const policy = allowPolicy();
      const before = await footprintOfB();

      expect(outcome(await post(office.a, `/cases/${caseOfB}/uyap/prepare`))).toEqual(NOT_FOUND);
      expect(outcome(await post(office.a, `/cases/${missingCaseId}/uyap/prepare`))).toEqual(NOT_FOUND);
      expect(policy).not.toHaveBeenCalled();
      expect(await footprintOfB()).toEqual(before);
    });
  });
});
