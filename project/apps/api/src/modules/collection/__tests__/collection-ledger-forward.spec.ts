/**
 * G3a — CollectionService.create ledger forward write wiring testleri.
 *
 *  - ClaimItem varsa: allocatePaymentToLedgerInTx ÇAĞRILIR; Collection+event korunur;
 *    CollectionAllocation (autoAllocate) compat olarak çağrılmaya devam eder (S2).
 *  - ClaimItem yoksa (NO_CLAIM_ITEMS): diagnostic warn; akış KIRILMAZ; THROW yok.
 *  - summaryEngine enjekte değilse: warn; akış KIRILMAZ.
 */

import { CollectionService } from '../collection.service';
import { CollectionType } from '../dto/collection.dto';
import { BadRequestException } from '@nestjs/common';

function setup(opts: { summaryEngine?: any } = {}) {
  const tx: any = {
    case: { findFirst: jest.fn(async () => ({ id: 'c1', caseStatus: 'DERDEST' })) },
    collection: { create: jest.fn(async () => ({ id: 'col1' })), findFirst: jest.fn() },
    collectionAllocation: { create: jest.fn() },
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
      allocatePaymentToLedgerInTx: jest.fn(async () => ({ allocated: true, ledgerEntry: { id: 'le1' }, allocations: [] })),
    };
    const { svc, tx, domainEvent, autoSpy, warnSpy } = setup({ summaryEngine });

    await svc.create('t1', dto, 'u1');

    expect(summaryEngine.allocatePaymentToLedgerInTx).toHaveBeenCalledTimes(1);
    expect(summaryEngine.allocatePaymentToLedgerInTx).toHaveBeenCalledWith(
      tx,
      't1',
      'c1',
      1000,
      expect.objectContaining({ sourceType: undefined }),
    );
    expect(tx.collection.create).toHaveBeenCalled();
    expect(domainEvent.appendInTransaction).toHaveBeenCalled();
    expect(autoSpy).toHaveBeenCalled(); // S2 compat korunur
    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('not ledger-allocated'));
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
    expect(autoSpy).toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('payment not ledger-allocated'));
  });

  it('summaryEngine enjekte değilse: warn, akış kırılmaz', async () => {
    const { svc, tx, warnSpy } = setup({ summaryEngine: undefined });

    await svc.create('t1', dto, 'u1');

    expect(tx.collection.create).toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('SummaryEngine not injected'));
  });
});
