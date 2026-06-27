import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { CollectionService } from '../collection.service';
import { DomainEventIngestService } from '../../icrabot/domain-event-ingest';

function buildPaymentReceivedEvent(overrides: { header?: any; payload?: any } = {}) {
  return {
    id: 'timeline-payment-1',
    body: {
      header: {
        eventId: 'payment-event-1',
        eventType: 'PAYMENT_RECEIVED',
        tenantId: 't1',
        aggregateId: 'case1',
        ...overrides.header,
      },
      payload: {
        collectionId: 'col1',
        amount: 1000,
        currency: 'TRY',
        ...overrides.payload,
      },
    },
  };
}

function buildTx(opts: {
  collection?: any;
  originalLedger?: any;
  ledgerCreateError?: any;
  paymentEvent?: any;
  currentMaxVersion?: bigint | null;
}) {
  const collection = Object.prototype.hasOwnProperty.call(opts, 'collection')
    ? opts.collection
    : {
      id: 'col1',
      tenantId: 't1',
      caseId: 'case1',
      status: 'CONFIRMED',
      amount: 1000,
      currency: 'TRY',
    };
  const paymentEvent = Object.prototype.hasOwnProperty.call(opts, 'paymentEvent')
    ? opts.paymentEvent
    : buildPaymentReceivedEvent();

  return {
    collection: {
      findFirst: jest.fn(async () => collection),
      update: jest.fn(async ({ data }: any) => ({
        ...collection,
        ...data,
      })),
    },
    $executeRaw: jest.fn(async () => undefined),
    icrabotTimelineEntry: {
      findFirst: jest.fn(async (args?: any) => {
        if (args?.where?.type !== 'PAYMENT_RECEIVED' || !paymentEvent) return null;
        const header = paymentEvent.body?.header ?? {};
        const payload = paymentEvent.body?.payload ?? {};
        if (args.where.tenantId && header.tenantId !== args.where.tenantId) {
          return null;
        }
        if (args.where.caseId && header.aggregateId !== args.where.caseId) {
          return null;
        }
        if (args.where.body?.equals && payload.collectionId !== args.where.body.equals) {
          return null;
        }
        return paymentEvent;
      }),
      aggregate: jest.fn(async () => ({
        _max: { aggregateVersion: opts.currentMaxVersion ?? BigInt(1) },
      })),
      create: jest.fn(async (input: any) => input.data),
    },
    icrabotOutboxAction: {
      create: jest.fn(async (input: any) => input.data),
    },
    ledgerEntry: {
      findFirst: jest.fn(async () => opts.originalLedger ?? null),
      create: jest.fn(async (input: any) => {
        if (opts.ledgerCreateError) throw opts.ledgerCreateError;
        return { id: 'rev1', ...input.data };
      }),
      update: jest.fn(),
    },
    claimItem: {
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    collectionOverpayment: {
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
  };
}

function buildService(tx: any, outsideCollection: any = null, domainEventOverride?: any) {
  const prisma: any = {
    $transaction: jest.fn(async (fn: any) => fn(tx)),
    collection: {
      findFirst: jest.fn(async () => outsideCollection),
    },
  };
  const domainEvent = domainEventOverride ?? {
    appendInTransaction: jest.fn(async () => ({ aggregateVersion: BigInt(2) })),
  };
  const service = new CollectionService(
    prisma,
    domainEvent as any,
    {} as any,
    undefined,
  );
  return { service, prisma, domainEvent };
}

function getAppendCall(domainEvent: any, index = 0): [any, any] {
  return domainEvent.appendInTransaction.mock.calls[index] as unknown as [any, any];
}

describe('CollectionService.cancel — reversal ledger write', () => {
  it('linked confirmed PAYMENT ledger varsa REVERSAL ve mirrored negative allocations yazar', async () => {
    const originalLedger = {
      id: 'le1',
      amount: 1000,
      currency: 'TRY',
      effectiveDate: new Date('2026-01-01'),
      referenceNo: 'R-1',
      reversedByLedgerEntry: null,
      allocations: [
        { claimItemId: 'ci-principal', amount: 700, allocationOrder: 1 },
        { claimItemId: 'ci-interest', amount: 300, allocationOrder: 2 },
      ],
    };
    const tx = buildTx({ originalLedger });
    const { service } = buildService(tx);

    const result = await service.cancel('t1', 'col1', { cancelReason: 'yanlış kayıt' } as any);

    expect(result).toMatchObject({
      id: 'col1',
      status: 'CANCELLED',
      cancelReason: 'yanlış kayıt',
    });
    expect(tx.collection.findFirst).toHaveBeenCalledWith({
      where: { id: 'col1', tenantId: 't1' },
    });
    expect(tx.ledgerEntry.findFirst).toHaveBeenCalledWith({
      where: {
        tenantId: 't1',
        caseId: 'case1',
        collectionId: 'col1',
        entryType: 'PAYMENT',
        status: 'CONFIRMED',
      },
      include: {
        allocations: true,
        reversedByLedgerEntry: { select: { id: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const reversalData = tx.ledgerEntry.create.mock.calls[0][0].data;
    expect(reversalData).toMatchObject({
      tenantId: 't1',
      caseId: 'case1',
      collectionId: 'col1',
      reversesLedgerEntryId: 'le1',
      entryType: 'REVERSAL',
      amount: -1000,
      currency: 'TRY',
      referenceNo: 'R-1',
      sourceType: 'COLLECTION_CANCEL',
      sourceId: 'col1',
      status: 'CONFIRMED',
    });
    expect(reversalData.allocations.create).toEqual([
      { claimItemId: 'ci-principal', amount: -700, allocationOrder: 1 },
      { claimItemId: 'ci-interest', amount: -300, allocationOrder: 2 },
    ]);
    expect(tx.claimItem.updateMany).toHaveBeenCalledWith({
      where: { id: 'ci-principal', tenantId: 't1', caseId: 'case1' },
      data: { collectedAmount: { decrement: 700 } },
    });
    expect(tx.claimItem.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'ci-principal',
        tenantId: 't1',
        caseId: 'case1',
        collectedAmount: { lt: 0 },
      },
      data: { collectedAmount: 0 },
    });
    expect(tx.claimItem.updateMany).toHaveBeenCalledWith({
      where: { id: 'ci-interest', tenantId: 't1', caseId: 'case1' },
      data: { collectedAmount: { decrement: 300 } },
    });
    expect(tx.claimItem.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'ci-interest',
        tenantId: 't1',
        caseId: 'case1',
        collectedAmount: { lt: 0 },
      },
      data: { collectedAmount: 0 },
    });
    expect(tx.claimItem.updateMany).toHaveBeenCalledTimes(4);
    expect(tx.ledgerEntry.update).not.toHaveBeenCalled();
    expect(tx.collectionOverpayment.updateMany).toHaveBeenCalledWith({
      where: {
        tenantId: 't1',
        caseId: 'case1',
        collectionId: 'col1',
        status: 'HELD',
      },
      data: {
        status: 'REVERSED',
        remainingAmount: 0,
        reversedAt: expect.any(Date),
      },
    });
  });

  it('başarılı cancel aynı transaction içinde PAYMENT_REVERSED event append eder', async () => {
    const originalLedger = {
      id: 'le1',
      amount: 1000,
      currency: 'TRY',
      effectiveDate: new Date('2026-01-01'),
      referenceNo: 'R-1',
      reversedByLedgerEntry: null,
      allocations: [],
    };
    const tx = buildTx({ originalLedger });
    const { service, domainEvent } = buildService(tx);

    await service.cancel('t1', 'col1', { cancelReason: 'yanlış kayıt' } as any);

    expect(tx.icrabotTimelineEntry.findFirst).toHaveBeenCalledWith({
      where: {
        tenantId: 't1',
        caseId: 'case1',
        type: 'PAYMENT_RECEIVED',
        body: {
          path: ['payload', 'collectionId'],
          equals: 'col1',
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    expect(domainEvent.appendInTransaction).toHaveBeenCalledTimes(1);
    const appendCall = getAppendCall(domainEvent);
    const [eventTx, event] = appendCall;
    expect(eventTx).toBe(tx);
    expect(event.header).toMatchObject({
      aggregateType: 'Case',
      aggregateId: 'case1',
      eventType: 'PAYMENT_REVERSED',
      occurredAtConfidence: 'SYSTEM_VERIFIED',
      causedBy: 'payment-event-1',
      tenantId: 't1',
      actor: { type: 'SYSTEM', reason: 'COLLECTION_CANCEL' },
    });
    expect(event.header.eventId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(event.payload).toMatchObject({
      tenantId: 't1',
      caseId: 'case1',
      collectionId: 'col1',
      cancelReason: 'yanlış kayıt',
    });
    expect(event.payload.amount).toBeUndefined();
    expect(event.payload.currency).toBeUndefined();
    expect(event.payload.originalLedgerEntryId).toBeUndefined();
    expect(event.payload.reversalLedgerEntryId).toBeUndefined();
    expect(event.payload.reversedAt).toEqual(expect.any(String));
    expect(event.payload.clientId).toBeUndefined();
    expect(event.payload.allocationBreakdown).toBeUndefined();
    expect(event.payload.collectionDispositionId).toBeUndefined();
    expect(event.payload.clientStatementId).toBeUndefined();
    expect(event.payload.balanceLedgerId).toBeUndefined();
    expect(event.payload.payoutId).toBeUndefined();
  });

  it('gerçek DomainEventIngestService ile timeline ve outbox row aynı tx içinde yazılır', async () => {
    const tx = buildTx({ originalLedger: null, currentMaxVersion: BigInt(7) });
    const realDomainEvent = new DomainEventIngestService();
    const { service } = buildService(tx, null, realDomainEvent);

    await service.cancel('t1', 'col1', { cancelReason: 'outbox kanıtı' } as any);

    expect(tx.icrabotTimelineEntry.create).toHaveBeenCalledTimes(1);
    expect(tx.icrabotOutboxAction.create).toHaveBeenCalledTimes(1);

    const timelineData = tx.icrabotTimelineEntry.create.mock.calls[0][0].data;
    expect(timelineData).toMatchObject({
      caseId: 'case1',
      tenantId: 't1',
      type: 'PAYMENT_REVERSED',
      aggregateVersion: BigInt(8),
    });
    expect(timelineData.body.header).toMatchObject({
      eventType: 'PAYMENT_REVERSED',
      aggregateType: 'Case',
      aggregateId: 'case1',
      tenantId: 't1',
      causedBy: 'payment-event-1',
    });

    const outboxData = tx.icrabotOutboxAction.create.mock.calls[0][0].data;
    expect(outboxData).toMatchObject({
      caseId: 'case1',
      tenantId: 't1',
      actionType: 'EVENT_PUBLISHED:PAYMENT_REVERSED',
      idempotencyKey: `evt:${timelineData.body.header.eventId}`,
      payload: {
        tenantId: 't1',
        caseId: 'case1',
        collectionId: 'col1',
        eventId: timelineData.body.header.eventId,
        eventType: 'PAYMENT_REVERSED',
        aggregateId: 'case1',
        aggregateVersion: 8,
      },
    });
  });
  it('outbox append hata verirse fake transaction rollback eder ve finansal yan etki commit olmaz', async () => {
    const originalLedger = {
      id: 'le-rollback',
      amount: 300,
      currency: 'TRY',
      effectiveDate: null,
      referenceNo: null,
      reversedByLedgerEntry: null,
      allocations: [{ claimItemId: 'ci-rollback', amount: 300, allocationOrder: 1 }],
    };
    const tx = buildTx({ originalLedger, currentMaxVersion: BigInt(3) });
    const committed = {
      collectionStatus: 'CONFIRMED',
      reversalCount: 0,
      claimItemMutationCount: 0,
      overpaymentMutationCount: 0,
      timelineCount: 0,
      outboxCount: 0,
    };
    const pending = { ...committed };

    tx.collection.update.mockImplementation(async ({ data }: any) => {
      pending.collectionStatus = data.status;
      return { id: 'col1', tenantId: 't1', caseId: 'case1', amount: 1000, currency: 'TRY', ...data };
    });
    tx.ledgerEntry.create.mockImplementation(async (input: any) => {
      pending.reversalCount += 1;
      return { id: 'rev-rollback', ...input.data };
    });
    tx.claimItem.updateMany.mockImplementation(async () => {
      pending.claimItemMutationCount += 1;
      return { count: 1 };
    });
    tx.collectionOverpayment.updateMany.mockImplementation(async () => {
      pending.overpaymentMutationCount += 1;
      return { count: 1 };
    });
    tx.icrabotTimelineEntry.create.mockImplementation(async (input: any) => {
      pending.timelineCount += 1;
      return input.data;
    });
    tx.icrabotOutboxAction.create.mockImplementation(async () => {
      pending.outboxCount += 1;
      throw new Error('outbox down');
    });

    const prisma: any = {
      $transaction: jest.fn(async (fn: any) => {
        try {
          const result = await fn(tx);
          Object.assign(committed, pending);
          return result;
        } catch (error) {
          return Promise.reject(error);
        }
      }),
      collection: { findFirst: jest.fn() },
    };
    const service = new CollectionService(
      prisma,
      new DomainEventIngestService(),
      {} as any,
      undefined,
    );

    await expect(service.cancel('t1', 'col1', { cancelReason: 'outbox hata' } as any)).rejects.toThrow('outbox down');

    expect(committed).toEqual({
      collectionStatus: 'CONFIRMED',
      reversalCount: 0,
      claimItemMutationCount: 0,
      overpaymentMutationCount: 0,
      timelineCount: 0,
      outboxCount: 0,
    });
    expect(tx.collection.update).toHaveBeenCalled();
    expect(tx.ledgerEntry.create).toHaveBeenCalled();
    expect(tx.claimItem.updateMany).toHaveBeenCalled();
    expect(tx.icrabotOutboxAction.create).toHaveBeenCalled();
  });
  it('PAYMENT_REVERSED eventId tenant + collection için deterministik kalır', async () => {
    const tx1 = buildTx({ originalLedger: null });
    const tx2 = buildTx({ originalLedger: null });
    const first = buildService(tx1);
    const second = buildService(tx2);

    await first.service.cancel('t1', 'col1', { cancelReason: 'a' } as any);
    await second.service.cancel('t1', 'col1', { cancelReason: 'b' } as any);

    const firstEvent = getAppendCall(first.domainEvent)[1];
    const secondEvent = getAppendCall(second.domainEvent)[1];
    expect(firstEvent.header.eventId).toBe(secondEvent.header.eventId);
  });

  it('PAYMENT_REVERSED payload kapsamı original PAYMENT_RECEIVED tutarını finansal veri olarak taşımaz', async () => {
    const tx = buildTx({
      originalLedger: null,
      paymentEvent: buildPaymentReceivedEvent({ payload: { amount: '1000.25' } }),
    });
    const { service, domainEvent } = buildService(tx);

    await service.cancel('t1', 'col1', { cancelReason: 'dekont düzeltme' } as any);

    const event = getAppendCall(domainEvent)[1];
    expect(event.payload).toMatchObject({
      tenantId: 't1',
      caseId: 'case1',
      collectionId: 'col1',
      cancelReason: 'dekont düzeltme',
    });
    expect(event.payload.amount).toBeUndefined();
  });

  it('original PAYMENT_RECEIVED yoksa 409 ile fail-close olur ve mutasyon yapmaz', async () => {
    const tx = buildTx({ originalLedger: null, paymentEvent: null });
    const { service, domainEvent } = buildService(tx);

    try {
      await service.cancel('t1', 'col1', { cancelReason: 'legacy eksik event' } as any);
      throw new Error('cancel should have failed');
    } catch (error: any) {
      expect(error).toBeInstanceOf(ConflictException);
      expect(error.getStatus()).toBe(409);
      expect(error.getResponse()).toMatchObject({
        errorCode: 'PAYMENT_RECEIVED_EVENT_NOT_FOUND',
        message: 'Original PAYMENT_RECEIVED event not found for collection reversal.',
      });
    }

    expect(tx.collection.update).not.toHaveBeenCalled();
    expect(tx.ledgerEntry.create).not.toHaveBeenCalled();
    expect(tx.claimItem.updateMany).not.toHaveBeenCalled();
    expect(tx.collectionOverpayment.updateMany).not.toHaveBeenCalled();
    expect(domainEvent.appendInTransaction).not.toHaveBeenCalled();
  });

  it('cross-tenant original PAYMENT_RECEIVED causedBy olarak kullanılamaz; 409 fail-close ve reversal event yok', async () => {
    const tx = buildTx({
      originalLedger: null,
      paymentEvent: buildPaymentReceivedEvent({
        header: { tenantId: 'other-tenant' },
        payload: { collectionId: 'col1' },
      }),
    });
    const { service, domainEvent } = buildService(tx);

    try {
      await service.cancel('t1', 'col1', { cancelReason: 'tenant sızıntısı' } as any);
      throw new Error('cancel should have failed');
    } catch (error: any) {
      expect(error).toBeInstanceOf(ConflictException);
      expect(error.getStatus()).toBe(409);
      expect(error.getResponse()).toMatchObject({
        errorCode: 'PAYMENT_RECEIVED_EVENT_NOT_FOUND',
      });
    }

    expect(tx.collection.update).not.toHaveBeenCalled();
    expect(tx.ledgerEntry.create).not.toHaveBeenCalled();
    expect(tx.collectionOverpayment.updateMany).not.toHaveBeenCalled();
    expect(domainEvent.appendInTransaction).not.toHaveBeenCalled();
  });

  it('cross-case original PAYMENT_RECEIVED causedBy olarak kullanılamaz; 409 fail-close ve reversal event yok', async () => {
    const tx = buildTx({
      originalLedger: null,
      paymentEvent: buildPaymentReceivedEvent({
        header: { aggregateId: 'other-case' },
        payload: { collectionId: 'col1' },
      }),
    });
    const { service, domainEvent } = buildService(tx);

    try {
      await service.cancel('t1', 'col1', { cancelReason: 'case sızıntısı' } as any);
      throw new Error('cancel should have failed');
    } catch (error: any) {
      expect(error).toBeInstanceOf(ConflictException);
      expect(error.getStatus()).toBe(409);
      expect(error.getResponse()).toMatchObject({
        errorCode: 'PAYMENT_RECEIVED_EVENT_NOT_FOUND',
      });
    }

    expect(tx.collection.update).not.toHaveBeenCalled();
    expect(tx.ledgerEntry.create).not.toHaveBeenCalled();
    expect(tx.collectionOverpayment.updateMany).not.toHaveBeenCalled();
    expect(domainEvent.appendInTransaction).not.toHaveBeenCalled();
  });
  it('kısmi PAYMENT cancel edilince allocation mirror ve projection rollback aynı tutarda olur', async () => {
    const originalLedger = {
      id: 'le-partial',
      amount: 400,
      currency: 'TRY',
      effectiveDate: null,
      referenceNo: 'PARTIAL-1',
      reversedByLedgerEntry: null,
      allocations: [
        { claimItemId: 'ci-principal', amount: 400, allocationOrder: 1 },
      ],
    };
    const tx = buildTx({ originalLedger });
    const { service } = buildService(tx);

    await service.cancel('t1', 'col1', { cancelReason: 'kısmi ödeme iptali' } as any);

    const reversalData = tx.ledgerEntry.create.mock.calls[0][0].data;
    expect(reversalData).toMatchObject({
      tenantId: 't1',
      caseId: 'case1',
      collectionId: 'col1',
      reversesLedgerEntryId: 'le-partial',
      entryType: 'REVERSAL',
      amount: -400,
      referenceNo: 'PARTIAL-1',
      sourceType: 'COLLECTION_CANCEL',
      sourceId: 'col1',
      status: 'CONFIRMED',
    });
    expect(reversalData.allocations.create).toEqual([
      { claimItemId: 'ci-principal', amount: -400, allocationOrder: 1 },
    ]);
    expect(tx.claimItem.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: 'ci-principal', tenantId: 't1', caseId: 'case1' },
      data: { collectedAmount: { decrement: 400 } },
    });
    expect(tx.claimItem.updateMany).toHaveBeenNthCalledWith(2, {
      where: {
        id: 'ci-principal',
        tenantId: 't1',
        caseId: 'case1',
        collectedAmount: { lt: 0 },
      },
      data: { collectedAmount: 0 },
    });
    expect(tx.claimItem.updateMany).toHaveBeenCalledTimes(2);
  });

  it('REVERSAL projection decrement clamp ile negatif collectedAmount bırakmaz', async () => {
    const originalLedger = {
      id: 'le1',
      amount: 1200,
      currency: 'TRY',
      effectiveDate: null,
      referenceNo: null,
      reversedByLedgerEntry: null,
      allocations: [
        { claimItemId: 'ci-principal', amount: 1200, allocationOrder: 1 },
      ],
    };
    const tx = buildTx({ originalLedger });
    const { service } = buildService(tx);

    await service.cancel('t1', 'col1', { cancelReason: 'fazla projection clamp' } as any);

    expect(tx.claimItem.updateMany).toHaveBeenCalledWith({
      where: { id: 'ci-principal', tenantId: 't1', caseId: 'case1' },
      data: { collectedAmount: { decrement: 1200 } },
    });
    expect(tx.claimItem.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'ci-principal',
        tenantId: 't1',
        caseId: 'case1',
        collectedAmount: { lt: 0 },
      },
      data: { collectedAmount: 0 },
    });
  });

  it('linked ledger yoksa REVERSAL yazmaz ama HELD overpayment projection kapatilir', async () => {
    const tx = buildTx({ originalLedger: null });
    const { service } = buildService(tx);

    await service.cancel('t1', 'col1', { cancelReason: 'ledger yok' } as any);

    expect(tx.collection.update).toHaveBeenCalledTimes(1);
    expect(tx.ledgerEntry.create).not.toHaveBeenCalled();
    expect(tx.claimItem.updateMany).not.toHaveBeenCalled();
    expect(tx.collectionOverpayment.updateMany).toHaveBeenCalledWith({
      where: {
        tenantId: 't1',
        caseId: 'case1',
        collectionId: 'col1',
        status: 'HELD',
      },
      data: {
        status: 'REVERSED',
        remainingAmount: 0,
        reversedAt: expect.any(Date),
      },
    });
  });

  it('Collection zaten CANCELLED ise ikinci reversal yazmaz', async () => {
    const tx = buildTx({
      collection: {
        id: 'col1',
        tenantId: 't1',
        caseId: 'case1',
        status: 'CANCELLED',
      },
    });
    const { service, domainEvent } = buildService(tx);

    await expect(
      service.cancel('t1', 'col1', { cancelReason: 'tekrar' } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.collection.update).not.toHaveBeenCalled();
    expect(tx.ledgerEntry.create).not.toHaveBeenCalled();
    expect(tx.claimItem.updateMany).not.toHaveBeenCalled();
    expect(tx.collectionOverpayment.updateMany).not.toHaveBeenCalled();
    expect(domainEvent.appendInTransaction).not.toHaveBeenCalled();
  });

  it('tenant guard fail-closed: collection bulunmazsa yazma yapmaz', async () => {
    const tx = buildTx({ collection: null });
    const { service, domainEvent } = buildService(tx);

    await expect(
      service.cancel('other-tenant', 'col1', { cancelReason: 'x' } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.collection.update).not.toHaveBeenCalled();
    expect(tx.ledgerEntry.create).not.toHaveBeenCalled();
    expect(tx.claimItem.updateMany).not.toHaveBeenCalled();
    expect(tx.collectionOverpayment.updateMany).not.toHaveBeenCalled();
    expect(domainEvent.appendInTransaction).not.toHaveBeenCalled();
  });

  it('case route boundary guard: expectedCaseId ile lookup case-scoped olur ve mismatch yazma yapmaz', async () => {
    const tx = buildTx({ collection: null });
    const { service } = buildService(tx);

    await expect(
      service.cancel('t1', 'col1', { cancelReason: 'wrong case' } as any, 'case-a'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.collection.findFirst).toHaveBeenCalledWith({
      where: { id: 'col1', tenantId: 't1', caseId: 'case-a' },
    });
    expect(tx.collection.update).not.toHaveBeenCalled();
    expect(tx.ledgerEntry.create).not.toHaveBeenCalled();
    expect(tx.claimItem.updateMany).not.toHaveBeenCalled();
    expect(tx.collectionOverpayment.updateMany).not.toHaveBeenCalled();
  });

  it('existing reversedByLedgerEntry varsa duplicate REVERSAL yazmaz', async () => {
    const tx = buildTx({
      originalLedger: {
        id: 'le1',
        amount: 1000,
        currency: 'TRY',
        effectiveDate: null,
        referenceNo: null,
        reversedByLedgerEntry: { id: 'rev-existing' },
        allocations: [],
      },
    });
    const { service } = buildService(tx);

    await service.cancel('t1', 'col1', { cancelReason: 'already reversed' } as any);

    expect(tx.collection.update).toHaveBeenCalledTimes(1);
    expect(tx.ledgerEntry.create).not.toHaveBeenCalled();
    expect(tx.claimItem.updateMany).not.toHaveBeenCalled();
  });

  it('P2002 duplicate reversal race güvenli şekilde already-cancelled hatasına döner', async () => {
    const p2002 = Object.assign(new Error('unique violation'), { code: 'P2002' });
    const tx = buildTx({
      originalLedger: {
        id: 'le1',
        amount: 1000,
        currency: 'TRY',
        effectiveDate: null,
        referenceNo: null,
        reversedByLedgerEntry: null,
        allocations: [],
      },
      ledgerCreateError: p2002,
    });
    const { service, prisma, domainEvent } = buildService(tx, {
      id: 'col1',
      status: 'CANCELLED',
      allocations: [],
    });

    await expect(
      service.cancel('t1', 'col1', { cancelReason: 'race' } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.collection.findFirst).toHaveBeenCalled();
    expect(tx.claimItem.updateMany).not.toHaveBeenCalled();
    expect(domainEvent.appendInTransaction).not.toHaveBeenCalled();
  });
});
