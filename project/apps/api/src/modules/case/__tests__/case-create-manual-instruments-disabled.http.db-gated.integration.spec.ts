// CaseModule grafiği `pdf-poppler`'ı yükler; paket Linux'ta yükleme anında process.exit(1) verir
// (CI emsali: case-permission-grant-authz.db-gated.integration.spec.ts).
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
 * MANUAL kambiyo kabul kapısı — GERÇEK HTTP + disposable PostgreSQL.
 *
 * Kusur (önceden var olan): web `NEXT_PUBLIC_MANUAL_CASE_INSTRUMENTS` açıkken çek/senet kalemlerini
 * dues[]'tan çıkarıp instruments[]'a `source: MANUAL` olarak taşır; API'de `MANUAL_CASE_INSTRUMENTS`
 * kapalıyken bu kayıtlar sessizce atlanıyor, dosya çek bedeli OLMADAN (eksik anapara) açılıyordu.
 *
 * Ölçülen: bayrak kapalı + MANUAL kayıt → 400 `MANUAL_CASE_INSTRUMENTS_DISABLED` (global
 * ValidationPipe + AllExceptionsFilter üzerinden gövde şekli) ve tenant'ta HİÇBİR dosya / evrak /
 * alacak kalemi / Due / taraf / audit satırı yok. Pozitif kontrol: aynı istek bayrak açıkken dosyayı
 * CaseInstrument + bağlı PRINCIPAL ClaimItem ile açar (fixture yazabiliyor → red kör değil).
 * OCR kaynağı bu PR'da DEĞİŞMEDİ: bayrak kapalıyken OCR kaydı yine atlanır (ayrı karar).
 *
 * Gerçek giriş yolu: HTTP → CaseController (JwtAuthGuard + ViewerWriteDenyGuard) → CaseService.create
 * → gerçek Nest DI (CaseModule → ClaimItemModule) → disposable PostgreSQL. Yalnız JWT imza doğrulaması
 * DB'den okunan test kimliğiyle değiştirilir.
 */
const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('MANUAL-INSTRUMENTS-DISABLED DB gate blocked: CI requires an approved TEST_DATABASE_URL.');
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

