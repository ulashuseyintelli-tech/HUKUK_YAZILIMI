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
import { UyapModule } from '../../uyap/uyap.module';
import { StageTriggerModule } from '../stage-trigger.module';

/**
 * UYAP gönderim hazırlığı — büro / kullanıcı bağlamı ve GERÇEK ret gerekçesi. GERÇEK HTTP + disposable PostgreSQL.
 *
 * Ölçülen kusur (main cafb9b16d): POST /cases/:id/uyap/prepare (ve /stage-trigger, /operations) politika motoruna yalnız
 * `{ userId, debtorId }` veriyordu; büro ve doğrulanmış kullanıcı bağlamı gitmediği için masraf blok olgusu ve vekalet olguları
 * fail-closed hesaplanıyor, hazırlık HER dosyada "Ödenmemiş masraf talebi var. UYAP işlemi yapılamaz." ile reddediliyordu —
 * ödenmiş, talepsiz ve NON_BLOCKING dosyada da; masraf kapısı durum ucu ise o dosyalar için "engel yok" diyordu.
 * Doğru bağlamlı gerçek uç (UyapService.sendPaymentOrder → UYAP_SEND) aynı ödenmiş dosyada izin veriyordu.
 *
 * Owner kararı 9 (2026-10-05): büro / kullanıcı bağlamı doğru taşınır, gerçek ret gerekçesi gösterilir; ödenmemiş talebin engel
 * olma davranışı DEĞİŞTİRİLMEZ (mevcut ratifiye kural: gate_type=BLOCKING talep karşılanmadıkça UYAP işlemi yapılamaz; NON_BLOCKING
 * engel olmaz — .kiro/specs/expense-request-system gereksinim 4 + ExpenseGateService durum uçları); gerçek UYAP gönderimi YOK
 * (taşıma yerel simülasyondur; bu test hiçbir gönderim yapmaz, ret ve hazır yolunda UYAP isteği kaydı yazılmadığı ölçülür).
 *
 * KAPSAM DIŞI (karar maddesi): "avans bakiyesi paket toplamını karşılıyorsa ödenmemiş açılış talebi hazırlığı engeller mi" —
 * bu test mevcut davranışı (engeller) sabitler; farklı seçim ürün kararıdır.
 */
const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('UYAP-PREPARE-CONTEXT DB gate blocked: CI requires an approved TEST_DATABASE_URL.');
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

const REASON = {
  unpaidTotal: '1 adet ödenmemiş masraf talebi var. Toplam: 1431.10 TL',
  engineExpense: 'Ödenmemiş masraf talebi var. UYAP işlemi yapılamaz.',
  poa: 'UYAP işlemi için vekaletname gerekli.',
  outage: 'UYAP sistemi geçici olarak devre dışı. Gönderim yapılamaz.',
  unproven: 'UYAP gönderim önkoşulları kanıtlanamadı. İşlem güvenli tarafta bloklandı.',
  disabled: 'Bu dosya için UYAP işlemleri devre dışı.',
  closed: 'Dosya kapalı. İşlem yapılamaz.',
  archived: 'Dosya arşivde. Önce arşivden çıkarın.',
} as const;

