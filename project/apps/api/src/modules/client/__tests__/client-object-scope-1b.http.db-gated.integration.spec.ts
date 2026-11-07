jest.mock('pdf-poppler', () => ({ convert: async () => { throw new Error('No renderer in 1b acceptance'); } }));
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuthGuard } from '@nestjs/passport';
import * as http from 'supertest';
import { PrismaService } from '../../../prisma/prisma.service';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { OfficeF01AuthorizationGuard } from '../../office-approval/office-f01-authorization.guard';
import { OfficeApprovalService } from '../../office-approval/office-approval.service';
import { AuditService } from '../../audit/audit.service';
import { ClientController } from '../client.controller';
import { ClientService } from '../client.service';
import { ClientAddressController } from '../client-address.controller';
import { ClientAddressService } from '../client-address.service';
import { ClientConsentController } from '../client-consent.controller';
import { ClientConsentService } from '../client-consent.service';
import { ClientKvkkRightsController } from '../client-kvkk-rights.controller';
import { ClientDisclosureService } from '../client-disclosure.service';
import { ClientDataSubjectRequestService } from '../client-data-subject-request.service';
import { ClientLegalHoldController } from '../client-legal-hold.controller';
import { ClientLegalHoldService } from '../client-legal-hold.service';
import { ClientSpecialCategoryController } from '../client-special-category.controller';
import { ClientSpecialCategoryService } from '../client-special-category.service';
import { ClientPoaCapabilityController } from '../client-poa-capability.controller';
import { ClientPoaCapabilityService } from '../client-poa-capability.service';
import { PoaController } from '../../poa/poa.controller';
import { PoaService } from '../../poa/poa.service';
import { ClientApprovalController } from '../../client-approval/client-approval.controller';
import { ClientApprovalService } from '../../client-approval/client-approval.service';
import { ClientIntakeLinkController } from '../../client-intake-link/client-intake-link.controller';
import { ClientIntakeLinkService } from '../../client-intake-link/client-intake-link.service';
import { ClientNotificationController } from '../../client-notification/client-notification.controller';
import { ClientNotificationService } from '../../client-notification/client-notification.service';
import { ClientNotificationAuthorityAdapter } from '../../client-notification/client-notification-authority.adapter';
import { ClientNotificationHistoryAccessService } from '../../client-notification/client-notification-history-access.service';
import { NotificationDispatchController } from '../../client-notification/notification-dispatch.controller';
import { NotificationDispatcherService } from '../../client-notification/notification-dispatcher.service';
import { assertClientObjectScope } from '../client-object-scope';

const url = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !url) throw new Error('1b acceptance requires disposable TEST_DATABASE_URL; integration SKIP is not acceptance');
const dbDescribe = url ? describe : describe.skip;

