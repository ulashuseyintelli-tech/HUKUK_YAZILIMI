import { CanActivate, ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { OfficeApprovalExecutionStatus, OfficeApprovalStatus, PrismaClient } from '@prisma/client';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import * as request from 'supertest';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { OfficeApprovalService } from '../../office-approval/office-approval.service';
import { ClaimItemModule } from '../claim-item.module';
import { ClaimItemService } from '../claim-item.service';
import { ClaimItemWriterRouterService } from '../claim-item-writer-router.service';

/**
 * PUT /claim-items/:id → ClaimItemService.updateFromUser faiz işletimi kusuru (2026-09-27).
 *
 * Kusur: normalizeInterestPatch ACCRUES/UNKNOWN dallarında sunucu-türetimli
 * `noInterestConfirmedAt: null` üretiyordu; ClaimItemWriteGateService UPDATE alan süzgeci bu alanı
 * tanımadığı için her faiz yaması UNSUPPORTED_UPDATE_FIELD ile reddediliyordu.
 *
 * Gerçek giriş yolu: HTTP PUT + main.ts global ValidationPipe → ClaimItemController → gerçek Nest DI
 * grafiği (ClaimItemModule → OfficeApprovalModule → DomainSync) → disposable PostgreSQL. Yalnız JWT
 * doğrulaması test kimliğiyle değiştirilir; kapı, yetki, onay ve senkron gerçektir.
 */
const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('CLAIM-ITEM-INTEREST-GATE DB gate blocked: CI requires an approved TEST_DATABASE_URL.');
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;

/** main.ts global pipe'ı ile aynı seçenekler; aşağıdaki test kaynağın hâlâ bunu kullandığını doğrular. */
const PRODUCTION_VALIDATION_OPTIONS = { whitelist: true, forbidNonWhitelisted: true, transform: true } as const;

class HeaderIdentityGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    req.user = { id: req.headers['x-test-user-id'], tenantId: req.headers['x-test-tenant-id'] };
    return true;
  }
}

