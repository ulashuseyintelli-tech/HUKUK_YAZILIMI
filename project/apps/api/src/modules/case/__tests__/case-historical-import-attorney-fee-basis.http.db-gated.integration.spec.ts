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
import { ATTORNEY_FEE_BASIS_ITEM_TYPE_MISMATCH } from '../../claim-item/attorney-fee-basis';
import { ErrorLogModule } from '../../error-log/error-log.module';
import { MetricsRegistryModule } from '../../metrics-registry/metrics-registry.module';
import { CaseModule } from '../case.module';
import { CASE_HISTORICAL_IMPORT_FLAG } from '../historical-import/case-historical-import';

/**
 * Vekâlet ücretinin hukuki kaynağı — dosya açılış / tarihsel aktarım yolu (owner K1, 13.11.2026).
 * GERÇEK HTTP (POST /cases/historical-import, GET /cases/:id/calculation-summary) + disposable PostgreSQL (yeni migration).
 *
 * Kanıtlanan:
 *  1. VEKALET_UCRETI Due'sundaki açık `attorneyFeeBasis` üretilen ATTORNEY_FEE kalemine taşınır; döküm ILAM etiketiyle gösterir.
 *  2. Değer verilmezse kalem NULL kalır; açıklama "İLAM VEKALET ÜCRETİ" olsa da döküm "türü belirtilmemiş" (BILINMIYOR) der.
 *  3. Vekâlet ücreti dışı Due'da değer → 400, YAZIMDAN ÖNCE: dosya / Due / kalem / denetim sayısı değişmez.
 *  4. Kaynak hesabı değiştirmez: kalem tutarları, faiz durumu ve nihai toplam (null) aynı.
 * Tutarlar SENTETİK.
 */
const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('CASE-HISTORICAL-IMPORT-ATTORNEY-FEE-BASIS DB gate blocked: CI requires an approved TEST_DATABASE_URL.');
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

