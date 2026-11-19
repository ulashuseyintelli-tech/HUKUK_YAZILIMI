jest.mock('pdf-poppler', () => ({ convert: async () => { throw new Error('pdf-poppler is stubbed in this spec'); } }));

import { CanActivate, ExecutionContext, INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { OfficeApprovalExecutionStatus, OfficeApprovalStatus, PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import * as request from 'supertest';
import { createApprovedDue } from '../../../../test/due-create-approval-fixture';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { StorageModule } from '../../../common/storage/storage.module';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CaseModule } from '../../case/case.module';
import { ErrorLogModule } from '../../error-log/error-log.module';
import { MetricsRegistryModule } from '../../metrics-registry/metrics-registry.module';
import { OfficeApprovalService } from '../../office-approval/office-approval.service';
import { ClaimItemModule } from '../claim-item.module';

/**
 * Kalem değişikliği onayında dosya–kalem para birimi uyumu — owner E4 kararı 19.11.2026.
 * GERÇEK HTTP (kalem ucu + Onay Kutusu karar ucu) + gerçek iki kişi onayı + disposable PostgreSQL. Değerler SENTETİK.
 *
 * Kanıtlanan:
 *  1. Aynı para biriminde talep ikinci kişinin onayıyla uygulanır.
 *  2. Dosyadan farklı para birimi talep anında reddedilir (400); talep açılmaz, kalem değişmez.
 *  3. Geçmiş kayıtta dosyadan ayrışmış kalem: başka alan değişikliği reddedilir; kalemi dosyanın para birimine döndüren
 *     talep kabul edilip uygulanır (mevcut kurtarma yolu).
 *  4. Talep açıldıktan sonra DOSYANIN para birimi değişirse yürütme atomik reddedilir (409; neden + kurtarma yolu):
 *     tutar, faiz, kalem ve onay durumu kısmen uygulanmaz; talep reddedilerek kapatılabilir.
 *  5. Talep açıldıktan sonra KALEMİN para birimi değişirse yürütme atomik reddedilir (409 bayat talep; neden + yol).
 *  6. Eşzamanlılık: (a) aynı talebin eşzamanlı iki onayından yalnız biri uygulanır; (b) dosya kilidini tutan başka bir
 *     yazar kalemin para birimini değiştirirken gelen onay, yazar bitince güncel durumu görür ve atomik reddedilir.
 */
const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('CLAIM-ITEM-APPROVAL-CURRENCY DB gate blocked: CI requires an approved TEST_DATABASE_URL.');
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;
const PRODUCTION_VALIDATION_OPTIONS = { whitelist: true, forbidNonWhitelisted: true, transform: true } as const;

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

describeWithDisposableDb('Kalem değişikliği onayında dosya–kalem para birimi uyumu — HTTP + gerçek onay (disposable PostgreSQL)', () => {
  jest.setTimeout(300_000);

  let prisma: PrismaClient;
  let app: INestApplication;
  let approvals: OfficeApprovalService;
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

  const ASIL_ALACAK = { type: 'PRINCIPAL', amount: 30000, dueDate: '2025-07-01', interestType: 'YASAL', description: 'Sentetik asıl alacak' };

  async function fixture(label: string) {
    const suffix = randomUUID().slice(0, 8);
    const tenantId = `test-ci-cur-${label}-${suffix}`;
    tenantIds.add(tenantId);
    await prisma.tenant.create({ data: { id: tenantId, name: `Kalem para birimi ${label}`, slug: tenantId } });
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
        versionHash: `ci-cur-${suffix}`,
      },
    });
    const mkLawyer = async (key: string, role: 'USER' | 'ADMIN', rank: 'AUTHORIZED' | 'PARTNER') => {
      const user = await prisma.user.create({ data: { tenantId, email: `cc-${key}-${suffix}@example.test`, name: 'Sentetik', surname: key, role } });
      const lawyer = await prisma.lawyer.create({ data: { tenantId, officeId: office.id, userId: user.id, name: 'Sentetik', surname: key, lawyerRank: rank } });
      return { userId: user.id, lawyerId: lawyer.id };
    };
    const yetkili = await mkLawyer('Yetkili', 'USER', 'AUTHORIZED');
    const onayci = await mkLawyer('Onayci', 'ADMIN', 'PARTNER');
    const client = await prisma.client.create({ data: { tenantId, type: 'COMPANY', companyName: 'Sentetik müvekkil', displayName: 'Sentetik müvekkil' } as never });
    const debtor = await prisma.debtor.create({ data: { tenantId, type: 'COMPANY', name: 'Sentetik borçlu' } as never });
    const legalCase = await prisma.case.create({
      data: {
        tenantId, fileNumber: `CC-${label}-${suffix}`, type: 'GENERAL_EXECUTION', currency: 'TRY',
        caseDate: new Date('2025-06-01T00:00:00.000Z'), clientId: client.id,
      } as never,
    });
    await prisma.caseClient.create({ data: { caseId: legalCase.id, clientId: client.id } });
    await prisma.caseDebtor.create({ data: { caseId: legalCase.id, debtorId: debtor.id } });
    await prisma.caseLawyer.create({ data: { caseId: legalCase.id, lawyerId: onayci.lawyerId, role: 'RESPONSIBLE', isResponsible: true } });
    await prisma.caseLawyer.create({ data: { caseId: legalCase.id, lawyerId: yetkili.lawyerId, role: 'ASSIGNED', casePermissions: { canEditFinance: true } } });

    // Due + bağlı kanonik kalem GERÇEK yoldan: ekleme talebi → başka hesabın onayı → köprü.
    const asil = await createApprovedDue({
      db: prisma, approvals, post: (path, body) => post(path, yetkili.userId, body),
      caseId: legalCase.id, due: ASIL_ALACAK, requesterUserId: yetkili.userId, approverUserId: onayci.userId,
    });
    const claim = (await prisma.claimItem.findMany({ where: { caseId: legalCase.id } }))
      .find((row) => (row.metadata as any)?.dueSync?.sourceDueId === asil.dueId);
    if (!claim) throw new Error('düzenek: bağlı kalem oluşmadı');
    return { tenantId, caseId: legalCase.id, yetkili, onayci, claimItemId: claim.id };
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;

  /** Kısmi uygulama denetimi için kalemin mali / faiz alanları ve sürümü. */
  const itemState = async (f: Fixture) => {
    const row = await prisma.claimItem.findUniqueOrThrow({ where: { id: f.claimItemId } });
    return {
      amount: Number(row.amount), demandedAmount: Number(row.demandedAmount), currency: row.currency, status: row.status,
      interestType: row.interestType, interestStartDate: row.interestStartDate?.toISOString() ?? null,
      interestAccrualStatus: row.interestAccrualStatus, updatedAt: row.updatedAt.toISOString(),
    };
  };
  const requestRow = (id: string) => prisma.officeApprovalRequest.findUniqueOrThrow({ where: { id } });
  const appliedAudits = (f: Fixture) =>
    prisma.auditLog.count({ where: { tenantId: f.tenantId, action: 'CLAIM_ITEM_HIGH_IMPACT_UPDATE_APPLIED' } });

  /** Kalem ucundan değişiklik talebi (yetkili) → talep kimliği. */
  async function openChange(f: Fixture, body: Record<string, unknown>): Promise<string> {
    const res = await put(`/claim-items/${f.claimItemId}`, f.yetkili.userId, body);
    if (res.status !== 200 || res.body?.data?.approvalRequired !== true) {
      throw new Error(`onay talebi beklenirdi: ${res.status} ${JSON.stringify(res.body).slice(0, 300)}`);
    }
    return res.body.data.approvalRequestId as string;
  }
  const approveHttp = (f: Fixture, id: string) => post(`/office-approvals/${id}/approve`, f.onayci.userId, {});

  /** Atomik ret: talep bekliyor, yürütülmedi, karar izi yok; kalem ve uygulama denetimi aynen. */
  async function expectNothingApplied(f: Fixture, id: string, before: Awaited<ReturnType<typeof itemState>>, auditsBefore: number) {
    const req = await requestRow(id);
    expect([req.status, req.executionStatus, req.approverUserId, req.decidedAt]).toEqual([
      OfficeApprovalStatus.PENDING_APPROVAL, OfficeApprovalExecutionStatus.NOT_RUN, null, null,
    ]);
    expect(await itemState(f)).toEqual(before);
    expect(await appliedAudits(f)).toBe(auditsBefore);
  }

  it('1. aynı para biriminde talep ikinci kişinin onayıyla uygulanır', async () => {
    const f = await fixture('ayni');
    const id = await openChange(f, { amount: 41000, currency: 'TRY' });
    const res = await approveHttp(f, id);
    expect([200, 201]).toContain(res.status);
    expect(await itemState(f)).toMatchObject({ amount: 41000, demandedAmount: 41000, currency: 'TRY' });
    const req = await requestRow(id);
    expect([req.status, req.executionStatus]).toEqual([OfficeApprovalStatus.APPROVED, OfficeApprovalExecutionStatus.SUCCEEDED]);
  });

  it('2. dosyadan farklı para birimi talep anında reddedilir; talep açılmaz, kalem değişmez', async () => {
    const f = await fixture('farkli');
    const before = await itemState(f);
    const requestsBefore = await prisma.officeApprovalRequest.count({ where: { tenantId: f.tenantId } });
    const res = await put(`/claim-items/${f.claimItemId}`, f.yetkili.userId, { currency: 'USD' });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: 'CASE_CLAIM_CURRENCY_MISMATCH', message: expect.stringContaining('dosya para birimiyle aynı olmalıdır') });
    expect(await prisma.officeApprovalRequest.count({ where: { tenantId: f.tenantId } })).toBe(requestsBefore);
    expect(await itemState(f)).toEqual(before);
  });

  it('3. geçmiş kayıtta ayrışmış kalem: başka alan değişikliği reddedilir, dosyanın para birimine döndüren talep uygulanır', async () => {
    const f = await fixture('gecmis');
    // Geçmiş kayıt durumunun kurulumu (bugünkü yazım yolları engeller): kalem USD, dosya TRY.
    await prisma.claimItem.update({ where: { id: f.claimItemId }, data: { currency: 'USD' } });
    const rejected = await put(`/claim-items/${f.claimItemId}`, f.yetkili.userId, { amount: 50000 });
    expect([rejected.status, rejected.body?.code]).toEqual([400, 'CASE_CLAIM_CURRENCY_MISMATCH']);

    const id = await openChange(f, { amount: 50000, currency: 'TRY' });
    const res = await approveHttp(f, id);
    expect([200, 201]).toContain(res.status);
    expect(await itemState(f)).toMatchObject({ amount: 50000, currency: 'TRY' });
  });

  it('4. talep açıldıktan sonra dosyanın para birimi değişirse yürütme atomik reddedilir; talep reddedilerek kapatılabilir', async () => {
    const f = await fixture('dosya');
    const id = await openChange(f, {
      amount: 42000, interestAccrualStatus: 'ACCRUES', interestStartDate: '2025-08-01', interestStartDateProvenance: 'DEFAULT_NOTICE_DATE',
    });
    // Dosya para biriminin talepten sonra değişmesi (ürün yolu yok; doğrudan kayıt).
    await prisma.case.update({ where: { id: f.caseId }, data: { currency: 'USD' } as never });
    const before = await itemState(f);
    const auditsBefore = await appliedAudits(f);

    const res = await approveHttp(f, id);
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'CASE_CLAIM_CURRENCY_MISMATCH', caseCurrency: 'USD', claimItemCurrency: 'TRY' });
    expect(res.body.message).toEqual(expect.stringContaining('alacak kaleminin para birimi (TRY) dosyanın para birimiyle (USD) aynı değil'));
    expect(res.body.message).toEqual(expect.stringContaining('Hiçbir değişiklik uygulanmadı'));
    expect(res.body.message).toEqual(expect.stringContaining('Talebi reddedip kalemi dosyanın para biriminde yeniden talep edin'));
    await expectNothingApplied(f, id, before, auditsBefore);

    // Mevcut kurtarma yolu: talep reddedilir (kalem yine değişmez).
    const reject = await post(`/office-approvals/${id}/reject`, f.onayci.userId, { note: 'Para birimi uyuşmuyor; yeniden talep edilecek.' });
    expect([200, 201]).toContain(reject.status);
    expect((await requestRow(id)).status).toBe(OfficeApprovalStatus.REJECTED);
    expect(await itemState(f)).toEqual(before);
  });

  it('5. talep açıldıktan sonra kalemin para birimi değişirse yürütme atomik reddedilir (bayat talep; neden + yol)', async () => {
    const f = await fixture('kalem');
    const id = await openChange(f, { amount: 43000 });
    // Kalem para biriminin talepten sonra değişmesi (geçmiş kayıt / başka yazar; doğrudan kayıt).
    await prisma.claimItem.update({ where: { id: f.claimItemId }, data: { currency: 'USD' } });
    const before = await itemState(f);
    const auditsBefore = await appliedAudits(f);

    const res = await approveHttp(f, id);
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'CLAIM_ITEM_APPROVAL_STALE', changedFields: expect.arrayContaining(['currency']) });
    expect(res.body.message).toEqual(expect.stringContaining('talep açıldıktan sonra kalem değişti'));
    expect(res.body.message).toEqual(expect.stringContaining('Hiçbir değişiklik uygulanmadı'));
    expect(res.body.message).toEqual(expect.stringContaining('yeniden talep açın'));
    await expectNothingApplied(f, id, before, auditsBefore);
  });

  it('6a. aynı talebin eşzamanlı iki onayından yalnız biri uygulanır; öteki kısmen uygulanmaz', async () => {
    const f = await fixture('cift');
    const id = await openChange(f, { amount: 44000 });
    const auditsBefore = await appliedAudits(f);
    const results = await Promise.all([approveHttp(f, id), approveHttp(f, id)]);
    const statuses = results.map((res) => res.status).sort();
    expect(statuses.filter((status) => status === 200 || status === 201)).toHaveLength(1);
    expect(statuses.filter((status) => status === 409)).toHaveLength(1);
    expect(await itemState(f)).toMatchObject({ amount: 44000, currency: 'TRY' });
    expect(await appliedAudits(f)).toBe(auditsBefore + 1);
    const req = await requestRow(id);
    expect([req.status, req.executionStatus]).toEqual([OfficeApprovalStatus.APPROVED, OfficeApprovalExecutionStatus.SUCCEEDED]);
  });

  it('6b. dosya kilidini tutan yazar kalemin para birimini değiştirirken gelen onay güncel durumu görür ve atomik reddedilir', async () => {
    const f = await fixture('kilit');
    const id = await openChange(f, { amount: 45000 });
    const auditsBefore = await appliedAudits(f);

    let lockHeld!: () => void;
    const held = new Promise<void>((resolve) => { lockHeld = resolve; });
    let release!: () => void;
    const released = new Promise<void>((resolve) => { release = resolve; });
    // Başka yazar: onay yürütmeleriyle AYNI dosya kilidi (lockClaimItemCaseBeforeWrite), kilit altında para birimi değişir.
    const writer = prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${f.caseId}, 0))`;
      await tx.claimItem.update({ where: { id: f.claimItemId }, data: { currency: 'USD' } });
      lockHeld();
      await released;
    }, { timeout: 60_000 });
    await held;
    const approval = approveHttp(f, id);
    // Onay kilitte bekler; yazar bırakır.
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    release();
    await writer;
    const res = await approval;

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'CLAIM_ITEM_APPROVAL_STALE', changedFields: expect.arrayContaining(['currency']) });
    const after = await itemState(f);
    expect([after.amount, after.currency]).toEqual([30000, 'USD']); // yazarın değişikliği kaldı; onayın tutarı yazılmadı
    expect(await appliedAudits(f)).toBe(auditsBefore);
    const req = await requestRow(id);
    expect([req.status, req.executionStatus, req.decidedAt]).toEqual([OfficeApprovalStatus.PENDING_APPROVAL, OfficeApprovalExecutionStatus.NOT_RUN, null]);
  });
});
