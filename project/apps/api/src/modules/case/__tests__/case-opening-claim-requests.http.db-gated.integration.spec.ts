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
import { OfficeApprovalStatus, PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import * as request from 'supertest';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { StorageModule } from '../../../common/storage/storage.module';
import { ClientInfoRequestService } from '../../address-discovery/client-info-request.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ErrorLogModule } from '../../error-log/error-log.module';
import { defaultPermissionsFingerprint } from '../../lawyer/lawyer-default-permissions-fingerprint';
import { MetricsRegistryModule } from '../../metrics-registry/metrics-registry.module';
import { OfficeApprovalService } from '../../office-approval/office-approval.service';
import { CaseModule } from '../case.module';
import { CaseService } from '../case.service';

/**
 * DOSYA AÇILIŞINDA KALEM BEYANLARI (owner talimatı 2026-11-18) — ilam bilgisi, vekâlet ücreti kaynağı, faiz beyanı ve
 * borçlu sorumluluğu seçimi. GERÇEK HTTP (POST /cases/opening-claim-preview, POST /cases, GET hesap uçları) + üretim
 * ValidationPipe + gerçek kalem yazma kapısı + mevcut iki kişi onayı ve onay yürütmesi + gerçek oran tablosu +
 * disposable PostgreSQL.
 *
 * Kanıtlanan:
 *  1. Açılışta ilam bilgisi (mahkeme, esas / karar, karar ve kesinleşme tarihi), tür ve vekâlet ücreti kaynağı kaleme
 *     yazılır. "Faiz işler" beyanı ve sorumluluk seçimi YAZILMAZ: kalem "belirlenmedi" açılır, seçim kaydı oluşmaz, üç
 *     onay talebi bekler; hesap faizi "belirlenemedi" gösterir (sıfır değil).
 *  2. Talep eden kendi talebini onaylayamaz. İkinci kişi onaylayınca faiz hesaplanır, paylı sorumluluk etkinleşir.
 *  3. Ters onay sırası: sorumluluk önce onaylanırsa faiz talebi bayatlar (mevcut bayatlık kapısı); kalem değişmez.
 *  4. Gösterilmemiş / değişmiş girdi, geçersiz beyan ya da kapalı seçim bayrağında dosya HİÇ oluşmaz (kısmi kayıt yok).
 *  5. Dosyada mali düzenleme yetkisi olmayan kullanıcıda dosya açılır, talepler açılmaz; neden yanıtta ve denetimde.
 *  6. Tekrar gönderim ikinci dosya ya da ikinci talep üretmez. Beyansız açılış bugünkü gibidir.
 * Tutarlar, oran, mahkeme ve tarihler SENTETİKTİR.
 */
const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('CASE-OPENING-CLAIM-REQUESTS DB gate blocked: CI requires an approved TEST_DATABASE_URL.');
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;

const PRODUCTION_VALIDATION_OPTIONS = { whitelist: true, forbidNonWhitelisted: true, transform: true } as const;
const FLAG = 'CLAIM_LIABILITY_SELECTION_ENABLED';

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

describeWithDisposableDb('Dosya açılışında kalem beyanları — POST /cases (HTTP + disposable PostgreSQL)', () => {
  jest.setTimeout(180_000);

  let prisma: PrismaClient;
  let app: INestApplication;
  let approvals: OfficeApprovalService;
  const tenantIds = new Set<string>();
  const officeIds = new Set<string>();
  const savedFlag = process.env[FLAG];
  const AS_OF = '2026-11-01';
  const TAKIP = '2026-10-20';
  const KESINLESME = '2025-04-02';
  const ORAN = 0.24;
  const VEKALET_TUTARI = 4200.01;
  const YARGILAMA_TUTARI = 480;

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
    approvals = app.get(OfficeApprovalService);
    // Açılışın bu testle ilgisiz arka plan yan etkileri (müvekkil bilgi talebi, açılış masraf otomasyonu) kapatılır.
    jest.spyOn(app.get(ClientInfoRequestService), 'sendAutoRequestOnCaseCreate').mockResolvedValue(undefined);
    jest.spyOn(app.get(CaseService) as any, 'runOpeningExpenseAutomation').mockResolvedValue(undefined);
  });

  beforeEach(() => {
    process.env[FLAG] = 'true';
  });

  afterAll(async () => {
    await app?.close();
    await prisma.rateSchedule.deleteMany({ where: { tenantId: { in: [...officeIds] } } }).catch(() => undefined);
    for (const tenantId of tenantIds) {
      await prisma.auditLog.deleteMany({ where: { tenantId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
    if (savedFlag === undefined) delete process.env[FLAG];
    else process.env[FLAG] = savedFlag;
  });

  async function fixture(label: string, options: { openerHasFinanceDefault?: boolean } = {}) {
    const suffix = randomUUID().slice(0, 8);
    const tenantId = `test-ci-acilis-${label}-${suffix}`;
    tenantIds.add(tenantId);
    await prisma.tenant.create({ data: { id: tenantId, name: `CI ACILIS ${label}`, slug: tenantId } });
    const office = await prisma.office.create({ data: { tenantId, name: `CI ACILIS ${label} Büro` } });
    officeIds.add(office.id);
    await prisma.rateSchedule.create({
      data: {
        tenantId: office.id,
        interestType: 'LEGAL_3095',
        validFrom: new Date('2025-01-01T00:00:00.000Z'),
        validTo: null,
        annualRate: ORAN,
        source: 'MANUAL',
        sourceRef: 'sentetik test orani',
        versionHash: `acilis-${suffix}`,
      },
    });
    const openerUser = await prisma.user.create({ data: { tenantId, email: `acan-${suffix}@example.test`, name: 'Dosya', surname: 'Açan', role: 'USER' } });
    // Dosyada mali düzenleme yetkisi yalnız ofis yönetimince AÇIKÇA belirlenmiş varsayılandan gelir (K3 kararı A):
    // yönetim kaydı + değer parmak izi. Yoksa açılışta yetki yazılmaz.
    const openerDefaults = options.openerHasFinanceDefault === false ? null : { canEditFinance: true };
    const openerLawyer = await prisma.lawyer.create({
      data: {
        tenantId,
        officeId: office.id,
        userId: openerUser.id,
        name: 'Dosya',
        surname: 'Açan',
        lawyerRank: 'LAWYER',
        ...(openerDefaults ? { defaultPermissions: openerDefaults } : {}),
      },
    });
    if (openerDefaults) {
      await prisma.auditLog.create({
        data: {
          tenantId,
          action: 'LAWYER_PRIVILEGE_CHANGED',
          entityType: 'LAWYER',
          entityId: openerLawyer.id,
          metadata: { changedFields: ['defaultPermissions'], defaultPermissionsFingerprint: defaultPermissionsFingerprint(openerDefaults) },
        } as never,
      });
    }
    const approverUser = await prisma.user.create({ data: { tenantId, email: `onay-${suffix}@example.test`, name: 'Onay', surname: 'Veren', role: 'ADMIN' } });
    await prisma.lawyer.create({ data: { tenantId, officeId: office.id, userId: approverUser.id, name: 'Onay', surname: 'Veren', lawyerRank: 'PARTNER' } });
    const client = await prisma.client.create({ data: { tenantId, type: 'COMPANY', name: `Sentetik Alacaklı ${suffix}` } });
    const b1 = await prisma.debtor.create({ data: { tenantId, type: 'INDIVIDUAL', name: 'Sentetik Borçlu Bir' } as never });
    const b2 = await prisma.debtor.create({ data: { tenantId, type: 'INDIVIDUAL', name: 'Sentetik Borçlu İki' } as never });
    return {
      tenantId,
      suffix,
      opener: openerUser.id,
      openerLawyerId: openerLawyer.id,
      approver: approverUser.id,
      clientId: client.id,
      b1: b1.id,
      b2: b2.id,
    };
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;

  // Yeni dosya formunun ürettiği biçim: tür açık, faiz durumu "belirlenmedi", faiz türü kalemin kendi kaydı.
  const ilam = { sourceDocumentType: 'ILAM', ilamMahkeme: 'Sentetik 1. Asliye Hukuk Mahkemesi', ilamEsasNo: '2024/1', ilamKararNo: '2025/2', issueDate: '2025-02-03', ilamKesinlesmeTarihi: KESINLESME };
  const yasal = { interestType: 'YASAL', interestTypeCode: 'LEGAL_3095', interestAccrualStatus: 'UNKNOWN' };
  const vekalet = { type: 'VEKALET_UCRETI', description: 'Sentetik ilam vekâlet ücreti', amount: VEKALET_TUTARI, dueDate: KESINLESME, attorneyFeeBasis: 'JUDGMENT_AWARDED', ...yasal, ...ilam };
  const yargilama = { type: 'YARGILAMA_GIDERI', description: 'Sentetik ilam yargılama gideri', amount: YARGILAMA_TUTARI, dueDate: KESINLESME, ...yasal, ...ilam };

  const faizIsler = (dueIndex: number) => ({ dueIndex, interestStartDate: KESINLESME, interestStartDateProvenance: 'JUDGMENT_FINALIZATION_DATE' });
  const esitPay = (f: Fixture, dueIndex: number) => ({
    dueIndex,
    mode: 'PROPORTIONAL',
    basis: 'COURT_JUDGMENT',
    parties: [
      { debtorId: f.b1, shareWeight: 1 },
      { debtorId: f.b2, shareWeight: 1 },
    ],
  });
  const declarations = (f: Fixture) => ({ interestAccruals: [faizIsler(0), faizIsler(1)], liabilitySelections: [esitPay(f, 0), esitPay(f, 1)] });

  const http = () => request(app.getHttpServer());
  const previewOpening = (f: Fixture, dues: unknown[], openingClaimRequests: unknown) =>
    http()
      .post('/cases/opening-claim-preview')
      .set('x-test-user-id', f.opener)
      .send({ currency: 'TRY', dues, caseDebtors: [{ debtorId: f.b1 }, { debtorId: f.b2 }], openingClaimRequests });
  const caseBody = (f: Fixture, tag: string, dues: unknown[], openingClaimRequests?: unknown) => ({
    fileNumber: `ACILIS-${tag}-${f.suffix}`,
    type: 'GENERAL_EXECUTION',
    currency: 'TRY',
    startDate: TAKIP,
    interestType: 'YASAL',
    creditors: [{ id: f.clientId, type: 'COMPANY', name: 'Sentetik Alacaklı' }],
    lawyers: [{ id: f.openerLawyerId, name: 'Dosya', surname: 'Açan' }],
    caseDebtors: [
      { debtorId: f.b1, role: 'ASIL_BORCLU' },
      { debtorId: f.b2, role: 'ASIL_BORCLU' },
    ],
    dues,
    ...(openingClaimRequests ? { openingClaimRequests } : {}),
  });
  const openCase = (f: Fixture, body: unknown) => http().post('/cases').set('x-test-user-id', f.opener).send(body as object);

  /** Önizle → dosyayı aç (gösterilen önizlemenin özetiyle). */
  async function openWithDeclarations(f: Fixture, tag: string, requests = declarations(f) as Record<string, unknown>) {
    const previewed = await previewOpening(f, [vekalet, yargilama], requests);
    expect(previewed.status).toBe(201);
    expect(previewed.body.uygulanabilir).toBe(true);
    const opened = await openCase(f, caseBody(f, tag, [vekalet, yargilama], { ...requests, previewHash: previewed.body.onizlemeOzeti }));
    return { previewed, opened };
  }

  const summary = (f: Fixture, caseId: string) => http().get(`/cases/${caseId}/calculation-summary`).query({ date: AS_OF }).set('x-test-user-id', f.approver);
  const liabilityState = (f: Fixture, caseId: string) => http().get(`/cases/${caseId}/claim-liability`).set('x-test-user-id', f.approver);
  const claimItems = (caseId: string) => prisma.claimItem.findMany({ where: { caseId }, orderBy: { itemType: 'asc' } });
  const pendingRequests = (tenantId: string) =>
    prisma.officeApprovalRequest.findMany({ where: { tenantId, status: OfficeApprovalStatus.PENDING_APPROVAL }, orderBy: { createdAt: 'asc' } });
  async function rows(tenantId: string) {
    const [cases, dues, items, caseDebtors, sets, approvalRequests] = await Promise.all([
      prisma.case.count({ where: { tenantId } }),
      prisma.due.count({ where: { case: { tenantId } } }),
      prisma.claimItem.count({ where: { tenantId } }),
      prisma.caseDebtor.count({ where: { case: { tenantId } } }),
      prisma.claimItemLiabilitySet.count({ where: { tenantId } }),
      prisma.officeApprovalRequest.count({ where: { tenantId } }),
    ]);
    return { cases, dues, items, caseDebtors, sets, approvalRequests };
  }
  const EMPTY = { cases: 0, dues: 0, items: 0, caseDebtors: 0, sets: 0, approvalRequests: 0 };
  const gun = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
  const yakinMi = (gercek: unknown, tutar: number, gunSayisi: number) =>
    typeof gercek === 'number' && Math.abs(gercek - (tutar * ORAN * gunSayisi) / 365) <= (tutar * ORAN) / 365 + 0.01;

  it('önizleme kayıt oluşturmaz; paylar ve borçlu başına dağılım sunucudan gelir', async () => {
    const f = await fixture('onizleme');
    const res = await previewOpening(f, [vekalet, yargilama], declarations(f));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ uygulanabilir: true, secimYazmaAcik: true, kalemTutarlariToplami: 4680.01, onayaGidecekFaizBeyaniSayisi: 2, onayaGidecekSorumlulukSecimiSayisi: 2 });
    expect(res.body.kalemler[0].sorumluluk.onayBekleyecekSecim.borclular.map((b: any) => b.pay)).toEqual([2100.01, 2100]);
    expect(res.body.borcluDagilimi.map((b: any) => b.sorumlulukUstSiniri)).toEqual([2340.01, 2340]);
    expect(await rows(f.tenantId)).toEqual(EMPTY);
  });

  it('açılış: ilam bilgisi + tür + vekâlet kaynağı yazılır; faiz beyanı ve seçim YAZILMAZ, onay bekler; onaydan sonra hesaba girer', async () => {
    const f = await fixture('tam');
    const { opened } = await openWithDeclarations(f, 'A');
    expect(opened.status).toBe(201);
    const caseId = opened.body.id as string;

    // ── Yanıt: üç talep açıldı; aynı kalemde iki talep olduğu için onay sırası notu var.
    const outcome = opened.body.openingClaimRequests;
    expect(outcome).toMatchObject({ requested: true, tamami: true, sorumlulukSecimi: { status: 'REQUESTED', kalemSayisi: 2 } });
    expect(outcome.faizBeyanlari.map((row: any) => row.status)).toEqual(['REQUESTED', 'REQUESTED']);
    expect(typeof outcome.onaySirasiNotu).toBe('string');

    // ── Kalemler: açılışta yazılanlar yazıldı; beyanlar yazılmadı.
    const before = await claimItems(caseId);
    expect(before.map((item) => item.itemType)).toEqual(['ATTORNEY_FEE', 'YARGILAMA_GIDERI']);
    const [vu, yg] = before;
    expect(vu.attorneyFeeBasis).toBe('JUDGMENT_AWARDED');
    expect(yg.attorneyFeeBasis).toBeNull();
    for (const item of before) {
      expect(item.sourceDocumentType).toBe('ILAM');
      expect(item.referenceNo).toBe('2024/1 E. / 2025/2 K.');
      expect(item.issueDate?.toISOString().slice(0, 10)).toBe('2025-02-03');
      expect((item.metadata as any).ilam).toEqual({ mahkemeAdi: 'Sentetik 1. Asliye Hukuk Mahkemesi', esasNo: '2024/1', kararNo: '2025/2', kesinlesmeTarihi: KESINLESME });
      expect(item.interestTypeCode).toBe('LEGAL_3095');
      // Onay bekleyen bilgi kesin sayılmaz: durum "belirlenmedi", başlangıç ve dayanak boş.
      expect(item.interestAccrualStatus).toBe('UNKNOWN');
      expect(item.interestStartDate).toBeNull();
      expect(item.interestEndDate).toBeNull();
      expect(item.interestStartDateProvenance).toBeNull();
      expect(item.isAllDebtorsLiable).toBe(true);
      expect(item.liableDebtorIds).toEqual([]);
    }
    expect(await prisma.claimItemLiabilitySet.count({ where: { tenantId: f.tenantId } })).toBe(0);

    // ── Onay kayıtları: iki kalem güncellemesi + bir toplu sorumluluk seçimi; hepsi dosyayı açanın talebi.
    const pending = await pendingRequests(f.tenantId);
    expect(pending).toHaveLength(3);
    expect(pending.every((row) => row.requesterUserId === f.opener && row.actionCode === 'CLAIM_ITEM_HIGH_IMPACT_CHANGE')).toBe(true);
    expect(pending.map((row) => row.targetType).sort()).toEqual(['CLAIM_ITEM', 'CLAIM_ITEM', 'CLAIM_ITEM_CASE']);
    const interestRequests = pending.filter((row) => row.targetType === 'CLAIM_ITEM');
    const liabilityRequest = pending.find((row) => row.targetType === 'CLAIM_ITEM_CASE')!;
    expect(outcome.faizBeyanlari.map((row: any) => row.approvalRequestId).sort()).toEqual(interestRequests.map((row) => row.id).sort());
    expect(outcome.sorumlulukSecimi.approvalRequestId).toBe(liabilityRequest.id);
    for (const row of interestRequests) {
      expect((row.savedIntent as any).proposedPatch).toMatchObject({ interestAccrualStatus: 'ACCRUES', interestStartDate: KESINLESME, interestStartDateProvenance: 'JUDGMENT_FINALIZATION_DATE' });
    }

    // ── Hesap, onaydan ÖNCE: faiz "belirlenemedi" (sıfır değil), toplam üretilmez; sorumluluk "belirlenmedi".
    const pbBefore = (await summary(f, caseId)).body.anaparasizKalemDokumu.paraBirimleri[0];
    for (const kalem of pbBefore.kalemler) {
      expect(kalem).toMatchObject({ faizDurumu: 'BELIRLENEMEDI', faizNedeni: 'ACCRUAL_STATUS_UNKNOWN' });
      expect(kalem).not.toHaveProperty('faiz');
    }
    expect(pbBefore).toMatchObject({ kalemTutarlariToplami: 4680.01, faizToplami: null, kalemVeFaizToplami: null });
    expect(pbBefore.kalemler.find((k: any) => k.kalemTuru === 'ATTORNEY_FEE').vekaletUcretiKaynagi).toBe('ILAM');
    const stateBefore = (await liabilityState(f, caseId)).body;
    expect(stateBefore.kalemler.map((k: any) => k.sorumlulukTuru)).toEqual(['BELIRLENMEDI', 'BELIRLENMEDI']);

    // ── İki kişi kuralı: dosyayı açan kendi taleplerini onaylayamaz.
    await expect(approvals.approve(interestRequests[0].id, f.opener)).rejects.toThrow();
    await expect(approvals.approve(liabilityRequest.id, f.opener)).rejects.toThrow();
    expect(await pendingRequests(f.tenantId)).toHaveLength(3);

    // ── İkinci kişi onaylar: önce faiz talepleri, sonra sorumluluk seçimi.
    for (const row of interestRequests) await approvals.approve(row.id, f.approver);
    await approvals.approve(liabilityRequest.id, f.approver);

    const after = await claimItems(caseId);
    for (const item of after) {
      expect(item.interestAccrualStatus).toBe('ACCRUES');
      expect(item.interestStartDate?.toISOString().slice(0, 10)).toBe(KESINLESME);
      expect(item.interestStartDateProvenance).toBe('JUDGMENT_FINALIZATION_DATE');
      expect(item.isAllDebtorsLiable).toBe(false);
    }
    const sets = await prisma.claimItemLiabilitySet.findMany({ where: { tenantId: f.tenantId, status: 'ACTIVE' }, include: { parties: true } });
    expect(sets).toHaveLength(2);
    for (const set of sets) {
      expect(set).toMatchObject({ mode: 'PROPORTIONAL', basis: 'COURT_JUDGMENT', appliedVia: 'BULK', approvalRequestId: liabilityRequest.id, decidedByUserId: f.opener });
      expect(set.parties.map((party) => party.shareWeight)).toEqual([1, 1]);
    }

    // ── Hesap, onaydan SONRA: faiz kalem bazında hesaplanır; paylar kalemin tam tutarından.
    const pbAfter = (await summary(f, caseId)).body.anaparasizKalemDokumu.paraBirimleri[0];
    const vuAfter = pbAfter.kalemler.find((k: any) => k.kalemTuru === 'ATTORNEY_FEE');
    const ygAfter = pbAfter.kalemler.find((k: any) => k.kalemTuru === 'YARGILAMA_GIDERI');
    expect(vuAfter).toMatchObject({ faizDurumu: 'HESAPLANDI', faiz: { baslangic: KESINLESME, baslangicDayanagi: 'JUDGMENT_FINALIZATION_DATE', faizTuru: 'LEGAL_3095' } });
    expect(yakinMi(vuAfter.faiz.takipOncesi, VEKALET_TUTARI, gun(KESINLESME, TAKIP))).toBe(true);
    expect(yakinMi(vuAfter.faiz.takipSonrasi, VEKALET_TUTARI, gun(TAKIP, AS_OF))).toBe(true);
    expect(yakinMi(ygAfter.faiz.takipOncesi, YARGILAMA_TUTARI, gun(KESINLESME, TAKIP))).toBe(true);
    const stateAfter = (await liabilityState(f, caseId)).body;
    expect(stateAfter.kalemler.map((k: any) => k.sorumlulukTuru)).toEqual(['PAYLI', 'PAYLI']);
    const vuState = stateAfter.kalemler.find((k: any) => k.kalemTuru === 'ATTORNEY_FEE');
    expect(vuState.taraflar.map((t: any) => t.pay)).toEqual([2100.01, 2100]);
    // Dosya kalanı tek rakam: borçlu payları toplanarak üretilmez.
    expect(stateAfter.dosyaKalani).toEqual([{ paraBirimi: 'TRY', kalan: 4680.01 }]);

    // ── Denetim: önizleme ↔ talep bağı kayıtlı.
    const audit = await prisma.auditLog.findFirst({ where: { tenantId: f.tenantId, action: 'CASE_OPEN_CLAIM_REQUESTS_REQUESTED', entityId: caseId } });
    expect(audit?.userId).toBe(f.opener);
    expect((audit?.metadata as any).previewHash).toBe(outcome.previewHash);
  });

  it('ters onay sırası: sorumluluk önce onaylanırsa faiz talebi bayatlar; kalemin faizi değişmez', async () => {
    const f = await fixture('ters');
    const { opened } = await openWithDeclarations(f, 'T');
    expect(opened.status).toBe(201);
    const pending = await pendingRequests(f.tenantId);
    const liabilityRequest = pending.find((row) => row.targetType === 'CLAIM_ITEM_CASE')!;
    const interestRequest = pending.find((row) => row.targetType === 'CLAIM_ITEM')!;

    await approvals.approve(liabilityRequest.id, f.approver);
    await expect(approvals.approve(interestRequest.id, f.approver)).rejects.toThrow('stale-state conflict');

    for (const item of await claimItems(opened.body.id)) {
      expect(item.interestAccrualStatus).toBe('UNKNOWN');
      expect(item.interestStartDate).toBeNull();
    }
  });

  it('gösterilen önizlemeden sonra girdi değişmişse dosya hiç oluşmaz (409)', async () => {
    const f = await fixture('bayat');
    const previewed = await previewOpening(f, [vekalet, yargilama], declarations(f));
    const changedDues = [{ ...vekalet, amount: VEKALET_TUTARI + 1 }, yargilama];
    const res = await openCase(f, caseBody(f, 'B', changedDues, { ...declarations(f), previewHash: previewed.body.onizlemeOzeti }));
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('OPENING_CLAIM_PREVIEW_STALE');
    expect(await rows(f.tenantId)).toEqual(EMPTY);
  });

  it.each([
    ['başlangıç tarihi eksik faiz beyanı', (f: Fixture) => ({ interestAccruals: [{ dueIndex: 0, interestStartDateProvenance: 'JUDGMENT_DATE' }] }), 'INTEREST_ACCRUAL_INVALID'],
    ['dayanaksız sorumluluk seçimi', (f: Fixture) => ({ liabilitySelections: [{ ...esitPay(f, 0), basis: undefined }] }), 'BASIS_REQUIRED'],
    ['dosyada olmayan borçlu', (f: Fixture) => ({ liabilitySelections: [{ ...esitPay(f, 0), parties: [{ debtorId: f.b1, shareWeight: 1 }, { debtorId: 'yabanci-borclu', shareWeight: 1 }] }] }), 'PARTY_NOT_ACTIVE_CASE_DEBTOR'],
  ])('geçersiz beyan (%s) → 400; dosya, taraf, kalem ve talep oluşmaz', async (_ad, build, kod) => {
    const f = await fixture('gecersiz');
    const requests = build(f);
    const previewed = await previewOpening(f, [vekalet, yargilama], requests);
    expect(previewed.body.uygulanabilir).toBe(false);
    const res = await openCase(f, caseBody(f, 'G', [vekalet, yargilama], { ...requests, previewHash: previewed.body.onizlemeOzeti }));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('OPENING_CLAIM_REQUESTS_INVALID');
    expect(res.body.errors.map((error: any) => error.kod)).toContain(kod);
    expect(await rows(f.tenantId)).toEqual(EMPTY);
  });

  it('önizleme özeti gönderilmemiş beyan reddedilir (400); beyanlı kalemde açılışta faiz tarihi yazılamaz', async () => {
    const f = await fixture('ozetsiz');
    const noHash = await openCase(f, caseBody(f, 'O', [vekalet, yargilama], declarations(f)));
    expect(noHash.status).toBe(400);
    const datedDues = [{ ...vekalet, interestStartDate: '2025-01-01', interestEndDate: TAKIP }, yargilama];
    const previewed = await previewOpening(f, datedDues, { interestAccruals: [faizIsler(0)] });
    expect(previewed.body.hatalar.map((hata: any) => hata.kod)).toEqual(['INTEREST_ACCRUAL_DUE_DATES_CONFLICT']);
    const res = await openCase(f, caseBody(f, 'O2', datedDues, { interestAccruals: [faizIsler(0)], previewHash: previewed.body.onizlemeOzeti }));
    expect(res.status).toBe(400);
    expect(await rows(f.tenantId)).toEqual(EMPTY);
  });

  it('yarım doldurulmuş beyan: önizleme 400 ile kesilmez, kalem bazında okunur hata döner; açılış isteği yine reddedilir', async () => {
    const f = await fixture('yarim');
    const yarim = {
      interestAccruals: [{ dueIndex: 0, interestStartDateProvenance: '' }],
      liabilitySelections: [{ dueIndex: 1, mode: 'PROPORTIONAL', parties: [{ debtorId: f.b1, sharePercent: '6o' }, { debtorId: f.b2 }] }],
    };
    const previewed = await previewOpening(f, [vekalet, yargilama], yarim);
    expect(previewed.status).toBe(201);
    expect(previewed.body.uygulanabilir).toBe(false);
    expect(previewed.body.hatalar.map((hata: any) => [hata.dueIndex, hata.kod])).toEqual([
      [0, 'INTEREST_ACCRUAL_INVALID'],
      [1, 'SHARE_INPUT_INVALID'],
    ]);
    expect(previewed.body.hatalar[0].mesaj).toBe('"Faiz işler" beyanı için faiz başlangıcının dayanağı seçilmelidir.');
    // Kalemlerin kendisi yine gösterilir (toplam ve açılış durumu); geçersiz beyan onaya gidecekler arasında yoktur.
    expect(previewed.body).toMatchObject({ kalemTutarlariToplami: 4680.01, onayaGidecekFaizBeyaniSayisi: 0, onayaGidecekSorumlulukSecimiSayisi: 0 });
    const res = await openCase(f, caseBody(f, 'H', [vekalet, yargilama], { ...yarim, previewHash: previewed.body.onizlemeOzeti }));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('OPENING_CLAIM_REQUESTS_INVALID');
    expect(await rows(f.tenantId)).toEqual(EMPTY);
  });

  it('seçim bayrağı kapalı: seçim içeren açılış 409 ve hiçbir kayıt yok; yalnız faiz beyanı içeren açılış çalışır', async () => {
    const f = await fixture('bayrak');
    process.env[FLAG] = 'false';
    const previewed = await previewOpening(f, [vekalet, yargilama], declarations(f));
    expect(previewed.body.secimYazmaAcik).toBe(false);
    const blocked = await openCase(f, caseBody(f, 'F', [vekalet, yargilama], { ...declarations(f), previewHash: previewed.body.onizlemeOzeti }));
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe('CLAIM_LIABILITY_SELECTION_DISABLED');
    expect(await rows(f.tenantId)).toEqual(EMPTY);

    const onlyInterest = { interestAccruals: [faizIsler(0)] };
    const interestPreview = await previewOpening(f, [vekalet, yargilama], onlyInterest);
    const opened = await openCase(f, caseBody(f, 'F2', [vekalet, yargilama], { ...onlyInterest, previewHash: interestPreview.body.onizlemeOzeti }));
    expect(opened.status).toBe(201);
    expect(opened.body.openingClaimRequests).toMatchObject({ tamami: true, sorumlulukSecimi: null, onaySirasiNotu: null });
    expect(await rows(f.tenantId)).toMatchObject({ cases: 1, items: 2, sets: 0, approvalRequests: 1 });
  });

  it('dosyada mali düzenleme yetkisi olmayan kullanıcı: dosya açılır, talepler açılmaz; neden yanıtta ve denetimde', async () => {
    const f = await fixture('yetkisiz', { openerHasFinanceDefault: false });
    const { opened } = await openWithDeclarations(f, 'Y');
    expect(opened.status).toBe(201);
    const outcome = opened.body.openingClaimRequests;
    expect(outcome.tamami).toBe(false);
    expect(outcome.faizBeyanlari.map((row: any) => [row.status, row.errorCode])).toEqual([
      ['REJECTED', 'CASE_FINANCE_PERMISSION_REQUIRED'],
      ['REJECTED', 'CASE_FINANCE_PERMISSION_REQUIRED'],
    ]);
    expect(outcome.sorumlulukSecimi).toMatchObject({ status: 'REJECTED', errorCode: 'CASE_FINANCE_PERMISSION_REQUIRED' });
    // Mevcut yetki kapısı atlanmadı: onay kaydı ve seçim yok; kalemler "belirlenmedi".
    expect(await rows(f.tenantId)).toMatchObject({ cases: 1, items: 2, sets: 0, approvalRequests: 0 });
    for (const item of await claimItems(opened.body.id)) expect(item.interestAccrualStatus).toBe('UNKNOWN');
    const audit = await prisma.auditLog.findFirst({ where: { tenantId: f.tenantId, action: 'CASE_OPEN_CLAIM_REQUESTS_INCOMPLETE', entityId: opened.body.id } });
    expect(audit).not.toBeNull();
  });

  it('tekrar gönderim: aynı istek ikinci dosya ya da ikinci talep üretmez', async () => {
    const f = await fixture('tekrar');
    const previewed = await previewOpening(f, [vekalet, yargilama], declarations(f));
    const body = caseBody(f, 'R', [vekalet, yargilama], { ...declarations(f), previewHash: previewed.body.onizlemeOzeti });
    const first = await openCase(f, body);
    expect(first.status).toBe(201);
    const afterFirst = await rows(f.tenantId);
    expect(afterFirst).toMatchObject({ cases: 1, items: 2, approvalRequests: 3 });
    const second = await openCase(f, body);
    expect(second.status).toBe(409);
    expect(await rows(f.tenantId)).toEqual(afterFirst);
  });

  it('beyansız açılış bugünkü gibidir: yanıt alanı ve onay kaydı yok; sihirbazın tarihli satırı kabul edilir', async () => {
    const f = await fixture('beyansiz');
    const datedDues = [{ ...vekalet, interestStartDate: KESINLESME, interestEndDate: TAKIP }, yargilama];
    const res = await openCase(f, caseBody(f, 'N', datedDues));
    expect(res.status).toBe(201);
    expect(res.body).not.toHaveProperty('openingClaimRequests');
    expect(await rows(f.tenantId)).toMatchObject({ cases: 1, dues: 2, items: 2, caseDebtors: 2, sets: 0, approvalRequests: 0 });
    const items = await claimItems(res.body.id);
    expect(items[0].interestStartDate?.toISOString().slice(0, 10)).toBe(KESINLESME);
    expect(items.every((item) => item.interestAccrualStatus === 'UNKNOWN')).toBe(true);
  });
});
