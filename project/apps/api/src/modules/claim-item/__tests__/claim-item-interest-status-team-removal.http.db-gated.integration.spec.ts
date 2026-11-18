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
import { CaseModule } from '../../case/case.module';
import { OfficeApprovalService } from '../../office-approval/office-approval.service';
import { ClaimItemModule } from '../claim-item.module';

/**
 * P02 ekran eksikleri (18.11.2026): kalem düzenleme ekranının GÖNDERDİĞİ yükler ve dosya ekibinden çıkarma — GERÇEK HTTP
 * (PUT /claim-items/:id, DELETE /cases/:id/lawyers/:caseLawyerId) + yazma kapısı + K4 iki kişi onayı + onay senkronu +
 * disposable PostgreSQL. Sunucu kuralları DEĞİŞMEDİ; bu dosya ekranın kullandığı yolları kanıtlar.
 *
 *  1. Belirlenmedi → faiz işler + başlangıç + dayanak (+ ilam vekâlet ücreti) onaya gider; onaydan önce kalem değişmez; talep
 *     eden kendi talebini onaylayamaz; başka kişinin onayıyla yazılır; dosyadaki öteki kalem "Belirlenmedi" kalır.
 *  2. Yalnız düşük etkili alan değişirse "Belirlenmedi" aynen kalır, talep oluşmaz.
 *  3. Dayanaksız "faiz işler" 400; talep oluşmaz.
 *  4. Faiz işler → belirlenmedi (ekranın gönderdiği yalnız durum) onaydan geçer; faiz türü, başlangıç ve dayanak korunur.
 *     ("Faiz işlemez" geçişi ekranda SUNULMAZ: onay yürütmesi açık null tarih / dayanağı yazmıyor — ayrı bulgu.)
 *  5. Yetkisiz: dosyaya atanmamış avukat ve "mali düzenleme" izni olmayan atanmış avukat yazamaz; talep oluşmaz.
 *  6. Ekipten çıkarma: sorumlu olmayan atama silinir + denetim kaydı; sonra o avukat yazamaz; hukuki sorumlu avukat çıkarılamaz;
 *     salt görüntüleyici çıkaramaz; öteki atamalar değişmez.
 * Tutarlar ve adlar SENTETİK.
 */
const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('CLAIM-ITEM-INTEREST-STATUS-TEAM-REMOVAL DB gate blocked: CI requires an approved TEST_DATABASE_URL.');
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

