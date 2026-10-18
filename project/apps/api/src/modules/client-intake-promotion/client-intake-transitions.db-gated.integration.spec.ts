/** Real PostgreSQL source-command serialization. No HTTP/role-policy or live acceptance claim. */
import { randomUUID } from 'node:crypto';
import { resolveTestDatabaseUrl } from '../../../test/test-db-env';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { OfficeApprovalService } from '../office-approval/office-approval.service';
import { CaseDebtorLifecycleGuardService } from '../case-debtor-lifecycle-guard/case-debtor-lifecycle-guard.service';
import { ClientIntakeReviewService } from '../client-intake-review/client-intake-review.service';
import { ClientIntakePromotionService } from './client-intake-promotion.service';

const url = resolveTestDatabaseUrl(process.env);
const dbDescribe = url ? describe : describe.skip;
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(r => { resolve = r; });
  return { promise, resolve };
}

dbDescribe('Client intake source transitions — independent PostgreSQL pools', () => {
  let a: PrismaService;
  let b: PrismaService;
  let tenantId: string;
  let clientId: string;
  let caseId: string;
  let debtorId: string;
  let userId: string;
  let submissionId: string;
  let fields: string[];

  beforeAll(async () => {
    a = new PrismaService({ datasources: { db: { url } } });
    b = new PrismaService({ datasources: { db: { url } } });
    await Promise.all([a.$connect(), b.$connect()]);
  });
  afterAll(async () => { await Promise.all([a.$disconnect(), b.$disconnect()]); });

  beforeEach(async () => {
    tenantId = `intake-race-${randomUUID()}`;
    await a.tenant.create({ data: { id: tenantId, slug: tenantId, name: 'Synthetic intake race' } });
    userId = (await a.user.create({ data: { tenantId, email: `${tenantId}@test.invalid`, name: 'Test', surname: 'Partner', role: 'USER' } })).id;
    await a.lawyer.create({ data: { tenantId, name: 'Test', surname: 'Partner', userId, lawyerRank: 'PARTNER' } });
    clientId = (await a.client.create({ data: { tenantId, type: 'INDIVIDUAL', firstName: 'Synthetic', lastName: 'Client' } })).id;
    caseId = (await a.case.create({ data: { tenantId, fileNumber: tenantId, type: 'GENERAL_EXECUTION' } })).id;
    debtorId = (await a.debtor.create({ data: { tenantId, type: 'INDIVIDUAL', name: 'Synthetic Debtor', firstName: 'Synthetic', lastName: 'Debtor' } })).id;
    await a.caseDebtor.create({ data: { caseId, debtorId } });
    const link = await a.clientIntakeLink.create({ data: { tenantId, clientId, caseId, tokenHash: randomUUID(), scope: ['INCOME_SOURCE', 'STRATEGY', 'ADDRESS'], createdById: userId } });
    const sub = await a.clientIntakeSubmission.create({ data: { tenantId, clientId, caseId, intakeLinkId: link.id, status: 'IN_REVIEW', fields: { create: [
      { category: 'INCOME_SOURCE', value: 'synthetic income', reviewStatus: 'APPROVED' },
      { category: 'STRATEGY', value: 'synthetic strategy', reviewStatus: 'APPROVED' },
    ] } }, include: { fields: { orderBy: { createdAt: 'asc' } } } });
    submissionId = sub.id;
    fields = sub.fields.map(f => f.id);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await a.auditLog.deleteMany({ where: { tenantId } });
    await a.clientIntakeSubmission.deleteMany({ where: { tenantId } });
    await a.clientIntakeLink.deleteMany({ where: { tenantId } });
    await a.clientIntelStatement.deleteMany({ where: { tenantId } });
    await a.debtorAddress.deleteMany({ where: { debtor: { tenantId } } });
    await a.caseDebtor.deleteMany({ where: { case: { tenantId } } });
    await a.case.deleteMany({ where: { tenantId } });
    await a.client.deleteMany({ where: { tenantId } });
    await a.debtor.deleteMany({ where: { tenantId } });
    await a.lawyer.deleteMany({ where: { tenantId } });
    await a.user.deleteMany({ where: { tenantId } });
    await a.tenant.delete({ where: { id: tenantId } });
  });

  function services(db: PrismaService, audit = new AuditService(db)) {
    return {
      review: new ClientIntakeReviewService(db),
      promote: new ClientIntakePromotionService(db, audit, new OfficeApprovalService(db, audit), new CaseDebtorLifecycleGuardService(db)),
    };
  }

  // Wrap only observation around the REAL SQL lock. The second pool must reach the
  // same lock before the first operation continues; PostgreSQL performs the wait.
  async function ordered<T, U>(first: (db: PrismaService) => Promise<T>, second: (db: PrismaService) => Promise<U>) {
    const locked = deferred();
    const attempted = deferred();
    function facade(db: PrismaService, leader: boolean): PrismaService {
      return new Proxy(db, { get(target, key) {
        if (key === '$transaction') return (fn: any, options: any) => target.$transaction(async tx => {
          const observed = new Proxy(tx, { get(inner, property) {
            if (property !== '$queryRaw') {
              const value = Reflect.get(inner, property);
              return typeof value === 'function' ? value.bind(inner) : value;
            }
            return async (...args: any[]) => {
              if (!leader) attempted.resolve();
              const rows = await (inner.$queryRaw as any)(...args);
              if (leader) { locked.resolve(); await attempted.promise; }
              return rows;
            };
          } });
          return fn(observed);
        }, options);
        const value = Reflect.get(target, key);
        return typeof value === 'function' ? value.bind(target) : value;
      } });
    }
    const p = first(facade(a, true));
    // Attach rejection immediately: intentional late injected failures are observed.
    const firstResult = p.then(value => ({ status: 'fulfilled' as const, value }), reason => ({ status: 'rejected' as const, reason }));
    await locked.promise;
    const secondResult = second(facade(b, false)).then(value => ({ status: 'fulfilled' as const, value }), reason => ({ status: 'rejected' as const, reason }));
    return Promise.all([firstResult, secondResult]);
  }

  async function state() {
    return {
      submission: await a.clientIntakeSubmission.findUniqueOrThrow({ where: { id: submissionId } }),
      fields: await a.clientIntakeField.findMany({ where: { submissionId }, orderBy: { id: 'asc' } }),
      intel: await a.clientIntelStatement.findMany({ where: { tenantId }, orderBy: { id: 'asc' } }),
      audits: await a.auditLog.findMany({ where: { tenantId }, orderBy: { id: 'asc' } }),
      addresses: await a.debtorAddress.findMany({ where: { debtorId }, orderBy: { id: 'asc' } }),
    };
  }

  it('claim/claim: later claimant cannot overwrite the accepted owner', async () => {
    await a.clientIntakeSubmission.update({ where: { id: submissionId }, data: { status: 'CLIENT_SUBMITTED' } });
    const results = await ordered(db => services(db).review.claim(tenantId, submissionId, userId), db => services(db).review.claim(tenantId, submissionId, 'other-actor'));
    expect(results.map(r => r.status)).toEqual(['fulfilled', 'rejected']);
    expect((results[1] as any).reason.getStatus()).toBe(400);
    expect((await state()).submission).toMatchObject({ status: 'IN_REVIEW', claimedById: userId });
  });

  it('same field: only one canonical target, reference and audit', async () => {
    const results = await ordered(db => services(db).promote.promoteSoftField(tenantId, fields[0], userId, debtorId), db => services(db).promote.promoteSoftField(tenantId, fields[0], userId, debtorId));
    expect(results.map(r => r.status)).toEqual(['fulfilled', 'rejected']);
    expect((results[1] as any).reason.getStatus()).toBe(400);
    const s = await state();
    expect(s.intel).toHaveLength(1); expect(s.audits).toHaveLength(1);
    expect(s.fields.find(f => f.id === fields[0])?.promotedRefId).toBe(s.intel[0].id);
    expect(s.submission.status).toBe('PARTIALLY_PROMOTED');
  });

  it('different fields: both promotions remain valid and finish the submission', async () => {
    const results = await ordered(db => services(db).promote.promoteSoftField(tenantId, fields[0], userId, debtorId), db => services(db).promote.promoteSoftField(tenantId, fields[1], userId, debtorId));
    expect(results.map(r => r.status)).toEqual(['fulfilled', 'fulfilled']);
    const s = await state();
    expect(s.intel).toHaveLength(2); expect(s.audits).toHaveLength(2);
    expect(new Set(s.fields.map(f => f.promotedRefId)).size).toBe(2);
    expect(s.fields.every(f => s.intel.some(i => i.id === f.promotedRefId))).toBe(true);
    expect(s.submission.status).toBe('COMPLETED');
  });

  it.each(['review', 'submission'] as const)('a prior %s rejection prevents a stale promotion', async kind => {
    const results = await ordered(db => kind === 'review'
      ? services(db).review.reviewField(tenantId, fields[0], userId, 'REJECT')
      : services(db).review.rejectSubmission(tenantId, submissionId, userId),
    db => services(db).promote.promoteSoftField(tenantId, fields[0], userId, debtorId));
    expect(results.map(r => r.status)).toEqual(['fulfilled', 'rejected']);
    expect((results[1] as any).reason.getStatus()).toBe(400);
    const s = await state(); expect(s.intel).toHaveLength(0); expect(s.audits).toHaveLength(0);
    expect(s.fields.every(f => f.promotedRefId === null)).toBe(true);
    expect(s.submission.status).toBe(kind === 'review' ? 'IN_REVIEW' : 'REJECTED');
  });

  it.each(['review', 'submission'] as const)('a prior promotion cannot be overwritten by late %s rejection', async kind => {
    const results = await ordered(db => services(db).promote.promoteSoftField(tenantId, fields[0], userId, debtorId), db => kind === 'review'
      ? services(db).review.reviewField(tenantId, fields[0], userId, 'REJECT')
      : services(db).review.rejectSubmission(tenantId, submissionId, userId));
    expect(results.map(r => r.status)).toEqual(['fulfilled', 'rejected']);
    const s = await state(); expect(s.intel).toHaveLength(1); expect(s.audits).toHaveLength(1);
    expect(s.submission.status).toBe('PARTIALLY_PROMOTED');
    expect(s.fields.find(f => f.id === fields[0])).toMatchObject({ reviewStatus: 'APPROVED', promotedRefId: s.intel[0].id });
  });

  it('bulk then single: late single cannot recreate a bulk target', async () => {
    const results = await ordered(db => services(db).promote.promote(tenantId, submissionId, userId, debtorId), db => services(db).promote.promoteSoftField(tenantId, fields[0], userId, debtorId));
    expect(results.map(r => r.status)).toEqual(['fulfilled', 'rejected']);
    const s = await state(); expect(s.intel).toHaveLength(2); expect(s.audits).toHaveLength(1); expect(s.submission.status).toBe('COMPLETED');
  });

  it('bulk/bulk: only the winning bulk command creates targets', async () => {
    const results = await ordered(db => services(db).promote.promote(tenantId, submissionId, userId, debtorId), db => services(db).promote.promote(tenantId, submissionId, userId, debtorId));
    expect(results.map(r => r.status)).toEqual(['fulfilled', 'rejected']);
    const s = await state(); expect(s.intel).toHaveLength(2); expect(s.audits).toHaveLength(1); expect(s.submission.status).toBe('COMPLETED');
  });

  it('single then bulk: bulk selects only the other field', async () => {
    const results = await ordered(db => services(db).promote.promoteSoftField(tenantId, fields[0], userId, debtorId), db => services(db).promote.promote(tenantId, submissionId, userId, debtorId));
    expect(results.map(r => r.status)).toEqual(['fulfilled', 'fulfilled']);
    expect((results[1] as any).value.promoted.map((p: any) => p.fieldId)).toEqual([fields[1]]);
    const s = await state(); expect(s.intel).toHaveLength(2); expect(s.audits).toHaveLength(2); expect(s.submission.status).toBe('COMPLETED');
  });

  it.each(['single', 'bulk', 'address'] as const)('%s audit failure rolls back target, field and parent status', async kind => {
    if (kind === 'address') await a.clientIntakeField.update({ where: { id: fields[0] }, data: { category: 'ADDRESS' } });
    const before = await state();
    const audit = new AuditService(a);
    jest.spyOn(audit, 'logInTransaction').mockRejectedValue(new Error('synthetic audit failure'));
    const service = services(a, audit).promote;
    const operation = kind === 'single' ? service.promoteSoftField(tenantId, fields[0], userId, debtorId)
      : kind === 'bulk' ? service.promote(tenantId, submissionId, userId, debtorId)
        : service.promoteAddress(tenantId, fields[0], userId, { debtorId, street: 'Synthetic 1', city: 'Test' });
    await expect(operation).rejects.toThrow('synthetic audit failure');
    expect(await state()).toEqual(before);
  });

  it('bulk second target failure does not leave the first target or field behind', async () => {
    const before = await state();
    const db = new Proxy(a, { get(target, key) {
      if (key === '$transaction') return (fn: any, options: any) => target.$transaction(async tx => {
        let creates = 0;
        const delegate = new Proxy(tx.clientIntelStatement, { get(inner, property) {
          if (property === 'create') return (args: any) => { if (++creates === 2) throw new Error('synthetic second target failure'); return inner.create(args); };
          const value = Reflect.get(inner, property); return typeof value === 'function' ? value.bind(inner) : value;
        } });
        return fn(new Proxy(tx, { get(inner, property) { return property === 'clientIntelStatement' ? delegate : Reflect.get(inner, property); } }));
      }, options);
      const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value;
    } });
    await expect(services(db).promote.promote(tenantId, submissionId, userId, debtorId)).rejects.toThrow('synthetic second target failure');
    expect(await state()).toEqual(before);
  });

  it('bulk review and reject keep their field/status writes atomic on a late parent read failure', async () => {
    for (const operation of ['bulk', 'reject']) {
      const before = await state();
      const service = services(a).review;
      jest.spyOn(service, 'getOne').mockRejectedValue(new Error('synthetic late read failure'));
      await expect(operation === 'bulk' ? service.bulkReviewFields(tenantId, submissionId, userId, fields, 'REJECT') : service.rejectSubmission(tenantId, submissionId, userId)).rejects.toThrow('synthetic late read failure');
      expect(await state()).toEqual(before);
    }
  });

  it('address replay stays DUPLICATE_ADDRESS without falsely marking the other source field', async () => {
    await a.clientIntakeField.updateMany({ where: { submissionId }, data: { category: 'ADDRESS' } });
    const dto = { debtorId, street: 'Synthetic 1', city: 'Test' };
    const results = await ordered(db => services(db).promote.promoteAddress(tenantId, fields[0], userId, dto), db => services(db).promote.promoteAddress(tenantId, fields[1], userId, dto));
    expect(results.map(r => r.status)).toEqual(['fulfilled', 'fulfilled']);
    expect((results[0] as any).value.result).toBe('PROMOTED'); expect((results[1] as any).value.result).toBe('DUPLICATE_ADDRESS');
    const s = await state(); expect(s.addresses).toHaveLength(1); expect(s.audits).toHaveLength(1);
    expect(s.fields.find(f => f.id === fields[1])?.promotedRefId).toBeNull(); expect(s.submission.status).toBe('PARTIALLY_PROMOTED');
  });

  it('distinct address fields can each create a target under one submission', async () => {
    await a.clientIntakeField.updateMany({ where: { submissionId }, data: { category: 'ADDRESS' } });
    const results = await ordered(db => services(db).promote.promoteAddress(tenantId, fields[0], userId, { debtorId, street: 'Synthetic 1', city: 'Test' }),
      db => services(db).promote.promoteAddress(tenantId, fields[1], userId, { debtorId, street: 'Synthetic 2', city: 'Test' }));
    expect(results.map(r => r.status)).toEqual(['fulfilled', 'fulfilled']);
    const s = await state(); expect(s.addresses).toHaveLength(2); expect(s.audits).toHaveLength(2); expect(s.submission.status).toBe('COMPLETED');
    expect(new Set(s.fields.map(f => f.promotedRefId)).size).toBe(2);
  });

  it('foreign source identifiers and an ineligible actor leave all records unchanged', async () => {
    const before = await state();
    const s = services(a);
    await expect(s.review.claim('foreign', submissionId, userId)).rejects.toMatchObject({ status: 404 });
    await expect(s.review.reviewField('foreign', fields[0], userId, 'APPROVE')).rejects.toMatchObject({ status: 404 });
    await expect(s.promote.promoteSoftField('foreign', fields[0], userId, debtorId)).rejects.toMatchObject({ status: 404 });
    await expect(s.promote.promoteSoftField(tenantId, fields[0], 'missing-actor', debtorId)).rejects.toMatchObject({ status: 403 });
    expect(await state()).toEqual(before);
  });
});
