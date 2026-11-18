jest.mock('pdf-poppler', () => ({ convert: async () => { throw new Error('pdf-poppler is stubbed in this spec'); } }));

import { CanActivate, ExecutionContext, INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { OfficeApprovalExecutionStatus, OfficeApprovalStatus, PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import * as request from 'supertest';
import { approvedDueIdOf } from '../../../../test/due-create-approval-fixture';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { StorageModule } from '../../../common/storage/storage.module';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ClaimItemModule } from '../../claim-item/claim-item.module';
import { ErrorLogModule } from '../../error-log/error-log.module';
import { MetricsRegistryModule } from '../../metrics-registry/metrics-registry.module';
import { OfficeApprovalService } from '../../office-approval/office-approval.service';
import { UyapCaseMapperService } from '../../uyap-export/uyap-case-mapper.service';
import { CaseModule } from '../case.module';

/**
 * Due (dosya kalemi) EKLEME ve kaleme ULAŞMAYAN etkili Due değişiklikleri iki kişi onayına tabidir — owner kararı
 * 19.11.2026. GERÇEK HTTP (POST / PATCH / DELETE /cases/:id/dues[/:dueId]) + gerçek onay servisi (talep eden ≠
 * onaylayan) + disposable PostgreSQL. Tutar, tarih ve adlar SENTETİK.
 *
 * Kanıtlanan:
 *  A. Talep: istek Due satırı da kanonik kalem de OLUŞTURMAZ; mevcut yüksek etkili kalem değişikliği onayına talep
 *     açar (aynı işlem kodu, hedef dosya). Onaylanmamış kalem etkin borca girmez (bakiye ve hesap özeti değişmez).
 *     Geçersiz istek ve yetkisiz hesap talep açamaz. Aynı içerikli bekleyen talep ikinci kez açılmaz.
 *  B. Onay: talep eden kendi talebini onaylayamaz; başka yetkili hesabın onayında Due + bağlı kanonik kalem köprüden
 *     oluşur ve o andan itibaren borca girer; kalem üretmeyen türde yalnız Due oluşur. Ret / iptal hiçbir kayıt
 *     oluşturmaz. Değiştirerek onay desteklenmez. Talepten sonra kabul kuralı bozulduysa yürütme reddedilir ve talep
 *     onay bekler durumda kalır. Eşzamanlı iki onay tek kalem üretir.
 */
const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('DUE-CREATE-APPROVAL DB gate blocked: CI requires an approved TEST_DATABASE_URL.');
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;
const PRODUCTION_VALIDATION_OPTIONS = { whitelist: true, forbidNonWhitelisted: true, transform: true } as const;
const AS_OF = '2026-01-10';

/**
 * "UYAP'a Aktar" XML'inin alacak kalemi eşlemesi Due SATIRINDAN okur (`mapDuesToAlacakKalemleri`); saf eşleme, veritabanı
 * kullanmaz. Due'nun türü / tutarı değişmeden UYAP `tur` ve tutarı değişmez.
 */
const uyapKalemi = (due: unknown): { tur: string; tutar: number } =>
  (new UyapCaseMapperService(undefined as never) as any).mapDuesToAlacakKalemleri([due])[0];

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

describeWithDisposableDb('Due ekleme iki kişi onayına tabidir — HTTP + gerçek onay (disposable PostgreSQL)', () => {
  jest.setTimeout(240_000);

  let prisma: PrismaClient;
  let app: INestApplication;
  let approvals: OfficeApprovalService;
  const tenantIds = new Set<string>();
  const officeIds = new Set<string>();

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

  const ASIL_ALACAK = { type: 'PRINCIPAL', amount: 1000, dueDate: '2025-01-15', interestType: 'YASAL', description: 'Sentetik asıl alacak' };

  async function fixture(label: string) {
    const suffix = randomUUID().slice(0, 8);
    const tenantId = `test-due-create-${label}-${suffix}`;
    tenantIds.add(tenantId);
    await prisma.tenant.create({ data: { id: tenantId, name: `Due ekleme ${label}`, slug: tenantId } });
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
        versionHash: `due-create-${suffix}`,
      },
    });
    const mkLawyer = async (key: string, role: 'USER' | 'ADMIN' | 'VIEWER', rank: 'LAWYER' | 'AUTHORIZED' | 'PARTNER') => {
      const user = await prisma.user.create({ data: { tenantId, email: `dc-${key}-${suffix}@example.test`, name: 'Sentetik', surname: key, role } });
      const lawyer = await prisma.lawyer.create({ data: { tenantId, officeId: office.id, userId: user.id, name: 'Sentetik', surname: key, lawyerRank: rank } });
      return { userId: user.id, lawyerId: lawyer.id };
    };
    const yetkili = await mkLawyer('Yetkili', 'USER', 'AUTHORIZED');
    const onayci = await mkLawyer('Onayci', 'ADMIN', 'PARTNER');
    const ikinciOnayci = await mkLawyer('IkinciOnayci', 'USER', 'PARTNER');
    const izinsiz = await mkLawyer('Izinsiz', 'USER', 'AUTHORIZED');
    const atanmamis = await mkLawyer('Atanmamis', 'USER', 'AUTHORIZED');
    const izleyici = await mkLawyer('Izleyici', 'VIEWER', 'LAWYER');
    const otherTenant = await prisma.tenant.create({ data: { name: `Due ekleme öteki ${label}`, slug: `test-due-create-oteki-${label}-${suffix}` } });
    tenantIds.add(otherTenant.id);
    const yabanci = await prisma.user.create({ data: { tenantId: otherTenant.id, email: `dc-yabanci-${suffix}@example.test`, name: 'Sentetik', surname: 'Yabanci', role: 'ADMIN' } });

    const legalCase = await prisma.case.create({
      data: { tenantId, fileNumber: `DC-${label}-${suffix}`, type: 'GENERAL_EXECUTION', currency: 'TRY', caseDate: new Date('2025-06-01T00:00:00.000Z') } as never,
    });
    await prisma.caseLawyer.create({ data: { caseId: legalCase.id, lawyerId: onayci.lawyerId, role: 'RESPONSIBLE', isResponsible: true } });
    await prisma.caseLawyer.create({ data: { caseId: legalCase.id, lawyerId: yetkili.lawyerId, role: 'ASSIGNED', casePermissions: { canEditFinance: true } } });
    await prisma.caseLawyer.create({ data: { caseId: legalCase.id, lawyerId: izinsiz.lawyerId, role: 'ASSIGNED', casePermissions: { canEditFinance: false } } });
    await prisma.caseLawyer.create({ data: { caseId: legalCase.id, lawyerId: izleyici.lawyerId, role: 'ASSIGNED', casePermissions: { canEditFinance: true } } });
    return {
      tenantId, caseId: legalCase.id, duesPath: `/cases/${legalCase.id}/dues`,
      yetkili, onayci, ikinciOnayci, izinsiz, atanmamis, izleyici, yabanciUserId: yabanci.id,
    };
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;

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

  const rows = async (f: Fixture) => ({
    dues: await prisma.due.findMany({ where: { caseId: f.caseId }, orderBy: { createdAt: 'asc' } }),
    claims: await prisma.claimItem.findMany({ where: { caseId: f.caseId }, orderBy: { createdAt: 'asc' } }),
    requests: await prisma.officeApprovalRequest.findMany({ where: { tenantId: f.tenantId }, orderBy: { createdAt: 'asc' } }),
  });

  /** Kabul edilen ekleme talebi (202 + approvalRequired) → talep kimliği. */
  async function requestId(res: request.Response): Promise<string> {
    if (res.status !== 202 || res.body?.approvalRequired !== true || res.body?.applied !== false) {
      throw new Error(`ekleme talebi beklenirdi: ${res.status} ${JSON.stringify(res.body)}`);
    }
    return res.body.approvalRequestId as string;
  }

  describe('A. Talep — hiçbir kayıt oluşmaz', () => {
    it('yetkili istek Due / kalem oluşturmaz; mevcut onaya talep açar; bakiye ve hesap özeti değişmez', async () => {
      const f = await fixture('talep');
      const before = await balanceView(f);

      const res = await post(f.duesPath, f.yetkili.userId, ASIL_ALACAK);
      const id = await requestId(res);
      expect(res.body.status).toBe(OfficeApprovalStatus.PENDING_APPROVAL);
      expect(res.body.message).toContain('onaya gönderildi');
      expect(res.body.id).toBeUndefined(); // Due kimliği yok: kalem oluşmadı

      const { dues, claims, requests } = await rows(f);
      expect([dues.length, claims.length, requests.length]).toEqual([0, 0, 1]);
      expect(requests[0]).toMatchObject({
        id,
        actionCode: 'CLAIM_ITEM_HIGH_IMPACT_CHANGE',
        targetType: 'CLAIM_ITEM_CASE',
        targetRef: f.caseId,
        requesterUserId: f.yetkili.userId,
        status: OfficeApprovalStatus.PENDING_APPROVAL,
        executionStatus: OfficeApprovalExecutionStatus.NOT_RUN,
      });
      expect(requests[0].savedIntent).toEqual({
        version: 'CASE_DUE_CHANGE_V1',
        operation: 'DUE_CREATE',
        caseId: f.caseId,
        // Para birimi talep anında dosyanınkiyle çözülür; istekte olmayan alan niyete girmez.
        due: { ...ASIL_ALACAK, currency: 'TRY' },
        reason: expect.stringContaining('iki kişi onayı'),
      });
      // Onaylanmamış kalem etkin borca girmez.
      expect(await balanceView(f)).toEqual(before);
    });

    it('aynı içerikli bekleyen talep ikinci kez açılmaz; farklı içerik ayrı talep açar', async () => {
      const f = await fixture('yinele');
      const first = await requestId(await post(f.duesPath, f.yetkili.userId, ASIL_ALACAK));
      const again = await requestId(await post(f.duesPath, f.yetkili.userId, { ...ASIL_ALACAK }));
      expect(again).toBe(first);
      const other = await requestId(await post(f.duesPath, f.yetkili.userId, { ...ASIL_ALACAK, amount: 1500 }));
      expect(other).not.toBe(first);
      const { dues, claims, requests } = await rows(f);
      expect([dues.length, claims.length, requests.length]).toEqual([0, 0, 2]);
    });

    it('geçersiz istek talep açamaz (tür, para birimi, Due ucundan "faiz işler")', async () => {
      const f = await fixture('gecersiz');
      const cases: Array<[Record<string, unknown>, number, string | undefined]> = [
        [{ type: 'OTHER', amount: 100, dueDate: '2025-02-02' }, 400, 'UNSUPPORTED_COMPONENT'],
        [{ ...ASIL_ALACAK, currency: 'USD' }, 400, 'CASE_CLAIM_CURRENCY_MISMATCH'],
        [{ ...ASIL_ALACAK, interestAccrualStatus: 'ACCRUES' }, 400, undefined],
      ];
      for (const [body, status, code] of cases) {
        const res = await post(f.duesPath, f.yetkili.userId, body);
        expect([res.status, code ? res.body.code : null]).toEqual([status, code ?? null]);
      }
      const { dues, claims, requests } = await rows(f);
      expect([dues.length, claims.length, requests.length]).toEqual([0, 0, 0]);
    });

    it('dosyada mali yazma yetkisi olmayan hesap talep açamaz', async () => {
      const f = await fixture('yetki');
      const denied: Array<[string, number, string | undefined]> = [
        [f.atanmamis.userId, 403, 'DUE_WRITE_FORBIDDEN'],
        [f.izinsiz.userId, 403, 'DUE_WRITE_FORBIDDEN'],
        [f.izleyici.userId, 403, 'VIEWER_WRITE_DENIED'],
        [f.yabanciUserId, 404, undefined],
      ];
      for (const [userId, status, code] of denied) {
        const res = await post(f.duesPath, userId, ASIL_ALACAK);
        expect([res.status, code ? res.body.code : null]).toEqual([status, code ?? null]);
      }
      const { dues, claims, requests } = await rows(f);
      expect([dues.length, claims.length, requests.length]).toEqual([0, 0, 0]);
    });
  });

  describe('B. Onay — kalem ikinci kişinin onayında oluşur', () => {
    it('talep eden kendi talebini onaylayamaz; başka yetkilinin onayında Due + bağlı kalem oluşur ve borca girer', async () => {
      const f = await fixture('onay');
      const before = await balanceView(f);
      const id = await requestId(await post(f.duesPath, f.yetkili.userId, ASIL_ALACAK));

      await expect(approvals.approve(id, f.yetkili.userId)).rejects.toBeDefined();
      expect((await rows(f)).dues).toHaveLength(0);
      expect(await balanceView(f)).toEqual(before);

      const decided = await approvals.approve(id, f.onayci.userId);
      expect([decided.status, decided.executionStatus]).toEqual([OfficeApprovalStatus.APPROVED, OfficeApprovalExecutionStatus.SUCCEEDED]);

      const { dues, claims } = await rows(f);
      expect([dues.length, claims.length]).toEqual([1, 1]);
      expect(dues[0]).toMatchObject({ type: 'PRINCIPAL', description: 'Sentetik asıl alacak', currency: 'TRY', sortOrder: 1 });
      expect(Number(dues[0].amount)).toBe(1000);
      expect(claims[0]).toMatchObject({ status: 'ACTIVE', itemType: 'PRINCIPAL', currency: 'TRY', interestAccrualStatus: 'UNKNOWN' });
      expect(Number(claims[0].amount)).toBe(1000);
      expect((claims[0].metadata as { dueSync?: { sourceDueId?: string } }).dueSync?.sourceDueId).toBe(dues[0].id);
      expect(await approvedDueIdOf(prisma, f.tenantId, id)).toBe(dues[0].id);

      // Köprü kaydında başlatan TALEP EDEN; yürütme kaydında onaylayan ve talep kimliği.
      const created = await prisma.auditLog.findMany({ where: { tenantId: f.tenantId, action: 'CLAIM_ITEM_SYSTEM_CREATED', entityId: claims[0].id } });
      expect(created.map((row) => row.userId)).toEqual([f.yetkili.userId]);
      const applied = await prisma.auditLog.findMany({ where: { tenantId: f.tenantId, action: 'CASE_DUE_CREATE_APPROVED_APPLIED' } });
      expect(applied).toHaveLength(1);
      expect(applied[0]).toMatchObject({ userId: f.onayci.userId, entityId: f.caseId });
      expect(applied[0].metadata).toMatchObject({ approvalRequestId: id, requesterUserId: f.yetkili.userId, dueId: dues[0].id, claimItemId: claims[0].id });

      // Onaydan sonra borca girer.
      const after = await balanceView(f);
      expect(after).not.toEqual(before);
      expect(Number(after.summary.asilAlacak)).toBe(1000);
    });

    it('kalem üretmeyen türde (nafaka) onay yalnız Due oluşturur', async () => {
      const f = await fixture('nafaka');
      const id = await requestId(await post(f.duesPath, f.yetkili.userId, { type: 'NAFAKA', amount: 300, dueDate: '2025-05-05', description: 'Sentetik nafaka taksiti' }));
      expect((await rows(f)).dues).toHaveLength(0);
      await approvals.approve(id, f.onayci.userId);
      const { dues, claims } = await rows(f);
      expect([dues.length, claims.length]).toEqual([1, 0]);
      expect(dues[0]).toMatchObject({ type: 'NAFAKA', description: 'Sentetik nafaka taksiti' });
    });

    it('ret ve iptal hiçbir kayıt oluşturmaz; sonuçlanan talepten sonra aynı kalem yeniden istenebilir', async () => {
      const f = await fixture('ret');
      const rejected = await requestId(await post(f.duesPath, f.yetkili.userId, ASIL_ALACAK));
      await approvals.reject(rejected, f.onayci.userId, 'Sentetik ret gerekçesi');
      const cancelled = await requestId(await post(f.duesPath, f.yetkili.userId, ASIL_ALACAK));
      expect(cancelled).not.toBe(rejected); // sonuçlanan talebin anahtarı boşaldı
      await approvals.cancel(cancelled, f.yetkili.userId);

      const { dues, claims, requests } = await rows(f);
      expect([dues.length, claims.length]).toEqual([0, 0]);
      expect(requests.map((row) => row.status)).toEqual([OfficeApprovalStatus.REJECTED, OfficeApprovalStatus.CANCELLED]);
      expect(requests.every((row) => row.executionStatus === OfficeApprovalExecutionStatus.NOT_RUN)).toBe(true);
    });

    it('değiştirerek onay desteklenmez; talep onay bekler durumda kalır', async () => {
      const f = await fixture('degistir');
      const id = await requestId(await post(f.duesPath, f.yetkili.userId, ASIL_ALACAK));
      await expect(
        approvals.approveWithChanges(id, f.onayci.userId, { version: 'CASE_DUE_CHANGE_V1', operation: 'DUE_CREATE', caseId: f.caseId, due: { ...ASIL_ALACAK, amount: 9, currency: 'TRY' } }),
      ).rejects.toThrow('değiştirilerek onaylanamaz');
      const { dues, requests } = await rows(f);
      expect(dues).toHaveLength(0);
      expect(requests[0].status).toBe(OfficeApprovalStatus.PENDING_APPROVAL);
    });

    it('talepten sonra kabul kuralı bozulduysa (dosya para birimi değişti) yürütme reddedilir; talep bekler, kayıt oluşmaz', async () => {
      const f = await fixture('bayat');
      const id = await requestId(await post(f.duesPath, f.yetkili.userId, ASIL_ALACAK));
      await prisma.case.update({ where: { id: f.caseId }, data: { currency: 'USD' } as never });

      await expect(approvals.approve(id, f.onayci.userId)).rejects.toMatchObject({ response: expect.objectContaining({ code: 'CASE_CLAIM_CURRENCY_MISMATCH' }) });
      const { dues, claims, requests } = await rows(f);
      expect([dues.length, claims.length]).toEqual([0, 0]);
      expect([requests[0].status, requests[0].executionStatus]).toEqual([OfficeApprovalStatus.PENDING_APPROVAL, OfficeApprovalExecutionStatus.NOT_RUN]);

      // Kural yeniden sağlanınca aynı talep onaylanabilir.
      await prisma.case.update({ where: { id: f.caseId }, data: { currency: 'TRY' } as never });
      await approvals.approve(id, f.onayci.userId);
      expect((await rows(f)).dues).toHaveLength(1);
    });

    it('eşzamanlı iki onay tek Due ve tek kalem üretir', async () => {
      const f = await fixture('esonay');
      const id = await requestId(await post(f.duesPath, f.yetkili.userId, ASIL_ALACAK));
      const results = await Promise.allSettled([approvals.approve(id, f.onayci.userId), approvals.approve(id, f.ikinciOnayci.userId)]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const { dues, claims, requests } = await rows(f);
      expect([dues.length, claims.length]).toEqual([1, 1]);
      expect([requests[0].status, requests[0].executionStatus]).toEqual([OfficeApprovalStatus.APPROVED, OfficeApprovalExecutionStatus.SUCCEEDED]);
    });

    it('iki ayrı talep sırayla onaylanınca sıra numaraları çakışmaz', async () => {
      const f = await fixture('sira');
      const first = await requestId(await post(f.duesPath, f.yetkili.userId, ASIL_ALACAK));
      const second = await requestId(await post(f.duesPath, f.yetkili.userId, { type: 'EXPENSE', amount: 50, dueDate: '2025-04-04', description: 'Sentetik masraf' }));
      await approvals.approve(second, f.onayci.userId);
      await approvals.approve(first, f.onayci.userId);
      const { dues, claims } = await rows(f);
      expect(dues.map((due) => [due.type, due.sortOrder])).toEqual([['EXPENSE', 1], ['PRINCIPAL', 2]]);
      expect(claims.map((claim) => claim.itemType).sort()).toEqual(['EXPENSE', 'PRINCIPAL']);
    });
  });

  /** Hazırlık: ekleme talebi → onaycının onayı → oluşan Due (üretimdeki yol). */
  async function addApproved(f: Fixture, due: Record<string, unknown>) {
    const id = await requestId(await post(f.duesPath, f.yetkili.userId, due));
    await approvals.approve(id, f.onayci.userId);
    const dueId = await approvedDueIdOf(prisma, f.tenantId, id);
    return { dueId, path: `${f.duesPath}/${dueId}` };
  }
  const dueRow = (id: string) => prisma.due.findUnique({ where: { id } });
  const res_message = (res: request.Response): string => String(res.body?.message ?? '');
  /** Onaya giden değişiklik / silme (202 + approvalRequired) → talep kimliği. */
  function changeRequestId(res: request.Response, fields?: string[]): string {
    if (res.status !== 202 || res.body?.approvalRequired !== true || res.body?.applied !== false) {
      throw new Error(`onay talebi beklenirdi: ${res.status} ${JSON.stringify(res.body)}`);
    }
    if (fields) expect(res.body.fields).toEqual(fields);
    return res.body.approvalRequestId as string;
  }

  describe('C. Kaleme ulaşmayan alt tür değişikliği — bağlı kalemli Due', () => {
    it('asıl alacak → kira: onaylanana kadar Due, hesap özeti ve UYAP eşlemesi değişmez; onayda yalnız Due değişir', async () => {
      const f = await fixture('alttur');
      const { dueId, path } = await addApproved(f, ASIL_ALACAK);
      const claimBefore = await prisma.claimItem.findFirstOrThrow({ where: { caseId: f.caseId } });
      const before = await balanceView(f);
      expect(Number(before.summary.asilAlacak)).toBe(1000);

      const res = await patch(path, f.yetkili.userId, { type: 'KIRA' });
      const id = changeRequestId(res, ['type']);
      expect(res.body.message).toContain('onaya gönderildi');
      const pending = await prisma.officeApprovalRequest.findUniqueOrThrow({ where: { id } });
      expect(pending).toMatchObject({ actionCode: 'CLAIM_ITEM_HIGH_IMPACT_CHANGE', targetType: 'CLAIM_ITEM_CASE', targetRef: f.caseId, status: OfficeApprovalStatus.PENDING_APPROVAL });
      expect(pending.savedIntent).toMatchObject({
        version: 'CASE_DUE_CHANGE_V1', operation: 'DUE_UPDATE', dueId, patch: { type: 'KIRA' }, effectiveFields: ['type'],
        before: expect.objectContaining({ type: 'PRINCIPAL', amount: '1000.00', currency: 'TRY' }),
      });
      // Onaylanmadan: hiçbir çıktı değişmez.
      expect((await dueRow(dueId))!.type).toBe('PRINCIPAL');
      expect(await balanceView(f)).toEqual(before);

      // Talep eden onaylayamaz; başka yetkili onaylar.
      await expect(approvals.approve(id, f.yetkili.userId)).rejects.toBeDefined();
      expect((await dueRow(dueId))!.type).toBe('PRINCIPAL');
      const decided = await approvals.approve(id, f.onayci.userId);
      expect([decided.status, decided.executionStatus]).toEqual([OfficeApprovalStatus.APPROVED, OfficeApprovalExecutionStatus.SUCCEEDED]);

      expect((await dueRow(dueId))!.type).toBe('KIRA');
      expect(await prisma.claimItem.findUniqueOrThrow({ where: { id: claimBefore.id } })).toEqual(claimBefore); // kaleme ulaşmaz
      // Etki: eski hesap özeti yalnız "asıl alacak" türündeki Due'ları sayar → değişir (bu yüzden onaya tabidir).
      expect(Number((await balanceView(f)).summary.asilAlacak)).not.toBe(1000);
      const applied = await prisma.auditLog.findMany({ where: { tenantId: f.tenantId, action: 'CASE_DUE_UPDATE_APPROVED_APPLIED' } });
      expect(applied).toHaveLength(1);
      expect(applied[0]).toMatchObject({ userId: f.onayci.userId });
      expect(applied[0].metadata).toMatchObject({ approvalRequestId: id, requesterUserId: f.yetkili.userId, dueId, fields: ['type'] });
    });

    it('asıl alacak → prim: UYAP alacak türü ancak onaydan sonra değişir', async () => {
      const f = await fixture('prim');
      const { dueId, path } = await addApproved(f, ASIL_ALACAK);
      expect(uyapKalemi(await dueRow(dueId))).toMatchObject({ tur: 'ASIL_ALACAK', tutar: 1000 });

      const id = changeRequestId(await patch(path, f.yetkili.userId, { type: 'PRIM' }), ['type']);
      expect(uyapKalemi(await dueRow(dueId)).tur).toBe('ASIL_ALACAK'); // talep UYAP çıktısını değiştirmez
      await approvals.approve(id, f.onayci.userId);
      expect(uyapKalemi(await dueRow(dueId)).tur).toBe('DIGER');
    });

    it('alt tür + açıklama birlikte: kısmi yazım yok; onayda ikisi birlikte uygulanır ve açıklama kaleme yansır', async () => {
      const f = await fixture('karma');
      const { dueId, path } = await addApproved(f, ASIL_ALACAK);
      const id = changeRequestId(await patch(path, f.yetkili.userId, { type: 'AIDAT', description: 'Sentetik aidat alacağı' }), ['type']);
      const untouched = await dueRow(dueId);
      expect([untouched!.type, untouched!.description]).toEqual(['PRINCIPAL', 'Sentetik asıl alacak']);

      await approvals.approve(id, f.onayci.userId);
      const [due, claim] = [await dueRow(dueId), await prisma.claimItem.findFirstOrThrow({ where: { caseId: f.caseId } })];
      expect([due!.type, due!.description, claim.itemType, claim.description]).toEqual(['AIDAT', 'Sentetik aidat alacağı', 'PRINCIPAL', 'Sentetik aidat alacağı']);
    });

    it('bekleyen talep varken farklı içerik reddedilir, aynı içerik aynı talebi döner; ret ve iptal Due\'yu değiştirmez', async () => {
      const f = await fixture('bekleyen');
      const { dueId, path } = await addApproved(f, ASIL_ALACAK);
      const first = changeRequestId(await patch(path, f.yetkili.userId, { type: 'KIRA' }));
      expect(changeRequestId(await patch(path, f.yetkili.userId, { type: 'KIRA' }))).toBe(first);
      const conflict = await patch(path, f.yetkili.userId, { type: 'AIDAT' });
      expect([conflict.status, conflict.body.code]).toEqual([409, 'DUE_CHANGE_PENDING_CONFLICT']);
      // Açıklayıcı alan bekleyen talebi etkilemez ve doğrudan yazılır.
      expect((await patch(path, f.yetkili.userId, { isPrimary: true })).status).toBe(200);

      await approvals.reject(first, f.onayci.userId, 'Sentetik ret gerekçesi');
      expect((await dueRow(dueId))!.type).toBe('PRINCIPAL');
      const second = changeRequestId(await patch(path, f.yetkili.userId, { type: 'AIDAT' }));
      expect(second).not.toBe(first);
      await approvals.cancel(second, f.yetkili.userId);
      expect((await dueRow(dueId))!.type).toBe('PRINCIPAL');
    });

    it('talepten sonra Due değiştiyse onay uygulanmaz (talep bekler); kalem türünü değiştiren tür yine kalem ekranına yönlenir', async () => {
      const f = await fixture('bayatguncelleme');
      const { dueId, path } = await addApproved(f, ASIL_ALACAK);
      const claim = await prisma.claimItem.findFirstOrThrow({ where: { caseId: f.caseId } });
      const id = changeRequestId(await patch(path, f.yetkili.userId, { type: 'KIRA' }));

      // Kalem ekranından onaylı tutar değişikliği, ardından Due'nun onaylı değere yakınsaması (onaysız kabul edilir).
      const amountRequest = await put(`/claim-items/${claim.id}`, f.yetkili.userId, { amount: 1200 });
      await approvals.approve(amountRequest.body.data.approvalRequestId, f.onayci.userId);
      expect((await patch(path, f.yetkili.userId, { amount: 1200 })).status).toBe(200);

      await expect(approvals.approve(id, f.onayci.userId)).rejects.toMatchObject({ response: expect.objectContaining({ code: 'DUE_CHANGE_STALE' }) });
      const [due, requestRow] = [await dueRow(dueId), await prisma.officeApprovalRequest.findUniqueOrThrow({ where: { id } })];
      expect([due!.type, Number(due!.amount)]).toEqual(['PRINCIPAL', 1200]);
      expect([requestRow.status, requestRow.executionStatus]).toEqual([OfficeApprovalStatus.PENDING_APPROVAL, OfficeApprovalExecutionStatus.NOT_RUN]);

      // Kalem türünü değiştiren tür (asıl alacak → masraf) onay talebi AÇMAZ: mevcut 409 + kalem ekranı yönlendirmesi.
      const reaching = await patch(path, f.yetkili.userId, { type: 'EXPENSE' });
      expect([reaching.status, reaching.body.code]).toEqual([409, 'DUE_CHANGE_REQUIRES_CLAIM_ITEM_APPROVAL']);
    });
  });

  describe('D. Bağlı kalemi olmayan Due (nafaka) — değişiklik ve silme', () => {
    const NAFAKA = { type: 'NAFAKA', amount: 300, dueDate: '2025-05-05', description: 'Sentetik nafaka taksiti' };

    it('tutar / vade değişikliği onaya talep olur; UYAP tutarı ancak onaydan sonra değişir; açıklayıcı alanlar doğrudan yazılır', async () => {
      const f = await fixture('nafakaguncelle');
      const { dueId, path } = await addApproved(f, NAFAKA);
      expect(uyapKalemi(await dueRow(dueId))).toMatchObject({ tur: 'ASIL_ALACAK', tutar: 300 });

      const id = changeRequestId(await patch(path, f.yetkili.userId, { amount: 350, dueDate: '2025-06-05' }), ['amount', 'dueDate']);
      expect(uyapKalemi(await dueRow(dueId)).tutar).toBe(300);

      // Açıklayıcı alanlar onaya bağlı değildir.
      const direct = await patch(path, f.yetkili.userId, { description: 'Sentetik nafaka (düzeltildi)', isPrimary: true, hasKdv: false, sourceDocumentNo: 'SENTETIK-BELGE' });
      expect(direct.status).toBe(200);
      expect(await dueRow(dueId)).toMatchObject({ description: 'Sentetik nafaka (düzeltildi)', isPrimary: true, sourceDocumentNo: 'SENTETIK-BELGE' });

      await approvals.approve(id, f.onayci.userId);
      const due = await dueRow(dueId);
      expect([Number(due!.amount), due!.dueDate.toISOString().slice(0, 10), due!.description]).toEqual([350, '2025-06-05', 'Sentetik nafaka (düzeltildi)']);
      expect(uyapKalemi(due).tutar).toBe(350);
      expect(await prisma.claimItem.count({ where: { caseId: f.caseId } })).toBe(0);
    });

    it('silme onaya talep olur; onaylanana kadar Due yerinde kalır; talepten sonra Due değiştiyse silme uygulanmaz', async () => {
      const f = await fixture('nafakasil');
      const kept = await addApproved(f, NAFAKA);
      const removed = await addApproved(f, { ...NAFAKA, amount: 400, description: 'Sentetik nafaka taksiti 2' });

      const id = changeRequestId(await del(removed.path, f.yetkili.userId));
      expect(res_message(await del(removed.path, f.yetkili.userId))).toContain('onaya gönderildi'); // aynı talep
      expect(await dueRow(removed.dueId)).not.toBeNull();
      await approvals.approve(id, f.onayci.userId);
      expect(await dueRow(removed.dueId)).toBeNull();
      const applied = await prisma.auditLog.findMany({ where: { tenantId: f.tenantId, action: 'CASE_DUE_DELETE_APPROVED_APPLIED' } });
      expect(applied.map((row) => [row.userId, (row.metadata as { dueId?: string }).dueId])).toEqual([[f.onayci.userId, removed.dueId]]);

      // Bayat silme talebi: talepten sonra tutar onayla değişti → silme uygulanmaz, Due yerinde.
      const staleDelete = changeRequestId(await del(kept.path, f.yetkili.userId));
      const amount = changeRequestId(await patch(kept.path, f.yetkili.userId, { amount: 325 }), ['amount']);
      await approvals.approve(amount, f.onayci.userId);
      await expect(approvals.approve(staleDelete, f.onayci.userId)).rejects.toMatchObject({ response: expect.objectContaining({ code: 'DUE_CHANGE_STALE' }) });
      expect(Number((await dueRow(kept.dueId))!.amount)).toBe(325);
    });

    it('yetkisiz hesap talep açamaz; hiçbir kayıt değişmez', async () => {
      const f = await fixture('nafakayetki');
      const { dueId, path } = await addApproved(f, NAFAKA);
      const requestsBefore = await prisma.officeApprovalRequest.count({ where: { tenantId: f.tenantId } });
      for (const [userId, status] of [[f.izinsiz.userId, 403], [f.atanmamis.userId, 403], [f.izleyici.userId, 403], [f.yabanciUserId, 404]] as Array<[string, number]>) {
        expect((await patch(path, userId, { amount: 999 })).status).toBe(status);
        expect((await del(path, userId)).status).toBe(status);
      }
      expect(await prisma.officeApprovalRequest.count({ where: { tenantId: f.tenantId } })).toBe(requestsBefore);
      expect(Number((await dueRow(dueId))!.amount)).toBe(300);
    });
  });
});
