// CaseModule grafiği `pdf-poppler`'ı yükler; paket Linux'ta yükleme anında process.exit(1) verir
// (CI emsali: expense-tenant-boundary.http.db-gated.integration.spec.ts).
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

/**
 * Masraf okuma uçlarında büronun varsayılan banka hesabı (IBAN) — GERÇEK HTTP + disposable PostgreSQL.
 *
 * Ölçülen kusur (2026-10-02 ölçümü; kod 4deb4d20'ye kadar değişmedi): şu üç okuma ucu büronun varsayılan hesabının
 * IBAN'ını `clientRequest.paymentInfo.iban` / `paymentInfo.iban` alanında kiracıdaki HER role (salt okur dahil) döndürüyordu:
 *   - GET /expense-requests/case/:caseId/three-view
 *   - GET /expense-requests/:id/three-view
 *   - GET /expense-requests/client/:clientId/requests
 * Hiçbir tüketici alanı okumuyordu (web'de `paymentInfo` başvurusu 0).
 *
 * Kural (güvenlik paketi 01 / P2): üç uçta `paymentInfo` yalnız `{ description }` taşır; açıklama metni (dosya numarası +
 * " - Masraf") değişmez. Başka büronun verisine erişim yanıtı (boş liste / var olmayan kimlikle aynı yanıt) değişmez.
 * Kapsam DIŞI: müvekkile giden masraf e-postası (IBAN'ı kendi yolundan alır) ve bildirim geçmişi uçları.
 */
const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('EXPENSE-VIEW-OFFICE-IBAN DB gate blocked: CI requires an approved TEST_DATABASE_URL.');
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

/** Sentetik (geçersiz) IBAN'lar: yanıtta boşluklu ya da boşluksuz biçimde aranır. */
const IBAN = {
  aDefault: 'TR00 0000 0000 0000 0000 00P2 A1',
  aOther: 'TR00 0000 0000 0000 0000 00P2 A2',
  bDefault: 'TR00 0000 0000 0000 0000 00P2 B1',
};
const IBAN_NEEDLES = Object.values(IBAN).flatMap((iban) => [iban, iban.replace(/\s+/g, '')]);

type ActorKey = 'admin' | 'lawyer' | 'partner' | 'staffWithoutProfile' | 'viewer';