describeWithDisposableDb('Kalem faiz durumu / dayanağı ve dosya ekibinden çıkarma — HTTP + K4 onay (disposable PostgreSQL)', () => {
  jest.setTimeout(180_000);

  let prisma: PrismaClient;
  let app: INestApplication;
  let approvals: OfficeApprovalService;
  const tenantIds = new Set<string>();

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
    for (const tenantId of tenantIds) {
      await prisma.auditLog.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await prisma.tenant.deleteMany({ where: { id: tenantId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  type Fixture = Awaited<ReturnType<typeof fixture>>;

  async function fixture(label: string) {
    const suffix = randomUUID().slice(0, 8);
    const tenantId = `test-ci-isd-${label}-${suffix}`;
    tenantIds.add(tenantId);
    await prisma.tenant.create({ data: { id: tenantId, name: `CI ISD ${label}`, slug: tenantId } });
    const office = await prisma.office.create({ data: { tenantId, name: `CI ISD office ${label}` } });
    const mkLawyer = async (key: string, role: 'USER' | 'ADMIN' | 'VIEWER', rank: 'LAWYER' | 'AUTHORIZED' | 'PARTNER') => {
      const user = await prisma.user.create({
        data: { tenantId, email: `isd-${key}-${suffix}@example.test`, name: 'Sentetik', surname: key, role },
      });
      const lawyer = await prisma.lawyer.create({
        data: { tenantId, officeId: office.id, userId: user.id, name: 'Sentetik', surname: key, lawyerRank: rank },
      });
      return { userId: user.id, lawyerId: lawyer.id };
    };
    const requester = await mkLawyer('Talepci', 'USER', 'AUTHORIZED');
    const approver = await mkLawyer('Onayci', 'ADMIN', 'PARTNER');
    const outsider = await mkLawyer('Disarida', 'USER', 'AUTHORIZED');
    const noFinance = await mkLawyer('Izinsiz', 'USER', 'AUTHORIZED');
    const viewer = await mkLawyer('Izleyici', 'VIEWER', 'LAWYER');
    const legalCase = await prisma.case.create({
      data: { tenantId, fileNumber: `CI-ISD-${label}-${suffix}`, type: 'GENERAL_EXECUTION', currency: 'TRY' } as never,
    });
    const responsible = await prisma.caseLawyer.create({
      data: { caseId: legalCase.id, lawyerId: approver.lawyerId, role: 'RESPONSIBLE', isResponsible: true },
    });
    // P02'deki geçici erişimin biçimi: atanmış avukat + yalnız "mali düzenleme".
    const temp = await prisma.caseLawyer.create({
      data: { caseId: legalCase.id, lawyerId: requester.lawyerId, role: 'ASSIGNED', casePermissions: { canEditFinance: true } },
    });
    await prisma.caseLawyer.create({
      data: { caseId: legalCase.id, lawyerId: noFinance.lawyerId, role: 'ASSIGNED', casePermissions: { canEditFinance: false } },
    });
    const base = {
      tenantId,
      caseId: legalCase.id,
      currency: 'TRY',
      interestAccrualStatus: 'UNKNOWN' as const,
      interestType: 'YASAL' as const,
      interestTypeCode: 'LEGAL_3095' as const,
      interestStartDate: new Date('2025-06-16T00:00:00.000Z'),
      liableDebtorIds: [],
    };
    const fee = await prisma.claimItem.create({
      data: { ...base, itemType: 'ATTORNEY_FEE', originalAmount: 1000, demandedAmount: 1000, amount: 1000, description: null, sortOrder: 1 },
    });
    const cost = await prisma.claimItem.create({
      data: { ...base, itemType: 'YARGILAMA_GIDERI', originalAmount: 73, demandedAmount: 73, amount: 73, description: null, sortOrder: 2 },
    });
    return { tenantId, caseId: legalCase.id, feeId: fee.id, costId: cost.id, requester, approver, outsider, noFinance, viewer, responsibleId: responsible.id, tempId: temp.id };
  }

  const http = () => request(app.getHttpServer());
  const put = (id: string, userId: string, body: Record<string, unknown>) => http().put(`/claim-items/${id}`).set('x-test-user-id', userId).send(body);
  const row = (id: string) => prisma.claimItem.findUniqueOrThrow({ where: { id } });
  const requests = (tenantId: string) => prisma.officeApprovalRequest.count({ where: { tenantId } });
  const rowDigest = async (id: string) => {
    const { updatedAt: _u, ...rest } = await row(id);
    return JSON.stringify(rest);
  };

  async function requestOf(res: request.Response) {
    if (res.status !== 200) throw new Error(`beklenen 200, gelen ${res.status}: ${JSON.stringify(res.body)}`);
    expect(res.body.data).toEqual(expect.objectContaining({ applied: false, approvalRequired: true }));
    return prisma.officeApprovalRequest.findUniqueOrThrow({ where: { id: res.body.data.approvalRequestId } });
  }

  it('belirlenmedi → faiz işler + 12.03.2026 + kesinleşme + ilam vekâlet ücreti: onaya gider; kendi talebi onaylanamaz; başka kişi onaylar', async () => {
    const f = await fixture('isler');
    const before = await row(f.feeId);
    const costBefore = await rowDigest(f.costId);
    // Ekranın gönderdiği yük (yalnız değişen alanlar).
    const body = {
      interestAccrualStatus: 'ACCRUES',
      interestStartDate: '2026-03-12',
      interestStartDateProvenance: 'JUDGMENT_FINALIZATION_DATE',
      attorneyFeeBasis: 'JUDGMENT_AWARDED',
    };
    const approval = await requestOf(await put(f.feeId, f.requester.userId, body));
    expect(approval.actionCode).toBe('CLAIM_ITEM_HIGH_IMPACT_CHANGE');
    const intent = approval.savedIntent as any;
    expect(intent).toEqual(expect.objectContaining({ version: 'OWN29D_CLAIM_ITEM_HIGH_IMPACT_V1', operation: 'UPDATE', claimItemId: f.feeId }));
    expect(intent.proposedPatch).toEqual(expect.objectContaining(body));
    expect(intent.currentSnapshot).toEqual(expect.objectContaining({ interestAccrualStatus: 'UNKNOWN', interestStartDateProvenance: null, attorneyFeeBasis: null }));

    const pending = await row(f.feeId);
    expect(pending.interestAccrualStatus).toBe('UNKNOWN');
    expect(pending.updatedAt.toISOString()).toBe(before.updatedAt.toISOString());

    await expect(approvals.approve(approval.id, f.requester.userId)).rejects.toThrow();
    expect((await prisma.officeApprovalRequest.findUniqueOrThrow({ where: { id: approval.id } })).status).toBe(OfficeApprovalStatus.PENDING_APPROVAL);

    await approvals.approve(approval.id, f.approver.userId);
    const executed = await prisma.officeApprovalRequest.findUniqueOrThrow({ where: { id: approval.id } });
    expect(executed.status).toBe(OfficeApprovalStatus.APPROVED);
    expect(executed.executionStatus).toBe(OfficeApprovalExecutionStatus.SUCCEEDED);

    const after = await row(f.feeId);
    expect(after.interestAccrualStatus).toBe('ACCRUES');
    expect(after.interestStartDate?.toISOString().slice(0, 10)).toBe('2026-03-12');
    expect(after.interestStartDateProvenance).toBe('JUDGMENT_FINALIZATION_DATE');
    expect(after.attorneyFeeBasis).toBe('JUDGMENT_AWARDED');
    expect(after.interestTypeCode).toBe('LEGAL_3095');
    expect(Number(after.amount)).toBe(1000);
    expect(after.itemType).toBe('ATTORNEY_FEE');
    // Dosyadaki öteki kalem kendiliğinden değişmez.
    expect(await rowDigest(f.costId)).toBe(costBefore);
  });

  it('yalnız düşük etkili alan: "Belirlenmedi" aynen kalır, talep oluşmaz', async () => {
    const f = await fixture('dusuk');
    const res = await put(f.costId, f.requester.userId, { description: 'Sentetik yeni açıklama' });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(expect.objectContaining({ applied: true, approvalRequired: false }));
    const after = await row(f.costId);
    expect(after.description).toBe('Sentetik yeni açıklama');
    expect(after.interestAccrualStatus).toBe('UNKNOWN');
    expect(after.interestStartDateProvenance).toBeNull();
    expect(await requests(f.tenantId)).toBe(0);
  });

  it('dayanaksız "faiz işler" 400; talep oluşmaz, kalem değişmez', async () => {
    const f = await fixture('dayanaksiz');
    const before = await rowDigest(f.costId);
    const res = await put(f.costId, f.requester.userId, { interestAccrualStatus: 'ACCRUES', interestStartDate: '2026-03-12' });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('interestStartDateProvenance');
    expect(await requests(f.tenantId)).toBe(0);
    expect(await rowDigest(f.costId)).toBe(before);
  });

  it('faiz işler → belirlenmedi (ekranın gönderdiği yalnız durum): onaydan geçer; faiz türü, başlangıç ve dayanak korunur', async () => {
    const f = await fixture('geri');
    const first = await requestOf(await put(f.costId, f.requester.userId, { interestAccrualStatus: 'ACCRUES', interestStartDate: '2026-03-12', interestStartDateProvenance: 'JUDGMENT_DATE' }));
    await approvals.approve(first.id, f.approver.userId);
    expect((await row(f.costId)).interestAccrualStatus).toBe('ACCRUES');

    const second = await requestOf(await put(f.costId, f.requester.userId, { interestAccrualStatus: 'UNKNOWN' }));
    await approvals.approve(second.id, f.approver.userId);
    const after = await row(f.costId);
    expect(after.interestAccrualStatus).toBe('UNKNOWN');
    expect(after.interestTypeCode).toBe('LEGAL_3095');
    expect(after.interestStartDate?.toISOString().slice(0, 10)).toBe('2026-03-12');
    expect(after.interestStartDateProvenance).toBe('JUDGMENT_DATE');
  });

  it('yetkisiz: dosyaya atanmamış avukat ve mali düzenleme izni olmayan avukat yazamaz; talep oluşmaz', async () => {
    const f = await fixture('yetkisiz');
    const before = await rowDigest(f.feeId);
    const body = { interestAccrualStatus: 'ACCRUES', interestStartDate: '2026-03-12', interestStartDateProvenance: 'JUDGMENT_FINALIZATION_DATE' };
    for (const userId of [f.outsider.userId, f.noFinance.userId]) {
      const res = await put(f.feeId, userId, body);
      expect([403, 404]).toContain(res.status);
    }
    expect(await requests(f.tenantId)).toBe(0);
    expect(await rowDigest(f.feeId)).toBe(before);
  });

  it('ekipten çıkarma: geçici atama silinir + denetim; sonra yazamaz; sorumlu çıkarılamaz; görüntüleyici çıkaramaz; öteki atamalar aynı', async () => {
    const f = await fixture('ekip');
    const othersBefore = await prisma.caseLawyer.findMany({ where: { caseId: f.caseId, NOT: { id: f.tempId } }, orderBy: { id: 'asc' } });

    const byViewer = await http().delete(`/cases/${f.caseId}/lawyers/${f.tempId}`).set('x-test-user-id', f.viewer.userId);
    expect(byViewer.status).toBe(403);
    expect(await prisma.caseLawyer.count({ where: { id: f.tempId } })).toBe(1);

    const removed = await http().delete(`/cases/${f.caseId}/lawyers/${f.tempId}`).set('x-test-user-id', f.approver.userId);
    expect(removed.status).toBe(200);
    expect(removed.body).toEqual(expect.objectContaining({ success: true }));
    expect(await prisma.caseLawyer.count({ where: { id: f.tempId } })).toBe(0);
    const audit = await prisma.auditLog.findMany({ where: { tenantId: f.tenantId, entityType: 'CASE_LAWYER', entityId: f.tempId, action: 'DELETE' } });
    expect(audit).toHaveLength(1);
    expect(audit[0].userId).toBe(f.approver.userId);

    const afterRemoval = await put(f.feeId, f.requester.userId, { interestAccrualStatus: 'ACCRUES', interestStartDate: '2026-03-12', interestStartDateProvenance: 'JUDGMENT_FINALIZATION_DATE' });
    expect([403, 404]).toContain(afterRemoval.status);
    expect(await requests(f.tenantId)).toBe(0);

    const responsible = await http().delete(`/cases/${f.caseId}/lawyers/${f.responsibleId}`).set('x-test-user-id', f.approver.userId);
    expect(responsible.status).toBe(400);
    expect(await prisma.caseLawyer.count({ where: { id: f.responsibleId } })).toBe(1);

    const othersAfter = await prisma.caseLawyer.findMany({ where: { caseId: f.caseId }, orderBy: { id: 'asc' } });
    expect(othersAfter).toEqual(othersBefore);
  });
});
