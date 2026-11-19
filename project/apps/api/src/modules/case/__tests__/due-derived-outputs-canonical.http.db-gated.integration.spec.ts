jest.mock('pdf-poppler', () => ({ convert: async () => { throw new Error('pdf-poppler is stubbed in this spec'); } }));

import { CanActivate, ExecutionContext, INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import * as request from 'supertest';
import { createApprovedDue } from '../../../../test/due-create-approval-fixture';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { StorageModule } from '../../../common/storage/storage.module';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ClaimItemModule } from '../../claim-item/claim-item.module';
import { DocumentTemplateService } from '../../document/document-template.service';
import { DocumentService } from '../../document/document.service';
import { ErrorLogModule } from '../../error-log/error-log.module';
import { ExpenseRequestService } from '../../expense-request/expense-request.service';
import { MetricsRegistryModule } from '../../metrics-registry/metrics-registry.module';
import { OfficeApprovalService } from '../../office-approval/office-approval.service';
import { PortalService } from '../../portal/portal.service';
import { UyapCaseMapperService } from '../../uyap-export/uyap-case-mapper.service';
import { CaseModule } from '../case.module';

/**
 * Due satırından OKUYAN çıktılar onaylı değeri bağlı kanonik kalemden okur — owner talimatı 19.11.2026.
 * GERÇEK HTTP + gerçek iki kişi onayı + gerçek okuyucular + disposable PostgreSQL. Tutar, tarih ve adlar SENTETİK.
 *
 * Ölçülen kusur: kalem ekranından onayla yapılan tutar / faiz değişikliği ve onaylı iptal Due satırına geri yazılmaz
 * (kalem → Due ters yazım yasak). Due satırından okuyan çıktılar bu yüzden onay ÖNCESİ değeri gösteriyordu:
 * "UYAP'a Aktar" 48/4 açıklaması, hesap özetinin asıl alacağı, mali özet, belge tutarları, müvekkil portalı ve açılış
 * masraf setinin peşin harç matrahı.
 *
 * Kanıtlanan:
 *  A. Onaylı değişiklik yokken bütün çıktılar bugünkü değerleri verir (taban; davranış değişmedi).
 *  B. Kalemde onaylanan tutar ve faiz başlangıcı: Due satırı DEĞİŞMEZ; yedi çıktının hepsi kalemin değerini verir.
 *  C. Kalemi onayla iptal edilen Due (satır duruyor) çıktılara girmez; kanonik kalemi olmayan Due (nafaka) aynen kalır.
 *  D. Asıl alacak kalemi iptal edildiyse çıktılar dosyadaki eski "asıl alacak tutarı" yedeğine DÜŞMEZ.
 *  E. Geçmiş kayıtta Due ile bağlı kalemin para birimi ayrışmışsa (owner E4 kararı) onaylı değer güvenle
 *     kullanılamaz: yedi çıktının HEPSİ açık uyumsuzluk hatasıyla (409 DUE_CANONICAL_CURRENCY_MISMATCH) durur; eski Due
 *     değerine sessiz dönüş ve yeniden etiketleme YOK; hiçbir satır yazılmaz / dönüştürülmez; müvekkil portalı iç kimlik
 *     görmez.
 *  F. Aynı Due'ya birden çok kalem bağlıysa (bütünlük ihlali) çıktılar 409 DUE_CANONICAL_BINDING_AMBIGUOUS ile durur.
 */
const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('DUE-DERIVED-OUTPUTS DB gate blocked: CI requires an approved TEST_DATABASE_URL.');
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;
const PRODUCTION_VALIDATION_OPTIONS = { whitelist: true, forbidNonWhitelisted: true, transform: true } as const;
const AS_OF = '2026-01-10';

/** Çıktıların kullandığı tutar biçimi (aynı biçimleyici; ortamın yerel ayar verisinden bağımsız karşılaştırma). */
const tl = (amount: number) => new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
const day = (value: Date | string | null | undefined) => (value ? new Date(value).toISOString().slice(0, 10) : null);

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

