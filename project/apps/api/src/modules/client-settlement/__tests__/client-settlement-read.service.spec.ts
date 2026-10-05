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
    // TM3 Faz C C-1 — offset no-op (yokken sonuç birebir aynı): aggregate→null, findMany→[]
    clientOffset: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null } }),
      findMany: jest.fn().mockResolvedValue([]),
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

  it('C-1 offset: payable − Σ APPLY + Σ REVERSAL read-time düşülür (1000 − 200 + 50 = 850)', async () => {
    const prisma = buildPrisma({
      payableLines: [{ amount: D(1000), disposition: { collectionId: 'col1' } }],
      confirmedCollections: [{ id: 'col1' }],
      paid: D(0),
    });
    // kind'e göre APPLY=200 / REVERSAL=50; payableCaseId scope'lu sorgu
    prisma.clientOffset.aggregate = jest.fn().mockImplementation((args: any) =>
      Promise.resolve({ _sum: { amount: args.where?.kind === 'APPLY' ? D(200) : D(50) } }),
    );
    const out = await read(prisma).computeOutstanding(prisma, 't1', 'case1', 'cc-A', 'TRY');
    expect(out.equals(D(850))).toBe(true);
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
        { id: 'cc-A', caseId: 'case1', role: 'ALACAKLI', case: { fileNumber: '2024/1', executionFileNumber: 'E-1', caseDate: new Date('2026-01-15T00:00:00.000Z'), currency: 'TRY' } },
        { id: 'cc-B', caseId: 'case2', role: 'ORTAK_ALACAKLI', case: { fileNumber: '2024/2', executionFileNumber: null, caseDate: null, currency: 'TRY' } },
      ],
    });
    const res = await read(prisma).listClientCases('t1', 'client-1');
    expect(res.items).toEqual([
      { caseId: 'case1', caseClientId: 'cc-A', role: 'ALACAKLI', caseNumber: '2024/1', executionFileNumber: 'E-1', currency: 'TRY', caseOpenedAt: '2026-01-15T00:00:00.000Z' },
      { caseId: 'case2', caseClientId: 'cc-B', role: 'ORTAK_ALACAKLI', caseNumber: '2024/2', executionFileNumber: null, currency: 'TRY', caseOpenedAt: null },
    ]);
  });

  it('currency dosyanın kayıtlı para birimidir — dövizli dosya TRY damgalanmaz (dosya başına, sabit değil)', async () => {
    const prisma = buildPrisma({
      cases: [
        { id: 'cc-U', caseId: 'caseU', role: 'ALACAKLI', case: { fileNumber: '2026/1-USD', executionFileNumber: null, caseDate: null, currency: 'USD' } },
        { id: 'cc-E', caseId: 'caseE', role: 'ORTAK_ALACAKLI', case: { fileNumber: '2026/2-EUR', executionFileNumber: null, caseDate: null, currency: 'EUR' } },
        { id: 'cc-T', caseId: 'caseT', role: 'ALACAKLI', case: { fileNumber: '2026/3-TL', executionFileNumber: null, caseDate: null, currency: 'TRY' } },
      ],
    });
    const res = await read(prisma).listClientCases('t1', 'client-1');
    expect(res.items.map((i) => [i.caseNumber, i.currency])).toEqual([
      ['2026/1-USD', 'USD'],
      ['2026/2-EUR', 'EUR'],
      ['2026/3-TL', 'TRY'],
    ]);
  });

  it('currency sorguda seçilir (Case.currency); dosya ilişkisi yoksa TRY geri düşüşü korunur', async () => {
    const prisma = buildPrisma({ cases: [{ id: 'cc-X', caseId: 'caseX', role: 'ALACAKLI', case: null }] });
    const res = await read(prisma).listClientCases('t1', 'client-1');
    expect(prisma.caseClient.findMany.mock.calls[0][0].select.case.select.currency).toBe(true);
    expect(res.items[0].currency).toBe('TRY');
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
  // Tahsilatı iptal edilmiş (manuel geri alma işaretli) KESİNLEŞMİŞ dağıtım toplamı. Sorgu `manualReversalRequiredAt: null`
  // süzgeci taşımıyorsa bu tutar da toplanır (iptal işaretini esas almayan eski davranışı yakalar).
  markedPostedDispByCase?: Record<string, Prisma.Decimal>;
  balanceByCase?: Record<string, Prisma.Decimal>;
  expenseRows?: any[];
  expenseOffsetApply?: Record<string, Prisma.Decimal>; // FAZ-1b: per-request offset APPLY (expenseRequestId)
  // G1: istenen para biriminin DIŞINDAKİ kayıtlar (varsayılan: yok). groupBy / findMany sonuçları sorgu biçiminde.
  foreign?: {
    collection?: any[];
    disposition?: any[];
    payout?: any[];
    expense?: any[];
    balances?: any[];
    ledger?: any[];
    offsets?: any[];
  };
}) {
  const foreign = o.foreign ?? {};
  return {
    // Gerçek Case kaydı her zaman para birimi taşır; fikstürde belirtilmemişse TRY.
    caseClient: { findMany: jest.fn().mockResolvedValue(o.ccRows.map((r) => ({ ...r, case: { currency: 'TRY', ...r.case } }))) },
    clientPayout: {
      aggregate: jest.fn().mockImplementation(({ where }: any) =>
        Promise.resolve({ _sum: { amount: o.payoutByCc?.[where.caseClientId] ?? null } }),
      ),
      groupBy: jest.fn().mockResolvedValue(foreign.payout ?? []),
    },
    collection: {
      aggregate: jest.fn().mockImplementation(({ where }: any) =>
        Promise.resolve({ _sum: { amount: o.collectionByCase?.[where.caseId] ?? null } }),
      ),
      findMany: jest.fn().mockResolvedValue([]),
      groupBy: jest.fn().mockResolvedValue(foreign.collection ?? []),
    },
    collectionDisposition: {
      aggregate: jest.fn().mockImplementation(({ where }: any) => {
        const live = o.postedDispByCase?.[where.caseId];
        const marked = where.manualReversalRequiredAt === null ? undefined : o.markedPostedDispByCase?.[where.caseId];
        return Promise.resolve({ _sum: { totalAmount: live === undefined && marked === undefined ? null : (live ?? D(0)).plus(marked ?? D(0)) } });
      }),
      groupBy: jest.fn().mockResolvedValue(foreign.disposition ?? []),
    },
    caseBalance: {
      findFirst: jest.fn().mockImplementation(({ where }: any) =>
        Promise.resolve(o.balanceByCase?.[where.caseId] != null ? { balance: o.balanceByCase[where.caseId] } : null),
      ),
      findMany: jest.fn().mockResolvedValue(foreign.balances ?? []),
    },
    balanceLedger: { groupBy: jest.fn().mockResolvedValue(foreign.ledger ?? []) },
    expenseRequest: {
      findMany: jest.fn().mockResolvedValue(o.expenseRows ?? []),
      groupBy: jest.fn().mockResolvedValue(foreign.expense ?? []),
    },
    collectionDispositionLine: { findMany: jest.fn().mockResolvedValue([]) },
    // TM3 Faz C C-1 — getClientAccountingSummary offset offRows fetch (default: yok → offsetNet 0, sonuç değişmez).
    clientOffset: {
      // İlk çağrı özet toplamı (offRows), ikinci çağrı G1 para birimi gözlemi: kapsam dışı mahsup yoksa ikisi de boş.
      findMany: jest.fn().mockImplementation((args: any) =>
        Promise.resolve(args?.where?.currency?.not ? (foreign.offsets ?? []) : []),
      ),
      // FAZ-1b: per-request computeExpenseRemaining offset bacağı (expenseRequestId APPLY → expenseOffsetApply).
      aggregate: jest.fn().mockImplementation(({ where }: any) =>
        Promise.resolve({ _sum: { amount: where?.expenseRequestId && where.kind === 'APPLY' ? (o.expenseOffsetApply?.[where.expenseRequestId] ?? null) : null } }),
      ),
    },
    // FAZ-1b: reimbursement application terimi (default: yok → null = 0).
    collectionDispositionExpenseApplication: { aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null } }) },
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
      expenseRows: [{ id: 'er-A', caseId: 'caseA', totalAmount: D(1431.1), paidTotal: D(0) }],
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

  it('C-1 INVARIANT: APPLY offset payableNet ve expenseUnpaid\'i AYNI tutarda düşürür → offsettableNetPosition DEĞİŞMEZ', async () => {
    // No-offset referans (test #303 ile aynı veri): payableNet=600, expUnpaid=1431.1 → position=-831.1
    // APPLY 300: computeOutstanding ZATEN 300'e düşmüş döner (offset payable bacağı); summary expense bacağını düşer.
    const prisma = buildSummaryPrisma({
      ccRows: [{ id: 'cc1', caseId: 'caseA', role: 'ALACAKLI', case: { fileNumber: '2026/1', executionFileNumber: null } }],
      payoutByCc: { cc1: D(0) },
      collectionByCase: { caseA: D(0) },
      postedDispByCase: { caseA: D(0) },
      balanceByCase: { caseA: D(0) },
      expenseRows: [{ id: 'er-A', caseId: 'caseA', totalAmount: D(1431.1), paidTotal: D(0) }],
      expenseOffsetApply: { 'er-A': D(300) }, // FAZ-1b: per-request computeExpenseRemaining offset bacağı (expUnpaid 300 düşer)
    });
    prisma.clientOffset.findMany = jest.fn().mockResolvedValue([
      { amount: D(300), kind: 'APPLY', payableCaseId: 'caseA', expenseCaseId: 'caseA' },
    ]);
    const svc = read(prisma);
    // computeOutstanding offset-düşülmüş payableNet döner (600 − 300 = 300)
    jest.spyOn(svc, 'computeOutstanding').mockResolvedValue(D(300));

    const res = await svc.getClientAccountingSummary('t1', 'client-1', 'TRY');
    expect(res.clientScoped.payableNet).toBe('300');          // 600 − 300 (offset payable bacağı)
    expect(res.clientScoped.expenseUnpaid).toBe('1131.1');     // 1431.1 − 300 (offset masraf bacağı)
    expect(res.clientScoped.offsetApplied).toBe('300');        // Σ net offset (APPLY − REVERSAL)
    expect(res.clientScoped.offsettableNetPosition).toBe('-831.1'); // INVARIANT: no-offset (#303) ile AYNI
    const a = res.caseBreakdown.find((x) => x.caseId === 'caseA')!;
    expect(a.offsetPayableApplied).toBe('300');
    expect(a.offsetExpenseApplied).toBe('300');
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

  // Satır 7 (owner kararı 6): tahsilatı iptal edilen KESİNLEŞMİŞ dağıtım, diğer okuyucularla AYNI iptal işaretiyle
  // (CollectionDisposition.manualReversalRequiredAt) hesaptan çıkar. Üç durum AYRI kilitlenir; negatif KIRPILMAZ.
  describe('iptal işaretli kesinleşmiş dağıtım (manualReversalRequiredAt) — dağıtım bekleyen', () => {
    const cc = [{ id: 'cc1', caseId: 'caseA', role: 'ALACAKLI', case: { fileNumber: '2026/1', executionFileNumber: null } }];
    async function summary(o: { collection: number; live: number; marked: number }) {
      const prisma = buildSummaryPrisma({
        ccRows: cc,
        payoutByCc: { cc1: D(0) },
        collectionByCase: { caseA: D(o.collection) },
        postedDispByCase: { caseA: D(o.live) },
        markedPostedDispByCase: { caseA: D(o.marked) },
        balanceByCase: { caseA: D(0) },
      });
      const svc = read(prisma);
      jest.spyOn(svc, 'computeOutstanding').mockResolvedValue(D(0));
      const res = await svc.getClientAccountingSummary('t1', 'client-1');
      return { res, prisma };
    }

    it('sözleşme: kesinleşmiş dağıtım toplamı, diğer okuyucularla aynı süzgeci taşır (status POSTED + manualReversalRequiredAt null)', async () => {
      const { prisma } = await summary({ collection: 0, live: 0, marked: 3000 });
      const where = prisma.collectionDisposition.aggregate.mock.calls[0][0].where;
      expect(where).toEqual({ tenantId: 't1', caseId: 'caseA', currency: 'TRY', status: 'POSTED', manualReversalRequiredAt: null });
    });

    it('1) tahsilat iptali: tahsilat 3.000 iptal (onaylı 0), dağıtım 3.000 işaretli → 0 ve uyarı YOK (negatife düşmez)', async () => {
      const { res } = await summary({ collection: 0, live: 0, marked: 3000 });
      expect(res.caseScopedContext.pendingDistribution).toBe('0');
      expect(res.caseScopedContext.debtorCollection).toBe('0');
      expect(res.needsReview).toBe(false);
      expect(res.caseBreakdown[0].needsReview).toBe(false);
    });

    it('2) kısmi dağıtım: iki tahsilattan biri iptal — onaylı 1.000, canlı dağıtım 1.000, iptal edilen 600 işaretli → 0 ve uyarı YOK', async () => {
      const { res } = await summary({ collection: 1000, live: 1000, marked: 600 });
      expect(res.caseScopedContext.pendingDistribution).toBe('0');
      expect(res.needsReview).toBe(false);
    });

    it('3) gerçek bekleyen tutar GİZLENMEZ: iptal edilen 600 dağıtım + dağıtılmamış onaylı 1.000 tahsilat → 1.000', async () => {
      const { res } = await summary({ collection: 1000, live: 0, marked: 600 });
      expect(res.caseScopedContext.pendingDistribution).toBe('1000');
      expect(res.caseBreakdown[0].pendingDistribution).toBe('1000');
      expect(res.caseBreakdown[0].pendingDistributionExcludingHeld).toBe('1000');
      expect(res.needsReview).toBe(false);
    });

    it('4) gerçek tutarsızlık hâlâ GÖRÜNÜR: işaretsiz dağıtım onaylı tahsilatı aşarsa negatif kalır ve uyarı verir (kırpma YOK)', async () => {
      const { res } = await summary({ collection: 100, live: 300, marked: 500 });
      expect(res.caseScopedContext.pendingDistribution).toBe('-200');
      expect(res.needsReview).toBe(true);
      expect(res.caseBreakdown[0].needsReview).toBe(true);
    });
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

// G1 — Genel Cari para birimi kapsamı: sunucu, istenen para biriminin DIŞINDAKİ kayıt / dosyaları bildirir (tutar çevirmez / toplamaz).
describe('ClientSettlementReadService.getClientAccountingSummary — G1 para birimi kapsamı', () => {
  const trCase = { id: 'cc-try', caseId: 'case-try', role: 'ALACAKLI', case: { fileNumber: '2026/1', executionFileNumber: null, currency: 'TRY' } };
  const usdCase = { id: 'cc-usd', caseId: 'case-usd', role: 'ALACAKLI', case: { fileNumber: '2026/2-USD', executionFileNumber: null, currency: 'USD' } };
  const g = (caseId: string, currency: string | null, count = 1) => ({ caseId, currency, _count: { _all: count } });

  async function summaryOf(prisma: any, currency?: string) {
    const svc = read(prisma);
    jest.spyOn(svc, 'computeOutstanding').mockResolvedValue(D(0));
    return svc.getClientAccountingSummary('t1', 'client-1', currency);
  }

  it('yalnız TL dosyalar: kapsam dışı kayıt YOK, her dosya TAM, açıklama yok; mevcut sayılar değişmez', async () => {
    const prisma = buildSummaryPrisma({
      ccRows: [trCase],
      payoutByCc: { 'cc-try': D(400) },
      collectionByCase: { 'case-try': D(1000) },
      postedDispByCase: { 'case-try': D(400) },
      balanceByCase: { 'case-try': D(50) },
    });

    const res = await summaryOf(prisma);

    expect(res.paraBirimiDurumu).toEqual({
      istenenParaBirimi: 'TRY',
      kapsamDisiKayitVar: false,
      kapsamDisiParaBirimleri: [],
      kapsamDisiDosyaSayisi: 0,
      kismiKapsamDosyaSayisi: 0,
      belirsizParaBirimiKayitSayisi: 0,
      yalnizIstenenParaBirimi: true,
      mesaj: null,
    });
    expect(res.caseBreakdown[0].paraBirimiKapsami).toEqual({
      kapsam: 'TAM',
      dosyaParaBirimi: 'TRY',
      kapsamDisiParaBirimleri: [],
      belirsizParaBirimiKayitSayisi: 0,
      mesaj: null,
    });
    // gerçek sıfır / gerçek değerler olduğu gibi
    expect(res.clientScoped.paidToClient).toBe('400');
    expect(res.caseScopedContext.debtorCollection).toBe('1000');
    expect(res.caseScopedContext.advanceBalance).toBe('50');
  });

  it('USD dosya TL görünümünde: DISI olarak ayrılır, sıfır borçlu gibi gösterilemez; TL dosya TAM kalır; çevirme / birleştirme yok', async () => {
    const prisma = buildSummaryPrisma({
      ccRows: [trCase, usdCase],
      payoutByCc: { 'cc-try': D(0), 'cc-usd': D(0) },
      collectionByCase: { 'case-try': D(1000) },
      postedDispByCase: { 'case-try': D(0) },
      balanceByCase: {},
      foreign: { collection: [g('case-usd', 'USD')], disposition: [g('case-usd', 'USD')] },
    });

    const res = await summaryOf(prisma);

    const usd = res.caseBreakdown.find((r) => r.caseId === 'case-usd')!;
    expect(usd.paraBirimiKapsami.kapsam).toBe('DISI');
    expect(usd.paraBirimiKapsami.dosyaParaBirimi).toBe('USD');
    expect(usd.paraBirimiKapsami.kapsamDisiParaBirimleri).toEqual(['USD']);
    expect(usd.paraBirimiKapsami.mesaj).toContain('USD');
    expect(usd.paraBirimiKapsami.mesaj).toContain('toplamına dahil değildir');
    expect(usd.paraBirimiKapsami.mesaj).toContain('sıfır anlamına gelmez');
    expect(res.caseBreakdown.find((r) => r.caseId === 'case-try')!.paraBirimiKapsami.kapsam).toBe('TAM');

    expect(res.paraBirimiDurumu).toMatchObject({
      istenenParaBirimi: 'TRY',
      kapsamDisiKayitVar: true,
      kapsamDisiParaBirimleri: ['USD'],
      kapsamDisiDosyaSayisi: 1,
      kismiKapsamDosyaSayisi: 0,
      yalnizIstenenParaBirimi: true,
    });
    expect(res.paraBirimiDurumu.mesaj).toContain('yalnız TRY kayıtlarını kapsar');
    expect(res.paraBirimiDurumu.mesaj).toContain('USD');
    expect(res.paraBirimiDurumu.mesaj).toContain('çevrilmedi ve birleştirilmedi');
    // TL toplamına döviz eklenmedi: toplamlar yalnız TL dosyanın tahsilatı
    expect(res.caseScopedContext.debtorCollection).toBe('1000');
  });

  it('TL dosyada başka para biriminde kayıt (ödeme + masraf + defter + mahsup): KISMI; değerler yalnız TL kayıtları', async () => {
    const prisma = buildSummaryPrisma({
      ccRows: [trCase],
      payoutByCc: { 'cc-try': D(0) },
      collectionByCase: { 'case-try': D(0) },
      postedDispByCase: { 'case-try': D(0) },
      balanceByCase: { 'case-try': D(0) },
      foreign: {
        payout: [g('case-try', 'USD', 2)],
        expense: [g('case-try', 'EUR')],
        balances: [{ id: 'cb-1', caseId: 'case-try', currency: 'TRY', balance: D(0) }],
        ledger: [{ caseBalanceId: 'cb-1', currency: 'USD', _count: { _all: 3 } }],
        offsets: [{ payableCaseId: 'case-try', expenseCaseId: 'case-try', currency: 'CHF' }],
      },
    });

    const res = await summaryOf(prisma);

    const row = res.caseBreakdown[0].paraBirimiKapsami;
    expect(row.kapsam).toBe('KISMI');
    expect(row.kapsamDisiParaBirimleri).toEqual(['CHF', 'EUR', 'USD']);
    expect(row.mesaj).toContain('CHF, EUR, USD cinsinden kayıtlar');
    expect(res.paraBirimiDurumu).toMatchObject({ kapsamDisiDosyaSayisi: 0, kismiKapsamDosyaSayisi: 1, kapsamDisiKayitVar: true });
  });

  it('para birimi belirlenemeyen kayıt sıfır / TL sayılmaz: ayrıca sayılır ve KISMI yapar', async () => {
    const prisma = buildSummaryPrisma({
      ccRows: [trCase],
      payoutByCc: { 'cc-try': D(0) },
      foreign: { payout: [g('case-try', '', 2)], expense: [g('case-try', null)] },
    });

    const res = await summaryOf(prisma);

    expect(res.caseBreakdown[0].paraBirimiKapsami).toMatchObject({
      kapsam: 'KISMI',
      kapsamDisiParaBirimleri: [],
      belirsizParaBirimiKayitSayisi: 3,
    });
    expect(res.paraBirimiDurumu).toMatchObject({ kapsamDisiKayitVar: true, belirsizParaBirimiKayitSayisi: 3, kapsamDisiParaBirimleri: [] });
    expect(res.paraBirimiDurumu.mesaj).toContain('para birimi belirlenemeyen 3 kaydı');
  });

  it('CaseBalance: yalnız SIFIR OLMAYAN başka para birimli bakiye kayıt sayılır (sıfır bakiye gürültü üretmez)', async () => {
    const prisma = buildSummaryPrisma({
      ccRows: [trCase, usdCase],
      foreign: {
        balances: [
          { id: 'cb-a', caseId: 'case-try', currency: 'USD', balance: D(0) },
          { id: 'cb-b', caseId: 'case-usd', currency: 'USD', balance: D(300) },
        ],
      },
    });

    const res = await summaryOf(prisma);

    expect(res.caseBreakdown.find((r) => r.caseId === 'case-try')!.paraBirimiKapsami.kapsam).toBe('TAM');
    expect(res.caseBreakdown.find((r) => r.caseId === 'case-usd')!.paraBirimiKapsami.kapsam).toBe('DISI');
  });

  it('istenen para birimi USD ise ölçüt tersine döner: TL dosya DISI, USD dosya TAM', async () => {
    const prisma = buildSummaryPrisma({ ccRows: [trCase, usdCase] });

    const res = await summaryOf(prisma, 'USD');

    expect(res.paraBirimiDurumu.istenenParaBirimi).toBe('USD');
    expect(res.paraBirimiDurumu.kapsamDisiParaBirimleri).toEqual(['TRY']);
    expect(res.caseBreakdown.find((r) => r.caseId === 'case-try')!.paraBirimiKapsami.kapsam).toBe('DISI');
    expect(res.caseBreakdown.find((r) => r.caseId === 'case-usd')!.paraBirimiKapsami.kapsam).toBe('TAM');
  });

  it('büro + müvekkil sınırı: her gözlem sorgusu tenant, müvekkilin dosyaları ve "istenenden farklı para birimi" ile kapsamlıdır', async () => {
    const prisma = buildSummaryPrisma({ ccRows: [trCase, usdCase] });

    await summaryOf(prisma);

    const notTry = { not: 'TRY' };
    const caseScope = { in: ['case-try', 'case-usd'] };
    expect(prisma.collection.groupBy.mock.calls[0][0].where).toEqual({ tenantId: 't1', caseId: caseScope, status: 'CONFIRMED', currency: notTry });
    expect(prisma.collectionDisposition.groupBy.mock.calls[0][0].where).toEqual({ tenantId: 't1', caseId: caseScope, status: 'POSTED', currency: notTry });
    expect(prisma.clientPayout.groupBy.mock.calls[0][0].where).toEqual({
      tenantId: 't1',
      caseId: caseScope,
      caseClientId: { in: ['cc-try', 'cc-usd'] },
      status: 'RECORDED',
      currency: notTry,
    });
    expect(prisma.expenseRequest.groupBy.mock.calls[0][0].where).toEqual({
      tenantId: 't1',
      clientId: 'client-1',
      caseId: caseScope,
      status: { not: 'CANCELLED' },
      currency: notTry,
    });
    expect(prisma.caseBalance.findMany.mock.calls[0][0].where).toEqual({ tenantId: 't1', caseId: caseScope });
    const offsetCall = prisma.clientOffset.findMany.mock.calls.find((c: any[]) => c[0]?.where?.currency?.not);
    expect(offsetCall![0].where).toEqual({ tenantId: 't1', clientId: 'client-1', currency: notTry });
  });

  it('TL toplamına döviz eklenmez: avans bakiyesi ve masraf talepleri yalnız istenen para biriminde okunur', async () => {
    const prisma = buildSummaryPrisma({ ccRows: [trCase], balanceByCase: { 'case-try': D(50) } });

    await summaryOf(prisma);

    expect(prisma.caseBalance.findFirst.mock.calls[0][0].where).toEqual({ tenantId: 't1', caseId: 'case-try', currency: 'TRY' });
    expect(prisma.expenseRequest.findMany.mock.calls[0][0].where).toEqual({
      tenantId: 't1',
      clientId: 'client-1',
      status: { not: 'CANCELLED' },
      currency: 'TRY',
    });
  });

  it('eligible dosyası olmayan müvekkil: gözlem sorgusu çalışmaz, kapsam dışı kayıt yok', async () => {
    const prisma = buildSummaryPrisma({ ccRows: [] });

    const res = await summaryOf(prisma);

    expect(prisma.collection.groupBy).not.toHaveBeenCalled();
    expect(res.paraBirimiDurumu.kapsamDisiKayitVar).toBe(false);
    expect(res.caseBreakdown).toEqual([]);
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
    collectionDispositionLine: {
      findMany: jest.fn().mockImplementation((args?: any) => {
        const rows = o.lines ?? [];
        if (args?.where?.disposition?.manualReversalRequiredAt === null) {
          return Promise.resolve(rows.filter((row) => row.disposition?.manualReversalRequiredAt == null));
        }
        return Promise.resolve(rows);
      }),
    },
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
    expect(where.disposition).toEqual(expect.objectContaining({ tenantId: 't1', status: 'POSTED', currency: 'TRY', manualReversalRequiredAt: null }));
  });
  it('3b) manualReversalRequiredAt dolu POSTED CLIENT_PAYABLE hareket projection disinda kalir', async () => {
    const prisma = buildMovPrisma({
      ccRows: [CC_A],
      lines: [
        { id: 'l-ok', amount: D(250), caseClientId: 'cc1', note: 'aktif', disposition: { caseId: 'caseA', postedAt: new Date('2026-02-10T00:00:00.000Z'), manualReversalRequiredAt: null } },
        { id: 'l-blocked', amount: D(900), caseClientId: 'cc1', note: 'manual reversal', disposition: { caseId: 'caseA', postedAt: new Date('2026-02-11T00:00:00.000Z'), manualReversalRequiredAt: new Date('2026-06-27T00:00:00.000Z') } },
      ],
    });

    const res = await read(prisma).getClientAccountingMovements('t1', 'client-1');

    expect(res.items.filter((m) => m.sourceType === 'COLLECTION_DISPOSITION')).toHaveLength(1);
    expect(res.items[0].sourceId).toBe('l-ok');
    expect(res.items[0].amount).toBe('250');
    expect(prisma.collectionDispositionLine.findMany.mock.calls[0][0].where.disposition).toEqual(
      expect.objectContaining({ manualReversalRequiredAt: null }),
    );
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