describeWithDisposableDb('ClaimItem user interest accrual update — HTTP + gate + OfficeApproval sync (disposable PostgreSQL)', () => {
  jest.setTimeout(60_000);

  let prisma: PrismaClient;
  let app: INestApplication;
  let claimItems: ClaimItemService;
  let router: ClaimItemWriterRouterService;
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
      .useClass(HeaderIdentityGuard)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe(PRODUCTION_VALIDATION_OPTIONS));
    await app.init();
    claimItems = app.get(ClaimItemService);
    router = app.get(ClaimItemWriterRouterService);
    approvals = app.get(OfficeApprovalService);
    gateSpy = jest.spyOn(router, 'evaluateHuman');
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

  type ItemSeed = Record<string, unknown>;
  type Fixture = Awaited<ReturnType<typeof fixture>>;

  async function fixture(label: string, itemSeed: ItemSeed = {}) {
    const suffix = randomUUID().slice(0, 8);
    const tenantId = `test-ci-nic-${label}-${suffix}`;
    tenantIds.add(tenantId);
    await prisma.tenant.create({ data: { id: tenantId, name: `CI NIC ${label}`, slug: tenantId } });
    const office = await prisma.office.create({ data: { tenantId, name: `CI NIC office ${label}` } });

    const requesterUser = await prisma.user.create({
      data: { tenantId, email: `req-${suffix}@example.test`, name: 'Req', surname: 'Lawyer', role: 'USER' },
    });
    const requesterLawyer = await prisma.lawyer.create({
      data: { tenantId, officeId: office.id, userId: requesterUser.id, name: 'Req', surname: 'Lawyer', lawyerRank: 'LAWYER' },
    });
    const approverUser = await prisma.user.create({
      data: { tenantId, email: `appr-${suffix}@example.test`, name: 'Appr', surname: 'Partner', role: 'ADMIN' },
    });
    await prisma.lawyer.create({
      data: { tenantId, officeId: office.id, userId: approverUser.id, name: 'Appr', surname: 'Partner', lawyerRank: 'PARTNER' },
    });

    const legalCase = await prisma.case.create({
      data: { tenantId, fileNumber: `CI-NIC-${label}-${suffix}`, type: 'GENERAL_EXECUTION' },
    });
    await prisma.caseLawyer.create({
      data: { caseId: legalCase.id, lawyerId: requesterLawyer.id, casePermissions: { canEditFinance: true } },
    });

    // POST /cases Due köprüsünün ürettiği biçim: faiz türü bilinir, işletim UNKNOWN kalır.
    const item = await prisma.claimItem.create({
      data: {
        tenantId,
        caseId: legalCase.id,
        itemType: 'PRINCIPAL',
        originalAmount: 10_000,
        demandedAmount: 10_000,
        amount: 10_000,
        currency: 'TRY',
        interestTypeCode: 'LEGAL_3095',
        interestType: 'YASAL',
        interestAccrualStatus: 'UNKNOWN',
        liableDebtorIds: [],
        ...itemSeed,
      },
    });

    return {
      tenantId,
      caseId: legalCase.id,
      claimItemId: item.id,
      requesterUserId: requesterUser.id,
      approverUserId: approverUser.id,
    };
  }

  function put(f: Fixture, body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .put(`/claim-items/${f.claimItemId}`)
      .set('x-test-user-id', f.requesterUserId)
      .set('x-test-tenant-id', f.tenantId)
      .send(body);
  }

  async function expectNothingChanged(f: Fixture, before: { updatedAt: Date; interestAccrualStatus: string }) {
    const row = await prisma.claimItem.findUniqueOrThrow({ where: { id: f.claimItemId } });
    expect(row.updatedAt.toISOString()).toBe(before.updatedAt.toISOString());
    expect(row.interestAccrualStatus).toBe(before.interestAccrualStatus);
  }

  /** HTTP ile talep açar; kapı yükü == saklanan niyet olduğunu ve onay öncesi kalemin değişmediğini doğrular. */
  async function requestChange(f: Fixture, body: Record<string, unknown>) {
    const before = await prisma.claimItem.findUniqueOrThrow({ where: { id: f.claimItemId } });
    const res = await put(f, body);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(expect.objectContaining({ applied: false, approvalRequired: true }));

    const approvalRequest = await prisma.officeApprovalRequest.findUniqueOrThrow({ where: { id: res.body.data.approvalRequestId } });
    const savedIntent = approvalRequest.savedIntent as any;
    const proposedPatch = savedIntent.proposedPatch as Record<string, unknown>;
    // Kapının değerlendirdiği yük ile kaydedilen niyet aynıdır; sunucu-türetimli damga ikisinde de yoktur.
    expect(gateSpy).toHaveBeenCalledTimes(1);
    expect(gateSpy.mock.calls[0][0].payload).toEqual(proposedPatch);
    expect(proposedPatch).not.toHaveProperty('noInterestConfirmedAt');

    // Onay öncesi kalem DEĞİŞMEZ (K4 dört-göz korunur).
    await expectNothingChanged(f, before);
    return { approvalRequest, proposedPatch, currentSnapshot: savedIntent.currentSnapshot as Record<string, unknown> };
  }

  async function requestAndApprove(f: Fixture, body: Record<string, unknown>) {
    const requested = await requestChange(f, body);
    await approvals.approve(requested.approvalRequest.id, f.approverUserId);
    const executed = await prisma.officeApprovalRequest.findUniqueOrThrow({ where: { id: requested.approvalRequest.id } });
    expect(executed.status).toBe(OfficeApprovalStatus.APPROVED);
    expect(executed.executionStatus).toBe(OfficeApprovalExecutionStatus.SUCCEEDED);
    return { ...requested, after: await prisma.claimItem.findUniqueOrThrow({ where: { id: f.claimItemId } }) };
  }

  const ACCRUES_BODY = {
    interestAccrualStatus: 'ACCRUES',
    interestStartDate: '2026-01-15T00:00:00.000Z',
    interestStartDateProvenance: 'DOCUMENT_DUE_DATE',
  };

  it('test pipe seçenekleri üretim main.ts global ValidationPipe ile aynıdır', () => {
    const mainSource = fs.readFileSync(path.resolve(__dirname, '../../../main.ts'), 'utf8');
    expect(mainSource).toMatch(/whitelist:\s*true/);
    expect(mainSource).toMatch(/forbidNonWhitelisted:\s*true/);
    expect(mainSource).toMatch(/transform:\s*true/);
  });

  it.each(['noInterestConfirmedAt', 'noInterestConfirmedById'])(
    'ret (gerçek giriş): istemcinin gönderdiği %s 400 ile reddedilir; talep oluşmaz, kalem değişmez',
    async (field) => {
      const f = await fixture('http-deny');
      const before = await prisma.claimItem.findUniqueOrThrow({ where: { id: f.claimItemId } });
      const res = await put(f, { ...ACCRUES_BODY, [field]: field === 'noInterestConfirmedAt' ? new Date().toISOString() : 'forged-actor' });

      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body.message)).toContain(`property ${field} should not exist`);
      expect(gateSpy).not.toHaveBeenCalled();
      expect(await prisma.officeApprovalRequest.count({ where: { tenantId: f.tenantId } })).toBe(0);
      await expectNothingChanged(f, before);
    },
  );

  it('ret (servis sınırı + kapı): alan pipe atlatılsa da sessizce silinmez; kapı politikası genişlemedi', async () => {
    const f = await fixture('svc-deny');
    await expect(
      claimItems.updateFromUser(f.tenantId, f.requesterUserId, f.claimItemId, {
        ...ACCRUES_BODY,
        noInterestConfirmedAt: new Date().toISOString(),
      } as any),
    ).rejects.toThrow('desteklenmeyen alan');

    const gate = await router.evaluateHuman({
      operation: 'UPDATE',
      tenantId: f.tenantId,
      caseId: f.caseId,
      actorUserId: f.requesterUserId,
      claimItemId: f.claimItemId,
      payload: { interestAccrualStatus: 'ACCRUES', noInterestConfirmedAt: null },
      currency: 'TRY',
    });
    expect(gate).toEqual(expect.objectContaining({ outcome: 'DENIED', reasonCode: 'UNSUPPORTED_UPDATE_FIELD' }));
    expect(await prisma.officeApprovalRequest.count({ where: { tenantId: f.tenantId } })).toBe(0);
  });

  it('ret: nesne yetkisi olmayan aktörün faiz yaması 403; talep oluşmaz', async () => {
    const f = await fixture('noperm');
    await prisma.caseLawyer.updateMany({ where: { caseId: f.caseId }, data: { casePermissions: {} } });
    const res = await put(f, ACCRUES_BODY);

    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).toContain('OBJECT_PERMISSION_DENIED');
    expect(await prisma.officeApprovalRequest.count({ where: { tenantId: f.tenantId } })).toBe(0);
  });

  it('ret: talep sahibi kendi faiz talebini onaylayamaz; kalem değişmez', async () => {
    const f = await fixture('self');
    const before = await prisma.claimItem.findUniqueOrThrow({ where: { id: f.claimItemId } });
    const { approvalRequest } = await requestChange(f, ACCRUES_BODY);

    await expect(approvals.approve(approvalRequest.id, f.requesterUserId)).rejects.toThrow('SELF_APPROVAL_FORBIDDEN');
    const still = await prisma.officeApprovalRequest.findUniqueOrThrow({ where: { id: approvalRequest.id } });
    expect(still.status).toBe(OfficeApprovalStatus.PENDING_APPROVAL);
    expect(still.executionStatus).toBe(OfficeApprovalExecutionStatus.NOT_RUN);
    await expectNothingChanged(f, before);
  });

  it.each([
    [
      'interestTypeCode ile',
      { ...ACCRUES_BODY, interestTypeCode: 'COMMERCIAL_AVANS_3095_2_2' },
      { interestTypeCode: 'COMMERCIAL_AVANS_3095_2_2', interestType: 'TICARI' },
    ],
    ['faiz türü olmadan (mevcut tür korunur)', ACCRUES_BODY, { interestTypeCode: 'LEGAL_3095', interestType: 'YASAL' }],
    [
      'yalnız status + provenance (ENFORCEMENT_PROCEEDING_DATE)',
      { interestAccrualStatus: 'ACCRUES', interestStartDateProvenance: 'ENFORCEMENT_PROCEEDING_DATE' },
      { interestTypeCode: 'LEGAL_3095', interestType: 'YASAL' },
    ],
  ])('başarı + onay senkronu: UNKNOWN → ACCRUES (%s)', async (_label, body, expectedType) => {
    const f = await fixture('accrues');
    const { proposedPatch, after } = await requestAndApprove(f, body);

    expect(proposedPatch).toEqual({
      ...body,
      ...expectedType,
      interestRate: null,
      noInterestReason: null,
      noInterestConfirmedById: null,
    });
    expect(after.interestAccrualStatus).toBe('ACCRUES');
    expect(after.interestTypeCode).toBe(expectedType.interestTypeCode);
    expect(after.interestType).toBe(expectedType.interestType);
    expect(after.interestStartDateProvenance).toBe(body.interestStartDateProvenance);
    expect(after.noInterestReason).toBeNull();
    expect(after.noInterestConfirmedById).toBeNull();
    expect(after.noInterestConfirmedAt).toBeNull();
  });

  it('başarı + onay senkronu: ACCRUES → UNKNOWN (tür bilinir; mevcut tür korunur)', async () => {
    const f = await fixture('unknown-typed', {
      interestAccrualStatus: 'ACCRUES',
      interestStartDate: new Date('2026-01-15T00:00:00.000Z'),
      interestStartDateProvenance: 'DOCUMENT_DUE_DATE',
    });
    const { proposedPatch, after } = await requestAndApprove(f, { interestAccrualStatus: 'UNKNOWN' });

    expect(proposedPatch).toEqual({
      interestAccrualStatus: 'UNKNOWN',
      interestTypeCode: 'LEGAL_3095',
      interestType: 'YASAL',
      interestRate: null,
      noInterestReason: null,
      noInterestConfirmedById: null,
    });
    expect(after.interestAccrualStatus).toBe('UNKNOWN');
    expect(after.interestTypeCode).toBe('LEGAL_3095');
    expect(after.noInterestConfirmedAt).toBeNull();
  });

  it('başarı + onay senkronu: NO_INTEREST → UNKNOWN sıfırlama (OMITTED dalı) faizsizlik izini temizler', async () => {
    const f = await fixture('unknown-omitted', {
      interestTypeCode: null,
      interestType: null,
      interestAccrualStatus: 'NO_INTEREST',
      noInterestReason: 'Önceki beyan',
      noInterestConfirmedById: 'prior-actor',
      noInterestConfirmedAt: new Date('2026-02-01T00:00:00.000Z'),
    });
    const { proposedPatch, after } = await requestAndApprove(f, { interestAccrualStatus: 'UNKNOWN' });

    expect(proposedPatch).toEqual({
      interestAccrualStatus: 'UNKNOWN',
      interestTypeCode: null,
      interestType: null,
      interestRate: null,
      noInterestReason: null,
      noInterestConfirmedById: null,
    });
    expect(after.interestAccrualStatus).toBe('UNKNOWN');
    expect(after.noInterestReason).toBeNull();
    expect(after.noInterestConfirmedById).toBeNull();
    expect(after.noInterestConfirmedAt).toBeNull();
  });

  it('başarı + onay senkronu: NO_INTEREST zaman damgasını senkron türetir (regresyon)', async () => {
    const f = await fixture('nointerest', { interestTypeCode: null, interestType: null });
    const { proposedPatch, after } = await requestAndApprove(f, {
      interestAccrualStatus: 'NO_INTEREST',
      noInterestReason: 'Sözleşmede faiz kararlaştırılmamış',
    });

    expect(proposedPatch).toEqual({
      interestAccrualStatus: 'NO_INTEREST',
      interestTypeCode: null,
      interestType: null,
      interestRate: null,
      noInterestReason: 'Sözleşmede faiz kararlaştırılmamış',
      noInterestConfirmedById: f.requesterUserId,
    });
    expect(after.interestAccrualStatus).toBe('NO_INTEREST');
    expect(after.noInterestReason).toBe('Sözleşmede faiz kararlaştırılmamış');
    expect(after.noInterestConfirmedById).toBe(f.requesterUserId);
    expect(after.noInterestConfirmedAt).toBeInstanceOf(Date);
  });
});
