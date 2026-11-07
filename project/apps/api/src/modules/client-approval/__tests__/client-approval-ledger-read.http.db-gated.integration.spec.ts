import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuthGuard } from '@nestjs/passport';
import request = require('supertest');
import { PrismaService } from '../../../prisma/prisma.service';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { ClientApprovalController } from '../client-approval.controller';
import { ClientApprovalService } from '../client-approval.service';
import { NotificationDispatcherService } from '../../client-notification/notification-dispatcher.service';
import { OfficeService } from '../../office/office.service';

const url = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !url) throw new Error('6a approval-ledger read acceptance requires disposable TEST_DATABASE_URL; SKIP is not acceptance');
const dbDescribe = url ? describe : describe.skip;

dbDescribe('6a staff-attributed approval ledger — real Nest HTTP and disposable PostgreSQL', () => {
  jest.setTimeout(90_000);
  let app: INestApplication; let db: PrismaService; let service: ClientApprovalService;
  let tenant: string; let foreignTenant: string; let client: string; let caseId: string; let otherCase: string;
  let lawyer: string; let staff: string; let outsider: string; let viewer: string;
  let approvalId: string; let otherApproval: string; let foreignApproval: string;
  const dispatcher = { dispatch: jest.fn(() => { throw new Error('Read must not dispatch'); }) };
  const office = { getOfficeIdentity: jest.fn(() => { throw new Error('Read must not prepare a notification'); }) };

  beforeAll(async () => {
    db = new PrismaService({ datasources: { db: { url } } }); await db.$connect();
    const auth = { async canActivate(ctx: any) {
      const req = ctx.switchToHttp().getRequest();
      const user = await db.user.findUnique({ where: { id: String(req.headers['x-test-actor']) } });
      if (!user?.isActive) throw new UnauthorizedException();
      req.user = user; return true; // Identity seam only; actual tenant/profile/object checks use PostgreSQL.
    } };
    const module = await Test.createTestingModule({ controllers: [ClientApprovalController], providers: [
      ClientApprovalService, { provide: PrismaService, useValue: db },
      { provide: NotificationDispatcherService, useValue: dispatcher }, { provide: OfficeService, useValue: office },
    ] }).overrideGuard(AuthGuard('jwt')).useValue(auth).compile();
    service = module.get(ClientApprovalService);
    app = module.createNestApplication(); app.useLogger(false); await app.init(); await app.listen(0, '127.0.0.1');
  });

  async function actor(kind: 'LAWYER' | 'STAFF' | 'NONE', role: 'ADMIN' | 'USER' | 'VIEWER', assigned: boolean, t = tenant) {
    const user = await db.user.create({ data: { tenantId: t, email: `${randomUUID()}@example.test`, role, name: 'Synthetic', surname: 'Ledger actor' } });
    if (kind === 'LAWYER') {
      const profile = await db.lawyer.create({ data: { tenantId: t, userId: user.id, name: 'Synthetic', surname: 'Lawyer', lawyerRank: 'PARTNER' } });
      if (assigned) await db.caseLawyer.create({ data: { caseId, lawyerId: profile.id } });
    } else if (kind === 'STAFF') {
      const profile = await db.staffMember.create({ data: { tenantId: t, userId: user.id, firstName: 'Synthetic', lastName: 'Staff', staffType: 'SEKRETER' } });
      if (assigned) await db.caseStaff.create({ data: { caseId, staffMemberId: profile.id, roleOnCase: 'SEKRETER', canView: true } });
    }
    return user.id;
  }

  beforeEach(async () => {
    tenant = `approval-ledger-6a-test-${randomUUID()}`; foreignTenant = `approval-ledger-6a-foreign-test-${randomUUID()}`;
    for (const id of [tenant, foreignTenant]) await db.tenant.create({ data: { id, slug: id, name: 'Synthetic approval ledger acceptance' } });
    client = (await db.client.create({ data: { tenantId: tenant, type: 'PERSON', name: 'Synthetic allowed Client' } })).id;
    caseId = (await db.case.create({ data: { tenantId: tenant, type: 'GENERAL_EXECUTION', clientId: client, fileNumber: randomUUID() } })).id;
    otherCase = (await db.case.create({ data: { tenantId: tenant, type: 'GENERAL_EXECUTION', clientId: client, fileNumber: randomUUID() } })).id;
    await db.caseClient.createMany({ data: [{ caseId, clientId: client }, { caseId: otherCase, clientId: client }] });
    lawyer = await actor('LAWYER', 'USER', true); staff = await actor('STAFF', 'USER', true);
    outsider = await actor('LAWYER', 'ADMIN', false); viewer = await actor('LAWYER', 'VIEWER', true);
    approvalId = (await db.clientApprovalRequest.create({ data: {
      tenantId: tenant, caseId, clientId: client, subjectType: 'OPERATION', subjectId: 'unverified-soft-reference',
      title: 'Recorded internal decision', channel: 'PORTAL', status: 'APPROVED', requestedById: 'historical-staff-reference',
      decision: null, createdAt: new Date('2026-01-01T10:00:00Z'),
      events: { create: [
        { eventType: 'CREATED', toStatus: 'DRAFT', byUserId: 'historical-staff-reference', createdAt: new Date('2026-01-01T10:00:00Z') },
        { eventType: 'APPROVED', fromStatus: 'SENT', toStatus: 'APPROVED', byUserId: null, note: '<b>recorded note</b>', createdAt: new Date('2026-01-02T10:00:00Z') },
      ] },
    } })).id;
    otherApproval = (await db.clientApprovalRequest.create({ data: { tenantId: tenant, caseId: otherCase, clientId: client, subjectType: 'OTHER', requestedById: outsider } })).id;
    const fc = await db.client.create({ data: { tenantId: foreignTenant, type: 'PERSON', name: 'Foreign secret Client' } });
    const fcase = await db.case.create({ data: { tenantId: foreignTenant, type: 'GENERAL_EXECUTION', fileNumber: randomUUID() } });
    await db.caseClient.create({ data: { caseId: fcase.id, clientId: fc.id } });
    foreignApproval = (await db.clientApprovalRequest.create({ data: { tenantId: foreignTenant, caseId: fcase.id, clientId: fc.id, subjectType: 'OTHER', requestedById: 'foreign-account' } })).id;
    dispatcher.dispatch.mockClear(); office.getOfficeIdentity.mockClear();
  });
  afterEach(async () => {
    for (const t of [tenant, foreignTenant]) {
      await db.clientApprovalRequest.deleteMany({ where: { tenantId: t } });
      await db.tenant.delete({ where: { id: t } });
    }
  });
  afterAll(async () => { await app?.close(); await db?.$disconnect(); });
  async function snapshot() {
    const where = { tenantId: { in: [tenant, foreignTenant] } };
    return {
      requests: await db.clientApprovalRequest.findMany({ where, orderBy: { id: 'asc' } }),
      events: await db.clientApprovalEvent.findMany({ where: { approvalRequest: where }, orderBy: { id: 'asc' } }),
      audits: await db.auditLog.findMany({ where, orderBy: { id: 'asc' } }),
      notifications: await db.clientNotification.findMany({ where, orderBy: { id: 'asc' } }),
    };
  }
  async function read(path: string, who = lawyer, status = 200) {
    const before = await snapshot();
    const result = await request(app.getHttpServer()).get(path).set('x-test-actor', who).expect(status);
    expect(await snapshot()).toEqual(before);
    expect(dispatcher.dispatch).not.toHaveBeenCalled(); expect(office.getOfficeIdentity).not.toHaveBeenCalled();
    return result.body;
  }

  it.each(['LAWYER', 'STAFF'] as const)('%s canonical relation reads list and ordered event detail without writes', async kind => {
    const who = kind === 'LAWYER' ? lawyer : staff;
    const rows = await read(`/client-approvals/case/${caseId}`, who);
    expect(rows.map((row: any) => row.id)).toEqual([approvalId]);
    const detail = await read(`/client-approvals/${approvalId}`, who);
    expect(detail.events.map((event: any) => event.eventType)).toEqual(['CREATED', 'APPROVED']);
    expect(detail.events.map((event: any) => event.byUserId)).toEqual(['historical-staff-reference', null]);
  });
  it.each(['UNLINKED_ADMIN_PARTNER', 'NO_PROFILE', 'INACTIVE_PROFILE', 'INACTIVE_ACCOUNT', 'VIEWER', 'FOREIGN', 'CANNOT_VIEW', 'LEGACY_ONLY'] as const)('%s cannot read list or detail', async kind => {
    let who = outsider; let expected = 404;
    if (kind === 'NO_PROFILE') who = await actor('NONE', 'ADMIN', false);
    if (kind === 'INACTIVE_PROFILE') { who = lawyer; await db.lawyer.updateMany({ where: { userId: who }, data: { isActive: false } }); }
    if (kind === 'INACTIVE_ACCOUNT') { who = lawyer; expected = 401; await db.user.update({ where: { id: who }, data: { isActive: false } }); }
    if (kind === 'VIEWER') { who = viewer; expected = 403; }
    if (kind === 'FOREIGN') who = await actor('NONE', 'ADMIN', false, foreignTenant);
    if (kind === 'CANNOT_VIEW') { who = staff; await db.caseStaff.updateMany({ where: { caseId }, data: { canView: false } }); }
    if (kind === 'LEGACY_ONLY') { who = lawyer; await db.caseClient.deleteMany({ where: { caseId } }); }
    await read(`/client-approvals/case/${caseId}`, who, expected);
    await read(`/client-approvals/${approvalId}`, who, expected);
  });
  it('resolves the actual stored case; caller query parent cannot borrow the accessible case relation', async () => {
    await read(`/client-approvals/${otherApproval}?caseId=${caseId}&clientId=${client}`, lawyer, 404);
    await read(`/client-approvals/case/${otherCase}`, lawyer, 404);
    await read(`/client-approvals/${foreignApproval}?tenantId=${tenant}`, lawyer, 404);
  });
  it('returns a successful empty list only for a legitimately related case with no ledger rows', async () => {
    await db.clientApprovalRequest.delete({ where: { id: approvalId } });
    expect(await read(`/client-approvals/case/${caseId}`)).toEqual([]);
  });
  it('preserves internal attribution, unknown decision and PORTAL label without authenticating an external client decision', async () => {
    const detail = await read(`/client-approvals/${approvalId}`);
    expect(detail).toMatchObject({ channel: 'PORTAL', status: 'APPROVED', decision: null, requestedById: 'historical-staff-reference', subjectId: 'unverified-soft-reference' });
    expect(detail.events[1]).toMatchObject({ byUserId: null, note: '<b>recorded note</b>' });
    expect(detail).not.toHaveProperty('externalClientPrincipal');
  });
  it('missing actor cannot bypass a direct service read', async () => {
    const before = await snapshot();
    await expect(service.listByCase(tenant, caseId)).rejects.toMatchObject({ status: 403 });
    await expect(service.findOne(tenant, approvalId)).rejects.toMatchObject({ status: 403 });
    expect(await snapshot()).toEqual(before);
  });
});
