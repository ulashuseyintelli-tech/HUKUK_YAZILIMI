// CaseModule grafiği `pdf-poppler`'ı yükler; paket Linux'ta yükleme anında process.exit(1) verir
// (CI emsali: case-create-due-currency.http.db-gated.integration.spec.ts).
jest.mock('pdf-poppler', () => ({
  convert: async () => {
    throw new Error('pdf-poppler is stubbed in unit tests');
  },
}));

import { CanActivate, ExecutionContext, INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import * as request from 'supertest';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { StorageModule } from '../../../common/storage/storage.module';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AutomationModule } from '../../automation/automation.module';
import { CaseModule } from '../../case/case.module';
import { ErrorLogModule } from '../../error-log/error-log.module';
import { MetricsRegistryModule } from '../../metrics-registry/metrics-registry.module';
import { StageTriggerModule } from '../../stage-trigger/stage-trigger.module';

/**
 * Masraf kesinleştirme / onaylama / reddetme — DOSYA AŞAMASINDAN BAĞIMSIZ. GERÇEK HTTP + disposable PostgreSQL.
 *
 * Ölçülen kusur (main 99368b6c, ASAMA-SOZLUGU-EVIDENCE-20261002): karar motorunun durum makinesi aşama kodları ile veritabanının
 * `WorkflowStage` değerleri yalnız `INITIAL`'da kesişir; dosya ilk aşamadan çıkınca (ödeme emri tebligatı → PAYMENT_ORDER,
 * teslim → WAITING_RESPONSE, zamanlayıcı → ENFORCEMENT ...) POST /expense-requests/:id/{finalize,approve,reject} 403
 * "Geçersiz aşama" verir (12 / 13 aşama).
 *
 * Owner kararı 8 (2026-10-05): bu üç eylem (ve masraf ödeme kaydı — o uç AYRI karar maddesidir, bu testte KAPSAM DIŞI) aşamadan
 * bağımsızdır. KORUNACAKLAR bu testte AYRI AYRI kilitlidir: kapalı / arşiv dosya reddi · büro sınırı · aktör yetkisi (VIEWER) ·
 * talebin kendi durum geçişleri · denetim / karar günlüğü kaydı. Karar motoru matrisi (diğer eylemlerin DEĞİŞMEDİĞİ) için bkz.
 * policy-engine/__tests__/case-policy-engine-stage-independence.spec.ts.
 *
 * Bu test düzeltmesiz kodla düşer (13 aşamanın 12'sinde 403); "korunan kurallar" kilitleri düzeltmeden bağımsız geçer.
 */
const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('EXPENSE-STAGE-INDEPENDENT DB gate blocked: CI requires an approved TEST_DATABASE_URL.');
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;

const PRODUCTION_VALIDATION_OPTIONS = { whitelist: true, forbidNonWhitelisted: true, transform: true } as const;

const DB_STAGES = [
  'INITIAL', 'PAYMENT_ORDER', 'WAITING_RESPONSE', 'OBJECTION', 'ENFORCEMENT', 'SEIZURE', 'SALE_REQUEST',
  'AUCTION', 'COLLECTION', 'PARTIAL_PAYMENT', 'FULL_PAYMENT', 'CLOSED', 'SUSPENDED',
] as const;

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

