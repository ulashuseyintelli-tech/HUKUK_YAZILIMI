jest.mock('pdf-poppler', () => ({ convert: async () => { throw new Error('Renderer is outside FR-7'); } }));

import { CanActivate, ExecutionContext, INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import * as request from 'supertest';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { StorageModule } from '../../../common/storage/storage.module';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ErrorLogModule } from '../../error-log/error-log.module';
import { MetricsRegistryModule } from '../../metrics-registry/metrics-registry.module';
import { DomainEventIngestService } from '../../icrabot/domain-event-ingest';
import { assertCaseClaimCurrency, assertStoredCaseClaimCurrency } from '../../claim-item/case-claim-currency-policy';
import { CaseModule } from '../case.module';

const url = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !url) throw new Error('FR7 DB acceptance requires TEST_DATABASE_URL');
const dbDescribe = url ? describe : describe.skip;

class DbIdentity implements CanActivate {
  constructor(private readonly db: () => PrismaClient) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const user = await this.db().user.findUnique({ where: { id: String(req.headers['x-test-user-id']) }, include: { tenant: true } });
    if (!user?.isActive) throw new UnauthorizedException();
    req.user = user;
    return true;
  }
}

dbDescribe('FR-7 A + temporary D — real HTTP/disposable PostgreSQL', () => {
  jest.setTimeout(180_000);
  let db: PrismaClient, app: INestApplication, tenantId: string, adminId: string, otherId: string, viewerId: string;
  const suffix = randomUUID().slice(0, 8);
  const priorManual = process.env.MANUAL_CASE_INSTRUMENTS;
  const due = { type: 'PRINCIPAL', amount: 1000, dueDate: '2026-01-15' };
  beforeAll(async () => {
    process.env.MANUAL_CASE_INSTRUMENTS = 'true';
    db = new PrismaClient({ datasources: { db: { url } } });
    await db.$connect();
    const module = await Test.createTestingModule({ imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), StorageModule, ErrorLogModule, MetricsRegistryModule, CaseModule] })
      .overrideGuard(JwtAuthGuard).useValue(new DbIdentity(() => db)).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    tenantId = `test-fr7-${suffix}`;
    await db.tenant.create({ data: { id: tenantId, name: 'FR7 test', slug: tenantId } });
    adminId = (await db.user.create({ data: { tenantId, email: `fr7-${suffix}@example.test`, name: 'FR7', surname: 'A', role: 'ADMIN' } })).id;
    viewerId = (await db.user.create({ data: { tenantId, email: `fr7-view-${suffix}@example.test`, name: 'FR7', surname: 'V', role: 'VIEWER' } })).id;
    const other = await db.tenant.create({ data: { name: 'FR7 other test', slug: `test-fr7-other-${suffix}` } });
    otherId = (await db.user.create({ data: { tenantId: other.id, email: `fr7-other-${suffix}@example.test`, name: 'FR7', surname: 'B', role: 'ADMIN' } })).id;
  });
  afterAll(async () => {
    jest.restoreAllMocks();
    if (priorManual === undefined) delete process.env.MANUAL_CASE_INSTRUMENTS;
    else process.env.MANUAL_CASE_INSTRUMENTS = priorManual;
    await app?.close();
    await db?.$disconnect();
  });
  const http = () => request(app.getHttpServer());
  const post = (path: string, data: unknown, user = adminId) => http().post(path).set('x-test-user-id', user).send(data);
  const patch = (path: string, data: unknown, user = adminId) => http().patch(path).set('x-test-user-id', user).send(data);
  const open = (currency: string, extra: object = {}) => post('/cases', { fileNumber: `FR7-${randomUUID()}`, type: 'GENERAL_EXECUTION', interestType: 'YASAL', startDate: '2026-02-01', currency, dues: [due], ...extra });
  const counts = async () => ({
    cases: await db.case.count({ where: { tenantId } }),
    dues: await db.due.count({ where: { case: { tenantId } } }),
    claims: await db.claimItem.count({ where: { tenantId } }),
    instruments: await db.caseInstrument.count({ where: { tenantId } }),
    approvals: await db.officeApprovalRequest.count({ where: { tenantId } }),
    audit: await db.auditLog.count({ where: { tenantId } }),
  });
  async function opened(currency = 'USD') {
    const response = await open(currency);
    expect(response.status).toBe(201);
    return response.body.id as string;
  }

  it.each(['TRY', 'USD', 'EUR', 'GBP', 'CHF'])('%s remains a native, unconverted opening currency', async currency => {
    const id = await opened(currency);
    expect(await db.due.findFirst({ where: { caseId: id }, select: { amount: true, currency: true } })).toMatchObject({ currency });
    const claim = await db.claimItem.findFirstOrThrow({ where: { caseId: id } });
    expect(claim.currency).toBe(currency);
    expect(claim.amount.toString()).toBe('1000');
  });
  it.each(['TRY', 'EUR', '', 'usd', null])('explicit incompatible Due currency %p fails before any write', async currency => {
    const id = await opened();
    const before = await counts();
    const response = await post(`/cases/${id}/dues`, { ...due, currency });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('CASE_CLAIM_CURRENCY_MISMATCH');
    expect(await counts()).toEqual(before);
  });
  it('omitted and explicit matching Due currency remain USD without changing the amount', async () => {
    const id = await opened();
    for (const field of [{}, { currency: 'USD' }]) {
      const response = await post(`/cases/${id}/dues`, { ...due, ...field });
      expect(response.status).toBe(201);
      expect(response.body.currency).toBe('USD');
      expect(Number(response.body.amount)).toBe(1000);
    }
  });
  it('currency-omitted updates use the existing record; incompatible updates roll back', async () => {
    const id = await opened();
    const row = await db.due.findFirstOrThrow({ where: { caseId: id } });
    expect((await patch(`/cases/${id}/dues/${row.id}`, { amount: 1200 })).status).toBe(200);
    const before = await counts();
    const response = await patch(`/cases/${id}/dues/${row.id}`, { amount: 4000, currency: 'TRY' });
    expect(response.status).toBe(400);
    expect(await counts()).toEqual(before);
    expect((await db.due.findUniqueOrThrow({ where: { id: row.id } })).amount.toString()).toBe('1200');
    expect((await db.claimItem.findFirstOrThrow({ where: { caseId: id } })).amount.toString()).toBe('1200');
  });
  it('one incompatible manual instrument rejects the whole opening batch', async () => {
    const before = await counts();
    const instrument = { type: 'SENET', amount: 500, issueDate: '2026-01-01', documentNo: `FR7-${suffix}`, currency: 'USD', source: 'MANUAL', dueDate: '2026-01-31' };
    const response = await open('USD', { instruments: [instrument, { ...instrument, documentNo: 'FR7-other', currency: 'TRY' }] });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('CASE_CLAIM_CURRENCY_MISMATCH');
    expect(await counts()).toEqual(before);
  });
  it('OCR input also fails the same currency gate without relabelling its source', async () => {
    const before = await counts();
    const response = await open('USD', { instruments: [{ type: 'SENET', amount: 500, issueDate: '2026-01-01', documentNo: 'FR7-OCR', currency: 'EUR', source: 'OCR' }] });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('CASE_CLAIM_CURRENCY_MISMATCH');
    expect(await counts()).toEqual(before);
  });
  it('wrong parent, tenant and VIEWER cannot reach a write', async () => {
    const id = await opened(), second = await opened();
    const row = await db.due.findFirstOrThrow({ where: { caseId: id } });
    const before = await counts();
    expect((await patch(`/cases/${second}/dues/${row.id}`, { amount: 2000 })).status).toBe(404);
    expect((await post(`/cases/${id}/dues`, due, otherId)).status).toBe(404);
    expect((await post(`/cases/${id}/dues`, due, viewerId)).status).toBe(403);
    expect(await counts()).toEqual(before);
  });
  it('a historical mixed record is still read in its own currency and never automatically repaired', async () => {
    const id = await opened();
    const legacy = await db.due.create({ data: { caseId: id, type: 'PRINCIPAL', amount: 2000, currency: 'TRY', dueDate: new Date('2026-01-01') } });
    const before = await counts();
    const response = await http().get(`/cases/${id}/dues`).set('x-test-user-id', adminId);
    expect(response.status).toBe(200);
    expect(response.body.some((row: any) => row.id === legacy.id && row.currency === 'TRY')).toBe(true);
    expect((await patch(`/cases/${id}/dues/${legacy.id}`, { amount: 3000 })).status).toBe(400);
    expect(await counts()).toEqual(before);
    expect((await db.due.findUniqueOrThrow({ where: { id: legacy.id } })).amount.toString()).toBe('2000');
  });
  it('concurrent compatible/incompatible requests produce only the compatible write', async () => {
    const id = await opened();
    const before = await db.due.count({ where: { caseId: id } });
    const responses = await Promise.all([post(`/cases/${id}/dues`, { ...due, currency: 'USD' }), post(`/cases/${id}/dues`, { ...due, currency: 'TRY' })]);
    expect(responses.map(r => r.status)).toEqual([201, 400]);
    expect(await db.due.count({ where: { caseId: id } })).toBe(before + 1);
  });
  it('continuity failure rolls back Due, ClaimItem and the preceding success audit together', async () => {
    const id = await opened();
    const before = await counts();
    const spy = jest.spyOn(app.get(DomainEventIngestService), 'appendInTransaction').mockRejectedValueOnce(new Error('FR7 controlled continuity failure'));
    const response = await post(`/cases/${id}/dues`, { ...due, currency: 'USD' });
    expect(response.status).toBe(500);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
    expect(await counts()).toEqual(before);
  });
  it('final admission reads current DB currency and rejects a stale candidate as conflict', async () => {
    const id = await opened();
    await db.case.update({ where: { id }, data: { currency: 'EUR' } }); // isolated fixture only
    const before = await counts();
    await expect(db.$transaction(tx => assertStoredCaseClaimCurrency(tx, tenantId, id, 'USD', true))).rejects.toMatchObject({ status: 409 });
    expect(await counts()).toEqual(before);
  });
  it('temporary D keeps proportional foreign-currency fee fields unavailable', async () => {
    const id = await opened();
    const before = await counts();
    const response = await http().get(`/cases/${id}/calculation-summary`).set('x-test-user-id', adminId);
    expect(response.status).toBe(200);
    const status = response.body.paraBirimiDurumu;
    expect(status.toplamGosterilebilir).toBe(false);
    expect(Object.values(status.alanlar).some((row: any) => row.durum === 'HESAPLANAMADI')).toBe(true);
    expect(await counts()).toEqual(before);
  });
});

describe('FR7 currency admission has no fallback or conversion', () => {
  it.each([undefined, null, '', 'usd', ' USD', 'TRY'])('rejects %p against a USD case', currency => {
    expect(() => assertCaseClaimCurrency('USD', currency)).toThrow();
  });
});
