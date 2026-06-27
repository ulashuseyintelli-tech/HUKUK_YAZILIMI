/**
 * TM3 Faz 7 read addendum — ClientSettlementReadService testleri (read-only).
 *
 * Acceptance:
 *  - computeOutstanding = Σ POSTED CLIENT_PAYABLE (Collection CONFIRMED) − Σ RECORDED ClientPayout (1000−400=600)
 *  - yalnız type=CLIENT_PAYABLE + disposition.status=POSTED sorgulanır (HELD/fee/firm/offset/OTHER hariç)
 *  - Collection CONFIRMED değilse payable dışı; BalanceLedger hesaba GİRMEZ
 *  - scope her zaman tenant+case+caseClientId+currency (currency separation)
 *  - assertEligibleCaseClient: foreign/wrong-role/tenant reject; ALACAKLI/ORTAK_ALACAKLI kabul
 *  - getOutstanding: caseClientId zorunlu + eligible doğrula
 *  - listClientCases: clientId+eligible+tenant; caseClientId resolve
 *  - listPayouts: where her zaman tenantId+RECORDED (sızıntı yok); pagination; date-range; currency; eligible-guard
 *  - mutation YOK (create/update/delete çağrısı yok)
 */
import { Prisma } from '@prisma/client';
import { ClientSettlementReadService } from '../client-settlement-read.service';

const D = (n: number) => new Prisma.Decimal(n);

function buildPrisma(
  opts: {
    cc?: any; // caseClient.findFirst (undefined → eligible {id:'cc-A'})
    cases?: any[];
    payouts?: any[];
    total?: number;
    payableLines?: any[];
    confirmedCollections?: any[];
    paid?: Prisma.Decimal | null;
  } = {},
) {
  return {
    caseClient: {
      findFirst: jest.fn().mockResolvedValue(opts.cc === undefined ? { id: 'cc-A' } : opts.cc),
      findMany: jest.fn().mockResolvedValue(opts.cases ?? []),
    },
    collectionDispositionLine: { findMany: jest.fn().mockResolvedValue(opts.payableLines ?? []) },
    collection: { findMany: jest.fn().mockResolvedValue(opts.confirmedCollections ?? []) },
    clientPayout: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { amount: opts.paid ?? null } }),
      findMany: jest.fn().mockResolvedValue(opts.payouts ?? []),
      count: jest.fn().mockResolvedValue(opts.total ?? (opts.payouts?.length ?? 0)),
    },
  } as any;
}

const read = (p: any) => new ClientSettlementReadService(p);

describe('ClientSettlementReadService.computeOutstanding', () => {
  it('1000 (POSTED CLIENT_PAYABLE, CONFIRMED) − 400 (RECORDED payout) = 600', async () => {
    const prisma = buildPrisma({
      payableLines: [{ amount: D(1000), disposition: { collectionId: 'col1' } }],
      confirmedCollections: [{ id: 'col1' }],
      paid: D(400),
    });
    const out = await read(prisma).computeOutstanding(prisma, 't1', 'case1', 'cc-A', 'TRY');
    expect(out.equals(D(600))).toBe(true);
  });

  it('yalnız type=CLIENT_PAYABLE + disposition POSTED + scope tenant/case/currency sorgulanır (HELD/fee/firm hariç)', async () => {
    const prisma = buildPrisma();
    await read(prisma).computeOutstanding(prisma, 't1', 'case1', 'cc-A', 'TRY');
    const where = prisma.collectionDispositionLine.findMany.mock.calls[0][0].where;
    expect(where.type).toBe('CLIENT_PAYABLE');
    expect(where.caseClientId).toBe('cc-A');
    expect(where.disposition).toEqual(
      expect.objectContaining({ tenantId: 't1', caseId: 'case1', currency: 'TRY', status: 'POSTED' }),
    );
  });

  it('Collection CONFIRMED değilse payable dışı (outstanding 0)', async () => {
    const prisma = buildPrisma({
      payableLines: [{ amount: D(1000), disposition: { collectionId: 'col1' } }],
      confirmedCollections: [], // col1 confirmed değil
      paid: null,
    });
    const out = await read(prisma).computeOutstanding(prisma, 't1', 'case1', 'cc-A', 'TRY');
    expect(out.equals(D(0))).toBe(true);
  });

  it('payout aggregate where: tenant+case+caseClientId+currency+RECORDED (currency separation)', async () => {
    const prisma = buildPrisma();
    await read(prisma).computeOutstanding(prisma, 't1', 'case1', 'cc-A', 'USD');
    const where = prisma.clientPayout.aggregate.mock.calls[0][0].where;
    expect(where).toEqual(
      expect.objectContaining({ tenantId: 't1', caseId: 'case1', caseClientId: 'cc-A', currency: 'USD', status: 'RECORDED' }),
    );
  });

  it('paid null → çıkarılan 0 (payable korunur)', async () => {
    const prisma = buildPrisma({
      payableLines: [{ amount: D(250), disposition: { collectionId: 'col1' } }],
      confirmedCollections: [{ id: 'col1' }],
      paid: null,
    });
    const out = await read(prisma).computeOutstanding(prisma, 't1', 'case1', 'cc-A', 'TRY');
    expect(out.equals(D(250))).toBe(true);
  });
});

