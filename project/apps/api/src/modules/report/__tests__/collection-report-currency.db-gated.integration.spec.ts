import { randomUUID } from 'node:crypto';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { PrismaService } from '../../../prisma/prisma.service';
import { CollectionService } from '../../collection/collection.service';
import { collectionReportCurrency, resolveCollectionReportScope } from '../../collection/collection-report-currency';
import { ReportService } from '../report.service';

const url = resolveTestDatabaseUrl(process.env);
const dbDescribe = url ? describe : describe.skip;
dbDescribe('Collection report currency boundary — real disposable PostgreSQL', () => {
  let db: PrismaService;
  let tenantId: string;
  let caseId: string;
  const report = () => new ReportService(db, {} as any, {} as any);
  // Exercise the actual read method; unrelated mutation collaborators are not booted.
  const summary = (currency?: string, tenant = tenantId) => CollectionService.prototype.getSummary.call({ prisma: db }, tenant, undefined, currency);
  beforeAll(async () => { db = new PrismaService({ datasources: { db: { url } } }); await db.$connect(); });
  afterAll(async () => { await db.$disconnect(); });
  beforeEach(async () => {
    tenantId = `report-currency-${randomUUID()}`;
    await db.tenant.create({ data: { id: tenantId, slug: tenantId, name: 'Synthetic currency report' } });
    caseId = (await db.case.create({ data: { tenantId, fileNumber: tenantId, type: 'GENERAL_EXECUTION', currency: 'TRY' } })).id;
    const rows = [
      ['TRY', 70, 'CONFIRMED', 'BANKA', 'MANUAL'], ['TRY', 30, 'CONFIRMED', 'NAKIT', 'THIRD_PARTY'],
      ['USD', 100, 'CONFIRMED', 'BANKA', 'MANUAL'], ['TRY', 20, 'PENDING', 'BANKA', 'MANUAL'],
      ['USD', 40, 'PENDING', 'BANKA', 'MANUAL'], ['TRY', 5, 'CANCELLED', 'BANKA', 'MANUAL'], ['USD', 10, 'CANCELLED', 'BANKA', 'MANUAL'],
    ] as const;
    for (const [currency, amount, status, channel, sourceType] of rows) {
      await db.collection.create({ data: { tenantId, caseId, amount, currency, status, channel, sourceType, type: 'CASH', date: new Date(), idempotencyKey: randomUUID() } });
    }
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await db.collection.deleteMany({ where: { tenantId } });
    await db.case.deleteMany({ where: { tenantId } });
    await db.tenant.delete({ where: { id: tenantId } });
  });

  it('unqualified mixed history and both summary endpoints refuse cross-currency sums', async () => {
    const before = await db.collection.findMany({ where: { tenantId }, orderBy: { id: 'asc' } });
    await Promise.all([report().getCollectionHistoryReport(tenantId), report().getCollectionSummary(tenantId), summary()].map(result =>
      expect(result).rejects.toMatchObject({ status: 409, response: { code: 'COLLECTION_CURRENCY_REQUIRED', currencies: ['TRY', 'USD'] } })));
    expect(await db.collection.findMany({ where: { tenantId }, orderBy: { id: 'asc' } })).toEqual(before);
  });

  it.each(['TRY', 'USD'])('%s history has its own totals, average, channels, sources, months and rows', async currency => {
    const result = await report().getCollectionHistoryReport(tenantId, { currency });
    expect(result.currency).toBe(currency);
    expect(result.summary).toEqual({ totalCollected: 100, totalPending: currency === 'TRY' ? 20 : 40, totalCancelled: currency === 'TRY' ? 5 : 10, collectionCount: currency === 'TRY' ? 2 : 1, averageAmount: currency === 'TRY' ? 50 : 100 });
    expect(result.collections).toHaveLength(currency === 'TRY' ? 4 : 3);
    expect(result.collections.every(row => row.currency === currency)).toBe(true);
    expect(result.byChannel.reduce((sum, row) => sum + row.total, 0)).toBe(100);
    expect(result.bySource.reduce((sum, row) => sum + row.total, 0)).toBe(100);
    expect(result.byMonth).toHaveLength(1); expect(result.byMonth[0].total).toBe(100);
    if (currency === 'TRY') {
      expect(result.byChannel).toEqual(expect.arrayContaining([{ channel: 'BANKA', count: 1, total: 70, percentage: 70 }, { channel: 'NAKIT', count: 1, total: 30, percentage: 30 }]));
      expect(result.bySource).toEqual(expect.arrayContaining([{ source: 'MANUAL', count: 1, total: 70, percentage: 70 }, { source: 'THIRD_PARTY', count: 1, total: 30, percentage: 30 }]));
    }
  });

  it.each(['TRY', 'USD'])('%s summary queries use a currency predicate for every aggregate', async currency => {
    const result = await summary(currency);
    expect(result).toMatchObject({ currency, totalCollected: 100, totalPending: currency === 'TRY' ? 20 : 40, totalCancelled: currency === 'TRY' ? 5 : 10, collectionCount: currency === 'TRY' ? 2 : 1 });
    expect(Object.values(result.byChannel).reduce((sum: number, value: any) => sum + value, 0)).toBe(100);
    expect(Object.values(result.bySource).reduce((sum: number, value: any) => sum + value, 0)).toBe(100);
    const dashboard = await report().getCollectionSummary(tenantId, 'month', currency);
    expect(dashboard).toMatchObject({ currency, periodTotal: 100, allTimeTotal: 100, pendingTotal: currency === 'TRY' ? 20 : 40, periodCount: currency === 'TRY' ? 2 : 1, pendingCount: 1 });
    expect(dashboard.semantics.debtorLifecycleScope).toBe('HISTORICAL_COLLECTIONS_INCLUDE_PASSIVE_WHEN_LINKED');
  });

  it('a homogeneous USD dataset preserves numeric contracts and never uses Case.currency TRY', async () => {
    await db.collection.deleteMany({ where: { tenantId, currency: 'TRY' } });
    expect((await report().getCollectionHistoryReport(tenantId)).currency).toBe('USD');
    expect(await summary()).toMatchObject({ currency: 'USD', totalCollected: 100 });
    expect(await report().getCollectionSummary(tenantId)).toMatchObject({ currency: 'USD', allTimeTotal: 100 });
  });

  it('valid non-Case-enum currency codes are kept separate, not mapped to TRY', async () => {
    await db.collection.updateMany({ where: { tenantId, currency: 'USD' }, data: { currency: 'JPY' } });
    expect(await summary('JPY')).toMatchObject({ currency: 'JPY', totalCollected: 100 });
    expect((await report().getCollectionHistoryReport(tenantId, { currency: 'JPY' })).collections.every(row => row.currency === 'JPY')).toBe(true);
  });

  it.each(['', 'usd', 'US D', 'USD,TRY', 'TOOLONG'] as const)('invalid request code %p rejects at every read entry', async currency => {
    await Promise.all([report().getCollectionHistoryReport(tenantId, { currency }), report().getCollectionSummary(tenantId, 'month', currency), summary(currency)].map(result => expect(result).rejects.toMatchObject({ status: 400 })));
  });

  it('missing/malformed historical currency is not silently treated as TRY', async () => {
    await db.collection.updateMany({ where: { tenantId, currency: 'USD' }, data: { currency: '' } });
    await Promise.all([report().getCollectionHistoryReport(tenantId), summary()].map(result => expect(result).rejects.toMatchObject({ status: 409, response: { code: 'COLLECTION_CURRENCY_UNKNOWN' } })));
    expect(() => collectionReportCurrency([undefined])).toThrow();
  });

  it('an empty preflight pins an impossible currency filter and cannot sum later inserts', async () => {
    const scope = await resolveCollectionReportScope(db, { tenantId, currency: 'CHF' });
    expect(scope).toEqual({ currency: null, where: { tenantId, currency: { in: [] } } });
    await db.collection.create({ data: { tenantId, caseId, currency: 'CHF', amount: 999, type: 'CASH', date: new Date(), idempotencyKey: randomUUID() } });
    expect((await db.collection.aggregate({ where: scope.where, _sum: { amount: true } }))._sum.amount).toBeNull();
  });

  it('empty and foreign-tenant reports contain zero amounts with no inferred currency', async () => {
    expect(await summary(undefined, 'nonexistent-tenant')).toMatchObject({ currency: null, totalCollected: 0, totalPending: 0 });
    const empty = await report().getCollectionHistoryReport('nonexistent-tenant');
    expect(empty).toMatchObject({ currency: null, summary: { totalCollected: 0, collectionCount: 0 }, collections: [] });
    expect(await summary('CHF')).toMatchObject({ currency: 'CHF', totalCollected: 0 });
  });
});
