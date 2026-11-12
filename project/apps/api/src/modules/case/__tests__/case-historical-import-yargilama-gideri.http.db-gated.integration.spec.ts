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
import { sumClaimSummaryTotals } from '../../claim-item/claim-summary-currency';
import { ErrorLogModule } from '../../error-log/error-log.module';
import { ExpenseRequestService } from '../../expense-request/expense-request.service';
import { classifyClaimItemType } from '../../interest-engine/classification/claim-item-classifier';
import { AncillaryType } from '../../interest-engine/types/domain.types';
import { MetricsRegistryModule } from '../../metrics-registry/metrics-registry.module';
import { CaseModule } from '../case.module';
import { CASE_HISTORICAL_IMPORT_FLAG, HISTORICAL_IMPORT_ALREADY_EXISTS } from '../historical-import/case-historical-import';

/**
 * Yargılama Gideri türü — tarihsel dosya aktarımı (owner 12.11.2026 GO-COMPLETE "P02 yargılama gideri temsil engelini gider").
 * GERÇEK HTTP (POST /cases/historical-import) + disposable PostgreSQL (yeni enum değerini içeren migration uygulanmış şema).
 *
 * Kanıtlanan:
 *  1. Yargılama gideri Due'da YARGILAMA_GIDERI, ClaimItem'da YARGILAMA_GIDERI olarak yazılır — EXPENSE / tebligat masrafı DEĞİL;
 *     motor masraf kademesinde kendi yardımcı türüyle sınıflar; hesap özetinde masraf toplamına TEK KEZ girer.
 *  2. Masraf kayıtlarında çift sayım yok: masraf talebi, muhasebe günlüğü OLUŞMAZ (tutar yalnız alacak kaleminde).
 *  3. Faiz kararı türden çıkarılmaz: açık değer yoksa UNKNOWN; verilen faiz türü / başlangıcı / açık durum AYNEN korunur.
 *  4. Tekrar istek → 409; dosya, Due, kalem, masraf talebi, denetim sayısı değişmez.
 *  5. Eski tür değişmedi: EXPENSE Due → EXPENSE kalemi (motor TEBLIGAT_MASRAFI); önceden yazılmış EXPENSE kalemi dönüştürülmez.
 * Tutarlar SENTETİK (gerçek dosya değeri değil).
 */
const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('CASE-HISTORICAL-IMPORT-YARGILAMA DB gate blocked: CI requires an approved TEST_DATABASE_URL.');
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;

const PRODUCTION_VALIDATION_OPTIONS = { whitelist: true, forbidNonWhitelisted: true, transform: true } as const;

/** JwtStrategy → validateUser sözleşmesi: req.user DB'den okunan tam User satırı; pasif kullanıcı reddedilir. */
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

interface Fixture {
  tenantId: string;
  admin: string;
  client: string;
  lawyer: string;
  fileNo: (tag: string) => string;
  sourceRef: (tag: string) => string;
}

