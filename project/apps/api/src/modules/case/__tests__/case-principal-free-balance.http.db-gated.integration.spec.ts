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
import { ErrorLogModule } from '../../error-log/error-log.module';
import { MetricsRegistryModule } from '../../metrics-registry/metrics-registry.module';
import { CaseModule } from '../case.module';
import { CASE_HISTORICAL_IMPORT_FLAG } from '../historical-import/case-historical-import';

/**
 * Anaparasız dosya (ilam vekâlet ücreti + yargılama gideri) — GERÇEK okuma yolu: tarihsel aktarım (POST) ile yazılan
 * dosyada GET /interest-engine/case/:id/balance/display ve GET /cases/:id/calculation-summary.
 *
 * Kanıtlanan:
 *  1. Kanonik görünüm para birimini kalemden alır (TRY); kalem tutarları kaynak tutarla görünür; faiz ve anapara null;
 *     durum UNAVAILABLE (NO_PRINCIPAL_BASIS); toplamlar null; MISMATCH / MULTI_CURRENCY kodları YOK.
 *  2. Hesap özeti: eski alanlar aynen; `anaparasizKalemDokumu` açıklayıcı döküm (nihai borç null, faiz BELİRLENEMEDİ);
 *     uyumluluk SCALAR… yerine CANONICAL_DISPLAY_BLOCKED.
 *  3. Anaparalı dosyada bu yol devreye GİRMEZ (döküm alanı yok).
 * GET uçları yazım yapmaz: okuma öncesi / sonrası satır sayıları eşit. Tutarlar SENTETİK.
 */
const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('CASE-PRINCIPAL-FREE-BALANCE DB gate blocked: CI requires an approved TEST_DATABASE_URL.');
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

