// CaseModule grafiği `pdf-poppler`'ı yükler; paket Linux'ta yükleme anında process.exit(1) verir
// (CI emsali: case-create-instrument-admission.http.db-gated.integration.spec.ts).
jest.mock('pdf-poppler', () => ({
  convert: async () => {
    throw new Error('pdf-poppler is stubbed in unit tests');
  },
}));

import { CanActivate, ExecutionContext, INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import * as request from 'supertest';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { StorageModule } from '../../../common/storage/storage.module';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ErrorLogModule } from '../../error-log/error-log.module';
import { MetricsRegistryModule } from '../../metrics-registry/metrics-registry.module';
import { CaseModule } from '../case.module';

/**
 * CL-R04 KABUL-9 (owner ek talimatı 30.10.2026) — `POST /cases` SATIR İÇİ müvekkil (creditors[] kimlik numarasıyla) yolu
 * CL-R04 dedup sözleşmesine tabidir ve ATOMİKTİR. Gerçek HTTP → CaseController → CaseService.create → (aynı transaction)
 * ClientService.create → disposable PostgreSQL. JWT yerine DB kimliği (x-test-user-id); rol ve kart DB satırından.
 *
 * Kabul (owner): kapsam DIŞI mevcut AKTİF ve PASİF müvekkil AYNI genel 409 DUPLICATE_IDENTITY (profil / id / aktiflik bilgisi
 * YOK); dava, CaseClient bağı ve öteki iş kayıtları OLUŞMAZ; reaktivasyon 0; dış gönderim 0 (bildirim kuyruğu boş). Meşru
 * kapsam İÇİ akış mevcut müvekkili BAĞLAR (mükerrer kayıt açmaz); kapsam İÇİ pasif → 409 DUPLICATE_IDENTITY_INACTIVE; yeni
 * kimlik → yeni müvekkil + dava. F02-B görev/masraf `view_all` izinleri müvekkil kapsamı ÜRETMEZ (aynı genel 409).
 * Güvenlik denetim kaydı, iş verisi yan etkisinden AYRI beklentide ölçülür (ret yolunda audit satırı 0 — transaction geri alınır).
 *
 * KABUL-1…8 (`client/__tests__/cl-r04-dedup-return-scope…`) POST /clients yolunu kapsar; bu spec yalnız dava açılışındaki
 * satır içi yolu ölçer (önceden KOD OKUMASI; karar listesi R03 §B-6).
 */
const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('CL-R04 KABUL-9 DB gate blocked: CI requires an approved TEST_DATABASE_URL.');
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

/** TEST-ONLY sentetik değerler (geçerli mod-10/11 TCKN'ler; gerçek kişi DEĞİL). */
const RAW = {
  tckn: '10000000146',
  inactiveTckn: '20000000046',
  newTckn: '30000000014',
  email: 'kabul9-raw@example.test',
  phone: '+905551112233',
  notes: 'KABUL-9 gizli not',
  inactiveNotes: 'KABUL-9 pasif gizli not',
  address: 'KABUL-9 gizli sokak',
} as const;

interface Fixture {
  tenantId: string;
  activeClient: string;
  inactiveClient: string;
  caseId: string;
  /** USER + avukat kartı, hiçbir dosyaya ATANMAMIŞ → K16 okuma kapsamı BOŞ. */
  outUser: string;
  outLawyer: string;
  /** USER + avukat kartı, mevcut müvekkillerin dosyasına CaseLawyer ile atanmış → kapsam İÇİ. */
  inUser: string;
  inLawyer: string;
  /** Kartsız ADMIN — rol kapsam üretmez. */
  admin: string;
  fileNo: (tag: string) => string;
}