describeWithDisposableDb('Yargılama Gideri türü — POST /cases/historical-import (HTTP + disposable PostgreSQL)', () => {
  jest.setTimeout(120_000);

  let prisma: PrismaClient;
  let app: INestApplication;
  let openingExpenseSpy: jest.SpyInstance;
  const tenantIds = new Set<string>();
  const savedFlag = process.env[CASE_HISTORICAL_IMPORT_FLAG];

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
    openingExpenseSpy = jest.spyOn(app.get(ExpenseRequestService), 'createOpeningExpenseSet');
  });

  beforeEach(() => {
    process.env[CASE_HISTORICAL_IMPORT_FLAG] = 'true';
    openingExpenseSpy.mockClear();
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

  async function fixture(label: string): Promise<Fixture> {
    const suffix = randomUUID().slice(0, 8);
    const tenantId = `test-ci-yg-${label}-${suffix}`;
    tenantIds.add(tenantId);
    await prisma.tenant.create({ data: { id: tenantId, name: `CI YG ${label}`, slug: tenantId } });
    await prisma.office.create({ data: { tenantId, name: `CI YG ${label} Büro` } });
    const admin = (await prisma.user.create({ data: { tenantId, role: 'ADMIN', email: `yg-admin-${suffix}@example.test`, name: 'Sentetik', surname: 'Admin' } })).id;
    const client = (await prisma.client.create({ data: { tenantId, type: 'COMPANY', name: `YG Sentetik Şirket ${suffix}` } })).id;
    const lawyer = (await prisma.lawyer.create({ data: { tenantId, name: 'Eşlenen', surname: 'Avukat', lawyerRank: 'PARTNER' } })).id;
    return { tenantId, admin, client, lawyer, fileNo: (tag) => `YG-${tag}-${suffix}`, sourceRef: (tag) => `YG${tag}-${suffix}` };
  }

  type DueIn = Record<string, unknown>;
  const yasal = { interestType: 'YASAL', interestTypeCode: 'LEGAL_3095', interestStartDate: '2025-03-14' };
  const vekalet: DueIn = { type: 'VEKALET_UCRETI', description: 'Sentetik ilam vekâlet ücreti', amount: 12500, dueDate: '2025-03-14', ...yasal };
  const yargilama: DueIn = { type: 'YARGILAMA_GIDERI', description: 'Sentetik ilam yargılama gideri', amount: 415, dueDate: '2025-03-14', ...yasal };
  const gider: DueIn = { type: 'EXPENSE', description: 'Sentetik gider', amount: 77, dueDate: '2025-03-14', ...yasal };

  const importBody = (f: Fixture, tag: string, dues: DueIn[]) => ({
    sourceSystem: 'MESE',
    sourceCaseRef: f.sourceRef(tag),
    case: {
      fileNumber: f.fileNo(tag),
      type: 'GENERAL_EXECUTION',
      currency: 'TRY',
      startDate: '2026-10-20',
      creditors: [{ id: f.client, type: 'COMPANY', name: 'YG Sentetik Şirket' }],
      debtors: [{ type: 'INDIVIDUAL', name: `Sentetik Borçlu ${tag}` }],
      lawyers: [{ id: f.lawyer, name: 'Eşlenen', surname: 'Avukat' }],
      dues,
    },
  });
  const postImport = (userId: string, payload: object) =>
    request(app.getHttpServer()).post('/cases/historical-import').set('x-test-user-id', userId).send(payload);

  async function rows(tenantId: string) {
    const [cases, dues, claimItems, expenseRequests, journal, audits] = await Promise.all([
      prisma.case.count({ where: { tenantId } }),
      prisma.due.count({ where: { case: { tenantId } } }),
      prisma.claimItem.count({ where: { tenantId } }),
      prisma.expenseRequest.count({ where: { tenantId } }),
      prisma.accountingJournalEntry.count({ where: { tenantId } }),
      prisma.auditLog.count({ where: { tenantId } }),
    ]);
    return { cases, dues, claimItems, expenseRequests, journal, audits };
  }
  const items = (caseId: string) =>
    prisma.claimItem.findMany({
      where: { caseId },
      orderBy: { itemType: 'asc' },
      select: { itemType: true, amount: true, currency: true, description: true, interestTypeCode: true, interestStartDate: true, interestAccrualStatus: true },
    });

  it('yargılama gideri YARGILAMA_GIDERI türünde yazılır (EXPENSE / tebligat değil); masraf kaydı yok; faiz durumu varsayılmaz', async () => {
    const f = await fixture('yaz');
    const res = await postImport(f.admin, importBody(f, 'Y1', [vekalet, yargilama]));
    expect(res.status).toBe(201);
    const caseId = res.body.id as string;

    const dueTypes = (await prisma.due.findMany({ where: { caseId }, select: { type: true } })).map((d) => d.type).sort();
    expect(dueTypes).toEqual(['VEKALET_UCRETI', 'YARGILAMA_GIDERI']);

    const saved = await items(caseId);
    expect(saved.map((i) => i.itemType)).toEqual(['ATTORNEY_FEE', 'YARGILAMA_GIDERI']);
    const yg = saved.find((i) => i.itemType === 'YARGILAMA_GIDERI')!;
    expect(Number(yg.amount)).toBe(415);
    expect(yg.description).toBe('Sentetik ilam yargılama gideri');
    // Verilen faiz türü / başlangıcı aynen; açık faiz durumu verilmediği için UNKNOWN (türden karar çıkarılmaz).
    expect(yg.interestTypeCode).toBe('LEGAL_3095');
    expect(yg.interestStartDate?.toISOString().slice(0, 10)).toBe('2025-03-14');
    expect(yg.interestAccrualStatus).toBe('UNKNOWN');

    // Motor: masraf kademesi, kendi yardımcı türü (TEBLIGAT_MASRAFI değil).
    expect(classifyClaimItemType(yg.itemType)).toEqual({ category: 'COST', ancillaryType: AncillaryType.YARGILAMA_GIDERI });
    // Hesap özeti: masraf toplamında bir kez; "Diğer" 0; genel toplam iki kalem.
    const totals = sumClaimSummaryTotals(saved.map((i) => ({ itemType: i.itemType, amount: i.amount, currency: i.currency })));
    expect(totals).toMatchObject({ expense: 415, attorneyFee: 12500, other: 0, grandTotal: 12915 });

    // Çift sayım yok: tutar masraf talebi / muhasebe günlüğüne de yazılmaz.
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    const after = await rows(f.tenantId);
    expect(after).toMatchObject({ cases: 1, dues: 2, claimItems: 2, expenseRequests: 0, journal: 0 });
    expect(openingExpenseSpy).not.toHaveBeenCalled();
  });

  it('faiz kararı türle aşılmaz: Due sınırı yargılama giderinde de ACCRUES uyduramaz (400) ve hiçbir kayıt yazılmaz', async () => {
    const f = await fixture('faiz');
    const before = await rows(f.tenantId);
    const res = await postImport(f.admin, importBody(f, 'F1', [{ ...yargilama, interestAccrualStatus: 'ACCRUES' }]));
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('ACCRUES');
    expect(await rows(f.tenantId)).toEqual(before);
  });

  it('tekrar istek → 409; dosya, Due, kalem, masraf talebi, günlük, denetim sayısı değişmez', async () => {
    const f = await fixture('tekrar');
    const body = importBody(f, 'R1', [vekalet, yargilama]);
    expect((await postImport(f.admin, body)).status).toBe(201);
    const before = await rows(f.tenantId);
    const again = await postImport(f.admin, body);
    expect(again.status).toBe(409);
    const sameSource = await postImport(f.admin, { ...body, case: { ...body.case, fileNumber: f.fileNo('R2') } });
    expect(sameSource.status).toBe(409);
    expect(sameSource.body.code).toBe(HISTORICAL_IMPORT_ALREADY_EXISTS);
    expect(await rows(f.tenantId)).toEqual(before);
  });

  it('eski tür değişmedi: EXPENSE → EXPENSE kalemi (motor TEBLIGAT_MASRAFI); önceden yazılmış EXPENSE kalemi dönüştürülmez', async () => {
    const f = await fixture('eski');
    const old = await postImport(f.admin, importBody(f, 'E1', [gider]));
    expect(old.status).toBe(201);
    const [expenseItem] = await items(old.body.id);
    expect(expenseItem.itemType).toBe('EXPENSE');
    expect(classifyClaimItemType(expenseItem.itemType)).toEqual({ category: 'COST', ancillaryType: AncillaryType.TEBLIGAT_MASRAFI });

    const fresh = await postImport(f.admin, importBody(f, 'E2', [vekalet, yargilama]));
    expect(fresh.status).toBe(201);
    // Yeni türle aktarım eski dosyanın kalemine dokunmaz.
    expect((await items(old.body.id)).map((i) => i.itemType)).toEqual(['EXPENSE']);
    expect((await prisma.due.findMany({ where: { caseId: old.body.id }, select: { type: true } })).map((d) => d.type)).toEqual(['EXPENSE']);
  });
});