dbDescribe('1b canonical Client object boundary — real Nest HTTP and PostgreSQL', () => {
  jest.setTimeout(90_000);
  let db: PrismaService; let app: INestApplication; let audit: AuditService; let core: ClientService;
  let poa: PoaService; let notifications: ClientNotificationService; let dispatcher: NotificationDispatcherService;
  let tenant: string; let foreignTenant: string; let clientId: string; let otherId: string; let caseId: string; let otherCase: string;
  let admin: string; let staffUser: string; let partner: string; let viewer: string; let outsider: string;
  let addressId: string; let otherAddress: string; let poaId: string; let otherPoa: string; let holdId: string; let dsarId: string; let approvalId: string; let linkId: string;
  const storage = { assertContained: jest.fn(() => { throw new Error('No file access allowed in rejected request'); }) };
  const office = {};
  const factory = <T>(provide: new (...args: any[]) => T, build: () => T) => ({ provide, useFactory: build });

  beforeAll(async () => {
    db = new PrismaService({ datasources: { db: { url } } }); await db.$connect();
    audit = new AuditService(db);
    const approval = new OfficeApprovalService(db, audit);
    notifications = new ClientNotificationService(db, office as any);
    dispatcher = new NotificationDispatcherService(db, notifications, {} as any);
    core = new ClientService(db, audit, approval, undefined, dispatcher);
    poa = new PoaService(db, audit, approval, storage as any);
    const providers = [
      { provide: AuditService, useValue: audit }, { provide: OfficeApprovalService, useValue: approval },
      { provide: ClientService, useValue: core }, { provide: PoaService, useValue: poa },
      { provide: ClientNotificationService, useValue: notifications }, { provide: NotificationDispatcherService, useValue: dispatcher },
      factory(ClientAddressService, () => new ClientAddressService(db, audit, approval)),
      factory(ClientConsentService, () => new ClientConsentService(db, audit)),
      factory(ClientDisclosureService, () => new ClientDisclosureService(db, audit, approval)),
      factory(ClientDataSubjectRequestService, () => new ClientDataSubjectRequestService(db, audit, approval)),
      factory(ClientLegalHoldService, () => new ClientLegalHoldService(db, audit, approval)),
      factory(ClientSpecialCategoryService, () => new ClientSpecialCategoryService(db, audit, approval)),
      factory(ClientPoaCapabilityService, () => new ClientPoaCapabilityService(db, audit)),
      factory(ClientApprovalService, () => new ClientApprovalService(db, dispatcher, office as any)),
      factory(ClientIntakeLinkService, () => new ClientIntakeLinkService(db, dispatcher, office as any, audit)),
      factory(ClientNotificationAuthorityAdapter, () => new ClientNotificationAuthorityAdapter(approval, audit)),
      { provide: ClientNotificationHistoryAccessService, useValue: {} },
    ];
    const auth = { async canActivate(ctx: any) {
      const req = ctx.switchToHttp().getRequest();
      const actor = await db.user.findUnique({ where: { id: String(req.headers['x-test-user-id']) } });
      if (!actor) throw new UnauthorizedException();
      req.user = actor; return true; // Test identity seam only; actor/profile/object checks use the real DB.
    } };
    const module = await Test.createTestingModule({ controllers: [
      ClientKvkkRightsController, ClientLegalHoldController, ClientSpecialCategoryController, ClientPoaCapabilityController,
      ClientAddressController, ClientConsentController, ClientController, PoaController, ClientApprovalController,
      ClientIntakeLinkController, ClientNotificationController, NotificationDispatchController,
    ], providers }).overrideGuard(JwtAuthGuard).useValue(auth).overrideGuard(AuthGuard('jwt')).useValue(auth)
      .overrideGuard(OfficeF01AuthorizationGuard).useValue({ canActivate: () => { throw new Error('Template policy is outside 1b'); } }).compile();
    app = module.createNestApplication(); app.useLogger(false); await app.init(); await app.listen(0, '127.0.0.1');
  });

  async function actor(kind: 'lawyer' | 'staff' | 'none', role: 'ADMIN' | 'USER' | 'VIEWER', assigned: boolean, t = tenant, rank: 'LAWYER' | 'PARTNER' = 'LAWYER') {
    const u = await db.user.create({ data: { tenantId: t, role, email: `${randomUUID()}@example.test`, name: 'Synthetic', surname: '1b actor' } });
    if (kind === 'lawyer') {
      const l = await db.lawyer.create({ data: { tenantId: t, userId: u.id, name: 'Synthetic', surname: 'Lawyer', lawyerRank: rank } });
      if (assigned) await db.caseLawyer.create({ data: { caseId, lawyerId: l.id } });
    }
    if (kind === 'staff') {
      const s = await db.staffMember.create({ data: { tenantId: t, userId: u.id, firstName: 'Synthetic', lastName: 'Staff', staffType: 'SEKRETER' } });
      if (assigned) await db.caseStaff.create({ data: { caseId, staffMemberId: s.id, roleOnCase: 'SEKRETER', canView: true } });
    }
    return u.id;
  }
  beforeEach(async () => {
    tenant = `scope-1b-test-${randomUUID()}`; foreignTenant = `scope-1b-foreign-test-${randomUUID()}`;
    for (const id of [tenant, foreignTenant]) await db.tenant.create({ data: { id, slug: id, name: 'Synthetic 1b acceptance' } });
    clientId = (await db.client.create({ data: { tenantId: tenant, type: 'PERSON', name: 'Allowed Client', firstName: 'Allowed', lastName: 'Client', tckn: '10000000146', phone: '5551112233' } })).id;
    otherId = (await db.client.create({ data: { tenantId: tenant, type: 'PERSON', name: 'Other secret client', firstName: 'Other', lastName: 'Secret', tckn: '20000000046' } })).id;
    caseId = (await db.case.create({ data: { tenantId: tenant, clientId, type: 'GENERAL_EXECUTION', fileNumber: randomUUID() } })).id;
    otherCase = (await db.case.create({ data: { tenantId: tenant, clientId: otherId, type: 'GENERAL_EXECUTION', fileNumber: randomUUID() } })).id;
    await db.caseClient.createMany({ data: [{ caseId, clientId }, { caseId: otherCase, clientId: otherId }] });
    admin = await actor('lawyer', 'ADMIN', true); staffUser = await actor('staff', 'USER', true);
    partner = await actor('lawyer', 'USER', true, tenant, 'PARTNER'); viewer = await actor('lawyer', 'VIEWER', true);
    outsider = await actor('lawyer', 'ADMIN', false, tenant, 'PARTNER');
    addressId = (await db.clientAddress.create({ data: { clientId, street: 'Allowed street', city: 'Test', isPrimary: false } })).id;
    otherAddress = (await db.clientAddress.create({ data: { clientId: otherId, street: 'Other street', city: 'Test', isPrimary: false } })).id;
    await db.clientAddress.createMany({ data: [clientId, otherId].map(id => ({ clientId: id, street: 'Existing primary', city: 'Test', isPrimary: true })) });
    poaId = (await db.clientPowerOfAttorney.create({ data: { tenantId: tenant, clientId, notaryName: 'Test notary', dateIssued: new Date(), status: 'ACTIVE', isActive: true } })).id;
    otherPoa = (await db.clientPowerOfAttorney.create({ data: { tenantId: tenant, clientId: otherId, notaryName: 'Other notary', dateIssued: new Date(), status: 'ACTIVE', isActive: true, filePath: 'unread-test-file.pdf' } })).id;
    holdId = (await db.clientLegalHold.create({ data: { tenantId: tenant, clientId: otherId, scopeType: 'CLIENT', status: 'ACTIVE', reason: 'Test preservation', placedByUserId: outsider, placedAt: new Date() } })).id;
    dsarId = (await db.clientDataSubjectRequest.create({ data: { tenantId: tenant, clientId: otherId, type: 'INFORMATION', channel: 'WRITTEN', receivedAt: new Date(), dueAt: new Date(), createdByUserId: outsider } })).id;
    approvalId = (await db.clientApprovalRequest.create({ data: { tenantId: tenant, clientId: otherId, caseId: otherCase, subjectType: 'OPERATION', status: 'DRAFT', requestedById: outsider } })).id;
    linkId = (await db.clientIntakeLink.create({ data: { tenantId: tenant, clientId: otherId, caseId: otherCase, tokenHash: randomUUID(), status: 'ACTIVE', expiresAt: new Date(Date.now() + 3_600_000), createdById: outsider } })).id;
    storage.assertContained.mockClear();
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    // Only this test's synthetic tenants; the surrounding PostgreSQL itself is disposable.
    await db.clientApprovalRequest.deleteMany({ where: { tenantId: tenant } });
    await db.clientIntakeLinkDelivery.deleteMany({ where: { tenantId: tenant } });
    await db.clientIntakeLink.deleteMany({ where: { tenantId: tenant } });
    await db.clientLegalHold.deleteMany({ where: { tenantId: tenant } });
    await db.clientSpecialCategoryRecord.deleteMany({ where: { tenantId: tenant } });
    await db.clientPowerOfAttorney.deleteMany({ where: { tenantId: tenant } });
    for (const id of [tenant, foreignTenant]) await db.tenant.delete({ where: { id } });
  });
  afterAll(async () => { await app?.close(); await db?.$disconnect(); });
  const req = (method: 'get' | 'post' | 'put' | 'delete', path: string, who = admin, body?: object) => {
    const r = http(app.getHttpServer())[method](path).set('x-test-user-id', who);
    return body === undefined ? r : r.send(body);
  };
  const update = (body: object, who = admin, id = clientId) => req('put', `/clients/${id}`, who, body);
  async function snapshot() {
    const where = { tenantId: tenant }; const child = { client: { tenantId: tenant } };
    const models: [string, any][] = [
      ['client', where], ['clientContact', child], ['clientAddress', child], ['clientPowerOfAttorney', where],
      ['clientConsent', where], ['clientDisclosureDelivery', where], ['clientDataSubjectRequest', where], ['clientLegalHold', where],
      ['clientSpecialCategoryRecord', where], ['clientApprovalRequest', where], ['clientIntakeLink', where], ['clientIntakeLinkDelivery', where],
      ['clientNotification', where], ['auditLog', where], ['task', where],
    ];
    return Object.fromEntries(await Promise.all(models.map(async ([name, filter]) => [name, await (db as any)[name].findMany({ where: filter, orderBy: { id: 'asc' } })])));
  }

  it.each(['STAFF', 'LAWYER'] as const)('%s relationship allows an existing standard update, with atomic audit', async kind => {
    await update({ phone: '5559998877' }, kind === 'STAFF' ? staffUser : admin).expect(200);
    expect((await db.client.findUniqueOrThrow({ where: { id: clientId } })).phone).toBe('5559998877');
    expect(await db.auditLog.count({ where: { tenantId: tenant, action: 'CLIENT_UPDATE' } })).toBe(1);
  });
  it.each(['ADMIN_NO_LINK', 'NO_PROFILE', 'INACTIVE_PROFILE', 'INACTIVE_ACCOUNT', 'VIEWER', 'FOREIGN', 'CANNOT_VIEW', 'LEGACY_ONLY'] as const)('%s cannot mutate; all observed records stay unchanged', async kind => {
    let who = outsider;
    if (kind === 'NO_PROFILE') who = await actor('none', 'ADMIN', false);
    if (kind === 'INACTIVE_PROFILE') { who = admin; await db.lawyer.updateMany({ where: { userId: who }, data: { isActive: false } }); }
    if (kind === 'INACTIVE_ACCOUNT') { who = admin; await db.user.update({ where: { id: who }, data: { isActive: false } }); }
    if (kind === 'VIEWER') who = viewer;
    if (kind === 'FOREIGN') who = await actor('none', 'ADMIN', false, foreignTenant);
    if (kind === 'CANNOT_VIEW') { who = staffUser; await db.caseStaff.updateMany({ where: { caseId }, data: { canView: false } }); }
    if (kind === 'LEGACY_ONLY') { who = admin; await db.caseClient.deleteMany({ where: { caseId, clientId } }); }
    const before = await snapshot(); const res = await update({ phone: 'rejected' }, who);
    expect([403, 404]).toContain(res.status); expect(await snapshot()).toEqual(before);
  });
  it('missing direct service actor cannot bypass scope or write', async () => {
    const before = await snapshot();
    await expect(core.update(clientId, tenant, { phone: 'no actor' }, undefined as any)).rejects.toBeDefined();
    await expect(assertClientObjectScope(db, tenant, undefined, clientId)).rejects.toMatchObject({ status: 403 });
    expect(await snapshot()).toEqual(before);
  });
  it('missing target Client cannot become an unfiltered Prisma lookup', async () => {
    const before = await snapshot();
    await expect(assertClientObjectScope(db, tenant, admin, undefined as any)).rejects.toMatchObject({ status: 404 });
    expect(await snapshot()).toEqual(before);
  });
  it.each(['ACTOR', 'TENANT', 'CASE'] as const)('%s identity cannot be a Prisma operator object', async kind => {
    const operator = { not: '' } as any; const before = await snapshot();
    await expect(assertClientObjectScope(db, kind === 'TENANT' ? operator : tenant,
      kind === 'ACTOR' ? operator : admin, clientId, kind === 'CASE' ? operator : undefined))
      .rejects.toMatchObject({ status: kind === 'CASE' ? 404 : 403 });
    expect(await snapshot()).toEqual(before);
  });
  it('object relation does not grant sensitive update or lifecycle authority to ordinary Staff/ADMIN', async () => {
    const before = await snapshot();
    await update({ firstName: 'Denied identity' }, staffUser).expect(403);
    await update({ isActive: false }, admin).expect(403);
    expect(await snapshot()).toEqual(before);
  });
  it('keeps same-value lifecycle no-op, actual deactivation and authorized reactivation distinct', async () => {
    const before = await db.client.findUniqueOrThrow({ where: { id: clientId } });
    await update({ isActive: true }, staffUser).expect(200);
    expect(await db.client.findUniqueOrThrow({ where: { id: clientId } })).toEqual(before);
    await update({ isActive: false }, partner).expect(200);
    expect((await db.client.findUniqueOrThrow({ where: { id: clientId } })).isActive).toBe(false);
    await update({ isActive: true }, partner).expect(200);
    expect((await db.client.findUniqueOrThrow({ where: { id: clientId } })).isActive).toBe(true);
  });
  it('update duplicate outside scope exposes neither the other id nor name', async () => {
    const before = await snapshot(); const res = await update({ tckn: '20000000046' }).expect(409);
    expect(res.body.code).toBe('DUPLICATE_IDENTITY'); expect(res.body).not.toHaveProperty('existingClient');
    expect(JSON.stringify(res.body)).not.toContain(otherId); expect(JSON.stringify(res.body)).not.toContain('Other secret client');
    expect(await snapshot()).toEqual(before);
  });
  it('update duplicate in scope retains its existing minimal id/name contract', async () => {
    const l = await db.lawyer.findFirstOrThrow({ where: { userId: admin } });
    await db.caseLawyer.create({ data: { caseId: otherCase, lawyerId: l.id } });
    const res = await update({ tckn: '20000000046' }).expect(409);
    expect(res.body.existingClient).toEqual({ id: otherId, name: 'Other secret client' });
  });
  it('keeps fresh Client creation allowed without an existing CaseClient and does not reactivate through create', async () => {
    const newUser = await actor('none', 'USER', false);
    const created = await req('post', '/clients', newUser, { type: 'PERSON', firstName: 'New', lastName: 'Client' }).expect(201);
    expect(created.body.data.id).toBeTruthy();
    await req('get', `/clients/${created.body.data.id}`, newUser).expect(404);
    const before = await snapshot();
    await req('post', '/clients', newUser, { type: 'PERSON', tckn: '20000000046', firstName: 'Other', lastName: 'Client' }).expect(409);
    expect(await snapshot()).toEqual(before);
  });
  it('audit insertion followed by error rolls back Client/contact/address changes and audit together', async () => {
    const before = await snapshot(); const original = audit.logInTransaction.bind(audit);
    jest.spyOn(audit, 'logInTransaction').mockImplementation(async (tx, input) => { await original(tx, input); throw new Error('1b post-audit fault'); });
    await update({ phone: 'rollback', phones: [{ type: 'MOBILE', value: '5559998877' }] }).expect(500);
    expect(await snapshot()).toEqual(before);
  });
  it('rechecks relation inside the actual transaction after the preflight relation is removed', async () => {
    const original = db.$transaction.bind(db); const before = await snapshot();
    jest.spyOn(db, '$transaction').mockImplementationOnce((async (callback: any, ...rest: any[]) => {
      await db.caseLawyer.deleteMany({ where: { caseId, lawyer: { userId: admin } } });
      return original(callback, ...rest);
    }) as any);
    await update({ phone: 'stale authority' }).expect(404);
    expect(await snapshot()).toEqual(before);
  });
  it.each(['NO_OP', 'CONTACTS_ONLY'] as const)('%s rejects scope loss before zero-write fallback', async kind => {
    const original = db.$transaction.bind(db); const before = await snapshot(); let reached = false;
    jest.spyOn(db, '$transaction').mockImplementationOnce((async (callback: any, ...rest: any[]) => original(async tx => {
      const client = new Proxy(tx.client, { get(target, property, receiver) {
        if (property !== 'updateMany') return Reflect.get(target, property, receiver);
        return async (args: any) => {
          reached = true;
          await db.caseLawyer.deleteMany({ where: { caseId, lawyer: { userId: admin } } });
          const result = await target.updateMany(args);
          expect(result.count).toBe(0); // Reach the real Prisma empty-data fallback, not an earlier rejection.
          return result;
        };
      } });
      return callback(new Proxy(tx, { get(target, property, receiver) {
        return property === 'client' ? client : Reflect.get(target, property, receiver);
      } }));
    }, ...rest)) as any);
    await update(kind === 'NO_OP' ? { isActive: true } : { phones: [{ type: 'MOBILE', value: '5558887799' }] }).expect(404);
    expect(reached).toBe(true); expect(await snapshot()).toEqual(before);
  });
  it.each(['timeline', 'action-catalog', 'operating-snapshot', 'addresses', 'consents', 'disclosure-deliveries', 'effective-capabilities'] as const)('%s cannot bypass root Client scope', async sub => {
    const before = await snapshot(); await req('get', `/clients/${otherId}/${sub}`).expect(404); expect(await snapshot()).toEqual(before);
  });
  it('validates nested address parent and preserves address standard/elevated boundaries', async () => {
    const before = await snapshot();
    await req('put', `/clients/${clientId}/addresses/${otherAddress}`, admin, { street: 'wrong parent' }).expect(404);
    expect(await snapshot()).toEqual(before);
    await req('put', `/clients/${clientId}/addresses/${addressId}`, staffUser, { street: 'Allowed update' }).expect(200);
    await req('post', `/clients/${clientId}/addresses/${addressId}/archive`, staffUser, {}).expect(403);
  });
  it.each(['POA', 'HOLD', 'DSAR', 'APPROVAL', 'LINK'] as const)('%s record-only endpoint resolves its real parent and denies cross-object write', async kind => {
    const before = await snapshot();
    if (kind === 'POA') await req('put', `/poa/${otherPoa}`, admin, { notaryName: 'denied' }).expect(404);
    if (kind === 'HOLD') await req('post', `/clients/legal-holds/${holdId}/request-release`, admin, { releaseReason: 'denied' }).expect(404);
    if (kind === 'DSAR') await req('post', `/clients/data-subject-requests/${dsarId}/start-review`, admin, {}).expect(404);
    if (kind === 'APPROVAL') await req('post', `/client-approvals/${approvalId}/send`, admin, {}).expect(404);
    if (kind === 'LINK') await req('post', `/client-intake-links/${linkId}/revoke`, admin, {}).expect(404);
    expect(await snapshot()).toEqual(before);
  });
  it('POA download denies before storage access and raw internal validity read remains separate', async () => {
    await req('get', `/poa/${otherPoa}/download`).expect(404); expect(storage.assertContained).not.toHaveBeenCalled();
    expect((await poa.findOne(otherPoa, tenant)).clientId).toBe(otherId);
  });
  it('particular-case actions require the relation in that exact case, not another linked case', async () => {
    await db.caseClient.create({ data: { caseId: otherCase, clientId } });
    const before = await snapshot();
    await req('post', `/client-approvals/case/${otherCase}`, admin, { clientId, subjectType: 'OPERATION' }).expect(404);
    await req('post', `/client-intake-links/case/${otherCase}`, admin, { clientId }).expect(404);
    await req('post', `/clients/${clientId}/template-notifications/send`, admin, { caseId: otherCase, templateCode: 'DOSYA_DURUMU' }).expect(404);
    await req('post', `/clients/${clientId}/document-requests/send`, admin, { caseId: otherCase, documentCodes: ['GENEL_BELGE'] }).expect(404);
    expect(await snapshot()).toEqual(before);
  });
  it('direct workspace notification services reject missing or unrelated actor before dispatch or idempotency writes', async () => {
    const send = jest.spyOn(dispatcher, 'dispatch'); const before = await snapshot();
    await expect(core.sendPoaReminder(otherId, tenant, admin)).rejects.toMatchObject({ status: 404 });
    await expect(core.sendTemplateNotification(otherId, tenant, admin, '1b', { templateCode: 'DOSYA_DURUMU' } as any)).rejects.toMatchObject({ status: 404 });
    await expect(core.sendDocumentRequest(otherId, tenant, admin, '1b', { documentCodes: ['GENEL_BELGE'] } as any)).rejects.toMatchObject({ status: 404 });
    await expect(core.sendPoaReminder(clientId, tenant)).rejects.toMatchObject({ status: 403 });
    expect(send).not.toHaveBeenCalled(); expect(await snapshot()).toEqual(before);
  });
  it('retains optional null case semantics without weakening canonical Client scope', async () => {
    const send = jest.spyOn(dispatcher, 'dispatch').mockResolvedValue({ status: 'sent' } as any);
    await req('post', `/clients/${clientId}/template-notifications/send`, admin, { templateCode: 'DOSYA_DURUMU', caseId: null })
      .set('idempotency-key', '1b-null-case').expect(201);
    expect(send).toHaveBeenCalledWith(tenant, admin, expect.objectContaining({ clientId, caseId: undefined }));
    await req('post', `/clients/${clientId}/legal-holds`, admin, { scopeType: 'CLIENT', caseId: null, reason: 'Synthetic optional case' }).expect(201);
    const calls = send.mock.calls.length;
    await req('post', `/clients/${otherId}/template-notifications/send`, admin, { templateCode: 'DOSYA_DURUMU', caseId: null })
      .set('idempotency-key', '1b-null-other').expect(404);
    expect(send).toHaveBeenCalledTimes(calls);
  });
  it('manual contact backfill retains elevated authority and only scans canonical in-scope Clients', async () => {
    const sync = jest.spyOn(core as any, 'syncContactFollowUpTaskSafe').mockResolvedValue(true);
    const result = await core.backfillContactFollowUp(tenant, { tenantId: tenant, userId: partner, role: 'USER' });
    expect(result.scanned).toBe(1); expect(sync).toHaveBeenCalledTimes(1);
    expect(sync.mock.calls[0][1]).toMatchObject({ id: clientId });
    expect(await db.auditLog.count({ where: { tenantId: tenant, entityId: otherId } })).toBe(0);
    await expect(core.backfillContactFollowUp(tenant, { tenantId: tenant, userId: staffUser, role: 'USER' })).rejects.toMatchObject({ status: 403 });
  });
  it('out-of-scope sends/resend/bulk stop before transport, filesystem or success audit', async () => {
    const email = jest.spyOn(notifications, 'sendEmail'); const sms = jest.spyOn(notifications, 'sendSms');
    const bulk = jest.spyOn(notifications, 'sendBulkEmail'); const resend = jest.spyOn(dispatcher, 'resend');
    const before = await snapshot();
    await expect(notifications.sendEmailForActor(tenant, admin, { clientId: otherId, subject: 'test', body: 'test' } as any)).rejects.toMatchObject({ status: 404 });
    await expect(notifications.sendSmsForActor(tenant, admin, { clientId: otherId, message: 'test' } as any)).rejects.toMatchObject({ status: 404 });
    await expect(notifications.sendBulkEmailForActor(tenant, admin, { recipients: [clientId, otherId], subject: 'test', message: 'test', type: 'clients' })).rejects.toMatchObject({ status: 404 });
    await expect(dispatcher.resendForActor(tenant, admin, { clientId: otherId, templateCode: 'TEST', type: 'TEST', refType: 'TEST', refId: 'TEST', tokens: {} })).rejects.toMatchObject({ status: 404 });
    expect(email).not.toHaveBeenCalled(); expect(sms).not.toHaveBeenCalled(); expect(bulk).not.toHaveBeenCalled(); expect(resend).not.toHaveBeenCalled();
    expect(await snapshot()).toEqual(before);
  });
  it('retains scoped consent grant/revoke and rolls back a child grant after audit failure', async () => {
    const path = `/clients/${clientId}/consents`; const body = { activity: 'GREETING_AND_OPTIONAL_COMMUNICATION' };
    const before = await snapshot(); const original = audit.logInTransaction.bind(audit);
    const fault = jest.spyOn(audit, 'logInTransaction').mockImplementation(async (tx, input) => { await original(tx, input); throw new Error('1b child audit fault'); });
    await req('post', path, staffUser, body).expect(500); expect(await snapshot()).toEqual(before); fault.mockRestore();
    await req('post', path, staffUser, body).expect(201);
    expect((await req('get', path, staffUser).expect(200)).body).toHaveLength(1);
    await req('post', `${path}/revoke`, staffUser, body).expect(201);
    expect((await db.clientConsent.findFirstOrThrow({ where: { tenantId: tenant, clientId } })).status).toBe('REVOKED');
  });
  it('preserves legal-hold maker/checker within scope', async () => {
    const placed = await req('post', `/clients/${clientId}/legal-holds`, admin, { scopeType: 'CLIENT', reason: 'Synthetic hold' }).expect(201);
    await req('post', `/clients/legal-holds/${placed.body.id}/request-release`, admin, { releaseReason: 'Synthetic release' }).expect(201);
    await req('post', `/clients/legal-holds/${placed.body.id}/approve-release`, admin, {}).expect(403);
    await req('post', `/clients/legal-holds/${placed.body.id}/approve-release`, partner, {}).expect(201);
    expect((await db.clientLegalHold.findUniqueOrThrow({ where: { id: placed.body.id } })).status).toBe('RELEASED');
  });
  it('preserves scoped decision-ledger creation and event transition without external-client authority', async () => {
    const transport = jest.spyOn(dispatcher, 'dispatch').mockResolvedValue({ status: 'sent' } as any);
    const created = await req('post', `/client-approvals/case/${caseId}`, admin, { clientId, subjectType: 'OPERATION' }).expect(201);
    await req('post', `/client-approvals/${created.body.id}/send`, admin, {}).expect(201);
    const row = await db.clientApprovalRequest.findUniqueOrThrow({ where: { id: created.body.id }, include: { events: true } });
    expect(row.status).toBe('SENT'); expect(row.events).toHaveLength(2);
    // Provider configuration is deliberately absent; no real transport is used by this acceptance.
    expect(transport.mock.calls.length).toBeLessThanOrEqual(1);
  });
  it('preserves scoped legacy and workspace intake entry points while enforcing exact-case scope', async () => {
    jest.spyOn(dispatcher, 'dispatch').mockResolvedValue({ status: 'sent' } as any);
    const created = await req('post', `/client-intake-links/case/${caseId}`, admin, { clientId }).expect(201);
    expect(created.body.link.clientId).toBe(clientId);
    const read = await req('get', `/client-intake-links/${created.body.link.id}`, admin).expect(200);
    expect(read.body).not.toHaveProperty('tokenHash');
    await req('post', `/client-intake-links/${created.body.link.id}/revoke`, admin, {}).expect(201);
    const workspace = await req('post', `/clients/${clientId}/cases/${caseId}/intake-links`, admin, { scope: ['ADDRESS'] }).expect(201);
    expect(workspace.body.data.link.clientId).toBe(clientId);
  });
});