describeWithDisposableDb('UYAP hazırlığı — büro / kullanıcı bağlamı ve gerçek ret gerekçesi (HTTP + disposable PostgreSQL)', () => {
  jest.setTimeout(300_000);

  let prisma: PrismaClient;
  let app: INestApplication;
  let tenantId: string;
  let otherTenantId: string;
  let adminId: string;
  let otherAdminId: string;
  let lawyerUserId: string;
  let noPoaLawyerUserId: string;
  let clientId: string;
  let costPackageId: string;
  const suffix = randomUUID().slice(0, 8);
  const previousUyapAvailable = process.env.UYAP_AVAILABLE;

  beforeAll(async () => {
    process.env.UYAP_AVAILABLE = 'true';
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
      .overrideGuard(AuthGuard('jwt'))
      .useValue(identity)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe(PRODUCTION_VALIDATION_OPTIONS));
    await app.init();

    tenantId = `test-ci-upc-${suffix}`;
    otherTenantId = `test-ci-upc-b-${suffix}`;
    await prisma.tenant.create({ data: { id: tenantId, name: 'CI UPC', slug: tenantId } });
    await prisma.tenant.create({ data: { id: otherTenantId, name: 'CI UPC B', slug: otherTenantId } });
    adminId = (await prisma.user.create({ data: { tenantId, email: `admin-${suffix}@example.test`, name: 'admin', surname: 'UPC', role: 'ADMIN' } })).id;
    otherAdminId = (await prisma.user.create({ data: { tenantId: otherTenantId, email: `b-${suffix}@example.test`, name: 'b', surname: 'UPC', role: 'ADMIN' } })).id;
    const office = await prisma.office.create({ data: { tenantId, name: 'UPC Bürosu' } });
    lawyerUserId = (await prisma.user.create({ data: { tenantId, email: `av-${suffix}@example.test`, name: 'av', surname: 'UPC', role: 'USER' } })).id;
    const lawyerId = (await prisma.lawyer.create({ data: { tenantId, officeId: office.id, userId: lawyerUserId, name: 'av', surname: 'UPC', lawyerRank: 'LAWYER' } })).id;
    noPoaLawyerUserId = (await prisma.user.create({ data: { tenantId, email: `av2-${suffix}@example.test`, name: 'av2', surname: 'UPC', role: 'USER' } })).id;
    await prisma.lawyer.create({ data: { tenantId, officeId: office.id, userId: noPoaLawyerUserId, name: 'av2', surname: 'UPC', lawyerRank: 'LAWYER' } });
    clientId = (await prisma.client.create({ data: { tenantId, type: 'COMPANY', companyName: 'UPC müvekkil', displayName: 'UPC müvekkil' } })).id;
    // Yalnız avukat 1'in yürürlükte, GENEL kapsamlı vekaleti var
    const poa = await prisma.clientPowerOfAttorney.create({ data: { tenantId, clientId, dateIssued: new Date('2026-01-10'), status: 'ACTIVE', isActive: true, isLimited: false, scopeType: 'GENEL' } });
    await prisma.poaLawyer.create({ data: { tenantId, poaId: poa.id, lawyerId, isPrimary: true } });

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
              { itemCode: 'PESIN_HARC', label: 'Peşin Harç', defaultAmount: 5722.19, sortOrder: 3, calcRule: { type: 'percentage', rate: 0.005, base: 'principalAmount', min: 100 } },
              { itemCode: 'DOSYA_GIDERI', label: 'Dosya Gideri', defaultAmount: 2, sortOrder: 4, isEditable: false },
              { itemCode: 'TEBLIGAT_GIDERI', label: 'Tebligat Gideri', defaultAmount: 15, sortOrder: 5, calcRule: { type: 'per_unit', unitAmount: 15, multiplier: 'debtorCount' } },
              { itemCode: 'VEKALET_PULU', label: 'Vekalet Pulu', defaultAmount: 138, sortOrder: 6, isEditable: false },
            ],
          },
        },
      })
    ).id;
  });

  afterAll(async () => {
    if (previousUyapAvailable === undefined) delete process.env.UYAP_AVAILABLE;
    else process.env.UYAP_AVAILABLE = previousUyapAvailable;
    await app?.close();
    await prisma.costPackage.deleteMany({ where: { id: costPackageId } });
    for (const id of [tenantId, otherTenantId]) {
      await prisma.expenseBlockReason.deleteMany({ where: { tenantId: id } });
      await prisma.uyapRequestLog.deleteMany({ where: { tenantId: id } });
      await prisma.auditLog.deleteMany({ where: { tenantId: id } });
      await prisma.tenant.delete({ where: { id } }); // hata YUTULMAZ: temizlik gerçekten silmiyorsa test kırılır
    }
    expect(await prisma.tenant.count({ where: { id: { in: [tenantId, otherTenantId] } } })).toBe(0); // temizlik kanıtı
    await prisma.$disconnect();
  });

  const as = (userId: string) => ({
    post: (path: string, body: object = {}) => request(app.getHttpServer()).post(path).set('x-test-user-id', userId).send(body),
    get: (path: string) => request(app.getHttpServer()).get(path).set('x-test-user-id', userId),
  });

  const openCase = async (label: string) => {
    const res = await as(adminId).post('/cases', {
      fileNumber: `CI-UPC-${label}-${suffix}`,
      type: 'GENERAL_EXECUTION',
      interestType: 'YASAL',
      startDate: '2026-02-01',
      currency: 'TRY',
      creditors: [{ id: clientId, type: 'COMPANY', name: 'UPC müvekkil' }],
      dues: [{ type: 'PRINCIPAL', description: 'Asıl alacak', amount: 10_000, dueDate: '2026-01-15' }],
    });
    expect(res.status).toBe(201);
    const caseId = res.body.id as string;
    // Arka plandaki açılış masraf talebi görünene dek sınırlı bekleme (en çok ~8 sn)
    for (let attempt = 0; attempt < 40; attempt += 1) {
      if ((await prisma.expenseRequest.count({ where: { tenantId, caseId } })) > 0) return caseId;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error('açılış masraf talebi oluşmadı');
  };

  const settleOpening = (caseId: string, data: Record<string, unknown>) => prisma.expenseRequest.updateMany({ where: { tenantId, caseId }, data: data as never });
  const openPaidCase = async (label: string) => {
    const caseId = await openCase(label);
    await settleOpening(caseId, { status: 'PAID', paidTotal: 1431.1 });
    return caseId;
  };

  const prepare = async (caseId: string, userId = lawyerUserId) => {
    const res = await as(userId).post(`/cases/${caseId}/uyap/prepare`);
    const { cpeTraceId: _cpeTraceId, ...body } = res.body as Record<string, any>;
    return { status: res.status, body };
  };
  const gateStatus = async (caseId: string) => (await as(adminId).get(`/expense-requests/case/${caseId}/gate-status`)).body as Record<string, any>;
  const lastEngineDecision = async (caseId: string) => {
    const row = await prisma.cpeDecisionLog.findFirst({ where: { caseId, actionCode: 'UYAP_SEND' }, orderBy: { createdAt: 'desc' } });
    return row ? { allowed: row.allowed, gate: row.gateCode, reason: row.reason } : null;
  };

  const sideEffectsOf = async (caseId: string) => ({
    expenseRequests: await prisma.expenseRequest.count({ where: { tenantId, caseId } }),
    expensePayments: await prisma.expensePayment.count({ where: { expenseRequest: { tenantId, caseId } } }),
    journalEntries: await prisma.accountingJournalEntry.count({ where: { tenantId, caseId } }),
    caseBalances: await prisma.caseBalance.count({ where: { caseId } }),
    balanceLedgers: await prisma.balanceLedger.count({ where: { tenantId, caseBalance: { caseId } } }),
    uyapRequestLogs: await prisma.uyapRequestLog.count({ where: { caseId } }),
    clientNotifications: await prisma.clientNotification.count({ where: { tenantId, caseId } }),
  });

  describe('masraf kapısı: ödenmemiş talebin engel olma davranışı DEĞİŞMEDİ; gerekçe durum ucuyla aynı', () => {
    it('ödenmemiş BLOCKING açılış talebi: hazırlık reddeder; gerekçe masraf kapısı durum ucunun gerekçesidir (tutar dahil) — "ayrışma" yok', async () => {
      const caseId = await openCase('odenmemis');

      const status = await gateStatus(caseId);
      const prepared = await prepare(caseId);

      expect(status).toMatchObject({ isBlocked: true, message: REASON.unpaidTotal });
      expect(prepared.status).toBe(201);
      expect(prepared.body).toEqual({
        action: 'BLOCKED',
        blockReason: REASON.unpaidTotal,
        suggestion: { title: 'Masraf karşılanmadı', description: REASON.unpaidTotal },
      });
      // Politika motoru bu dosya için DOĞRU bağlamla değerlendirdi ve izin verdi (ret masraf kapısından geldi)
      expect(await lastEngineDecision(caseId)).toEqual({ allowed: true, gate: null, reason: 'OK' });
    });

    it('ödenmiş talep: hazırlık "ödenmemiş talep var" DEMEZ (durum ucu "engel yok" derken eskiden diyordu)', async () => {
      const caseId = await openPaidCase('odenmis');

      expect(await gateStatus(caseId)).toMatchObject({ isBlocked: false });
      const prepared = await prepare(caseId);

      expect(prepared.status).toBe(201);
      expect(JSON.stringify(prepared.body)).not.toContain('Ödenmemiş masraf talebi var');
      expect(JSON.stringify(prepared.body)).not.toContain('ödenmemiş masraf talebi var');
      expect(prepared.body.action).toBe('OPEN_EXPENSE_MODAL'); // avans yok: bakiye karşılaştırması (aşağıdaki testler)
    });

    it('talepsiz dosya: "ödenmemiş talep var" DEMEZ', async () => {
      const caseId = await openCase('talepsiz');
      await prisma.expenseRequest.deleteMany({ where: { tenantId, caseId } });

      expect(await gateStatus(caseId)).toMatchObject({ isBlocked: false });
      const prepared = await prepare(caseId);

      expect(JSON.stringify(prepared.body)).not.toContain('denmemiş masraf talebi var');
      expect(prepared.body.action).toBe('OPEN_EXPENSE_MODAL');
    });

    it('NON_BLOCKING ödenmemiş talep: engel olmaz (mevcut kural) — hazırlık reddetmez', async () => {
      const caseId = await openCase('nonblocking');
      await settleOpening(caseId, { gateType: 'NON_BLOCKING' });

      expect(await gateStatus(caseId)).toMatchObject({ isBlocked: false });
      const prepared = await prepare(caseId);

      expect(JSON.stringify(prepared.body)).not.toContain('denmemiş masraf talebi var');
      expect(prepared.body.action).toBe('OPEN_EXPENSE_MODAL');
    });

    it('açık masraf blok kaydı (ExpenseBlockReason, UYAP_SEND) olan dosya: politika motorunun masraf kapısı GERÇEK nedenle reddeder', async () => {
      const caseId = await openPaidCase('blokkaydi');
      await prisma.expenseBlockReason.create({ data: { tenantId, caseId, blockedActionCode: 'UYAP_SEND', reasonCode: 'PAYMENT_NOT_RECEIVED', createdById: adminId } });

      const prepared = await prepare(caseId);

      expect(prepared.body).toMatchObject({ action: 'BLOCKED', blockReason: REASON.engineExpense });
      expect(await lastEngineDecision(caseId)).toEqual({ allowed: false, gate: 'EXPENSE_BLOCKING', reason: REASON.engineExpense });
    });
  });

  describe('avans bakiyesi (masraf kapısı geçildikten sonra): yokluk "0 TL" gibi yazılmaz', () => {
    it('avans kaydı YOK: karşılaştırma yetersiz sayar, mesaj "avans kaydı yok" der; kayıt oluşturulmaz', async () => {
      const caseId = await openPaidCase('avanssiz');
      const before = await sideEffectsOf(caseId);

      const prepared = await prepare(caseId);

      expect(prepared.body).toEqual({
        action: 'OPEN_EXPENSE_MODAL',
        blockReason: 'Yetersiz bakiye. Gerekli: 957.9 TL, Mevcut: avans kaydı yok',
        suggestion: { title: 'UYAP Öncesi / Takip Açılış Masrafları için masraf gerekiyor', description: 'Toplam: 957,9 TL', packageCode: 'UYAP_PRE' },
      });
      expect(prepared.body.blockReason).not.toContain('Mevcut: 0');
      expect(await sideEffectsOf(caseId)).toEqual(before); // okuma satır oluşturmaz
      expect(before.caseBalances).toBe(0);
    });

    it('avans satırı VAR ve yetersiz → gerçek tutar yazılır; yeterli → hazır', async () => {
      const caseId = await openPaidCase('avansli');
      const credit = (amount: number) => as(adminId).post(`/cases/${caseId}/balance/credit`, { amount, source: 'manual', description: 'masraf avansı' });

      expect((await credit(100)).status).toBe(201);
      expect((await prepare(caseId)).body).toMatchObject({ action: 'OPEN_EXPENSE_MODAL', blockReason: 'Yetersiz bakiye. Gerekli: 957.9 TL, Mevcut: 100 TL' });

      expect((await credit(900)).status).toBe(201);
      expect((await prepare(caseId)).body).toEqual({
        action: 'READY',
        caseStatus: 'READY_FOR_UYAP',
        suggestion: { title: "UYAP'a gönderime hazır", description: 'Bakiyeniz yeterli (1000 TL). Gönderim yapabilirsiniz.', packageCode: 'UYAP_PRE' },
      });
    });
  });

  describe('politika motorunun GERÇEK ret gerekçeleri (büro / kullanıcı bağlamıyla)', () => {
    it('vekaletsiz aktör: yönetici (avukat profili yok) ve vekaleti olmayan avukat → "vekaletname gerekli"; vekaletli avukat geçer', async () => {
      const caseId = await openPaidCase('vekalet');

      for (const userId of [adminId, noPoaLawyerUserId]) {
        const prepared = await prepare(caseId, userId);
        expect(prepared.body).toMatchObject({ action: 'BLOCKED', blockReason: REASON.poa });
      }
      expect(await lastEngineDecision(caseId)).toMatchObject({ allowed: false, gate: 'POWER_OF_ATTORNEY_MISSING' });

      const allowed = await prepare(caseId, lawyerUserId);
      expect(allowed.body.action).not.toBe('BLOCKED');
      expect(await lastEngineDecision(caseId)).toEqual({ allowed: true, gate: null, reason: 'OK' });
    });

    it('UYAP geçici arıza (UYAP_AVAILABLE=false) ve yapılandırılmamış sinyal → gerçek neden; ayar geri alınınca hazırlık sürer', async () => {
      const caseId = await openPaidCase('uyap-sinyal');
      try {
        process.env.UYAP_AVAILABLE = 'false';
        expect((await prepare(caseId)).body).toMatchObject({ action: 'BLOCKED', blockReason: REASON.outage });
        delete process.env.UYAP_AVAILABLE;
        expect((await prepare(caseId)).body).toMatchObject({ action: 'BLOCKED', blockReason: REASON.unproven });
      } finally {
        process.env.UYAP_AVAILABLE = 'true';
      }
      expect((await prepare(caseId)).body.action).not.toBe('BLOCKED');
    });

    it('dosyada UYAP işlemleri kapalı (allowUyapActions=false) → "UYAP işlemleri devre dışı"', async () => {
      const caseId = await openPaidCase('uyap-kapali');
      await prisma.case.update({ where: { id: caseId }, data: { allowUyapActions: false } });

      expect((await prepare(caseId)).body).toMatchObject({ action: 'BLOCKED', blockReason: REASON.disabled });
    });

    it('kapalı ve arşivdeki dosya: gerekçe aynen korunur', async () => {
      const closedId = await openPaidCase('kapali');
      const archivedId = await openPaidCase('arsiv');
      await prisma.case.update({ where: { id: closedId }, data: { caseStatus: 'HITAM' } });
      await prisma.case.update({ where: { id: archivedId }, data: { isArchived: true } });

      expect((await prepare(closedId)).body).toMatchObject({ action: 'BLOCKED', blockReason: REASON.closed });
      expect((await prepare(archivedId)).body).toMatchObject({ action: 'BLOCKED', blockReason: REASON.archived });
    });

    it('aynı bağlam diğer aşama olaylarında da taşınır: tebligat olayı artık "ödenmemiş masraf" ile reddedilmez, kendi gerçek nedeniyle reddedilir', async () => {
      const caseId = await openPaidCase('tebligat');

      const res = await as(lawyerUserId).post(`/cases/${caseId}/stage-trigger`, { eventCode: 'EVT_TEBLIGAT_SEND' });

      expect(res.status).toBe(201);
      expect(res.body.action).toBe('BLOCKED');
      expect(String(res.body.blockReason)).not.toContain('Ödenmemiş masraf talebi');
    });
  });

  describe('KARAR MADDESİ senaryosu ve BİLİNEN AÇIKLAR (mevcut davranış sabitlenir; ürün kararı gelince ilgili test bilinçle güncellenir)', () => {
    const credit = async (caseId: string, amount: number) => {
      const res = await as(adminId).post(`/cases/${caseId}/balance/credit`, { amount, source: 'manual', description: 'masraf avansı' });
      expect(res.status).toBe(201);
    };

    it('ödenmemiş engelleyici talep + avans paket toplamından FAZLA: hazırlık yine BLOCKED (kuralın özü: avans, ödenmemiş talebi aşmaz)', async () => {
      const caseId = await openCase('odenmemis-avansli');
      await credit(caseId, 5_000);

      const prepared = await prepare(caseId);

      expect(prepared.body).toEqual({
        action: 'BLOCKED',
        blockReason: REASON.unpaidTotal,
        suggestion: { title: 'Masraf karşılanmadı', description: REASON.unpaidTotal },
      });
      // Politika motoru bu dosyada izin veriyor (karar günlüğünde "izinli" satırı); ret masraf kapısındandır
      expect(await lastEngineDecision(caseId)).toEqual({ allowed: true, gate: null, reason: 'OK' });
    });

    it('BİLİNEN AÇIK: OVERDUE (vadesi geçmiş) ödenmemiş engelleyici talep masraf kapısınca SAYILMAZ — taban da durum uçları da aynı; hazırlık engellemez', async () => {
      const caseId = await openCase('overdue');
      await settleOpening(caseId, { status: 'OVERDUE' }); // yalnız create-overdue-task ucu yazar (web'de çağıranı yok)
      await credit(caseId, 1_000);

      // Kapı servisi (üç durum ucunun ortak kaynağı) yalnız PENDING / SENT / REMINDED / PARTIAL sayar: OVERDUE "engel yok"
      expect(await gateStatus(caseId)).toMatchObject({ isBlocked: false });
      const prepared = await prepare(caseId);
      expect(prepared.body.action).toBe('READY'); // avans ≥ paket toplamı
      expect(JSON.stringify(prepared.body)).not.toContain('Masraf karşılanmadı');
    });

    it('BİLİNEN AÇIK: eksik tutarla "ödeme alındı" (RECEIVED) engel kaldırır; ödenen tutar avansa yazıldığı için hazırlık HAZIR döner (#2890 kabul edilmiş kural; eksik tutar doğrulaması markAsReceived açığıdır)', async () => {
      const caseId = await openCase('received-eksik');
      const opening = await prisma.expenseRequest.findFirstOrThrow({ where: { tenantId, caseId } });
      const received = await as(adminId).post(`/expense-requests/${opening.id}/receive`, { paidAmount: 1_000 });
      expect(received.status).toBe(201);
      const row = await prisma.expenseRequest.findUniqueOrThrow({ where: { id: opening.id } });
      expect(row.status).toBe('RECEIVED');
      expect(Number(row.totalAmount)).toBeGreaterThan(1_000); // talebin 431,10 TL'si açık

      expect(await gateStatus(caseId)).toMatchObject({ isBlocked: false });
      expect((await prepare(caseId)).body.action).toBe('READY'); // 1000 ≥ 957,90
    });

    it('BİLİNEN AÇIK: ilk aşama dışındaki dosyada motor UYAP gönderim eylemini aşama sözlüğünden reddeder; hazırlık ham "Geçersiz aşama: <kod>" gösterir (satır 1 sözlük kusurunun bu eyleme yansıması; sözlük bu PR dışında)', async () => {
      const caseId = await openPaidCase('asama');
      await credit(caseId, 1_000);
      await prisma.case.update({ where: { id: caseId }, data: { workflowStage: 'SEIZURE' } });

      const prepared = await prepare(caseId);

      expect(prepared.body).toMatchObject({ action: 'BLOCKED', blockReason: 'Geçersiz aşama: SEIZURE' });
      expect(await lastEngineDecision(caseId)).toMatchObject({ allowed: false, reason: 'Geçersiz aşama: SEIZURE' });
    });
  });

  describe('büro sınırı ve yan etki', () => {
    it('başka büronun kullanıcısı bu dosyayı hazırlayamaz: var olmayan dosyayla aynı 404', async () => {
      const caseId = await openPaidCase('buro');
      const foreign = await as(otherAdminId).post(`/cases/${caseId}/uyap/prepare`);
      const missing = await as(otherAdminId).post(`/cases/00000000-0000-0000-0000-000000000000/uyap/prepare`);

      expect({ status: foreign.status, message: foreign.body?.message }).toEqual({ status: 404, message: 'Takip bulunamadı' });
      expect({ status: missing.status, message: missing.body?.message }).toEqual({ status: 404, message: 'Takip bulunamadı' });
    });

    it('ret ve hazır yollarında UYAP isteği, muhasebe, bakiye, bildirim ya da yeni masraf kaydı YAZILMAZ (karar günlüğü hariç)', async () => {
      const unpaidId = await openCase('yan-etki-ret');
      const readyId = await openPaidCase('yan-etki-hazir');
      await as(adminId).post(`/cases/${readyId}/balance/credit`, { amount: 1000, source: 'manual', description: 'masraf avansı' });
      const beforeUnpaid = await sideEffectsOf(unpaidId);
      const beforeReady = await sideEffectsOf(readyId);

      expect((await prepare(unpaidId)).body.action).toBe('BLOCKED');
      expect((await prepare(readyId)).body.action).toBe('READY');

      expect(await sideEffectsOf(unpaidId)).toEqual(beforeUnpaid);
      expect(await sideEffectsOf(readyId)).toEqual(beforeReady);
      expect(beforeUnpaid.uyapRequestLogs).toBe(0);
    });
  });
});
