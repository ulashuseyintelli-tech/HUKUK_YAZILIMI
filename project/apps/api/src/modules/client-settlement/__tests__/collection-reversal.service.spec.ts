/**
 * TM3 M1R (+FU1/TM47D-3) — CollectionReversalService testleri.
 * Davranış matrisi (Ulaş contract 2026-06-27, TM47D-3 2026-06-28):
 *  - HELD_PENDING_DISTRIBUTION → REVERSED (success)
 *  - REVERSED / CANCELLED → idempotent skip (success)
 *  - no disposition → handled skip (success)
 *  - POSTED → status POSTED KALIR; kalıcı marker persist; exact prior payout allocation varsa
 *    ClientPayoutManualReversal OPEN + EXACT workflow kaydı idempotent açılır.
 *  - POSTED + exact allocation yok → marker kalır, AGGREGATE_ONLY/UNKNOWN workflow açılmaz.
 *  - missing collectionId → handled no-op (success, throw YOK — poison engeli)
 *  - missing tenantId / tenant mismatch / wrong caseId → fail-closed (throw, mutasyon YOK)
 *  - ClientStatement / BalanceLedger / payout YAZILMAZ; clientId VARSAYILMAZ.
 */
import { CollectionReversalService } from '../collection-reversal.service';

const CTX = { actionId: 'evt-rev-1', tenantId: 't1', actionType: 'EVENT_PUBLISHED:PAYMENT_REVERSED' };
const AMOUNT = { toString: () => '125.50' };

function disposition(overrides: Record<string, any> = {}) {
  return {
    id: 'disp1',
    tenantId: 't1',
    caseId: 'case1',
    caseClientId: 'cc1',
    collectionId: 'col1',
    status: 'POSTED',
    currency: 'TRY',
    manualReversalRequiredAt: null,
    ...overrides,
  };
}

function allocation(overrides: Record<string, any> = {}) {
  return {
    id: 'alloc1',
    tenantId: 't1',
    caseId: 'case1',
    caseClientId: 'cc1',
    clientPayoutId: 'payout1',
    collectionId: 'col1',
    collectionDispositionId: 'disp1',
    collectionDispositionLineId: 'line1',
    amount: AMOUNT,
    currency: 'TRY',
    ...overrides,
  };
}

function buildPrisma(disp: any | null, allocations: any[] = []) {
  const prisma: any = {
    collectionDisposition: {
      findUnique: jest.fn().mockResolvedValue(disp),
      update: jest.fn().mockResolvedValue({ id: disp?.id ?? 'disp1', status: 'REVERSED' }),
    },
    clientPayoutAllocation: {
      findMany: jest.fn().mockResolvedValue(allocations),
    },
    clientPayoutManualReversal: {
      upsert: jest.fn().mockResolvedValue({ id: 'manual-reversal-1' }),
    },
    // M1R/TM47D-3 bu tabloları ASLA yazmamalı — varlıkları yalnız "çağrılmadı" assertion'ı için.
    clientStatementLine: { create: jest.fn(), createMany: jest.fn() },
    balanceLedger: { create: jest.fn() },
    clientPayout: { create: jest.fn() },
    // FAZ-1b: reimbursement application REVERSAL — POSTED branch findMany(×2)/create çağırır (default: APPLY yok → no-op).
    collectionDispositionExpenseApplication: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn().mockResolvedValue({ id: 'rev-app-1' }) },
  };
  prisma.$transaction = jest.fn(async (callback: (tx: any) => Promise<unknown>) => callback(prisma));
  return prisma;
}

const svc = (prisma: any) => new CollectionReversalService(prisma);

/** Yasak finansal yan-etki yazılmadığını doğrular; TM47D-3 manual workflow bunun dışında ayrı assert edilir. */
function expectNoForbiddenFinancialMutation(prisma: any) {
  expect(prisma.clientStatementLine.create).not.toHaveBeenCalled();
  expect(prisma.clientStatementLine.createMany).not.toHaveBeenCalled();
  expect(prisma.balanceLedger.create).not.toHaveBeenCalled();
  expect(prisma.clientPayout.create).not.toHaveBeenCalled();
}