describe('ClientSettlementReadService.assertEligibleCaseClient', () => {
  it('eligible (ALACAKLI/ORTAK_ALACAKLI + tenant) → geçer', async () => {
    const prisma = buildPrisma();
    await expect(read(prisma).assertEligibleCaseClient('t1', 'case1', 'cc-A')).resolves.toBeUndefined();
  });

  it('foreign/wrong-role/tenant mismatch (null) → reject', async () => {
    const prisma = buildPrisma({ cc: null });
    await expect(read(prisma).assertEligibleCaseClient('t1', 'case1', 'cc-X')).rejects.toThrow(
      /geçersiz\/yabancı|uygun rolde/,
    );
  });

  it('where: role in ALACAKLI/ORTAK_ALACAKLI + client.tenantId (clientId ile authz değil)', async () => {
    const prisma = buildPrisma();
    await read(prisma).assertEligibleCaseClient('t1', 'case1', 'cc-A');
    const where = prisma.caseClient.findFirst.mock.calls[0][0].where;
    expect(where.id).toBe('cc-A');
    expect(where.caseId).toBe('case1');
    expect(where.role).toEqual({ in: ['ALACAKLI', 'ORTAK_ALACAKLI'] });
    expect(where.client).toEqual({ tenantId: 't1' });
  });
});

describe('ClientSettlementReadService.getOutstanding', () => {
  it('caseClientId boş → reject', async () => {
    const prisma = buildPrisma();
    await expect(read(prisma).getOutstanding('t1', 'case1', '', 'TRY')).rejects.toThrow(/caseClientId/);
  });

  it('eligible değil → reject (compute öncesi)', async () => {
    const prisma = buildPrisma({ cc: null });
    await expect(read(prisma).getOutstanding('t1', 'case1', 'cc-X', 'TRY')).rejects.toThrow(
      /geçersiz\/yabancı|uygun rolde/,
    );
  });

  it('scope echo + outstanding string döner', async () => {
    const prisma = buildPrisma({
      payableLines: [{ amount: D(1000), disposition: { collectionId: 'col1' } }],
      confirmedCollections: [{ id: 'col1' }],
      paid: D(400),
    });
    const res = await read(prisma).getOutstanding('t1', 'case1', 'cc-A', 'TRY');
    expect(res).toEqual({ caseId: 'case1', caseClientId: 'cc-A', currency: 'TRY', outstanding: '600' });
  });
});

describe('ClientSettlementReadService.listClientCases', () => {
  it('müvekkilin dosyaları + caseClientId resolve (caseNumber=fileNumber)', async () => {
    const prisma = buildPrisma({
      cases: [
        { id: 'cc-A', caseId: 'case1', role: 'ALACAKLI', case: { fileNumber: '2024/1', executionFileNumber: 'E-1', caseDate: new Date('2026-01-15T00:00:00.000Z') } },
        { id: 'cc-B', caseId: 'case2', role: 'ORTAK_ALACAKLI', case: { fileNumber: '2024/2', executionFileNumber: null, caseDate: null } },
      ],
    });
    const res = await read(prisma).listClientCases('t1', 'client-1');
    expect(res.items).toEqual([
      { caseId: 'case1', caseClientId: 'cc-A', role: 'ALACAKLI', caseNumber: '2024/1', executionFileNumber: 'E-1', currency: 'TRY', caseOpenedAt: '2026-01-15T00:00:00.000Z' },
      { caseId: 'case2', caseClientId: 'cc-B', role: 'ORTAK_ALACAKLI', caseNumber: '2024/2', executionFileNumber: null, currency: 'TRY', caseOpenedAt: null },
    ]);
  });

  it('where: clientId + eligible roller + client.tenantId', async () => {
    const prisma = buildPrisma({ cases: [] });
    await read(prisma).listClientCases('t1', 'client-1');
    const where = prisma.caseClient.findMany.mock.calls[0][0].where;
    expect(where.clientId).toBe('client-1');
    expect(where.role).toEqual({ in: ['ALACAKLI', 'ORTAK_ALACAKLI'] });
    expect(where.client).toEqual({ tenantId: 't1' });
  });
});

