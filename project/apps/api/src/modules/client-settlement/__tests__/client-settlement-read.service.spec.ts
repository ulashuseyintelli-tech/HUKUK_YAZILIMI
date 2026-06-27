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
    collectionDispositionLine: {
      findMany: jest.fn().mockImplementation((args?: any) => {
        const rows = opts.payableLines ?? [];
        if (args?.where?.disposition?.manualReversalRequiredAt === null) {
          return Promise.resolve(rows.filter((row) => row.disposition?.manualReversalRequiredAt == null));
        }
        return Promise.resolve(rows);
      }),
    },
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

  it('manualReversalRequiredAt null POSTED CLIENT_PAYABLE outstanding icinde kalir', async () => {
    const prisma = buildPrisma({
      payableLines: [{ amount: D(1000), disposition: { collectionId: 'col1', manualReversalRequiredAt: null } }],
      confirmedCollections: [{ id: 'col1' }],
      paid: null,
    });
    const out = await read(prisma).computeOutstanding(prisma, 't1', 'case1', 'cc-A', 'TRY');
    expect(out.equals(D(1000))).toBe(true);
  });

  it('yalnız type=CLIENT_PAYABLE + disposition POSTED + scope tenant/case/currency sorgulanır (HELD/fee/firm hariç)', async () => {
    const prisma = buildPrisma();
    await read(prisma).computeOutstanding(prisma, 't1', 'case1', 'cc-A', 'TRY');
    const where = prisma.collectionDispositionLine.findMany.mock.calls[0][0].where;
    expect(where.type).toBe('CLIENT_PAYABLE');
    expect(where.caseClientId).toBe('cc-A');
    expect(where.disposition).toEqual(
      expect.objectContaining({ tenantId: 't1', caseId: 'case1', currency: 'TRY', status: 'POSTED', manualReversalRequiredAt: null }),
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

  it('manualReversalRequiredAt dolu POSTED CLIENT_PAYABLE outstanding disinda kalir', async () => {
    const prisma = buildPrisma({
      payableLines: [
        { amount: D(1000), disposition: { collectionId: 'col1', manualReversalRequiredAt: new Date('2026-06-27T00:00:00.000Z') } },
        { amount: D(250), disposition: { collectionId: 'col2', manualReversalRequiredAt: null } },
      ],
      confirmedCollections: [{ id: 'col1' }, { id: 'col2' }],
      paid: null,
    });
    const out = await read(prisma).computeOutstanding(prisma, 't1', 'case1', 'cc-A', 'TRY');
    expect(out.equals(D(250))).toBe(true);
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

// Faz A-MOV — birleşik hareket projection (read-only). Her kaynak findMany ayrı mock'lanır.
function buildMovPrisma(
  o: {
    ccRows?: any[];
    lines?: any[]; // collectionDispositionLine.findMany
    payouts?: any[];
    ers?: any[]; // expenseRequest.findMany
    eps?: any[]; // expensePayment.findMany
    colls?: any[]; // collection.findMany
    ledger?: any[]; // balanceLedger.findMany
  } = {},
) {
  return {
    caseClient: { findMany: jest.fn().mockResolvedValue(o.ccRows ?? []) },
    collectionDispositionLine: { findMany: jest.fn().mockResolvedValue(o.lines ?? []) },
    clientPayout: { findMany: jest.fn().mockResolvedValue(o.payouts ?? []) },
    expenseRequest: { findMany: jest.fn().mockResolvedValue(o.ers ?? []) },
    expensePayment: { findMany: jest.fn().mockResolvedValue(o.eps ?? []) },
    collection: { findMany: jest.fn().mockResolvedValue(o.colls ?? []) },
    balanceLedger: { findMany: jest.fn().mockResolvedValue(o.ledger ?? []) },
  } as any;
}

const CC_A = { id: 'cc1', caseId: 'caseA', case: { fileNumber: '2026/1' } };

describe('ClientSettlementReadService.getClientAccountingMovements (Faz A-MOV)', () => {
  it('1) ExpenseRequest → CLIENT_SPECIFIC, gerçek caseId + INCREASE_CLIENT_EXPENSE_DEBT', async () => {
    const prisma = buildMovPrisma({
      ccRows: [CC_A],
      ers: [{ id: 'er1', caseId: 'caseA', totalAmount: D(1431.1), currency: 'TRY', status: 'PENDING', createdAt: new Date('2026-03-01T10:00:00.000Z'), case: { fileNumber: '2026/1' } }],
    });
    const res = await read(prisma).getClientAccountingMovements('t1', 'client-1');
    expect(res.total).toBe(1);
    const m = res.items[0];
    expect(m.sourceType).toBe('EXPENSE_REQUEST');
    expect(m.scopeGroup).toBe('CLIENT_SPECIFIC');
    expect(m.caseId).toBe('caseA');
    expect(m.caseNo).toBe('2026/1');
    expect(m.clientEffect).toBe('INCREASE_CLIENT_EXPENSE_DEBT');
    expect(m.amount).toBe('1431.1');
    expect(m.status).toBe('PENDING');
  });

  it('2) CONFIRMED Collection → CASE_CONTEXT + NO_DIRECT_CLIENT_EFFECT (müvekkil carisine doğrudan etki yok)', async () => {
    const prisma = buildMovPrisma({
      ccRows: [CC_A],
      colls: [{ id: 'col1', amount: D(5000), date: new Date('2026-02-01T00:00:00.000Z'), caseId: 'caseA', status: 'CONFIRMED', description: null }],
    });
    const res = await read(prisma).getClientAccountingMovements('t1', 'client-1');
    const m = res.items[0];
    expect(m.sourceType).toBe('COLLECTION');
    expect(m.scopeGroup).toBe('CASE_CONTEXT');
    expect(m.clientEffect).toBe('NO_DIRECT_CLIENT_EFFECT');
    expect(m.status).toBe('CONFIRMED');
    expect(m.caseClientId).toBeNull();
  });

  it('3) POSTED CLIENT_PAYABLE satırı → CLIENT_SPECIFIC + INCREASE_CLIENT_PAYABLE (caseClientId line-level scope)', async () => {
    const prisma = buildMovPrisma({
      ccRows: [CC_A],
      lines: [{ id: 'l1', amount: D(600), caseClientId: 'cc1', note: 'dağıtım', disposition: { caseId: 'caseA', postedAt: new Date('2026-02-10T00:00:00.000Z') } }],
    });
    const res = await read(prisma).getClientAccountingMovements('t1', 'client-1');
    const m = res.items[0];
    expect(m.sourceType).toBe('COLLECTION_DISPOSITION');
    expect(m.scopeGroup).toBe('CLIENT_SPECIFIC');
    expect(m.clientEffect).toBe('INCREASE_CLIENT_PAYABLE');
    expect(m.caseClientId).toBe('cc1');
    expect(m.amount).toBe('600');
    expect(m.status).toBe('POSTED');
    // where: type=CLIENT_PAYABLE + caseClientId in [cc1] + disposition POSTED+tenant+currency (computeOutstanding ile aynı)
    const where = prisma.collectionDispositionLine.findMany.mock.calls[0][0].where;
    expect(where.type).toBe('CLIENT_PAYABLE');
    expect(where.caseClientId).toEqual({ in: ['cc1'] });
    expect(where.disposition).toEqual(expect.objectContaining({ tenantId: 't1', status: 'POSTED', currency: 'TRY' }));
  });

  it('4) RECORDED ClientPayout → CLIENT_SPECIFIC + DECREASE_CLIENT_PAYABLE', async () => {
    const prisma = buildMovPrisma({
      ccRows: [CC_A],
      payouts: [{ id: 'p1', amount: D(400), paidAt: new Date('2026-02-15T00:00:00.000Z'), caseId: 'caseA', caseClientId: 'cc1', note: 'nakit' }],
    });
    const res = await read(prisma).getClientAccountingMovements('t1', 'client-1');
    const m = res.items[0];
    expect(m.sourceType).toBe('CLIENT_PAYOUT');
    expect(m.scopeGroup).toBe('CLIENT_SPECIFIC');
    expect(m.clientEffect).toBe('DECREASE_CLIENT_PAYABLE');
    expect(m.caseClientId).toBe('cc1');
    expect(m.description).toBe('nakit');
  });

  it('5) ExpensePayment → CLIENT_SPECIFIC + DECREASE_CLIENT_EXPENSE_DEBT (expenseRequest.clientId üstünden)', async () => {
    const prisma = buildMovPrisma({
      ccRows: [CC_A],
      eps: [{ id: 'ep1', amount: D(500), paymentDate: new Date('2026-02-20T00:00:00.000Z'), reference: 'DEKONT-9', expenseRequest: { caseId: 'caseA', currency: 'TRY', case: { fileNumber: '2026/1' } } }],
    });
    const res = await read(prisma).getClientAccountingMovements('t1', 'client-1');
    const m = res.items[0];
    expect(m.sourceType).toBe('EXPENSE_PAYMENT');
    expect(m.scopeGroup).toBe('CLIENT_SPECIFIC');
    expect(m.clientEffect).toBe('DECREASE_CLIENT_EXPENSE_DEBT');
    expect(m.caseNo).toBe('2026/1');
    expect(m.description).toBe('DEKONT-9');
    expect(m.amount).toBe('500');
  });

  it('6) BalanceLedger → CASE_CONTEXT + NO_DIRECT_CLIENT_EFFECT (status=type, caseBalance.caseId)', async () => {
    const prisma = buildMovPrisma({
      ccRows: [CC_A],
      ledger: [{ id: 'bl1', amount: D(250), type: 'DEBIT', createdAt: new Date('2026-02-05T00:00:00.000Z'), description: 'icra harcı', caseBalance: { caseId: 'caseA' } }],
    });
    const res = await read(prisma).getClientAccountingMovements('t1', 'client-1');
    const m = res.items[0];
    expect(m.sourceType).toBe('CASE_BALANCE');
    expect(m.scopeGroup).toBe('CASE_CONTEXT');
    expect(m.clientEffect).toBe('NO_DIRECT_CLIENT_EFFECT');
    expect(m.status).toBe('DEBIT');
    expect(m.caseId).toBe('caseA');
  });

  it('7) aynı caseId iki CaseClient → CASE_CONTEXT hareketi tek kez (DISTINCT caseId, çift sayma yok)', async () => {
    const prisma = buildMovPrisma({
      ccRows: [CC_A, { id: 'cc2', caseId: 'caseA', case: { fileNumber: '2026/1' } }],
      colls: [{ id: 'col1', amount: D(1000), date: new Date('2026-02-01T00:00:00.000Z'), caseId: 'caseA', status: 'CONFIRMED', description: null }],
    });
    const res = await read(prisma).getClientAccountingMovements('t1', 'client-1');
    expect(res.items.filter((m) => m.sourceType === 'COLLECTION')).toHaveLength(1);
    // collection sorgusu DISTINCT caseId ile bir kez: caseId in [caseA]
    expect(prisma.collection.findMany.mock.calls[0][0].where.caseId).toEqual({ in: ['caseA'] });
  });

  it('8) deterministik sıralama (occurredAt desc, eşitlikte sourceType→sourceId) + stabil sayfalama', async () => {
    const prisma = buildMovPrisma({
      ccRows: [CC_A],
      colls: [
        { id: 'colB', amount: D(1), date: new Date('2026-01-01T00:00:00.000Z'), caseId: 'caseA', status: 'CONFIRMED', description: null },
        { id: 'colA', amount: D(2), date: new Date('2026-03-01T00:00:00.000Z'), caseId: 'caseA', status: 'CONFIRMED', description: null },
      ],
      payouts: [{ id: 'pA', amount: D(3), paidAt: new Date('2026-03-01T00:00:00.000Z'), caseId: 'caseA', caseClientId: 'cc1', note: null }],
    });
    // 2026-03-01: CLIENT_PAYOUT(pA) < COLLECTION(colA) → pA önce; sonra 2026-01-01 colB
    const p1 = await read(prisma).getClientAccountingMovements('t1', 'client-1', { pageSize: 2, page: 1 });
    expect(p1.total).toBe(3);
    expect(p1.items.map((m) => m.sourceId)).toEqual(['pA', 'colA']);
    const p2 = await read(prisma).getClientAccountingMovements('t1', 'client-1', { pageSize: 2, page: 2 });
    expect(p2.items.map((m) => m.sourceId)).toEqual(['colB']);
    expect(p2.page).toBe(2);
  });

  it('9) tenant sınırı — tüm kaynak sorguları tenantId (veya disposition/expenseRequest relation) ile scope', async () => {
    const prisma = buildMovPrisma({ ccRows: [CC_A] });
    await read(prisma).getClientAccountingMovements('t1', 'client-1');
    expect(prisma.caseClient.findMany.mock.calls[0][0].where.client).toEqual({ tenantId: 't1' });
    expect(prisma.collectionDispositionLine.findMany.mock.calls[0][0].where.disposition.tenantId).toBe('t1');
    expect(prisma.clientPayout.findMany.mock.calls[0][0].where.tenantId).toBe('t1');
    expect(prisma.expenseRequest.findMany.mock.calls[0][0].where.tenantId).toBe('t1');
    expect(prisma.expensePayment.findMany.mock.calls[0][0].where.expenseRequest.tenantId).toBe('t1');
    expect(prisma.collection.findMany.mock.calls[0][0].where.tenantId).toBe('t1');
    expect(prisma.balanceLedger.findMany.mock.calls[0][0].where.tenantId).toBe('t1');
  });

  it('10) CANCELLED/REFUNDED Collection → doğru etiket + status (gizlenmez)', async () => {
    const prisma = buildMovPrisma({
      ccRows: [CC_A],
      colls: [
        { id: 'colC', amount: D(100), date: new Date('2026-02-02T00:00:00.000Z'), caseId: 'caseA', status: 'CANCELLED', description: null },
        { id: 'colR', amount: D(50), date: new Date('2026-02-03T00:00:00.000Z'), caseId: 'caseA', status: 'REFUNDED', description: null },
      ],
    });
    const res = await read(prisma).getClientAccountingMovements('t1', 'client-1');
    const c = res.items.find((m) => m.sourceId === 'colC')!;
    expect(c.status).toBe('CANCELLED');
    expect(c.label).toMatch(/iptal/i);
    const r = res.items.find((m) => m.sourceId === 'colR')!;
    expect(r.status).toBe('REFUNDED');
    expect(r.label).toMatch(/iade/i);
    expect(prisma.collection.findMany.mock.calls[0][0].where.status).toEqual({ in: ['CONFIRMED', 'CANCELLED', 'REFUNDED'] });
  });

  it('11) group=CLIENT_SPECIFIC → yalnız A grubu döner', async () => {
    const prisma = buildMovPrisma({
      ccRows: [CC_A],
      ers: [{ id: 'er1', caseId: 'caseA', totalAmount: D(100), currency: 'TRY', status: 'PENDING', createdAt: new Date('2026-03-01T00:00:00.000Z'), case: { fileNumber: '2026/1' } }],
      colls: [{ id: 'col1', amount: D(1000), date: new Date('2026-02-01T00:00:00.000Z'), caseId: 'caseA', status: 'CONFIRMED', description: null }],
    });
    const res = await read(prisma).getClientAccountingMovements('t1', 'client-1', { group: 'CLIENT_SPECIFIC' });
    expect(res.items.every((m) => m.scopeGroup === 'CLIENT_SPECIFIC')).toBe(true);
    expect(res.total).toBe(1);
    expect(res.items[0].sourceType).toBe('EXPENSE_REQUEST');
  });

  it('12) scope=case → tek dosyaya daraltır (caseClientId + distinct caseId + ER/EP caseId filtresi)', async () => {
    const prisma = buildMovPrisma({
      ccRows: [CC_A, { id: 'cc2', caseId: 'caseB', case: { fileNumber: '2026/2' } }],
    });
    await read(prisma).getClientAccountingMovements('t1', 'client-1', { scope: 'case', caseId: 'caseA' });
    expect(prisma.collectionDispositionLine.findMany.mock.calls[0][0].where.caseClientId).toEqual({ in: ['cc1'] });
    expect(prisma.collection.findMany.mock.calls[0][0].where.caseId).toEqual({ in: ['caseA'] });
    expect(prisma.expenseRequest.findMany.mock.calls[0][0].where.caseId).toBe('caseA');
    expect(prisma.expensePayment.findMany.mock.calls[0][0].where.expenseRequest.caseId).toBe('caseA');
  });

  it('13) from/to tarih aralığı → bellek-içi filtre (aralık dışı düşer)', async () => {
    const prisma = buildMovPrisma({
      ccRows: [CC_A],
      colls: [
        { id: 'old', amount: D(1), date: new Date('2025-12-01T00:00:00.000Z'), caseId: 'caseA', status: 'CONFIRMED', description: null },
        { id: 'in', amount: D(2), date: new Date('2026-02-15T00:00:00.000Z'), caseId: 'caseA', status: 'CONFIRMED', description: null },
      ],
    });
    const res = await read(prisma).getClientAccountingMovements('t1', 'client-1', { from: '2026-01-01', to: '2026-03-01' });
    expect(res.items.map((m) => m.sourceId)).toEqual(['in']);
  });

  it('14) mutation YOK — create/update/delete çağrısı yapılmaz', async () => {
    const prisma = buildMovPrisma({ ccRows: [CC_A] });
    await read(prisma).getClientAccountingMovements('t1', 'client-1');
    for (const model of ['caseClient', 'collectionDispositionLine', 'clientPayout', 'expenseRequest', 'expensePayment', 'collection', 'balanceLedger']) {
      expect((prisma as any)[model].create).toBeUndefined();
      expect((prisma as any)[model].update).toBeUndefined();
      expect((prisma as any)[model].delete).toBeUndefined();
    }
  });
});
