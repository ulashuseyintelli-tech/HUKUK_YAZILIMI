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
import { TemplateEngineModule } from '../../template-engine/template-engine.module';
import { CaseModule } from '../case.module';

/**
 * Dosya açılışında takip sınıflandırması (#2847 bulgusu) — GERÇEK HTTP + disposable PostgreSQL.
 *
 * Kusur (önceden var olan): CreateCaseDto takipTuruId / asamaId / riskId / durumEtiketiId / mahiyetTipiId /
 * mahiyetKodu alanlarını kabul ediyor, CaseService.create() ise YAZMIYORDU → sihirbazda "Kambiyo - Çek" seçilen dosya
 * takipTuruId=NULL açılıyor, belge üretimi açık takip yolu seçimini bulamayıp ilamsız varsayımına (explicit=false)
 * düşüyordu.
 *
 * Ölçülen: (1) alanlar satıra yazılır; (2) kayıtlı takip türü + evrak türü doğru şablona ulaşır (GET belge uçları
 * yazma yapmaz — üretim kaydı / denetim oluşmaz); (3) çek bulunması tek başına kambiyo SEÇTİRMEZ (kullanıcı ilamsız
 * seçtiyse ilamsız; seçim yoksa eski davranış + explicit=false); (4) başka büroya ait / var olmayan lookup id'sinde
 * istek bütün olarak 400 ve tenant'ta HİÇBİR satır yok; düzeltilmiş istek tekil kayıt üretir; (5) sınıflandırmasız
 * açılış (isteğe bağlı sözleşme) etkilenmez.
 *
 * Gerçek giriş yolu: HTTP → CaseController / TemplateEngineController (JwtAuthGuard) → servisler → gerçek Nest DI →
 * disposable PostgreSQL. Yalnız JWT imza doğrulaması DB'den okunan test kimliğiyle değiştirilir.
 */
const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('CASE-CREATE-CLASSIFICATION DB gate blocked: CI requires an approved TEST_DATABASE_URL.');
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

