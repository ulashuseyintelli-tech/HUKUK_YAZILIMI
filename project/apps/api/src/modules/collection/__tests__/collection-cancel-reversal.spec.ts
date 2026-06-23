import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CollectionService } from '../collection.service';

function buildTx(opts: {
  collection?: any;
  originalLedger?: any;
  ledgerCreateError?: any;
}) {
  const collection = Object.prototype.hasOwnProperty.call(opts, 'collection')
    ? opts.collection
    : {
      id: 'col1',
      tenantId: 't1',
      caseId: 'case1',
      status: 'CONFIRMED',
    };

  return {
    collection: {
      findFirst: jest.fn(async () => collection),
      update: jest.fn(async ({ data }: any) => ({
        id: 'col1',
        tenantId: 't1',
        caseId: 'case1',
        ...data,
      })),
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

function buildService(tx: any, outsideCollection: any = null) {
  const prisma: any = {
    $transaction: jest.fn(async (fn: any) => fn(tx)),
    collection: {
      findFirst: jest.fn(async () => outsideCollection),
    },
  };
  const service = new CollectionService(
    prisma,
    {} as any,
    {} as any,
    undefined,
  );
  return { service, prisma };
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
    const { service } = buildService(tx);

    await expect(
      service.cancel('t1', 'col1', { cancelReason: 'tekrar' } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.collection.update).not.toHaveBeenCalled();
    expect(tx.ledgerEntry.create).not.toHaveBeenCalled();
    expect(tx.claimItem.updateMany).not.toHaveBeenCalled();
    expect(tx.collectionOverpayment.updateMany).not.toHaveBeenCalled();
  });

  it('tenant guard fail-closed: collection bulunmazsa yazma yapmaz', async () => {
    const tx = buildTx({ collection: null });
    const { service } = buildService(tx);

    await expect(
      service.cancel('other-tenant', 'col1', { cancelReason: 'x' } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
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
    const { service, prisma } = buildService(tx, {
      id: 'col1',
      status: 'CANCELLED',
      allocations: [],
    });

    await expect(
      service.cancel('t1', 'col1', { cancelReason: 'race' } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.collection.findFirst).toHaveBeenCalled();
    expect(tx.claimItem.updateMany).not.toHaveBeenCalled();
  });
});
