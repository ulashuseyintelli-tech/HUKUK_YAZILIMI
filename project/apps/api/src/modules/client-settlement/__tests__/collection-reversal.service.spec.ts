/**
 * TM3 M1R — CollectionReversalService testleri.
 * Davranış matrisi (Ulaş contract 2026-06-27):
 *  - HELD_PENDING_DISTRIBUTION → REVERSED (success)
 *  - REVERSED / CANCELLED → idempotent skip (success)
 *  - no disposition → handled skip (success)
 *  - POSTED → KÖR REVERSED YOK; manuel-reversal-required + finansal dokunma YOK (success)
 *  - missing collectionId → handled no-op (success, throw YOK — poison engeli)
 *  - missing tenantId / tenant mismatch / wrong caseId → fail-closed (throw, mutasyon YOK)
 *  - ClientStatement / BalanceLedger / payout YAZILMAZ; clientId VARSAYILMAZ.
 */
import { CollectionReversalService } from '../collection-reversal.service';

const CTX = { actionId: 'evt-rev-1', tenantId: 't1', actionType: 'EVENT_PUBLISHED:PAYMENT_REVERSED' };

function buildPrisma(disp: any | null) {
  return {
    collectionDisposition: {
      findUnique: jest.fn().mockResolvedValue(disp),
      update: jest.fn().mockResolvedValue({ id: disp?.id ?? 'disp1', status: 'REVERSED' }),
    },
    // M1R bu tabloları ASLA yazmamalı — varlıkları yalnız "çağrılmadı" assertion'ı için.
    clientStatementLine: { create: jest.fn(), createMany: jest.fn() },
    balanceLedger: { create: jest.fn() },
    clientPayout: { create: jest.fn() },
    $transaction: jest.fn(),
  } as any;
}

const svc = (prisma: any) => new CollectionReversalService(prisma);

/** Hiçbir finansal yan-etki yazılmadığını doğrular (her testte ortak invariant). */
function expectNoFinancialMutation(prisma: any) {
  expect(prisma.clientStatementLine.create).not.toHaveBeenCalled();
  expect(prisma.clientStatementLine.createMany).not.toHaveBeenCalled();
  expect(prisma.balanceLedger.create).not.toHaveBeenCalled();
  expect(prisma.clientPayout.create).not.toHaveBeenCalled();
  expect(prisma.$transaction).not.toHaveBeenCalled();
}

