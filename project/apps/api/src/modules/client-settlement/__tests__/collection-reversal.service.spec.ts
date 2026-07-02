/**
 * TM3 M1R (+FU1/TM47D-3) â€” CollectionReversalService testleri.
 * DavranÄ±ÅŸ matrisi (UlaÅŸ contract 2026-06-27, TM47D-3 2026-06-28):
 *  - HELD_PENDING_DISTRIBUTION â†’ REVERSED (success)
 *  - REVERSED / CANCELLED â†’ idempotent skip (success)
 *  - no disposition â†’ handled skip (success)
 *  - POSTED â†’ status POSTED KALIR; kalÄ±cÄ± marker persist; exact prior payout allocation varsa
 *    ClientPayoutManualReversal OPEN + EXACT workflow kaydÄ± idempotent aÃ§Ä±lÄ±r.
 *  - POSTED + exact allocation yok â†’ marker kalÄ±r, AGGREGATE_ONLY/UNKNOWN workflow aÃ§Ä±lmaz.
 *  - missing collectionId â†’ handled no-op (success, throw YOK â€” poison engeli)
 *  - missing tenantId / tenant mismatch / wrong caseId â†’ fail-closed (throw, mutasyon YOK)
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
    $executeRaw: jest.fn().mockResolvedValue(1), // ROLL-001b: pg_advisory_xact_lock
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
    // M1R/TM47D-3 bu tablolarÄ± ASLA yazmamalÄ± â€” varlÄ±klarÄ± yalnÄ±z "Ã§aÄŸrÄ±lmadÄ±" assertion'Ä± iÃ§in.
    clientStatementLine: { create: jest.fn(), createMany: jest.fn() },
    balanceLedger: { create: jest.fn() },
    clientPayout: { create: jest.fn() },
    // FAZ-1b: reimbursement application REVERSAL â€” POSTED branch findMany(Ã—2)/create Ã§aÄŸÄ±rÄ±r (default: APPLY yok â†’ no-op).
    collectionDispositionExpenseApplication: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({
        id: 'rev-app-1',
        caseId: data.caseId,
        expenseRequestId: data.expenseRequestId,
        collectionDispositionId: data.collectionDispositionId,
        collectionDispositionLineId: data.collectionDispositionLineId,
        kind: data.kind,
        amount: data.amount,
        currency: data.currency,
        reimbursementScope: data.reimbursementScope,
        reversesApplicationId: data.reversesApplicationId ?? null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        createdById: data.createdById ?? null,
      })),
    },
    expenseRequest: { findFirst: jest.fn().mockResolvedValue({ clientId: 'client-1' }) },
    accountingJournalEntry: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'journal-1', _count: { lines: 2 } }),
    },
  };
  prisma.$transaction = jest.fn(async (callback: (tx: any) => Promise<unknown>) => callback(prisma));
  return prisma;
}

const svc = (prisma: any, writer?: any) => new CollectionReversalService(prisma, writer);

/** Yasak finansal yan-etki yazÄ±lmadÄ±ÄŸÄ±nÄ± doÄŸrular; TM47D-3 manual workflow bunun dÄ±ÅŸÄ±nda ayrÄ± assert edilir. */
function expectNoForbiddenFinancialMutation(prisma: any) {
  expect(prisma.clientStatementLine.create).not.toHaveBeenCalled();
  expect(prisma.clientStatementLine.createMany).not.toHaveBeenCalled();
  expect(prisma.balanceLedger.create).not.toHaveBeenCalled();
  expect(prisma.clientPayout.create).not.toHaveBeenCalled();
}

