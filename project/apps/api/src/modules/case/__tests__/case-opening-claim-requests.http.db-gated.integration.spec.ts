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
import { ClaimItemService } from '../../claim-item/claim-item.service';
import { ClaimLiabilitySelectionService } from '../../claim-liability/claim-liability-selection.service';

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
 *  5. Talepler dosyayla AYNI işlemde açılır: talep açılamazsa (yetki yok, kesinti) dosya hiç oluşmaz; yeniden gönderim çalışır.
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
    // Onay sırası artık sonucu değiştirmez: uyarı notu yok.
    expect(outcome.onaySirasiNotu).toBeNull();

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

  // ── ONAY SIRASI (owner talimatı 2026-11-18): faiz beyanı ile sorumluluk seçimi birbirinden bağımsızdır; hangi sırayla
  //    onaylanırsa onaylansın ikisi de uygulanır. Gerçek veri çakışması bugünkü gibi bayatlıktır.
  const expectBothApplied = async (f: Fixture, caseId: string) => {
    for (const item of await claimItems(caseId)) {
      expect(item.interestAccrualStatus).toBe('ACCRUES');
      expect(item.interestStartDate?.toISOString().slice(0, 10)).toBe(KESINLESME);
      expect(item.interestStartDateProvenance).toBe('JUDGMENT_FINALIZATION_DATE');
      expect(item.isAllDebtorsLiable).toBe(false);
    }
    expect(await prisma.claimItemLiabilitySet.count({ where: { tenantId: f.tenantId, status: 'ACTIVE' } })).toBe(2);
    expect(await pendingRequests(f.tenantId)).toHaveLength(0);
  };

  it('ters onay sırası: sorumluluk seçimi ÖNCE onaylansa da faiz talepleri uygulanır (kilitlenme yok)', async () => {
    const f = await fixture('ters');
    const { opened } = await openWithDeclarations(f, 'T');
    expect(opened.status).toBe(201);
    const pending = await pendingRequests(f.tenantId);
    const liabilityRequest = pending.find((row) => row.targetType === 'CLAIM_ITEM_CASE')!;
    const interestRequests = pending.filter((row) => row.targetType === 'CLAIM_ITEM');
    expect(interestRequests).toHaveLength(2);

    await approvals.approve(liabilityRequest.id, f.approver);
    // Seçim kalemin iki izdüşüm alanını yazdı; faiz talebinin görüntüsü artık eski — ama değişiklik bağımsız ve onaylı.
    for (const item of await claimItems(opened.body.id)) {
      expect(item.isAllDebtorsLiable).toBe(false);
      expect(item.interestAccrualStatus).toBe('UNKNOWN');
    }
    for (const row of interestRequests) await approvals.approve(row.id, f.approver);
    await expectBothApplied(f, opened.body.id);

    // Denetim: her faiz uygulaması kendi onay talebine bağlı ayrı kayıttır.
    const applied = await prisma.auditLog.count({ where: { tenantId: f.tenantId, action: 'CLAIM_ITEM_HIGH_IMPACT_UPDATE_APPLIED' } });
    expect(applied).toBe(2);
  });

  it('eşzamanlı onay: faiz talebi ile sorumluluk seçimi aynı anda onaylanır; ikisi de uygulanır', async () => {
    // Aynı kalem ve aynı dosya üzerinde İKİ eşzamanlı karar transaction'ı (en küçük bağlantı havuzuna sığar). Her iki
    // yürütme aynı dosya kilidini kalemden ÖNCE alır; sıra hangisi olursa olsun sonuç aynıdır.
    for (const round of ['a', 'b', 'c']) {
      const f = await fixture(`esz-${round}`);
      const { opened } = await openWithDeclarations(f, `E${round}`);
      expect(opened.status).toBe(201);
      const pending = await pendingRequests(f.tenantId);
      const liabilityRequest = pending.find((row) => row.targetType === 'CLAIM_ITEM_CASE')!;
      const [firstInterest, secondInterest] = pending.filter((row) => row.targetType === 'CLAIM_ITEM');

      const settled = await Promise.allSettled([
        approvals.approve(firstInterest.id, f.approver),
        approvals.approve(liabilityRequest.id, f.approver),
      ]);
      expect(
        settled.map((result) =>
          result.status === 'fulfilled' ? 'ok' : `${(result.reason as Error).name}:${(result.reason as Error).message}`,
        ),
      ).toEqual(['ok', 'ok']);
      await approvals.approve(secondInterest.id, f.approver);
      await expectBothApplied(f, opened.body.id);
    }
  });

  it('gerçek veri çakışması: seçim onaylansa bile kalemin ORTAK verisi değiştiyse faiz talebi bayattır; kalem değişmez', async () => {
    const f = await fixture('cakisma');
    const { opened } = await openWithDeclarations(f, 'C');
    expect(opened.status).toBe(201);
    const pending = await pendingRequests(f.tenantId);
    const liabilityRequest = pending.find((row) => row.targetType === 'CLAIM_ITEM_CASE')!;
    const interestRequest = pending.find((row) => row.targetType === 'CLAIM_ITEM')!;
    await approvals.approve(liabilityRequest.id, f.approver);

    // Talep beklerken kalemin tutarı değişti (ör. dosya kalemi düzenlemesi) — faiz beyanının dayandığı ortak veri.
    const before = await prisma.claimItem.findUniqueOrThrow({ where: { id: interestRequest.targetRef } });
    await prisma.claimItem.update({
      where: { id: before.id },
      data: { amount: Number(before.amount) + 1, demandedAmount: Number(before.demandedAmount) + 1 },
    });

    await expect(approvals.approve(interestRequest.id, f.approver)).rejects.toThrow('stale-state conflict');
    await expect(approvals.approve(interestRequest.id, f.approver)).rejects.toThrow('degisen alanlar');
    const after = await prisma.claimItem.findUniqueOrThrow({ where: { id: before.id } });
    expect(after.interestAccrualStatus).toBe('UNKNOWN');
    expect(after.interestStartDate).toBeNull();
    // Talep beklemede kalır (karar işlemi geri alındı); çıkış yolu: reddet → kalemden yeniden aç → onayla.
    expect((await prisma.officeApprovalRequest.findUniqueOrThrow({ where: { id: interestRequest.id } })).status).toBe(
      OfficeApprovalStatus.PENDING_APPROVAL,
    );
    const claimItemService = app.get(ClaimItemService);
    const beyan = { interestAccrualStatus: 'ACCRUES', interestStartDate: KESINLESME, interestStartDateProvenance: 'JUDGMENT_FINALIZATION_DATE' } as any;
    await expect(claimItemService.updateFromUser(f.tenantId, f.opener, before.id, beyan)).rejects.toThrow('farklı içerikli bekleyen');
    await approvals.reject(interestRequest.id, f.approver, 'Kalem tutarı değişti; faiz beyanı yeniden açılacak.');
    const reopened = await claimItemService.updateFromUser(f.tenantId, f.opener, before.id, beyan);
    await approvals.approve(reopened.approvalRequestId!, f.approver);
    expect((await prisma.claimItem.findUniqueOrThrow({ where: { id: before.id } })).interestAccrualStatus).toBe('ACCRUES');
  });

  it('sorumluluk alanları ONAYLI seçim dışında bir yoldan değiştiyse faiz talebi bayattır', async () => {
    const f = await fixture('secimsiz');
    // Yalnız faiz beyanı: seçim talebi yok.
    const { opened } = await openWithDeclarations(f, 'S', { interestAccruals: [faizIsler(0), faizIsler(1)] });
    expect(opened.status).toBe(201);
    const interestRequest = (await pendingRequests(f.tenantId)).find((row) => row.targetType === 'CLAIM_ITEM')!;
    // İzdüşüm alanları doğrudan yazıldı; kalemde talepten sonra onaylanmış etkin seçim YOK.
    const someDebtor = await prisma.caseDebtor.findFirstOrThrow({ where: { caseId: opened.body.id } });
    await prisma.claimItem.update({
      where: { id: interestRequest.targetRef },
      data: { isAllDebtorsLiable: false, liableDebtorIds: [someDebtor.debtorId] },
    });
    await expect(approvals.approve(interestRequest.id, f.approver)).rejects.toThrow('stale-state conflict');
    expect((await prisma.claimItem.findUniqueOrThrow({ where: { id: interestRequest.targetRef } })).interestAccrualStatus).toBe('UNKNOWN');
  });

  it('seçim onayıyla birlikte kaleme BAŞKA bir yazım da yapıldıysa (görüntüde olmayan alan dahil) faiz talebi bayattır', async () => {
    const f = await fixture('zincir-kopuk');
    const { opened } = await openWithDeclarations(f, 'Z');
    expect(opened.status).toBe(201);
    const pending = await pendingRequests(f.tenantId);
    const liabilityRequest = pending.find((row) => row.targetType === 'CLAIM_ITEM_CASE')!;
    const [firstInterest, secondInterest] = pending.filter((row) => row.targetType === 'CLAIM_ITEM');
    await approvals.approve(liabilityRequest.id, f.approver);

    // Bayatlık görüntüsünde BULUNMAYAN bir alan (belge tarihi) seçimden sonra doğrudan değişti: değişen görüntü alanları
    // yine yalnız iki izdüşüm alanıdır, ama satır artık seçimin bıraktığı satır değildir → zincir kopar.
    await prisma.claimItem.update({ where: { id: firstInterest.targetRef }, data: { issueDate: new Date('2025-06-07T00:00:00.000Z') } });
    await expect(approvals.approve(firstInterest.id, f.approver)).rejects.toThrow('stale-state conflict');
    expect((await prisma.claimItem.findUniqueOrThrow({ where: { id: firstInterest.targetRef } })).interestAccrualStatus).toBe('UNKNOWN');

    // Öteki kalemde izdüşüm alanları seçimden SONRA doğrudan yeniden yazıldı (satır artık seçimin bıraktığı satır değil).
    await prisma.claimItem.update({ where: { id: secondInterest.targetRef }, data: { liableDebtorIds: ['secim-disi-yazim'] } });
    await expect(approvals.approve(secondInterest.id, f.approver)).rejects.toThrow('stale-state conflict');
    expect((await prisma.claimItem.findUniqueOrThrow({ where: { id: secondInterest.targetRef } })).interestAccrualStatus).toBe('UNKNOWN');
  });

  it('talep beklerken art arda İKİ onaylı seçim uygulandıysa faiz talebi yine geçerlidir (zincir bağlı)', async () => {
    const f = await fixture('zincir-iki');
    const { opened } = await openWithDeclarations(f, 'Y');
    expect(opened.status).toBe(201);
    const caseId = opened.body.id as string;
    const pending = await pendingRequests(f.tenantId);
    const liabilityRequest = pending.find((row) => row.targetType === 'CLAIM_ITEM_CASE')!;
    const interestRequests = pending.filter((row) => row.targetType === 'CLAIM_ITEM');
    await approvals.approve(liabilityRequest.id, f.approver);

    // İkinci seçim: aynı kalemler bu kez müteselsil (kalem izdüşümü yeniden yazılır).
    const selection = app.get(ClaimLiabilitySelectionService);
    const caseDebtors = await prisma.caseDebtor.findMany({ where: { caseId }, orderBy: { createdAt: 'asc' } });
    const drafts = interestRequests.map((row) => ({
      claimItemId: row.targetRef,
      mode: 'JOINT_AND_SEVERAL' as const,
      basis: 'COURT_JUDGMENT',
      basisNote: null,
      parties: caseDebtors.map((debtor) => ({ caseDebtorId: debtor.id })),
    }));
    const preview = await selection.preview(f.tenantId, f.opener, caseId, drafts as any);
    expect(preview.uygulanabilir).toBe(true);
    const second = await selection.request(f.tenantId, f.opener, caseId, { selections: drafts as any, onizlemeOzeti: preview.onizlemeOzeti });
    await approvals.approve(second.approvalRequestId, f.approver);

    for (const row of interestRequests) await approvals.approve(row.id, f.approver);
    for (const item of await claimItems(caseId)) {
      expect(item.interestAccrualStatus).toBe('ACCRUES');
      expect([...item.liableDebtorIds].sort()).toEqual(caseDebtors.map((debtor) => debtor.debtorId).sort());
    }
  });

  it('art arda iki onaylı seçim izdüşümü BAŞA döndürdüyse (yalnız sürüm alanı değişmiş görünür) faiz talebi geçerlidir', async () => {
    const f = await fixture('zincir-sifir');
    const { opened } = await openWithDeclarations(f, 'X');
    expect(opened.status).toBe(201);
    const caseId = opened.body.id as string;
    const pending = await pendingRequests(f.tenantId);
    const liabilityRequest = pending.find((row) => row.targetType === 'CLAIM_ITEM_CASE')!;
    const interestRequests = pending.filter((row) => row.targetType === 'CLAIM_ITEM');
    const atRequest = await claimItems(caseId);
    await approvals.approve(liabilityRequest.id, f.approver);

    // İkinci seçim: "belirlenmedi"ye bilinçli dönüş → kalem izdüşümü talep anındaki değerlere geri döner.
    const selection = app.get(ClaimLiabilitySelectionService);
    const drafts = interestRequests.map((row) => ({ claimItemId: row.targetRef, mode: 'UNDETERMINED' as const, basis: 'COURT_JUDGMENT', basisNote: null, parties: [] }));
    const preview = await selection.preview(f.tenantId, f.opener, caseId, drafts as any);
    expect(preview.uygulanabilir).toBe(true);
    const second = await selection.request(f.tenantId, f.opener, caseId, { selections: drafts as any, onizlemeOzeti: preview.onizlemeOzeti });
    await approvals.approve(second.approvalRequestId, f.approver);
    const afterTwo = await claimItems(caseId);
    expect(afterTwo.map((item) => [item.isAllDebtorsLiable, item.liableDebtorIds])).toEqual(atRequest.map((item) => [item.isAllDebtorsLiable, item.liableDebtorIds]));
    expect(afterTwo.every((item, index) => item.updatedAt.getTime() !== atRequest[index].updatedAt.getTime())).toBe(true);

    for (const row of interestRequests) await approvals.approve(row.id, f.approver);
    for (const item of await claimItems(caseId)) expect(item.interestAccrualStatus).toBe('ACCRUES');
  });

  // ── BAĞIMSIZ AÇIKLAYICI DÜZENLEME: talep beklerken açıklama / referans / sıra kayıtlı (düşük etkili) yoldan değişirse
  //    faiz talebi bayatlamaz; kayıtsız yazım, talebin kendi alanı ve ortak veri bugünkü gibi bayatlıktır.
  const openInterestOnly = async (label: string, tag: string) => {
    const f = await fixture(label);
    const { opened } = await openWithDeclarations(f, tag, { interestAccruals: [faizIsler(0), faizIsler(1)] });
    expect(opened.status).toBe(201);
    const [first, second] = (await pendingRequests(f.tenantId)).filter((row) => row.targetType === 'CLAIM_ITEM');
    return { f, first, second };
  };
  const item = (id: string) => prisma.claimItem.findUniqueOrThrow({ where: { id } });

  it('talep beklerken açıklama düşük etkili (kayıtlı) yoldan değişti: faiz talebi yine onaylanır; açıklama korunur', async () => {
    const { f, first } = await openInterestOnly('aciklama', 'AC');
    const claimItemService = app.get(ClaimItemService);
    await claimItemService.updateFromUser(f.tenantId, f.opener, first.targetRef, { description: 'Sentetik açıklama (talepten sonra)', sortOrder: 4 } as any);
    await approvals.approve(first.id, f.approver);
    expect(await item(first.targetRef)).toMatchObject({ interestAccrualStatus: 'ACCRUES', description: 'Sentetik açıklama (talepten sonra)', sortOrder: 4 });
  });

  it('bayat doğan talep: görüntü alındıktan sonra, talep kaydından ÖNCE yapılmış kayıtlı açıklama düzenlemesi talebi tıkamaz', async () => {
    const { f, first } = await openInterestOnly('bayat-dogan', 'BD');
    const claimItemService = app.get(ClaimItemService);
    await claimItemService.updateFromUser(f.tenantId, f.opener, first.targetRef, { description: 'Sentetik açıklama (araya giren)' } as any);
    // Talep kaydının oluşturulma saati düzenlemenin kaydından SONRAYA alınır: görüntü düzenlemeden önce alınmış, talep
    // satırı sonra yazılmış gibi (talep oluşturma ile düzenlemenin aynı ana denk geldiği durum).
    await prisma.officeApprovalRequest.update({ where: { id: first.id }, data: { createdAt: new Date(Date.now() + 2_000) } });
    await approvals.approve(first.id, f.approver);
    expect(await item(first.targetRef)).toMatchObject({ interestAccrualStatus: 'ACCRUES', description: 'Sentetik açıklama (araya giren)' });
  });

  it('talepten ÖNCE yapılmış kayıtsız yazım zinciri bozmaz: talepten sonraki yazımlar kayıtlıysa talep geçerlidir', async () => {
    const f = await fixture('once-kayitsiz');
    const body = caseBody(f, 'OK', [vekalet, yargilama]);
    const opened = await openCase(f, body);
    expect(opened.status).toBe(201);
    const [target] = await claimItems(opened.body.id);
    // Talepten önce kalem doğrudan (kayıtsız) değişti; talep görüntüsü bu durumu içerir.
    await prisma.claimItem.update({ where: { id: target.id }, data: { description: 'Sentetik açıklama (talepten önce, kayıtsız)' } });
    const claimItemService = app.get(ClaimItemService);
    const requested = await claimItemService.updateFromUser(f.tenantId, f.opener, target.id, {
      interestAccrualStatus: 'ACCRUES',
      interestStartDate: KESINLESME,
      interestStartDateProvenance: 'JUDGMENT_FINALIZATION_DATE',
    } as any);
    await claimItemService.updateFromUser(f.tenantId, f.opener, target.id, { referenceNo: 'SENTETIK-REF-1' } as any);
    await approvals.approve(requested.approvalRequestId!, f.approver);
    expect(await item(target.id)).toMatchObject({ interestAccrualStatus: 'ACCRUES', referenceNo: 'SENTETIK-REF-1' });
  });

  it('açıklama KAYITSIZ değiştiyse ya da talep açıklamayı kendisi de değiştiriyorsa faiz talebi bayattır', async () => {
    const { f, first, second } = await openInterestOnly('aciklama-bayat', 'AB');
    // (1) Kayıtsız doğrudan yazım: değişen alan yalnız açıklama, ama zincirde kaydı yok.
    await prisma.claimItem.update({ where: { id: first.targetRef }, data: { description: 'Sentetik açıklama (kayıtsız)' } });
    await expect(approvals.approve(first.id, f.approver)).rejects.toThrow('stale-state conflict');
    expect((await item(first.targetRef)).interestAccrualStatus).toBe('UNKNOWN');

    // (2) Talep açıklamayı da değiştiriyor ve açıklama arada kayıtlı yoldan değişti: talebin KENDİ alanı → bayat.
    const claimItemService = app.get(ClaimItemService);
    await approvals.reject(second.id, f.approver, 'Sentetik: açıklamalı talep açılacak.');
    const mixed = await claimItemService.updateFromUser(f.tenantId, f.opener, second.targetRef, {
      interestAccrualStatus: 'ACCRUES',
      interestStartDate: KESINLESME,
      interestStartDateProvenance: 'JUDGMENT_FINALIZATION_DATE',
      description: 'Talebin önerdiği açıklama',
    } as any);
    // Bekleyen talep varken düşük etkili düzenleme yapılabilir (ayrı yol); talebin önerdiği alanla çakışır.
    await claimItemService.updateFromUser(f.tenantId, f.opener, second.targetRef, { description: 'Arada düzenlenen açıklama' } as any);
    await expect(approvals.approve(mixed.approvalRequestId!, f.approver)).rejects.toThrow('stale-state conflict');
    expect(await item(second.targetRef)).toMatchObject({ interestAccrualStatus: 'UNKNOWN', description: 'Arada düzenlenen açıklama' });
  });

  it('eşzamanlı: faiz onayı ile aynı kalemin düşük etkili düzenlemesi aynı anda — ikisi de uygulanır (kilitlenme ve gereksiz bayatlık yok)', async () => {
    const claimItemService = app.get(ClaimItemService);
    for (const round of ['a', 'b', 'c', 'd']) {
      const { f, first } = await openInterestOnly(`esz-duz-${round}`, `D${round}`);
      const settled = await Promise.allSettled([
        approvals.approve(first.id, f.approver),
        claimItemService.updateFromUser(f.tenantId, f.opener, first.targetRef, { description: `Sentetik açıklama ${round}` } as any),
      ]);
      expect(
        settled.map((result) =>
          result.status === 'fulfilled' ? 'ok' : `${(result.reason as Error).name}:${(result.reason as Error).message}`,
        ),
      ).toEqual(['ok', 'ok']);
      expect(await item(first.targetRef)).toMatchObject({ interestAccrualStatus: 'ACCRUES', description: `Sentetik açıklama ${round}` });
    }
  });

  // ── DUE YAZIM YOLU KORUMASI (#3319) İLE BİRLİKTE: Due ucu bağlı kalemin yüksek etkili alanlarını yazamaz ve bekleyen
  //    talep varken kaleme yansıyan düzenlemeyi reddeder. Bu kural DEĞİŞMEDİ; aşağıdakiler iki değişikliğin birlikte
  //    çalıştığını sınar (açılış talepleri + iki onay sırası + Due ucunun kayıtlı yansıması).
  const patchDue = (f: Fixture, path: string, body: Record<string, unknown>) =>
    http().patch(path).set('x-test-user-id', f.opener).send(body);
  const vekaletDuePath = async (caseId: string) => {
    const due = await prisma.due.findFirstOrThrow({ where: { caseId, type: 'VEKALET_UCRETI' as never } });
    return `/cases/${caseId}/dues/${due.id}`;
  };
  const vekaletItem = async (caseId: string) => (await claimItems(caseId)).find((row) => row.itemType === 'ATTORNEY_FEE')!;

  it.each([
    ['faiz önce', 'JF'],
    ['seçim önce', 'JS'],
  ])('Due koruması ile birlikte (%s): açılış talepleri beklerken Due ucu kalemi değiştiremez; talepler uygulanır, sonra Due düzenlemesi çalışır', async (order, tag) => {
    const f = await fixture(`due-${tag.toLowerCase()}`);
    const { opened } = await openWithDeclarations(f, tag);
    expect(opened.status).toBe(201);
    const caseId = opened.body.id as string;
    const duePath = await vekaletDuePath(caseId);
    const before = await claimItems(caseId);

    // Kaleme yansıyacak düşük etkili Due isteği: bekleyen faiz talebi varken reddedilir.
    const blocked = await patchDue(f, duePath, { description: 'Sentetik açıklama (Due ucundan)' });
    expect([blocked.status, blocked.body.code]).toEqual([409, 'DUE_EDIT_BLOCKED_BY_PENDING_CLAIM_ITEM_APPROVAL']);
    // Yüksek etkili Due isteği: kalem ucuna (iki kişi onayı) yönlendirilir.
    const high = await patchDue(f, duePath, { amount: VEKALET_TUTARI + 1 });
    expect([high.status, high.body.code]).toEqual([409, 'DUE_CHANGE_REQUIRES_CLAIM_ITEM_APPROVAL']);
    expect(await claimItems(caseId)).toEqual(before);

    const pending = await pendingRequests(f.tenantId);
    const liabilityRequest = pending.find((row) => row.targetType === 'CLAIM_ITEM_CASE')!;
    const interestRequests = pending.filter((row) => row.targetType === 'CLAIM_ITEM');
    expect(interestRequests).toHaveLength(2);
    if (order === 'seçim önce') await approvals.approve(liabilityRequest.id, f.approver);
    for (const row of interestRequests) await approvals.approve(row.id, f.approver);
    if (order === 'faiz önce') await approvals.approve(liabilityRequest.id, f.approver);
    await expectBothApplied(f, caseId);

    // Talepler sonuçlandı: aynı Due düzenlemesi çalışır, kaleme yansır ve onaylı faizi / seçimi bozmaz.
    const allowed = await patchDue(f, duePath, { description: 'Sentetik açıklama (Due ucundan)' });
    expect(allowed.status).toBe(200);
    expect(await vekaletItem(caseId)).toMatchObject({
      description: 'Sentetik açıklama (Due ucundan)',
      interestAccrualStatus: 'ACCRUES',
      isAllDebtorsLiable: false,
    });
    await expectBothApplied(f, caseId);
  });

  it('Due ucu ile talep oluşturma yarışı: talep görüntüsü alındıktan sonra Due açıklaması kaleme yansıdıysa talep bayat doğmaz; yansıma kayıtlıdır', async () => {
    const f = await fixture('due-yaris');
    const opened = await openCase(f, caseBody(f, 'DY', [vekalet, yargilama]));
    expect(opened.status).toBe(201);
    const caseId = opened.body.id as string;
    const duePath = await vekaletDuePath(caseId);
    const target = await vekaletItem(caseId);
    const claimItemService = app.get(ClaimItemService);

    // Talep kendi işleminde açılır ve henüz kaydedilmemiştir (görüntü alındı); Due isteği bekleyen talebi GÖREMEZ,
    // açıklamayı kaleme yansıtır ve tamamlanır. Sonra talep işlemi kaydedilir: görüntüsü Due yazımından öncedir.
    const requested = await prisma.$transaction(
      async (tx) => {
        const result = await claimItemService.updateFromUser(
          f.tenantId,
          f.opener,
          target.id,
          { interestAccrualStatus: 'ACCRUES', interestStartDate: KESINLESME, interestStartDateProvenance: 'JUDGMENT_FINALIZATION_DATE' } as any,
          tx,
        );
        const due = await Promise.race([
          patchDue(f, duePath, { description: 'Sentetik açıklama (yarışta Due ucundan)' }).then((res) => res),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Due isteği talep işlemini bekledi (beklenmezdi)')), 8_000)),
        ]);
        expect(due.status).toBe(200);
        return result;
      },
      { timeout: 20_000, maxWait: 10_000 },
    );
    expect(requested.approvalRequestId).toBeTruthy();
    expect(await item(target.id)).toMatchObject({ description: 'Sentetik açıklama (yarışta Due ucundan)', interestAccrualStatus: 'UNKNOWN' });

    // Talep beklerken Due ucu artık kaleme yansıyan düzenlemeyi reddeder (kural değişmedi).
    const blocked = await patchDue(f, duePath, { description: 'Sentetik açıklama (talep beklerken)' });
    expect([blocked.status, blocked.body.code]).toEqual([409, 'DUE_EDIT_BLOCKED_BY_PENDING_CLAIM_ITEM_APPROVAL']);

    // Görüntüden sonraki tek yazım Due köprüsünün KAYITLI açıklama yansımasıdır: talep onaylanır, açıklama korunur.
    await approvals.approve(requested.approvalRequestId!, f.approver);
    expect(await item(target.id)).toMatchObject({ description: 'Sentetik açıklama (yarışta Due ucundan)', interestAccrualStatus: 'ACCRUES' });
  });

  it('eşzamanlı: açılış faiz onayı ile aynı kalemin Due açıklama isteği — kilitlenme yok; faiz uygulanır, Due isteği tutarlı sonuçlanır', async () => {
    for (const round of ['a', 'b', 'c', 'd']) {
      const { f, first } = await openInterestOnly(`esz-due-${round}`, `U${round}`);
      const target = await item(first.targetRef);
      const due = await prisma.due.findFirstOrThrow({ where: { caseId: target.caseId, type: (target.itemType === 'ATTORNEY_FEE' ? 'VEKALET_UCRETI' : 'YARGILAMA_GIDERI') as never } });
      const description = `Sentetik açıklama (eşzamanlı ${round})`;
      const [approved, dueRes] = await Promise.allSettled([
        approvals.approve(first.id, f.approver),
        patchDue(f, `/cases/${target.caseId}/dues/${due.id}`, { description }).then((res) => res),
      ]);
      expect(approved.status === 'fulfilled' ? 'ok' : `${(approved.reason as Error).name}:${(approved.reason as Error).message}`).toBe('ok');
      expect(dueRes.status).toBe('fulfilled');
      const res = (dueRes as PromiseFulfilledResult<request.Response>).value;
      // Due isteği onaydan ÖNCE karar verdiyse 409 (bekleyen talep); kalem satırı o an yazılıyorsa 409 (meşgul);
      // onaydan SONRA karar verdiyse 200 ve açıklama kaleme yansır. Hiçbir durumda faiz onayı bozulmaz.
      expect([200, 409]).toContain(res.status);
      if (res.status === 409) {
        expect(['DUE_EDIT_BLOCKED_BY_PENDING_CLAIM_ITEM_APPROVAL', 'DUE_CLAIM_ITEM_BUSY']).toContain(res.body.code);
      }
      const after = await item(first.targetRef);
      expect(after.interestAccrualStatus).toBe('ACCRUES');
      expect(after.description === description).toBe(res.status === 200);
    }
  });

  it('kilit sırası (kesin): mevcut kalemi yazan yollar dosya kilidini kalem satırından ÖNCE alır — kilit başkasındayken satır kilitlenmez', async () => {
    // Zamanlamaya bağlı olmayan kanıt: dosya kilidi ayrı bir işlemde tutulur. Yazan yol kilidi satırdan ÖNCE alıyorsa
    // kilitte bekler ve kalem satırına henüz dokunmamıştır (başka bağlantı satırı hemen kilitleyebilir). Satırı önce yazıp
    // kilidi sonra alsaydı satır kilitli kalırdı — bu, kilidi önce alan onay / tahsilat yollarıyla kilitlenme demektir.
    const f = await fixture('kilit-sirasi');
    const { opened } = await openWithDeclarations(f, 'L', { interestAccruals: [faizIsler(0), faizIsler(1)] });
    expect(opened.status).toBe(201);
    const caseId = opened.body.id as string;
    const [firstInterest, secondInterest] = (await pendingRequests(f.tenantId)).filter((row) => row.targetType === 'CLAIM_ITEM');
    const claimItemService = app.get(ClaimItemService);

    const whileCaseLockHeld = async (claimItemId: string, start: () => Promise<unknown>) => {
      let release!: () => void;
      const released = new Promise<void>((resolve) => (release = resolve));
      let lockTaken!: () => void;
      const taken = new Promise<void>((resolve) => (lockTaken = resolve));
      const holder = prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${caseId}, 0))`;
          lockTaken();
          await released;
        },
        { timeout: 15_000 },
      );
      await taken;
      let finished = false;
      const running = start().then(
        (value) => {
          finished = true;
          return value;
        },
        (error) => {
          finished = true;
          throw error;
        },
      );
      try {
        await new Promise((resolve) => setTimeout(resolve, 800));
        // Yol dosya kilidinde bekliyor…
        expect(finished).toBe(false);
        // …ve kalem satırına henüz dokunmadı: başka bağlantı satırı beklemeden kilitleyebiliyor.
        const probe = await prisma.$transaction((tx) => tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "ClaimItem" WHERE "id" = ${claimItemId} FOR UPDATE NOWAIT`);
        expect(probe).toHaveLength(1);
      } finally {
        release();
        await holder;
      }
      return running;
    };

    // 1) Kullanıcının düşük etkili düzenlemesi (açıklama).
    await whileCaseLockHeld(secondInterest.targetRef, () =>
      claimItemService.updateFromUser(f.tenantId, f.opener, secondInterest.targetRef, { description: 'Sentetik açıklama (kilit sırası)' } as any),
    );
    expect((await prisma.claimItem.findUniqueOrThrow({ where: { id: secondInterest.targetRef } })).description).toBe('Sentetik açıklama (kilit sırası)');

    // 2) Yüksek etkili değişiklik onayının yürütmesi.
    await whileCaseLockHeld(firstInterest.targetRef, () => approvals.approve(firstInterest.id, f.approver));
    expect((await prisma.claimItem.findUniqueOrThrow({ where: { id: firstInterest.targetRef } })).interestAccrualStatus).toBe('ACCRUES');
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

  it('dosyada mali düzenleme yetkisi olmayan kullanıcı: talep açılamaz → dosya HİÇ oluşmaz (403); beyansız açılış çalışır', async () => {
    const f = await fixture('yetkisiz', { openerHasFinanceDefault: false });
    const previewed = await previewOpening(f, [vekalet, yargilama], declarations(f));
    const res = await openCase(f, caseBody(f, 'N', [vekalet, yargilama], { ...declarations(f), previewHash: previewed.body.onizlemeOzeti }));
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ code: 'OPENING_CLAIM_REQUESTS_NOT_OPENED', reasonCode: 'CASE_FINANCE_PERMISSION_REQUIRED', dueIndex: 0 });
    expect(res.body.message).toContain('dosya oluşturulmadı');
    // Talep açılamadı diye "başarılı açılış" yok: dosya, taraf, kalem, talep ve açılış denetim kaydı oluşmadı.
    expect(await rows(f.tenantId)).toEqual(EMPTY);
    expect(await prisma.auditLog.count({ where: { tenantId: f.tenantId, action: { startsWith: 'CASE_OPEN_CLAIM_REQUESTS' } } })).toBe(0);

    // Kurtarma: aynı kullanıcı aynı dosyayı beyansız açabilir (yetki kapısı yalnız beyanın talebi içindir).
    const plain = await openCase(f, caseBody(f, 'N', [vekalet, yargilama]));
    expect(plain.status).toBe(201);
    expect(plain.body.openingClaimRequests).toBeUndefined();
    expect(await rows(f.tenantId)).toMatchObject({ cases: 1, items: 2, approvalRequests: 0 });
  });

  it('kesinti: talep açılışı yarıda kalırsa dosya, taraflar, kalemler ve açılmış talepler birlikte geri alınır; yeniden gönderim çalışır', async () => {
    const f = await fixture('kesinti');
    const previewed = await previewOpening(f, [vekalet, yargilama], declarations(f));
    const body = caseBody(f, 'K', [vekalet, yargilama], { ...declarations(f), previewHash: previewed.body.onizlemeOzeti });

    // İkinci onay talebi yazılırken süreç hata alır (ilk faiz talebi aynı işlemde açılmıştı).
    const officeApproval = app.get(OfficeApprovalService);
    const original = officeApproval.createPendingRequestInTransaction.bind(officeApproval);
    let calls = 0;
    const spy = jest.spyOn(officeApproval, 'createPendingRequestInTransaction').mockImplementation(async (input, tx) => {
      calls += 1;
      if (calls === 2) throw new Error('sentetik kesinti: ikinci talep yazılamadı');
      return original(input, tx);
    });
    try {
      const failed = await openCase(f, body);
      expect(failed.status).toBe(500);
      expect(calls).toBe(2);
    } finally {
      spy.mockRestore();
    }
    // Hiçbir iz kalmadı: yarım dosya, sahipsiz kalem ya da tek başına açılmış talep yok.
    expect(await rows(f.tenantId)).toEqual(EMPTY);
    expect(await prisma.auditLog.count({ where: { tenantId: f.tenantId, action: { startsWith: 'CASE_OPEN_CLAIM_REQUESTS' } } })).toBe(0);

    // Aynı istek yeniden gönderilir: dosya ve üç talep birlikte oluşur.
    const retried = await openCase(f, body);
    expect(retried.status).toBe(201);
    expect(retried.body.openingClaimRequests).toMatchObject({ tamami: true, onaySirasiNotu: null });
    expect(await rows(f.tenantId)).toMatchObject({ cases: 1, items: 2, approvalRequests: 3 });
    expect(await pendingRequests(f.tenantId)).toHaveLength(3);
    // Denetim kaydı dosyayla AYNI işlemde yazıldı.
    const audit = await prisma.auditLog.findFirst({ where: { tenantId: f.tenantId, action: 'CASE_OPEN_CLAIM_REQUESTS_REQUESTED', entityId: retried.body.id } });
    expect((audit?.metadata as any).previewHash).toBe(previewed.body.onizlemeOzeti);
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