describe('CollectionReversalService.reverseFromPaymentReversed', () => {
  it('HELD_PENDING_DISTRIBUTION → status REVERSED (success), finansal yan-etki YOK', async () => {
    const prisma = buildPrisma({ id: 'disp1', tenantId: 't1', caseId: 'case1', status: 'HELD_PENDING_DISTRIBUTION' });
    const res = await svc(prisma).reverseFromPaymentReversed({ collectionId: 'col1' }, 'case1', CTX);

    expect(res.outcome).toBe('reversed');
    expect(res.dispositionId).toBe('disp1');
    expect(res.reversalSourceEventId).toBe('evt-rev-1');
    expect(prisma.collectionDisposition.update).toHaveBeenCalledWith({
      where: { id: 'disp1' },
      data: { status: 'REVERSED' },
    });
    expectNoFinancialMutation(prisma);
  });

  it('zaten REVERSED → idempotent skip, update YOK', async () => {
    const prisma = buildPrisma({ id: 'disp1', tenantId: 't1', caseId: 'case1', status: 'REVERSED' });
    const res = await svc(prisma).reverseFromPaymentReversed({ collectionId: 'col1' }, 'case1', CTX);

    expect(res.outcome).toBe('skip-already-reversed');
    expect(prisma.collectionDisposition.update).not.toHaveBeenCalled();
    expectNoFinancialMutation(prisma);
  });

  it('zaten CANCELLED → idempotent skip, update YOK', async () => {
    const prisma = buildPrisma({ id: 'disp1', tenantId: 't1', caseId: 'case1', status: 'CANCELLED' });
    const res = await svc(prisma).reverseFromPaymentReversed({ collectionId: 'col1' }, 'case1', CTX);

    expect(res.outcome).toBe('skip-already-cancelled');
    expect(prisma.collectionDisposition.update).not.toHaveBeenCalled();
    expectNoFinancialMutation(prisma);
  });

  it('disposition yok → handled skip (success), update YOK', async () => {
    const prisma = buildPrisma(null);
    const res = await svc(prisma).reverseFromPaymentReversed({ collectionId: 'col1' }, 'case1', CTX);

    expect(res.outcome).toBe('skip-no-disposition');
    expect(prisma.collectionDisposition.update).not.toHaveBeenCalled();
    expectNoFinancialMutation(prisma);
  });

  it('POSTED → KÖR REVERSED YAPMA: manuel-reversal-required + update YOK + finansal dokunma YOK', async () => {
    const prisma = buildPrisma({ id: 'disp1', tenantId: 't1', caseId: 'case1', status: 'POSTED' });
    const res = await svc(prisma).reverseFromPaymentReversed({ collectionId: 'col1' }, 'case1', CTX);

    expect(res.outcome).toBe('posted-manual-reversal-required');
    expect(res.manualReversalRequired).toBe(true);
    expect(res.previousStatus).toBe('POSTED');
    // En kritik invariant: POSTED status DEĞİŞMEZ (REVERSED'e çekilmez).
    expect(prisma.collectionDisposition.update).not.toHaveBeenCalled();
    expectNoFinancialMutation(prisma);
  });

  it('missing collectionId → handled no-op (success, THROW YOK), findUnique çağrılmaz', async () => {
    const prisma = buildPrisma({ id: 'disp1', tenantId: 't1', caseId: 'case1', status: 'HELD_PENDING_DISTRIBUTION' });
    const res = await svc(prisma).reverseFromPaymentReversed({}, 'case1', CTX);

    expect(res.outcome).toBe('skip-missing-collection-id');
    expect(prisma.collectionDisposition.findUnique).not.toHaveBeenCalled();
    expect(prisma.collectionDisposition.update).not.toHaveBeenCalled();
    expectNoFinancialMutation(prisma);
  });

  it('missing tenantId (context yok) → fail-closed throw', async () => {
    const prisma = buildPrisma({ id: 'disp1', tenantId: 't1', caseId: 'case1', status: 'HELD_PENDING_DISTRIBUTION' });
    await expect(
      svc(prisma).reverseFromPaymentReversed({ collectionId: 'col1' }, 'case1', undefined),
    ).rejects.toThrow(/tenant doğrulanmadan/);
    expect(prisma.collectionDisposition.update).not.toHaveBeenCalled();
    expectNoFinancialMutation(prisma);
  });

  it('tenant mismatch → fail-closed throw, mutasyon YOK', async () => {
    // disposition t1'e ait; event tB'den geliyor → cross-tenant integrity alarmı.
    const prisma = buildPrisma({ id: 'disp1', tenantId: 't1', caseId: 'case1', status: 'HELD_PENDING_DISTRIBUTION' });
    await expect(
      svc(prisma).reverseFromPaymentReversed({ collectionId: 'col1' }, 'case1', { ...CTX, tenantId: 'tB' }),
    ).rejects.toThrow(/tenant mismatch/);
    expect(prisma.collectionDisposition.update).not.toHaveBeenCalled();
    expectNoFinancialMutation(prisma);
  });

  it('wrong caseId → fail-closed throw, mutasyon YOK', async () => {
    const prisma = buildPrisma({ id: 'disp1', tenantId: 't1', caseId: 'case1', status: 'HELD_PENDING_DISTRIBUTION' });
    await expect(
      svc(prisma).reverseFromPaymentReversed({ collectionId: 'col1' }, 'BASKA_CASE', CTX),
    ).rejects.toThrow(/case mismatch/);
    expect(prisma.collectionDisposition.update).not.toHaveBeenCalled();
    expectNoFinancialMutation(prisma);
  });

  it('bilinmeyen status → handled skip (success), mutasyon YOK', async () => {
    const prisma = buildPrisma({ id: 'disp1', tenantId: 't1', caseId: 'case1', status: 'FUTURE_STATUS' });
    const res = await svc(prisma).reverseFromPaymentReversed({ collectionId: 'col1' }, 'case1', CTX);

    expect(res.outcome).toBe('skip-unsupported-status');
    expect(prisma.collectionDisposition.update).not.toHaveBeenCalled();
    expectNoFinancialMutation(prisma);
  });
});
