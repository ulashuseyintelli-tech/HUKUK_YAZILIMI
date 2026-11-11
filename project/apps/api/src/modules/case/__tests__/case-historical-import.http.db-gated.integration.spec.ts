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
import { ClientInfoRequestService } from '../../address-discovery/client-info-request.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ErrorLogModule } from '../../error-log/error-log.module';
import { ExpenseRequestService } from '../../expense-request/expense-request.service';
import { MetricsRegistryModule } from '../../metrics-registry/metrics-registry.module';
import { CaseModule } from '../case.module';
import {
  CASE_HISTORICAL_IMPORT_FLAG,
  HISTORICAL_IMPORT_ALREADY_EXISTS,
  HISTORICAL_IMPORT_FIELD_FORBIDDEN,
} from '../historical-import/case-historical-import';

/**
 * Tarihsel dosya aktarımı (MEŞE pilot; owner GO-COMPLETE 12.11.2026) — GERÇEK HTTP + disposable PostgreSQL.
 *
 * Kanıtlanan:
 *  1. Normal `POST /cases` DEĞİŞMEDİ: varsayılan avukat + varsayılan personel eklenir, otomatik müvekkil bilgi talebi ve
 *     otomatik açılış masraf talebi denenir, otomasyon / UYAP / müvekkile gösterim açık açılır.
 *  2. `POST /cases/historical-import`: yalnız açıkça eşlenen avukat bağlanır; varsayılan avukat / personel, bilgi talebi,
 *     açılış masraf talebi, muhasebe günlüğü, bildirim kuyruğu OLUŞMAZ; alacak kalemleri istenen sayıda (ek faiz kalemi
 *     yok); kaynak sistem + kaynak dosya kimliği dosyada ve denetimde korunur; dosya otomasyon / UYAP / gösterim kapalı.
 *  3. Tekrar çalıştırma: aynı dosya no ya da aynı kaynak dosya → 409; dosya, taraf, kalem, masraf, denetim sayısı değişmez.
 *  4. Kapılar aşılmaz: bayrak kapalı → 404; ADMIN olmayan → 403 (+ PERMISSION_DENIED denetimi); VIEWER → 403; başka
 *     kiracının avukatı → reddedilir; masraf e-postası / çek tazminatı onay talebi → 400. Hiçbirinde iş kaydı yazılmaz.
 *
 * Gerçek giriş yolu: HTTP → CaseController (JwtAuthGuard + ViewerWriteDenyGuard) → CaseService → gerçek Nest DI →
 * disposable PostgreSQL. JWT imza doğrulaması yerine DB'den okunan test kimliği; müvekkil bilgi talebi gönderimi dışa
 * çıkmasın diye yalnız o yöntem casusla değiştirilir (çağrı sayısı ölçülür); açılış masraf talebi gerçek servisle
 * çalışır (casus yalnız sayar).
 */
const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('CASE-HISTORICAL-IMPORT DB gate blocked: CI requires an approved TEST_DATABASE_URL.');
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

interface Fixture {
  tenantId: string;
  admin: string;
  user: string;
  viewer: string;
  client: string;
  mappedLawyer: string;
  defaultLawyer: string;
  defaultStaff: string;
  foreignLawyer: string;
  fileNo: (tag: string) => string;
  sourceRef: (tag: string) => string;
}