describeWithDisposableDb('Due\'dan okuyan çıktılar onaylı kanonik değeri verir — HTTP + gerçek onay (disposable PostgreSQL)', () => {
  jest.setTimeout(300_000);

  let prisma: PrismaClient;
  let app: INestApplication;
  let approvals: OfficeApprovalService;
  let expenseRequests: ExpenseRequestService;
  const tenantIds = new Set<string>();
  const officeIds = new Set<string>();

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await prisma.$connect();
    const identity = new DbUserIdentityGuard(() => prisma);
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        StorageModule,
        ErrorLogModule,
        MetricsRegistryModule,
        CaseModule,
        ClaimItemModule,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(identity)
      .overrideGuard(AuthGuard('jwt'))
      .useValue(identity)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe(PRODUCTION_VALIDATION_OPTIONS));
    await app.init();
    approvals = app.get(OfficeApprovalService);
    expenseRequests = app.get(ExpenseRequestService, { strict: false });
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

  const http = () => request(app.getHttpServer());
  const post = (path: string, userId: string, body: Record<string, unknown>) => http().post(path).set('x-test-user-id', userId).send(body);
  const put = (path: string, userId: string, body: Record<string, unknown>) => http().put(path).set('x-test-user-id', userId).send(body);
  const del = (path: string, userId: string) => http().delete(path).set('x-test-user-id', userId);
  const get = (path: string, userId: string, query: Record<string, string> = {}) => http().get(path).query(query).set('x-test-user-id', userId);

  const ASIL_ALACAK = { type: 'PRINCIPAL', amount: 30000, dueDate: '2025-07-01', interestType: 'YASAL', description: 'Sentetik asıl alacak' };
  const MASRAF = { type: 'EXPENSE', amount: 500, dueDate: '2025-07-01', description: 'Sentetik masraf' };
  const NAFAKA = { type: 'NAFAKA', amount: 700, dueDate: '2025-07-05', description: 'Sentetik nafaka taksiti' };

  async function fixture(label: string) {
    const suffix = randomUUID().slice(0, 8);
    const tenantId = `test-due-out-${label}-${suffix}`;
    tenantIds.add(tenantId);
    await prisma.tenant.create({ data: { id: tenantId, name: `Due çıktıları ${label}`, slug: tenantId } });
    const office = await prisma.office.create({ data: { tenantId, name: `Sentetik büro ${label}` } });
    officeIds.add(office.id);
    await prisma.rateSchedule.create({
      data: {
        tenantId: office.id,
        interestType: 'LEGAL_3095',
        validFrom: new Date('2024-01-01T00:00:00.000Z'),
        validTo: null,
        annualRate: '0.120000',
        source: 'MANUAL',
        sourceRef: 'sentetik test oranı',
        versionHash: `due-out-${suffix}`,
      },
    });
    const mkLawyer = async (key: string, role: 'USER' | 'ADMIN', rank: 'AUTHORIZED' | 'PARTNER') => {
      const user = await prisma.user.create({ data: { tenantId, email: `do-${key}-${suffix}@example.test`, name: 'Sentetik', surname: key, role } });
      const lawyer = await prisma.lawyer.create({ data: { tenantId, officeId: office.id, userId: user.id, name: 'Sentetik', surname: key, lawyerRank: rank } });
      return { userId: user.id, lawyerId: lawyer.id };
    };
    const yetkili = await mkLawyer('Yetkili', 'USER', 'AUTHORIZED');
    const onayci = await mkLawyer('Onayci', 'ADMIN', 'PARTNER');

    const client = await prisma.client.create({ data: { tenantId, type: 'COMPANY', companyName: 'Sentetik müvekkil', displayName: 'Sentetik müvekkil' } as never });
    const debtor = await prisma.debtor.create({ data: { tenantId, type: 'COMPANY', name: 'Sentetik borçlu' } as never });
    // Dosyadaki eski "asıl alacak tutarı" yedeği bilerek FARKLI: çıktıların ona düşmediği görülebilsin.
    const legalCase = await prisma.case.create({
      data: {
        tenantId, fileNumber: `DO-${label}-${suffix}`, type: 'GENERAL_EXECUTION', currency: 'TRY',
        caseDate: new Date('2025-06-01T00:00:00.000Z'), clientId: client.id, showToClient: true, principalAmount: '77777.00',
      } as never,
    });
    await prisma.caseClient.create({ data: { caseId: legalCase.id, clientId: client.id } });
    await prisma.caseDebtor.create({ data: { caseId: legalCase.id, debtorId: debtor.id } });
    await prisma.caseLawyer.create({ data: { caseId: legalCase.id, lawyerId: onayci.lawyerId, role: 'RESPONSIBLE', isResponsible: true } });
    await prisma.caseLawyer.create({ data: { caseId: legalCase.id, lawyerId: yetkili.lawyerId, role: 'ASSIGNED', casePermissions: { canEditFinance: true } } });

    // Due + bağlı kanonik kalem GERÇEK yoldan oluşur: ekleme talebi → başka hesabın onayı → köprü.
    const add = (due: Record<string, unknown>) =>
      createApprovedDue({
        db: prisma, approvals, post: (path, body) => post(path, yetkili.userId, body),
        caseId: legalCase.id, due, requesterUserId: yetkili.userId, approverUserId: onayci.userId,
      });
    const asil = await add(ASIL_ALACAK);
    const masraf = await add(MASRAF);
    const nafaka = await add(NAFAKA);
    const claims = await prisma.claimItem.findMany({ where: { caseId: legalCase.id } });
    const claimOf = (dueId: string) => claims.find((row) => (row.metadata as any)?.dueSync?.sourceDueId === dueId)?.id ?? null;
    const asilClaimId = claimOf(asil.dueId);
    const masrafClaimId = claimOf(masraf.dueId);
    if (!asilClaimId || !masrafClaimId || claimOf(nafaka.dueId) !== null) throw new Error('düzenek: bağlı kalemler beklenen gibi oluşmadı');
    return {
      tenantId, caseId: legalCase.id, clientId: client.id, yetkili, onayci,
      asilDueId: asil.dueId, masrafDueId: masraf.dueId, nafakaDueId: nafaka.dueId, asilClaimId, masrafClaimId,
    };
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;

  /** Kalem ucundaki talep (PUT / DELETE /claim-items/:id) ikinci kişinin onayıyla uygulanır. */
  async function approveClaimChange(f: Fixture, res: request.Response) {
    if (res.status !== 200 || res.body?.data?.approvalRequired !== true) {
      throw new Error(`onay talebi beklenirdi: ${res.status} ${JSON.stringify(res.body).slice(0, 300)}`);
    }
    await approvals.approve(res.body.data.approvalRequestId as string, f.onayci.userId);
  }

  /** Due satırından okuyan çıktıların tamamı (yalnız okuma; açılış masraf seti ayrıca sınanır). */
  async function outputs(f: Fixture) {
    const summary = await get(`/cases/${f.caseId}/calculation-summary`, f.onayci.userId, { date: AS_OF });
    const finance = await get(`/cases/${f.caseId}/finance-summary`, f.onayci.userId);
    if (summary.status !== 200 || finance.status !== 200) {
      throw new Error(`özet okunamadı: ${summary.status} / ${finance.status} ${JSON.stringify(summary.body).slice(0, 300)}`);
    }
    const db = prisma as never;
    const uyap = await new UyapCaseMapperService(db).mapCaseToTakipTalebi(f.caseId, f.tenantId);
    const belge = await new DocumentService(db, undefined as never).prepareDocumentData(f.caseId, f.tenantId);
    const sablon = await new DocumentTemplateService(db).prepareVariablesFromCase(f.caseId, f.tenantId);
    const portal = await new PortalService(db, undefined as never, undefined as never, undefined as never, undefined as never, undefined as never)
      .getCaseDetail(f.caseId, f.clientId, f.tenantId);
    const byType = Object.fromEntries((finance.body.duesByType as Array<{ type: string; amount: number }>).map((row) => [row.type, row.amount]));
    return {
      asilAlacak: summary.body.asilAlacak as number,
      anaparaTutarlari: summary.body.paraBirimiDurumu?.asilAlacakParaBirimiBazinda as Array<{ paraBirimi: string; tutar: number }> | undefined,
      paraBirimi: {
        durum: summary.body.paraBirimiDurumu?.durum as string,
        gerekce: (summary.body.paraBirimiDurumu?.gerekce ?? null) as string | null,
        toplamGosterilebilir: summary.body.paraBirimiDurumu?.toplamGosterilebilir as boolean,
      },
      maliToplam: finance.body.totalDues as number,
      maliTurler: byType as Record<string, number>,
      uyap48_4: uyap.madde48_4Aciklama as string,
      belge: (belge as any).amounts as { principal: number; interest: number; expenses: number; total: number },
      sablon: { principal: (sablon as any).principal as string, expenses: (sablon as any).expenses as string, total: (sablon as any).total as string },
      portal: Object.fromEntries(
        (portal.dues as Array<Record<string, unknown>>).map((row) => [row.id as string, { amount: Number(row.amount), dueDate: day(row.dueDate as Date), interestStartDate: day(row.interestStartDate as Date | null) }]),
      ) as Record<string, { amount: number; dueDate: string | null; interestStartDate: string | null }>,
    };
  }

  /** Açılış masraf setinin peşin harcı (asıl alacak matrahından; en az 120). Yazım yapar: test başına bir kez. */
  async function pesinHarc(f: Fixture): Promise<number> {
    const created = await expenseRequests.createOpeningExpenseSet(f.caseId, f.tenantId, f.onayci.userId);
    const item = await prisma.expenseRequestItem.findFirstOrThrow({ where: { expenseRequestId: created.id, itemCode: 'PESIN_HARC' } });
    return Number(item.suggestedAmount);
  }

  const dueRow = (id: string) => prisma.due.findUniqueOrThrow({ where: { id } });

  it('A. onaylı değişiklik yokken çıktılar bugünkü değerleri verir (taban)', async () => {
    const f = await fixture('taban');
    const out = await outputs(f);

    expect(out.asilAlacak).toBe(30000);
    expect(out.anaparaTutarlari).toEqual([{ paraBirimi: 'TRY', tutar: 30000 }]);
    expect(out.paraBirimi).toEqual({ durum: 'TEK_PARA_BIRIMI_TL', gerekce: null, toplamGosterilebilir: true });
    expect(out.maliToplam).toBe(31200);
    expect(out.maliTurler).toEqual({ PRINCIPAL: 30000, EXPENSE: 500, NAFAKA: 700 });
    expect(out.uyap48_4).toContain(`Sentetik asıl alacak: ${tl(30000)} TRY`);
    expect(out.uyap48_4).toContain(`Sentetik masraf: ${tl(500)} TRY`);
    expect(out.uyap48_4).toContain(`Sentetik nafaka taksiti: ${tl(700)} TRY`);
    expect(out.uyap48_4).not.toContain('tarihinden itibaren'); // faiz başlangıcı yok → faiz cümlesi yok
    expect(out.belge).toMatchObject({ principal: 30000, expenses: 500 });
    expect(out.sablon).toEqual({ principal: tl(30000), expenses: tl(500), total: tl(30500) });
    expect(out.portal[f.asilDueId]).toEqual({ amount: 30000, dueDate: '2025-07-01', interestStartDate: null });
    expect(await pesinHarc(f)).toBe(150); // 30.000 × %0,5
  });

  it('B. kalemde onaylanan tutar ve faiz başlangıcı: Due satırı değişmez, bütün çıktılar kalemin değerini verir', async () => {
    const f = await fixture('onayli');
    await approveClaimChange(f, await put(`/claim-items/${f.asilClaimId}`, f.yetkili.userId, { amount: 100000 }));
    await approveClaimChange(f, await put(`/claim-items/${f.asilClaimId}`, f.yetkili.userId, {
      interestAccrualStatus: 'ACCRUES', interestStartDate: '2025-03-10', interestStartDateProvenance: 'DEFAULT_NOTICE_DATE',
    }));

    // Kalem onaylı değeri taşır; Due satırı onay öncesi değerde kalır (kalem → Due ters yazım yok).
    const claim = await prisma.claimItem.findUniqueOrThrow({ where: { id: f.asilClaimId } });
    expect([Number(claim.demandedAmount), day(claim.interestStartDate), claim.status]).toEqual([100000, '2025-03-10', 'ACTIVE']);
    const due = await dueRow(f.asilDueId);
    expect([Number(due.amount), due.interestStartDate]).toEqual([30000, null]);

    const out = await outputs(f);
    expect(out.asilAlacak).toBe(100000);
    expect(out.anaparaTutarlari).toEqual([{ paraBirimi: 'TRY', tutar: 100000 }]);
    expect(out.maliToplam).toBe(101200);
    expect(out.maliTurler).toEqual({ PRINCIPAL: 100000, EXPENSE: 500, NAFAKA: 700 });
    expect(out.uyap48_4).toContain(
      `Sentetik asıl alacak: ${tl(100000)} TRY (2025-03-10 tarihinden itibaren Adi Kanuni Faiz işletilecektir)`,
    );
    expect(out.uyap48_4).not.toContain(tl(30000));
    expect(out.belge).toMatchObject({ principal: 100000, expenses: 500 });
    expect(out.sablon).toEqual({ principal: tl(100000), expenses: tl(500), total: tl(100500) });
    expect(out.portal[f.asilDueId]).toEqual({ amount: 100000, dueDate: '2025-07-01', interestStartDate: '2025-03-10' });
    expect(out.portal[f.nafakaDueId]).toEqual({ amount: 700, dueDate: '2025-07-05', interestStartDate: null });
    expect(await pesinHarc(f)).toBe(500); // 100.000 × %0,5 — onay öncesi tutarla 150 çıkardı

    // Okuyucular hiçbir Due / kalem satırı yazmadı.
    expect([Number((await dueRow(f.asilDueId)).amount), (await dueRow(f.asilDueId)).updatedAt]).toEqual([30000, due.updatedAt]);
    expect((await prisma.claimItem.findUniqueOrThrow({ where: { id: f.asilClaimId } })).updatedAt).toEqual(claim.updatedAt);
  });

  it('C. kalemi onayla iptal edilen Due çıktılara girmez; kanonik kalemi olmayan Due aynen kalır', async () => {
    const f = await fixture('iptal');
    await approveClaimChange(f, await del(`/claim-items/${f.masrafClaimId}`, f.yetkili.userId));

    expect((await prisma.claimItem.findUniqueOrThrow({ where: { id: f.masrafClaimId } })).status).toBe('CANCELLED');
    expect(Number((await dueRow(f.masrafDueId)).amount)).toBe(500); // Due satırı duruyor

    const out = await outputs(f);
    expect(out.maliToplam).toBe(30700);
    expect(out.maliTurler).toEqual({ PRINCIPAL: 30000, NAFAKA: 700 });
    expect(out.uyap48_4).not.toContain('Sentetik masraf');
    expect(out.uyap48_4).toContain(`Sentetik asıl alacak: ${tl(30000)} TRY`);
    expect(out.uyap48_4).toContain(`Sentetik nafaka taksiti: ${tl(700)} TRY`);
    expect(out.belge).toMatchObject({ principal: 30000, expenses: 0 });
    expect(out.sablon).toEqual({ principal: tl(30000), expenses: tl(0), total: tl(30000) });
    expect(Object.keys(out.portal).sort()).toEqual([f.asilDueId, f.nafakaDueId].sort());
    expect(out.asilAlacak).toBe(30000);
  });

  it('D. asıl alacak kalemi onayla iptal edildiyse çıktılar dosyadaki eski tutar yedeğine düşmez', async () => {
    const f = await fixture('asiliptal');
    await approveClaimChange(f, await del(`/claim-items/${f.asilClaimId}`, f.yetkili.userId));
    expect((await prisma.claimItem.findUniqueOrThrow({ where: { id: f.asilClaimId } })).status).toBe('CANCELLED');
    expect(Number((await dueRow(f.asilDueId)).amount)).toBe(30000);

    const out = await outputs(f);
    expect(out.asilAlacak).toBe(0); // dosyadaki 77.777 yedeği KULLANILMAZ
    expect(out.anaparaTutarlari).toEqual([]);
    expect(out.maliToplam).toBe(1200);
    expect(out.uyap48_4).not.toContain('Sentetik asıl alacak');
    expect(out.belge).toMatchObject({ principal: 0, expenses: 500 });
    expect(out.sablon.principal).toBe(tl(0));
    expect(out.portal[f.asilDueId]).toBeUndefined();
    expect(await pesinHarc(f)).toBe(120); // matrah 0 → en az tutar
  });

  /**
   * Onaylı değer güvenle kullanılamıyor: Due'dan okuyan çıktıların HEPSİ açık uyumsuzluk hatasıyla durur (owner E4).
   * Büro uçları tanılamayı (dosya + satırlar) taşır; müvekkil portalı yalnız kendi iletisini görür. Hata yanıtları
   * tutar taşımaz. Açılış masraf seti hiçbir kayıt yazmadan reddedilir.
   */
  async function expectAllOutputsStop(f: Fixture, code: string, rows: Array<Record<string, unknown>>, forbiddenAmounts: number[]) {
    const officeBody = { code, caseId: f.caseId, rows, message: expect.stringContaining('bu mali çıktı üretilmedi') };
    const summary = await get(`/cases/${f.caseId}/calculation-summary`, f.onayci.userId, { date: AS_OF });
    const finance = await get(`/cases/${f.caseId}/finance-summary`, f.onayci.userId);
    for (const res of [summary, finance]) {
      expect([res.status, res.body]).toEqual([409, expect.objectContaining(officeBody)]);
      for (const amount of forbiddenAmounts) expect(JSON.stringify(res.body)).not.toContain(String(amount));
    }
    const db = prisma as never;
    const officeError = { status: 409, response: expect.objectContaining(officeBody) };
    await expect(new UyapCaseMapperService(db).mapCaseToTakipTalebi(f.caseId, f.tenantId)).rejects.toMatchObject(officeError);
    await expect(new DocumentService(db, undefined as never).prepareDocumentData(f.caseId, f.tenantId)).rejects.toMatchObject(officeError);
    await expect(new DocumentTemplateService(db).prepareVariablesFromCase(f.caseId, f.tenantId)).rejects.toMatchObject(officeError);
    const portalError = await new PortalService(db, undefined as never, undefined as never, undefined as never, undefined as never, undefined as never)
      .getCaseDetail(f.caseId, f.clientId, f.tenantId)
      .then(() => null, (error: any) => error);
    expect(portalError?.status).toBe(409);
    expect(portalError.getResponse()).toEqual({ code, message: expect.stringContaining('büronuzla iletişime geçin') });
    await expect(expenseRequests.createOpeningExpenseSet(f.caseId, f.tenantId, f.onayci.userId)).rejects.toMatchObject({ status: 409 });
    expect(await prisma.expenseRequest.count({ where: { caseId: f.caseId } })).toBe(0);
  }

  it('E. geçmiş kayıtta Due ile kalemin para birimi ayrışmışsa bütün çıktılar açık uyumsuzluk hatasıyla durur; eski Due değeri yok, hiçbir şey yazılmaz', async () => {
    const f = await fixture('ayrisma');
    // Geçmiş kayıt durumunun kurulumu (yeni yazımı kabul denetimi engeller): Due USD damgalı, bağlı kalem dosya gibi TRY.
    await prisma.due.update({ where: { id: f.asilDueId }, data: { currency: 'USD' } });
    await approveClaimChange(f, await put(`/claim-items/${f.asilClaimId}`, f.yetkili.userId, { amount: 100000 }));
    const claim = await prisma.claimItem.findUniqueOrThrow({ where: { id: f.asilClaimId } });
    expect([Number(claim.demandedAmount), claim.currency]).toEqual([100000, 'TRY']);
    const before = await dueRow(f.asilDueId);

    await expectAllOutputsStop(
      f,
      'DUE_CANONICAL_CURRENCY_MISMATCH',
      [{ dueId: f.asilDueId, claimItemIds: [f.asilClaimId], dueCurrency: 'USD', claimItemCurrency: 'TRY' }],
      [30000, 100000],
    );
    // Veri dönüştürülmedi / yazılmadı: Due ve kalem aynen.
    const after = await dueRow(f.asilDueId);
    expect([after.currency, Number(after.amount), after.updatedAt.toISOString()]).toEqual([before.currency, Number(before.amount), before.updatedAt.toISOString()]);
    const claimAfter = await prisma.claimItem.findUniqueOrThrow({ where: { id: f.asilClaimId } });
    expect([Number(claimAfter.demandedAmount), claimAfter.currency]).toEqual([100000, 'TRY']);
  });

  it('F. aynı Due\'ya birden çok kalem bağlıysa (bütünlük ihlali) bütün çıktılar belirsiz bağ hatasıyla durur', async () => {
    const f = await fixture('belirsiz');
    // Bütünlük ihlalinin kurulumu (yazım yolu reddeder): asıl alacak Due'sunu gösteren ikinci kalem satırı (açılış masraf
    // matrahı yalnız asıl alacak Due'larını okur; yedi çıktının hepsi bu satırı görür).
    const { id: _id, createdAt: _c, updatedAt: _u, ...copy } = await prisma.claimItem.findUniqueOrThrow({ where: { id: f.asilClaimId } });
    const twin = await prisma.claimItem.create({ data: { ...copy, amount: '9100.00', demandedAmount: '9100.00' } as never });

    await expectAllOutputsStop(
      f,
      'DUE_CANONICAL_BINDING_AMBIGUOUS',
      [{ dueId: f.asilDueId, claimItemIds: expect.arrayContaining([f.asilClaimId, twin.id]), dueCurrency: 'TRY', claimItemCurrency: null }],
      [9100],
    );
  });
});
