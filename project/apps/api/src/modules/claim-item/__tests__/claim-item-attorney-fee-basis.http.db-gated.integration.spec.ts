import { CanActivate, ExecutionContext, INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { OfficeApprovalExecutionStatus, OfficeApprovalStatus, PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import * as request from 'supertest';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { OfficeApprovalService } from '../../office-approval/office-approval.service';
import { ATTORNEY_FEE_BASIS_ITEM_TYPE_MISMATCH } from '../attorney-fee-basis';
import { ClaimItemModule } from '../claim-item.module';
import { ClaimItemWriterRouterService } from '../claim-item-writer-router.service';

/**
 * Vekâlet ücretinin hukuki kaynağı (owner K1, 13.11.2026 GO-COMPLETE "İlam kalemleri için yapısal ayrım ve faiz hesabını uygula").
 * GERÇEK HTTP (PUT /claim-items/:id) + yazma kapısı + K4 onay + onay senkronu + disposable PostgreSQL (yeni migration uygulanmış).
 *
 * Kanıtlanan:
 *  1. Alan yüksek etkilidir: kullanıcı yaması onaya gider, onaydan önce kalem DEĞİŞMEZ, onayla yazılır; açık null "bilinmiyor"a döner.
 *  2. Yalnız ATTORNEY_FEE: başka türde 400 (talep oluşmaz); tür değişip kaynak kalırsa 400; DB CHECK kısıtı da reddeder.
 *  3. Bilinmeyen değer 400 (üretim ValidationPipe); kiracı / nesne yetkisi kuralları aynen.
 *  4. Eski kayıt: NULL kalır; açıklama "İLAM VEKALET ÜCRETİ" olsa da çıkarım yok; ilgisiz güncelleme alanı doldurmaz.
 * Tutarlar SENTETİK.
 */
const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('CLAIM-ITEM-ATTORNEY-FEE-BASIS DB gate blocked: CI requires an approved TEST_DATABASE_URL.');
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;

const PRODUCTION_VALIDATION_OPTIONS = { whitelist: true, forbidNonWhitelisted: true, transform: true } as const;

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

describeWithDisposableDb('ClaimItem attorneyFeeBasis — HTTP + kapı + K4 onay + DB kısıtı (disposable PostgreSQL)', () => {
  jest.setTimeout(60_000);

  let prisma: PrismaClient;
  let app: INestApplication;
  let approvals: OfficeApprovalService;
  let gateSpy: jest.SpyInstance;
  const tenantIds = new Set<string>();

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await prisma.$connect();
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), ClaimItemModule],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(new DbUserIdentityGuard(() => prisma))
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe(PRODUCTION_VALIDATION_OPTIONS));
    await app.init();
    approvals = app.get(OfficeApprovalService);
    gateSpy = jest.spyOn(app.get(ClaimItemWriterRouterService), 'evaluateHuman');
  });

  beforeEach(() => gateSpy.mockClear());

  afterAll(async () => {
    await app?.close();
    for (const tenantId of tenantIds) {
      await prisma.auditLog.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await prisma.tenant.deleteMany({ where: { id: tenantId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  type Fixture = Awaited<ReturnType<typeof fixture>>;

  async function fixture(label: string, itemSeed: Record<string, unknown> = {}) {
    const suffix = randomUUID().slice(0, 8);
    const tenantId = `test-ci-afb-${label}-${suffix}`;
    tenantIds.add(tenantId);
    await prisma.tenant.create({ data: { id: tenantId, name: `CI AFB ${label}`, slug: tenantId } });
    const office = await prisma.office.create({ data: { tenantId, name: `CI AFB office ${label}` } });
    const requesterUser = await prisma.user.create({
      data: { tenantId, email: `afb-req-${suffix}@example.test`, name: 'Req', surname: 'Lawyer', role: 'USER' },
    });
    const requesterLawyer = await prisma.lawyer.create({
      data: { tenantId, officeId: office.id, userId: requesterUser.id, name: 'Req', surname: 'Lawyer', lawyerRank: 'LAWYER' },
    });
    const approverUser = await prisma.user.create({
      data: { tenantId, email: `afb-appr-${suffix}@example.test`, name: 'Appr', surname: 'Partner', role: 'ADMIN' },
    });
    await prisma.lawyer.create({
      data: { tenantId, officeId: office.id, userId: approverUser.id, name: 'Appr', surname: 'Partner', lawyerRank: 'PARTNER' },
    });
    const legalCase = await prisma.case.create({
      data: { tenantId, fileNumber: `CI-AFB-${label}-${suffix}`, type: 'GENERAL_EXECUTION' },
    });
    await prisma.caseLawyer.create({
      data: { caseId: legalCase.id, lawyerId: requesterLawyer.id, casePermissions: { canEditFinance: true } },
    });
    // Due köprüsünün ürettiği biçim: ilam vekâlet ücreti açıklamalı, kaynak alanı BOŞ (eski kayıt gibi).
    const item = await prisma.claimItem.create({
      data: {
        tenantId,
        caseId: legalCase.id,
        itemType: 'ATTORNEY_FEE',
        originalAmount: 4321.1,
        demandedAmount: 4321.1,
        amount: 4321.1,
        currency: 'TRY',
        description: 'İLAM VEKALET ÜCRETİ',
        interestAccrualStatus: 'UNKNOWN',
        liableDebtorIds: [],
        ...itemSeed,
      },
    });
    return { tenantId, caseId: legalCase.id, claimItemId: item.id, requesterUserId: requesterUser.id, approverUserId: approverUser.id };
  }

  const put = (f: Fixture, body: Record<string, unknown>, userId = f.requesterUserId, id = f.claimItemId) =>
    request(app.getHttpServer()).put(`/claim-items/${id}`).set('x-test-user-id', userId).send(body);
  const row = (id: string) => prisma.claimItem.findUniqueOrThrow({ where: { id } });
  const requests = (tenantId: string) => prisma.officeApprovalRequest.count({ where: { tenantId } });

  async function requestAndApprove(f: Fixture, body: Record<string, unknown>) {
    const before = await row(f.claimItemId);
    const res = await put(f, body);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(expect.objectContaining({ applied: false, approvalRequired: true }));
    const approvalRequest = await prisma.officeApprovalRequest.findUniqueOrThrow({ where: { id: res.body.data.approvalRequestId } });
    const savedIntent = approvalRequest.savedIntent as any;
    expect(savedIntent.proposedPatch).toEqual(body);
    expect(gateSpy.mock.calls[0][0].payload).toEqual(body);
    // K4 dört göz: onaydan önce kalem DEĞİŞMEZ
    const pending = await row(f.claimItemId);
    expect(pending.attorneyFeeBasis).toBe(before.attorneyFeeBasis);
    expect(pending.updatedAt.toISOString()).toBe(before.updatedAt.toISOString());

    await approvals.approve(approvalRequest.id, f.approverUserId);
    const executed = await prisma.officeApprovalRequest.findUniqueOrThrow({ where: { id: approvalRequest.id } });
    expect(executed.status).toBe(OfficeApprovalStatus.APPROVED);
    expect(executed.executionStatus).toBe(OfficeApprovalExecutionStatus.SUCCEEDED);
    return { savedIntent, after: await row(f.claimItemId) };
  }

  it('eski kayıt NULL kalır: açıklama "İLAM VEKALET ÜCRETİ" olsa da çıkarım yok; ilgisiz (düşük etkili) güncelleme alanı doldurmaz', async () => {
    const f = await fixture('legacy');
    expect((await row(f.claimItemId)).attorneyFeeBasis).toBeNull();
    const res = await put(f, { referenceNo: 'SENTETIK-1' });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(expect.objectContaining({ applied: true, approvalRequired: false }));
    const after = await row(f.claimItemId);
    expect(after.referenceNo).toBe('SENTETIK-1');
    expect(after.attorneyFeeBasis).toBeNull();
    expect(await requests(f.tenantId)).toBe(0);
  });

  it('başarı: JUDGMENT_AWARDED yüksek etkili yama → onaya gider, onaydan sonra yazılır; anlık görüntü alanı taşır', async () => {
    const f = await fixture('ilam');
    const { savedIntent, after } = await requestAndApprove(f, { attorneyFeeBasis: 'JUDGMENT_AWARDED' });
    expect(savedIntent.currentSnapshot).toEqual(expect.objectContaining({ attorneyFeeBasis: null, itemType: 'ATTORNEY_FEE' }));
    expect(after.attorneyFeeBasis).toBe('JUDGMENT_AWARDED');
    // Tutar / tür / faiz durumu değişmez
    expect(after.itemType).toBe('ATTORNEY_FEE');
    expect(Number(after.amount)).toBe(4321.1);
    expect(after.interestAccrualStatus).toBe('UNKNOWN');
    const applied = await prisma.auditLog.count({
      where: { tenantId: f.tenantId, entityId: f.claimItemId, action: 'CLAIM_ITEM_HIGH_IMPACT_UPDATE_APPLIED' },
    });
    expect(applied).toBe(1);
  });

  it('başarı: açık null → "bilinmiyor"a dönüş de onaydan geçer; ENFORCEMENT_TARIFF da yazılabilir', async () => {
    const f = await fixture('null', { attorneyFeeBasis: 'JUDGMENT_AWARDED' });
    expect((await requestAndApprove(f, { attorneyFeeBasis: null })).after.attorneyFeeBasis).toBeNull();
    gateSpy.mockClear();
    expect((await requestAndApprove(f, { attorneyFeeBasis: 'ENFORCEMENT_TARIFF' })).after.attorneyFeeBasis).toBe('ENFORCEMENT_TARIFF');
  });

  it('ret: vekâlet ücreti dışı kalemde (YARGILAMA_GIDERI) 400 ATTORNEY_FEE_BASIS_ITEM_TYPE_MISMATCH; talep oluşmaz, kalem değişmez', async () => {
    const f = await fixture('yg', { itemType: 'YARGILAMA_GIDERI', description: 'Sentetik yargılama gideri' });
    const before = await row(f.claimItemId);
    const res = await put(f, { attorneyFeeBasis: 'JUDGMENT_AWARDED' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual(expect.objectContaining({ code: ATTORNEY_FEE_BASIS_ITEM_TYPE_MISMATCH }));
    expect(gateSpy).not.toHaveBeenCalled();
    expect(await requests(f.tenantId)).toBe(0);
    expect((await row(f.claimItemId)).updatedAt.toISOString()).toBe(before.updatedAt.toISOString());
  });

  it('ret: tür değişip kaynak kalırsa 400; bilinmeyen değer 400 (üretim ValidationPipe)', async () => {
    const f = await fixture('tur', { attorneyFeeBasis: 'JUDGMENT_AWARDED' });
    const changed = await put(f, { itemType: 'EXPENSE' });
    expect(changed.status).toBe(400);
    expect(changed.body).toEqual(expect.objectContaining({ code: ATTORNEY_FEE_BASIS_ITEM_TYPE_MISMATCH }));
    const unknownValue = await put(f, { attorneyFeeBasis: 'ILAM' });
    expect(unknownValue.status).toBe(400);
    expect(JSON.stringify(unknownValue.body.message)).toContain('attorneyFeeBasis');
    expect(await requests(f.tenantId)).toBe(0);
    expect((await row(f.claimItemId)).attorneyFeeBasis).toBe('JUDGMENT_AWARDED');
  });

  it('kiracı sınırı: başka kiracının kullanıcısı kalemi değiştiremez; talep oluşmaz', async () => {
    const f = await fixture('own');
    const other = await fixture('other');
    const res = await put(f, { attorneyFeeBasis: 'JUDGMENT_AWARDED' }, other.requesterUserId);
    expect([403, 404]).toContain(res.status);
    expect(await requests(f.tenantId)).toBe(0);
    expect(await requests(other.tenantId)).toBe(0);
    expect((await row(f.claimItemId)).attorneyFeeBasis).toBeNull();
  });

  it('DB kısıtı: API atlatılsa da vekâlet ücreti dışı kalemde kaynak yazılamaz (ClaimItem_attorneyFeeBasis_itemType_check)', async () => {
    const f = await fixture('check', { itemType: 'YARGILAMA_GIDERI' });
    await expect(
      prisma.claimItem.update({ where: { id: f.claimItemId }, data: { attorneyFeeBasis: 'JUDGMENT_AWARDED' } }),
    ).rejects.toThrow(/ClaimItem_attorneyFeeBasis_itemType_check|check constraint/i);
    expect((await row(f.claimItemId)).attorneyFeeBasis).toBeNull();
  });
});
