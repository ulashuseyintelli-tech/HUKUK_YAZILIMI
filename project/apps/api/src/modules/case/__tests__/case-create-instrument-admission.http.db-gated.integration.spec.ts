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
import { OfficeApprovalStatus, PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import * as request from 'supertest';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { StorageModule } from '../../../common/storage/storage.module';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CEK_AUTO_GENERATE_FORMATION_OPTIONS } from '../../claim-item/formation-cek/cek-auto-generate-formation.service';
import { ErrorLogModule } from '../../error-log/error-log.module';
import { MetricsRegistryModule } from '../../metrics-registry/metrics-registry.module';
import { CaseModule } from '../case.module';

/**
 * Evrak kabul kapısı (MANUAL + OCR) — GERÇEK HTTP + disposable PostgreSQL.
 *
 * Kusur (önceden var olan): web evrak kaydını dues[]'a koymadan instruments[]'a taşır (manuel çek/senet
 * `source: MANUAL`; çoklu OCR evrakı source'suz). API ilgili bayrak kapalıyken ya da kayıt CaseInstrument'a
 * dönüştürülemiyorken kaydı sessizce atlıyor, dosya evrak/anapara OLMADAN açılıyordu.
 *
 * Ölçülen: kapalı kaynak / işlenemeyen TEK kayıt → 400 kararlı kod (global ValidationPipe + AllExceptionsFilter
 * gövdesi) ve tenant'ta HİÇBİR dosya / evrak / alacak kalemi / Due / taraf / dosya-borçlusu / K3 onay talebi /
 * audit satırı yok. Pozitif: bayraklar açıkken evrak + doğru PRINCIPAL; retten sonra yeniden gönderim tekil kayıt;
 * evraksız açılış etkilenmez. K3 (#2843, main'de): red K3 talebi üretmez; başarılı açılışta PRINCIPAL ve K3 sonucu
 * tekil (gerçek yetki durumunda REJECTED; yetki önkoşulu sağlanınca tek REQUESTED onay talebi).
 *
 * Gerçek giriş yolu: HTTP → CaseController (JwtAuthGuard + ViewerWriteDenyGuard) → CaseService.create → gerçek Nest
 * DI (CaseModule → ClaimItemModule → OfficeApprovalModule) → disposable PostgreSQL. Yalnız JWT imza doğrulaması DB'den
 * okunan test kimliğiyle değiştirilir; K3 bayrakları (varsayılan KAPALI) yalnız bu izole uygulamada açılır.
 */
const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('CASE-INSTRUMENT-ADMISSION DB gate blocked: CI requires an approved TEST_DATABASE_URL.');
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

const FLAGS = ['MANUAL_CASE_INSTRUMENTS', 'OCR_MULTI_INSTRUMENT'] as const;