describeWithDisposableDb('attorneyFeeBasis — POST /cases/historical-import + hesap özeti dökümü (HTTP + disposable PostgreSQL)', () => {
  jest.setTimeout(120_000);

  let prisma: PrismaClient;
  let app: INestApplication;
  const tenantIds = new Set<string>();
  const savedFlag = process.env[CASE_HISTORICAL_IMPORT_FLAG];
  const AS_OF = '2026-11-01';

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
    for (const tenantId of tenantIds) {
      await prisma.auditLog.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await prisma.tenant.deleteMany({ where: { id: tenantId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  async function fixture(label: string) {
    const suffix = randomUUID().slice(0, 8);
    const tenantId = `test-ci-afbi-${label}-${suffix}`;
    tenantIds.add(tenantId);
    await prisma.tenant.create({ data: { id: tenantId, name: `CI AFBI ${label}`, slug: tenantId } });
    await prisma.office.create({ data: { tenantId, name: `CI AFBI ${label} Büro` } });
    const admin = (await prisma.user.create({ data: { tenantId, role: 'ADMIN', email: `afbi-admin-${suffix}@example.test`, name: 'Sentetik', surname: 'Admin' } })).id;
    const client = (await prisma.client.create({ data: { tenantId, type: 'COMPANY', name: `AFBI Sentetik Şirket ${suffix}` } })).id;
    const lawyer = (await prisma.lawyer.create({ data: { tenantId, name: 'Eşlenen', surname: 'Avukat', lawyerRank: 'PARTNER' } })).id;
    return { tenantId, admin, client, lawyer, suffix };
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;

  const yasal = { interestType: 'YASAL', interestTypeCode: 'LEGAL_3095', interestStartDate: '2025-04-02' };
  const vekalet = { type: 'VEKALET_UCRETI', description: 'İLAM VEKALET ÜCRETİ', amount: 3210.5, dueDate: '2025-04-02', ...yasal };
  const yargilama = { type: 'YARGILAMA_GIDERI', description: 'Sentetik ilam yargılama gideri', amount: 654.32, dueDate: '2025-04-02', ...yasal };

  const postImport = (f: Fixture, tag: string, dues: object[]) =>
    request(app.getHttpServer())
      .post('/cases/historical-import')
      .set('x-test-user-id', f.admin)
      .send({
        sourceSystem: 'MESE',
        sourceCaseRef: `AFBI${tag}-${f.suffix}`,
        case: {
          fileNumber: `AFBI-${tag}-${f.suffix}`,
          type: 'GENERAL_EXECUTION',
          currency: 'TRY',
          startDate: '2026-10-20',
          creditors: [{ id: f.client, type: 'COMPANY', name: 'AFBI Sentetik Şirket' }],
          debtors: [{ type: 'INDIVIDUAL', name: `Sentetik Borçlu ${tag}` }],
          lawyers: [{ id: f.lawyer, name: 'Eşlenen', surname: 'Avukat' }],
          dues,
        },
      });
  const items = (caseId: string) =>
    prisma.claimItem.findMany({ where: { caseId }, orderBy: { itemType: 'asc' }, select: { itemType: true, attorneyFeeBasis: true, interestAccrualStatus: true } });
  const summary = (f: Fixture, caseId: string) =>
    request(app.getHttpServer()).get(`/cases/${caseId}/calculation-summary`).query({ date: AS_OF }).set('x-test-user-id', f.admin);
  async function counts(tenantId: string) {
    const [cases, dues, claimItems, audits] = await Promise.all([
      prisma.case.count({ where: { tenantId } }),
      prisma.due.count({ where: { case: { tenantId } } }),
      prisma.claimItem.count({ where: { tenantId } }),
      prisma.auditLog.count({ where: { tenantId } }),
    ]);
    return { cases, dues, claimItems, audits };
  }

  it('açık JUDGMENT_AWARDED → ATTORNEY_FEE kalemine taşınır; döküm ILAM; yargılama gideri alan taşımaz', async () => {
    const f = await fixture('ilam');
    const res = await postImport(f, 'I1', [{ ...vekalet, attorneyFeeBasis: 'JUDGMENT_AWARDED' }, yargilama]);
    expect(res.status).toBe(201);
    const caseId = res.body.id as string;
    expect(await items(caseId)).toEqual([
      { itemType: 'ATTORNEY_FEE', attorneyFeeBasis: 'JUDGMENT_AWARDED', interestAccrualStatus: 'UNKNOWN' },
      { itemType: 'YARGILAMA_GIDERI', attorneyFeeBasis: null, interestAccrualStatus: 'UNKNOWN' },
    ]);

    const s = await summary(f, caseId);
    expect(s.status).toBe(200);
    const kalemler = s.body.anaparasizKalemDokumu.paraBirimleri[0].kalemler as Array<Record<string, unknown>>;
    expect(kalemler.find((k) => k.kalemTuru === 'ATTORNEY_FEE')).toMatchObject({
      vekaletUcretiKaynagi: 'ILAM',
      etiket: 'İlam Vekâlet Ücreti (alacak kalemi) — İLAM VEKALET ÜCRETİ',
      tutar: 3210.5,
      faizDurumu: 'BELIRLENEMEDI',
    });
    expect(kalemler.find((k) => k.kalemTuru === 'YARGILAMA_GIDERI')).not.toHaveProperty('vekaletUcretiKaynagi');
    expect(s.body.anaparasizKalemDokumu).toMatchObject({ nihaiBorcToplami: null, faizDurumu: 'BELIRLENEMEDI' });
    expect(s.body.anaparasizKalemDokumu.paraBirimleri[0].kalemTutarlariToplami).toBe(3864.82);
  });

  it('değer verilmezse NULL (= bilinmiyor): açıklama "İLAM VEKALET ÜCRETİ" olsa da çıkarım yok; döküm BILINMIYOR', async () => {
    const f = await fixture('bos');
    const res = await postImport(f, 'B1', [vekalet, yargilama]);
    expect(res.status).toBe(201);
    const caseId = res.body.id as string;
    expect((await items(caseId)).map((i) => i.attorneyFeeBasis)).toEqual([null, null]);
    const kalemler = (await summary(f, caseId)).body.anaparasizKalemDokumu.paraBirimleri[0].kalemler as Array<Record<string, unknown>>;
    expect(kalemler.find((k) => k.kalemTuru === 'ATTORNEY_FEE')).toMatchObject({
      vekaletUcretiKaynagi: 'BILINMIYOR',
      etiket: 'Vekâlet Ücreti (alacak kalemi; türü belirtilmemiş) — İLAM VEKALET ÜCRETİ',
    });
  });

  it('vekâlet ücreti dışı Due + kaynak → 400 ATTORNEY_FEE_BASIS_ITEM_TYPE_MISMATCH; yazımdan önce reddedilir', async () => {
    const f = await fixture('ret');
    const before = await counts(f.tenantId);
    const res = await postImport(f, 'R1', [vekalet, { ...yargilama, attorneyFeeBasis: 'JUDGMENT_AWARDED' }]);
    expect(res.status).toBe(400);
    expect(res.body).toEqual(expect.objectContaining({ code: ATTORNEY_FEE_BASIS_ITEM_TYPE_MISMATCH }));
    expect(await counts(f.tenantId)).toEqual(before);

    const unknownValue = await postImport(f, 'R2', [{ ...vekalet, attorneyFeeBasis: 'ILAM' }]);
    expect(unknownValue.status).toBe(400);
    expect(await counts(f.tenantId)).toEqual(before);
  });
});
