// CaseModule / CaseBalanceModule grafiği `pdf-poppler`'ı yükleyebilir; paket Linux'ta yükleme anında process.exit(1) verir
// (CI emsali: opening-expense-fx-basis.http.db-gated.integration.spec.ts).
jest.mock('pdf-poppler', () => ({
  convert: async () => {
    throw new Error('pdf-poppler is stubbed in unit tests');
  },
}));

import { CanActivate, ExecutionContext, INestApplication, RequestMethod, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { ConfigModule } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import * as request from 'supertest';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { StorageModule } from '../../../common/storage/storage.module';
import { ErrorLogModule } from '../../error-log/error-log.module';
import { MetricsRegistryModule } from '../../metrics-registry/metrics-registry.module';
import { CaseBalanceController } from '../case-balance.controller';
import { CaseBalanceService } from '../case-balance.service';
import { CaseBalanceModule } from '../case-balance.module';
import { DispositionPostingService } from '../../client-settlement/disposition-posting.service';
import { createClient, linkClient, addPostedPayable } from '../../../../test/client-currency-fixture';

/**
 * Masraf/avans bakiyesi (`cases/:caseId/balance`) — owner kararı 2026-10-05 (karar 5), DAR kapsam. GERÇEK HTTP + disposable PostgreSQL.
 *
 *   (1) VIEWER avans yazamaz (kredi / düşüm / gerçekleşen masraf): 403 VIEWER_WRITE_DENIED, satır yazılmaz.
 *   (2) Okuma isteği bakiye satırı oluşturmaz (`GET /balance`, `GET /balance/ledger`). Satır yokluğu AÇIKÇA ifade edilir
 *       (`exists:false`, değer alanları null); sahte sıfır bakiye ve varsayılan / dosya para birimi ÜRETİLMEZ.
 *
 * DEĞİŞMEYENLER (owner): kayıtlı bakiye ↔ defter mutabakatı, mahsubun harcanabilir avansa etkisi, dosya üyesi OLMAYAN personelin
 * yazma yetkisi. Bu dosya o davranışlara iddia KOYMAZ.
 */
const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('CASE-BALANCE-WRITE-SAFETY DB gate blocked: CI requires an approved TEST_DATABASE_URL.');
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

describeWithDisposableDb('Masraf/avans bakiyesi — VIEWER yazma sınırı ve okurken yazmama (HTTP + disposable PostgreSQL)', () => {
  jest.setTimeout(120_000);

  let prisma: PrismaClient;
  let app: INestApplication;
  const suffix = randomUUID().slice(0, 8);
  const tenantId = `test-ci-cbws-${suffix}`;
  const otherTenantId = `test-ci-cbws2-${suffix}`;
  let adminId: string;
  let memberId: string;
  let viewerId: string;
  let otherAdminId: string;

  const newCase = async (label: string, tenant = tenantId, currency: 'TRY' | 'USD' = 'TRY') =>
    (
      await prisma.case.create({
        data: {
          tenantId: tenant,
          fileNumber: `CBWS-${suffix}-${label}`,
          type: 'GENERAL_EXECUTION',
          caseStatus: 'DERDEST',
          status: 'ACTIVE',
          currency,
          interestType: 'YASAL',
        },
      })
    ).id;

  const rows = async (caseId: string) => ({
    balances: await prisma.caseBalance.count({ where: { caseId } }),
    ledger: await prisma.balanceLedger.count({ where: { caseBalance: { caseId } } }),
  });

  const as = (userId: string) => ({ 'x-test-user-id': userId, 'Idempotency-Key': randomUUID() });

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
        CaseBalanceModule,
      ],
    })
      // Bakiye denetleyicisi passport korumasını doğrudan kullanır (AuthGuard('jwt') aynı sınıfı döndürür)
      .overrideGuard(AuthGuard('jwt'))
      .useValue(identity)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe(PRODUCTION_VALIDATION_OPTIONS));
    await app.init();
    // supertest dinlemeyen sunucuyu ilk istekte kendisi açar (listen(0)) ve O isteğin yanıtı gelince paylaşılan sunucuyu kapatır
    // (supertest 7.2.2 lib/test.js). Eşzamanlı isteklerde (Promise.all) bu, henüz işlenmemiş bağlantıları koparır: Linux'ta
    // yanıtsız `read ECONNRESET`, Windows'ta görünmez (CI'da ölçüldü; emsal #2915). Uygulama test boyunca kendi portunda dinler;
    // supertest sunucuyu sahiplenmez ve kapatmaz. İstekler eşzamanlı kalır; kapanış afterAll'daki app.close() ile olur.
    await app.listen(0, '127.0.0.1');

    for (const t of [tenantId, otherTenantId]) await prisma.tenant.create({ data: { id: t, name: `CI CBWS ${t}`, slug: t } });
    const mk = async (tenant: string, role: 'ADMIN' | 'USER' | 'VIEWER', tag: string) =>
      (await prisma.user.create({ data: { tenantId: tenant, email: `${tag}-${suffix}@example.test`, name: tag, surname: 'CBWS', role } })).id;
    adminId = await mk(tenantId, 'ADMIN', 'admin');
    memberId = await mk(tenantId, 'USER', 'member');
    viewerId = await mk(tenantId, 'VIEWER', 'viewer');
    otherAdminId = await mk(otherTenantId, 'ADMIN', 'otheradmin');
    // CL-R13: positive currency/read fixtures now carry the ratified capacity; ADMIN alone is not authority.
    for(const [userId,tenant,lawyerRank] of [[adminId,tenantId,'PARTNER'],[memberId,tenantId,'MANAGER'],[otherAdminId,otherTenantId,'PARTNER']] as const) await prisma.lawyer.create({data:{tenantId:tenant,userId,name:'Synthetic',surname:'Capacity',lawyerRank}});
  });

  afterAll(async () => {
    for (const t of [tenantId, otherTenantId]) {
      await prisma.accountingJournalLine.deleteMany({ where: { tenantId: t } }).catch(() => undefined);
      await prisma.accountingJournalEntry.deleteMany({ where: { tenantId: t } }).catch(() => undefined);
      await prisma.balanceLedger.deleteMany({ where: { tenantId: t } }).catch(() => undefined);
      await prisma.caseBalance.deleteMany({ where: { tenantId: t } }).catch(() => undefined);
      await prisma.case.deleteMany({ where: { tenantId: t } }).catch(() => undefined);
      await prisma.lawyer.deleteMany({where:{tenantId:t}});
      await prisma.staffMember.deleteMany({where:{tenantId:t}});
      await prisma.user.deleteMany({ where: { tenantId: t } }).catch(() => undefined);
      await prisma.tenant.delete({ where: { id: t } }).catch(() => undefined);
    }
    await app?.close();
    await prisma?.$disconnect();
  });

  describe('(1) VIEWER avans yazamaz', () => {
    it('H07: direct disposition writer reaches the real transaction/account guard and rejects USD into TRY without financial mutation', async () => {
      const caseId = await newCase('h07-disposition');
      await request(app.getHttpServer()).post(`/cases/${caseId}/balance/credit`).set(as(adminId)).send({ amount: 5000, currency: 'TRY', source: 'manual' }).expect(201);
      const clientId = await createClient(prisma, tenantId, `h07-disp-${suffix}`);
      const caseClientId = await linkClient(prisma, caseId, clientId, adminId);
      const key = `h07-disp-${suffix}`;
      await addPostedPayable(prisma, { tenantId, caseId, caseClientId, userId: adminId, amount: 100, currency: 'USD', postedAt: new Date(), key });
      const collection = await prisma.collection.findFirstOrThrow({ where: { tenantId, idempotencyKey: `test:ccy:${key}` } });
      const disp = await prisma.collectionDisposition.update({ where: { collectionId: collection.id }, data: { status: 'DISTRIBUTION_APPROVED', approvalRequestId: 'h07-synthetic-approved', postedAt: null, postedById: null } });
      await prisma.collectionDispositionLine.updateMany({ where: { dispositionId: disp.id }, data: { type: 'OFFSET_CLIENT_ADVANCE' } });
      // Actor/P4 and absence of an allocation hold are explicit harness preconditions;
      // posting, authoritative Collection lock, account reads and transaction are real PostgreSQL.
      const approval = { isApproverEligible: jest.fn().mockResolvedValue(true), assertApproverExecutionAuthorityInTx: jest.fn().mockResolvedValue(undefined), markExecutionSucceeded: jest.fn() };
      const db = new Proxy(prisma, { get(target, key) {
        if (key === 'officeApprovalRequest') return { findFirst: async () => ({ status: 'APPROVED' }) };
        if (key === 'collectionAllocationHold') return { findFirst: async () => null };
        const value = (target as any)[key]; return typeof value === 'function' ? value.bind(target) : value;
      } });
      const posting = new DispositionPostingService(db as any, approval as any, {} as any);
      const snapshot = async () => ({
        disposition: await prisma.collectionDisposition.findUniqueOrThrow({ where: { id: disp.id } }),
        balance: await prisma.caseBalance.findUniqueOrThrow({ where: { caseId } }),
        ledger: await prisma.balanceLedger.findMany({ where: { caseBalance: { caseId } }, orderBy: { id: 'asc' } }),
        journals: await prisma.accountingJournalEntry.findMany({ where: { tenantId }, include: { lines: { orderBy: { lineNo: 'asc' } } }, orderBy: { id: 'asc' } }),
      });
      try {
        const before = await snapshot();
        await expect(posting.post(tenantId, disp.id, { userId: adminId })).rejects.toMatchObject({ status: 409, response: { code: 'ADVANCE_CURRENCY_MISMATCH' } });
        expect(approval.assertApproverExecutionAuthorityInTx).toHaveBeenCalledTimes(1);
        expect(approval.markExecutionSucceeded).not.toHaveBeenCalled();
        expect(await snapshot()).toEqual(before);
      } finally {
        await prisma.collectionDispositionLine.deleteMany({ where: { dispositionId: disp.id } });
        await prisma.collectionDisposition.delete({ where: { id: disp.id } });
        await prisma.collection.delete({ where: { id: collection.id } });
        await prisma.caseClient.delete({ where: { id: caseClientId } });
        await prisma.client.delete({ where: { id: clientId } });
      }
    });
    it('H07: 5000 TRY avansa 100 USD kredi, debit ve typed masraf 409; kayıtlar ve bildirimler aynen kalır', async () => {
      const caseId = await newCase('h07-mismatch');
      await request(app.getHttpServer()).post(`/cases/${caseId}/balance/credit`).set(as(adminId)).send({ amount: 5000, currency: 'TRY', source: 'manual' }).expect(201);
      const snapshot = async () => ({
        balance: await prisma.caseBalance.findUniqueOrThrow({ where: { caseId } }),
        ledger: await prisma.balanceLedger.findMany({ where: { caseBalance: { caseId } }, orderBy: { id: 'asc' } }),
        journal: await prisma.accountingJournalEntry.findMany({ where: { tenantId }, orderBy: { id: 'asc' }, include: { lines: { orderBy: { lineNo: 'asc' } } } }),
        notifications: await prisma.clientNotification.findMany({ where: { tenantId }, orderBy: { id: 'asc' } }),
        audits: await prisma.auditLog.findMany({ where: { tenantId }, orderBy: { id: 'asc' } }),
      });
      const before = await snapshot();
      for (const path of ['credit', 'debit', 'expense-actual']) {
        const result = await request(app.getHttpServer()).post(`/cases/${caseId}/balance/${path}`).set(as(adminId)).send({ amount: 100, currency: 'USD', source: 'manual', postingKey: 'h07-no-write' });
        expect(result.status).toBe(409);
        expect(result.body.code).toBe('ADVANCE_CURRENCY_MISMATCH');
        expect(await snapshot()).toEqual(before);
      }
    });

    it('H07: ilk kredi kaynak USD hesabını açar; dosya TRY olsa da çevrim/ikinci hesap olmaz', async () => {
      const caseId = await newCase('h07-native');
      await request(app.getHttpServer()).post(`/cases/${caseId}/balance/credit`).set(as(adminId)).send({ amount: 100, currency: 'USD', source: 'manual' }).expect(201);
      await request(app.getHttpServer()).post(`/cases/${caseId}/balance/debit`).set(as(memberId)).send({ amount: 10, currency: 'USD', source: 'manual' }).expect(201);
      expect(await prisma.caseBalance.findUniqueOrThrow({ where: { caseId } })).toMatchObject({ currency: 'USD' });
      expect((await prisma.caseBalance.findUniqueOrThrow({ where: { caseId } })).balance.toString()).toBe('90');
      expect((await prisma.balanceLedger.findMany({ where: { caseBalance: { caseId } } })).map(x => x.currency)).toEqual(['USD', 'USD']);
      expect(await rows(caseId)).toEqual({ balances: 1, ledger: 2 });
    });

    it('H07: eşzamanlı TRY/USD ilk krediler tek hesap/tek para birimi bırakır; kaybeden 409 ve yazmasız', async () => {
      const caseId = await newCase('h07-first-race');
      const responses = await Promise.all(['TRY', 'USD'].map(currency => request(app.getHttpServer()).post(`/cases/${caseId}/balance/credit`).set(as(adminId)).send({ amount: 100, currency, source: 'manual' })));
      expect(responses.map(x => x.status).sort()).toEqual([201, 409]);
      expect(await rows(caseId)).toEqual({ balances: 1, ledger: 1 });
      const balance = await prisma.caseBalance.findUniqueOrThrow({ where: { caseId } });
      const ledger = await prisma.balanceLedger.findFirstOrThrow({ where: { caseBalanceId: balance.id } });
      expect(balance.currency).toBe(ledger.currency);
      expect(balance.balance.toString()).toBe('100');
    });

    it.each([undefined, '', 'try', ' USD ', 42])('H07: eksik/geçersiz kaynak para birimi %s satır oluşturmadan 400', async currency => {
      const caseId = await newCase(`h07-invalid-${String(currency)}`);
      await request(app.getHttpServer()).post(`/cases/${caseId}/balance/credit`).set(as(adminId)).send({ amount: 100, currency, source: 'manual' }).expect(400);
      expect(await rows(caseId)).toEqual({ balances: 0, ledger: 0 });
    });
    it('KONTROL: PARTNER ve MANAGER mevcut kredi / düşüm yolunu kullanır (SystemRole tek başına yetki değildir)', async () => {
      const caseId = await newCase('ctl-write');
      const credit = await request(app.getHttpServer()).post(`/cases/${caseId}/balance/credit`).set(as(adminId)).send({ currency: 'TRY', amount: 100, source: 'manual' });
      expect(credit.status).toBe(201);
      const debit = await request(app.getHttpServer()).post(`/cases/${caseId}/balance/debit`).set(as(memberId)).send({ currency: 'TRY', amount: 10, source: 'manual' });
      expect(debit.status).toBe(201);
      expect(await rows(caseId)).toEqual({ balances: 1, ledger: 2 });
    });

    it.each([
      ['credit', { amount: 100, source: 'manual' }],
      ['debit', { amount: 10, source: 'manual' }],
      ['expense-actual', { amount: 10, postingKey: 'cbws-viewer-1' }],
    ])('VIEWER POST /balance/%s → 403 VIEWER_WRITE_DENIED; satır ve defter yazılmaz (satırsız dosya)', async (path, body) => {
      const caseId = await newCase(`v-${path}`);
      const res = await request(app.getHttpServer()).post(`/cases/${caseId}/balance/${path}`).set(as(viewerId)).send(body);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('VIEWER_WRITE_DENIED');
      expect(await rows(caseId)).toEqual({ balances: 0, ledger: 0 });
    });

    it('VIEWER kredi / düşüm → VAR OLAN satırın bakiyesi ve defteri değişmez', async () => {
      const caseId = await newCase('v-existing');
      await request(app.getHttpServer()).post(`/cases/${caseId}/balance/credit`).set(as(adminId)).send({ currency: 'TRY', amount: 500, source: 'manual' }).expect(201);
      const before = await prisma.caseBalance.findUniqueOrThrow({ where: { caseId } });
      await request(app.getHttpServer()).post(`/cases/${caseId}/balance/credit`).set(as(viewerId)).send({ currency: 'TRY', amount: 1, source: 'manual' }).expect(403);
      await request(app.getHttpServer()).post(`/cases/${caseId}/balance/debit`).set(as(viewerId)).send({ currency: 'TRY', amount: 1, source: 'manual' }).expect(403);
      const after = await prisma.caseBalance.findUniqueOrThrow({ where: { caseId } });
      expect(after.balance.toString()).toBe(before.balance.toString());
      expect(await rows(caseId)).toEqual({ balances: 1, ledger: 1 });
    });

    it('KAPSAM: denetleyicinin TÜM yazma (GET dışı) rotaları sayılır ve her biri VIEWER için 403 — yeni yazma ucu eklenirse test bilinçli güncelleme ister', async () => {
      const proto = CaseBalanceController.prototype as unknown as Record<string, unknown>;
      const writeRoutes: Array<{ method: RequestMethod; path: string }> = [];
      for (const key of Object.getOwnPropertyNames(proto)) {
        const handler = proto[key];
        if (key === 'constructor' || typeof handler !== 'function') continue;
        const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
        if (method === undefined || method === RequestMethod.GET) continue;
        writeRoutes.push({ method, path: Reflect.getMetadata(PATH_METADATA, handler) as string });
      }
      // Bugün yalnız üç POST var (kredi, düşüm, gerçekleşen masraf); tahsis / PUT / PATCH / DELETE ucu YOK.
      expect(writeRoutes.map((r) => `${RequestMethod[r.method]} ${r.path}`).sort()).toEqual(['POST credit', 'POST debit', 'POST expense-actual']);
      const caseId = await newCase('v-enum');
      for (const route of writeRoutes) {
        const res = await request(app.getHttpServer())
          .post(`/cases/${caseId}/balance/${route.path}`)
          .set(as(viewerId))
          .send({ currency: 'TRY', amount: 1, source: 'manual', postingKey: `cbws-enum-${route.path}` });
        expect({ route: route.path, status: res.status, code: res.body.code }).toEqual({ route: route.path, status: 403, code: 'VIEWER_WRITE_DENIED' });
      }
      expect(await rows(caseId)).toEqual({ balances: 0, ledger: 0 });
    });

    it('VIEWER OKUYABİLİR: var olan satırın GET /balance ve GET /balance/ledger yanıtı 200', async () => {
      const caseId = await newCase('v-read');
      await request(app.getHttpServer()).post(`/cases/${caseId}/balance/credit`).set(as(adminId)).send({ currency: 'TRY', amount: 700, source: 'manual' }).expect(201);
      const bal = await request(app.getHttpServer()).get(`/cases/${caseId}/balance`).set(as(viewerId));
      expect(bal.status).toBe(200);
      expect(bal.body.balance).toBe('700');
      const led = await request(app.getHttpServer()).get(`/cases/${caseId}/balance/ledger`).set(as(viewerId));
      expect(led.status).toBe(200);
      expect(led.body).toHaveLength(1);
    });
  });

  describe('(2) okuma isteği bakiye satırı oluşturmaz', () => {
    it('GET /balance/ledger — satırsız dosya: 200 ve boş liste; satır OLUŞMAZ (VIEWER dahil)', async () => {
      for (const [label, user] of [['admin', adminId], ['viewer', viewerId], ['member', memberId]] as const) {
        const caseId = await newCase(`led-${label}`);
        const res = await request(app.getHttpServer()).get(`/cases/${caseId}/balance/ledger`).set(as(user));
        expect(res.status).toBe(200);
        expect(res.body).toEqual([]);
        expect(await rows(caseId)).toEqual({ balances: 0, ledger: 0 });
      }
    });

    const ABSENT = (caseId: string) => ({
      exists: false,
      caseId,
      balance: null,
      currency: null,
      lowThreshold: null,
      isLow: null,
      recentLedger: [],
    });

    it('GET /balance — satırsız dosya: 200 + açık yokluk (exists:false, değerler null); satır OLUŞMAZ (VIEWER dahil)', async () => {
      const caseId = await newCase('bal-none');
      const first = await request(app.getHttpServer()).get(`/cases/${caseId}/balance`).set(as(adminId));
      expect(first.status).toBe(200);
      expect(first.body).toEqual(ABSENT(caseId));
      const second = await request(app.getHttpServer()).get(`/cases/${caseId}/balance`).set(as(viewerId));
      expect(second.status).toBe(200);
      expect(second.body).toEqual(ABSENT(caseId));
      expect(await rows(caseId)).toEqual({ balances: 0, ledger: 0 });
    });

    it('GET /balance — dövizli dosya, satırsız: para birimi TRY da USD de DÖNMEZ (null); uydurma TRY satırı OLUŞMAZ', async () => {
      const caseId = await newCase('bal-usd', tenantId, 'USD');
      const res = await request(app.getHttpServer()).get(`/cases/${caseId}/balance`).set(as(adminId));
      expect(res.status).toBe(200);
      expect(res.body).toEqual(ABSENT(caseId));
      expect(res.body.currency).toBeNull();
      await request(app.getHttpServer()).get(`/cases/${caseId}/balance/ledger`).set(as(adminId)).expect(200);
      expect(await prisma.caseBalance.count({ where: { caseId } })).toBe(0);
    });

    it('12 eşzamanlı okuma → satır oluşmaz', async () => {
      const caseId = await newCase('bal-conc');
      const all = await Promise.all(
        Array.from({ length: 12 }, (_, i) =>
          request(app.getHttpServer()).get(`/cases/${caseId}/balance${i % 2 ? '/ledger' : ''}`).set(as(adminId)),
        ),
      );
      expect(all.every((r) => r.status === 200)).toBe(true);
      expect(await rows(caseId)).toEqual({ balances: 0, ledger: 0 });
    });

    it('VAR OLAN satırın yanıtı DEĞİŞMEZ (yalnız `exists:true` eklenir): balance / currency / lowThreshold / isLow / recentLedger aynı', async () => {
      const caseId = await newCase('bal-existing');
      await request(app.getHttpServer()).post(`/cases/${caseId}/balance/credit`).set(as(adminId)).send({ currency: 'TRY', amount: 1250.5, source: 'manual' }).expect(201);
      const res = await request(app.getHttpServer()).get(`/cases/${caseId}/balance`).set(as(adminId));
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ exists: true, caseId, tenantId, balance: '1250.5', currency: 'TRY', lowThreshold: '500', isLow: false });
      expect(res.body.recentLedger).toHaveLength(1);
      expect(res.body.recentLedger[0]).toMatchObject({ type: 'CREDIT', amount: '1250.5' });
      // Eski istemci (`exists` alanını bilmeyen) bozulmaz: `exists` dışındaki anahtar kümesi değişmedi.
      // Taban biçimi: `{ ...CaseBalance satırı, isLow, recentLedger }` (+ yalnız `exists`).
      const columns = Object.keys(await prisma.caseBalance.findUniqueOrThrow({ where: { caseId } }));
      expect(Object.keys(res.body).filter((k) => k !== 'exists').sort()).toEqual([...columns, 'isLow', 'recentLedger'].sort());
      expect(typeof res.body.balance).toBe('string');
      expect(typeof res.body.currency).toBe('string');
      expect(await rows(caseId)).toEqual({ balances: 1, ledger: 1 });
    });

    it('KİRACI SINIRI: başka büro GET /balance, /ledger → 404 ve satır oluşmaz', async () => {
      const caseId = await newCase('bal-tenant');
      for (const path of ['', '/ledger']) {
        const res = await request(app.getHttpServer()).get(`/cases/${caseId}/balance${path}`).set(as(otherAdminId));
        expect(res.status).toBe(404);
      }
      expect(await rows(caseId)).toEqual({ balances: 0, ledger: 0 });
    });
  });

  describe('YAZMA YOLU bozulmaz: ilk yazma satırı oluşturur', () => {
    it('satırsız dosyada ilk kredi satırı + defter satırını birlikte yazar (okumayla oluşmasına gerek yok)', async () => {
      const caseId = await newCase('write-first');
      const res = await request(app.getHttpServer()).post(`/cases/${caseId}/balance/credit`).set(as(adminId)).send({ currency: 'TRY', amount: 300, source: 'manual' });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ success: true, newBalance: 300 });
      expect(await rows(caseId)).toEqual({ balances: 1, ledger: 1 });
    });
  });
  describe('CL-R13 direct advance commands (actual HTTP and database)', () => {
    const command={amount:100,currency:'TRY',source:'manual'};
    const actor=async (role:'USER'|'ADMIN',rank?:'PARTNER'|'MANAGER'|'LAWYER',active=true)=>{
      const user=await prisma.user.create({data:{tenantId,email:randomUUID()+'@example.test',name:'Synthetic',surname:'CL-R13',role}});
      if(rank) await prisma.lawyer.create({data:{tenantId,userId:user.id,name:'Synthetic',surname:'CL-R13',lawyerRank:rank,isActive:active}});
      return user.id;
    };
    it.each([['USER',undefined,true],['ADMIN',undefined,true],['USER','LAWYER',true],['USER','PARTNER',false]] as const)('denies non-capacity/inactive actor %s/%s/%s with no financial effect',async(role,rank,active)=>{
      const id=await actor(role,rank,active),c=await newCase('r13-role-'+randomUUID());
      for(const route of ['credit','debit']) await request(app.getHttpServer()).post('/cases/'+c+'/balance/'+route).set(as(id)).send(command).expect(403);
      expect(await rows(c)).toEqual({balances:0,ledger:0});
    });
    it('ADMIN cannot bypass the capacity gate using forged server context fields',async()=>{
      const id=await actor('ADMIN'),c=await newCase('r13-forged');
      await request(app.getHttpServer()).post('/cases/'+c+'/balance/credit').set(as(id)).send({...command,context:{kind:'EXPENSE_REQUEST',tx:{}},postingKey:'expense-payment:forged'}).expect(403);
      expect(await rows(c)).toEqual({balances:0,ledger:0});
    });
    it('same credit key concurrently and after completion has one ledger, increment and journal',async()=>{
      const c=await newCase('r13-idem'),key=randomUUID();
      const send=()=>request(app.getHttpServer()).post('/cases/'+c+'/balance/credit').set(as(adminId)).set('Idempotency-Key',key).send(command);
      const results=await Promise.all([send(),send()]);expect(results.map(x=>x.status)).toEqual([201,201]);
      const replay=await send();expect(replay.status).toBe(201);expect(new Set([...results,replay].map(x=>x.body.ledgerId)).size).toBe(1);
      expect(await rows(c)).toEqual({balances:1,ledger:1});expect((await prisma.caseBalance.findUniqueOrThrow({where:{caseId:c}})).balance.toString()).toBe('100');
      expect(await prisma.accountingJournalEntry.count({where:{tenantId,sourceId:replay.body.ledgerId,sourceType:'BALANCE_LEDGER'}})).toBe(1);
      const saved=await prisma.balanceLedger.findUniqueOrThrow({where:{id:replay.body.ledgerId}});expect(saved.postingKey).toBe('advance-credit|'+key);
      // Private namespace cannot be supplied to the existing typed-posting key validator.
      await request(app.getHttpServer()).post('/cases/'+c+'/balance/expense-actual').set(as(adminId)).send({amount:1,currency:'TRY',postingKey:saved.postingKey}).expect(400);
      expect(await rows(c)).toEqual({balances:1,ledger:1});
    });
    it('same key with changed amount, source, case or actor is rejected without a second write',async()=>{
      const c=await newCase('r13-conflict'),other=await newCase('r13-other'),key=randomUUID();
      const send=(caseId=c,body=command,id=adminId)=>request(app.getHttpServer()).post('/cases/'+caseId+'/balance/credit').set(as(id)).set('Idempotency-Key',key).send(body);
      await send().expect(201);
      await send(c,{...command,amount:101}).expect(409);await send(c,{...command,source:'different'}).expect(409);await send(other).expect(409);await send(c,command,memberId).expect(409);
      expect(await rows(c)).toEqual({balances:1,ledger:1});expect(await rows(other)).toEqual({balances:0,ledger:0});
    });
    it('authorization is checked again before replay',async()=>{
      const id=await actor('USER','PARTNER'),c=await newCase('r13-revoked'),key=randomUUID();
      const send=()=>request(app.getHttpServer()).post('/cases/'+c+'/balance/credit').set(as(id)).set('Idempotency-Key',key).send(command);
      await send().expect(201);await prisma.lawyer.updateMany({where:{userId:id},data:{isActive:false}});await send().expect(403);
      expect(await rows(c)).toEqual({balances:1,ledger:1});
    });
    it('requires the credit header without silently generating an identity',async()=>{
      const c=await newCase('r13-no-key');await request(app.getHttpServer()).post('/cases/'+c+'/balance/credit').set('x-test-user-id',adminId).send(command).expect(400);
      expect(await rows(c)).toEqual({balances:0,ledger:0});
    });
    it.each([0,-1,1.001,10000000000000])('rejects invalid amount %s without creating an account',async amount=>{
      const c=await newCase('r13-amount-'+String(amount));
      for(const route of ['credit','debit']) await request(app.getHttpServer()).post('/cases/'+c+'/balance/'+route).set(as(adminId)).send({...command,amount}).expect(400);
      expect(await rows(c)).toEqual({balances:0,ledger:0});
    });
    it('rejects reserved journal-suppression sources on direct commands',async()=>{
      const c=await newCase('r13-source');for(const source of ['expense_payment:forged','disposition_line:forged']) await request(app.getHttpServer()).post('/cases/'+c+'/balance/credit').set(as(adminId)).send({...command,source}).expect(400);
      await request(app.getHttpServer()).post('/cases/'+c+'/balance/credit').set(as(adminId)).send({...command,sourceId:'disposition_line:forged'}).expect(400);
      expect(await rows(c)).toEqual({balances:0,ledger:0});
    });
    it('two 80 TRY debits from 100 TRY cannot both commit',async()=>{
      const c=await newCase('r13-debits');await request(app.getHttpServer()).post('/cases/'+c+'/balance/credit').set(as(adminId)).send(command).expect(201);
      const results=await Promise.all([adminId,memberId].map(id=>request(app.getHttpServer()).post('/cases/'+c+'/balance/debit').set(as(id)).send({...command,amount:80})));
      expect(results.map(x=>x.status).sort()).toEqual([201,400]);expect((await prisma.caseBalance.findUniqueOrThrow({where:{caseId:c}})).balance.toString()).toBe('20');expect(await rows(c)).toEqual({balances:1,ledger:2});
    });
    it('foreign-tenant capacity cannot write an owned case',async()=>{
      const c=await newCase('r13-tenant');for(const route of ['credit','debit'])await request(app.getHttpServer()).post('/cases/'+c+'/balance/'+route).set(as(otherAdminId)).send(command).expect(404);
      expect(await rows(c)).toEqual({balances:0,ledger:0});
    });
    it('a journal failure rolls back the credit account, ledger and journal, allowing the same-key retry',async()=>{
      const c=await newCase('r13-rollback'),key=randomUUID(),svc=app.get(CaseBalanceService),writer=(svc as any).journalWriter,write=writer.write.bind(writer);
      const before=await prisma.accountingJournalEntry.count({where:{tenantId}});
      const spy=jest.spyOn(writer,'write').mockImplementationOnce(async(...args:unknown[])=>{await write(...args);throw new Error('CL-R13 synthetic post-journal failure');});
      try{await request(app.getHttpServer()).post('/cases/'+c+'/balance/credit').set(as(adminId)).set('Idempotency-Key',key).send(command).expect(500);}finally{spy.mockRestore();}
      expect(await rows(c)).toEqual({balances:0,ledger:0});expect(await prisma.accountingJournalEntry.count({where:{tenantId}})).toBe(before);
      await request(app.getHttpServer()).post('/cases/'+c+'/balance/credit').set(as(adminId)).set('Idempotency-Key',key).send(command).expect(201);expect(await rows(c)).toEqual({balances:1,ledger:1});
    });
  });

});
