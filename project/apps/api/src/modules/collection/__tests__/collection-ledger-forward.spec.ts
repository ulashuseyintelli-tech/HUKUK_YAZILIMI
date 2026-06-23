/**
 * G3a — CollectionService.create ledger forward write wiring testleri.
 *
 *  - ClaimItem varsa: allocatePaymentToLedgerInTx ÇAĞRILIR; Collection+event korunur;
 *    CollectionAllocation (autoAllocate) compat olarak çağrılmaya devam eder (S2).
 *  - ClaimItem yoksa (NO_CLAIM_ITEMS): diagnostic warn; akış KIRILMAZ; THROW yok.
 *  - summaryEngine enjekte değilse: warn; akış KIRILMAZ.
 */

import { CollectionService } from '../collection.service';
import { CollectionChannel, CollectionSource, CollectionType } from '../dto/collection.dto';
import { BadRequestException } from '@nestjs/common';

function setup(opts: { summaryEngine?: any; caseRecord?: any } = {}) {
  const tx: any = {
    case: {
      findFirst: jest.fn(async () => opts.caseRecord ?? ({ id: 'c1', caseStatus: 'DERDEST', currency: 'TRY' })),
    },
    collection: { create: jest.fn(async () => ({ id: 'col1' })), findFirst: jest.fn() },
    collectionAllocation: { create: jest.fn() },
    collectionOverpayment: { create: jest.fn() },
  };
  const prisma: any = {
    $transaction: jest.fn(async (fn: any) => fn(tx)),
    collection: { findFirst: jest.fn(async () => ({ id: 'col1', allocations: [] })) },
  };
  const domainEvent: any = { appendInTransaction: jest.fn(async () => ({})) };
  const caseDebtorLifecycleGuard: any = { assertActiveByCaseDebtorId: jest.fn() };

  const svc = new CollectionService(prisma, domainEvent, caseDebtorLifecycleGuard, opts.summaryEngine);
  // CollectionAllocation iç detayını bypass et; çağrıldığını assert edeceğiz (S2 compat).
  const autoSpy = jest.spyOn(svc as any, 'autoAllocateInTx').mockResolvedValue(undefined);
  const warnSpy = jest.spyOn((svc as any).logger, 'warn').mockImplementation(() => undefined);
  return { svc, prisma, tx, domainEvent, autoSpy, warnSpy, caseDebtorLifecycleGuard };
}

const dto = { caseId: 'c1', amount: 1000, date: '2026-01-01', type: CollectionType.CASH } as any;