describe('CollectionReversalService.reverseFromPaymentReversed', () => {
  it('HELD_PENDING_DISTRIBUTION → status REVERSED (success), manual workflow ve finansal yan-etki YOK', async () => {
    const prisma = buildPrisma(disposition({ status: 'HELD_PENDING_DISTRIBUTION' }));
    const res = await svc(prisma).reverseFromPaymentReversed({ collectionId: 'col1' }, 'case1', CTX);

    expect(res.outcome).toBe('reversed');
    expect(res.dispositionId).toBe('disp1');
    expect(res.reversalSourceEventId).toBe('evt-rev-1');
    expect(prisma.collectionDisposition.update).toHaveBeenCalledWith({
      where: { id: 'disp1' },
      data: { status: 'REVERSED' },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.clientPayoutAllocation.findMany).not.toHaveBeenCalled();
    expect(prisma.clientPayoutManualReversal.upsert).not.toHaveBeenCalled();
    expectNoForbiddenFinancialMutation(prisma);
  });

  it('S8-B FAZ-0: DISTRIBUTION_RECOMMENDED → status REVERSED (POSTED öncesi, finansal yan-etki YOK)', async () => {
    const prisma = buildPrisma(disposition({ status: 'DISTRIBUTION_RECOMMENDED' }));
    const res = await svc(prisma).reverseFromPaymentReversed({ collectionId: 'col1' }, 'case1', CTX);
    expect(res.outcome).toBe('reversed');
    expect(prisma.collectionDisposition.update).toHaveBeenCalledWith({ where: { id: 'disp1' }, data: { status: 'REVERSED' } });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expectNoForbiddenFinancialMutation(prisma);
  });

  it('S8-B FAZ-0: DISTRIBUTION_APPROVED → status REVERSED (post() çalışmamış, finansal yan-etki YOK)', async () => {
    const prisma = buildPrisma(disposition({ status: 'DISTRIBUTION_APPROVED' }));
    const res = await svc(prisma).reverseFromPaymentReversed({ collectionId: 'col1' }, 'case1', CTX);
    expect(res.outcome).toBe('reversed');
    expect(prisma.collectionDisposition.update).toHaveBeenCalledWith({ where: { id: 'disp1' }, data: { status: 'REVERSED' } });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expectNoForbiddenFinancialMutation(prisma);
  });

  it('zaten REVERSED → idempotent skip, update YOK', async () => {
    const prisma = buildPrisma(disposition({ status: 'REVERSED' }));
    const res = await svc(prisma).reverseFromPaymentReversed({ collectionId: 'col1' }, 'case1', CTX);

    expect(res.outcome).toBe('skip-already-reversed');
    expect(prisma.collectionDisposition.update).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expectNoForbiddenFinancialMutation(prisma);
  });

  it('zaten CANCELLED → idempotent skip, update YOK', async () => {
    const prisma = buildPrisma(disposition({ status: 'CANCELLED' }));
    const res = await svc(prisma).reverseFromPaymentReversed({ collectionId: 'col1' }, 'case1', CTX);

    expect(res.outcome).toBe('skip-already-cancelled');
    expect(prisma.collectionDisposition.update).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expectNoForbiddenFinancialMutation(prisma);
  });

  it('disposition yok → handled skip (success), update YOK', async () => {
    const prisma = buildPrisma(null);
    const res = await svc(prisma).reverseFromPaymentReversed({ collectionId: 'col1' }, 'case1', CTX);

    expect(res.outcome).toBe('skip-no-disposition');
    expect(prisma.collectionDisposition.update).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expectNoForbiddenFinancialMutation(prisma);
  });

  it('POSTED + exact allocation → marker kalır/yazılır ve ClientPayoutManualReversal OPEN/EXACT açılır', async () => {
    const exactAllocation = allocation();
    const prisma = buildPrisma(disposition(), [exactAllocation]);
    const res = await svc(prisma).reverseFromPaymentReversed({ collectionId: 'col1' }, 'case1', CTX);

    expect(res.outcome).toBe('posted-manual-reversal-required');
    expect(res.manualReversalRequired).toBe(true);
    expect(res.previousStatus).toBe('POSTED');
    expect(res.reversalSourceEventId).toBe('evt-rev-1');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);

    expect(prisma.collectionDisposition.update).toHaveBeenCalledTimes(1);
    const markerCall = prisma.collectionDisposition.update.mock.calls[0][0];
    expect(markerCall.where).toEqual({ id: 'disp1' });
    expect(markerCall.data.status).toBeUndefined();
    expect(markerCall.data.manualReversalRequiredAt).toBeInstanceOf(Date);
    expect(markerCall.data.manualReversalSourceActionId).toBe('evt-rev-1');

    expect(prisma.clientPayoutAllocation.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: 't1',
        caseId: 'case1',
        collectionId: 'col1',
        collectionDispositionId: 'disp1',
        currency: 'TRY',
        clientPayout: { status: 'RECORDED' },
        caseClientId: 'cc1',
      },
      select: {
        id: true,
        tenantId: true,
        caseId: true,
        caseClientId: true,
        clientPayoutId: true,
        collectionId: true,
        collectionDispositionId: true,
        collectionDispositionLineId: true,
        amount: true,
        currency: true,
      },
      orderBy: [{ clientPayoutId: 'asc' }, { collectionDispositionLineId: 'asc' }],
    });

    expect(prisma.clientPayoutManualReversal.upsert).toHaveBeenCalledWith({
      where: { dedupeKey: 'payment-reversed:exact:t1:col1:alloc1' },
      update: {},
      create: {
        tenantId: 't1',
        caseId: 'case1',
        caseClientId: 'cc1',
        amount: AMOUNT,
        currency: 'TRY',
        status: 'OPEN',
        confidence: 'EXACT',
        dedupeKey: 'payment-reversed:exact:t1:col1:alloc1',
        sourceActionId: 'evt-rev-1',
        collectionId: 'col1',
        collectionDispositionId: 'disp1',
        collectionDispositionLineId: 'line1',
        clientPayoutId: 'payout1',
        clientPayoutAllocationId: 'alloc1',
        openedById: null,
        note: 'PAYMENT_REVERSED sonrası exact prior payout manual reversal workflow.',
        metadata: {
          source: 'PAYMENT_REVERSED',
          actionType: 'EVENT_PUBLISHED:PAYMENT_REVERSED',
        },
      },
    });
    expectNoForbiddenFinancialMutation(prisma);
  });

  it('POSTED + no allocation → marker yazılır, AGGREGATE_ONLY/UNKNOWN workflow açılmaz', async () => {
    const prisma = buildPrisma(disposition(), []);
    const res = await svc(prisma).reverseFromPaymentReversed({ collectionId: 'col1' }, 'case1', CTX);

    expect(res.outcome).toBe('posted-manual-reversal-required');
    expect(prisma.collectionDisposition.update).toHaveBeenCalledTimes(1);
    expect(prisma.clientPayoutAllocation.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.clientPayoutManualReversal.upsert).not.toHaveBeenCalled();
    expectNoForbiddenFinancialMutation(prisma);
  });

  it('POSTED already marked + missing workflow + exact allocation → marker değişmez, workflow idempotent açılır', async () => {
    const existingMarker = new Date('2026-06-27T00:00:00Z');
    const prisma = buildPrisma(disposition({ manualReversalRequiredAt: existingMarker }), [allocation()]);
    const res = await svc(prisma).reverseFromPaymentReversed({ collectionId: 'col1' }, 'case1', { ...CTX, actionId: 'evt-rev-2' });

    expect(res.outcome).toBe('posted-manual-reversal-required');
    expect(res.manualReversalRequired).toBe(true);
    expect(res.alreadyMarked).toBe(true);
    expect(prisma.collectionDisposition.update).not.toHaveBeenCalled();
    expect(prisma.clientPayoutManualReversal.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.clientPayoutManualReversal.upsert.mock.calls[0][0].where).toEqual({
      dedupeKey: 'payment-reversed:exact:t1:col1:alloc1',
    });
    expect(prisma.clientPayoutManualReversal.upsert.mock.calls[0][0].create.sourceActionId).toBe('evt-rev-2');
    expectNoForbiddenFinancialMutation(prisma);
  });

  it('POSTED retry/idempotency → aynı exact allocation için aynı dedupeKey kullanılır, duplicate create path yok', async () => {
    const existingMarker = new Date('2026-06-27T00:00:00Z');
    const prisma = buildPrisma(disposition({ manualReversalRequiredAt: existingMarker }), [allocation()]);
    const service = svc(prisma);

    await service.reverseFromPaymentReversed({ collectionId: 'col1' }, 'case1', CTX);
    await service.reverseFromPaymentReversed({ collectionId: 'col1' }, 'case1', CTX);

    expect(prisma.collectionDisposition.update).not.toHaveBeenCalled();
    expect(prisma.clientPayoutManualReversal.upsert).toHaveBeenCalledTimes(2);
    const dedupeKeys = prisma.clientPayoutManualReversal.upsert.mock.calls.map((call: any[]) => call[0].where.dedupeKey);
    expect(new Set(dedupeKeys)).toEqual(new Set(['payment-reversed:exact:t1:col1:alloc1']));
    expectNoForbiddenFinancialMutation(prisma);
  });

  it('POSTED allocation lookup → yalnız RECORDED payout source-link kabul edilir', async () => {
    const prisma = buildPrisma(disposition(), []);
    await svc(prisma).reverseFromPaymentReversed({ collectionId: 'col1' }, 'case1', CTX);

    const lookup = prisma.clientPayoutAllocation.findMany.mock.calls[0][0];
    expect(lookup.where.clientPayout).toEqual({ status: 'RECORDED' });
    expect(prisma.clientPayoutManualReversal.upsert).not.toHaveBeenCalled();
    expectNoForbiddenFinancialMutation(prisma);
  });

  it('tenant/caseClient/currency scoping → allocation lookup exact tenant/case/client/currency sınırlarıyla yapılır', async () => {
    const prisma = buildPrisma(disposition({ caseClientId: 'cc-scope', currency: 'USD' }), []);
    await svc(prisma).reverseFromPaymentReversed({ collectionId: 'col1' }, 'case1', CTX);

    const lookup = prisma.clientPayoutAllocation.findMany.mock.calls[0][0];
    expect(lookup.where).toEqual({
      tenantId: 't1',
      caseId: 'case1',
      collectionId: 'col1',
      collectionDispositionId: 'disp1',
      currency: 'USD',
      clientPayout: { status: 'RECORDED' },
      caseClientId: 'cc-scope',
    });
    expect(prisma.clientPayoutManualReversal.upsert).not.toHaveBeenCalled();
    expectNoForbiddenFinancialMutation(prisma);
  });

  it('missing collectionId → handled no-op (success, THROW YOK), findUnique çağrılmaz', async () => {
    const prisma = buildPrisma(disposition({ status: 'HELD_PENDING_DISTRIBUTION' }));
    const res = await svc(prisma).reverseFromPaymentReversed({}, 'case1', CTX);

    expect(res.outcome).toBe('skip-missing-collection-id');
    expect(prisma.collectionDisposition.findUnique).not.toHaveBeenCalled();
    expect(prisma.collectionDisposition.update).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expectNoForbiddenFinancialMutation(prisma);
  });

  it('missing tenantId (context yok) → fail-closed throw', async () => {
    const prisma = buildPrisma(disposition({ status: 'HELD_PENDING_DISTRIBUTION' }));
    await expect(
      svc(prisma).reverseFromPaymentReversed({ collectionId: 'col1' }, 'case1', undefined),
    ).rejects.toThrow(/tenant doğrulanmadan/);
    expect(prisma.collectionDisposition.update).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expectNoForbiddenFinancialMutation(prisma);
  });

  it('tenant mismatch → fail-closed throw, mutasyon YOK', async () => {
    const prisma = buildPrisma(disposition({ status: 'HELD_PENDING_DISTRIBUTION' }));
    await expect(
      svc(prisma).reverseFromPaymentReversed({ collectionId: 'col1' }, 'case1', { ...CTX, tenantId: 'tB' }),
    ).rejects.toThrow(/tenant mismatch/);
    expect(prisma.collectionDisposition.update).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expectNoForbiddenFinancialMutation(prisma);
  });

  it('FAZ-1b: POSTED reverse → her APPLY için REVERSAL application (simetri); finansal yan-etki YOK', async () => {
    const prisma = buildPrisma(disposition()); // POSTED
    prisma.collectionDispositionExpenseApplication.findMany = jest
      .fn()
      .mockResolvedValueOnce([{ id: 'app1', expenseRequestId: 'er1', collectionDispositionLineId: 'line1', amount: AMOUNT, currency: 'TRY', reimbursementScope: 'CLIENT_FRONTED' }]) // APPLY
      .mockResolvedValueOnce([]); // mevcut REVERSAL yok
    await svc(prisma).reverseFromPaymentReversed({ collectionId: 'col1' }, 'case1', CTX);
    expect(prisma.collectionDispositionExpenseApplication.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ kind: 'REVERSAL', reversesApplicationId: 'app1', expenseRequestId: 'er1' }) }),
    );
    expectNoForbiddenFinancialMutation(prisma); // projection unwind ≠ payout/ledger/statement
  });

  it('FAZ-1b: POSTED reverse idempotent — APPLY zaten REVERSAL\'lı ise yeni REVERSAL yazılmaz', async () => {
    const prisma = buildPrisma(disposition());
    prisma.collectionDispositionExpenseApplication.findMany = jest
      .fn()
      .mockResolvedValueOnce([{ id: 'app1', expenseRequestId: 'er1', collectionDispositionLineId: 'line1', amount: AMOUNT, currency: 'TRY', reimbursementScope: 'CLIENT_FRONTED' }]) // APPLY
      .mockResolvedValueOnce([{ reversesApplicationId: 'app1' }]); // zaten reverse edilmiş → skip
    await svc(prisma).reverseFromPaymentReversed({ collectionId: 'col1' }, 'case1', CTX);
    expect(prisma.collectionDispositionExpenseApplication.create).not.toHaveBeenCalled();
  });

  it('wrong caseId → fail-closed throw, mutasyon YOK', async () => {
    const prisma = buildPrisma(disposition({ status: 'HELD_PENDING_DISTRIBUTION' }));
    await expect(
      svc(prisma).reverseFromPaymentReversed({ collectionId: 'col1' }, 'BASKA_CASE', CTX),
    ).rejects.toThrow(/case mismatch/);
    expect(prisma.collectionDisposition.update).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expectNoForbiddenFinancialMutation(prisma);
  });

  it('bilinmeyen status → handled skip (success), mutasyon YOK', async () => {
    const prisma = buildPrisma(disposition({ status: 'FUTURE_STATUS' }));
    const res = await svc(prisma).reverseFromPaymentReversed({ collectionId: 'col1' }, 'case1', CTX);

    expect(res.outcome).toBe('skip-unsupported-status');
    expect(prisma.collectionDisposition.update).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expectNoForbiddenFinancialMutation(prisma);
  });
});