describeWithDisposableDb('Masraf okuma uçları — büro IBAN’ı yanıtta yok (HTTP + disposable PostgreSQL)', () => {
  jest.setTimeout(180_000);

  let prisma: PrismaClient;
  let app: INestApplication;
  const suffix = randomUUID().slice(0, 8);

  const office = {
    a: { tenantId: `test-ci-evi-a-${suffix}`, clientId: '', clientName: 'EVI-A müvekkil', caseId: '', fileNumber: `CI-EVI-A-${suffix}`, expenseId: '' },
    b: { tenantId: `test-ci-evi-b-${suffix}`, clientId: '', clientName: 'EVI-B müvekkil', caseId: '', fileNumber: `CI-EVI-B-${suffix}`, expenseId: '' },
  };
  type Office = (typeof office)['a'];

  /** A bürosunun aktörleri (rol + avukat profili); B bürosunda yalnız yönetici. */
  const actorsOfA: Record<ActorKey, string> = { admin: '', lawyer: '', partner: '', staffWithoutProfile: '', viewer: '' };
  let adminOfB = '';

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await prisma.$connect();
    const identity = new DbUserIdentityGuard(() => prisma);
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), StorageModule, ErrorLogModule, MetricsRegistryModule, CaseModule],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(identity)
      // Masraf denetleyicisi passport korumasını doğrudan kullanır (AuthGuard('jwt') aynı sınıfı döndürür)
      .overrideGuard(AuthGuard('jwt'))
      .useValue(identity)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe(PRODUCTION_VALIDATION_OPTIONS));
    await app.init();

    for (const [key, entry] of Object.entries(office)) {
      await prisma.tenant.create({ data: { id: entry.tenantId, name: `CI EVI ${key}`, slug: entry.tenantId } });
      const client = await prisma.client.create({
        data: { tenantId: entry.tenantId, type: 'COMPANY', companyName: entry.clientName, displayName: entry.clientName },
      });
      entry.clientId = client.id;
    }

    // Büro kayıtları ve hesapları: A'da biri varsayılan iki hesap, B'de bir varsayılan hesap
    await prisma.office.create({
      data: {
        tenantId: office.a.tenantId,
        name: 'CI EVI A bürosu',
        bankAccounts: {
          create: [
            { bankName: 'Sentetik Banka', iban: IBAN.aOther, isDefault: false },
            { bankName: 'Sentetik Banka', iban: IBAN.aDefault, isDefault: true },
          ],
        },
      },
    });
    await prisma.office.create({
      data: { tenantId: office.b.tenantId, name: 'CI EVI B bürosu', bankAccounts: { create: [{ bankName: 'Sentetik Banka', iban: IBAN.bDefault, isDefault: true }] } },
    });

    const createUser = async (tenantId: string, key: string, role: 'ADMIN' | 'USER' | 'VIEWER') =>
      (
        await prisma.user.create({
          data: { tenantId, email: `${key}-${suffix}@example.test`, name: key, surname: 'EVI', role },
        })
      ).id;
    actorsOfA.admin = await createUser(office.a.tenantId, 'admin-a', 'ADMIN');
    actorsOfA.lawyer = await createUser(office.a.tenantId, 'lawyer-a', 'USER');
    actorsOfA.partner = await createUser(office.a.tenantId, 'partner-a', 'USER');
    actorsOfA.staffWithoutProfile = await createUser(office.a.tenantId, 'staff-a', 'USER');
    actorsOfA.viewer = await createUser(office.a.tenantId, 'viewer-a', 'VIEWER');
    adminOfB = await createUser(office.b.tenantId, 'admin-b', 'ADMIN');
    for (const [userId, lawyerRank] of [
      [actorsOfA.lawyer, 'LAWYER'],
      [actorsOfA.partner, 'PARTNER'],
    ] as const) {
      await prisma.lawyer.create({ data: { tenantId: office.a.tenantId, userId, name: lawyerRank, surname: 'EVI', lawyerRank } });
    }

    // Müvekkilli dosya → ürünün kendi açılış masraf talebi
    for (const [entry, actor] of [
      [office.a, actorsOfA.admin],
      [office.b, adminOfB],
    ] as const) {
      entry.caseId = await openCase(entry, actor);
      entry.expenseId = await waitForOpeningRequest(entry);
    }
  });

  afterAll(async () => {
    await app?.close();
    for (const entry of [office.a, office.b]) {
      await prisma.auditLog.deleteMany({ where: { tenantId: entry.tenantId } }).catch(() => undefined);
      await prisma.tenant.deleteMany({ where: { id: entry.tenantId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  const http = () => request(app.getHttpServer());
  const get = (userId: string, path: string) => http().get(path).set('x-test-user-id', userId);
  const outcome = (res: request.Response) => ({ status: res.status, body: res.body });
  const leakedIbans = (body: unknown) => IBAN_NEEDLES.filter((needle) => JSON.stringify(body).includes(needle));

  async function openCase(owner: Office, actorId: string): Promise<string> {
    const res = await http()
      .post('/cases')
      .set('x-test-user-id', actorId)
      .send({
        fileNumber: owner.fileNumber,
        type: 'GENERAL_EXECUTION',
        interestType: 'YASAL',
        startDate: '2026-02-01',
        currency: 'TRY',
        creditors: [{ id: owner.clientId, type: 'COMPANY', name: owner.clientName }],
        dues: [{ type: 'PRINCIPAL', description: 'Asıl alacak', amount: 10_000, dueDate: '2026-01-15' }],
      });
    expect({ fileNumber: owner.fileNumber, status: res.status }).toEqual({ fileNumber: owner.fileNumber, status: 201 });
    return res.body.id as string;
  }

  /** Müvekkilli dosyanın arka plan açılış talebi için sınırlı bekleme (en çok ~8 sn); talebin kimliğini döndürür. */
  async function waitForOpeningRequest(owner: Office): Promise<string> {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const row = await prisma.expenseRequest.findFirst({ where: { tenantId: owner.tenantId, caseId: owner.caseId } });
      const journalEntries = await prisma.accountingJournalEntry.count({
        where: { tenantId: owner.tenantId, caseId: owner.caseId, sourceType: 'EXPENSE_REQUEST' },
      });
      if (row && journalEntries > 0) return row.id;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error(`Açılış masraf talebi oluşmadı: ${owner.caseId}`);
  }

  /** Üç ucun, verilen aktör ve büro kimlikleriyle çağrıları. */
  const readCalls = (userId: string, target: Office) =>
    [
      ['GET case/:caseId/three-view', () => get(userId, `/expense-requests/case/${target.caseId}/three-view`)],
      ['GET :id/three-view', () => get(userId, `/expense-requests/${target.expenseId}/three-view`)],
      ['GET client/:clientId/requests', () => get(userId, `/expense-requests/client/${target.clientId}/requests`)],
    ] as const;

  /** Yanıttaki müvekkil talebi görünümleri (uç biçimine göre). */
  const clientRequestsOf = (name: string, body: any): any[] => {
    if (name === 'GET case/:caseId/three-view') return (body as any[]).map((entry) => entry.clientRequest);
    if (name === 'GET :id/three-view') return [body.clientRequest];
    return body as any[];
  };

  it('kurulum boş değil: A bürosunda TEK varsayılan hesap var ve her iki büroda açılış masraf talebi oluştu', async () => {
    const defaults = await prisma.officeBankAccount.findMany({ where: { office: { tenantId: office.a.tenantId }, isDefault: true } });
    expect(defaults.map((row) => row.iban)).toEqual([IBAN.aDefault]);
    for (const entry of [office.a, office.b]) {
      const row = await prisma.expenseRequest.findUnique({ where: { id: entry.expenseId } });
      expect(row).toMatchObject({ tenantId: entry.tenantId, caseId: entry.caseId, clientId: entry.clientId, stageCode: 'OPENING' });
    }
  });

  it.each(Object.keys(actorsOfA) as ActorKey[])(
    'A bürosu aktörü (%s): üç uçta 200; paymentInfo yalnız açıklama, hiçbir IBAN yok',
    async (actor) => {
      const observed: Record<string, unknown> = {};
      const expected: Record<string, unknown> = {};
      for (const [name, call] of readCalls(actorsOfA[actor], office.a)) {
        const res = await call();
        const clientRequests = clientRequestsOf(name, res.body);
        observed[name] = {
          status: res.status,
          clientRequestCount: clientRequests.length,
          paymentInfos: clientRequests.map((entry) => entry.paymentInfo),
          clientRequestIds: clientRequests.map((entry) => entry.id),
          leaked: leakedIbans(res.body),
        };
        expected[name] = {
          status: 200,
          clientRequestCount: 1,
          paymentInfos: [{ description: `${office.a.fileNumber} - Masraf` }],
          clientRequestIds: [office.a.expenseId],
          leaked: [],
        };
      }
      expect(observed).toEqual(expected);
    },
  );

  it('üç uçta yanıt gövdesi beş aktörde birebir aynı (rol ayrımı yok, alan sözleşmesi korunur)', async () => {
    const bodies: Record<string, Record<ActorKey, string>> = {};
    for (const actor of Object.keys(actorsOfA) as ActorKey[]) {
      for (const [name, call] of readCalls(actorsOfA[actor], office.a)) {
        const res = await call();
        expect({ actor, name, status: res.status }).toEqual({ actor, name, status: 200 });
        bodies[name] = { ...(bodies[name] ?? {}), [actor]: JSON.stringify(res.body) } as Record<ActorKey, string>;
      }
    }
    for (const [name, perActor] of Object.entries(bodies)) {
      expect({ name, distinctBodies: new Set(Object.values(perActor)).size }).toEqual({ name, distinctBodies: 1 });
    }

    // Korunan alanlar: three-view üçlüsü ve müvekkil talebi görünümünün alan kümesi (yalnız paymentInfo.iban eksildi)
    const single = (await get(actorsOfA.admin, `/expense-requests/${office.a.expenseId}/three-view`)).body;
    expect(Object.keys(single).sort()).toEqual(['clientRequest', 'finance', 'task']);
    const row = await prisma.expenseRequest.findUniqueOrThrow({ where: { id: office.a.expenseId } });
    expect(single.clientRequest).toMatchObject({
      id: office.a.expenseId,
      type: 'MASRAF_TALEBI',
      amount: Number(row.totalAmount),
      status: 'BEKLIYOR',
      paymentInfo: { description: `${office.a.fileNumber} - Masraf` },
    });
    expect(Object.keys(single.clientRequest.paymentInfo)).toEqual(['description']);
    expect(single.finance).toMatchObject({ id: office.a.expenseId, type: 'MASRAF_TALEP', totalAmount: Number(row.totalAmount) });
    expect(single.task).toMatchObject({ id: office.a.expenseId, taskType: 'EXPENSE_REQUEST' });
  });

  it('B bürosu yöneticisi kendi dosyasında da kendi IBAN’ını görmez', async () => {
    for (const [name, call] of readCalls(adminOfB, office.b)) {
      const res = await call();
      expect({
        name,
        status: res.status,
        paymentInfos: clientRequestsOf(name, res.body).map((entry) => entry.paymentInfo),
        leaked: leakedIbans(res.body),
      }).toEqual({ name, status: 200, paymentInfos: [{ description: `${office.b.fileNumber} - Masraf` }], leaked: [] });
    }
  });

  describe('başka büronun verisi: yanıt değişmez (boş liste / var olmayan kimlikle aynı yanıt)', () => {
    it('A yöneticisi → B dosyası ve B müvekkili: 200 boş liste', async () => {
      expect(outcome(await get(actorsOfA.admin, `/expense-requests/case/${office.b.caseId}/three-view`))).toEqual({ status: 200, body: [] });
      expect(outcome(await get(actorsOfA.admin, `/expense-requests/client/${office.b.clientId}/requests`))).toEqual({ status: 200, body: [] });
    });

    it('A yöneticisi → B talebi (:id/three-view): var olmayan kimlikle AYNI yanıt, B verisi ve IBAN sızmaz', async () => {
      const foreign = await get(actorsOfA.admin, `/expense-requests/${office.b.expenseId}/three-view`);
      const missing = await get(actorsOfA.admin, `/expense-requests/yok-${randomUUID()}/three-view`);
      expect(outcome(foreign)).toEqual(outcome(missing));
      expect(foreign.status).not.toBe(200);
      expect(JSON.stringify(foreign.body)).not.toContain(office.b.fileNumber);
      expect(leakedIbans(foreign.body)).toEqual([]);
    });
  });
});
