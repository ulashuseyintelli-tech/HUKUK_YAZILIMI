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
import { SchedulerRegistry } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import * as request from 'supertest';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { StorageModule } from '../../../common/storage/storage.module';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AutomationModule } from '../../automation/automation.module';
import { CaseModule } from '../../case/case.module';
import { ErrorLogModule } from '../../error-log/error-log.module';
import { MetricsRegistryModule } from '../../metrics-registry/metrics-registry.module';

/**
 * Aşama masraf seti — İSTEK ANAHTARI (idempotency). GERÇEK HTTP + disposable PostgreSQL.
 *
 * Ölçülen kusur (main ef16f07f): POST /expense-requests/case/:caseId/stage/:stageCode her çağrıda yeni talep + günlük kaydı
 * yazar; çift tıklama / yeniden deneme aynı tutarlı birden fazla talep üretir (3 istek → 3 × 4.750 TL).
 *
 * Owner kararı (2026-10-03, madde 4): aynı büro + anahtar + aynı içerik tek talep döndürür; farklı içerik 409; eşzamanlı
 * çağrılar ve süreç yeniden başladıktan sonraki tekrar bu testle doğrulanır; mevcut yetki kontrolleri ilk çağrıda VE tekrarda
 * korunur; geçmiş kayıtlar yeniden yazılmaz; meşru ikinci haciz / masraf yeni anahtarla yazılır; anahtarsız eski çağrılar
 * mükerrer korumasının DIŞINDADIR (aşağıda "bugünkü davranış" olarak sabitlenir — "risk kapandı" denmez).
 *
 * Eşzamanlılık notu: N eşzamanlı işlem Prisma havuzunu zorlar; yerelde yeşil, CI'da kırmızı olmasın diye en çok 3 eşzamanlı
 * istek ve süre sınırlı bekleme kullanılır.
 */
const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('STAGE-EXPENSE-IDEMPOTENCY DB gate blocked: CI requires an approved TEST_DATABASE_URL.');
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