describeWithDisposableDb('CL-R04 KABUL-9 — POST /cases satır içi müvekkil: kapsam dışı mükerrer → genel 409, dava / bağ / iş kaydı 0 (HTTP + disposable PostgreSQL)', () => {
  jest.setTimeout(120_000);

  let prisma: PrismaClient;
  let app: INestApplication;
  const tenantIds = new Set<string>();

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await prisma.$connect();
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        StorageModule,
        ErrorLogModule,
        MetricsRegistryModule,
        CaseModule,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(new DbUserIdentityGuard(() => prisma))
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe(PRODUCTION_VALIDATION_OPTIONS));
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    for (const tenantId of tenantIds) {
      await prisma.auditLog.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await prisma.permissionGrant.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await prisma.tenant.deleteMany({ where: { id: tenantId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  async function fixture(label: string): Promise<Fixture> {
    const suffix = randomUUID().slice(0, 8);
    const tenantId = `test-ci-k9-${label}-${suffix}`;
    tenantIds.add(tenantId);
    await prisma.tenant.create({ data: { id: tenantId, name: `CI K9 ${label}`, slug: tenantId } });
    const activeClient = (await prisma.client.create({ data: {
      tenantId, type: 'INDIVIDUAL', name: 'K9 Aktif', firstName: 'Aktif', lastName: 'Müvekkil',
      tckn: RAW.tckn, identityNo: RAW.tckn, email: RAW.email, phone: RAW.phone, address: RAW.address, notes: RAW.notes,
    } })).id;
    const inactiveClient = (await prisma.client.create({ data: {
      tenantId, type: 'INDIVIDUAL', name: 'K9 Pasif', firstName: 'Pasif', lastName: 'Müvekkil',
      tckn: RAW.inactiveTckn, identityNo: RAW.inactiveTckn, notes: RAW.inactiveNotes, isActive: false,
    } })).id;
    // Mevcut dosya: iki müvekkil de bu dosyanın tarafı → dosyaya atanan avukat ikisini de K16 kapsamında görür.
    const caseId = (await prisma.case.create({ data: { tenantId, clientId: activeClient, type: 'GENERAL_EXECUTION', fileNumber: `K9-MEVCUT-${suffix}` } })).id;
    await prisma.caseClient.create({ data: { caseId, clientId: activeClient } });
    await prisma.caseClient.create({ data: { caseId, clientId: inactiveClient } });
    const mkUser = async (role: 'USER' | 'ADMIN', tag: string) =>
      (await prisma.user.create({ data: { tenantId, role, email: `k9-${tag}-${suffix}@example.test`, name: 'Sentetik', surname: tag } })).id;
    const outUser = await mkUser('USER', 'disi');
    const outLawyer = (await prisma.lawyer.create({ data: { tenantId, userId: outUser, name: 'Kapsam', surname: 'Dışı', lawyerRank: 'LAWYER' } })).id;
    const inUser = await mkUser('USER', 'ici');
    const inLawyer = (await prisma.lawyer.create({ data: { tenantId, userId: inUser, name: 'Kapsam', surname: 'İçi', lawyerRank: 'LAWYER' } })).id;
    await prisma.caseLawyer.create({ data: { caseId, lawyerId: inLawyer } });
    const admin = await mkUser('ADMIN', 'admin');
    return { tenantId, activeClient, inactiveClient, caseId, outUser, outLawyer, inUser, inLawyer, admin, fileNo: (tag) => `K9-${tag}-${suffix}` };
  }

  /** Dava açılışının yazabileceği iş kayıtları — "hiçbir iş kaydı oluşmadı" iddiasının ölçüm birimi (audit AYRI). */
  async function rows(tenantId: string) {
    const [cases, caseClients, caseLawyers, caseDebtors, clients, claimItems, dues, approvals, notifications] = await Promise.all([
      prisma.case.count({ where: { tenantId } }),
      prisma.caseClient.count({ where: { case: { tenantId } } }),
      prisma.caseLawyer.count({ where: { case: { tenantId } } }),
      prisma.caseDebtor.count({ where: { case: { tenantId } } }),
      prisma.client.count({ where: { tenantId } }),
      prisma.claimItem.count({ where: { tenantId } }),
      prisma.due.count({ where: { case: { tenantId } } }),
      prisma.officeApprovalRequest.count({ where: { tenantId } }),
      prisma.notificationQueue.count({ where: { tenantId } }),
    ]);
    return { cases, caseClients, caseLawyers, caseDebtors, clients, claimItems, dues, approvals, notifications };
  }
  const audits = (tenantId: string) => prisma.auditLog.count({ where: { tenantId } });
  const clientState = (id: string) => prisma.client.findUniqueOrThrow({ where: { id }, select: { isActive: true, updatedAt: true, notes: true, phone: true } });

  /** Sihirbazın satır içi yeni müvekkili: kimlik numarası mevcut bir kaydı işaret ediyorsa dedup yolu devreye girer. */
  const body = (f: Fixture, tag: string, identityNo: string, lawyerId: string) => ({
    fileNumber: f.fileNo(tag),
    type: 'GENERAL_EXECUTION',
    creditors: [{ type: 'INDIVIDUAL', name: 'Satır İçi Müvekkil', identityNo }],
    lawyers: [{ id: lawyerId, name: 'Mevcut', surname: 'Avukat' }],
  });
  const post = (userId: string, payload: object) =>
    request(app.getHttpServer()).post('/cases').set('x-test-user-id', userId).send(payload);

  function expectGenericConflict(res: request.Response, f: Fixture) {
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('DUPLICATE_IDENTITY');
    const text = JSON.stringify(res.body);
    for (const raw of [RAW.tckn, RAW.inactiveTckn, RAW.email, RAW.phone, RAW.notes, RAW.inactiveNotes, RAW.address, f.activeClient, f.inactiveClient]) {
      expect(text).not.toContain(raw);
    }
    for (const key of ['id', 'isActive', 'data', 'existingClient', 'client', '_existingReturned']) expect(res.body).not.toHaveProperty(key);
  }

  /** Ret yolu: genel 409 + hiçbir iş kaydı, reaktivasyon, dış gönderim yok; audit ayrı ölçülür. */
  async function expectRejectedAtomic(f: Fixture, userId: string, payload: { fileNumber: string }) {
    const before = await rows(f.tenantId);
    const auditBefore = await audits(f.tenantId);
    const activeBefore = await clientState(f.activeClient);
    const inactiveBefore = await clientState(f.inactiveClient);

    const res = await post(userId, payload);
    expectGenericConflict(res, f);

    expect(await rows(f.tenantId)).toEqual(before);
    expect(await prisma.case.count({ where: { tenantId: f.tenantId, fileNumber: payload.fileNumber } })).toBe(0);
    expect(await clientState(f.activeClient)).toEqual(activeBefore);
    expect(await clientState(f.inactiveClient)).toEqual(inactiveBefore); // reaktivasyon YOK (isActive=false, updatedAt aynı)
    expect(before.notifications).toBe(0); // dış gönderim 0: bildirim kuyruğu boş (ve `rows` eşitliğiyle boş kaldı)
    // Güvenlik denetim kaydı — iş verisi yan etkisinden AYRI ölçüm: transaction geri alındığı için ret yolunda audit satırı YOK.
    expect(await audits(f.tenantId)).toBe(auditBefore);
    return res;
  }

  it('KABUL-9a: kapsam DIŞI USER (avukat kartlı, dosyaya atanmamış) + mevcut AKTİF kimlik → genel 409; dava / CaseClient / iş kaydı 0; audit 0', async () => {
    const f = await fixture('a');
    await expectRejectedAtomic(f, f.outUser, body(f, 'A', RAW.tckn, f.outLawyer));
  });

  it('KABUL-9b: kapsam DIŞI + mevcut PASİF kimlik → AYNI genel 409 gövdesi (aktiflik sızmaz); pasif kayıt pasif kalır (reaktivasyon 0)', async () => {
    const f = await fixture('b');
    const active = await expectRejectedAtomic(f, f.outUser, body(f, 'B1', RAW.tckn, f.outLawyer));
    const passive = await expectRejectedAtomic(f, f.outUser, body(f, 'B2', RAW.inactiveTckn, f.outLawyer));
    expect(passive.body).toEqual(active.body);
    expect((await clientState(f.inactiveClient)).isActive).toBe(false);
  });

  it('KABUL-9c: kartsız ADMIN kapsam DIŞI → aynı genel 409 (ADMIN rolü kapsam üretmez); dava 0', async () => {
    const f = await fixture('c');
    await expectRejectedAtomic(f, f.admin, body(f, 'C', RAW.tckn, f.inLawyer));
  });

  it('KABUL-9d: F02-B view_all izinleri (masraf + görev, GLOBAL ALLOW) müvekkil kapsamı ÜRETMEZ → aynı genel 409; dava 0', async () => {
    const f = await fixture('d');
    await prisma.permissionGrant.createMany({
      data: ['office.expenses.view_all', 'office.tasks.view_all'].map((permissionKey) => ({
        tenantId: f.tenantId, subjectUserId: f.outUser, permissionKey, effect: 'ALLOW' as const, scope: 'GLOBAL' as const,
        grantedByUserId: f.admin, reason: 'KABUL-9 ölçüm (TEST-ONLY)',
      })),
    });
    await expectRejectedAtomic(f, f.outUser, body(f, 'D', RAW.tckn, f.outLawyer));
  });

  it('KABUL-9e: kapsam İÇİ USER (dosyaya atanmış) + mevcut AKTİF kimlik → 201; mevcut müvekkil BAĞLANIR (mükerrer kayıt yok); dava + CaseClient +1', async () => {
    const f = await fixture('e');
    const before = await rows(f.tenantId);
    const res = await post(f.inUser, body(f, 'E', RAW.tckn, f.inLawyer));
    expect(res.status).toBe(201);
    const after = await rows(f.tenantId);
    expect(after.clients).toBe(before.clients); // yeni müvekkil AÇILMADI
    expect(after.cases).toBe(before.cases + 1);
    expect(after.caseClients).toBe(before.caseClients + 1);
    const created = await prisma.case.findFirstOrThrow({ where: { tenantId: f.tenantId, fileNumber: f.fileNo('E') } });
    const links = await prisma.caseClient.findMany({ where: { caseId: created.id }, select: { clientId: true } });
    expect(links.map((l) => l.clientId)).toEqual([f.activeClient]);
    expect(JSON.stringify(res.body)).not.toContain(RAW.notes); // ham profil yanıta sızmaz
  });

  it('KABUL-9f: kapsam İÇİ + mevcut PASİF kimlik → 409 DUPLICATE_IDENTITY_INACTIVE (profil / id yok); dava 0; reaktivasyon 0', async () => {
    const f = await fixture('f');
    const before = await rows(f.tenantId);
    const res = await post(f.inUser, body(f, 'F', RAW.inactiveTckn, f.inLawyer));
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('DUPLICATE_IDENTITY_INACTIVE');
    const text = JSON.stringify(res.body);
    for (const raw of [RAW.inactiveTckn, RAW.inactiveNotes, f.inactiveClient]) expect(text).not.toContain(raw);
    expect(res.body).not.toHaveProperty('id');
    expect(await rows(f.tenantId)).toEqual(before);
    expect((await clientState(f.inactiveClient)).isActive).toBe(false);
  });

  it('KABUL-9g: yeni kimlik → 201; yeni müvekkil + dava + CaseClient; mevcut kayıtlar değişmez', async () => {
    const f = await fixture('g');
    const before = await rows(f.tenantId);
    const inactiveBefore = await clientState(f.inactiveClient);
    const res = await post(f.outUser, body(f, 'G', RAW.newTckn, f.outLawyer));
    expect(res.status).toBe(201);
    const after = await rows(f.tenantId);
    expect(after).toMatchObject({ clients: before.clients + 1, cases: before.cases + 1, caseClients: before.caseClients + 1 });
    expect(await clientState(f.inactiveClient)).toEqual(inactiveBefore);
  });
});