describe('CollectionService.create — G3a ledger forward write', () => {
  it('caseDebtorId varsa active guard ile create devam eder', async () => {
    const { svc, tx, caseDebtorLifecycleGuard } = setup();

    await svc.create('t1', { ...dto, caseDebtorId: 'cd-active' }, 'u1');

    expect(caseDebtorLifecycleGuard.assertActiveByCaseDebtorId).toHaveBeenCalledWith(
      't1',
      'cd-active',
      expect.objectContaining({ expectedCaseId: 'c1', prisma: tx }),
    );
    expect(tx.collection.create).toHaveBeenCalled();
  });

  it('passive caseDebtorId create akışını collection/event yazmadan bloklar', async () => {
    const { svc, tx, domainEvent, caseDebtorLifecycleGuard } = setup();
    caseDebtorLifecycleGuard.assertActiveByCaseDebtorId.mockRejectedValueOnce(
      new BadRequestException('Pasif dosya borçlusu yeni operasyon hedefi olamaz.')
    );

    await expect(
      svc.create('t1', { ...dto, caseDebtorId: 'cd-passive' }, 'u1')
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(tx.collection.create).not.toHaveBeenCalled();
    expect(domainEvent.appendInTransaction).not.toHaveBeenCalled();
  });

  it('caseDebtorId yoksa lifecycle guard çağrılmaz ve create değişmeden devam eder', async () => {
    const { svc, tx, caseDebtorLifecycleGuard } = setup();

    await svc.create('t1', dto, 'u1');

    expect(caseDebtorLifecycleGuard.assertActiveByCaseDebtorId).not.toHaveBeenCalled();
    expect(tx.collection.create).toHaveBeenCalled();
  });

  it('ClaimItem varsa: ledger çağrılır + Collection/event korunur + CollectionAllocation compat', async () => {
    const summaryEngine = {
      allocatePaymentToLedgerInTx: jest.fn(async () => ({
        allocated: true,
        ledgerEntry: { id: 'le1' },
        allocations: [{ amount: 1000 }],
      })),
    };
    const { svc, tx, domainEvent, autoSpy, warnSpy } = setup({ summaryEngine });

    await svc.create('t1', dto, 'u1');

    expect(summaryEngine.allocatePaymentToLedgerInTx).toHaveBeenCalledTimes(1);
    expect(summaryEngine.allocatePaymentToLedgerInTx).toHaveBeenCalledWith(
      tx,
      't1',
      'c1',
      1000,
      expect.objectContaining({ sourceType: undefined, collectionId: 'col1' }),
    );
    expect(tx.collection.create).toHaveBeenCalled();
    expect(domainEvent.appendInTransaction).toHaveBeenCalled();
    expect(
      domainEvent.appendInTransaction.mock.calls.some(([, event]: any[]) => event.header.eventType === 'OVERPAYMENT_RECORDED'),
    ).toBe(false);
    expect(tx.collectionOverpayment.create).not.toHaveBeenCalled();
    expect(autoSpy).toHaveBeenCalled(); // S2 compat korunur
    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('not ledger-allocated'));
  });

  it('overpayment varsa CollectionOverpayment HELD projection ve event yazar', async () => {
    const summaryEngine = {
      allocatePaymentToLedgerInTx: jest.fn(async () => ({
        allocated: true,
        ledgerEntry: { id: 'le-overpay', tenantId: 't1', caseId: 'c1', currency: 'TRY' },
        allocations: [{ amount: 700 }, { amount: 300 }],
        diagnostics: [],
        excludedOutstanding: 0,
        unsafeForOverpayment: false,
      })),
    };
    const { svc, tx, domainEvent } = setup({ summaryEngine });

    await svc.create('t1', { ...dto, amount: 1200, currency: 'TRY' }, 'u1');

    expect(tx.collectionOverpayment.create).toHaveBeenCalledWith({
      data: {
        tenantId: 't1',
        caseId: 'c1',
        collectionId: 'col1',
        sourceLedgerEntryId: 'le-overpay',
        amount: 200,
        remainingAmount: 200,
        currency: 'TRY',
        status: 'HELD',
        createdById: 'u1',
        metadata: {
          collectionAmount: 1200,
          allocatedAmount: 1000,
        },
      },
    });

    expect(domainEvent.appendInTransaction).toHaveBeenCalledTimes(2);
    const paymentEvent = domainEvent.appendInTransaction.mock.calls[0][1];
    const overpaymentEvent = domainEvent.appendInTransaction.mock.calls[1][1];
    expect(paymentEvent.header.eventType).toBe('PAYMENT_RECEIVED');
    expect(overpaymentEvent.header).toMatchObject({
      aggregateType: 'Case',
      aggregateId: 'c1',
      eventType: 'OVERPAYMENT_RECORDED',
      occurredAtConfidence: 'SYSTEM_VERIFIED',
      tenantId: 't1',
      causedBy: paymentEvent.header.eventId,
    });
    expect(overpaymentEvent.header.actor).toMatchObject({
      type: 'SYSTEM',
      reason: 'COLLECTION_OVERPAYMENT_PROJECTION',
    });
    expect(overpaymentEvent.payload).toMatchObject({
      collectionId: 'col1',
      sourceLedgerEntryId: 'le-overpay',
      amount: 200,
      remainingAmount: 200,
      currency: 'TRY',
      collectionAmount: 1200,
      allocatedAmount: 1000,
    });
  });

  it('ClaimItem yoksa: diagnostic warn, akış kırılmaz, THROW yok', async () => {
    const summaryEngine = {
      allocatePaymentToLedgerInTx: jest.fn(async () => ({
        allocated: false,
        reason: 'NO_CLAIM_ITEMS',
        ledgerEntry: null,
        allocations: [],
      })),
    };
    const { svc, tx, domainEvent, autoSpy, warnSpy } = setup({ summaryEngine });

    const res = await svc.create('t1', dto, 'u1');

    expect(res).toBeDefined();
    expect(tx.collection.create).toHaveBeenCalled();
    expect(domainEvent.appendInTransaction).toHaveBeenCalled();
    expect(
      domainEvent.appendInTransaction.mock.calls.some(([, event]: any[]) => event.header.eventType === 'OVERPAYMENT_RECORDED'),
    ).toBe(false);
    expect(tx.collectionOverpayment.create).not.toHaveBeenCalled();
    expect(autoSpy).toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('payment not ledger-allocated'));
  });

  it('summaryEngine enjekte değilse: warn, akış kırılmaz', async () => {
    const { svc, tx, warnSpy } = setup({ summaryEngine: undefined });

    await svc.create('t1', dto, 'u1');

    expect(tx.collection.create).toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('SummaryEngine not injected'));
  });
  it('excluded outstanding varsa overpayment projection yazmaz ve diagnostic event üretir', async () => {
    const summaryEngine = {
      allocatePaymentToLedgerInTx: jest.fn(async () => ({
        allocated: true,
        ledgerEntry: { id: 'le-unsafe', tenantId: 't1', caseId: 'c1', currency: 'TRY' },
        allocations: [{ amount: 1000 }],
        diagnostics: [
          {
            code: 'EXCLUDED_OUTSTANDING',
            reason: 'TAX_ITEM_WITHOUT_VALID_PARENT',
            claimItemId: 'tax1',
            itemType: 'TAX_KDV',
            amount: 100,
            message: 'TAX item has no valid taxParentCategory and was excluded from allocation.',
          },
        ],
        excludedOutstanding: 100,
        unsafeForOverpayment: true,
      })),
    };
    const { svc, tx, domainEvent, warnSpy } = setup({ summaryEngine });

    await svc.create('t1', { ...dto, amount: 1200, currency: 'TRY' }, 'u1');

    expect(tx.collectionOverpayment.create).not.toHaveBeenCalled();
    expect(domainEvent.appendInTransaction).toHaveBeenCalledTimes(2);
    const paymentEvent = domainEvent.appendInTransaction.mock.calls[0][1];
    const blockedEvent = domainEvent.appendInTransaction.mock.calls[1][1];
    expect(blockedEvent.header).toMatchObject({
      aggregateType: 'Case',
      aggregateId: 'c1',
      eventType: 'OVERPAYMENT_BLOCKED',
      occurredAtConfidence: 'SYSTEM_VERIFIED',
      tenantId: 't1',
      causedBy: paymentEvent.header.eventId,
    });
    expect(blockedEvent.payload).toMatchObject({
      collectionId: 'col1',
      sourceLedgerEntryId: 'le-unsafe',
      collectionAmount: 1200,
      allocatedAmount: 1000,
      attemptedOverpaymentAmount: 200,
      currency: 'TRY',
      unsafeForOverpayment: true,
      blockedReasons: [
        expect.objectContaining({
          reason: 'EXCLUDED_OUTSTANDING',
          details: expect.objectContaining({
            excludedOutstanding: 100,
            diagnostics: [expect.objectContaining({ claimItemId: 'tax1' })],
          }),
        }),
      ],
    });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('overpayment blocked'));
  });

  it('currency mismatch varsa overpayment projection yazmaz', async () => {
    const summaryEngine = {
      allocatePaymentToLedgerInTx: jest.fn(async () => ({
        allocated: true,
        ledgerEntry: { id: 'le-currency', tenantId: 't1', caseId: 'c1', currency: 'TRY' },
        allocations: [{ amount: 1000 }],
        diagnostics: [],
        excludedOutstanding: 0,
        unsafeForOverpayment: false,
      })),
    };
    const { svc, tx, domainEvent } = setup({ summaryEngine });

    await svc.create('t1', { ...dto, amount: 1200, currency: 'USD' }, 'u1');

    expect(tx.collectionOverpayment.create).not.toHaveBeenCalled();
    const blockedEvent = domainEvent.appendInTransaction.mock.calls[1][1];
    expect(blockedEvent.header.eventType).toBe('OVERPAYMENT_BLOCKED');
    expect(blockedEvent.payload.blockedReasons).toEqual([
      expect.objectContaining({
        reason: 'CURRENCY_MISMATCH',
        details: {
          collectionCurrency: 'USD',
          caseCurrency: 'TRY',
          ledgerCurrency: 'TRY',
        },
      }),
    ]);
  });

  it('ledger tenant/case context mismatch varsa overpayment projection yazmaz', async () => {
    const summaryEngine = {
      allocatePaymentToLedgerInTx: jest.fn(async () => ({
        allocated: true,
        ledgerEntry: { id: 'le-cross', tenantId: 'other-tenant', caseId: 'c1', currency: 'TRY' },
        allocations: [{ amount: 1000 }],
        diagnostics: [],
        excludedOutstanding: 0,
        unsafeForOverpayment: false,
      })),
    };
    const { svc, tx, domainEvent } = setup({ summaryEngine });

    await svc.create('t1', { ...dto, amount: 1200, currency: 'TRY' }, 'u1');

    expect(tx.collectionOverpayment.create).not.toHaveBeenCalled();
    const blockedEvent = domainEvent.appendInTransaction.mock.calls[1][1];
    expect(blockedEvent.header.eventType).toBe('OVERPAYMENT_BLOCKED');
    expect(blockedEvent.payload.blockedReasons).toEqual([
      expect.objectContaining({
        reason: 'LEDGER_CONTEXT_MISMATCH',
        details: expect.objectContaining({
          collectionTenantId: 't1',
          ledgerTenantId: 'other-tenant',
        }),
      }),
    ]);
  });

  it('restricted/earmarked sinyal varsa PaymentDesignation olmadan overpayment projection yazmaz', async () => {
    const summaryEngine = {
      allocatePaymentToLedgerInTx: jest.fn(async () => ({
        allocated: true,
        ledgerEntry: { id: 'le-restricted', tenantId: 't1', caseId: 'c1', currency: 'TRY' },
        allocations: [{ amount: 1000 }],
        diagnostics: [],
        excludedOutstanding: 0,
        unsafeForOverpayment: false,
      })),
    };
    const { svc, tx, domainEvent } = setup({ summaryEngine });

    await svc.create(
      't1',
      {
        ...dto,
        amount: 1200,
        currency: 'TRY',
        sourceType: CollectionSource.SALARY_SEIZURE,
        channel: CollectionChannel.HACIZ,
      },
      'u1',
    );

    expect(tx.collectionOverpayment.create).not.toHaveBeenCalled();
    const blockedEvent = domainEvent.appendInTransaction.mock.calls[1][1];
    expect(blockedEvent.header.eventType).toBe('OVERPAYMENT_BLOCKED');
    expect(blockedEvent.payload.blockedReasons).toEqual([
      expect.objectContaining({
        reason: 'RESTRICTED_PAYMENT_UNSUPPORTED',
        details: expect.objectContaining({
          sourceType: CollectionSource.SALARY_SEIZURE,
          channel: CollectionChannel.HACIZ,
        }),
      }),
    ]);
  });
});