describeWithDisposableDb('Aşama masraf seti istek anahtarı — tekrar, çakışma, eşzamanlılık, yeniden başlatma (HTTP + disposable PostgreSQL)', () => {
  jest.setTimeout(300_000);

  let prisma: PrismaClient;
  let app: INestApplication;
  const extraApps: INestApplication[] = [];
  let tenantId: string;
  let otherTenantId: string;
  let adminId: string;
  let viewerId: string;
  let otherAdminId: string;
  let clientId: string;
  let otherClientId: string;
  const suffix = randomUUID().slice(0, 8);

  const buildApp = async (): Promise<INestApplication> => {
    const identity = new DbUserIdentityGuard(() => prisma);
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        StorageModule,
        ErrorLogModule,
        MetricsRegistryModule,
        CaseModule,
        AutomationModule,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(identity)
      // Masraf talebi denetleyicisi passport korumasını doğrudan kullanır (AuthGuard('jwt') aynı sınıfı döndürür)
      .overrideGuard(AuthGuard('jwt'))
      .useValue(identity)
      .compile();
    const nest = moduleRef.createNestApplication();
    nest.useGlobalPipes(new ValidationPipe(PRODUCTION_VALIDATION_OPTIONS));
    await nest.init();
    // supertest dinlemeyen sunucuyu her istekte kendisi açar (listen(0)) ve O isteğin yanıtı gelince paylaşılan sunucuyu
    // kapatır (supertest 7.2.2 lib/test.js). Eşzamanlı isteklerde (Promise.all) bu, henüz kabul edilmemiş / boştaki
    // bağlantıları koparır: Linux'ta ECONNRESET (CI'da ölçüldü). Uygulama test boyunca kendi portunda dinler; supertest
    // sunucuyu sahiplenmez, kapatmaz. İstekler eşzamanlı kalır; kapanış afterAll ve yeniden başlatma testindeki app.close().
    await nest.listen(0, '127.0.0.1');
    // Bu testler zamanlayıcıya bağlı değildir: dönemsel taramalar ölçümü etkilemesin diye bu süreçte durdurulur.
    for (const job of nest.get(SchedulerRegistry, { strict: false }).getCronJobs().values()) job.stop();
    return nest;
  };

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await prisma.$connect();
    app = await buildApp();

    tenantId = `test-ci-seik-${suffix}`;
    otherTenantId = `test-ci-seik-b-${suffix}`;
    await prisma.tenant.create({ data: { id: tenantId, name: 'CI SEIK', slug: tenantId } });
    await prisma.tenant.create({ data: { id: otherTenantId, name: 'CI SEIK B', slug: otherTenantId } });
    adminId = (await prisma.user.create({ data: { tenantId, email: `admin-${suffix}@example.test`, name: 'admin', surname: 'SEIK', role: 'ADMIN' } })).id;
    viewerId = (await prisma.user.create({ data: { tenantId, email: `viewer-${suffix}@example.test`, name: 'viewer', surname: 'SEIK', role: 'VIEWER' } })).id;
    otherAdminId = (await prisma.user.create({ data: { tenantId: otherTenantId, email: `admin-b-${suffix}@example.test`, name: 'adminb', surname: 'SEIK', role: 'ADMIN' } })).id;
    clientId = (await prisma.client.create({ data: { tenantId, type: 'COMPANY', companyName: 'SEIK müvekkil', displayName: 'SEIK müvekkil' } })).id;
    otherClientId = (await prisma.client.create({ data: { tenantId: otherTenantId, type: 'COMPANY', companyName: 'SEIK B müvekkil', displayName: 'SEIK B müvekkil' } })).id;
  });

  afterAll(async () => {
    for (const extra of extraApps) await extra.close().catch(() => undefined);
    await app?.close();
    for (const id of [tenantId, otherTenantId]) {
      await prisma.auditLog.deleteMany({ where: { tenantId: id } }).catch(() => undefined);
      await prisma.tenant.deleteMany({ where: { id } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  const http = (target: INestApplication = app) => request(target.getHttpServer());
  const postAs = (userId: string, path: string, body: object | undefined, target: INestApplication = app) => {
    const req = http(target).post(path).set('x-test-user-id', userId);
    return body === undefined ? req : req.send(body);
  };
  const stage =(caseId: string, stageCode: string, body?: object, target?: INestApplication) =>
    postAs(adminId, `/expense-requests/case/${caseId}/stage/${stageCode}`, body, target);
  const brief = (res: request.Response) => ({ status: res.status, code: res.body?.code });

  const principal = (amount: number) => ({ type: 'PRINCIPAL', description: 'Asıl alacak', amount, dueDate: '2026-01-15' });

  const openCase = async (label: string, body: Record<string, unknown>, asUser = adminId, creditorClientId = clientId) => {
    const res = await postAs(asUser, '/cases', {
      fileNumber: `CI-SEIK-${label}-${suffix}`,
      type: 'GENERAL_EXECUTION',
      interestType: 'YASAL',
      startDate: '2026-02-01',
      creditors: [{ id: creditorClientId, type: 'COMPANY', name: 'SEIK müvekkil' }],
      ...body,
    });
    expect({ label, status: res.status }).toEqual({ label, status: 201 });
    return res.body.id as string;
  };

  /** Dosya açılışındaki arka plan açılış talebi bitene dek sınırlı bekleme (en çok ~8 sn): sonraki sayımlar karışmasın. */
  const waitForOpeningSettled = async (caseId: string) => {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const rows = await prisma.expenseRequest.count({ where: { caseId, stageCode: 'OPENING' } });
      const journals = await prisma.accountingJournalEntry.count({ where: { caseId, sourceType: 'EXPENSE_REQUEST' } });
      if (rows > 0 && journals >= rows) return;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  };

  /** Aşama talepleri (OPENING hariç) için yazma izi: talep + kalem + denetim kaydı + muhasebe günlüğü. */
  const stageFootprint = async (caseId: string) => {
    const requests = await prisma.expenseRequest.findMany({
      where: { caseId, stageCode: { not: 'OPENING' } },
      include: { requestItems: true, auditLogs: true },
      orderBy: { createdAt: 'asc' },
    });
    const ids = requests.map((row) => row.id);
    const journals = await prisma.accountingJournalEntry.count({
      where: { caseId, sourceType: 'EXPENSE_REQUEST', sourceId: { in: ids } },
    });
    return {
      requests,
      count: requests.length,
      itemCount: requests.reduce((sum, row) => sum + row.requestItems.length, 0),
      auditCount: requests.reduce((sum, row) => sum + row.auditLogs.length, 0),
      journals,
    };
  };

  const newKey = (label: string) => `seik-${label}-${randomUUID()}`;

  describe('TL dosya (1.000.000 anapara, müvekkilli)', () => {
    let caseId: string;
    let otherCaseId: string;

    beforeAll(async () => {
      caseId = await openCase('tl', { currency: 'TRY', dues: [principal(1_000_000)] });
      otherCaseId = await openCase('tl2', { currency: 'TRY', dues: [principal(1_000_000)] });
      await waitForOpeningSettled(caseId);
      await waitForOpeningSettled(otherCaseId);
    });

    it('POZİTİF KONTROL + ÇİFT TIKLAMA: aynı anahtar ve içerik iki kez → tek talep, tek kalem seti, tek denetim kaydı, tek günlük; ikinci yanıt aynı talebi tekrar olarak döndürür', async () => {
      const key = newKey('double');

      const first = await stage(caseId, 'SEIZURE', { idempotencyKey: key });
      const second = await stage(caseId, 'SEIZURE', { idempotencyKey: key });

      expect({ first: brief(first), second: brief(second) }).toEqual({ first: { status: 201, code: undefined }, second: { status: 201, code: undefined } });
      expect(first.body.idempotentReplay).toBe(false);
      expect(second.body.idempotentReplay).toBe(true);
      expect(second.body.id).toBe(first.body.id);
      expect(second.body.totalAmount).toBe('4750');
      expect(first.body.totalAmount).toBe('4750');

      const footprint = await stageFootprint(caseId);
      const mine = footprint.requests.filter((row) => row.idempotencyKey === key);
      expect(mine).toHaveLength(1);
      expect(mine[0]).toEqual(expect.objectContaining({ stageCode: 'SEIZURE', status: 'PENDING', gateType: 'BLOCKING', createdById: adminId, idempotencyKey: key }));
      expect(mine[0].requestItems.map((item) => item.itemCode).sort()).toEqual(['HACIZ_HARCI', 'HACIZ_YOLLUK']);
      expect(mine[0].auditLogs).toHaveLength(1);
      expect(await prisma.accountingJournalEntry.count({ where: { caseId, sourceType: 'EXPENSE_REQUEST', sourceId: mine[0].id } })).toBe(1);
    });

    it('MEŞRU İKİNCİ İŞLEM: yeni anahtar yeni talep yazar (genel "ikinci talep yasağı" yok); aynı anahtarla önceki talep etkilenmez', async () => {
      const keyA = newKey('legit-a');
      const keyB = newKey('legit-b');
      const before = await stageFootprint(caseId);

      const a = await stage(caseId, 'SEIZURE', { idempotencyKey: keyA });
      const b = await stage(caseId, 'SEIZURE', { idempotencyKey: keyB });

      expect({ a: a.status, b: b.status }).toEqual({ a: 201, b: 201 });
      expect(a.body.id).not.toBe(b.body.id);
      const after = await stageFootprint(caseId);
      expect(after.count).toBe(before.count + 2);
      expect(after.journals).toBe(before.journals + 2);
    });

    it('FARKLI İÇERİK: aynı anahtar başka aşama ya da başka dosya ile gelirse 409 IDEMPOTENCY_KEY_CONFLICT; hiçbir kayıt yazılmaz', async () => {
      const key = newKey('conflict');
      const first = await stage(caseId, 'SEIZURE', { idempotencyKey: key });
      expect(first.status).toBe(201);
      const before = { case: await stageFootprint(caseId), other: await stageFootprint(otherCaseId) };

      const otherStage = await stage(caseId, 'SALE', { idempotencyKey: key });
      const otherCase = await stage(otherCaseId, 'SEIZURE', { idempotencyKey: key });

      expect(brief(otherStage)).toEqual({ status: 409, code: 'IDEMPOTENCY_KEY_CONFLICT' });
      expect(brief(otherCase)).toEqual({ status: 409, code: 'IDEMPOTENCY_KEY_CONFLICT' });
      const after = { case: await stageFootprint(caseId), other: await stageFootprint(otherCaseId) };
      expect({ count: after.case.count, journals: after.case.journals }).toEqual({ count: before.case.count, journals: before.case.journals });
      expect({ count: after.other.count, journals: after.other.journals }).toEqual({ count: before.other.count, journals: before.other.journals });
    });

    it('EŞZAMANLI: aynı anahtarla 3 eşzamanlı istek (3 tur) → her turda tek talep; yanıtların hepsi aynı talebi döndürür, yalnız biri yeni yazımdır', async () => {
      for (let round = 0; round < 3; round += 1) {
        const key = newKey(`conc-${round}`);
        const before = await stageFootprint(caseId);

        const results = await Promise.all([0, 1, 2].map(() => stage(caseId, 'SALE', { idempotencyKey: key })));

        expect(results.map((res) => res.status)).toEqual([201, 201, 201]);
        expect(new Set(results.map((res) => res.body.id)).size).toBe(1);
        expect(results.filter((res) => res.body.idempotentReplay === false)).toHaveLength(1);
        expect(results.filter((res) => res.body.idempotentReplay === true)).toHaveLength(2);
        const after = await stageFootprint(caseId);
        expect({ count: after.count, items: after.itemCount, audit: after.auditCount, journals: after.journals }).toEqual({
          count: before.count + 1,
          items: before.itemCount + 2,
          audit: before.auditCount + 1,
          journals: before.journals + 1,
        });
      }
    });

    it('SÜREÇ YENİDEN BAŞLADIKTAN SONRA TEKRAR + BİRDEN FAZLA SÜREÇ: ayrı Nest örneği (ayrı veritabanı havuzu) aynı anahtarı tekrar olarak karşılar; iki süreçten eşzamanlı çağrı tek talep yazar', async () => {
      const key = newKey('restart');
      const first = await stage(caseId, 'SEIZURE', { idempotencyKey: key });
      expect(first.status).toBe(201);
      const before = await stageFootprint(caseId);

      // İlk uygulama örneği kapanır, yenisi açılır (süreç yeniden başlatma): yalnız veritabanındaki iz kalır.
      await app.close();
      app = await buildApp();
      const afterRestart = await stage(caseId, 'SEIZURE', { idempotencyKey: key });

      expect(afterRestart.status).toBe(201);
      expect(afterRestart.body).toEqual(expect.objectContaining({ id: first.body.id, idempotentReplay: true }));
      expect((await stageFootprint(caseId)).count).toBe(before.count);

      // İki AYRI uygulama örneği (ayrı havuz → ayrı PostgreSQL arka uçları) aynı yeni anahtarı aynı anda gönderir
      const secondApp = await buildApp();
      extraApps.push(secondApp);
      const raceKey = newKey('two-procs');
      const raceBefore = await stageFootprint(caseId);
      const race = await Promise.all([
        stage(caseId, 'SALE', { idempotencyKey: raceKey }, app),
        stage(caseId, 'SALE', { idempotencyKey: raceKey }, secondApp),
        stage(caseId, 'SALE', { idempotencyKey: raceKey }, secondApp),
      ]);
      expect(race.map((res) => res.status)).toEqual([201, 201, 201]);
      expect(new Set(race.map((res) => res.body.id)).size).toBe(1);
      const raceAfter = await stageFootprint(caseId);
      expect({ count: raceAfter.count, journals: raceAfter.journals }).toEqual({ count: raceBefore.count + 1, journals: raceBefore.journals + 1 });
    });

    it('İPTAL SONRASI: iptal edilen talebin anahtarı yeniden kullanılamaz (409 IDEMPOTENCY_KEY_CANCELLED); yeni anahtar yeni talep yazar', async () => {
      const key = newKey('cancelled');
      const first = await stage(caseId, 'SEIZURE', { idempotencyKey: key });
      expect(first.status).toBe(201);
      await prisma.expenseRequest.update({ where: { id: first.body.id }, data: { status: 'CANCELLED' } });
      const before = await stageFootprint(caseId);

      const again = await stage(caseId, 'SEIZURE', { idempotencyKey: key });

      expect(brief(again)).toEqual({ status: 409, code: 'IDEMPOTENCY_KEY_CANCELLED' });
      expect((await stageFootprint(caseId)).count).toBe(before.count);
      const fresh = await stage(caseId, 'SEIZURE', { idempotencyKey: newKey('after-cancel') });
      expect(fresh.status).toBe(201);
      expect((await stageFootprint(caseId)).count).toBe(before.count + 1);
    });

    it('ANAHTARSIZ ESKİ ÇAĞRI (bugünkü davranış, KORUMA DIŞI): anahtarsız ikinci istek yine talep yazar; anahtar / parmak izi boş kalır, eski satırlar yeniden yazılmaz', async () => {
      const before = await stageFootprint(caseId);

      const a = await stage(caseId, 'RE_NOTIFICATION');
      const b = await stage(caseId, 'RE_NOTIFICATION');

      expect({ a: a.status, b: b.status }).toEqual({ a: 201, b: 201 });
      expect(a.body.id).not.toBe(b.body.id);
      expect(a.body).not.toHaveProperty('idempotentReplay');
      const after = await stageFootprint(caseId);
      expect(after.count).toBe(before.count + 2);
      const keyless = after.requests.filter((row) => row.id === a.body.id || row.id === b.body.id);
      expect(keyless.map((row) => [row.idempotencyKey, row.requestFingerprint])).toEqual([[null, null], [null, null]]);
      // Önceki satırların hiçbiri değişmedi (geçmiş yeniden yazılmaz)
      for (const row of before.requests) {
        const same = after.requests.find((candidate) => candidate.id === row.id);
        expect(same?.updatedAt.toISOString()).toBe(row.updatedAt.toISOString());
        expect(same?.idempotencyKey).toBe(row.idempotencyKey);
        expect(Number(same?.totalAmount)).toBe(Number(row.totalAmount));
      }
    });

    it('GEÇERSİZ ANAHTAR: boş, çok uzun, izinsiz karakter ya da metin olmayan değer 400 IDEMPOTENCY_KEY_INVALID; sessizce anahtarsız sayılmaz, kayıt yazılmaz', async () => {
      const before = await stageFootprint(caseId);

      const invalid = await Promise.all(
        ['', '   ', 'x'.repeat(129), 'boşluklu anahtar', 'a/b', 12345 as unknown as string].map((value) => stage(caseId, 'SEIZURE', { idempotencyKey: value })),
      );

      expect(invalid.map(brief)).toEqual(Array.from({ length: 6 }, () => ({ status: 400, code: 'IDEMPOTENCY_KEY_INVALID' })));
      expect((await stageFootprint(caseId)).count).toBe(before.count);
    });

    it('/stage/OPENING + anahtar: açılış ucu anahtarı sessizce yok saymaz → 400 IDEMPOTENCY_KEY_UNSUPPORTED_FOR_OPENING; açılış kaydı değişmez', async () => {
      const openingBefore = await prisma.expenseRequest.findMany({ where: { caseId, stageCode: 'OPENING' }, select: { id: true, updatedAt: true } });

      const res = await stage(caseId, 'OPENING', { idempotencyKey: newKey('opening') });

      expect(brief(res)).toEqual({ status: 400, code: 'IDEMPOTENCY_KEY_UNSUPPORTED_FOR_OPENING' });
      expect(await prisma.expenseRequest.findMany({ where: { caseId, stageCode: 'OPENING' }, select: { id: true, updatedAt: true } })).toEqual(openingBefore);
    });
  });

  describe('Yetki ve büro sınırı: ilk çağrıda VE tekrarda korunur', () => {
    let caseId: string;
    let otherCaseId: string;
    let key: string;

    beforeAll(async () => {
      caseId = await openCase('auth', { currency: 'TRY', dues: [principal(500_000)] });
      await waitForOpeningSettled(caseId);
      otherCaseId = await openCase('auth-b', { currency: 'TRY', dues: [principal(500_000)] }, otherAdminId, otherClientId);
      await waitForOpeningSettled(otherCaseId);
      key = newKey('auth');
      const first = await stage(caseId, 'SEIZURE', { idempotencyKey: key });
      expect(first.status).toBe(201);
    });

    it('VIEWER: ilk çağrıda 403; mevcut anahtarla tekrarda da 403 (replay yetkiyi atlamaz); kayıt yazılmaz', async () => {
      const before = await stageFootprint(caseId);

      const firstTry = await postAs(viewerId, `/expense-requests/case/${caseId}/stage/SEIZURE`, { idempotencyKey: newKey('viewer') });
      const replayTry = await postAs(viewerId, `/expense-requests/case/${caseId}/stage/SEIZURE`, { idempotencyKey: key });

      expect({ firstTry: firstTry.status, replayTry: replayTry.status }).toEqual({ firstTry: 403, replayTry: 403 });
      expect((await stageFootprint(caseId)).count).toBe(before.count);
    });

    it('BAŞKA BÜRO: büronun anahtarını başka büro kullanamaz — kendi dosyasında aynı anahtar bağımsızdır; başkasının dosyasına 404 (anahtar sızmaz)', async () => {
      const before = await stageFootprint(caseId);

      const foreignCase = await postAs(otherAdminId, `/expense-requests/case/${caseId}/stage/SEIZURE`, { idempotencyKey: key });
      const ownCase = await postAs(otherAdminId, `/expense-requests/case/${otherCaseId}/stage/SEIZURE`, { idempotencyKey: key });
      const ownReplay = await postAs(otherAdminId, `/expense-requests/case/${otherCaseId}/stage/SEIZURE`, { idempotencyKey: key });

      expect(foreignCase.status).toBe(404);
      expect(foreignCase.body).not.toHaveProperty('idempotentReplay');
      expect({ ownCase: ownCase.status, replayed: ownCase.body.idempotentReplay, ownReplay: ownReplay.body.idempotentReplay }).toEqual({
        ownCase: 201,
        replayed: false,
        ownReplay: true,
      });
      expect(ownCase.body.id).not.toBe(undefined);
      expect(ownCase.body.tenantId).toBe(otherTenantId);
      // Birinci büronun kayıtları etkilenmedi
      expect((await stageFootprint(caseId)).count).toBe(before.count);
    });

    it('TEKRARDA DOSYA SİLİNMİŞ / BÜRO DIŞI: var olmayan dosya 404 (anahtar mevcut olsa da) ve kayıt yazılmaz', async () => {
      const res = await stage(`olmayan-${suffix}`, 'SEIZURE', { idempotencyKey: key });
      expect(res.status).toBe(404);
    });
  });

  describe('Dövizli dosya: mevcut 409 davranışı değişmez; anahtar kayıt bırakmaz', () => {
    let caseId: string;

    beforeAll(async () => {
      caseId = await openCase('usd', { currency: 'USD', subCategory: 'DOVIZ', dues: [principal(1_000_000)] });
    });

    it('USD + anahtar: 409 STAGE_EXPENSE_FX_BASIS_POLICY_MISSING; talep, kalem, denetim, günlük ve anahtar YAZILMAZ; tekrar aynı gerekçeyle reddedilir', async () => {
      const key = newKey('usd');

      const first = await stage(caseId, 'SEIZURE', { idempotencyKey: key });
      const again = await stage(caseId, 'SEIZURE', { idempotencyKey: key });

      expect({ first: brief(first), again: brief(again) }).toEqual({
        first: { status: 409, code: 'STAGE_EXPENSE_FX_BASIS_POLICY_MISSING' },
        again: { status: 409, code: 'STAGE_EXPENSE_FX_BASIS_POLICY_MISSING' },
      });
      expect(await prisma.expenseRequest.count({ where: { tenantId, idempotencyKey: key } })).toBe(0);
      const footprint = await stageFootprint(caseId);
      expect({ count: footprint.count, journals: footprint.journals }).toEqual({ count: 0, journals: 0 });
    });

    it('USD + anahtar: oranlı kalemi olmayan yeniden tebligat seti yazılır ve anahtarla tekrarlanır (davranış değişmez; tek talep)', async () => {
      const key = newKey('usd-renotif');

      const a = await stage(caseId, 'RE_NOTIFICATION', { idempotencyKey: key });
      const b = await stage(caseId, 'RE_NOTIFICATION', { idempotencyKey: key });

      expect({ a: a.status, b: b.status, replay: b.body.idempotentReplay, same: a.body.id === b.body.id }).toEqual({ a: 201, b: 201, replay: true, same: true });
      expect((await stageFootprint(caseId)).count).toBe(1);
    });
  });

  describe('Şema: benzersiz indeks son savunmadır; NULL anahtar çoğul olabilir', () => {
    it('aynı (büro, anahtar) ile ikinci satır doğrudan yazılırsa veritabanı reddeder (P2002); anahtarı NULL satırlar çoğul olabilir', async () => {
      const caseId = await openCase('schema', { currency: 'TRY', dues: [principal(1_000)] });
      await waitForOpeningSettled(caseId);
      const key = newKey('schema');
      const base = { tenantId, caseId, clientId, totalAmount: 1, createdById: adminId };

      await prisma.expenseRequest.create({ data: { ...base, idempotencyKey: key, requestFingerprint: 'x' } });
      await expect(prisma.expenseRequest.create({ data: { ...base, idempotencyKey: key, requestFingerprint: 'x' } })).rejects.toMatchObject({ code: 'P2002' });
      await prisma.expenseRequest.create({ data: base });
      await prisma.expenseRequest.create({ data: base });
      expect(await prisma.expenseRequest.count({ where: { tenantId, caseId, idempotencyKey: null, stageCode: null } })).toBe(2);
    });
  });
});