describeWithDisposableDb('Tarihsel dosya aktarımı — POST /cases/historical-import ve değişmeyen POST /cases (HTTP + disposable PostgreSQL)', () => {
  jest.setTimeout(120_000);

  let prisma: PrismaClient;
  let app: INestApplication;
  let infoRequestSpy: jest.SpyInstance;
  let openingExpenseSpy: jest.SpyInstance;
  let openingBasisSpy: jest.SpyInstance;
  const tenantIds = new Set<string>();
  const savedFlag = process.env[CASE_HISTORICAL_IMPORT_FLAG];

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

    infoRequestSpy = jest.spyOn(app.get(ClientInfoRequestService), 'sendAutoRequestOnCaseCreate').mockResolvedValue(undefined);
    const expenseService = app.get(ExpenseRequestService);
    openingExpenseSpy = jest.spyOn(expenseService, 'createOpeningExpenseSet');
    openingBasisSpy = jest.spyOn(expenseService, 'evaluateOpeningExpenseBasisForCase');
  });

  beforeEach(() => {
    process.env[CASE_HISTORICAL_IMPORT_FLAG] = 'true';
    infoRequestSpy.mockClear();
    openingExpenseSpy.mockClear();
    openingBasisSpy.mockClear();
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
    const tenantId = `test-ci-hi-${label}-${suffix}`;
    tenantIds.add(tenantId);
    await prisma.tenant.create({ data: { id: tenantId, name: `CI HI ${label}`, slug: tenantId } });
    await prisma.office.create({ data: { tenantId, name: `CI HI ${label} Büro` } });
    const mkUser = async (role: 'ADMIN' | 'USER' | 'VIEWER', tag: string) =>
      (await prisma.user.create({ data: { tenantId, role, email: `hi-${tag}-${suffix}@example.test`, name: 'Sentetik', surname: tag } })).id;
    const admin = await mkUser('ADMIN', 'admin');
    const user = await mkUser('USER', 'kullanici');
    const viewer = await mkUser('VIEWER', 'izleyici');
    // Müvekkil: e-posta / telefon YOK (sentetik şirket).
    const client = (await prisma.client.create({ data: { tenantId, type: 'COMPANY', name: `HI Sentetik Şirket ${suffix}` } })).id;
    // Açıkça eşlenen avukat (varsayılan DEĞİL) + "yeni takiplerde otomatik seç" işaretli avukat + varsayılan personel.
    const mappedLawyer = (await prisma.lawyer.create({ data: { tenantId, name: 'Eşlenen', surname: 'Avukat', lawyerRank: 'PARTNER' } })).id;
    const defaultLawyer = (await prisma.lawyer.create({ data: { tenantId, name: 'Varsayılan', surname: 'Avukat', lawyerRank: 'LAWYER', isDefaultForNewCases: true } })).id;
    const defaultStaff = (await prisma.staffMember.create({ data: { tenantId, firstName: 'Varsayılan', lastName: 'Personel', staffType: 'SEKRETER', isDefaultForNewCases: true } })).id;
    // Başka kiracının avukatı (kiracı kapısı).
    const otherTenant = `test-ci-hi-${label}-diger-${suffix}`;
    tenantIds.add(otherTenant);
    await prisma.tenant.create({ data: { id: otherTenant, name: `CI HI ${label} diğer`, slug: otherTenant } });
    const foreignLawyer = (await prisma.lawyer.create({ data: { tenantId: otherTenant, name: 'Yabancı', surname: 'Avukat', lawyerRank: 'PARTNER' } })).id;
    return {
      tenantId, admin, user, viewer, client, mappedLawyer, defaultLawyer, defaultStaff, foreignLawyer,
      fileNo: (tag) => `HI-${tag}-${suffix}`,
      sourceRef: (tag) => `${tag}-${suffix}`,
    };
  }

  /** Sentetik ilamlı dosya gövdesi: iki kalem (vekâlet ücreti + gider), ikisi de takip öncesi YASAL faizli. Gerçek dosya verisi DEĞİL. */
  const caseBody = (f: Fixture, tag: string, lawyerId = f.mappedLawyer) => ({
    fileNumber: f.fileNo(tag),
    type: 'GENERAL_EXECUTION',
    currency: 'TRY',
    startDate: '2026-10-20',
    creditors: [{ id: f.client, type: 'COMPANY', name: 'HI Sentetik Şirket' }],
    debtors: [
      { type: 'INDIVIDUAL', name: `Sentetik Borçlu Bir ${tag}` },
      { type: 'INDIVIDUAL', name: `Sentetik Borçlu İki ${tag}` },
    ],
    lawyers: [{ id: lawyerId, name: 'Eşlenen', surname: 'Avukat' }],
    dues: [
      { type: 'VEKALET_UCRETI', description: 'Sentetik vekâlet ücreti', amount: 12500, dueDate: '2025-03-14', interestType: 'YASAL', interestTypeCode: 'LEGAL_3095', interestStartDate: '2025-03-14' },
      { type: 'EXPENSE', description: 'Sentetik gider', amount: 415, dueDate: '2025-03-14', interestType: 'YASAL', interestTypeCode: 'LEGAL_3095', interestStartDate: '2025-03-14' },
    ],
  });

  const importBody = (f: Fixture, tag: string, overrides: Record<string, unknown> = {}, sourceTag = tag) => ({
    sourceSystem: 'MESE',
    sourceCaseRef: f.sourceRef(sourceTag),
    case: { ...caseBody(f, tag), ...overrides },
  });

  const postCase = (userId: string, payload: object) =>
    request(app.getHttpServer()).post('/cases').set('x-test-user-id', userId).send(payload);
  const postImport = (userId: string, payload: object) =>
    request(app.getHttpServer()).post('/cases/historical-import').set('x-test-user-id', userId).send(payload);

  /** Dosya açılışının yazabileceği iş kayıtları — "kayıt oluşmadı / mükerrer yok" iddialarının ölçüm birimi. */
  async function rows(tenantId: string) {
    const [cases, caseClients, caseLawyers, caseStaff, caseDebtors, clients, debtors, dues, claimItems, expenseRequests, journal, notifications, infoRequests, approvals] =
      await Promise.all([
        prisma.case.count({ where: { tenantId } }),
        prisma.caseClient.count({ where: { case: { tenantId } } }),
        prisma.caseLawyer.count({ where: { case: { tenantId } } }),
        prisma.caseStaff.count({ where: { case: { tenantId } } }),
        prisma.caseDebtor.count({ where: { case: { tenantId } } }),
        prisma.client.count({ where: { tenantId } }),
        prisma.debtor.count({ where: { tenantId } }),
        prisma.due.count({ where: { case: { tenantId } } }),
        prisma.claimItem.count({ where: { tenantId } }),
        prisma.expenseRequest.count({ where: { tenantId } }),
        prisma.accountingJournalEntry.count({ where: { tenantId } }),
        prisma.notificationQueue.count({ where: { tenantId } }),
        prisma.clientInfoRequest.count({ where: { tenantId } }),
        prisma.officeApprovalRequest.count({ where: { tenantId } }),
      ]);
    return { cases, caseClients, caseLawyers, caseStaff, caseDebtors, clients, debtors, dues, claimItems, expenseRequests, journal, notifications, infoRequests, approvals };
  }
  const createAudits = (tenantId: string) => prisma.auditLog.count({ where: { tenantId, action: 'CREATE' } });

  it('normal POST /cases DEĞİŞMEDİ: varsayılan avukat + personel eklenir, bilgi talebi ve açılış masraf talebi denenir, bayraklar açık', async () => {
    const f = await fixture('normal');
    const res = await postCase(f.admin, caseBody(f, 'N1'));
    expect(res.status).toBe(201);
    expect(res.body.historicalImport).toBeUndefined();

    const caseId = res.body.id as string;
    const lawyers = await prisma.caseLawyer.findMany({ where: { caseId }, select: { lawyerId: true } });
    expect(lawyers.map((l) => l.lawyerId).sort()).toEqual([f.defaultLawyer, f.mappedLawyer].sort());
    const staff = await prisma.caseStaff.findMany({ where: { caseId }, select: { staffMemberId: true } });
    expect(staff.map((s) => s.staffMemberId)).toEqual([f.defaultStaff]);

    const saved = await prisma.case.findUniqueOrThrow({
      where: { id: caseId },
      select: { isAutomationEnabled: true, allowUyapActions: true, showToClient: true, metadata: true },
    });
    expect(saved).toMatchObject({ isAutomationEnabled: true, allowUyapActions: true, showToClient: true });
    expect((saved.metadata as Record<string, unknown>).historicalImport).toBeUndefined();

    expect(infoRequestSpy).toHaveBeenCalledTimes(1);
    expect(infoRequestSpy).toHaveBeenCalledWith(f.tenantId, caseId);
    expect(openingBasisSpy).toHaveBeenCalledTimes(1);
    // Açılış masraf talebi yeni takipte arka planda DENENİR (sonucu bu testin konusu değil; yalnız denendiği).
    await waitFor(() => openingExpenseSpy.mock.calls.length > 0);
    expect(openingExpenseSpy).toHaveBeenCalledWith(caseId, f.tenantId, 'system');
    await Promise.allSettled(openingExpenseSpy.mock.results.map((r) => r.value));
  });

  it('tarihsel aktarım: yalnız eşlenen avukat; varsayılan kişi, bilgi talebi, masraf talebi, günlük, bildirim YOK; kaynak kimliği korunur', async () => {
    const f = await fixture('tarihsel');
    const before = await rows(f.tenantId);
    const res = await postImport(f.admin, importBody(f, 'T1'));
    expect(res.status).toBe(201);
    expect(res.body.historicalImport).toEqual({
      sourceSystem: 'MESE',
      sourceCaseRef: f.sourceRef('T1'),
      skippedSideEffects: ['DEFAULT_LAWYERS', 'DEFAULT_STAFF', 'CLIENT_INFO_REQUEST', 'OPENING_EXPENSE_REQUEST'],
    });
    expect(res.body.openingExpenseRequest).toBeUndefined();

    const caseId = res.body.id as string;
    const lawyers = await prisma.caseLawyer.findMany({ where: { caseId }, select: { lawyerId: true, isResponsible: true } });
    expect(lawyers).toEqual([{ lawyerId: f.mappedLawyer, isResponsible: true }]);
    expect(await prisma.caseStaff.count({ where: { caseId } })).toBe(0);

    const saved = await prisma.case.findUniqueOrThrow({
      where: { id: caseId },
      select: { fileNumber: true, isAutomationEnabled: true, allowUyapActions: true, showToClient: true, metadata: true, caseDate: true, currency: true },
    });
    expect(saved).toMatchObject({ fileNumber: f.fileNo('T1'), isAutomationEnabled: false, allowUyapActions: false, showToClient: false, currency: 'TRY' });
    expect(saved.caseDate?.toISOString().slice(0, 10)).toBe('2026-10-20');
    const marker = (saved.metadata as Record<string, any>).historicalImport;
    expect(marker).toMatchObject({ sourceSystem: 'MESE', sourceCaseRef: f.sourceRef('T1'), importedById: f.admin });
    expect(typeof marker.importedAt).toBe('string');

    // İki kalem (ek faiz kalemi yok), iki taraf borçlu, bir müvekkil bağı.
    const after = await rows(f.tenantId);
    expect(after.cases - before.cases).toBe(1);
    expect(after.caseClients - before.caseClients).toBe(1);
    expect(after.caseDebtors - before.caseDebtors).toBe(2);
    expect(after.dues - before.dues).toBe(2);
    expect(after.claimItems - before.claimItems).toBe(2);
    const claimTypes = await prisma.claimItem.findMany({ where: { caseId }, select: { itemType: true, interestTypeCode: true } });
    expect(claimTypes.map((c) => c.itemType).sort()).toEqual(['ATTORNEY_FEE', 'EXPENSE']);
    expect(claimTypes.every((c) => c.interestTypeCode === 'LEGAL_3095')).toBe(true);

    // Yan etki yok: bilgi talebi, açılış masraf talebi (hiç denenmez), muhasebe günlüğü, bildirim kuyruğu, onay talebi.
    expect(infoRequestSpy).not.toHaveBeenCalled();
    expect(openingBasisSpy).not.toHaveBeenCalled();
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    expect(openingExpenseSpy).not.toHaveBeenCalled();
    expect(after.expenseRequests).toBe(0);
    expect(after.journal).toBe(0);
    const settled = await rows(f.tenantId);
    expect(settled.expenseRequests).toBe(0);
    expect(settled.journal).toBe(0);
    expect(settled.notifications).toBe(0);
    expect(settled.infoRequests).toBe(0);
    expect(settled.approvals).toBe(0);

    // Aktarım kaydı: kaynak sistem + kaynak dosya kimliği + atlanan yan etkiler.
    const importAudit = await prisma.auditLog.findMany({ where: { tenantId: f.tenantId, entityId: caseId, action: 'CREATE' }, select: { metadata: true } });
    const historical = importAudit.map((a) => a.metadata as Record<string, any> | null).filter((m) => m?.changeType === 'HISTORICAL_IMPORT');
    expect(historical).toHaveLength(1);
    expect(historical[0]).toMatchObject({ sourceSystem: 'MESE', sourceCaseRef: f.sourceRef('T1') });
  });

  it('tekrar çalıştırma: aynı dosya no ya da aynı kaynak dosya → 409; hiçbir kayıt artmaz', async () => {
    const f = await fixture('tekrar');
    const first = await postImport(f.admin, importBody(f, 'R1'));
    expect(first.status).toBe(201);
    const before = await rows(f.tenantId);
    const auditsBefore = await createAudits(f.tenantId);

    const sameFile = await postImport(f.admin, importBody(f, 'R1'));
    expect(sameFile.status).toBe(409);

    const sameSource = await postImport(f.admin, importBody(f, 'R2', {}, 'R1'));
    expect(sameSource.status).toBe(409);
    expect(sameSource.body.code).toBe(HISTORICAL_IMPORT_ALREADY_EXISTS);

    expect(await rows(f.tenantId)).toEqual(before);
    expect(await createAudits(f.tenantId)).toBe(auditsBefore);
    expect(openingExpenseSpy).not.toHaveBeenCalled();
    expect(infoRequestSpy).not.toHaveBeenCalled();
  });

  it('kapılar aşılmaz: bayrak kapalı 404, ADMIN olmayan 403, VIEWER 403, başka kiracı avukatı ve yasak alanlar reddedilir; iş kaydı 0', async () => {
    const f = await fixture('kapi');
    const before = await rows(f.tenantId);

    delete process.env[CASE_HISTORICAL_IMPORT_FLAG];
    expect((await postImport(f.admin, importBody(f, 'K0'))).status).toBe(404);
    process.env[CASE_HISTORICAL_IMPORT_FLAG] = 'true';

    const nonAdmin = await postImport(f.user, importBody(f, 'K1'));
    expect(nonAdmin.status).toBe(403);
    const denied = await prisma.auditLog.count({ where: { tenantId: f.tenantId, action: 'PERMISSION_DENIED', entityId: 'cases.historicalImport' } });
    expect(denied).toBe(1);

    expect((await postImport(f.viewer, importBody(f, 'K2'))).status).toBe(403);

    const foreign = await postImport(f.admin, { ...importBody(f, 'K3'), case: caseBody(f, 'K3', f.foreignLawyer) });
    expect(foreign.status).toBeGreaterThanOrEqual(400);
    expect(foreign.status).toBeLessThan(500);

    const expenseEmail = await postImport(f.admin, importBody(f, 'K4', { sendExpenseEmail: true }));
    expect(expenseEmail.status).toBe(400);
    expect(expenseEmail.body.code).toBe(HISTORICAL_IMPORT_FIELD_FORBIDDEN);

    const penalty = await postImport(f.admin, importBody(f, 'K5', { checkPenaltyFormation: { requested: true } }));
    expect(penalty.status).toBe(400);

    expect((await postImport(f.admin, { ...importBody(f, 'K6'), sourceSystem: 'BASKA' })).status).toBe(400);
    expect((await postImport(f.admin, { ...importBody(f, 'K7'), sourceCaseRef: '' })).status).toBe(400);

    expect(await rows(f.tenantId)).toEqual(before);
    expect(openingExpenseSpy).not.toHaveBeenCalled();
    expect(infoRequestSpy).not.toHaveBeenCalled();
  });
});

async function waitFor(predicate: () => boolean, timeoutMs = 10_000): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error('waitFor: süre doldu');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
