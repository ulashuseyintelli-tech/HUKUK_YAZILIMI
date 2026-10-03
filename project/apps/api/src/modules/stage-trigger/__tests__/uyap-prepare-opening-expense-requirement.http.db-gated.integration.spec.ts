// CaseModule grafiği `pdf-poppler`'ı yükler; paket Linux'ta yükleme anında process.exit(1) verir
// (CI emsali: case-create-due-currency.http.db-gated.integration.spec.ts).
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
import { ErrorLogModule } from '../../error-log/error-log.module';
import { MetricsRegistryModule } from '../../metrics-registry/metrics-registry.module';
import { CasePolicyEngine } from '../../policy-engine/case-policy-engine.service';
import { UyapModule } from '../../uyap/uyap.module';
import { StageTriggerModule } from '../stage-trigger.module';

/**
 * Açılış masrafı şartı — tutarı BELİRLENEMEMİŞ açılış masrafı "sağlandı" sayılmaz. GERÇEK HTTP + disposable PostgreSQL.
 *
 * Ölçülen durum (main 6681b1d5): dövizli dosyada otomatik açılış masraf talebi oluşturulmaz (#2876). Dosyada talep
 * bulunmadığı için masraf kapısı durum uçları dosyayı "UYAP işlemleri için hazır" bildiriyordu (isBlocked=false,
 * canPerform=true, canSubmitToUyap=true) ve başka büronun dosyasını da yanıtlıyordu; UYAP gönderim hazırlığı dosyada hiç
 * talep yokken "Ödenmemiş masraf talebi var" gerekçesiyle reddediyordu; politika motoru izin verdiğinde ise hazırlık,
 * bakiyeyi TL tarifesi oranının HAM döviz sayısına uygulanmasıyla bulunan paket toplamıyla karşılaştırıp "hazır" diyordu.
 *
 * Kural (owner ek kararı 2026-10-01): talebin oluşturulamaması masraf şartını sağlamaz; açılış masrafı şartına bağlı
 * işlemlerde eksik hesap görünür ve engelleyicidir; mevcut geçerli tamamlama yolu (peşin harcı TL tutarıyla içeren, elle
 * oluşturulmuş ve karşılanmış masraf talebi) şartı sağladığında engel kalkar; yalnız bir talebin varlığı yetmez; okuma /
 * sorgu ve bu şarttan bağımsız işlemler etkilenmez; ret yolunda masraf, muhasebe, bakiye, UYAP isteği ya da bildirim kaydı
 * yazılmaz (politika motorunun karar kaydı — denetim izi — korunur). TL dosyanın davranışı DEĞİŞMEZ.
 *
 * KAPSAM DIŞI: UYAP gönderim hazırlığı bugün politika motoru tarafından her dosyada reddedilir (bu yola büro / kullanıcı
 * bağlamı geçmiyor); bu genel durum burada değiştirilmez ve sabitlenmez — hazırlık yolunun masraf koşulu, politika motoru
 * kararı sabitlenerek ayrıca ölçülür. Dövizli takipte peşin harcın hangi tutar ve kur üzerinden hesaplanacağı owner kararı.
 */
const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('UYAP-PREPARE-OPENING-EXPENSE DB gate blocked: CI requires an approved TEST_DATABASE_URL.');
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;

const PRODUCTION_VALIDATION_OPTIONS = { whitelist: true, forbidNonWhitelisted: true, transform: true } as const;

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

const NOT_DETERMINED = 'OPENING_EXPENSE_NOT_DETERMINED';
const CONSEQUENCE = 'Açılış masrafı belirlenmediği için masraf şartı sağlanmış sayılmaz.';
const COMPLETION_PATH =
  'Bu engelin kalkması için "Peşin Harç" kalemini TL tutarıyla içeren masraf talebi, kalemleri elle girilerek oluşturulmalı ve ' +
  'karşılanmalıdır (ödeme alındı ya da avukat karşıladı).';
const PREPARE_REJECTED = "UYAP'a gönderim hazırlığı yapılamaz.";
const GATE_READY = { isBlocked: false, blockingExpenses: [], totalPending: 0 };
const SUMMARY_READY = {
  isBlocked: false,
  totalPending: 0,
  blockingCount: 0,
  expenses: [],
  canSubmitToUyap: true,
  canSendNotification: true,
  message: 'UYAP işlemleri için hazır.',
};

