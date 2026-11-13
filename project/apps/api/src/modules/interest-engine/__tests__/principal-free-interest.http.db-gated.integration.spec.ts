// CaseModule grafiği `pdf-poppler`'ı yükler; paket Linux'ta yükleme anında process.exit(1) verir
// (CI emsali: case-historical-import.http.db-gated.integration.spec.ts).
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
import { ClientInfoRequestService } from '../../address-discovery/client-info-request.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CaseModule } from '../../case/case.module';
import { CASE_HISTORICAL_IMPORT_FLAG } from '../../case/historical-import/case-historical-import';
import { ErrorLogModule } from '../../error-log/error-log.module';
import { MetricsRegistryModule } from '../../metrics-registry/metrics-registry.module';

/**
 * D1 — anaparasız dosyada faizi AÇIKÇA belirlenmiş ilam kalemleri (owner GO-COMPLETE 13.11.2026).
 * GERÇEK HTTP (GET /cases/:id/calculation-summary, GET /interest-engine/case/:id/balance/display) + disposable PostgreSQL
 * (gerçek oran tablosu `rate_schedule`, büro anahtarı) + gerçek motor.
 *
 * Kanıtlanan:
 *  1. Faiz durumu / türü / başlangıcı / dayanağı kayıtlı kalemde faiz kalem bazında (takip öncesi / sonrası) hesaplanır;
 *     "kalem + faiz" açıklayıcıdır, nihai borç null, kanonik otorite ve toplamlar değişmez (sahte anapara yok).
 *  2. Faiz durumu bilinmeyen kalem (aktarımdan tür + tarih dolu olsa da) hesaplanmaz; toplamlar null (sıfır değil).
 *  3. Oran tablosu boşsa faiz hesaplanmaz (RATE_COVERAGE_MISSING); sıfır ya da komşu oran yok.
 *  4. GET uçları yazım yapmaz.
 * Tutarlar ve oran SENTETİK. Kalemlerin ACCRUES durumu, onaylı kalem güncellemesinin (D2 testinde HTTP ile kanıtlı)
 * sonucunu temsil etmek için doğrudan yazılır.
 */
const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('PRINCIPAL-FREE-INTEREST DB gate blocked: CI requires an approved TEST_DATABASE_URL.');
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;

const PRODUCTION_VALIDATION_OPTIONS = { whitelist: true, forbidNonWhitelisted: true, transform: true } as const;

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