describe('ClientSettlementReadService.listPayouts', () => {
  it('where her zaman tenantId + status RECORDED (cross-tenant/caseClient sızıntısı yok)', async () => {
    const prisma = buildPrisma({ payouts: [], total: 0 });
    await read(prisma).listPayouts('t1', {});
    const where = prisma.clientPayout.findMany.mock.calls[0][0].where;
    expect(where.tenantId).toBe('t1');
    expect(where.status).toBe('RECORDED');
  });

  it('pagination: page=2 limit=10 → skip 10 take 10', async () => {
    const prisma = buildPrisma({ payouts: [], total: 0 });
    await read(prisma).listPayouts('t1', { page: 2, limit: 10 });
    const args = prisma.clientPayout.findMany.mock.calls[0][0];
    expect(args.skip).toBe(10);
    expect(args.take).toBe(10);
  });

  it('limit clamp: 9999 → 200 (üst sınır)', async () => {
    const prisma = buildPrisma({ payouts: [], total: 0 });
    await read(prisma).listPayouts('t1', { limit: 9999 });
    expect(prisma.clientPayout.findMany.mock.calls[0][0].take).toBe(200);
  });

  it('date range from/to → paidAt gte/lte', async () => {
    const prisma = buildPrisma({ payouts: [], total: 0 });
    await read(prisma).listPayouts('t1', { from: '2026-01-01', to: '2026-02-01' });
    const where = prisma.clientPayout.findMany.mock.calls[0][0].where;
    expect(where.paidAt.gte).toEqual(new Date('2026-01-01'));
    expect(where.paidAt.lte).toEqual(new Date('2026-02-01'));
  });

  it('currency filtresi where\'e geçer', async () => {
    const prisma = buildPrisma({ payouts: [], total: 0 });
    await read(prisma).listPayouts('t1', { currency: 'USD' });
    expect(prisma.clientPayout.findMany.mock.calls[0][0].where.currency).toBe('USD');
  });

  it('caseId+caseClientId verilince eligible-guard çağrılır (foreign → reject)', async () => {
    const prisma = buildPrisma({ cc: null });
    await expect(read(prisma).listPayouts('t1', { caseId: 'case1', caseClientId: 'cc-X' })).rejects.toThrow(
      /geçersiz\/yabancı|uygun rolde/,
    );
  });

  it('amount toString + total döner', async () => {
    const prisma = buildPrisma({
      payouts: [{ id: 'p1', caseId: 'case1', caseClientId: 'cc-A', amount: D(400), currency: 'TRY', status: 'RECORDED', paidAt: new Date('2026-01-15'), paidById: 'u1', note: null }],
      total: 1,
    });
    const res = await read(prisma).listPayouts('t1', { caseId: 'case1' });
    expect(res.total).toBe(1);
    expect(res.items[0].amount).toBe('400');
    expect(res.page).toBe(1);
  });
});

// Faz A — Müvekkil Genel Cari (client-level projection). computeOutstanding spy'lanır (izole rollup).
function buildSummaryPrisma(o: {
  ccRows: any[];
  payoutByCc?: Record<string, Prisma.Decimal>;
  collectionByCase?: Record<string, Prisma.Decimal>;
  postedDispByCase?: Record<string, Prisma.Decimal>;
  balanceByCase?: Record<string, Prisma.Decimal>;
  expenseRows?: any[];
}) {
  return {
    caseClient: { findMany: jest.fn().mockResolvedValue(o.ccRows) },
    clientPayout: {
      aggregate: jest.fn().mockImplementation(({ where }: any) =>
        Promise.resolve({ _sum: { amount: o.payoutByCc?.[where.caseClientId] ?? null } }),
      ),
    },
    collection: {
      aggregate: jest.fn().mockImplementation(({ where }: any) =>
        Promise.resolve({ _sum: { amount: o.collectionByCase?.[where.caseId] ?? null } }),
      ),
      findMany: jest.fn().mockResolvedValue([]),
    },
    collectionDisposition: {
      aggregate: jest.fn().mockImplementation(({ where }: any) =>
        Promise.resolve({ _sum: { totalAmount: o.postedDispByCase?.[where.caseId] ?? null } }),
      ),
    },
    caseBalance: {
      findFirst: jest.fn().mockImplementation(({ where }: any) =>
        Promise.resolve(o.balanceByCase?.[where.caseId] != null ? { balance: o.balanceByCase[where.caseId] } : null),
      ),
    },
    expenseRequest: { findMany: jest.fn().mockResolvedValue(o.expenseRows ?? []) },
    collectionDispositionLine: { findMany: jest.fn().mockResolvedValue([]) },
  } as any;
}