describeWithDisposableDb('MANUAL_CASE_INSTRUMENTS kapalı → POST /cases MANUAL kayıtla 400, dosya hiç oluşmaz (HTTP + disposable PostgreSQL)', () => {
  jest.setTimeout(90_000);

  let prisma: PrismaClient;
  let app: INestApplication;
  const tenantIds = new Set<string>();
  const savedManual = process.env.MANUAL_CASE_INSTRUMENTS;
  const savedOcr = process.env.OCR_MULTI_INSTRUMENT;

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

  afterEach(() => {
    if (savedManual === undefined) delete process.env.MANUAL_CASE_INSTRUMENTS;
    else process.env.MANUAL_CASE_INSTRUMENTS = savedManual;
    if (savedOcr === undefined) delete process.env.OCR_MULTI_INSTRUMENT;
    else process.env.OCR_MULTI_INSTRUMENT = savedOcr;
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
    const tenantId = `test-ci-mci-${label}-${suffix}`;
    tenantIds.add(tenantId);
    await prisma.tenant.create({ data: { id: tenantId, name: `CI MCI ${label}`, slug: tenantId } });
    const user = await prisma.user.create({
      data: { tenantId, email: `mci-${label}-${suffix}@example.test`, name: 'Mci', surname: 'Aktor', role: 'ADMIN' },
    });
    return { tenantId, userId: user.id, fileNumber: `CI-MCI-${label}-${suffix}` };
  }

  /** Dosya açılışının yazabileceği her şey — "dosya hiç oluşmadı" iddiasının ölçüm birimi. */
  async function tenantRowCounts(tenantId: string) {
    const [cases, instruments, claimItems, dues, clients, lawyers, debtors, audits] = await Promise.all([
      prisma.case.count({ where: { tenantId } }),
      prisma.caseInstrument.count({ where: { tenantId } }),
      prisma.claimItem.count({ where: { tenantId } }),
      prisma.due.count({ where: { case: { tenantId } } }),
      prisma.client.count({ where: { tenantId } }),
      prisma.lawyer.count({ where: { tenantId } }),
      prisma.debtor.count({ where: { tenantId } }),
      prisma.auditLog.count({ where: { tenantId } }),
    ]);
    return { cases, instruments, claimItems, dues, clients, lawyers, debtors, audits };
  }

  const cek = (documentNo: string, source?: 'MANUAL' | 'OCR') => ({
    type: 'CEK',
    amount: 20_000,
    issueDate: '2026-01-10',
    documentNo,
    currency: 'TRY',
    ...(source ? { source } : {}),
  });

  const body = (fileNumber: string, instruments: unknown[]) => ({
    fileNumber,
    type: 'GENERAL_EXECUTION',
    // Sihirbazın gönderdiği satır içi yeni taraflar: red tx ÖNCESİ olduğundan HİÇBİRİ yaratılmamalı.
    creditors: [{ type: 'INDIVIDUAL', name: 'Ahmet Yılmaz', phone: '5550001122', address: 'Kadıköy / İstanbul' }],
    lawyers: [{ name: 'Ada', surname: 'Lovelace', barNumber: `BR-${fileNumber}` }],
    instruments,
  });

  const postCase = (userId: string, payload: object) =>
    request(app.getHttpServer()).post('/cases').set('x-test-user-id', userId).send(payload);

  it('bayrak KAPALI + MANUAL çek → 400 MANUAL_CASE_INSTRUMENTS_DISABLED; dosya / evrak / kalem / Due / taraf / audit YOK', async () => {
    delete process.env.MANUAL_CASE_INSTRUMENTS;
    process.env.OCR_MULTI_INSTRUMENT = 'true'; // OCR açık olsa bile MANUAL kapısı bağımsız
    const f = await fixture('off');
    const before = await tenantRowCounts(f.tenantId);

    const res = await postCase(f.userId, body(f.fileNumber, [cek('CK-MCI-1', 'MANUAL')]));

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      code: 'MANUAL_CASE_INSTRUMENTS_DISABLED',
      message: expect.stringContaining('takip oluşturulmadı'),
      manualInstrumentCount: 1,
    });
    const after = await tenantRowCounts(f.tenantId);
    expect(after).toEqual(before);
    expect(after.cases).toBe(0);
    expect(after.instruments).toBe(0);
    expect(after.claimItems).toBe(0);
    expect(after.clients).toBe(0);
    expect(after.lawyers).toBe(0);
    expect(await prisma.case.count({ where: { fileNumber: f.fileNumber } })).toBe(0);
  });

  it('bayrak KAPALI + karışık OCR + MANUAL → yine 400 (OCR kısmı da yazılmaz)', async () => {
    delete process.env.MANUAL_CASE_INSTRUMENTS;
    process.env.OCR_MULTI_INSTRUMENT = 'true';
    const f = await fixture('mix');

    const res = await postCase(
      f.userId,
      body(f.fileNumber, [cek('CK-OCR-1'), cek('CK-MCI-2', 'MANUAL'), cek('CK-MCI-3', 'MANUAL')]),
    );

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: 'MANUAL_CASE_INSTRUMENTS_DISABLED', manualInstrumentCount: 2 });
    expect(await tenantRowCounts(f.tenantId)).toMatchObject({ cases: 0, instruments: 0, claimItems: 0, clients: 0 });
  });

  it('POZİTİF KONTROL: aynı istek bayrak AÇIKKEN dosyayı CaseInstrument + bağlı PRINCIPAL ClaimItem ile açar', async () => {
    process.env.MANUAL_CASE_INSTRUMENTS = 'true';
    delete process.env.OCR_MULTI_INSTRUMENT;
    const f = await fixture('on');

    const res = await postCase(f.userId, body(f.fileNumber, [cek('CK-MCI-4', 'MANUAL')]));

    expect(res.status).toBe(201);
    const created = await prisma.case.findFirstOrThrow({ where: { tenantId: f.tenantId, fileNumber: f.fileNumber } });
    expect(Number(created.principalAmount)).toBe(20_000);
    const instruments = await prisma.caseInstrument.findMany({ where: { tenantId: f.tenantId, caseId: created.id } });
    expect(instruments).toHaveLength(1);
    expect(instruments[0]).toMatchObject({ instrumentType: 'CEK', serialNo: 'CK-MCI-4' });
    const principal = await prisma.claimItem.findMany({
      where: { tenantId: f.tenantId, caseId: created.id, itemType: 'PRINCIPAL' },
    });
    expect(principal).toHaveLength(1);
    expect(principal[0].instrumentId).toBe(instruments[0].id);
    expect(Number(principal[0].amount)).toBe(20_000);
  });

  it('OCR DEĞİŞMEDİ: iki bayrak kapalı + yalnız OCR kaynaklı çek → dosya açılır, OCR kaydı atlanır (mevcut davranış; ayrı karar)', async () => {
    delete process.env.MANUAL_CASE_INSTRUMENTS;
    delete process.env.OCR_MULTI_INSTRUMENT;
    const f = await fixture('ocr');

    const res = await postCase(f.userId, body(f.fileNumber, [cek('CK-OCR-2')]));

    expect(res.status).toBe(201);
    expect(await tenantRowCounts(f.tenantId)).toMatchObject({ cases: 1, instruments: 0, claimItems: 0 });
  });
});
