jest.mock('pdf-poppler', () => ({ convert: async () => { throw new Error('pdf-poppler is stubbed in this spec'); } }));

import { CanActivate, ExecutionContext, INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { OfficeApprovalExecutionStatus, OfficeApprovalStatus, PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import * as request from 'supertest';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { StorageModule } from '../../../common/storage/storage.module';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ErrorLogModule } from '../../error-log/error-log.module';
import { MetricsRegistryModule } from '../../metrics-registry/metrics-registry.module';
import { ClaimItemModule } from '../../claim-item/claim-item.module';
import { OfficeApprovalService } from '../../office-approval/office-approval.service';
import { resolveDormantNumericInterestProjection } from '../../uyap/numeric-interest-projection.adapter';
import { CaseModule } from '../case.module';
import { CASE_VIEW_SCOPE_FLAG } from '../case-view-scope';

/**
 * Due (dosya kalemi) yazım yolu bağlı KANONİK alacak kalemini korur — owner kararı 18.11.2026 (K1 / K2 / K3).
 * GERÇEK HTTP (POST / PATCH / DELETE /cases/:id/dues[/:dueId], PUT / DELETE /claim-items/:id) + gerçek yazma kapısı +
 * gerçek iki kişi onayı (talep eden ≠ onaylayan) + disposable PostgreSQL. Tutar, tarih ve adlar SENTETİK.
 *
 * Kanıtlanan:
 *  A. Koruma: açıklama değişikliği onaylı faizi korur; doğrudan ve dolaylı yüksek etkili değişiklik (tutar, tür, vade,
 *     faiz alanları, silme → iptal) hiçbir yazımdan önce 409 ile reddedilir ve Due, kalem, bakiye, onay ve denetim
 *     kayıtları değişmez; aynı değerin gönderilmesi değişiklik değildir; meşru düşük etkili düzenleme çalışır.
 *  B. Yetki: yalnız dosya düzeyi mali yazma yetkisi olan avukat / personel yazar; atanmamış, izinsiz, kartsız hesap,
 *     görüntüleyici ve başka büro yazamaz; dosya görünüm kapsamı açıkken kapsam dışı hesap 404 alır; denetim ile yazım
 *     arasındaki yetki iptali yarışı yazımı durdurur.
 *  C. Bekleyen onay: Due isteği bekleyen talebi değiştirmez / bayatlatmaz; talep sonradan onaylanabilir.
 *  D. Eşzamanlı istekler ayrışma ya da onaysız yüksek etkili yazım üretmez.
 *  E. Faiz hesabı ve UYAP sayısal faiz izdüşümü Due isteklerinden sonra da onaylı kalem kaydını kullanır.
 */
const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('DUE-CANONICAL-ITEM-GUARD DB gate blocked: CI requires an approved TEST_DATABASE_URL.');
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;
const PRODUCTION_VALIDATION_OPTIONS = { whitelist: true, forbidNonWhitelisted: true, transform: true } as const;
const AS_OF = '2026-01-10';
const SENTETIK_ORAN = '0.120000';

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

describeWithDisposableDb('Due yazım yolu bağlı kanonik kalemi korur — HTTP + iki kişi onayı (disposable PostgreSQL)', () => {
  jest.setTimeout(240_000);

  let prisma: PrismaClient;
  let app: INestApplication;
  let approvals: OfficeApprovalService;
  const tenantIds = new Set<string>();
  const officeIds = new Set<string>();
  const savedScopeFlag = process.env[CASE_VIEW_SCOPE_FLAG];

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
        ClaimItemModule,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(new DbUserIdentityGuard(() => prisma))
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe(PRODUCTION_VALIDATION_OPTIONS));
    await app.init();
    approvals = app.get(OfficeApprovalService);
  });

  afterEach(() => {
    if (savedScopeFlag === undefined) delete process.env[CASE_VIEW_SCOPE_FLAG];
    else process.env[CASE_VIEW_SCOPE_FLAG] = savedScopeFlag;
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
  const patch = (path: string, userId: string, body: Record<string, unknown>) => http().patch(path).set('x-test-user-id', userId).send(body);
  const put = (path: string, userId: string, body: Record<string, unknown>) => http().put(path).set('x-test-user-id', userId).send(body);
  const del = (path: string, userId: string) => http().delete(path).set('x-test-user-id', userId);
  const get = (path: string, userId: string, query: Record<string, string> = {}) => http().get(path).query(query).set('x-test-user-id', userId);
  const day = (value: Date | null | undefined) => (value ? value.toISOString().slice(0, 10) : null);

  const ASIL_ALACAK = { type: 'PRINCIPAL', amount: 1000, dueDate: '2025-01-15', interestType: 'YASAL', description: 'Sentetik asıl alacak' };

  async function fixture(label: string) {
    const suffix = randomUUID().slice(0, 8);
    const tenantId = `test-due-guard-${label}-${suffix}`;
    tenantIds.add(tenantId);
    await prisma.tenant.create({ data: { id: tenantId, name: `Due koruma ${label}`, slug: tenantId } });
    const office = await prisma.office.create({ data: { tenantId, name: `Sentetik büro ${label}` } });
    officeIds.add(office.id);
    await prisma.rateSchedule.create({
      data: {
        tenantId: office.id,
        interestType: 'LEGAL_3095',
        validFrom: new Date('2024-01-01T00:00:00.000Z'),
        validTo: null,
        annualRate: SENTETIK_ORAN,
        source: 'MANUAL',
        sourceRef: 'sentetik test oranı',
        versionHash: `due-guard-${suffix}`,
      },
    });
    const mkLawyer = async (key: string, role: 'USER' | 'ADMIN' | 'VIEWER', rank: 'LAWYER' | 'AUTHORIZED' | 'PARTNER') => {
      const user = await prisma.user.create({ data: { tenantId, email: `dg-${key}-${suffix}@example.test`, name: 'Sentetik', surname: key, role } });
      const lawyer = await prisma.lawyer.create({ data: { tenantId, officeId: office.id, userId: user.id, name: 'Sentetik', surname: key, lawyerRank: rank } });
      return { userId: user.id, lawyerId: lawyer.id };
    };
    const mkStaff = async (key: string, canSeeFinance: boolean) => {
      const user = await prisma.user.create({ data: { tenantId, email: `dg-${key}-${suffix}@example.test`, name: 'Sentetik', surname: key, role: 'USER' } });
      const staff = await prisma.staffMember.create({
        data: { tenantId, officeId: office.id, userId: user.id, firstName: 'Sentetik', lastName: key, staffType: 'SEKRETER', canSeeFinance },
      });
      return { userId: user.id, staffMemberId: staff.id };
    };
    const yetkili = await mkLawyer('Yetkili', 'USER', 'AUTHORIZED');
    const onayci = await mkLawyer('Onayci', 'ADMIN', 'PARTNER');
    const atanmamis = await mkLawyer('Atanmamis', 'USER', 'AUTHORIZED');
    const izinsiz = await mkLawyer('Izinsiz', 'USER', 'AUTHORIZED');
    const izleyici = await mkLawyer('Izleyici', 'VIEWER', 'LAWYER');
    const personelYetkili = await mkStaff('PersonelYetkili', true);
    const personelDuzenleyemez = await mkStaff('PersonelDuzenleyemez', true);
    const personelMaliKapali = await mkStaff('PersonelMaliKapali', false);
    const kartsiz = await prisma.user.create({ data: { tenantId, email: `dg-kartsiz-${suffix}@example.test`, name: 'Sentetik', surname: 'Kartsiz', role: 'USER' } });
    const otherTenant = await prisma.tenant.create({ data: { name: `Due koruma öteki ${label}`, slug: `test-due-guard-oteki-${label}-${suffix}` } });
    tenantIds.add(otherTenant.id);
    const yabanci = await prisma.user.create({ data: { tenantId: otherTenant.id, email: `dg-yabanci-${suffix}@example.test`, name: 'Sentetik', surname: 'Yabanci', role: 'ADMIN' } });

    const legalCase = await prisma.case.create({
      data: { tenantId, fileNumber: `DG-${label}-${suffix}`, type: 'GENERAL_EXECUTION', currency: 'TRY', caseDate: new Date('2025-06-01T00:00:00.000Z') } as never,
    });
    await prisma.caseLawyer.create({ data: { caseId: legalCase.id, lawyerId: onayci.lawyerId, role: 'RESPONSIBLE', isResponsible: true } });
    const yetkiliAtama = await prisma.caseLawyer.create({ data: { caseId: legalCase.id, lawyerId: yetkili.lawyerId, role: 'ASSIGNED', casePermissions: { canEditFinance: true } } });
    await prisma.caseLawyer.create({ data: { caseId: legalCase.id, lawyerId: izinsiz.lawyerId, role: 'ASSIGNED', casePermissions: { canEditFinance: false } } });
    // Görüntüleyiciye dosyada mali düzenleme izni verilmiş olsa da rol sınırı yazımı durdurur.
    await prisma.caseLawyer.create({ data: { caseId: legalCase.id, lawyerId: izleyici.lawyerId, role: 'ASSIGNED', casePermissions: { canEditFinance: true } } });
    await prisma.caseStaff.create({ data: { caseId: legalCase.id, staffMemberId: personelYetkili.staffMemberId, roleOnCase: 'MUHASEBE', canEdit: true, canView: true } });
    await prisma.caseStaff.create({ data: { caseId: legalCase.id, staffMemberId: personelDuzenleyemez.staffMemberId, roleOnCase: 'MUHASEBE', canEdit: false, canView: true } });
    await prisma.caseStaff.create({ data: { caseId: legalCase.id, staffMemberId: personelMaliKapali.staffMemberId, roleOnCase: 'YAZI_ISLERI', canEdit: true, canView: true } });

    // Due + bağlı kanonik kalem GERÇEK köprüyle oluşur.
    const created = await post(`/cases/${legalCase.id}/dues`, yetkili.userId, ASIL_ALACAK);
    if (created.status !== 201) throw new Error(`Due oluşturulamadı: ${created.status} ${JSON.stringify(created.body)}`);
    const claim = await prisma.claimItem.findFirstOrThrow({ where: { caseId: legalCase.id } });
    return {
      tenantId, caseId: legalCase.id, dueId: created.body.id as string, claimId: claim.id,
      duesPath: `/cases/${legalCase.id}/dues`, duePath: `/cases/${legalCase.id}/dues/${created.body.id}`,
      yetkili, onayci, atanmamis, izinsiz, izleyici, personelYetkili, personelDuzenleyemez, personelMaliKapali,
      kartsizUserId: kartsiz.id, yabanciUserId: yabanci.id, yetkiliAtamaId: yetkiliAtama.id,
    };
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;

  const claimRow = (id: string) => prisma.claimItem.findUniqueOrThrow({ where: { id } });
  const dueRow = (id: string) => prisma.due.findUnique({ where: { id } });

  /** Onaya giden kalem talebi (PUT / DELETE /claim-items/:id) → talep kimliği. */
  async function approvalIdOf(res: request.Response): Promise<string> {
    if (res.status !== 200 || res.body?.data?.approvalRequired !== true) {
      throw new Error(`onay talebi beklenirdi: ${res.status} ${JSON.stringify(res.body)}`);
    }
    return res.body.data.approvalRequestId as string;
  }

  /** Kalemi GERÇEK iki kişi onayıyla "faiz işler + başlangıç + dayanak" durumuna getirir. */
  async function approveAccrues(f: Fixture) {
    const id = await approvalIdOf(await put(`/claim-items/${f.claimId}`, f.yetkili.userId, {
      interestAccrualStatus: 'ACCRUES',
      interestStartDate: '2025-03-10',
      interestStartDateProvenance: 'DEFAULT_NOTICE_DATE',
    }));
    await approvals.approve(id, f.onayci.userId);
    const row = await claimRow(f.claimId);
    expect([row.interestAccrualStatus, day(row.interestStartDate), row.interestStartDateProvenance, row.interestTypeCode])
      .toEqual(['ACCRUES', '2025-03-10', 'DEFAULT_NOTICE_DATE', 'LEGAL_3095']);
  }

  /** Dosyanın yazılabilir bütün ilgili kayıtlarının özeti (updatedAt dahil): eşitlik = hiçbir satır yazılmadı. */
  async function recordDigest(f: Fixture): Promise<string> {
    const [dues, claims, approvalRows, audits, events] = await Promise.all([
      prisma.due.findMany({ where: { caseId: f.caseId }, orderBy: { id: 'asc' } }),
      prisma.claimItem.findMany({ where: { caseId: f.caseId }, orderBy: { id: 'asc' } }),
      prisma.officeApprovalRequest.findMany({ where: { tenantId: f.tenantId }, orderBy: { id: 'asc' } }),
      prisma.auditLog.count({ where: { tenantId: f.tenantId } }),
      prisma.icrabotTimelineEntry.count({ where: { tenantId: f.tenantId } }),
    ]);
    return JSON.stringify({ dues, claims, approvalRows, audits, events });
  }

  /** Yanıtın üretildiği an (`generatedAt`) her okumada değişir; hesap içeriği değildir. */
  const withoutGeneratedAt = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(withoutGeneratedAt);
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .filter(([key]) => key !== 'generatedAt')
          .map(([key, inner]) => [key, withoutGeneratedAt(inner)]),
      );
    }
    return value;
  };

  /** Motorun okuduğu bakiye görünümü + hesap özeti (okuma uçları; yazım yapmaz). */
  async function balanceView(f: Fixture) {
    const view = await get(`/interest-engine/case/${f.caseId}/balance/display`, f.yetkili.userId, { asOfDate: AS_OF });
    const summary = await get(`/cases/${f.caseId}/calculation-summary`, f.yetkili.userId, { date: AS_OF });
    if (view.status !== 200 || summary.status !== 200) {
      throw new Error(`bakiye okunamadı: ${view.status} / ${summary.status} ${JSON.stringify(view.body).slice(0, 300)}`);
    }
    return { view: withoutGeneratedAt(view.body) as any, summary: withoutGeneratedAt(summary.body) as any };
  }

  /** Reddedilen istek: gövde sözleşmesi + hiçbir kaydın ve bakiyenin değişmediği. */
  async function expectRejectedWithoutWrite(
    f: Fixture,
    run: () => request.Test,
    expected: { status: number; code?: string; fields?: string[] },
  ) {
    const digestBefore = await recordDigest(f);
    const balanceBefore = await balanceView(f);
    const res = await run();
    expect([res.status, res.body?.code ?? null]).toEqual([expected.status, expected.code ?? res.body?.code ?? null]);
    if (expected.fields) expect(res.body.fields).toEqual(expected.fields);
    expect(await recordDigest(f)).toBe(digestBefore);
    expect(await balanceView(f)).toEqual(balanceBefore);
    return res;
  }

  describe('A. Koruma — bağlı kanonik kalem', () => {
    it('açıklama değişikliği onaylı faizi korur; açıklama kaleme yansır; onay talebi doğmaz', async () => {
      const f = await fixture('aciklama');
      await approveAccrues(f);
      const before = await claimRow(f.claimId);
      expect((await dueRow(f.dueId))?.interestStartDate).toBeNull(); // onaylı başlangıç yalnız kalemde; Due'da boş

      const res = await patch(f.duePath, f.yetkili.userId, { description: 'Sentetik yeni açıklama' });
      expect(res.status).toBe(200);

      const after = await claimRow(f.claimId);
      expect(after.description).toBe('Sentetik yeni açıklama');
      expect((await dueRow(f.dueId))?.description).toBe('Sentetik yeni açıklama');
      const { description: _d1, updatedAt: _u1, ...beforeRest } = before;
      const { description: _d2, updatedAt: _u2, ...afterRest } = after;
      expect(afterRest).toEqual(beforeRest); // faiz durumu, başlangıç, dayanak, tutar, tür … aynen
      expect([after.interestAccrualStatus, day(after.interestStartDate), after.interestStartDateProvenance])
        .toEqual(['ACCRUES', '2025-03-10', 'DEFAULT_NOTICE_DATE']);
      expect(await prisma.officeApprovalRequest.count({ where: { tenantId: f.tenantId } })).toBe(1); // yalnız ilk onay
      const audit = await prisma.auditLog.findMany({ where: { tenantId: f.tenantId, action: 'CLAIM_ITEM_SYSTEM_UPDATED', entityId: f.claimId } });
      expect(audit).toHaveLength(1);
      expect(audit[0].userId).toBe(f.yetkili.userId);
    });

    it.each([
      ['faiz başlangıç tarihi', { interestStartDate: '2024-02-01' }, ['interestStartDate']],
      ['faiz bitiş tarihi', { interestEndDate: '2025-12-31' }, ['interestEndDate']],
      ['tutar', { amount: 1500 }, ['amount']],
      ['vade tarihi', { dueDate: '2025-02-20' }, ['dueDate']],
      ['kalem türünü değiştiren tür', { type: 'EXPENSE' }, ['type']],
      ['faiz türü', { interestTypeCode: 'COMMERCIAL_AVANS_3095_2_2', interestType: 'TICARI' }, ['interestTypeCode', 'interestType']],
      ['faiz oranı (sabit oranlı türe geçiş)', { interestTypeCode: 'COMMERCIAL_FIXED', interestType: 'SABIT', interestRate: 18 }, ['interestTypeCode', 'interestType', 'interestRate']],
      ['faiz durumu: belirlenmedi', { interestAccrualStatus: 'UNKNOWN' }, ['interestAccrualStatus']],
      [
        'faiz işlemez',
        { interestAccrualStatus: 'NO_INTEREST', noInterestReason: 'Sentetik gerekçe', interestTypeCode: null, interestType: null },
        ['interestTypeCode', 'interestType', 'interestAccrualStatus', 'noInterestReason'],
      ],
      ['düşük etkili alanla birlikte tutar (kısmi yazım yok)', { description: 'Kısmi yazılmamalı', amount: 1500 }, ['amount']],
    ] as Array<[string, Record<string, unknown>, string[]]>)(
      'doğrudan yüksek etkili değişiklik reddedilir, hiçbir kayıt ve bakiye değişmez — %s',
      async (_label, body, fields) => {
        const f = await fixture('ret');
        await approveAccrues(f);
        const res = await expectRejectedWithoutWrite(f, () => patch(f.duePath, f.yetkili.userId, body), {
          status: 409,
          code: 'DUE_CHANGE_REQUIRES_CLAIM_ITEM_APPROVAL',
          fields,
        });
        expect(res.body.claimItemId).toBe(f.claimId);
        expect(res.body.canonicalAction).toEqual({ method: 'PUT', path: `/claim-items/${f.claimId}` });
        expect(res.body.message).toContain('Onaya Gönder');
        expect(res.body.message).toContain('Hiçbir kayıt değiştirilmedi');
      },
    );

    it('mevcut giriş kuralları aynen: uyumsuz para birimi ve Due ucundan "faiz işler" 400; hiçbir kayıt değişmez', async () => {
      const f = await fixture('parabirimi');
      await approveAccrues(f);
      await expectRejectedWithoutWrite(f, () => patch(f.duePath, f.yetkili.userId, { currency: 'USD' }), {
        status: 400,
        code: 'CASE_CLAIM_CURRENCY_MISMATCH',
      });
      // Due ucu "faiz işler" durumunu ve başlangıç dayanağını hiçbir zaman yazamaz (PR-A2 sınırı).
      await expectRejectedWithoutWrite(f, () => patch(f.duePath, f.yetkili.userId, { interestAccrualStatus: 'ACCRUES' }), { status: 400 });
      // Zengin faiz kodu varken yalnız eski tür adıyla değişiklik isteği giriş kuralınca 400.
      await expectRejectedWithoutWrite(f, () => patch(f.duePath, f.yetkili.userId, { interestType: 'TICARI' }), { status: 400 });
    });

    it('dolaylı yol: ekranın eski düzenleme yükü değerler değişmeden kaydedilince Due ve kalem HİÇ yazılmaz', async () => {
      const f = await fixture('eskiyuk');
      await approveAccrues(f);
      const digestBefore = await recordDigest(f);
      const res = await patch(f.duePath, f.yetkili.userId, {
        type: 'PRINCIPAL',
        description: 'Sentetik asıl alacak',
        amount: 1000,
        dueDate: '2025-01-15',
        currency: 'TRY',
        interestType: 'YASAL',
      });
      expect(res.status).toBe(200);
      const claim = await claimRow(f.claimId);
      expect([claim.interestAccrualStatus, day(claim.interestStartDate), claim.interestStartDateProvenance])
        .toEqual(['ACCRUES', '2025-03-10', 'DEFAULT_NOTICE_DATE']);
      // Kalem satırı, onay ve denetim kayıtları aynı; Due satırı yalnız updatedAt bakımından yeniden yazılmış olabilir.
      const strip = (digest: string) => {
        const parsed = JSON.parse(digest);
        parsed.dues = parsed.dues.map(({ updatedAt: _u, ...rest }: Record<string, unknown>) => rest);
        return parsed;
      };
      expect(strip(await recordDigest(f))).toEqual(strip(digestBefore));
    });

    it('aynı değer farklı biçimde gönderilince değişiklik sayılmaz (sayı, tarih, tür kodu)', async () => {
      const f = await fixture('ayni');
      await approveAccrues(f);
      const claimBefore = await claimRow(f.claimId);
      const res = await patch(f.duePath, f.yetkili.userId, {
        amount: 1000.0,
        dueDate: '2025-01-15T00:00:00.000Z',
        interestType: 'YASAL',
        interestTypeCode: 'LEGAL_3095',
        interestRate: null,
      });
      expect(res.status).toBe(200);
      expect(await claimRow(f.claimId)).toEqual(claimBefore); // updatedAt dahil: kaleme yazılmadı
    });

    it('istek Due\'dan farklı ama kalemdeki onaylı değere eşitse yalnız Due yazılır; kalem değişmez', async () => {
      const f = await fixture('yakinsa');
      await approveAccrues(f);
      // Tutar kalem ucundan, onayla 1200 yapılır; Due 1000 kalır (kalem → Due geri yazımı yoktur).
      const id = await approvalIdOf(await put(`/claim-items/${f.claimId}`, f.yetkili.userId, { amount: 1200 }));
      await approvals.approve(id, f.onayci.userId);
      const claimBefore = await claimRow(f.claimId);
      expect([Number(claimBefore.amount), Number((await dueRow(f.dueId))!.amount)]).toEqual([1200, 1000]);

      const res = await patch(f.duePath, f.yetkili.userId, { amount: 1200, interestStartDate: '2025-03-10' });
      expect(res.status).toBe(200);
      const due = await dueRow(f.dueId);
      expect([Number(due!.amount), day(due!.interestStartDate)]).toEqual([1200, '2025-03-10']);
      expect(await claimRow(f.claimId)).toEqual(claimBefore);
      // Kalemle çelişen başka bir tutar yine reddedilir.
      await expectRejectedWithoutWrite(f, () => patch(f.duePath, f.yetkili.userId, { amount: 1300 }), {
        status: 409,
        code: 'DUE_CHANGE_REQUIRES_CLAIM_ITEM_APPROVAL',
        fields: ['amount'],
      });
    });

    it('kalem türünü değiştirmeyen Due türü (asıl alacak → kira) yalnız Due\'ya yazılır', async () => {
      const f = await fixture('tur');
      await approveAccrues(f);
      const claimBefore = await claimRow(f.claimId);
      const res = await patch(f.duePath, f.yetkili.userId, { type: 'KIRA' });
      expect(res.status).toBe(200);
      expect((await dueRow(f.dueId))?.type).toBe('KIRA');
      expect(await claimRow(f.claimId)).toEqual(claimBefore);
    });

    it('meşru düşük etkili düzenleme: sıra ve Due\'ya özgü alanlar yazılır; kalemde yalnız sıra değişir', async () => {
      const f = await fixture('dusuk');
      await approveAccrues(f);
      const before = await claimRow(f.claimId);
      const res = await patch(f.duePath, f.yetkili.userId, { sortOrder: 7, sourceDocumentNo: 'SENTETIK-BELGE-1', isPrimary: true });
      expect(res.status).toBe(200);
      const due = await dueRow(f.dueId);
      expect([due!.sortOrder, due!.sourceDocumentNo, due!.isPrimary]).toEqual([7, 'SENTETIK-BELGE-1', true]);
      const after = await claimRow(f.claimId);
      const { sortOrder: _s1, updatedAt: _u1, ...beforeRest } = before;
      const { sortOrder: s2, updatedAt: _u2, ...afterRest } = after;
      expect(s2).toBe(7);
      expect(afterRest).toEqual(beforeRest);
    });

    it('silme: etkin bağlı kalem varken reddedilir; kanonik iptal onaylandıktan sonra Due silinir', async () => {
      const f = await fixture('silme');
      await approveAccrues(f);
      const res = await expectRejectedWithoutWrite(f, () => del(f.duePath, f.yetkili.userId), {
        status: 409,
        code: 'DUE_DELETE_REQUIRES_CLAIM_ITEM_CANCEL_APPROVAL',
      });
      expect(res.body.canonicalAction).toEqual({ method: 'DELETE', path: `/claim-items/${f.claimId}` });
      expect((await claimRow(f.claimId)).status).toBe('ACTIVE');

      // Kanonik yol: kalem silme talebi → başka kişinin onayı → kalem İPTAL.
      const id = await approvalIdOf(await del(`/claim-items/${f.claimId}`, f.yetkili.userId));
      await approvals.approve(id, f.onayci.userId);
      const cancelled = await claimRow(f.claimId);
      expect(cancelled.status).toBe('CANCELLED');

      const removed = await del(f.duePath, f.yetkili.userId);
      expect(removed.status).toBe(200);
      expect(await dueRow(f.dueId)).toBeNull();
      expect(await claimRow(f.claimId)).toEqual(cancelled); // Due yolu kaleme dokunmadı
    });

    it('kanonik kalem üretmeyen tür (nafaka): Due kendi alanlarıyla güncellenir ve silinir', async () => {
      const f = await fixture('nafaka');
      const created = await post(f.duesPath, f.yetkili.userId, { type: 'NAFAKA', amount: 300, dueDate: '2025-05-05', description: 'Sentetik nafaka taksiti' });
      expect(created.status).toBe(201);
      const path = `${f.duesPath}/${created.body.id}`;
      expect(await prisma.claimItem.count({ where: { caseId: f.caseId } })).toBe(1); // nafaka kalem üretmez
      const updated = await patch(path, f.yetkili.userId, { amount: 350, dueDate: '2025-06-05' });
      expect(updated.status).toBe(200);
      expect(Number((await dueRow(created.body.id))!.amount)).toBe(350);
      expect((await del(path, f.yetkili.userId)).status).toBe(200);
      expect(await dueRow(created.body.id)).toBeNull();
    });
  });

  describe('B. Yetki — dosya kapsamı + mali yazma yetkisi', () => {
    it('yalnız dosyada mali yazma yetkisi olan avukat / personel yazar; ötekiler yazımdan önce reddedilir', async () => {
      const f = await fixture('yetki');
      await approveAccrues(f);
      const denied: Array<[string, string, number, string]> = [
        ['dosyaya atanmamış avukat', f.atanmamis.userId, 403, 'DUE_WRITE_FORBIDDEN'],
        ['atanmış ama mali düzenleme izni olmayan avukat', f.izinsiz.userId, 403, 'DUE_WRITE_FORBIDDEN'],
        ['dosyada düzenleme izni olmayan personel', f.personelDuzenleyemez.userId, 403, 'DUE_WRITE_FORBIDDEN'],
        ['mali modülü kapalı personel', f.personelMaliKapali.userId, 403, 'DUE_WRITE_FORBIDDEN'],
        ['kartsız hesap', f.kartsizUserId, 403, 'DUE_WRITE_FORBIDDEN'],
        ['görüntüleyici', f.izleyici.userId, 403, 'VIEWER_WRITE_DENIED'],
      ];
      for (const [label, userId, status, code] of denied) {
        for (const run of [
          () => post(f.duesPath, userId, { type: 'EXPENSE', amount: 50, dueDate: '2025-04-04', description: 'Yazılmamalı' }),
          () => patch(f.duePath, userId, { description: 'Yazılmamalı' }),
          () => del(f.duePath, userId),
        ]) {
          const res = await expectRejectedWithoutWrite(f, run, { status, code });
          expect([label, res.status]).toEqual([label, status]);
        }
      }
      // Başka büro: dosya yokmuş gibi 404 (varlık sızmaz).
      for (const run of [
        () => post(f.duesPath, f.yabanciUserId, { type: 'EXPENSE', amount: 50, dueDate: '2025-04-04' }),
        () => patch(f.duePath, f.yabanciUserId, { description: 'Yazılmamalı' }),
        () => del(f.duePath, f.yabanciUserId),
      ]) {
        const res = await expectRejectedWithoutWrite(f, run, { status: 404 });
        expect(res.body.message).toBe('Dosya bulunamadı');
      }

      // Yetkili avukat ve yetkili personel: ekleme + düşük etkili düzenleme çalışır.
      for (const userId of [f.yetkili.userId, f.personelYetkili.userId]) {
        const added = await post(f.duesPath, userId, { type: 'EXPENSE', amount: 50, dueDate: '2025-04-04', description: 'Sentetik masraf' });
        expect(added.status).toBe(201);
        const edited = await patch(`${f.duesPath}/${added.body.id}`, userId, { description: 'Sentetik masraf (düzeltildi)' });
        expect(edited.status).toBe(200);
      }
    });

    it('dosya görünüm kapsamı açıkken kapsam dışı hesap 404 alır; kapsamdaki yetkili yazmaya devam eder', async () => {
      const f = await fixture('kapsam');
      await approveAccrues(f);
      process.env[CASE_VIEW_SCOPE_FLAG] = 'true';
      const digest = await recordDigest(f);
      for (const userId of [f.atanmamis.userId, f.kartsizUserId]) {
        for (const res of [
          await post(f.duesPath, userId, { type: 'EXPENSE', amount: 50, dueDate: '2025-04-04' }),
          await patch(f.duePath, userId, { description: 'Yazılmamalı' }),
          await del(f.duePath, userId),
        ]) {
          expect([res.status, res.body.message]).toEqual([404, 'Dosya bulunamadı']);
        }
      }
      expect(await recordDigest(f)).toBe(digest);
      expect((await patch(f.duePath, f.yetkili.userId, { description: 'Kapsamdaki yetkili yazdı' })).status).toBe(200);
    });

    it.each([
      ['izin kaldırma (casePermissions)', 'REVOKE'],
      ['ekipten çıkarma (atama satırı silinir)', 'REMOVE'],
    ] as Array<[string, 'REVOKE' | 'REMOVE']>)(
      'denetim ile yazım arasındaki yetki iptali yarışı: bekleyen iptal commit edilince istek yazmadan reddedilir — %s',
      async (_label, kind) => {
        const f = await fixture('yaris');
        await approveAccrues(f);
        const digestBefore = await recordDigest(f);
        let settled = false;
        let pendingRequest: Promise<request.Response> | undefined;
        await prisma.$transaction(
          async (tx) => {
            // İptal işlemi başlamış ama commit etmemiş: atama satırı kilitli.
            if (kind === 'REVOKE') {
              await tx.caseLawyer.update({ where: { id: f.yetkiliAtamaId }, data: { casePermissions: { canEditFinance: false } } });
            } else {
              await tx.caseLawyer.delete({ where: { id: f.yetkiliAtamaId } });
            }
            pendingRequest = patch(f.duePath, f.yetkili.userId, { description: 'Yarış sırasında yazılmamalı' }).then((res) => {
              settled = true;
              return res;
            });
            await new Promise((resolve) => setTimeout(resolve, 800));
            expect(settled).toBe(false); // istek, iptalin tuttuğu satır kilidini bekliyor
          },
          { timeout: 20_000 },
        );
        const res = await pendingRequest!;
        expect([res.status, res.body.code]).toEqual([403, 'DUE_WRITE_FORBIDDEN']);
        // Yalnız iptalin kendi yazımı var; Due ve kalem değişmedi.
        const strip = (digest: string) => {
          const { dues, claims, approvalRows } = JSON.parse(digest);
          return { dues, claims, approvalRows };
        };
        expect(strip(await recordDigest(f))).toEqual(strip(digestBefore));
      },
    );
  });

  describe('C. Bekleyen onay talebi', () => {
    async function pendingAmountRequest(f: Fixture) {
      const id = await approvalIdOf(await put(`/claim-items/${f.claimId}`, f.yetkili.userId, { amount: 1200 }));
      expect((await prisma.officeApprovalRequest.findUniqueOrThrow({ where: { id } })).status).toBe(OfficeApprovalStatus.PENDING_APPROVAL);
      return id;
    }
    async function expectStillApprovable(f: Fixture, id: string) {
      await approvals.approve(id, f.onayci.userId);
      const executed = await prisma.officeApprovalRequest.findUniqueOrThrow({ where: { id } });
      expect([executed.status, executed.executionStatus]).toEqual([OfficeApprovalStatus.APPROVED, OfficeApprovalExecutionStatus.SUCCEEDED]);
      expect(Number((await claimRow(f.claimId)).amount)).toBe(1200);
    }

    it('yüksek etkili Due isteği reddedilir; bekleyen talep değişmez ve sonradan onaylanır', async () => {
      const f = await fixture('bekleyen-yuksek');
      await approveAccrues(f);
      const id = await pendingAmountRequest(f);
      await expectRejectedWithoutWrite(f, () => patch(f.duePath, f.yetkili.userId, { amount: 1500 }), {
        status: 409,
        code: 'DUE_CHANGE_REQUIRES_CLAIM_ITEM_APPROVAL',
        fields: ['amount'],
      });
      await expectRejectedWithoutWrite(f, () => del(f.duePath, f.yetkili.userId), {
        status: 409,
        code: 'DUE_DELETE_REQUIRES_CLAIM_ITEM_CANCEL_APPROVAL',
      });
      await expectStillApprovable(f, id);
    });

    it('kaleme yansıyacak düşük etkili Due isteği (açıklama) bekleyen talebi bayatlatmasın diye reddedilir', async () => {
      const f = await fixture('bekleyen-dusuk');
      await approveAccrues(f);
      const id = await pendingAmountRequest(f);
      const res = await expectRejectedWithoutWrite(f, () => patch(f.duePath, f.yetkili.userId, { description: 'Talep beklerken' }), {
        status: 409,
        code: 'DUE_EDIT_BLOCKED_BY_PENDING_CLAIM_ITEM_APPROVAL',
      });
      expect(res.body.message).toContain('Onay Kutusu');
      await expectStillApprovable(f, id);
      // Talep sonuçlandıktan sonra aynı düzenleme çalışır.
      expect((await patch(f.duePath, f.yetkili.userId, { description: 'Talep sonuçlandıktan sonra' })).status).toBe(200);
    });

    it('kaleme yansımayan Due alanı (ana kalem işareti) bekleyen talep varken de yazılır; talep onaylanabilir kalır', async () => {
      const f = await fixture('bekleyen-due');
      await approveAccrues(f);
      const id = await pendingAmountRequest(f);
      const claimBefore = await claimRow(f.claimId);
      expect((await patch(f.duePath, f.yetkili.userId, { isPrimary: true })).status).toBe(200);
      expect(await claimRow(f.claimId)).toEqual(claimBefore);
      await expectStillApprovable(f, id);
    });
  });

  describe('D. Eşzamanlı istekler', () => {
    it('aynı Due\'ya iki eşzamanlı açıklama: ikisi de tamamlanır, Due ile kalem ayrışmaz', async () => {
      const f = await fixture('es-aciklama');
      await approveAccrues(f);
      const results = await Promise.all([
        patch(f.duePath, f.yetkili.userId, { description: 'Eşzamanlı A' }),
        patch(f.duePath, f.personelYetkili.userId, { description: 'Eşzamanlı B' }),
      ]);
      expect(results.map((r) => r.status)).toEqual([200, 200]);
      const [due, claim] = [await dueRow(f.dueId), await claimRow(f.claimId)];
      expect(['Eşzamanlı A', 'Eşzamanlı B']).toContain(due!.description);
      expect(claim.description).toBe(due!.description);
      expect([claim.interestAccrualStatus, day(claim.interestStartDate)]).toEqual(['ACCRUES', '2025-03-10']);
    });

    it('eşzamanlı düşük etkili + yüksek etkili istek: yalnız düşük etkili yazılır', async () => {
      const f = await fixture('es-karma');
      await approveAccrues(f);
      const [low, high] = await Promise.all([
        patch(f.duePath, f.yetkili.userId, { description: 'Eşzamanlı açıklama' }),
        patch(f.duePath, f.personelYetkili.userId, { amount: 1500, interestStartDate: '2024-02-01' }),
      ]);
      expect([low.status, high.status]).toEqual([200, 409]);
      const [due, claim] = [await dueRow(f.dueId), await claimRow(f.claimId)];
      expect([Number(due!.amount), Number(claim.amount), day(claim.interestStartDate), claim.description])
        .toEqual([1000, 1000, '2025-03-10', 'Eşzamanlı açıklama']);
    });

    it('onay yürütmesi ile eşzamanlı Due isteği: kalemi yalnız onay değiştirir, Due isteği güncel kaleme göre karar verir', async () => {
      const f = await fixture('es-onay');
      await approveAccrues(f);
      const id = await approvalIdOf(await put(`/claim-items/${f.claimId}`, f.yetkili.userId, { amount: 1200 }));
      const [, dueRes] = await Promise.all([
        approvals.approve(id, f.onayci.userId),
        patch(f.duePath, f.yetkili.userId, { amount: 1200 }),
      ]);
      const [due, claim, approval] = [
        await dueRow(f.dueId),
        await claimRow(f.claimId),
        await prisma.officeApprovalRequest.findUniqueOrThrow({ where: { id } }),
      ];
      expect([approval.status, approval.executionStatus]).toEqual([OfficeApprovalStatus.APPROVED, OfficeApprovalExecutionStatus.SUCCEEDED]);
      expect(Number(claim.amount)).toBe(1200); // onayın yazdığı değer
      // Due isteği onaydan ÖNCE karar verdiyse 409 (Due 1000 kalır), SONRA verdiyse 200 (Due 1200 olur); kaleme yazmaz.
      expect([200, 409]).toContain(dueRes.status);
      expect(Number(due!.amount)).toBe(dueRes.status === 200 ? 1200 : 1000);
    });
  });

  describe('E. Faiz hesabı ve UYAP izdüşümü korunan kaydı kullanır', () => {
    it('reddedilen ve izin verilen Due isteklerinden sonra motor faizi ve UYAP sayısal faiz izdüşümü aynı kalır', async () => {
      const f = await fixture('faiz');
      await approveAccrues(f);
      const baseline = await balanceView(f);
      const accrued = (body: any) => body.view.buckets.find((b: { code: string }) => b.code === 'ACCRUED_INTEREST');
      // Motor, onaylı başlangıç tarihinden (10.03.2025) sentetik oranla faiz hesaplamış olmalı.
      expect(typeof accrued(baseline)?.amount).toBe('number');
      expect(accrued(baseline).amount).toBeGreaterThan(0);

      const projection = async () => {
        const row = await claimRow(f.claimId);
        return resolveDormantNumericInterestProjection({
          claimItemId: row.id,
          interestAccrualStatus: row.interestAccrualStatus,
          interestTypeCode: row.interestTypeCode,
          legacyInterestType: row.interestType,
          interestRate: row.interestRate,
          interestStartDate: row.interestStartDate,
          interestStartDateProvenance: row.interestStartDateProvenance,
        });
      };
      const projectionBefore = await projection();
      expect(projectionBefore).toEqual(expect.objectContaining({ ok: true, status: 'PROJECTED', canonicalCode: 'LEGAL_3095', interestStartDate: '2025-03-10' }));

      // Eski davranışta faizi bozan üç istek: yalnız açıklama, ekranın eski yükü, başlangıç tarihi.
      expect((await patch(f.duePath, f.yetkili.userId, { description: 'Sentetik açıklama (faiz korunur)' })).status).toBe(200);
      expect((await patch(f.duePath, f.yetkili.userId, {
        type: 'PRINCIPAL', description: 'Sentetik açıklama (faiz korunur)', amount: 1000, dueDate: '2025-01-15', currency: 'TRY', interestType: 'YASAL',
      })).status).toBe(200);
      expect((await patch(f.duePath, f.yetkili.userId, { interestStartDate: '2024-02-01' })).status).toBe(409);
      expect((await patch(f.duePath, f.yetkili.userId, { interestAccrualStatus: 'UNKNOWN' })).status).toBe(409);

      const after = await balanceView(f);
      expect(accrued(after)).toEqual(accrued(baseline));
      expect(after.view.totals).toEqual(baseline.view.totals);
      expect(await projection()).toEqual(projectionBefore);
    });
  });
});
