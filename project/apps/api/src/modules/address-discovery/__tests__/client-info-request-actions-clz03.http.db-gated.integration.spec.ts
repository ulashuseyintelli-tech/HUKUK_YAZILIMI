import { Test } from '@nestjs/testing';
import { ForbiddenException, ValidationPipe, type INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request = require('supertest');
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CaseViewScopeGuard } from '../../case/case-view-scope.guard';
import { CaseViewScopeService } from '../../case/case-view-scope.service';
import { AddressDiscoveryController } from '../address-discovery.controller';
import { AddressDiscoveryService } from '../address-discovery.service';
import { ClientInfoRequestService } from '../client-info-request.service';
import { ConfidenceScoreService } from '../confidence-score.service';
import { CrossFileService } from '../cross-file.service';
import { UyapQueryService } from '../uyap-query.service';
import { InstitutionLetterService } from '../institution-letter.service';

const databaseUrl = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !databaseUrl) throw new Error('CLZ03_HTTP_TEST_DATABASE_REQUIRED');
const describeDb = databaseUrl ? describe : describe.skip;

// Real HTTP/controller/service/Prisma/AuditService and disposable PostgreSQL.
// Identity fixture resolves actual DB users; JWT cryptography and the separate P3
// case-view guard are not under test. The latter is bypassed so the new service's
// canonical object gate must reject unrelated actors without help from that guard.
// Existing OfficeApproval eligibility and the email transport are controlled fixtures.
describeDb('CL-Z03 existing info-request actions (HTTP + disposable DB)', () => {
  const prisma = new PrismaClient();
  const s = randomUUID().slice(0, 8), tenant = `clz03-t-${s}`, foreignTenant = `clz03-other-${s}`;
  const client = `clz03-c-${s}`, otherClient = `clz03-c2-${s}`, caseId = `clz03-case-${s}`, otherCase = `clz03-case2-${s}`;
  const admin = `clz03-admin-${s}`, ordinary = `clz03-user-${s}`, elevated = `clz03-elevated-${s}`;
  const viewer = `clz03-viewer-${s}`, outsider = `clz03-outsider-${s}`, foreign = `clz03-foreign-${s}`, inactive = `clz03-inactive-${s}`;
  let http: INestApplication;
  let failAudit = false, auditFailureHits = 0, providerCalls = 0;
  let barrierId: string | null = null, reads = 0, release = () => {};
  let barrier: Promise<void> = Promise.resolve();
  let providerResult: Record<string, unknown>;
  const db = prisma.$extends({ query: { clientInfoRequest: { async findFirst({ args, query }) {
    const row = await query(args);
    if (barrierId && args.where?.id === barrierId) { if (++reads === 2) release(); await barrier; }
    return row;
  } }, auditLog: { async create({ args, query }) {
    if (failAudit && args.data.action === 'CLIENT_INFO_REQUEST_STATUS') {
      auditFailureHits++;
      throw new Error('isolated CL-Z03 audit write fault');
    }
    return query(args);
  } } } });
  const email = { send: jest.fn(async () => { providerCalls++; return providerResult; }) };
  const approval = { isApproverEligible: jest.fn(async (id: string) => id === elevated) };
  const audit = new AuditService(db as unknown as PrismaService);
  const service = new ClientInfoRequestService(db as unknown as PrismaService, email as any, audit, approval as any, {} as any);

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.tenant.createMany({ data: [tenant, foreignTenant].map(id => ({ id, name: id, slug: id })) });
    for (const id of [client, otherClient]) await prisma.client.create({ data: { id, tenantId: tenant, type: 'PERSON', displayName: id } });
    for (const id of [caseId, otherCase]) await prisma.case.create({ data: { id, tenantId: tenant, fileNumber: id, type: 'GENERAL_EXECUTION' } });
    await prisma.caseClient.createMany({ data: [
      { caseId, clientId: client }, { caseId, clientId: otherClient }, { caseId: otherCase, clientId: client },
    ] });
    for (const id of [admin, ordinary, elevated, viewer, outsider, foreign, inactive]) {
      await prisma.user.create({ data: { id, tenantId: id === foreign ? foreignTenant : tenant,
        email: `${id}@example.test`, name: 'Fixture', surname: id, role: id === admin ? 'ADMIN' : id === viewer ? 'VIEWER' : 'USER', isActive: id !== inactive } });
      if (![viewer, foreign, inactive].includes(id)) {
        const lawyer = await prisma.lawyer.create({ data: { tenantId: tenant, userId: id, name: 'Fixture', surname: id,
          lawyerRank: id === elevated ? 'PARTNER' : 'LAWYER', isActive: true } });
        if (id !== outsider) await prisma.caseLawyer.create({ data: { caseId, lawyerId: lawyer.id } });
      }
    }
    const builder = Test.createTestingModule({ controllers: [AddressDiscoveryController], providers: [
      { provide: PrismaService, useValue: db }, { provide: ClientInfoRequestService, useValue: service },
      ...[AddressDiscoveryService, ConfidenceScoreService, CrossFileService, UyapQueryService, InstitutionLetterService, CaseViewScopeService]
        .map(provide => ({ provide, useValue: {} })),
    ] }).overrideGuard(JwtAuthGuard).useValue({ canActivate: async (context: any) => {
      const req = context.switchToHttp().getRequest(), id = req.headers['x-test-user'];
      const actor = typeof id === 'string' ? await prisma.user.findUnique({ where: { id } }) : null;
      if (!actor?.isActive) throw new ForbiddenException();
      req.user = actor; return true;
    } }).overrideGuard(CaseViewScopeGuard).useValue({ canActivate: () => true });
    http = (await builder.compile()).createNestApplication();
    http.useLogger(false);
    http.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    await http.init();
  });

  beforeEach(() => {
    failAudit = false; auditFailureHits = 0; providerCalls = 0;
    barrierId = null; reads = 0;
    providerResult = { success: true, messageId: 'isolated-provider-accepted', deliveryOutcome: 'ACCEPTED' };
    email.send.mockClear(); approval.isApproverEligible.mockClear();
  });

  afterEach(async () => {
    release(); barrierId = null;
    failAudit = false;
    await prisma.auditLog.deleteMany({ where: { tenantId: tenant } });
    await prisma.clientInfoRequest.deleteMany({ where: { tenantId: tenant } });
  });

  afterAll(async () => {
    await http?.close();
    await prisma.auditLog.deleteMany({ where: { tenantId: tenant } });
    await prisma.clientInfoRequest.deleteMany({ where: { tenantId: tenant } });
    await prisma.caseLawyer.deleteMany({ where: { caseId: { in: [caseId, otherCase] } } });
    await prisma.caseClient.deleteMany({ where: { caseId: { in: [caseId, otherCase] } } });
    await prisma.case.deleteMany({ where: { tenantId: tenant } });
    await prisma.client.deleteMany({ where: { tenantId: tenant } });
    await prisma.lawyer.deleteMany({ where: { tenantId: tenant } });
    await prisma.user.deleteMany({ where: { tenantId: { in: [tenant, foreignTenant] } } });
    await prisma.tenant.deleteMany({ where: { id: { in: [tenant, foreignTenant] } } });
    await prisma.$disconnect();
  });

  const seed = (fields: Record<string, any> = {}) => prisma.clientInfoRequest.create({ data: {
    tenantId: tenant, caseId, clientId: client, emailTo: 'synthetic@example.test',
    emailSubject: 'Synthetic request', emailBody: 'Synthetic request body', status: 'SENT', ...fields,
  } });
  const path = (id: string, action: string, targetClient = client, targetCase = caseId) =>
    `/address-discovery/client-info-request/${id}/${action}?clientId=${targetClient}&caseId=${targetCase}`;

  it.each(['respond', 'no-response'])('%s audit failure rolls back the actual status write', async action => {
    const row = await seed();
    failAudit = true;
    const response = await request(http.getHttpServer()).put(path(row.id, action)).set('x-test-user', admin).send({});
    expect(auditFailureHits).toBe(1); // Fault reached the actual DB audit create, not an earlier guard.
    expect(response.status).toBe(500);
    expect(await prisma.clientInfoRequest.findUnique({ where: { id: row.id } })).toEqual(row);
    expect(await prisma.auditLog.count({ where: { tenantId: tenant } })).toBe(0);
    expect(providerCalls).toBe(0);
  });

  it.each([
    ['ADMIN', admin, true], ['ordinary USER', ordinary, false], ['elevated USER', elevated, true],
  ])('%s receives the existing distinct action thresholds without another client leaking into its list', async (_label, actor, canSend) => {
    const row = await seed(); await seed({ clientId: otherClient });
    const result = await request(http.getHttpServer()).get(`/address-discovery/client-info-request/case/${caseId}?clientId=${client}`)
      .set('x-test-user', actor as string).expect(200);
    expect(result.body).toHaveLength(1);
    expect(result.body[0]).toMatchObject({ id: row.id, clientId: client, caseId,
      actions: { canSendReminder: canSend, canMarkResponded: true, canMarkNoResponse: true } });
    expect(JSON.stringify(result.body)).not.toContain(otherClient);
    expect(providerCalls).toBe(0); expect(await prisma.auditLog.count({ where: { tenantId: tenant } })).toBe(0);
  });

  it.each(['RESPONDED', 'NO_RESPONSE'])('%s has no new UI action even for ADMIN', async status => {
    await seed({ status });
    await request(http.getHttpServer()).get(`/address-discovery/client-info-request/case/${caseId}?clientId=${client}`)
      .set('x-test-user', admin).expect(200).expect(r => expect(r.body[0].actions)
        .toEqual({ canSendReminder: false, canMarkResponded: false, canMarkNoResponse: false }));
  });

  it.each(['respond', 'no-response'])('ordinary USER may %s without acquiring send authority; audit records the actual actor', async action => {
    const row = await seed();
    const result = await request(http.getHttpServer()).put(path(row.id, action)).set('x-test-user', ordinary)
      .send({ notes: 'Synthetic private response note', actorUserId: admin, tenantId: foreignTenant, role: 'ADMIN' }).expect(200);
    expect(result.body.status).toBe(action === 'respond' ? 'RESPONDED' : 'NO_RESPONSE');
    const audits = await prisma.auditLog.findMany({ where: { tenantId: tenant, action: 'CLIENT_INFO_REQUEST_STATUS' } });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ userId: ordinary, actorType: 'USER', entityId: client });
    expect(audits[0].metadata).toMatchObject({ requestId: row.id, actorRole: 'USER', status: result.body.status });
    expect(JSON.stringify(audits)).not.toContain('Synthetic private response note');
    expect(providerCalls).toBe(0);
  });

  it.each([['ADMIN', admin], ['elevated USER', elevated]])('%s may send one explicit reminder to the existing recipient', async (_label, actor) => {
    const row = await seed();
    await request(http.getHttpServer()).post(path(row.id, 'reminder')).set('x-test-user', actor)
      .expect(201).expect(r => expect(r.body).toMatchObject({ id: row.id, status: 'SENT', reminderCount: 1, emailSent: true }));
    expect(providerCalls).toBe(1);
    expect(email.send).toHaveBeenCalledWith(expect.objectContaining({ to: row.emailTo }));
    expect((await prisma.clientInfoRequest.findUniqueOrThrow({ where: { id: row.id } })).respondedAt).toBeNull();
    const audits = await prisma.auditLog.findMany({ where: { tenantId: tenant, action: 'CLIENT_WORKSPACE_COMMAND' } });
    expect(audits).toHaveLength(1); expect(audits[0].userId).toBe(actor);
    expect(JSON.stringify(audits[0].metadata)).not.toContain(row.emailTo);
  });

  it('ordinary USER cannot become a sender through a forged body', async () => {
    const row = await seed();
    await request(http.getHttpServer()).post(path(row.id, 'reminder')).set('x-test-user', ordinary)
      .send({ role: 'ADMIN', userId: admin, actor: 'SYSTEM' }).expect(403);
    expect(await prisma.clientInfoRequest.findUnique({ where: { id: row.id } })).toEqual(row);
    expect(providerCalls).toBe(0); expect(await prisma.auditLog.count({ where: { tenantId: tenant } })).toBe(0);
  });

  it.each([
    ['VIEWER', viewer, 403], ['unrelated actor', outsider, 404], ['other tenant', foreign, 404],
    ['inactive actor', inactive, 403], ['no identity', '', 403],
  ])('%s cannot execute any new workspace action', async (_label, actor, code) => {
    const row = await seed();
    for (const action of ['respond', 'no-response', 'reminder']) {
      const command = action === 'reminder' ? request(http.getHttpServer()).post(path(row.id, action)) : request(http.getHttpServer()).put(path(row.id, action));
      if (actor) command.set('x-test-user', actor as string);
      await command.send({}).expect(code as number);
      expect(await prisma.clientInfoRequest.findUnique({ where: { id: row.id } })).toEqual(row);
    }
    expect(providerCalls).toBe(0); expect(await prisma.auditLog.count({ where: { tenantId: tenant } })).toBe(0);
  });

  it.each([['wrong client', otherClient, caseId], ['wrong case', client, otherCase]])('%s is rejected using the actual stored parent', async (_label, c, k) => {
    const row = await seed();
    for (const action of ['respond', 'no-response', 'reminder']) {
      const route = path(row.id, action, c, k);
      const command = action === 'reminder' ? request(http.getHttpServer()).post(route) : request(http.getHttpServer()).put(route);
      await command.set('x-test-user', admin).send({}).expect(404);
    }
    expect(await prisma.clientInfoRequest.findUnique({ where: { id: row.id } })).toEqual(row);
    expect(providerCalls).toBe(0); expect(await prisma.auditLog.count({ where: { tenantId: tenant } })).toBe(0);
  });

  it('missing, partial and repeated parent selectors fail closed without a send or status write', async () => {
    const row = await seed();
    await request(http.getHttpServer()).put(`/address-discovery/client-info-request/${row.id}/respond?clientId=${client}`).set('x-test-user', admin).send({}).expect(400);
    // ValidationPipe converts repeated scalar selectors to a string; it cannot
    // match the stored parent and must fail closed at the canonical parent gate.
    await request(http.getHttpServer()).put(path(row.id, 'respond') + `&clientId=${otherClient}`).set('x-test-user', admin).send({}).expect(404);
    await request(http.getHttpServer()).post(path('missing-request', 'reminder')).set('x-test-user', admin).expect(404);
    expect(await prisma.clientInfoRequest.findUnique({ where: { id: row.id } })).toEqual(row);
    expect(providerCalls).toBe(0); expect(await prisma.auditLog.count({ where: { tenantId: tenant } })).toBe(0);
  });

  it.each(['REJECTED', 'UNKNOWN'])('reminder %s does not increment count, write success audit or automatically resend', async outcome => {
    const row = await seed(); providerResult = { success: false, deliveryOutcome: outcome, errorMessage: 'private provider detail' };
    const response = await request(http.getHttpServer()).post(path(row.id, 'reminder')).set('x-test-user', admin).expect(503);
    expect(response.body.reasonCode).toBe(outcome === 'REJECTED' ? 'CLIENT_INFO_REQUEST_EMAIL_FAILED' : 'CLIENT_INFO_REQUEST_EMAIL_INDETERMINATE');
    expect(JSON.stringify(response.body)).not.toContain('private provider detail');
    expect(await prisma.clientInfoRequest.findUnique({ where: { id: row.id } })).toEqual(row);
    expect(providerCalls).toBe(1); expect(await prisma.auditLog.count({ where: { tenantId: tenant } })).toBe(0);
  });

  it('a role revoked after reading capabilities is rejected at the HTTP mutation gate', async () => {
    const row = await seed();
    await request(http.getHttpServer()).get(`/address-discovery/client-info-request/case/${caseId}?clientId=${client}`).set('x-test-user', admin).expect(200);
    await prisma.user.update({ where: { id: admin }, data: { role: 'VIEWER' } });
    try { await request(http.getHttpServer()).put(path(row.id, 'respond')).set('x-test-user', admin).send({}).expect(403); }
    finally { await prisma.user.update({ where: { id: admin }, data: { role: 'ADMIN' } }); }
    expect(await prisma.clientInfoRequest.findUnique({ where: { id: row.id } })).toEqual(row);
    expect(providerCalls).toBe(0); expect(await prisma.auditLog.count({ where: { tenantId: tenant } })).toBe(0);
  });

  it('two deliberately interleaved status commands cannot overwrite the winning transition', async () => {
    const row = await seed(); barrierId = row.id; barrier = new Promise<void>(resolve => { release = resolve; });
    const outcomes = await Promise.all([
      request(http.getHttpServer()).put(path(row.id, 'respond')).set('x-test-user', admin).send({}),
      request(http.getHttpServer()).put(path(row.id, 'no-response')).set('x-test-user', ordinary).send({}),
    ]);
    expect(reads).toBe(2); expect(outcomes.map(r => r.status).sort()).toEqual([200, 409]);
    const winner = outcomes[0].status === 200 ? { status: 'RESPONDED', userId: admin } : { status: 'NO_RESPONSE', userId: ordinary };
    expect((await prisma.clientInfoRequest.findUniqueOrThrow({ where: { id: row.id } })).status).toBe(winner.status);
    const audits = await prisma.auditLog.findMany({ where: { tenantId: tenant, action: 'CLIENT_INFO_REQUEST_STATUS' } });
    expect(audits).toHaveLength(1); expect(audits[0].userId).toBe(winner.userId);
    expect(providerCalls).toBe(0);
  });
});