describeWithDisposableDb('Dosya açılışı takip sınıflandırması — POST /cases → satır → belge şablonu (HTTP + disposable PostgreSQL)', () => {
  jest.setTimeout(120_000);

  let prisma: PrismaClient;
  let app: INestApplication;
  const tenantIds = new Set<string>();
  const savedManualFlag = process.env.MANUAL_CASE_INSTRUMENTS;

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
        TemplateEngineModule,
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
    if (savedManualFlag === undefined) delete process.env.MANUAL_CASE_INSTRUMENTS;
    else process.env.MANUAL_CASE_INSTRUMENTS = savedManualFlag;
  });

  afterAll(async () => {
    await app?.close();
    for (const tenantId of tenantIds) {
      await prisma.auditLog.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await prisma.tenant.deleteMany({ where: { id: tenantId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  /** Tenant + kullanıcı + borçlu + büronun lookup kataloğu (sihirbazın seçtiği kodlar). */
  async function fixture(label: string) {
    const suffix = randomUUID().slice(0, 8);
    const tenantId = `test-ci-cls-${label}-${suffix}`;
    tenantIds.add(tenantId);
    await prisma.tenant.create({ data: { id: tenantId, name: `CI CLS ${label}`, slug: tenantId } });
    const user = await prisma.user.create({
      data: { tenantId, email: `cls-${label}-${suffix}@example.test`, name: 'Cls', surname: 'Aktor', role: 'ADMIN' },
    });
    const debtor = await prisma.debtor.create({ data: { tenantId, type: 'COMPANY', name: `CLS keşideci ${label}` } as never });
    const takipTuru = async (code: string, name: string) => (await prisma.lookupTakipTuru.create({ data: { tenantId, code, name } })).id;
    const lookups = {
      kambiyoCek: await takipTuru('KAMBIYO_CEK', 'Kambiyo - Çek'),
      kambiyoSenet: await takipTuru('KAMBIYO_SENET', 'Kambiyo - Senet'),
      ilamsizGenel: await takipTuru('ILAMSIZ_GENEL', 'İlamsız Genel Haciz'),
      asama: (await prisma.lookupAsama.create({ data: { tenantId, code: 'DOSYA_ACILDI', name: 'Dosya Açıldı' } })).id,
      risk: (await prisma.lookupRisk.create({ data: { tenantId, code: 'ORTA', name: 'Orta' } as never })).id,
      durumEtiketi: (await prisma.lookupDurumEtiketi.create({ data: { tenantId, code: 'TAKIPTE', name: 'Takipte' } as never })).id,
      mahiyetCek: (await prisma.lookupMahiyetTipi.create({ data: { tenantId, code: 'CEK', name: 'Çek Alacağı' } })).id,
      mahiyetPara: (await prisma.lookupMahiyetTipi.create({ data: { tenantId, code: 'PARA', name: 'Genel Para Alacağı' } })).id,
    };
    return { tenantId, userId: user.id, debtorId: debtor.id, suffix, lookups, fileNumber: `CI-CLS-${label}-${suffix}` };
  }

  type Fixture = Awaited<ReturnType<typeof fixture>>;

  /** Sihirbazın manuel çek kaydı (routeClaimRawsForManualInstruments çıktısı şekli). */
  const manualCek = (documentNo: string, amount = 15_000) => ({
    type: 'CEK',
    amount,
    issueDate: '2026-01-10',
    documentNo,
    currency: 'TRY',
    source: 'MANUAL',
  });

  /** Kambiyo sihirbazı → Çek → Haciz gövdesi (web doCreateCase şekli; #2847 ölçümündeki seçimler). */
  const kambiyoCekBody = (f: Fixture) => ({
    fileNumber: f.fileNumber,
    type: 'CHECK',
    subType: 'FORM_10',
    subCategory: 'GENEL',
    executionPath: 'HACIZ',
    takipTuruId: f.lookups.kambiyoCek,
    asamaId: f.lookups.asama,
    riskId: f.lookups.risk,
    durumEtiketiId: f.lookups.durumEtiketi,
    mahiyetTipiId: f.lookups.mahiyetCek,
    mahiyetKodu: 'CEK',
    // Satır içi yeni taraflar: red senaryosunda HİÇBİRİ yaratılmamalı
    creditors: [{ type: 'INDIVIDUAL', name: 'Ayşe Alacaklı', phone: '5550001133', address: 'Kadıköy / İstanbul' }],
    lawyers: [{ name: 'Ada', surname: 'Vekil', barNumber: `BR-${f.fileNumber}` }],
    caseDebtors: [{ debtorId: f.debtorId, role: 'KESIDECI' }],
    instruments: [manualCek(`CK-${f.suffix}`)],
  });

  const postCase = (userId: string, payload: object) =>
    request(app.getHttpServer()).post('/cases').set('x-test-user-id', userId).send(payload);
  const getDoc = (userId: string, path: string) => request(app.getHttpServer()).get(path).set('x-test-user-id', userId);

  /** Dosya açılışının yazabileceği her şey — "istek bütün olarak reddedildi" iddiasının ölçüm birimi. */
  async function tenantRowCounts(tenantId: string) {
    const [cases, instruments, claimItems, dues, clients, lawyers, caseDebtors, approvals, audits, artifacts] = await Promise.all([
      prisma.case.count({ where: { tenantId } }),
      prisma.caseInstrument.count({ where: { tenantId } }),
      prisma.claimItem.count({ where: { tenantId } }),
      prisma.due.count({ where: { case: { tenantId } } }),
      prisma.client.count({ where: { tenantId } }),
      prisma.lawyer.count({ where: { tenantId } }),
      prisma.caseDebtor.count({ where: { case: { tenantId } } }),
      prisma.officeApprovalRequest.count({ where: { tenantId } }),
      prisma.auditLog.count({ where: { tenantId } }),
      prisma.documentArtifact.count({ where: { tenantId } }),
    ]);
    return { cases, instruments, claimItems, dues, clients, lawyers, caseDebtors, approvals, audits, artifacts };
  }

  it('KAMBİYO - ÇEK: sınıflandırma alanları satıra yazılır; kayıtlı takip türü + çek kaydı Örnek 1 kambiyo çek / Örnek 10 şablonuna ulaşır (explicit)', async () => {
    process.env.MANUAL_CASE_INSTRUMENTS = 'true';
    const f = await fixture('kcek');
    const res = await postCase(f.userId, kambiyoCekBody(f));
    expect(res.status).toBe(201);

    const row = await prisma.case.findFirstOrThrow({ where: { tenantId: f.tenantId, fileNumber: f.fileNumber } });
    expect(row).toMatchObject({
      type: 'CHECK',
      subType: 'FORM_10',
      takipTuruId: f.lookups.kambiyoCek,
      asamaId: f.lookups.asama,
      riskId: f.lookups.risk,
      durumEtiketiId: f.lookups.durumEtiketi,
      mahiyetTipiId: f.lookups.mahiyetCek,
      mahiyetKodu: 'CEK',
    });

    const before = await tenantRowCounts(f.tenantId);
    const talep = await getDoc(f.userId, `/template-engine/takip-talebi/case/${row.id}`);
    expect(talep.status).toBe(200);
    expect(talep.body.templateCode).toBe('ORNEK_1_KAMBIYO_CEK');
    expect(talep.body.selection).toEqual({ kind: 'KAMBIYO_CEK', basis: 'TAKIP_TURU', explicit: true, warnings: [] });

    const odemeEmri = await getDoc(f.userId, `/template-engine/odeme-emri/case/${row.id}`);
    expect(odemeEmri.status).toBe(200);
    expect(odemeEmri.body.title).toBe('ODEME EMRI (ORNEK 10)');
    expect(odemeEmri.body.selection).toMatchObject({ kind: 'KAMBIYO_CEK', explicit: true });
    // GET belge uçları üretim kaydı / denetim yazmaz; mevcut kayıtlar değişmez
    expect(await tenantRowCounts(f.tenantId)).toEqual(before);
  });

  it('ÇEK VAR, KULLANICI İLAMSIZ SEÇTİ: çek kaydı kambiyo SEÇTİRMEZ → Örnek 1 ilamsız / Örnek 7 (explicit, TAKIP_TURU)', async () => {
    process.env.MANUAL_CASE_INSTRUMENTS = 'true';
    const f = await fixture('ilamsiz');
    const res = await postCase(f.userId, {
      ...kambiyoCekBody(f),
      subType: 'FORM_7',
      takipTuruId: f.lookups.ilamsizGenel,
      mahiyetTipiId: f.lookups.mahiyetPara,
      mahiyetKodu: 'PARA',
    });
    expect(res.status).toBe(201);
    const row = await prisma.case.findFirstOrThrow({ where: { tenantId: f.tenantId } });
    expect(row).toMatchObject({ takipTuruId: f.lookups.ilamsizGenel, mahiyetTipiId: f.lookups.mahiyetPara, mahiyetKodu: 'PARA' });
    expect(await prisma.caseInstrument.count({ where: { tenantId: f.tenantId, instrumentType: 'CEK' } })).toBe(1);

    const talep = await getDoc(f.userId, `/template-engine/takip-talebi/case/${row.id}`);
    expect(talep.status).toBe(200);
    expect(talep.body.templateCode).toBe('ORNEK_1_ILAMSIZ');
    expect(talep.body.selection).toEqual({ kind: 'ILAMSIZ', basis: 'TAKIP_TURU', explicit: true, warnings: [] });
    const odemeEmri = await getDoc(f.userId, `/template-engine/odeme-emri/case/${row.id}`);
    expect(odemeEmri.body.title).toBe('ODEME EMRI (ORNEK 7)');
  });

  it('SINIFLANDIRMA VERİLMEDİ (isteğe bağlı sözleşme): 201, alanlar NULL; belge kambiyo SEÇMEZ, seçimsizlik explicit=false + uyarıyla görünür', async () => {
    process.env.MANUAL_CASE_INSTRUMENTS = 'true';
    const f = await fixture('none');
    const body: Record<string, unknown> = { ...kambiyoCekBody(f), subType: undefined };
    for (const k of ['takipTuruId', 'asamaId', 'riskId', 'durumEtiketiId', 'mahiyetTipiId', 'mahiyetKodu']) delete body[k];
    const res = await postCase(f.userId, body);
    expect(res.status).toBe(201);
    const row = await prisma.case.findFirstOrThrow({ where: { tenantId: f.tenantId } });
    expect(row).toMatchObject({ takipTuruId: null, asamaId: null, riskId: null, durumEtiketiId: null, mahiyetTipiId: null, mahiyetKodu: null });

    const talep = await getDoc(f.userId, `/template-engine/takip-talebi/case/${row.id}`);
    expect(talep.body.templateCode).toBe('ORNEK_1_ILAMSIZ');
    expect(talep.body.selection).toEqual({
      kind: 'ILAMSIZ',
      basis: 'NOT_SELECTED',
      explicit: false,
      warnings: ['TAKIP_YOLU_ACIKCA_SECILMEMIS', 'KAMBIYO_SENEDI_VAR_TAKIP_YOLU_SECILMEDI'],
    });
  });

  it('GEÇERSİZ LOOKUP: her sınıflandırma alanında başka büroya ait / var olmayan id → 400; tenant\'ta HİÇBİR satır yok; düzeltilmiş istek tekil kayıt', async () => {
    process.env.MANUAL_CASE_INSTRUMENTS = 'true';
    const f = await fixture('invalid');
    const other = await fixture('other'); // başka büro: kataloğu ayrı
    const invalidCases: Array<[string, string]> = [
      ['takipTuruId', other.lookups.kambiyoCek],
      ['asamaId', other.lookups.asama],
      ['riskId', other.lookups.risk],
      ['durumEtiketiId', other.lookups.durumEtiketi],
      ['mahiyetTipiId', other.lookups.mahiyetCek],
      ['takipTuruId', `yok-${f.suffix}`],
    ];
    const empty = await tenantRowCounts(f.tenantId);
    expect(empty).toMatchObject({ cases: 0, clients: 0, lawyers: 0 });
    for (const [field, value] of invalidCases) {
      const res = await postCase(f.userId, {
        ...kambiyoCekBody(f),
        [field]: value,
        dues: [{ type: 'PRINCIPAL', amount: 1_000, dueDate: '2026-01-10', description: 'Ek kalem' }],
      });
      expect({ field, status: res.status }).toEqual({ field, status: 400 });
      expect(res.body.message).toEqual(expect.stringContaining('Geçersiz lookup ID'));
      expect(await tenantRowCounts(f.tenantId)).toEqual(empty);
    }
    expect(await prisma.case.count({ where: { fileNumber: f.fileNumber } })).toBe(0);

    // Düzeltilmiş istek (aynı taslak, geçerli seçim) tekil kayıt üretir; tekrarı 409 (mükerrer yok)
    const ok = await postCase(f.userId, kambiyoCekBody(f));
    expect(ok.status).toBe(201);
    expect(await tenantRowCounts(f.tenantId)).toMatchObject({ cases: 1, instruments: 1, clients: 1, lawyers: 1, caseDebtors: 1 });
    expect((await postCase(f.userId, kambiyoCekBody(f))).status).toBe(409);
    expect(await prisma.case.count({ where: { tenantId: f.tenantId } })).toBe(1);
    // Başka büronun kataloğuna dokunulmadı
    expect(await prisma.case.count({ where: { tenantId: other.tenantId } })).toBe(0);
  });

  it('BELGE TÜRÜ ÇELİŞKİSİ (belgelenmiş, olgusal): çek alt formu + Kambiyo - Senet takip türü → 400; tenant\'ta HİÇBİR satır yok; düzeltilmiş istek 201', async () => {
    process.env.MANUAL_CASE_INSTRUMENTS = 'true';
    const f = await fixture('kind-conflict');
    const empty = await tenantRowCounts(f.tenantId);
    for (const [subType, takipTuruId] of [
      ['FORM_10_CEK', f.lookups.kambiyoSenet],
      ['FORM_10_BONO', f.lookups.kambiyoCek],
      ['FORM_10_POLICE', f.lookups.kambiyoCek],
    ] as const) {
      const res = await postCase(f.userId, { ...kambiyoCekBody(f), subType, takipTuruId });
      expect({ subType, status: res.status }).toEqual({ subType, status: 400 });
      expect(res.body.code).toBe('CASE_CLASSIFICATION_DOCUMENT_KIND_CONFLICT');
      expect(res.body.message).toEqual(expect.stringContaining('takip oluşturulmadı'));
      expect(await tenantRowCounts(f.tenantId)).toEqual(empty);
    }
    const ok = await postCase(f.userId, { ...kambiyoCekBody(f), subType: 'FORM_10_CEK', takipTuruId: f.lookups.kambiyoCek });
    expect(ok.status).toBe(201);
  });

  it('HUKUKİ TERCİH DENETLENMEZ: çek alt formu + ilamsız genel haciz ve alt formsuz FORM_10 + Kambiyo - Senet kabul edilir', async () => {
    process.env.MANUAL_CASE_INSTRUMENTS = 'true';
    const f = await fixture('kind-allowed');
    const a = await postCase(f.userId, {
      ...kambiyoCekBody(f),
      subType: 'FORM_10_CEK',
      takipTuruId: f.lookups.ilamsizGenel,
      mahiyetTipiId: f.lookups.mahiyetPara,
      mahiyetKodu: 'PARA',
    });
    expect(a.status).toBe(201);
    const g = await fixture('kind-allowed-2');
    const b = await postCase(g.userId, { ...kambiyoCekBody(g), subType: 'FORM_10', takipTuruId: g.lookups.kambiyoSenet });
    expect(b.status).toBe(201);
  });

  it('EVRAKSIZ, yalnız Due ile ilamsız açılış (mevcut desteklenen akış) etkilenmez; sınıflandırma yazılır', async () => {
    const f = await fixture('plain');
    const res = await postCase(f.userId, {
      fileNumber: f.fileNumber,
      type: 'GENERAL_EXECUTION',
      subType: 'FORM_7',
      takipTuruId: f.lookups.ilamsizGenel,
      mahiyetTipiId: f.lookups.mahiyetPara,
      mahiyetKodu: 'PARA',
      caseDebtors: [{ debtorId: f.debtorId, role: 'ASIL_BORCLU' }],
      dues: [{ type: 'PRINCIPAL', amount: 4_250.5, dueDate: '2026-02-01', description: 'Fatura bedeli' }],
    });
    expect(res.status).toBe(201);
    const row = await prisma.case.findFirstOrThrow({ where: { tenantId: f.tenantId } });
    expect(row).toMatchObject({ type: 'GENERAL_EXECUTION', subType: 'FORM_7', takipTuruId: f.lookups.ilamsizGenel, mahiyetKodu: 'PARA' });
    expect(await prisma.claimItem.count({ where: { tenantId: f.tenantId, itemType: 'PRINCIPAL' } })).toBe(1);
  });
});