describeWithDisposableDb('D1 anaparasız açıklayıcı faiz — HTTP + gerçek oran tablosu + disposable PostgreSQL', () => {
  jest.setTimeout(120_000);

  let prisma: PrismaClient;
  let app: INestApplication;
  const tenantIds = new Set<string>();
  const officeIds = new Set<string>();
  const savedFlag = process.env[CASE_HISTORICAL_IMPORT_FLAG];
  const AS_OF = '2026-11-01';
  const TAKIP = '2026-10-20';
  const BASLANGIC = '2025-04-02';
  const ORAN = 0.24;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await prisma.$connect();
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), StorageModule, ErrorLogModule, MetricsRegistryModule, CaseModule],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(new DbUserIdentityGuard(() => prisma))
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe(PRODUCTION_VALIDATION_OPTIONS));
    await app.init();
    jest.spyOn(app.get(ClientInfoRequestService), 'sendAutoRequestOnCaseCreate').mockResolvedValue(undefined);
  });

  beforeEach(() => {
    process.env[CASE_HISTORICAL_IMPORT_FLAG] = 'true';
  });

  afterEach(() => {
    if (savedFlag === undefined) delete process.env[CASE_HISTORICAL_IMPORT_FLAG];
    else process.env[CASE_HISTORICAL_IMPORT_FLAG] = savedFlag;
  });

  afterAll(async () => {
    await app?.close();
    await prisma.rateSchedule.deleteMany({ where: { tenantId: { in: [...officeIds] } } }).catch(() => undefined);
    for (const tenantId of tenantIds) {
      await prisma.auditLog.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await prisma.tenant.deleteMany({ where: { id: tenantId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  async function fixture(label: string, withRate = true) {
    const suffix = randomUUID().slice(0, 8);
    const tenantId = `test-ci-pfi-${label}-${suffix}`;
    tenantIds.add(tenantId);
    await prisma.tenant.create({ data: { id: tenantId, name: `CI PFI ${label}`, slug: tenantId } });
    const office = await prisma.office.create({ data: { tenantId, name: `CI PFI ${label} Büro` } });
    officeIds.add(office.id);
    if (withRate) {
      await prisma.rateSchedule.create({
        data: {
          tenantId: office.id,
          interestType: 'LEGAL_3095',
          validFrom: new Date('2025-01-01T00:00:00.000Z'),
          validTo: null,
          annualRate: ORAN,
          source: 'MANUAL',
          sourceRef: 'sentetik test orani',
          versionHash: `pfi-${suffix}`,
        },
      });
    }
    const admin = (await prisma.user.create({ data: { tenantId, role: 'ADMIN', email: `pfi-admin-${suffix}@example.test`, name: 'Sentetik', surname: 'Admin' } })).id;
    const client = (await prisma.client.create({ data: { tenantId, type: 'COMPANY', name: `PFI Sentetik Şirket ${suffix}` } })).id;
    const lawyer = (await prisma.lawyer.create({ data: { tenantId, name: 'Eşlenen', surname: 'Avukat', lawyerRank: 'PARTNER' } })).id;
    return { tenantId, admin, client, lawyer, suffix };
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;

  const yasal = { interestType: 'YASAL', interestTypeCode: 'LEGAL_3095', interestStartDate: BASLANGIC };
  const vekalet = { type: 'VEKALET_UCRETI', description: 'Sentetik ilam vekâlet ücreti', amount: 3210.5, dueDate: BASLANGIC, attorneyFeeBasis: 'JUDGMENT_AWARDED', ...yasal };
  const yargilama = { type: 'YARGILAMA_GIDERI', description: 'Sentetik ilam yargılama gideri', amount: 654.32, dueDate: BASLANGIC, ...yasal };

  async function importCase(f: Fixture, tag: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/cases/historical-import')
      .set('x-test-user-id', f.admin)
      .send({
        sourceSystem: 'MESE',
        sourceCaseRef: `PFI${tag}-${f.suffix}`,
        case: {
          fileNumber: `PFI-${tag}-${f.suffix}`,
          type: 'GENERAL_EXECUTION',
          currency: 'TRY',
          startDate: TAKIP,
          creditors: [{ id: f.client, type: 'COMPANY', name: 'PFI Sentetik Şirket' }],
          debtors: [{ type: 'INDIVIDUAL', name: `Sentetik Borçlu ${tag}` }],
          lawyers: [{ id: f.lawyer, name: 'Eşlenen', surname: 'Avukat' }],
          dues: [vekalet, yargilama],
        },
      });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  /** Onaylı kalem güncellemesinin sonucu: faiz durumu, türü, başlangıcı ve dayanağı açıkça kayıtlı. */
  async function belirle(caseId: string, itemType: 'ATTORNEY_FEE' | 'YARGILAMA_GIDERI') {
    await prisma.claimItem.updateMany({
      where: { caseId, itemType },
      data: { interestAccrualStatus: 'ACCRUES', interestTypeCode: 'LEGAL_3095', interestType: 'YASAL', interestStartDate: new Date(`${BASLANGIC}T00:00:00.000Z`), interestStartDateProvenance: 'JUDGMENT_DATE' },
    });
  }

  const summary = (f: Fixture, caseId: string) =>
    request(app.getHttpServer()).get(`/cases/${caseId}/calculation-summary`).query({ date: AS_OF }).set('x-test-user-id', f.admin);
  const balanceDisplay = (f: Fixture, caseId: string) =>
    request(app.getHttpServer()).get(`/interest-engine/case/${caseId}/balance/display`).query({ asOfDate: AS_OF }).set('x-test-user-id', f.admin);
  const gun = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
  const yakinMi = (gercek: unknown, tutar: number, gunSayisi: number) =>
    typeof gercek === 'number' && Math.abs(gercek - (tutar * ORAN * gunSayisi) / 365) <= (tutar * ORAN) / 365 + 0.01;
  async function counts(tenantId: string) {
    const [claimItems, audits, cases] = await Promise.all([
      prisma.claimItem.count({ where: { tenantId } }),
      prisma.auditLog.count({ where: { tenantId } }),
      prisma.case.count({ where: { tenantId } }),
    ]);
    return { claimItems, audits, cases };
  }

  it('iki belirlenmiş kalem → kalem bazında takip öncesi / sonrası faiz; kalem + faiz açıklayıcı; nihai borç ve kanonik toplamlar null', async () => {
    const f = await fixture('iki');
    const caseId = await importCase(f, 'A');
    await belirle(caseId, 'ATTORNEY_FEE');
    await belirle(caseId, 'YARGILAMA_GIDERI');

    const before = await counts(f.tenantId);
    const s = await summary(f, caseId);
    expect(s.status).toBe(200);
    const dokum = s.body.anaparasizKalemDokumu;
    expect(dokum).toMatchObject({ durum: 'NIHAI_TOPLAM_HESAPLANAMADI', otorite: 'ACIKLAYICI_DOKUM', faizDurumu: 'HESAPLANDI', nihaiBorcToplami: null });
    const pb = dokum.paraBirimleri[0];
    const vu = pb.kalemler.find((k: any) => k.kalemTuru === 'ATTORNEY_FEE');
    const yg = pb.kalemler.find((k: any) => k.kalemTuru === 'YARGILAMA_GIDERI');
    expect(vu).toMatchObject({ faizDurumu: 'HESAPLANDI', vekaletUcretiKaynagi: 'ILAM', faiz: { baslangic: BASLANGIC, baslangicDayanagi: 'JUDGMENT_DATE', faizTuru: 'LEGAL_3095' } });
    expect(yakinMi(vu.faiz.takipOncesi, 3210.5, gun(BASLANGIC, TAKIP))).toBe(true);
    expect(yakinMi(vu.faiz.takipSonrasi, 3210.5, gun(TAKIP, AS_OF))).toBe(true);
    expect(yakinMi(yg.faiz.takipOncesi, 654.32, gun(BASLANGIC, TAKIP))).toBe(true);
    expect(yakinMi(yg.faiz.takipSonrasi, 654.32, gun(TAKIP, AS_OF))).toBe(true);
    const c = (n: number) => Math.round(n * 100);
    expect(c(pb.faizToplami)).toBe(c(vu.faiz.toplam) + c(yg.faiz.toplam));
    expect(c(pb.kalemVeFaizToplami)).toBe(c(3864.82) + c(pb.faizToplami));
    expect(pb.kalemTutarlariToplami).toBe(3864.82);

    // Kanonik görünüm: otorite yükselmez, anapara / toplamlar null; faiz yalnız gözlemde (açıklayıcı)
    const view = await balanceDisplay(f, caseId);
    expect(view.status).toBe(200);
    expect(view.body.authority).not.toBe('PRIMARY');
    expect(view.body.status).toBe('UNAVAILABLE');
    expect(Object.values(view.body.totals).every((v) => v === null)).toBe(true);
    expect(view.body.buckets.find((b: any) => b.code === 'PRINCIPAL')).toMatchObject({ amount: null });
    const tani = view.body.diagnostics.find((d: any) => d.code === 'NO_PRINCIPAL_BASIS');
    expect(tani.details.observations.every((o: any) => o.interestStatus === 'COMPUTED' && typeof o.accruedInterest === 'number')).toBe(true);

    // GET uçları yazım yapmaz; kalemler ACCRUES dışında değişmedi
    expect(await counts(f.tenantId)).toEqual(before);
  });

  it('faiz durumu bilinmeyen kalem (aktarımdan tür + tarih dolu) hesaplanmaz → toplamlar null, sıfır değil', async () => {
    const f = await fixture('bir');
    const caseId = await importCase(f, 'B');
    await belirle(caseId, 'ATTORNEY_FEE');
    const pb = (await summary(f, caseId)).body.anaparasizKalemDokumu.paraBirimleri[0];
    expect(pb.kalemler.find((k: any) => k.kalemTuru === 'ATTORNEY_FEE').faizDurumu).toBe('HESAPLANDI');
    const yg = pb.kalemler.find((k: any) => k.kalemTuru === 'YARGILAMA_GIDERI');
    expect(yg).toMatchObject({ faizDurumu: 'BELIRLENEMEDI', faizNedeni: 'ACCRUAL_STATUS_UNKNOWN' });
    expect(yg).not.toHaveProperty('faiz');
    expect(pb).toMatchObject({ faizToplami: null, takipOncesiFaizToplami: null, takipSonrasiFaizToplami: null, kalemVeFaizToplami: null });
  });

  it('oran tablosu boş → RATE_COVERAGE_MISSING; faiz hesaplanmaz, sıfır ya da komşu oran yok', async () => {
    const f = await fixture('oransiz', false);
    const caseId = await importCase(f, 'C');
    await belirle(caseId, 'ATTORNEY_FEE');
    await belirle(caseId, 'YARGILAMA_GIDERI');
    const dokum = (await summary(f, caseId)).body.anaparasizKalemDokumu;
    expect(dokum.faizDurumu).toBe('HESAPLANMADI');
    for (const k of dokum.paraBirimleri[0].kalemler) {
      expect(k).toMatchObject({ faizDurumu: 'HESAPLANMADI', faizNedeni: 'RATE_COVERAGE_MISSING' });
      expect(k).not.toHaveProperty('faiz');
    }
    expect(dokum.paraBirimleri[0].kalemVeFaizToplami).toBeNull();
  });
});
