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
import { CaseBalanceModule } from '../case-balance.module';

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

  const as = (userId: string) => ({ 'x-test-user-id': userId });

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

    for (const t of [tenantId, otherTenantId]) await prisma.tenant.create({ data: { id: t, name: `CI CBWS ${t}`, slug: t } });
    const mk = async (tenant: string, role: 'ADMIN' | 'USER' | 'VIEWER', tag: string) =>
      (await prisma.user.create({ data: { tenantId: tenant, email: `${tag}-${suffix}@example.test`, name: tag, surname: 'CBWS', role } })).id;
    adminId = await mk(tenantId, 'ADMIN', 'admin');
    memberId = await mk(tenantId, 'USER', 'member');
    viewerId = await mk(tenantId, 'VIEWER', 'viewer');
    otherAdminId = await mk(otherTenantId, 'ADMIN', 'otheradmin');
  });

  afterAll(async () => {
    for (const t of [tenantId, otherTenantId]) {
      await prisma.accountingJournalLine.deleteMany({ where: { tenantId: t } }).catch(() => undefined);
      await prisma.accountingJournalEntry.deleteMany({ where: { tenantId: t } }).catch(() => undefined);
      await prisma.balanceLedger.deleteMany({ where: { tenantId: t } }).catch(() => undefined);
      await prisma.caseBalance.deleteMany({ where: { tenantId: t } }).catch(() => undefined);
      await prisma.case.deleteMany({ where: { tenantId: t } }).catch(() => undefined);
      await prisma.user.deleteMany({ where: { tenantId: t } }).catch(() => undefined);
      await prisma.tenant.delete({ where: { id: t } }).catch(() => undefined);
    }
    await app?.close();
    await prisma?.$disconnect();
  });

  describe('(1) VIEWER avans yazamaz', () => {
    it('KONTROL: ADMIN ve USER kredi / düşüm yazabilir (kapı yalnız VIEWER\'ı eler)', async () => {
      const caseId = await newCase('ctl-write');
      const credit = await request(app.getHttpServer()).post(`/cases/${caseId}/balance/credit`).set(as(adminId)).send({ amount: 100, source: 'manual' });
      expect(credit.status).toBe(201);
      const debit = await request(app.getHttpServer()).post(`/cases/${caseId}/balance/debit`).set(as(memberId)).send({ amount: 10, source: 'manual' });
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
      await request(app.getHttpServer()).post(`/cases/${caseId}/balance/credit`).set(as(adminId)).send({ amount: 500, source: 'manual' }).expect(201);
      const before = await prisma.caseBalance.findUniqueOrThrow({ where: { caseId } });
      await request(app.getHttpServer()).post(`/cases/${caseId}/balance/credit`).set(as(viewerId)).send({ amount: 1, source: 'manual' }).expect(403);
      await request(app.getHttpServer()).post(`/cases/${caseId}/balance/debit`).set(as(viewerId)).send({ amount: 1, source: 'manual' }).expect(403);
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
          .send({ amount: 1, source: 'manual', postingKey: `cbws-enum-${route.path}` });
        expect({ route: route.path, status: res.status, code: res.body.code }).toEqual({ route: route.path, status: 403, code: 'VIEWER_WRITE_DENIED' });
      }
      expect(await rows(caseId)).toEqual({ balances: 0, ledger: 0 });
    });

    it('VIEWER OKUYABİLİR: var olan satırın GET /balance ve GET /balance/ledger yanıtı 200', async () => {
      const caseId = await newCase('v-read');
      await request(app.getHttpServer()).post(`/cases/${caseId}/balance/credit`).set(as(adminId)).send({ amount: 700, source: 'manual' }).expect(201);
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
      await request(app.getHttpServer()).post(`/cases/${caseId}/balance/credit`).set(as(adminId)).send({ amount: 1250.5, source: 'manual' }).expect(201);
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
      const res = await request(app.getHttpServer()).post(`/cases/${caseId}/balance/credit`).set(as(adminId)).send({ amount: 300, source: 'manual' });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ success: true, newBalance: 300 });
      expect(await rows(caseId)).toEqual({ balances: 1, ledger: 1 });
    });
  });
});