describeWithDisposableDb('Masraf finalize / approve / reject aşamadan bağımsız — korunanlar sürer (HTTP + disposable PostgreSQL)', () => {
  jest.setTimeout(300_000);

  let prisma: PrismaClient;
  let app: INestApplication;
  let tenantId: string;
  let otherTenantId: string;
  let adminId: string;
  let viewerId: string;
  let otherAdminId: string;
  let clientId: string;
  const suffix = randomUUID().slice(0, 8);

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await prisma.$connect();
    const identity = new DbUserIdentityGuard(() => prisma);
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), StorageModule, ErrorLogModule, MetricsRegistryModule, CaseModule, AutomationModule, StageTriggerModule],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(identity)
      // Masraf talebi denetleyicisi passport korumasını doğrudan kullanır (AuthGuard('jwt') aynı sınıfı döndürür)
      .overrideGuard(AuthGuard('jwt'))
      .useValue(identity)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe(PRODUCTION_VALIDATION_OPTIONS));
    await app.init();
    // Uygulama kendi portunda dinler (supertest sunucuyu sahiplenmez): eşzamanlı istek testlerinde Linux ECONNRESET önlemi.
    await app.listen(0, '127.0.0.1');
    for (const job of app.get(SchedulerRegistry, { strict: false }).getCronJobs().values()) job.stop();

    tenantId = `test-ci-esia-${suffix}`;
    otherTenantId = `test-ci-esia-b-${suffix}`;
    await prisma.tenant.create({ data: { id: tenantId, name: 'CI ESIA', slug: tenantId } });
    await prisma.tenant.create({ data: { id: otherTenantId, name: 'CI ESIA B', slug: otherTenantId } });
    adminId = (await prisma.user.create({ data: { tenantId, email: `admin-${suffix}@example.test`, name: 'admin', surname: 'ESIA', role: 'ADMIN' } })).id;
    viewerId = (await prisma.user.create({ data: { tenantId, email: `viewer-${suffix}@example.test`, name: 'viewer', surname: 'ESIA', role: 'VIEWER' } })).id;
    otherAdminId = (await prisma.user.create({ data: { tenantId: otherTenantId, email: `admin-b-${suffix}@example.test`, name: 'adminb', surname: 'ESIA', role: 'ADMIN' } })).id;
    clientId = (await prisma.client.create({ data: { tenantId, type: 'COMPANY', companyName: 'ESIA müvekkil', displayName: 'ESIA müvekkil' } })).id;
  });

  afterAll(async () => {
    await app?.close();
    for (const id of [tenantId, otherTenantId]) {
      await prisma.auditLog.deleteMany({ where: { tenantId: id } }).catch(() => undefined);
      await prisma.tenant.deleteMany({ where: { id } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  const http = () => request(app.getHttpServer());
  const postAs = (userId: string, path: string, body?: object) => {
    const req = http().post(path).set('x-test-user-id', userId);
    return body === undefined ? req : req.send(body);
  };

  const openCase = async (label: string) => {
    const res = await postAs(adminId, '/cases', {
      fileNumber: `CI-ESIA-${label}-${suffix}`,
      type: 'GENERAL_EXECUTION',
      interestType: 'YASAL',
      startDate: '2026-02-01',
      currency: 'TRY',
      creditors: [{ id: clientId, type: 'COMPANY', name: 'ESIA müvekkil' }],
      dues: [{ type: 'PRINCIPAL', description: 'Asıl alacak', amount: 100_000, dueDate: '2026-01-15' }],
    });
    expect({ label, status: res.status }).toEqual({ label, status: 201 });
    return res.body.id as string;
  };

  /** Kontrollü durumlu masraf talebi (kurulum: doğrudan veritabanı). */
  const makeRequestRow = async (caseId: string, data: Record<string, unknown> = {}) =>
    (
      await prisma.expenseRequest.create({
        data: { tenantId, caseId, clientId, createdById: adminId, totalAmount: 500, currency: 'TRY', stageCode: 'RE_NOTIFICATION', gateType: 'NON_BLOCKING', ...data } as never,
      })
    ).id;

  const snapshot = async (requestId: string) => {
    const row = await prisma.expenseRequest.findUniqueOrThrow({ where: { id: requestId }, include: { auditLogs: true } });
    return { status: row.status, approval: row.expenseApprovalStatus, approvedById: row.approvedById, sentVia: row.sentVia, audit: row.auditLogs.map((log) => log.action).sort() };
  };

  const cpeRows = (caseId: string, since: Date) =>
    prisma.cpeDecisionLog.findMany({ where: { caseId, actionCode: 'APPROVE_EXPENSE', createdAt: { gte: since } }, orderBy: { createdAt: 'asc' } });

  describe('aşamadan bağımsızlık: 13 / 13 veritabanı aşamasında finalize + approve + reject çalışır', () => {
    let caseId: string;

    beforeAll(async () => {
      caseId = await openCase('asama');
    });

    it.each(DB_STAGES)('aşama %s: finalize → SENT, approve → APPROVED, reject → REJECTED; denetim + karar günlüğü yazılır', async (stage) => {
      await prisma.case.update({ where: { id: caseId }, data: { workflowStage: stage } });
      const finalizeId = await makeRequestRow(caseId);
      const approveId = await makeRequestRow(caseId);
      const rejectId = await makeRequestRow(caseId);
      const since = new Date();

      const finalized = await postAs(adminId, `/expense-requests/${finalizeId}/finalize`, { channel: 'EMAIL' });
      const approved = await postAs(adminId, `/expense-requests/${approveId}/approve`, {});
      const rejected = await postAs(adminId, `/expense-requests/${rejectId}/reject`, { note: 'ölçüm' });
      expect({ stage, finalize: finalized.status, approve: approved.status, reject: rejected.status }).toEqual({ stage, finalize: 201, approve: 201, reject: 201 });

      expect(await snapshot(finalizeId)).toMatchObject({ status: 'SENT', sentVia: 'EMAIL', audit: ['SENT'] });
      expect(await snapshot(approveId)).toMatchObject({ approval: 'APPROVED', approvedById: adminId, audit: ['APPROVAL_GRANTED'] });
      expect(await snapshot(rejectId)).toMatchObject({ approval: 'REJECTED', approvedById: adminId, audit: ['APPROVAL_REJECTED'] });

      // Karar günlüğü: üç izinli karar, aşama anlık görüntüsüyle (aşama bu kayıtta görünür kalır)
      const rows = await cpeRows(caseId, since);
      expect(rows).toHaveLength(3);
      for (const row of rows) {
        expect(row.allowed).toBe(true);
        expect((row.stateSnapshot as { currentState?: string } | null)?.currentState).toBe(stage);
      }
      // INITIAL'da durum makinesi zaten izin verir ("OK"); diğer aşamalarda gerekçe aşama denetiminin yok sayıldığını söyler.
      for (const row of rows) expect(row.reason).toBe(stage === 'INITIAL' ? 'OK' : 'OK (aşamadan bağımsız eylem)');
    });

    it('stage-trigger EVT_EXPENSE_APPROVE (aynı eylem) aşamada engellenmez; REQUEST_EXPENSE hâlâ aşamaya bağlı (SEIZURE: BLOCKED)', async () => {
      await prisma.case.update({ where: { id: caseId }, data: { workflowStage: 'SEIZURE' } });
      const approve = await postAs(adminId, `/cases/${caseId}/stage-trigger`, { eventCode: 'EVT_EXPENSE_APPROVE' });
      expect({ status: approve.status, action: approve.body?.action }).toEqual({ status: 201, action: 'SUGGEST_ONLY' });
      const requestExpense = await postAs(adminId, `/cases/${caseId}/stage-trigger`, { eventCode: 'EVT_EXPENSE_REQUEST' });
      expect({ status: requestExpense.status, action: requestExpense.body?.action }).toEqual({ status: 201, action: 'BLOCKED' });
    });
  });

  describe('KORUNAN KURALLAR — aşama ne olursa olsun (SEIZURE)', () => {
    it('kapalı dosya (caseStatus HITAM): finalize / approve / reject 403 GATE_BLOCKED CASE_CLOSED; talep DEĞİŞMEZ; ret günlüğe yazılır', async () => {
      const caseId = await openCase('kapali');
      await prisma.case.update({ where: { id: caseId }, data: { workflowStage: 'SEIZURE', caseStatus: 'HITAM' } });
      const ids = [await makeRequestRow(caseId), await makeRequestRow(caseId), await makeRequestRow(caseId)];
      const before = await Promise.all(ids.map(snapshot));
      const since = new Date();
      const results = [
        await postAs(adminId, `/expense-requests/${ids[0]}/finalize`, { channel: 'EMAIL' }),
        await postAs(adminId, `/expense-requests/${ids[1]}/approve`, {}),
        await postAs(adminId, `/expense-requests/${ids[2]}/reject`, {}),
      ];
      for (const res of results) {
        expect(res.status).toBe(403);
        expect(res.body).toMatchObject({ code: 'GATE_BLOCKED', blockedBy: { gateCode: 'CASE_CLOSED' } });
      }
      expect(await Promise.all(ids.map(snapshot))).toEqual(before);
      const rows = await cpeRows(caseId, since);
      expect(rows.map((row) => [row.allowed, row.code, row.gateCode])).toEqual([[false, 'GATE_BLOCKED', 'CASE_CLOSED'], [false, 'GATE_BLOCKED', 'CASE_CLOSED'], [false, 'GATE_BLOCKED', 'CASE_CLOSED']]);
    });

    it('arşivdeki dosya: 403 GATE_BLOCKED CASE_ARCHIVED; talep DEĞİŞMEZ', async () => {
      const caseId = await openCase('arsiv');
      await prisma.case.update({ where: { id: caseId }, data: { workflowStage: 'SEIZURE', isArchived: true } });
      const id = await makeRequestRow(caseId);
      const before = await snapshot(id);
      const res = await postAs(adminId, `/expense-requests/${id}/approve`, {});
      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({ code: 'GATE_BLOCKED', blockedBy: { gateCode: 'CASE_ARCHIVED' } });
      expect(await snapshot(id)).toEqual(before);
    });

    it('büro sınırı: başka büronun kullanıcısı bu bürodaki talebe dokunamaz (403 RESOLVER_ERROR_BLOCKED); talep DEĞİŞMEZ; karar motoru çağrılmaz', async () => {
      const caseId = await openCase('buro');
      await prisma.case.update({ where: { id: caseId }, data: { workflowStage: 'SEIZURE' } });
      const ids = [await makeRequestRow(caseId), await makeRequestRow(caseId), await makeRequestRow(caseId)];
      const before = await Promise.all(ids.map(snapshot));
      const since = new Date();
      const results = [
        await postAs(otherAdminId, `/expense-requests/${ids[0]}/finalize`, { channel: 'EMAIL' }),
        await postAs(otherAdminId, `/expense-requests/${ids[1]}/approve`, {}),
        await postAs(otherAdminId, `/expense-requests/${ids[2]}/reject`, {}),
      ];
      for (const res of results) {
        expect(res.status).toBe(403);
        expect(res.body).toMatchObject({ code: 'RESOLVER_ERROR_BLOCKED' });
      }
      expect(await Promise.all(ids.map(snapshot))).toEqual(before);
      expect(await cpeRows(caseId, since)).toHaveLength(0);
    });

    it('aktör yetkisi: VIEWER finalize / approve / reject yapamaz (403 VIEWER_WRITE_DENIED); talep DEĞİŞMEZ', async () => {
      const caseId = await openCase('viewer');
      await prisma.case.update({ where: { id: caseId }, data: { workflowStage: 'SEIZURE' } });
      const ids = [await makeRequestRow(caseId), await makeRequestRow(caseId), await makeRequestRow(caseId)];
      const before = await Promise.all(ids.map(snapshot));
      const results = [
        await postAs(viewerId, `/expense-requests/${ids[0]}/finalize`, { channel: 'EMAIL' }),
        await postAs(viewerId, `/expense-requests/${ids[1]}/approve`, {}),
        await postAs(viewerId, `/expense-requests/${ids[2]}/reject`, {}),
      ];
      for (const res of results) {
        expect(res.status).toBe(403);
        expect(res.body).toMatchObject({ code: 'VIEWER_WRITE_DENIED' });
      }
      expect(await Promise.all(ids.map(snapshot))).toEqual(before);
    });

    it('talebin kendi durum geçişleri aşamadan bağımsız sürer: reddedilmiş onaylanamaz, onaylanmış reddedilemez, gönderilmiş yeniden kesinleştirilemez; onay idempotent', async () => {
      const caseId = await openCase('gecis');
      await prisma.case.update({ where: { id: caseId }, data: { workflowStage: 'SEIZURE' } });
      const rejectedRow = await makeRequestRow(caseId, { expenseApprovalStatus: 'REJECTED' });
      const approvedRow = await makeRequestRow(caseId, { expenseApprovalStatus: 'APPROVED', approvedById: adminId, approvedAt: new Date() });
      const sentRow = await makeRequestRow(caseId, { status: 'SENT', sentAt: new Date(), sentVia: 'EMAIL' });
      const paidRow = await makeRequestRow(caseId, { status: 'PAID', paidTotal: 500 });

      const beforeRejected = await snapshot(rejectedRow);
      const approveRejected = await postAs(adminId, `/expense-requests/${rejectedRow}/approve`, {});
      expect({ status: approveRejected.status, message: String(approveRejected.body?.message) }).toMatchObject({ status: 400, message: expect.stringContaining('Yalnız PENDING_APPROVAL') });
      expect(await snapshot(rejectedRow)).toEqual(beforeRejected);

      const beforeApproved = await snapshot(approvedRow);
      const rejectApproved = await postAs(adminId, `/expense-requests/${approvedRow}/reject`, {});
      expect({ status: rejectApproved.status, message: String(rejectApproved.body?.message) }).toMatchObject({ status: 400, message: expect.stringContaining('Yalnız PENDING_APPROVAL') });
      expect(await snapshot(approvedRow)).toEqual(beforeApproved);

      // idempotent onay: ikinci onay yeni denetim kaydı yazmaz
      const again = await postAs(adminId, `/expense-requests/${approvedRow}/approve`, {});
      expect(again.status).toBe(201);
      expect(await snapshot(approvedRow)).toEqual(beforeApproved);

      for (const id of [sentRow, paidRow]) {
        const before = await snapshot(id);
        const res = await postAs(adminId, `/expense-requests/${id}/finalize`, { channel: 'EMAIL' });
        expect({ status: res.status, message: String(res.body?.message) }).toMatchObject({ status: 400, message: expect.stringContaining('Sadece bekleyen') });
        expect(await snapshot(id)).toEqual(before);
      }
    });
  });

  describe('aşamadan bağımsızlık başka uca SIZMAZ', () => {
    it('masraf ödeme kaydı ucu (karar maddesi bekliyor) bu teslimde AÇILMADI: SEIZURE\'da hâlâ aşama denetimi (403 INVALID_TRANSITION)', async () => {
      const caseId = await openCase('odeme');
      await prisma.case.update({ where: { id: caseId }, data: { workflowStage: 'SEIZURE' } });
      const id = await makeRequestRow(caseId);
      const before = await snapshot(id);
      const res = await postAs(adminId, `/expense-requests/${id}/payment`, { amount: 100, paymentDate: '2026-10-05', method: 'BANK_TRANSFER' });
      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({ code: 'INVALID_TRANSITION' });
      expect(await snapshot(id)).toEqual(before);
      expect(await prisma.expensePayment.count({ where: { expenseRequestId: id } })).toBe(0);
    });
  });
});
