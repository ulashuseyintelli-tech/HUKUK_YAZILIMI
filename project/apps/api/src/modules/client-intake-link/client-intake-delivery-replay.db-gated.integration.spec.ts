import { randomUUID } from 'node:crypto';
import { resolveTestDatabaseUrl } from '../../../test/test-db-env';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ClientIntakeLinkService } from './client-intake-link.service';

const url = resolveTestDatabaseUrl(process.env);
const dbDescribe = url ? describe : describe.skip;

dbDescribe('Intake delivery command identity — disposable PostgreSQL', () => {
  let a: PrismaService;
  let b: PrismaService;
  let tenantId: string;
  let clientId: string;
  let otherClientId: string;
  let caseId: string;
  let otherCaseId: string;
  let dispatch: jest.Mock;
  const dto = () => ({ scope: ['ADDRESS', 'STRATEGY'] as any, expiresAt: new Date(Date.now() + 3600_000).toISOString(), maxUses: 2 });
  const oldBase = process.env.PUBLIC_INTAKE_BASE_URL;

  beforeAll(async () => {
    a = new PrismaService({ datasources: { db: { url } } });
    b = new PrismaService({ datasources: { db: { url } } });
    await Promise.all([a.$connect(), b.$connect()]);
    process.env.PUBLIC_INTAKE_BASE_URL = 'https://intake.test.invalid';
  });
  afterAll(async () => {
    if (oldBase === undefined) delete process.env.PUBLIC_INTAKE_BASE_URL; else process.env.PUBLIC_INTAKE_BASE_URL = oldBase;
    await Promise.all([a.$disconnect(), b.$disconnect()]);
  });
  beforeEach(async () => {
    tenantId = `intake-key-${randomUUID()}`;
    await a.tenant.create({ data: { id: tenantId, slug: tenantId, name: 'Synthetic replay' } });
    const client = () => a.client.create({ data: { tenantId, type: 'INDIVIDUAL', firstName: 'Synthetic', lastName: 'Client' } });
    clientId = (await client()).id; otherClientId = (await client()).id;
    caseId = (await a.case.create({ data: { tenantId, type: 'GENERAL_EXECUTION', fileNumber: `${tenantId}-1` } })).id;
    otherCaseId = (await a.case.create({ data: { tenantId, type: 'GENERAL_EXECUTION', fileNumber: `${tenantId}-2` } })).id;
    await a.caseClient.createMany({ data: [{ caseId, clientId }, { caseId, clientId: otherClientId }, { caseId: otherCaseId, clientId }] });
    dispatch = jest.fn().mockResolvedValue({ status: 'sent' });
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await a.clientIntakeLinkDelivery.deleteMany({ where: { tenantId } });
    await a.clientIntakeLink.deleteMany({ where: { tenantId } });
    await a.caseClient.deleteMany({ where: { case: { tenantId } } });
    await a.case.deleteMany({ where: { tenantId } });
    await a.client.deleteMany({ where: { tenantId } });
    await a.tenant.delete({ where: { id: tenantId } });
  });
  function service(db = a) {
    return new ClientIntakeLinkService(db, { dispatch } as any, { getOfficeIdentity: jest.fn().mockResolvedValue({ name: 'Synthetic Office' }) } as any, new AuditService(db));
  }
  function send(s: ClientIntakeLinkService, body = dto(), client = clientId, kase = caseId, key: any = 'stable-key') {
    return s.createAndDeliverForClientWorkspace(tenantId, client, kase, 'synthetic-actor', key, body);
  }
  async function rows() {
    return { links: await a.clientIntakeLink.findMany({ where: { tenantId }, orderBy: { id: 'asc' } }), deliveries: await a.clientIntakeLinkDelivery.findMany({ where: { tenantId }, orderBy: { id: 'asc' } }) };
  }

  it('same target/payload replay preserves the link and sends only once; no bearer URL in response/artifact', async () => {
    const s = service(); const body = dto();
    const first = await send(s, body);
    const before = await rows();
    const replay = await send(s, { ...body, expiresAt: new Date(body.expiresAt).toISOString() });
    expect(replay).toEqual(first); expect(await rows()).toEqual(before); expect(dispatch).toHaveBeenCalledTimes(1);
    const rawUrl = dispatch.mock.calls[0][2].tokens.intakeUrl;
    expect(rawUrl).toMatch(/^https:\/\/intake\.test\.invalid\/intake\//);
    expect(dispatch.mock.calls[0][2].persistedTokens.intakeUrl).toBe('[REDACTED_INTAKE_LINK]');
    expect(JSON.stringify(replay)).not.toContain(rawUrl); expect(JSON.stringify(before)).not.toContain(rawUrl);
  });

  it.each(['client', 'case', 'scope', 'scope-order', 'expiry', 'uses'] as const)('same key with changed %s conflicts without writes or redispatch', async change => {
    const s = service(); const body = dto(); await send(s, body); const before = await rows();
    const next = { ...body };
    if (change === 'scope') next.scope = ['STRATEGY'];
    if (change === 'scope-order') next.scope = [...body.scope].reverse();
    if (change === 'expiry') next.expiresAt = new Date(new Date(body.expiresAt).getTime() + 1000).toISOString();
    if (change === 'uses') next.maxUses = 3;
    await expect(send(s, next, change === 'client' ? otherClientId : clientId, change === 'case' ? otherCaseId : caseId)).rejects.toMatchObject({ status: 409 });
    expect(await rows()).toEqual(before); expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('omitted default maxUses and explicit one identify the same command', async () => {
    const s = service(); const body = { scope: ['ADDRESS'] as any };
    const first = await send(s, body as any);
    expect(await send(s, { ...body, maxUses: 1 } as any)).toEqual(first); expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('matching replay remains replay after expiry rather than creating a fresh link', async () => {
    const s = service(); const body = dto(); const first = await send(s, body);
    jest.spyOn(Date, 'now').mockReturnValue(new Date(body.expiresAt).getTime() + 1000);
    expect(await send(s, body)).toEqual(first); expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it.each(['PENDING', 'SENDING', 'FAILED'] as const)('%s delivery replay does not restart an uncertain/failed dispatch', async status => {
    const s = service(); const body = dto(); const first = await send(s, body);
    await a.clientIntakeLinkDelivery.update({ where: { id: first.delivery.id }, data: { status } }); const before = await rows();
    const replay = await send(s, body);
    expect(replay.delivery.status).toBe(status.toLowerCase()); expect(await rows()).toEqual(before); expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it.each([undefined, '', '  ', 'x'.repeat(201), 12, ['key']] as any[])('invalid key %p rejects before DB writes or dispatch', async key => {
    const before = await rows();
    await expect(service().createAndDeliverForClientWorkspace(tenantId, clientId, caseId, 'synthetic-actor', key, dto())).rejects.toMatchObject({ status: 400 });
    expect(await rows()).toEqual(before); expect(dispatch).not.toHaveBeenCalled();
  });

  it.each([false, true])('concurrent unique-key recovery binds the winning payload (different=%s)', async different => {
    const first = service(a); const second = service(b);
    let arrivals = 0; let release!: () => void;
    const ready = new Promise<void>(r => { release = r; });
    for (const s of [first, second]) {
      const read = (s as any).findDeliveryByIdempotencyKey.bind(s);
      let initial = true;
      jest.spyOn(s as any, 'findDeliveryByIdempotencyKey').mockImplementation(async (...args) => {
        const found = await read(...args);
        if (initial) { initial = false; expect(found).toBeNull(); if (++arrivals === 2) release(); await ready; }
        return found;
      });
    }
    const body = dto();
    const other = { ...body, maxUses: different ? 3 : body.maxUses };
    const result = await Promise.allSettled([send(first, body), send(second, other)]);
    expect(arrivals).toBe(2);
    expect((first as any).findDeliveryByIdempotencyKey.mock.calls.length + (second as any).findDeliveryByIdempotencyKey.mock.calls.length).toBe(3);
    const s = await rows(); expect(s.links).toHaveLength(1); expect(s.deliveries).toHaveLength(1); expect(dispatch).toHaveBeenCalledTimes(1);
    const accepted = result.filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled');
    expect(accepted).toHaveLength(different ? 1 : 2);
    if (different) {
      expect((result.find(r => r.status === 'rejected') as PromiseRejectedResult).reason).toMatchObject({ status: 409 });
      expect(accepted[0].value.link.maxUses).toBe(s.links[0].maxUses);
    } else {
      expect(accepted[0].value.link.id).toBe(accepted[1].value.link.id);
    }
  });
});