describeWithDisposableDb('Açılış masrafı şartı — belirlenemeyen masraf sağlanmış sayılmaz (HTTP + disposable PostgreSQL)', () => {
  jest.setTimeout(240_000);

  let prisma: PrismaClient;
  let app: INestApplication;
  let tenantId: string;
  let adminId: string;
  let clientId: string;
  let otherTenantId: string;
  let otherAdminId: string;
  let costPackageId: string;
  const suffix = randomUUID().slice(0, 8);

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
        StageTriggerModule,
        // Uygulamadaki gibi: UYAP modülü politika motoruna masraf / vekalet olgu sağlayıcılarını kaydeder
        UyapModule,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(identity)
      // Masraf, bakiye ve aşama denetleyicileri passport korumasını doğrudan kullanır (AuthGuard('jwt') aynı sınıfı döndürür)
      .overrideGuard(AuthGuard('jwt'))
      .useValue(identity)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe(PRODUCTION_VALIDATION_OPTIONS));
    await app.init();

    tenantId = `test-ci-uoer-${suffix}`;
    await prisma.tenant.create({ data: { id: tenantId, name: 'CI UOER', slug: tenantId } });
    adminId = (await prisma.user.create({ data: { tenantId, email: `admin-${suffix}@example.test`, name: 'admin', surname: 'UOER', role: 'ADMIN' } })).id;
    clientId = (await prisma.client.create({ data: { tenantId, type: 'COMPANY', companyName: 'UOER müvekkil', displayName: 'UOER müvekkil' } })).id;

    otherTenantId = `test-ci-uoer-b-${suffix}`;
    await prisma.tenant.create({ data: { id: otherTenantId, name: 'CI UOER B', slug: otherTenantId } });
    otherAdminId = (
      await prisma.user.create({ data: { tenantId: otherTenantId, email: `b-${suffix}@example.test`, name: 'b', surname: 'UOER', role: 'ADMIN' } })
    ).id;

    // "UYAP Öncesi / Takip Açılış Masrafları" paketi (prisma/seed-cost-packages.ts ile AYNI kalemler; büroya özel satır)
    costPackageId = (
      await prisma.costPackage.create({
        data: {
          tenantId,
          code: 'UYAP_PRE',
          name: 'UYAP Öncesi / Takip Açılış Masrafları',
          isSystem: true,
          items: {
            create: [
              { itemCode: 'BASVURMA_HARCI', label: 'Başvurma Harcı', defaultAmount: 615.4, sortOrder: 1, isEditable: false },
              { itemCode: 'VEKALET_HARCI', label: 'Vekalet Harcı', defaultAmount: 87.5, sortOrder: 2, isEditable: false },
              {
                itemCode: 'PESIN_HARC',
                label: 'Peşin Harç',
                defaultAmount: 5722.19,
                sortOrder: 3,
                calcRule: { type: 'percentage', rate: 0.005, base: 'principalAmount', min: 100 },
              },
              { itemCode: 'DOSYA_GIDERI', label: 'Dosya Gideri', defaultAmount: 2, sortOrder: 4, isEditable: false },
              {
                itemCode: 'TEBLIGAT_GIDERI',
                label: 'Tebligat Gideri',
                defaultAmount: 15,
                sortOrder: 5,
                calcRule: { type: 'per_unit', unitAmount: 15, multiplier: 'debtorCount' },
              },
              { itemCode: 'VEKALET_PULU', label: 'Vekalet Pulu', defaultAmount: 138, sortOrder: 6, isEditable: false },
            ],
          },
        },
      })
    ).id;
  });

  afterAll(async () => {
    await app?.close();
    await prisma.costPackage.deleteMany({ where: { id: costPackageId } }).catch(() => undefined);
    for (const id of [tenantId, otherTenantId]) {
      // UYAP istek kaydı ve denetim kaydı büroya ilişkiyle bağlı değildir: büro silinince kendiliğinden gitmez
      await prisma.uyapRequestLog.deleteMany({ where: { tenantId: id } }).catch(() => undefined);
      await prisma.auditLog.deleteMany({ where: { tenantId: id } }).catch(() => undefined);
      await prisma.tenant.deleteMany({ where: { id } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  const http = () => request(app.getHttpServer());
  const post = (path: string, body: object = {}, userId = adminId) => http().post(path).set('x-test-user-id', userId).send(body);
  const get = (path: string, userId = adminId) => http().get(path).set('x-test-user-id', userId);

  const principal = (amount: number) => ({ type: 'PRINCIPAL', description: 'Asıl alacak', amount, dueDate: '2026-01-15' });
  const withClient = () => ({ creditors: [{ id: clientId, type: 'COMPANY', name: 'UOER müvekkil' }] });

  const openCase = async (label: string, body: Record<string, unknown>) => {
    const res = await post('/cases', {
      fileNumber: `CI-UOER-${label}-${suffix}`,
      type: 'GENERAL_EXECUTION',
      interestType: 'YASAL',
      startDate: '2026-02-01',
      ...body,
    });
    expect(res.status).toBe(201);
    return res.body.id as string;
  };

  const openUsdCase = (label: string, extra: Record<string, unknown> = withClient()) =>
    openCase(label, { currency: 'USD', subCategory: 'DOVIZ', ...extra, dues: [principal(10_000)] });

  const expenseRequestsOf = async (caseId: string) =>
    (await prisma.expenseRequest.findMany({ where: { tenantId, caseId }, orderBy: { createdAt: 'asc' } })).map((row) => ({
      id: row.id,
      stageCode: row.stageCode,
      status: String(row.status),
      totalAmount: Number(row.totalAmount),
    }));

  /** Müvekkilli TL dosya: arka planda oluşan açılış talebi görünene kadar bekler (en çok ~8 sn). */
  const openTryCaseWithOpeningRequest = async (label: string) => {
    const caseId = await openCase(label, { currency: 'TRY', ...withClient(), dues: [principal(10_000)] });
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const requests = await expenseRequestsOf(caseId);
      if (requests.length > 0) return { caseId, openingRequestId: requests[0].id };
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error('TL dosyanın açılış masraf talebi oluşmadı');
  };

  /**
   * "Dövizli dosyada talep oluşmadı" iddiasının boş olmaması için POZİTİF KONTROL: dövizli dosyadan SONRA açılan TL
   * dosyanın arka plan talebi görünene kadar beklenir (dövizli dosya için bir yazma olsaydı ondan önce tetiklenirdi).
   */
  const settleBackgroundOpening = (label: string) => openTryCaseWithOpeningRequest(`${label}-kontrol`);

  const gateStatus = async (caseId: string) => (await get(`/expense-requests/case/${caseId}/gate-status`)).body as Record<string, any>;
  const gateSummary = async (caseId: string) => (await get(`/expense-requests/case/${caseId}/gate-summary`)).body as Record<string, any>;
  const canPerform = async (caseId: string, actionType: string) =>
    (await get(`/expense-requests/case/${caseId}/can-perform/${actionType}`)).body as { canPerform: boolean; actionType: string };

  /** Hazırlık yanıtı; politika kararının izleme kimliği dosyaya göre değiştiği için karşılaştırma dışı tutulur. */
  const prepare = async (caseId: string) => {
    const res = await post(`/cases/${caseId}/uyap/prepare`);
    const { cpeTraceId: _cpeTraceId, ...body } = res.body as Record<string, any>;
    return { status: res.status, body };
  };

  const createManualRequest = async (caseId: string, items: Array<{ type: string; description: string; amount: number }>) => {
    const res = await post('/expense-requests', { caseId, clientId, items });
    expect(res.status).toBe(201);
    return res.body.id as string;
  };

  const withAdvanceFee = [
    { type: 'BASVURMA_HARCI', description: 'Takip açılışı başvurma harcı', amount: 738.5 },
    { type: 'PESIN_HARC', description: 'Peşin harç — icra dairesi tahakkuku (elle girildi)', amount: 2150 },
  ];

  const receive = async (requestId: string, paidAmount: number) => {
    const res = await post(`/expense-requests/${requestId}/receive`, { paidAmount });
    expect({ status: res.status, requestStatus: res.body?.status }).toEqual({ status: 201, requestStatus: 'RECEIVED' });
  };

  /** Dosyanın finansal ve dış yazma izi: masraf, muhasebe, bakiye, UYAP isteği ve müvekkil bildirimi kayıtları. */
  const sideEffectsOf = async (caseId: string) => ({
    expenseRequests: await prisma.expenseRequest.count({ where: { tenantId, caseId } }),
    expenseItems: await prisma.expenseRequestItem.count({ where: { expenseRequest: { tenantId, caseId } } }),
    journalEntries: await prisma.accountingJournalEntry.count({ where: { tenantId, caseId } }),
    caseBalances: await prisma.caseBalance.count({ where: { caseId } }),
    balanceLedgers: await prisma.balanceLedger.count({ where: { tenantId, caseBalance: { caseId } } }),
    uyapRequestLogs: await prisma.uyapRequestLog.count({ where: { caseId } }),
    clientNotifications: await prisma.clientNotification.count({ where: { tenantId, caseId } }),
  });

  const NO_SIDE_EFFECTS = {
    expenseRequests: 0,
    expenseItems: 0,
    journalEntries: 0,
    caseBalances: 0,
    balanceLedgers: 0,
    uyapRequestLogs: 0,
    clientNotifications: 0,
  };

  /** Politika motorunun bu dosya için yazdığı karar kayıtları (denetim izi). */
  const policyDecisionsOf = async (caseId: string) =>
    (await prisma.cpeDecisionLog.findMany({ where: { caseId }, orderBy: { createdAt: 'asc' } })).map((row) => ({
      actionCode: row.actionCode,
      allowed: row.allowed,
    }));

  const notDeterminedOf = (currency: string, basisCurrencies: string[], clientAssigned = true) => ({
    status: 'NOT_DETERMINED',
    reasonCode: NOT_DETERMINED,
    message: expect.stringMatching(new RegExp(`^${CONSEQUENCE} Açılış masraf talebi otomatik oluşturulmadı: `)),
    requiredInfo: ['Peşin harç tutarı (TL)'],
    notCalculableItems: [{ itemCode: 'PESIN_HARC', label: 'Peşin Harç' }],
    completionPath: clientAssigned ? COMPLETION_PATH : `Dosyaya müvekkil atanmamış; masraf talebi için önce müvekkil atanmalıdır. ${COMPLETION_PATH}`,
    clientAssigned,
    caseCurrency: currency,
    basisCurrencies,
    tariffCurrency: 'TRY',
  });

  describe('TL dosya (kontrol): mevcut davranış korunur', () => {
    let caseId: string;
    let openingRequestId: string;

    beforeAll(async () => {
      ({ caseId, openingRequestId } = await openTryCaseWithOpeningRequest('try'));
    });

    it('açılış talebi ödenmemişken: masraf kapısı bugünkü yanıtı verir — açılış masrafı alanı yok', async () => {
      expect(await gateStatus(caseId)).toEqual({
        isBlocked: true,
        blockingExpenses: [{ id: openingRequestId, stageCode: 'OPENING', totalAmount: 1431.1, paidTotal: 0, remaining: 1431.1, status: 'PENDING' }],
        totalPending: 1431.1,
        message: '1 adet ödenmemiş masraf talebi var. Toplam: 1431.10 TL',
      });
      expect(await gateSummary(caseId)).toEqual({
        isBlocked: true,
        totalPending: 1431.1,
        blockingCount: 1,
        expenses: [{ id: openingRequestId, stageCode: 'OPENING', totalAmount: 1431.1, paidTotal: 0, remaining: 1431.1, status: 'PENDING' }],
        canSubmitToUyap: false,
        canSendNotification: false,
        message: 'Masraf ödenmeden UYAP işlemi yapılamaz. Bekleyen: 1431.10 TL',
      });
      expect(await canPerform(caseId, 'SUBMIT')).toEqual({ canPerform: false, actionType: 'SUBMIT' });
      expect(await canPerform(caseId, 'VIEW')).toEqual({ canPerform: true, actionType: 'VIEW' });
    });

    it('UYAP gönderim hazırlığı: açılış masrafı gerekçesi ÜRETİLMEZ', async () => {
      const prepared = await prepare(caseId);

      expect(prepared.status).toBe(201);
      expect(prepared.body).not.toHaveProperty('openingExpense');
      expect(String(prepared.body.blockReason ?? '')).not.toContain('Açılış masrafı belirlenmediği');
    });

    it('açılış talebi karşılanınca: masraf kapısı açılır (mevcut yanıt aynen)', async () => {
      await receive(openingRequestId, 1431.1);

      expect(await gateStatus(caseId)).toEqual(GATE_READY);
      expect(await gateSummary(caseId)).toEqual(SUMMARY_READY);
      expect(await canPerform(caseId, 'SUBMIT')).toEqual({ canPerform: true, actionType: 'SUBMIT' });
    });
  });

  describe('USD dosya (10.000 anapara, müvekkilli): açılış masrafı belirlenmedi', () => {
    let caseId: string;

    beforeAll(async () => {
      caseId = await openUsdCase('usd');
      await settleBackgroundOpening('usd');
    });

    it('dosya açılır; yanlış tutarlı masraf talebi YAZILMAZ', async () => {
      expect(await prisma.case.findUniqueOrThrow({ where: { id: caseId }, select: { currency: true, clientId: true } })).toEqual({
        currency: 'USD',
        clientId,
      });
      expect(await sideEffectsOf(caseId)).toEqual(NO_SIDE_EFFECTS);
    });

    it('MASRAF KAPISI: talep yok diye "hazır" SAYILMAZ — kilitli; neden, gereken bilgi ve düzeltme yolu görünür; tutar uydurulmaz', async () => {
      const gate = await gateStatus(caseId);

      expect(gate).toEqual({
        isBlocked: true,
        blockingExpenses: [],
        totalPending: 0,
        message: expect.any(String),
        openingExpense: notDeterminedOf('USD', ['USD']),
      });
      expect(gate.message).toBe(`${gate.openingExpense.message} ${COMPLETION_PATH}`);
      expect(gate.openingExpense.message).toContain('dosya para birimi USD');
      // Kur, tutar ya da toplam önerilmez
      expect(gate.message).not.toMatch(/\d/);

      const summary = await gateSummary(caseId);
      expect(summary).toEqual({
        isBlocked: true,
        totalPending: 0,
        blockingCount: 0,
        expenses: [],
        canSubmitToUyap: false,
        canSendNotification: false,
        message: gate.message,
        openingExpense: gate.openingExpense,
      });
    });

    it.each(['SUBMIT', 'SEND', 'NOTIFICATION', 'HACIZ'])('MASRAF KAPISI: %s yapılamaz', async (actionType) => {
      expect(await canPerform(caseId, actionType)).toEqual({ canPerform: false, actionType });
    });

    it.each(['VIEW', 'QUERY', 'DOWNLOAD'])('OKUMA / SORGU (%s) etkilenmez', async (actionType) => {
      expect(await canPerform(caseId, actionType)).toEqual({ canPerform: true, actionType });
    });

    it.each([
      ['POST /cases/:caseId/uyap/prepare', (id: string) => post(`/cases/${id}/uyap/prepare`)],
      ['POST /cases/:caseId/stage-trigger', (id: string) => post(`/cases/${id}/stage-trigger`, { eventCode: 'EVT_UYAP_SEND_CLICKED' })],
      ['POST /cases/:caseId/operations', (id: string) => post(`/cases/${id}/operations`, { operationCode: 'EVT_UYAP_SEND_CLICKED', amount: 0 })],
    ])('UYAP GÖNDERİM HAZIRLIĞI (%s): gerçek nedenle reddedilir — "ödenmemiş talep var" denmez; düzeltme yolu gösterilir', async (_title, send) => {
      const res = await send(caseId);

      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        action: 'BLOCKED',
        blockReason: expect.stringMatching(new RegExp(`^${PREPARE_REJECTED} ${CONSEQUENCE} `)),
        openingExpense: notDeterminedOf('USD', ['USD']),
        suggestion: { title: 'Açılış masrafı belirlenmedi', description: 'Gereken bilgi: Peşin harç tutarı (TL)' },
        // Ret, politika motorunun kararına bağlıdır: karar kaydının izleme kimliği yanıtta kalır
        cpeTraceId: expect.any(String),
      });
      expect(res.body.blockReason).toBe(`${PREPARE_REJECTED} ${res.body.openingExpense.message} ${COMPLETION_PATH}`);
      expect(res.body.blockReason).not.toContain('Ödenmemiş masraf talebi var');
      expect(res.body.blockReason).not.toMatch(/\d/);
    });

    it('RET YOLUNDA FİNANSAL / DIŞ YAN ETKİ YOK: masraf, muhasebe, bakiye, UYAP isteği ya da bildirim kaydı yazılmaz; ret denetim izinde kalır', async () => {
      // Önceki testlerdeki kapı okumaları ve üç ret dahil: dosyanın finansal / dış yazma izi hâlâ boş
      expect(await sideEffectsOf(caseId)).toEqual(NO_SIDE_EFFECTS);
      // Politika motoru atlanmaz: üç ret de karar kaydına (denetim izi) yazılmıştır
      expect(await policyDecisionsOf(caseId)).toEqual([
        { actionCode: 'UYAP_SEND', allowed: false },
        { actionCode: 'UYAP_SEND', allowed: false },
        { actionCode: 'UYAP_SEND', allowed: false },
      ]);
    });

    it('politika motorunun BAŞKA gerekçesi (dosya arşivde) açılış masrafı gerekçesiyle değiştirilmez: yanıt, arşivdeki TL dosyanınkiyle aynı', async () => {
      const archivedUsd = await openUsdCase('usd-arsiv');
      const archivedTry = await openCase('try-arsiv', { currency: 'TRY', dues: [principal(10_000)] });
      await prisma.case.updateMany({ where: { id: { in: [archivedUsd, archivedTry] } }, data: { isArchived: true } });

      const prepared = await prepare(archivedUsd);

      expect(prepared.body.action).toBe('BLOCKED');
      expect(prepared.body).not.toHaveProperty('openingExpense');
      expect(prepared.body.blockReason).not.toContain('Açılış masrafı belirlenmediği');
      expect(prepared).toEqual(await prepare(archivedTry));
      // Arşivdeki dövizli dosyada masraf kapısı durum ucu açılış masrafını bildirmeyi sürdürür (salt okuma)
      expect(await gateStatus(archivedUsd)).toMatchObject({ isBlocked: true, openingExpense: { reasonCode: NOT_DETERMINED } });
    });

    it('BAĞIMSIZ İŞLEMLER etkilenmez: UYAP dosya durumu sorgusu ve vekalet doğrulaması yanıt verir; başka aşama olayı açılış gerekçesi almaz', async () => {
      expect((await get(`/uyap/case/${caseId}/status`)).status).toBe(200);
      expect((await get(`/uyap/poa/validate/case/${caseId}`)).status).toBe(200);

      const otherEvent = await post(`/cases/${caseId}/stage-trigger`, { eventCode: 'EVT_TEBLIGAT_SEND' });
      expect(otherEvent.status).toBe(201);
      expect(otherEvent.body).not.toHaveProperty('openingExpense');
      expect(String(otherEvent.body.blockReason ?? '')).not.toContain('Açılış masrafı belirlenmediği');
    });
  });

  describe('tamamlama yolu: peşin harcı TL tutarıyla içeren, elle oluşturulmuş ve karşılanmış masraf talebi', () => {
    it('YALNIZ BİR TALEBİN VARLIĞI YETMEZ: peşin harçsız talep (ödenmiş olsa da) açılış masrafını belirlemez', async () => {
      const caseId = await openUsdCase('usd-pesinsiz');
      const requestId = await createManualRequest(caseId, [{ type: 'POSTA', description: 'Kargo gideri', amount: 50 }]);

      const unpaid = await gateStatus(caseId);
      expect(unpaid).toMatchObject({ isBlocked: true, totalPending: 50, openingExpense: { reasonCode: NOT_DETERMINED } });
      expect(unpaid.message).toBe(`${unpaid.openingExpense.message} ${COMPLETION_PATH} Ayrıca: 1 adet ödenmemiş masraf talebi var. Toplam: 50.00 TL`);

      await receive(requestId, 50);

      expect(await gateStatus(caseId)).toMatchObject({ isBlocked: true, blockingExpenses: [], openingExpense: { reasonCode: NOT_DETERMINED } });
      expect(await canPerform(caseId, 'SUBMIT')).toEqual({ canPerform: false, actionType: 'SUBMIT' });
      expect((await prepare(caseId)).body).toMatchObject({ action: 'BLOCKED', openingExpense: { reasonCode: NOT_DETERMINED } });
    });

    it('paket modu talebi (yalnız eski biçim kalem listesi; öneri düzenlenmiş mi kayıtlı değil) açılış masrafını belirlemez', async () => {
      const caseId = await openUsdCase('usd-paket');
      const res = await post('/expense-requests/from-package', {
        caseId,
        clientId,
        packageCode: 'UYAP_PRE',
        items: [{ itemCode: 'PESIN_HARC', label: 'Peşin Harç', suggestedAmount: 100, finalAmount: 100 }],
        paidByLawyer: true,
      });
      expect({ status: res.status, requestStatus: res.body?.status }).toEqual({ status: 201, requestStatus: 'LAWYER_PAID' });

      expect(await gateStatus(caseId)).toMatchObject({ isBlocked: true, openingExpense: { reasonCode: NOT_DETERMINED } });
    });

    it('tutarı 0 olan peşin harç satırı "kayıtlı" sayılmaz (eksik tutar 0 kabul edilmez)', async () => {
      const caseId = await openUsdCase('usd-sifir');
      await prisma.expenseRequest.create({
        data: {
          tenantId,
          caseId,
          clientId,
          stageCode: 'OPENING',
          gateType: 'BLOCKING',
          totalAmount: 252,
          status: 'RECEIVED',
          createdById: adminId,
          requestItems: {
            create: [
              { itemCode: 'PESIN_HARC', label: 'Peşin Harç', suggestedAmount: 0, finalAmount: 0, sortOrder: 0 },
              { itemCode: 'TEBLIGAT_GIDERI', label: 'Tebligat Gideri', suggestedAmount: 252, finalAmount: 252, sortOrder: 1 },
            ],
          },
        },
      });

      expect(await gateStatus(caseId)).toMatchObject({ isBlocked: true, openingExpense: { reasonCode: NOT_DETERMINED } });
    });

    describe('peşin harç elle girilmiş talep', () => {
      let caseId: string;
      let requestId: string;
      let tryCase: { caseId: string; openingRequestId: string };

      beforeAll(async () => {
        caseId = await openUsdCase('usd-elle');
        tryCase = await openTryCaseWithOpeningRequest('try-esdeger');
        requestId = await createManualRequest(caseId, withAdvanceFee);
      });

      it('talep ÖDENMEMİŞKEN: açılış masrafı belirlenmiştir ama mevcut kural kilitler — talebin varlığı şartı sağlamaz', async () => {
        expect(await gateStatus(caseId)).toEqual({
          isBlocked: true,
          blockingExpenses: [{ id: requestId, stageCode: null, totalAmount: 2888.5, paidTotal: 0, remaining: 2888.5, status: 'PENDING' }],
          totalPending: 2888.5,
          message: '1 adet ödenmemiş masraf talebi var. Toplam: 2888.50 TL',
        });
        expect(await canPerform(caseId, 'SUBMIT')).toEqual({ canPerform: false, actionType: 'SUBMIT' });
        // Hazırlık yolunda açılış gerekçesi kalkar: yanıt, aynı durumdaki TL dosyanın yanıtıyla AYNI
        const prepared = await prepare(caseId);
        expect(prepared.body).not.toHaveProperty('openingExpense');
        expect(prepared).toEqual(await prepare(tryCase.caseId));
      });

      it('talep KARŞILANINCA: engel kalkar — masraf kapısı açılır; hazırlık yanıtı karşılanmış TL dosyayla aynı', async () => {
        await receive(requestId, 2888.5);
        await receive(tryCase.openingRequestId, 1431.1);

        expect(await gateStatus(caseId)).toEqual(GATE_READY);
        expect(await gateSummary(caseId)).toEqual(SUMMARY_READY);
        expect(await canPerform(caseId, 'SUBMIT')).toEqual({ canPerform: true, actionType: 'SUBMIT' });
        const prepared = await prepare(caseId);
        expect(prepared.body).not.toHaveProperty('openingExpense');
        expect(prepared).toEqual(await prepare(tryCase.caseId));
      });
    });

    it('elle girilen talep İPTAL edilirse açılış masrafı yeniden belirlenmemiş olur', async () => {
      const caseId = await openUsdCase('usd-iptal');
      const requestId = await createManualRequest(caseId, withAdvanceFee);
      expect(await gateStatus(caseId)).not.toHaveProperty('openingExpense');

      const cancelled = await post(`/expense-requests/${requestId}/cancel`, { reason: 'yanlış girildi' });
      expect(cancelled.status).toBe(201);

      expect(await gateStatus(caseId)).toMatchObject({ isBlocked: true, blockingExpenses: [], openingExpense: { reasonCode: NOT_DETERMINED } });
    });

    it('geçmiş kayıt: dövizli dosyada ÖNCEDEN oluşmuş açılış talebi yeniden yorumlanmaz — mevcut kural (ödenene kadar kilit) aynen', async () => {
      const caseId = await openUsdCase('usd-gecmis');
      const legacy = await prisma.expenseRequest.create({
        data: {
          tenantId,
          caseId,
          clientId,
          packageCode: 'OPENING',
          stageCode: 'OPENING',
          gateType: 'BLOCKING',
          totalAmount: 1431.1,
          status: 'PENDING',
          createdById: 'system',
          requestItems: { create: [{ itemCode: 'PESIN_HARC', label: 'Peşin Harç', suggestedAmount: 120, finalAmount: 120, sortOrder: 0 }] },
        },
      });

      expect(await gateStatus(caseId)).toEqual({
        isBlocked: true,
        blockingExpenses: [{ id: legacy.id, stageCode: 'OPENING', totalAmount: 1431.1, paidTotal: 0, remaining: 1431.1, status: 'PENDING' }],
        totalPending: 1431.1,
        message: '1 adet ödenmemiş masraf talebi var. Toplam: 1431.10 TL',
      });
      expect(await prisma.expenseRequest.findUniqueOrThrow({ where: { id: legacy.id }, select: { status: true, totalAmount: true } })).toMatchObject({
        status: 'PENDING',
      });
    });
  });

  it('karma dosya (USD dosya + TRY anapara kalemi): açılış masrafı belirlenmedi', async () => {
    const caseId = await openUsdCase('karma');
    const added = await post(`/cases/${caseId}/dues`, { ...principal(2_000), description: 'TRY anapara', currency: 'TRY' });
    expect(added.status).toBe(201);

    const gate = await gateStatus(caseId);
    expect(gate.openingExpense).toEqual(notDeterminedOf('USD', ['TRY', 'USD']));
    expect(gate.openingExpense.message).toContain('birden fazla para biriminde (TRY, USD)');
    expect((await prepare(caseId)).body).toMatchObject({ action: 'BLOCKED', openingExpense: { reasonCode: NOT_DETERMINED } });
  });

  describe('müvekkilsiz dosya', () => {
    it('masraf kapısı talep bazlıdır: müvekkilsiz dövizli dosya, müvekkilsiz TL dosyayla AYNI yanıtı verir', async () => {
      const usdCaseId = await openUsdCase('usd-muvekkilsiz', {});
      const tryCaseId = await openCase('try-muvekkilsiz', { currency: 'TRY', dues: [principal(10_000)] });

      for (const caseId of [usdCaseId, tryCaseId]) {
        expect(await gateStatus(caseId)).toEqual(GATE_READY);
        expect(await gateSummary(caseId)).toEqual(SUMMARY_READY);
      }
    });

    it('UYAP gönderim hazırlığı paket bazlıdır (müvekkilden bağımsız): müvekkilsiz dövizli dosyada da reddedilir; önce müvekkil atanması söylenir', async () => {
      const caseId = await openUsdCase('usd-muvekkilsiz-hazirlik', {});

      const prepared = await prepare(caseId);

      expect(prepared.body).toMatchObject({ action: 'BLOCKED', openingExpense: notDeterminedOf('USD', ['USD'], false) });
      expect(prepared.body.blockReason).toContain('Dosyaya müvekkil atanmamış; masraf talebi için önce müvekkil atanmalıdır.');
    });
  });

  it('BÜRO KAPSAMI: başka büronun kullanıcısı masraf kapısı durumunu okuyamaz (talep kimliği ve tutarı sızmaz)', async () => {
    const { caseId } = await openTryCaseWithOpeningRequest('buro');

    for (const path of [`/expense-requests/case/${caseId}/gate-status`, `/expense-requests/case/${caseId}/gate-summary`, `/expense-requests/case/${caseId}/can-perform/SUBMIT`]) {
      const res = await get(path, otherAdminId);
      expect({ path, status: res.status, body: res.body }).toEqual({
        path,
        status: 404,
        body: { message: 'Takip bulunamadı', error: 'Not Found', statusCode: 404 },
      });
    }
    // Kendi bürosu okumaya devam eder
    expect((await get(`/expense-requests/case/${caseId}/gate-status`)).status).toBe(200);
  });

  /**
   * UYAP gönderim hazırlığının MASRAF KOŞULU (StageTriggerService.handleUyapPrepare). Bu yol bugün politika motoru
   * tarafından her dosyada reddedildiği için koşula HTTP ile ulaşılamıyor; koşulun kendisini ölçmek üzere YALNIZ politika
   * motoru kararı "izin" olarak sabitlenir. Geri kalan her şey gerçektir (HTTP, servisler, veritabanı).
   */
  describe('politika motoru izin verdiğinde: hazırlığın masraf koşulu', () => {
    let policySpy: jest.SpyInstance;

    beforeAll(() => {
      policySpy = jest
        .spyOn(app.get(CasePolicyEngine, { strict: false }), 'canPerformAction')
        .mockResolvedValue({ allowed: true, code: 'OK', reason: 'OK' } as never);
    });

    afterAll(() => {
      policySpy.mockRestore();
    });

    const credit = async (caseId: string, amount: number) => {
      const res = await post(`/cases/${caseId}/balance/credit`, { amount, source: 'manual', description: 'masraf avansı' });
      expect(res.status).toBe(201);
    };

    it('TL dosya (kontrol): bakiye paket toplamını karşılamıyorsa masraf penceresi, karşılıyorsa hazır — mevcut davranış', async () => {
      const caseId = await openCase('izin-try', { currency: 'TRY', dues: [principal(10_000)] });

      expect((await prepare(caseId)).body).toEqual({
        action: 'OPEN_EXPENSE_MODAL',
        blockReason: 'Yetersiz bakiye. Gerekli: 957.9 TL, Mevcut: 0 TL',
        suggestion: { title: 'UYAP Öncesi / Takip Açılış Masrafları için masraf gerekiyor', description: 'Toplam: 957,9 TL', packageCode: 'UYAP_PRE' },
      });

      await credit(caseId, 957.9);

      expect((await prepare(caseId)).body).toEqual({
        action: 'READY',
        caseStatus: 'READY_FOR_UYAP',
        suggestion: { title: "UYAP'a gönderime hazır", description: 'Bakiyeniz yeterli (957.9 TL). Gönderim yapabilirsiniz.', packageCode: 'UYAP_PRE' },
      });
    });

    it('dövizli dosya, açılış masrafı belirlenmemiş: bakiye HAM sayıdan hesaplanan paket toplamını aşsa da HAZIR SAYILMAZ', async () => {
      const caseId = await openUsdCase('izin-usd');
      // 10.000 USD'nin sayısına TL oranı uygulanınca paket toplamı 957,90 TL çıkıyordu; bakiye bunun çok üstünde
      await credit(caseId, 5_000);

      const prepared = await prepare(caseId);

      expect(prepared.body).toEqual({
        action: 'BLOCKED',
        blockReason: expect.stringMatching(new RegExp(`^${PREPARE_REJECTED} ${CONSEQUENCE} `)),
        openingExpense: notDeterminedOf('USD', ['USD']),
        suggestion: { title: 'Açılış masrafı belirlenmedi', description: 'Gereken bilgi: Peşin harç tutarı (TL)' },
      });
      // Ret bakiyeye de dokunmaz: avans girişinin tek hareketi duruyor
      expect(await sideEffectsOf(caseId)).toMatchObject({ expenseRequests: 0, balanceLedgers: 1 });
    });

    it('dövizli dosya, peşin harç elle kayıtlı: talep karşılanmadan HAZIR SAYILMAZ; karşılanınca hazır', async () => {
      const caseId = await openUsdCase('izin-usd-elle');
      const requestId = await createManualRequest(caseId, withAdvanceFee);
      // Avans bakiyesi ham sayıdan hesaplanan paket toplamını (957,90 TL) aşıyor ama elle girilen talebi (2.888,50 TL) karşılamıyor
      await credit(caseId, 1_000);

      expect((await prepare(caseId)).body).toEqual({
        action: 'BLOCKED',
        blockReason: '1 adet ödenmemiş masraf talebi var. Toplam: 2888.50 TL',
        suggestion: { title: 'Masraf karşılanmadı', description: '1 adet ödenmemiş masraf talebi var. Toplam: 2888.50 TL' },
      });

      await receive(requestId, 2888.5);

      expect((await prepare(caseId)).body).toEqual({
        action: 'READY',
        caseStatus: 'READY_FOR_UYAP',
        suggestion: {
          title: "UYAP'a gönderime hazır",
          description: 'Kayıtlı açılış masrafı karşılandı. Gönderim yapabilirsiniz.',
          packageCode: 'UYAP_PRE',
        },
      });
    });
  });
});