describeWithDisposableDb('Evrak kabul kapısı — POST /cases MANUAL + OCR fail-closed (HTTP + disposable PostgreSQL)', () => {
  jest.setTimeout(120_000);

  let prisma: PrismaClient;
  let app: INestApplication;
  const tenantIds = new Set<string>();
  const saved = Object.fromEntries(FLAGS.map((k) => [k, process.env[k]]));

  function setFlags(flags: { manual?: boolean; ocr?: boolean }) {
    if (flags.manual) process.env.MANUAL_CASE_INSTRUMENTS = 'true';
    else delete process.env.MANUAL_CASE_INSTRUMENTS;
    if (flags.ocr) process.env.OCR_MULTI_INSTRUMENT = 'true';
    else delete process.env.OCR_MULTI_INSTRUMENT;
  }

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
      .overrideProvider(CEK_AUTO_GENERATE_FORMATION_OPTIONS)
      .useValue({ enabled: true, allowDraftLegalContent: true })
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe(PRODUCTION_VALIDATION_OPTIONS));
    await app.init();
  });

  afterEach(() => {
    for (const k of FLAGS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  afterAll(async () => {
    await app?.close();
    // K3 REQUESTED testi ClaimItemFormationIntent yazar; bu satır değiştirilemez hukuki kayıttır (DELETE tetikleyiciyle
    // yasak) → o tenant disposable DB'de KALIR (case-open-check-penalty-formation db spec'i ile aynı). Diğerleri silinir.
    for (const tenantId of tenantIds) {
      await prisma.auditLog.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await prisma.tenant.deleteMany({ where: { id: tenantId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  async function fixture(label: string) {
    const suffix = randomUUID().slice(0, 8);
    const tenantId = `test-ci-ia-${label}-${suffix}`;
    tenantIds.add(tenantId);
    await prisma.tenant.create({ data: { id: tenantId, name: `CI IA ${label}`, slug: tenantId } });
    const user = await prisma.user.create({
      data: { tenantId, email: `ia-${label}-${suffix}@example.test`, name: 'Ia', surname: 'Aktor', role: 'ADMIN' },
    });
    return { tenantId, userId: user.id, suffix, fileNumber: `CI-IA-${label}-${suffix}` };
  }

  /** Dosya açılışının yazabileceği her şey — "dosya hiç oluşmadı" iddiasının ölçüm birimi. */
  async function tenantRowCounts(tenantId: string) {
    const [cases, instruments, claimItems, dues, clients, lawyers, caseDebtors, approvals, audits] = await Promise.all([
      prisma.case.count({ where: { tenantId } }),
      prisma.caseInstrument.count({ where: { tenantId } }),
      prisma.claimItem.count({ where: { tenantId } }),
      prisma.due.count({ where: { case: { tenantId } } }),
      prisma.client.count({ where: { tenantId } }),
      prisma.lawyer.count({ where: { tenantId } }),
      prisma.caseDebtor.count({ where: { case: { tenantId } } }),
      prisma.officeApprovalRequest.count({ where: { tenantId } }),
      prisma.auditLog.count({ where: { tenantId } }),
    ]);
    return { cases, instruments, claimItems, dues, clients, lawyers, caseDebtors, approvals, audits };
  }

  /** Sihirbazın manuel çek kaydı (routeClaimRawsForManualInstruments çıktısı şekli). */
  const manualCek = (documentNo: string, amount = 20_000) => ({
    type: 'CEK',
    amount,
    issueDate: '2026-01-10',
    documentNo,
    currency: 'TRY',
    source: 'MANUAL',
  });

  /** Sihirbazın OCR evrak kaydı (selectedInstrumentsToPayload çıktısı şekli: source YOK, OCR aday alanları var). */
  const ocrCek = (documentNo: string, amount = 7_500.25) => ({
    type: 'CEK',
    amount,
    issueDate: '2026-02-03',
    documentNo,
    currency: 'TRY',
    dueDate: '2026-03-03',
    bankName: 'Örnek Bankası',
    drawerName: 'Keşideci A.Ş.',
    payeeName: 'Lehtar Ltd.',
    endorsementNames: ['Ciranta Bir'],
  });

  const body = (fileNumber: string, instruments: unknown[] | undefined) => ({
    fileNumber,
    type: 'GENERAL_EXECUTION',
    // Sihirbazın gönderdiği satır içi yeni taraflar: red tx ÖNCESİ olduğundan HİÇBİRİ yaratılmamalı.
    creditors: [{ type: 'INDIVIDUAL', name: 'Ahmet Yılmaz', phone: '5550001122', address: 'Kadıköy / İstanbul' }],
    lawyers: [{ name: 'Ada', surname: 'Lovelace', barNumber: `BR-${fileNumber}` }],
    ...(instruments === undefined ? {} : { instruments }),
  });

  const postCase = (userId: string, payload: object) =>
    request(app.getHttpServer()).post('/cases').set('x-test-user-id', userId).send(payload);

  async function expectRejectedNothingWritten(
    f: { tenantId: string; userId: string; fileNumber: string },
    payload: object,
    expected: Record<string, unknown>,
  ) {
    const before = await tenantRowCounts(f.tenantId);
    const res = await postCase(f.userId, payload);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject(expected);
    expect(res.body.message).toEqual(expect.stringContaining('takip oluşturulmadı'));
    const after = await tenantRowCounts(f.tenantId);
    expect(after).toEqual(before);
    expect(after).toMatchObject({ cases: 0, instruments: 0, claimItems: 0, dues: 0, clients: 0, lawyers: 0, approvals: 0 });
    expect(await prisma.case.count({ where: { fileNumber: f.fileNumber } })).toBe(0);
    return res;
  }

  it('MANUAL bayrağı KAPALI + manuel çek → 400 MANUAL_CASE_INSTRUMENTS_DISABLED; hiçbir satır yok', async () => {
    setFlags({ manual: false, ocr: true }); // OCR açık olsa bile MANUAL kapısı bağımsız
    const f = await fixture('manual-off');
    await expectRejectedNothingWritten(f, body(f.fileNumber, [manualCek('CK-M-1')]), {
      code: 'MANUAL_CASE_INSTRUMENTS_DISABLED',
      disabledSources: ['MANUAL'],
      manualInstrumentCount: 1,
      ocrInstrumentCount: 0,
    });
  });

  it('DOĞRUDAN API: OCR bayrağı KAPALI + OCR kaynaklı çek → 400 OCR_CASE_INSTRUMENTS_DISABLED; hiçbir satır yok', async () => {
    setFlags({ manual: true, ocr: false });
    const f = await fixture('ocr-api');
    await expectRejectedNothingWritten(f, body(f.fileNumber, [{ ...ocrCek('CK-O-1'), source: 'OCR' }]), {
      code: 'OCR_CASE_INSTRUMENTS_DISABLED',
      disabledSources: ['OCR'],
      manualInstrumentCount: 0,
      ocrInstrumentCount: 1,
    });
  });

  it('OCR TASLAĞI: bayrak açıkken hazırlanan taslak bayrak kapandıktan sonra gönderilirse 400; bayrak yeniden açılınca AYNI taslak tekil kayıt üretir', async () => {
    const f = await fixture('ocr-draft');
    setFlags({ ocr: true });
    const draft = body(f.fileNumber, [ocrCek('CK-O-2', 7_500.25)]); // bayrak AÇIKKEN hazırlanan taslak yükü
    setFlags({ ocr: false }); // bayrak kapandı; kullanıcı taslağı şimdi gönderiyor
    await expectRejectedNothingWritten(f, draft, { code: 'OCR_CASE_INSTRUMENTS_DISABLED', ocrInstrumentCount: 1 });

    setFlags({ ocr: true }); // yeniden gönderim: aynı taslak, veri yeniden girilmeden
    const res = await postCase(f.userId, draft);
    expect(res.status).toBe(201);
    const counts = await tenantRowCounts(f.tenantId);
    expect(counts).toMatchObject({ cases: 1, instruments: 1 });
    const principal = await prisma.claimItem.findMany({ where: { tenantId: f.tenantId, itemType: 'PRINCIPAL' } });
    expect(principal.map((p) => Number(p.amount))).toEqual([7_500.25]);
  });

  it('KARIŞIK MANUAL + OCR atomik red: kapalı kaynaktaki TEK kayıt tüm açılışı reddeder (açık kaynaktaki kayıt da yazılmaz)', async () => {
    setFlags({ manual: true, ocr: false });
    const a = await fixture('mix-ocr-off');
    await expectRejectedNothingWritten(a, body(a.fileNumber, [manualCek('CK-M-2'), ocrCek('CK-O-3')]), {
      code: 'OCR_CASE_INSTRUMENTS_DISABLED',
      manualInstrumentCount: 0,
      ocrInstrumentCount: 1,
    });
    setFlags({ manual: false, ocr: true });
    const b = await fixture('mix-manual-off');
    await expectRejectedNothingWritten(b, body(b.fileNumber, [ocrCek('CK-O-4'), manualCek('CK-M-3')]), {
      code: 'MANUAL_CASE_INSTRUMENTS_DISABLED',
      manualInstrumentCount: 1,
      ocrInstrumentCount: 0,
    });
    setFlags({});
    const c = await fixture('mix-both-off');
    await expectRejectedNothingWritten(c, body(c.fileNumber, [ocrCek('CK-O-5'), manualCek('CK-M-4')]), {
      code: 'CASE_INSTRUMENT_SOURCES_DISABLED',
      disabledSources: ['MANUAL', 'OCR'],
      manualInstrumentCount: 1,
      ocrInstrumentCount: 1,
    });
  });

  it('İŞLENEMEYEN KAYIT: bayraklar açık + FATURA türü OCR kaydı → 400 CASE_INSTRUMENT_UNPROCESSABLE; geçerli çek de yazılmaz', async () => {
    setFlags({ manual: true, ocr: true });
    const f = await fixture('fatura');
    await expectRejectedNothingWritten(
      f,
      body(f.fileNumber, [ocrCek('CK-O-6'), { ...ocrCek('FT-1', 1_000), type: 'FATURA' }]),
      { code: 'CASE_INSTRUMENT_UNPROCESSABLE', items: [{ index: 1, source: 'OCR', type: 'FATURA', reason: 'NOT_KAMBIYO' }] },
    );
  });

  it('POZİTİF: bayraklar açık + karışık MANUAL + OCR → iki evrak, her birine bağlı doğru PRINCIPAL, principalAmount toplamı; Due yok', async () => {
    setFlags({ manual: true, ocr: true });
    const f = await fixture('mix-on');
    const res = await postCase(f.userId, body(f.fileNumber, [manualCek('CK-M-5', 20_000), ocrCek('CK-O-7', 7_500.25)]));
    expect(res.status).toBe(201);
    const created = await prisma.case.findFirstOrThrow({ where: { tenantId: f.tenantId, fileNumber: f.fileNumber } });
    expect(Number(created.principalAmount)).toBe(27_500.25);
    const instruments = await prisma.caseInstrument.findMany({ where: { tenantId: f.tenantId, caseId: created.id } });
    expect(instruments.map((i) => [i.instrumentType, i.serialNo, Number(i.amount)]).sort()).toEqual(
      [['CEK', 'CK-M-5', 20_000], ['CEK', 'CK-O-7', 7_500.25]].sort(),
    );
    const principal = await prisma.claimItem.findMany({ where: { tenantId: f.tenantId, caseId: created.id, itemType: 'PRINCIPAL' } });
    expect(principal).toHaveLength(2);
    const bySerial = new Map(instruments.map((i) => [i.id, i.serialNo]));
    expect(principal.map((p) => [bySerial.get(p.instrumentId as string), Number(p.amount)]).sort()).toEqual(
      [['CK-M-5', 20_000], ['CK-O-7', 7_500.25]].sort(),
    );
    expect(await prisma.due.count({ where: { caseId: created.id } })).toBe(0); // K1: çift sayım yok
  });

  it('RETTEN SONRA YENİDEN GÖNDERİM mükerrer üretmez: red → (bayrak açılır) 201 tekil → aynı istek tekrar 409, sayılar değişmez', async () => {
    const f = await fixture('resubmit');
    const payload = body(f.fileNumber, [manualCek('CK-M-6', 20_000)]);
    setFlags({ manual: false });
    await expectRejectedNothingWritten(f, payload, { code: 'MANUAL_CASE_INSTRUMENTS_DISABLED' });

    setFlags({ manual: true });
    expect((await postCase(f.userId, payload)).status).toBe(201);
    const once = await tenantRowCounts(f.tenantId);
    expect(once).toMatchObject({ cases: 1, instruments: 1 });
    expect(await prisma.claimItem.count({ where: { tenantId: f.tenantId, itemType: 'PRINCIPAL' } })).toBe(1);

    const again = await postCase(f.userId, payload); // çift tıklama / yeniden gönderim
    expect(again.status).toBe(409);
    const twice = await tenantRowCounts(f.tenantId);
    expect({ ...twice, audits: 0 }).toEqual({ ...once, audits: 0 });
  });

  it('EVRAKSIZ açılış etkilenmez: iki bayrak KAPALI, instruments yok / boş → 201', async () => {
    setFlags({});
    const a = await fixture('noinst-absent');
    expect((await postCase(a.userId, body(a.fileNumber, undefined))).status).toBe(201);
    const b = await fixture('noinst-empty');
    expect((await postCase(b.userId, body(b.fileNumber, []))).status).toBe(201);
    expect(await tenantRowCounts(a.tenantId)).toMatchObject({ cases: 1, instruments: 0 });
    expect(await tenantRowCounts(b.tenantId)).toMatchObject({ cases: 1, instruments: 0 });
  });

  // ── K3 (#2843, main'de) davranış uyumu: açılışta çek tazminatı onay talebi ──

  /** K3 fixture: tenant + ofis + açan avukat (LAWYER) + onaylayıcı (PARTNER) + keşideci/ciranta borçlular. */
  async function k3Fixture(label: string) {
    const suffix = randomUUID().slice(0, 8);
    const tenantId = `test-ci-ia-k3-${label}-${suffix}`;
    tenantIds.add(tenantId);
    await prisma.tenant.create({ data: { id: tenantId, name: `CI IA K3 ${label}`, slug: tenantId } });
    const office = await prisma.office.create({ data: { tenantId, name: `CI IA K3 ofis ${label}` } });
    const lawyerUser = async (key: string, rank: 'LAWYER' | 'PARTNER') => {
      const user = await prisma.user.create({
        data: { tenantId, email: `${key}-${suffix}@example.test`, name: key, surname: 'K3', role: 'USER' },
      });
      const lawyer = await prisma.lawyer.create({
        data: { tenantId, officeId: office.id, userId: user.id, name: key, surname: 'K3', lawyerRank: rank },
      });
      return { userId: user.id, lawyerId: lawyer.id };
    };
    const opener = await lawyerUser('opener', 'LAWYER');
    await lawyerUser('approver', 'PARTNER');
    const kesideci = await prisma.debtor.create({ data: { tenantId, type: 'COMPANY', name: `IA kesideci ${label}` } as never });
    const ciranta = await prisma.debtor.create({ data: { tenantId, type: 'COMPANY', name: `IA ciranta ${label}` } as never });
    const caseDebtors = [
      { debtorId: kesideci.id, role: 'KESIDECI' },
      { debtorId: ciranta.id, role: 'CIRANTA' },
    ];
    const amount = 12_345.67;
    // Sihirbazın gösterdiği sunucu hesaplı taslak önizleme (gerçek uç, yazma yapmaz) → K6 previewHash
    const preview = await request(app.getHttpServer())
      .post('/claim-items/cek-formation/preview')
      .set('x-test-user-id', opener.userId)
      .send({
        instruments: [{ amount, currency: 'TRY', isBounced: true, bounceDate: '2026-09-01' }],
        debtors: caseDebtors.map((d) => ({ tempId: d.debtorId, role: d.role })),
      });
    expect(preview.status).toBe(201);
    expect(preview.body.data).toMatchObject({ durum: 'HESAPLANDI', tazminat: { tutar: 1_234.57 } });
    const payload = {
      fileNumber: `CI-IA-K3-${label}-${suffix}`,
      type: 'CHECK',
      lawyers: [{ id: opener.lawyerId, name: 'opener', surname: 'K3' }],
      caseDebtors,
      instruments: [
        {
          ...manualCek(`K3-${suffix}`, amount),
          dueDate: '2026-08-31',
          isBounced: true,
          bounceDate: '2026-09-01',
        },
      ],
      checkPenaltyFormation: { requested: true, idempotencyKey: `wizard-${suffix}`, previewHash: preview.body.data.previewHash },
    };
    return { tenantId, opener, payload, amount, suffix };
  }

  const k3Rows = async (tenantId: string) => ({
    approvals: await prisma.officeApprovalRequest.findMany({ where: { tenantId } }),
    penalty: await prisma.claimItem.count({ where: { tenantId, itemType: 'CHECK_PENALTY' } }),
    principal: await prisma.claimItem.findMany({ where: { tenantId, itemType: 'PRINCIPAL' } }),
    k3Audits: await prisma.auditLog.count({
      where: { tenantId, action: { in: ['CASE_OPEN_CHECK_PENALTY_FORMATION_REQUESTED', 'CASE_OPEN_CHECK_PENALTY_FORMATION_SKIPPED'] } },
    }),
  });

  it('K3: kabul reddinde (MANUAL kapalı) K3 talebi seçilmiş olsa da HİÇBİR onay talebi / kalem / dosya / K3 denetimi oluşmaz', async () => {
    setFlags({ manual: false, ocr: true });
    const k = await k3Fixture('reject');
    const res = await postCase(k.opener.userId, k.payload);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MANUAL_CASE_INSTRUMENTS_DISABLED');
    expect(await k3Rows(k.tenantId)).toEqual({ approvals: [], penalty: 0, principal: [], k3Audits: 0 });
    expect(await prisma.case.count({ where: { tenantId: k.tenantId } })).toBe(0);
    expect(await prisma.caseDebtor.count({ where: { case: { tenantId: k.tenantId } } })).toBe(0);
  });

  it('K3 GERÇEK AÇILIŞ (yetki durumu main\'deki gibi): 201, PRINCIPAL tekil ve doğru; K3 sonucu TEK kayıt — mevcut kapı REDDEDER (CASE_FINANCE_PERMISSION_REQUIRED), onay talebi yok', async () => {
    setFlags({ manual: true });
    const k = await k3Fixture('real');
    const res = await postCase(k.opener.userId, k.payload);
    expect(res.status).toBe(201);
    expect(res.body.checkPenaltyFormation?.results).toEqual([
      expect.objectContaining({ status: 'REJECTED', errorCode: 'CASE_FINANCE_PERMISSION_REQUIRED' }),
    ]);
    const rows = await k3Rows(k.tenantId);
    expect(rows.approvals).toHaveLength(0);
    expect(rows.penalty).toBe(0);
    expect(rows.principal.map((p) => Number(p.amount))).toEqual([k.amount]);
    expect(rows.k3Audits).toBe(1);
  });

  it('K3 YETKİ ÖNKOŞULU SAĞLANINCA (owner kararı A benzetimi, yalnız bu testte DB tetikleyicisiyle): 201, TEK REQUESTED onay talebi + TEK PRINCIPAL; tekrar gönderim 409, ikinci talep YOK', async () => {
    setFlags({ manual: true });
    const k = await k3Fixture('perm');
    // Main'de POST /cases avukatı yetkisiz atar (açık owner kararı). Burada YALNIZ bu testin açan avukatı için,
    // atama satırı yazılırken dosyada mali düzenleme yetkisi verilir; uygulama kodu ve yazma kapısı DEĞİŞMEZ.
    const trigger = `test_ci_ia_perm_${k.suffix.replace(/[^a-z0-9]/gi, '')}`;
    await prisma.$executeRawUnsafe(
      `CREATE FUNCTION ${trigger}() RETURNS trigger AS $$ BEGIN
         IF NEW."lawyerId" = '${k.opener.lawyerId}' THEN
           NEW."casePermissions" := '{"canEditFinance": true}'::jsonb; NEW."permissionSource" := 'CUSTOM';
         END IF; RETURN NEW; END $$ LANGUAGE plpgsql`,
    );
    await prisma.$executeRawUnsafe(
      `CREATE TRIGGER ${trigger} BEFORE INSERT ON "CaseLawyer" FOR EACH ROW EXECUTE FUNCTION ${trigger}()`,
    );
    try {
      const res = await postCase(k.opener.userId, k.payload);
      expect(res.status).toBe(201);
      const results = res.body.checkPenaltyFormation?.results;
      expect(results).toEqual([expect.objectContaining({ status: 'REQUESTED' })]);
      const rows = await k3Rows(k.tenantId);
      expect(rows.approvals.map((a) => [a.id, a.status])).toEqual([[results[0].approvalRequestId, OfficeApprovalStatus.PENDING_APPROVAL]]);
      expect(rows.penalty).toBe(0); // onaydan önce kesin tazminat kalemi yok (TASLAK)
      expect(rows.principal.map((p) => Number(p.amount))).toEqual([k.amount]);
      const created = await prisma.case.findFirstOrThrow({ where: { tenantId: k.tenantId } });
      expect(Number(created.principalAmount)).toBe(k.amount);

      const again = await postCase(k.opener.userId, k.payload); // yeniden gönderim
      expect(again.status).toBe(409);
      const after = await k3Rows(k.tenantId);
      expect(after.approvals).toHaveLength(1);
      expect(after.principal).toHaveLength(1);
      expect(await prisma.case.count({ where: { tenantId: k.tenantId } })).toBe(1);
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${trigger} ON "CaseLawyer"`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS ${trigger}()`);
    }
  });
});