describe('ClientSettlementReadService.getClientAccountingSummary (Faz A)', () => {
  it('A/B grup toplamı + caseBreakdown + netPosition (2 dosya)', async () => {
    const prisma = buildSummaryPrisma({
      ccRows: [
        { id: 'cc1', caseId: 'caseA', role: 'ALACAKLI', case: { fileNumber: '2026/1', executionFileNumber: null } },
        { id: 'cc2', caseId: 'caseB', role: 'ALACAKLI', case: { fileNumber: '2026/2', executionFileNumber: null } },
      ],
      payoutByCc: { cc1: D(400), cc2: D(0) },
      collectionByCase: { caseA: D(1000), caseB: D(0) },
      postedDispByCase: { caseA: D(400), caseB: D(0) },
      balanceByCase: { caseA: D(50), caseB: D(0) },
      expenseRows: [{ caseId: 'caseA', totalAmount: D(1431.1), paidTotal: D(0) }],
    });
    const svc = read(prisma);
    jest.spyOn(svc, 'computeOutstanding').mockImplementation(async (_db: any, _t: any, caseId: any) =>
      caseId === 'caseA' ? D(600) : D(0),
    );

    const res = await svc.getClientAccountingSummary('t1', 'client-1', 'TRY');

    // A grubu (müvekkile özgü)
    expect(res.clientScoped.payableNet).toBe('600');
    expect(res.clientScoped.paidToClient).toBe('400');
    expect(res.clientScoped.expenseRequested).toBe('1431.1');
    expect(res.clientScoped.expensePaid).toBe('0');
    expect(res.clientScoped.expenseUnpaid).toBe('1431.1');
    expect(res.clientScoped.offsettableNetPosition).toBe('-831.1'); // 600 − 1431.1 (bilgi)
    // B grubu (dosya geneli, distinct caseId)
    expect(res.caseScopedContext.debtorCollection).toBe('1000');
    expect(res.caseScopedContext.pendingDistribution).toBe('600'); // 1000 − 400
    expect(res.caseScopedContext.advanceBalance).toBe('50');
    expect(res.needsReview).toBe(false);
    // breakdown
    expect(res.caseBreakdown).toHaveLength(2);
    const a = res.caseBreakdown.find((x) => x.caseId === 'caseA')!;
    expect(a.payableNet).toBe('600');
    expect(a.debtorCollection).toBe('1000');
    expect(a.pendingDistribution).toBe('600');
    expect(a.expenseRequested).toBe('1431.1');
  });

  it('pendingDistribution negatif → needsReview true (sessiz sıfırlama YOK)', async () => {
    const prisma = buildSummaryPrisma({
      ccRows: [{ id: 'cc1', caseId: 'caseA', role: 'ALACAKLI', case: { fileNumber: '2026/1', executionFileNumber: null } }],
      payoutByCc: { cc1: D(0) },
      collectionByCase: { caseA: D(100) },
      postedDispByCase: { caseA: D(300) },
      balanceByCase: { caseA: D(0) },
      expenseRows: [],
    });
    const svc = read(prisma);
    jest.spyOn(svc, 'computeOutstanding').mockResolvedValue(D(0));

    const res = await svc.getClientAccountingSummary('t1', 'client-1');
    expect(res.caseScopedContext.pendingDistribution).toBe('-200');
    expect(res.needsReview).toBe(true);
    expect(res.caseBreakdown[0].needsReview).toBe(true);
  });

  it('aynı caseId iki CaseClient → B grubu DISTINCT caseId ile bir kez sayılır (çift sayma yok)', async () => {
    const prisma = buildSummaryPrisma({
      ccRows: [
        { id: 'cc1', caseId: 'caseA', role: 'ALACAKLI', case: { fileNumber: '2026/1', executionFileNumber: null } },
        { id: 'cc2', caseId: 'caseA', role: 'ORTAK_ALACAKLI', case: { fileNumber: '2026/1', executionFileNumber: null } },
      ],
      payoutByCc: { cc1: D(0), cc2: D(0) },
      collectionByCase: { caseA: D(1000) },
      postedDispByCase: { caseA: D(0) },
      balanceByCase: { caseA: D(0) },
      expenseRows: [],
    });
    const svc = read(prisma);
    jest.spyOn(svc, 'computeOutstanding').mockResolvedValue(D(0));

    const res = await svc.getClientAccountingSummary('t1', 'client-1');
    expect(res.caseScopedContext.debtorCollection).toBe('1000'); // 2000 DEĞİL
    expect(res.caseBreakdown).toHaveLength(1);
    expect(prisma.collection.aggregate).toHaveBeenCalledTimes(1); // distinct caseId
  });
});