describeWithDisposableDb('Anaparasız dosya — kanonik görünüm + hesap özeti (HTTP + disposable PostgreSQL)', () => {
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
    const tenantId = `test-ci-pf-${label}-${suffix}`;
    tenantIds.add(tenantId);
    await prisma.tenant.create({ data: { id: tenantId, name: `CI PF ${label}`, slug: tenantId } });
    await prisma.office.create({ data: { tenantId, name: `CI PF ${label} Büro` } });
    const admin = (await prisma.user.create({ data: { tenantId, role: 'ADMIN', email: `pf-admin-${suffix}@example.test`, name: 'Sentetik', surname: 'Admin' } })).id;
    const client = (await prisma.client.create({ data: { tenantId, type: 'COMPANY', name: `PF Sentetik Şirket ${suffix}` } })).id;
    const lawyer = (await prisma.lawyer.create({ data: { tenantId, name: 'Eşlenen', surname: 'Avukat', lawyerRank: 'PARTNER' } })).id;
    return { tenantId, admin, client, lawyer, suffix };
  }

  const yasal = { interestType: 'YASAL', interestTypeCode: 'LEGAL_3095', interestStartDate: '2025-04-02' };
  const vekalet = { type: 'VEKALET_UCRETI', description: 'Sentetik ilam vekâlet ücreti', amount: 3210.5, dueDate: '2025-04-02', ...yasal };
  const yargilama = { type: 'YARGILAMA_GIDERI', description: 'Sentetik ilam yargılama gideri', amount: 654.32, dueDate: '2025-04-02', ...yasal };
  const anapara = { type: 'PRINCIPAL', description: 'Sentetik asıl alacak', amount: 20000, dueDate: '2025-04-02', ...yasal };

  async function importCase(f: Awaited<ReturnType<typeof fixture>>, tag: string, dues: object[]): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/cases/historical-import')
      .set('x-test-user-id', f.admin)
      .send({
        sourceSystem: 'MESE',
        sourceCaseRef: `PF${tag}-${f.suffix}`,
        case: {
          fileNumber: `PF-${tag}-${f.suffix}`,
          type: 'GENERAL_EXECUTION',
          currency: 'TRY',
          startDate: '2026-10-20',
          creditors: [{ id: f.client, type: 'COMPANY', name: 'PF Sentetik Şirket' }],
          debtors: [{ type: 'INDIVIDUAL', name: `Sentetik Borçlu ${tag}` }],
          lawyers: [{ id: f.lawyer, name: 'Eşlenen', surname: 'Avukat' }],
          dues,
        },
      });
    expect(res.status).toBe(201);
    return res.body.id as string;
  }

  async function counts(tenantId: string) {
    const [cases, dues, claimItems, audits, expenseRequests] = await Promise.all([
      prisma.case.count({ where: { tenantId } }),
      prisma.due.count({ where: { case: { tenantId } } }),
      prisma.claimItem.count({ where: { tenantId } }),
      prisma.auditLog.count({ where: { tenantId } }),
      prisma.expenseRequest.count({ where: { tenantId } }),
    ]);
    return { cases, dues, claimItems, audits, expenseRequests };
  }

  it('anaparasız dosya: görünüm kalem tutarları + faiz / anapara null + nihai toplam yok; hesap özetinde açıklayıcı döküm', async () => {
    const f = await fixture('pf');
    const caseId = await importCase(f, 'A', [vekalet, yargilama]);
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    const before = await counts(f.tenantId);

    const view = await request(app.getHttpServer())
      .get(`/interest-engine/case/${caseId}/balance/display`)
      .query({ asOfDate: AS_OF })
      .set('x-test-user-id', f.admin);
    expect(view.status).toBe(200);
    expect(view.body.currency).toBe('TRY');
    expect(view.body.status).toBe('UNAVAILABLE');
    expect(view.body.unavailableReason).toBe('NO_PRINCIPAL_BASIS');
    const bucket = (code: string) => view.body.buckets.find((b: { code: string }) => b.code === code);
    expect(bucket('EXPENSE')).toMatchObject({ amount: 654.32, displayable: true });
    expect(bucket('ATTORNEY_FEE')).toMatchObject({ amount: 3210.5, displayable: true });
    expect(bucket('ACCRUED_INTEREST')).toMatchObject({ amount: null, displayable: false, diagnosticCodes: ['NO_PRINCIPAL_BASIS'] });
    expect(bucket('PRINCIPAL')).toMatchObject({ amount: null, diagnosticCodes: ['NO_PRINCIPAL_BASIS'] });
    expect(Object.values(view.body.totals).every((v) => v === null)).toBe(true);
    expect(view.body.feeProjection).toMatchObject({ status: 'AVAILABLE', authority: 'SOURCE_PROJECTION_ONLY', totalProjectedAmount: 3864.82 });
    const codes = view.body.diagnostics.map((d: { code: string }) => d.code);
    expect(codes).toContain('NO_PRINCIPAL_BASIS');
    expect(codes).not.toContain('MULTI_CURRENCY_DISPLAY_UNSAFE');
    expect(JSON.stringify(view.body.feeProjection)).not.toContain('FEE_PROJECTION_CURRENCY_MISMATCH');

    const summary = await request(app.getHttpServer())
      .get(`/cases/${caseId}/calculation-summary`)
      .query({ date: AS_OF })
      .set('x-test-user-id', f.admin);
    expect(summary.status).toBe(200);
    // Eski alanlar aynen var (değer değişmedi; ekran döküm varken bunları nihai borç diye göstermez)
    expect(typeof summary.body.toplamBorc).toBe('number');
    expect(summary.body.anaparasizKalemDokumu).toMatchObject({
      durum: 'NIHAI_TOPLAM_HESAPLANAMADI',
      otorite: 'ACIKLAYICI_DOKUM',
      gerekce: 'NO_PRINCIPAL_BASIS',
      faizDurumu: 'BELIRLENEMEDI',
      nihaiBorcToplami: null,
      paraBirimleri: [{
        paraBirimi: 'TRY',
        kalemTutarlariToplami: 3864.82,
        kalemler: expect.arrayContaining([
          expect.objectContaining({ kod: 'VEKALET_UCRETI', kalemTuru: 'ATTORNEY_FEE', tutar: 3210.5, faizDurumu: 'BELIRLENEMEDI' }),
          expect.objectContaining({ kod: 'YARGILAMA_GIDERI', kalemTuru: 'YARGILAMA_GIDERI', tutar: 654.32, faizDurumu: 'BELIRLENEMEDI' }),
        ]),
      }],
    });
    const compatCodes = summary.body.canonicalCompatibility.diagnostics.map((d: { code: string }) => d.code);
    expect(compatCodes).not.toContain('SCALAR_CONTRACT_MULTI_CURRENCY_UNAVAILABLE');
    expect(compatCodes).toContain('CANONICAL_DISPLAY_BLOCKED');

    // GET uçları yazım yapmaz
    expect(await counts(f.tenantId)).toEqual(before);
  });

  it('anaparalı dosyada anaparasız yol devreye girmez (döküm alanı yok, NO_PRINCIPAL_BASIS yok)', async () => {
    const f = await fixture('ap');
    const caseId = await importCase(f, 'B', [anapara, vekalet]);
    const view = await request(app.getHttpServer())
      .get(`/interest-engine/case/${caseId}/balance/display`)
      .query({ asOfDate: AS_OF })
      .set('x-test-user-id', f.admin);
    expect(view.status).toBe(200);
    expect(view.body.diagnostics.map((d: { code: string }) => d.code)).not.toContain('NO_PRINCIPAL_BASIS');
    expect(view.body.unavailableReason).not.toBe('NO_PRINCIPAL_BASIS');
    const summary = await request(app.getHttpServer())
      .get(`/cases/${caseId}/calculation-summary`)
      .query({ date: AS_OF })
      .set('x-test-user-id', f.admin);
    expect(summary.status).toBe(200);
    expect(summary.body.anaparasizKalemDokumu).toBeUndefined();
  });
});
