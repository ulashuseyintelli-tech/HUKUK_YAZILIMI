// @db-gated: CI'da approved TEST_DATABASE_URL zorunludur; yerelde değişken yoksa takım atlanır.
// (CI emsali: case-opening-claim-requests.http.db-gated.integration.spec.ts).
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
import { LawyerModule } from '../../lawyer/lawyer.module';
import { MetricsRegistryModule } from '../../metrics-registry/metrics-registry.module';
import { CaseModule } from '../case.module';

/**
 * YENİ DOSYA SİHİRBAZI — DOSYA EKİBİ AVUKAT ADAYLARI (owner talimatı 2026-11-18).
 *
 * Yeniden üretilen sorun: USER rolündeki, yönetici / delege olmayan avukat `GET /lawyers` çağrısında 403 alır (büro
 * yönetimi kapısı, F01) → sihirbazda avukat listesi boş kalır, "Avukatlar" yüklenemedi bandı çıkar. Oysa aynı kullanıcı
 * dosya açabilir (`POST /cases` yalnız kimlik + yazma kapısındadır).
 *
 * Çözüm EN DAR erişimdir: `GET /lawyers` ve kapısı DEĞİŞMEZ; `GET /cases/lawyer-candidates` yalnız seçim alanlarını,
 * yalnız aynı büronun etkin avukatları için döndürür. GERÇEK HTTP + gerçek F01 kapısı + disposable PostgreSQL.
 * Adlar ve numaralar SENTETİKTİR.
 */
const TEST_DB_URL = resolveTestDatabaseUrl();
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('CASE-LAWYER-CANDIDATES DB gate blocked: CI requires an approved TEST_DATABASE_URL.');
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;

/** JwtStrategy → validateUser sözleşmesi: req.user DB'den okunan tam User satırı; pasif kullanıcı reddedilir. */
class DbUserIdentityGuard implements CanActivate {
  constructor(private readonly db: () => PrismaClient) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const id = req.headers['x-test-user-id'];
    if (!id) throw new UnauthorizedException();
    const user = await this.db().user.findUnique({ where: { id: String(id) }, include: { tenant: true } });
    if (!user || !user.isActive) throw new UnauthorizedException();
    req.user = user;
    return true;
  }
}

const CANDIDATE_KEYS = ['barCity', 'barNumber', 'canSign', 'id', 'isActive', 'isDefaultForNewCases', 'lawyerRank', 'name', 'surname', 'title'];

describeWithDisposableDb('Yeni dosya sihirbazı — GET /cases/lawyer-candidates (HTTP + disposable PostgreSQL)', () => {
  jest.setTimeout(120_000);

  let prisma: PrismaClient;
  let app: INestApplication;
  const tenantIds = new Set<string>();

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await prisma.$connect();
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), StorageModule, ErrorLogModule, MetricsRegistryModule, CaseModule, LawyerModule],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(new DbUserIdentityGuard(() => prisma))
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    for (const tenantId of tenantIds) await prisma.auditLog.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  async function fixture(label: string) {
    const suffix = randomUUID().slice(0, 8);
    const tenantId = `test-ci-avukat-aday-${label}-${suffix}`;
    tenantIds.add(tenantId);
    await prisma.tenant.create({ data: { id: tenantId, name: `CI AVUKAT ADAY ${label}`, slug: tenantId } });
    const office = await prisma.office.create({ data: { tenantId, name: `CI AVUKAT ADAY ${label} Büro` } });
    const user = (role: 'ADMIN' | 'USER' | 'VIEWER', tag: string) =>
      prisma.user.create({ data: { tenantId, email: `${tag}-${suffix}@example.test`, name: 'Sentetik', surname: tag, role } });
    const admin = await user('ADMIN', 'yonetici');
    const associate = await user('USER', 'avukat');
    const partner = await prisma.lawyer.create({
      data: {
        tenantId,
        officeId: office.id,
        userId: admin.id,
        name: 'Sentetik',
        surname: 'Ortak',
        lawyerRank: 'PARTNER',
        tckn: '10000000146',
        barNumber: '90001',
        barCity: 'Sentetik Baro',
        canSign: true,
        isDefaultForNewCases: true,
        sortOrder: 1,
      } as never,
    });
    const self = await prisma.lawyer.create({
      data: {
        tenantId,
        officeId: office.id,
        userId: associate.id,
        name: 'Sentetik',
        surname: 'Avukat',
        lawyerRank: 'LAWYER',
        tckn: '10000000078',
        defaultPermissions: { canEditFinance: true },
        sortOrder: 2,
      } as never,
    });
    const passive = await prisma.lawyer.create({
      data: { tenantId, officeId: office.id, name: 'Sentetik', surname: 'Pasif', lawyerRank: 'LAWYER', isActive: false, sortOrder: 3 } as never,
    });
    return { tenantId, admin: admin.id, associate: associate.id, partnerId: partner.id, selfId: self.id, passiveId: passive.id };
  }

  const http = () => request(app.getHttpServer());
  const as = (userId: string, path: string) => http().get(path).set('x-test-user-id', userId);

  it('yeniden üretim: yönetici / delege olmayan USER avukat GET /lawyers çağrısında 403 alır (büro yönetimi kapısı DEĞİŞMEDİ)', async () => {
    const f = await fixture('uretim');
    const denied = await as(f.associate, '/lawyers');
    expect(denied.status).toBe(403);
    expect(JSON.stringify(denied.body)).toContain('OFFICE_F01_AUTHORIZATION_REQUIRED');
    // Yönetici için liste eskisi gibi açık.
    const allowed = await as(f.admin, '/lawyers');
    expect(allowed.status).toBe(200);
    expect(Array.isArray(allowed.body)).toBe(true);
  });

  it('aynı kullanıcı dar aday ucunu okuyabilir: yalnız seçim alanları, yalnız kendi bürosunun ETKİN avukatları', async () => {
    const f = await fixture('dar');
    const other = await fixture('baska-buro');
    const res = await as(f.associate, '/cases/lawyer-candidates');
    expect(res.status).toBe(200);
    const data = res.body.data as Array<Record<string, unknown>>;
    expect(data.map((row) => row.id)).toEqual([f.partnerId, f.selfId]);
    for (const row of data) expect(Object.keys(row).sort()).toEqual(CANDIDATE_KEYS);
    expect(data[0]).toMatchObject({
      name: 'Sentetik',
      surname: 'Ortak',
      lawyerRank: 'PARTNER',
      barNumber: '90001',
      barCity: 'Sentetik Baro',
      canSign: true,
      isDefaultForNewCases: true,
      isActive: true,
    });
    // Kimlik / iletişim / yetki alanı ve hesap bağı yanıtın hiçbir yerinde yok; pasif avukat ve başka büro da yok.
    const raw = JSON.stringify(res.body);
    for (const leaked of ['tckn', '10000000146', '10000000078', 'defaultPermissions', 'canEditFinance', 'userId', 'email', 'phone', 'canApproveOfficeActions', f.passiveId, other.partnerId, other.selfId]) {
      expect(raw).not.toContain(leaked);
    }
  });

  it('kimliksiz istek 401; yönetici de aynı dar listeyi görür (uç yetki genişletmez)', async () => {
    const f = await fixture('kimlik');
    expect((await http().get('/cases/lawyer-candidates')).status).toBe(401);
    const res = await as(f.admin, '/cases/lawyer-candidates');
    expect(res.status).toBe(200);
    for (const row of res.body.data as Array<Record<string, unknown>>) expect(Object.keys(row).sort()).toEqual(CANDIDATE_KEYS);
  });
});