describe('CollectionReversalService.reverseFromPaymentReversed', () => {
  it('HELD_PENDING_DISTRIBUTION â†’ status REVERSED (success), manual workflow ve finansal yan-etki YOK', async () => {
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

  it('S8-B FAZ-0: DISTRIBUTION_RECOMMENDED â†’ status REVERSED (POSTED Ã¶ncesi, finansal yan-etki YOK)', async () => {
    const prisma = buildPrisma(disposition({ status: 'DISTRIBUTION_RECOMMENDED' }));
    const res = await svc(prisma).reverseFromPaymentReversed({ collectionId: 'col1' }, 'case1', CTX);
    expect(res.outcome).toBe('reversed');
    expect(prisma.collectionDisposition.update).toHaveBeenCalledWith({ where: { id: 'disp1' }, data: { status: 'REVERSED' } });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expectNoForbiddenFinancialMutation(prisma);
  });

  it('S8-B FAZ-0: DISTRIBUTION_APPROVED â†’ status REVERSED (post() Ã§alÄ±ÅŸmamÄ±ÅŸ, finansal yan-etki YOK)', async () => {
    const prisma = buildPrisma(disposition({ status: 'DISTRIBUTION_APPROVED' }));
    const res = await svc(prisma).reverseFromPaymentReversed({ collectionId: 'col1' }, 'case1', CTX);
    expect(res.outcome).toBe('reversed');
    expect(prisma.collectionDisposition.update).toHaveBeenCalledWith({ where: { id: 'disp1' }, data: { status: 'REVERSED' } });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expectNoForbiddenFinancialMutation(prisma);
  });

  it('zaten REVERSED â†’ idempotent skip, update YOK', async () => {
    const prisma = buildPrisma(disposition({ status: 'REVERSED' }));
    const res = await svc(prisma).reverseFromPaymentReversed({ collectionId: 'col1' }, 'case1', CTX);

    expect(res.outcome).toBe('skip-already-reversed');
    expect(prisma.collectionDisposition.update).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expectNoForbiddenFinancialMutation(prisma);
  });

  it('zaten CANCELLED â†’ idempotent skip, update YOK', async () => {
    const prisma = buildPrisma(disposition({ status: 'CANCELLED' }));
    const res = await svc(prisma).reverseFromPaymentReversed({ collectionId: 'col1' }, 'case1', CTX);

    expect(res.outcome).toBe('skip-already-cancelled');
    expect(prisma.collectionDisposition.update).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expectNoForbiddenFinancialMutation(prisma);
  });

  it('disposition yok â†’ handled skip (success), update YOK', async () => {
    const prisma = buildPrisma(null);
    const res = await svc(prisma).reverseFromPaymentReversed({ collectionId: 'col1' }, 'case1', CTX);

    expect(res.outcome).toBe('skip-no-disposition');
    expect(prisma.collectionDisposition.update).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expectNoForbiddenFinancialMutation(prisma);
  });

  it('POSTED + exact allocation â†’ marker kalÄ±r/yazÄ±lÄ±r ve ClientPayoutManualReversal OPEN/EXACT aÃ§Ä±lÄ±r', async () => {
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
        note: 'PAYMENT_REVERSED sonrasÄ± exact prior payout manual reversal workflow.',
        metadata: {
          source: 'PAYMENT_REVERSED',
          actionType: 'EVENT_PUBLISHED:PAYMENT_REVERSED',
        },
      },
    });
    expectNoForbiddenFinancialMutation(prisma);
  });

  it('POSTED + no allocation â†’ marker yazÄ±lÄ±r, AGGREGATE_ONLY/UNKNOWN workflow aÃ§Ä±lmaz', async () => {
    const prisma = buildPrisma(disposition(), []);
    const res = await svc(prisma).reverseFromPaymentReversed({ collectionId: 'col1' }, 'case1', CTX);

    expect(res.outcome).toBe('posted-manual-reversal-required');
    expect(prisma.collectionDisposition.update).toHaveBeenCalledTimes(1);
    expect(prisma.clientPayoutAllocation.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.clientPayoutManualReversal.upsert).not.toHaveBeenCalled();
    expectNoForbiddenFinancialMutation(prisma);
  });

  it('POSTED already marked + missing workflow + exact allocation â†’ marker deÄŸiÅŸmez, workflow idempotent aÃ§Ä±lÄ±r', async () => {
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

  it('POSTED retry/idempotency â†’ aynÄ± exact allocation iÃ§in aynÄ± dedupeKey kullanÄ±lÄ±r, duplicate create path yok', async () => {
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

  it('POSTED allocation lookup â†’ yalnÄ±z RECORDED payout source-link kabul edilir', async () => {
    const prisma = buildPrisma(disposition(), []);
    await svc(prisma).reverseFromPaymentReversed({ collectionId: 'col1' }, 'case1', CTX);

    const lookup = prisma.clientPayoutAllocation.findMany.mock.calls[0][0];
    expect(lookup.where.clientPayout).toEqual({ status: 'RECORDED' });
    expect(prisma.clientPayoutManualReversal.upsert).not.toHaveBeenCalled();
    expectNoForbiddenFinancialMutation(prisma);
  });

  it('tenant/caseClient/currency scoping â†’ allocation lookup exact tenant/case/client/currency sÄ±nÄ±rlarÄ±yla yapÄ±lÄ±r', async () => {
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

  it('missing collectionId â†’ handled no-op (success, THROW YOK), findUnique Ã§aÄŸrÄ±lmaz', async () => {
    const prisma = buildPrisma(disposition({ status: 'HELD_PENDING_DISTRIBUTION' }));
    const res = await svc(prisma).reverseFromPaymentReversed({}, 'case1', CTX);

    expect(res.outcome).toBe('skip-missing-collection-id');
    expect(prisma.collectionDisposition.findUnique).not.toHaveBeenCalled();
    expect(prisma.collectionDisposition.update).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expectNoForbiddenFinancialMutation(prisma);
  });

  it('missing tenantId (context yok) â†’ fail-closed throw', async () => {
    const prisma = buildPrisma(disposition({ status: 'HELD_PENDING_DISTRIBUTION' }));
    await expect(
      svc(prisma).reverseFromPaymentReversed({ collectionId: 'col1' }, 'case1', undefined),
    ).rejects.toThrow(/tenant doÄŸrulanmadan/);
    expect(prisma.collectionDisposition.update).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expectNoForbiddenFinancialMutation(prisma);
  });

  it('tenant mismatch â†’ fail-closed throw, mutasyon YOK', async () => {
    const prisma = buildPrisma(disposition({ status: 'HELD_PENDING_DISTRIBUTION' }));
    await expect(
      svc(prisma).reverseFromPaymentReversed({ collectionId: 'col1' }, 'case1', { ...CTX, tenantId: 'tB' }),
    ).rejects.toThrow(/tenant mismatch/);
    expect(prisma.collectionDisposition.update).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expectNoForbiddenFinancialMutation(prisma);
  });

  it('FAZ-1b: POSTED reverse â†’ her APPLY iÃ§in REVERSAL application (simetri); finansal yan-etki YOK', async () => {
    const prisma = buildPrisma(disposition()); // POSTED
    prisma.collectionDispositionExpenseApplication.findMany = jest
      .fn()
      .mockResolvedValueOnce([{ id: 'app1', expenseRequestId: 'er1', collectionDispositionLineId: 'line1', amount: AMOUNT, currency: 'TRY', reimbursementScope: 'CLIENT_FRONTED' }]) // APPLY
      .mockResolvedValueOnce([]); // mevcut REVERSAL yok
    await svc(prisma).reverseFromPaymentReversed({ collectionId: 'col1' }, 'case1', CTX);
    expect(prisma.collectionDispositionExpenseApplication.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ kind: 'REVERSAL', reversesApplicationId: 'app1', expenseRequestId: 'er1' }) }),
    );
    expect(prisma.accountingJournalEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sourceType: 'COLLECTION_DISPOSITION_EXPENSE_APPLICATION',
          sourceId: 'rev-app-1',
          sourceAction: 'reversal',
          entryType: 'COLLECTION_DISPOSITION_EXPENSE_APPLICATION_REVERSED',
          lines: { create: expect.arrayContaining([
            expect.objectContaining({ accountCode: 'CLIENT_EXPENSE_RECEIVABLE', direction: 'DEBIT', expenseApplicationId: 'rev-app-1', dispositionLineId: 'line1' }),
          ]) },
        }),
      }),
    );    expectNoForbiddenFinancialMutation(prisma); // projection unwind â‰  payout/ledger/statement
  });

  // ROLL-001b: reimbursement REVERSAL yolu, DispositionPostingService (ROLL-001) ve ClientOffsetService ile
  // AYNI advisory-lock key'ini uretmeli.
  it('FAZ-1b: REVERSAL cagirir pg_advisory_xact_lock, key = clientOffsetLockKey(tenantId, expenseRequest.clientId, a.currency)', async () => {
    const prisma = buildPrisma(disposition());
    prisma.collectionDispositionExpenseApplication.findMany = jest
      .fn()
      .mockResolvedValueOnce([{ id: 'app1', expenseRequestId: 'er1', collectionDispositionLineId: 'line1', amount: AMOUNT, currency: 'TRY', reimbursementScope: 'CLIENT_FRONTED' }])
      .mockResolvedValueOnce([]);
    await svc(prisma).reverseFromPaymentReversed({ collectionId: 'col1' }, 'case1', CTX);
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    // clientOffsetLockKey('t1', 'client-1', 'TRY') = 'client-offset:t1:client-1:TRY' - tagged-template cagrisinin
    // ilk argumani strings[], ikincisi interpolated key degeri.
    const call = (prisma.$executeRaw as jest.Mock).mock.calls[0];
    expect(call[1]).toBe('client-offset:t1:client-1:TRY');
  });

  it('FAZ-1b: advisory-lock, REVERSAL create() isleminden ONCE alinir', async () => {
    const prisma = buildPrisma(disposition());
    prisma.collectionDispositionExpenseApplication.findMany = jest
      .fn()
      .mockResolvedValueOnce([{ id: 'app1', expenseRequestId: 'er1', collectionDispositionLineId: 'line1', amount: AMOUNT, currency: 'TRY', reimbursementScope: 'CLIENT_FRONTED' }])
      .mockResolvedValueOnce([]);
    await svc(prisma).reverseFromPaymentReversed({ collectionId: 'col1' }, 'case1', CTX);
    const lockOrder = (prisma.$executeRaw as jest.Mock).mock.invocationCallOrder[0];
    const createOrder = (prisma.collectionDispositionExpenseApplication.create as jest.Mock).mock.invocationCallOrder[0];
    expect(lockOrder).toBeLessThan(createOrder);
  });

  it('FAZ-1b: ayni dispositionda 2 farkli expenseRequestId ile lock 2 kez, farkli key\'lerle cagrilir', async () => {
    const prisma = buildPrisma(disposition());
    prisma.collectionDispositionExpenseApplication.findMany = jest
      .fn()
      .mockResolvedValueOnce([
        { id: 'app1', expenseRequestId: 'er1', collectionDispositionLineId: 'line1', amount: AMOUNT, currency: 'TRY', reimbursementScope: 'CLIENT_FRONTED' },
        { id: 'app2', expenseRequestId: 'er2', collectionDispositionLineId: 'line2', amount: AMOUNT, currency: 'TRY', reimbursementScope: 'FIRM_FRONTED' },
      ])
      .mockResolvedValueOnce([]);
    prisma.expenseRequest.findFirst = jest
      .fn()
      .mockResolvedValueOnce({ clientId: 'client-1' })
      .mockResolvedValueOnce({ clientId: 'client-2' });
    await svc(prisma).reverseFromPaymentReversed({ collectionId: 'col1' }, 'case1', CTX);
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(2);
    const keys = (prisma.$executeRaw as jest.Mock).mock.calls.map((c: any[]) => c[1]);
    expect(keys).toEqual(['client-offset:t1:client-1:TRY', 'client-offset:t1:client-2:TRY']);
  });

  it('FAZ-1b: reimbursement reversal journal write hatasi fail-closed throw eder', async () => {
    const prisma = buildPrisma(disposition());
    prisma.collectionDispositionExpenseApplication.findMany = jest
      .fn()
      .mockResolvedValueOnce([{ id: 'app1', expenseRequestId: 'er1', collectionDispositionLineId: 'line1', amount: AMOUNT, currency: 'TRY', reimbursementScope: 'CLIENT_FRONTED' }])
      .mockResolvedValueOnce([]);
    const writer = { write: jest.fn().mockResolvedValue({ ok: false, errors: [{ code: 'WRITER_DOWN' }] }) };
    await expect(svc(prisma, writer).reverseFromPaymentReversed({ collectionId: 'col1' }, 'case1', CTX)).rejects.toThrow(/Expense application journal write failed/);
    expect(prisma.collectionDispositionExpenseApplication.create).toHaveBeenCalled();
  });
  it('FAZ-1b: POSTED reverse idempotent â€” APPLY zaten REVERSAL\'lÄ± ise yeni REVERSAL yazÄ±lmaz', async () => {
    const prisma = buildPrisma(disposition());
    prisma.collectionDispositionExpenseApplication.findMany = jest
      .fn()
      .mockResolvedValueOnce([{ id: 'app1', expenseRequestId: 'er1', collectionDispositionLineId: 'line1', amount: AMOUNT, currency: 'TRY', reimbursementScope: 'CLIENT_FRONTED' }]) // APPLY
      .mockResolvedValueOnce([{ reversesApplicationId: 'app1' }]); // zaten reverse edilmiÅŸ â†’ skip
    await svc(prisma).reverseFromPaymentReversed({ collectionId: 'col1' }, 'case1', CTX);
    expect(prisma.collectionDispositionExpenseApplication.create).not.toHaveBeenCalled();
  });

  it('wrong caseId â†’ fail-closed throw, mutasyon YOK', async () => {
    const prisma = buildPrisma(disposition({ status: 'HELD_PENDING_DISTRIBUTION' }));
    await expect(
      svc(prisma).reverseFromPaymentReversed({ collectionId: 'col1' }, 'BASKA_CASE', CTX),
    ).rejects.toThrow(/case mismatch/);
    expect(prisma.collectionDisposition.update).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expectNoForbiddenFinancialMutation(prisma);
  });

  it('bilinmeyen status â†’ handled skip (success), mutasyon YOK', async () => {
    const prisma = buildPrisma(disposition({ status: 'FUTURE_STATUS' }));
    const res = await svc(prisma).reverseFromPaymentReversed({ collectionId: 'col1' }, 'case1', CTX);

    expect(res.outcome).toBe('skip-unsupported-status');
    expect(prisma.collectionDisposition.update).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expectNoForbiddenFinancialMutation(prisma);
  });
});
