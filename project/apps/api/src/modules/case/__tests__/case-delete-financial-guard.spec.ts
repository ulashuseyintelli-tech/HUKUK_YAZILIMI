/**
 * CBND-4 (H7) — CaseService.delete() finansal artık guard'ı.
 *
 * Açık: Collection→Case onDelete:Cascade → tahsilat kayıtları case silinince SESSİZCE silinirdi.
 * ClientOffset FK'sız (scalar-ref) → silinen case/caseClient'a işaret eden DANGLING kayıt bırakırdı.
 * ClientPayoutAllocation/ClientPayoutManualReversal onDelete:Restrict korumalıydı ama ham Prisma
 * FK-constraint hatası olarak patlıyordu (temiz mesaj yok). Fix: dördü de silmeden ÖNCE explicit
 * kontrol edilir; herhangi biri varsa tek, anlaşılır ConflictException — tx hiç açılmaz.
 *
 * Test deseni (case-update-fk-tenant ile aynı): mock prisma + findOne override.
 */
import { ConflictException } from '@nestjs/common';
import { CaseService } from '../case.service';

function setup(counts: { collection?: number; offset?: number; payout?: number; manualReversal?: number } = {}) {
  const stub = {} as any;
  const service = new CaseService(stub, stub, stub, stub, stub, stub, stub, stub, stub, stub);

  const collectionCount = jest.fn(async () => counts.collection ?? 0);
  const offsetCount = jest.fn(async () => counts.offset ?? 0);
  const payoutCount = jest.fn(async () => counts.payout ?? 0);
  const manualReversalCount = jest.fn(async () => counts.manualReversal ?? 0);
  const caseDelete = jest.fn(async () => ({ id: 'case-1' }));
  const auditLog = jest.fn(async () => undefined);
  const transaction = jest.fn(async (cb: any) =>
    cb({ case: { delete: caseDelete } }),
  );

  (service as any).findOne = jest.fn(async () => ({ id: 'case-1', tenantId: 'tenant-1', fileNumber: 'F-1' }));
  (service as any).auditService = { log: auditLog };
  (service as any).prisma = {
    collection: { count: collectionCount },
    clientOffset: { count: offsetCount },
    clientPayout: { count: payoutCount },
    clientPayoutManualReversal: { count: manualReversalCount },
    $transaction: transaction,
  };

  return { service, collectionCount, offsetCount, payoutCount, manualReversalCount, caseDelete, auditLog, transaction };
}

describe('CBND-4 (H7) CaseService.delete() — finansal artık guard', () => {
  it('finansal aktivite yok (dört sayaç da 0) → silme AYNEN devam eder, audit yazılır', async () => {
    const { service, caseDelete, auditLog } = setup();

    const result = await service.delete('tenant-1', 'case-1', 'user-1');

    expect(result).toEqual({ success: true });
    expect(caseDelete).toHaveBeenCalledWith({ where: { id: 'case-1' } });
    expect(auditLog).toHaveBeenCalledTimes(1);
  });

  it('Collection var → ConflictException CASE_DELETE_FINANCIAL_ACTIVITY, transaction HİÇ açılmaz', async () => {
    const { service, transaction, caseDelete } = setup({ collection: 3 });

    await expect(service.delete('tenant-1', 'case-1', 'user-1')).rejects.toBeInstanceOf(ConflictException);
    expect(transaction).not.toHaveBeenCalled();
    expect(caseDelete).not.toHaveBeenCalled();
  });

  it('ClientOffset var → ConflictException, transaction açılmaz', async () => {
    const { service, transaction } = setup({ offset: 1 });

    await expect(service.delete('tenant-1', 'case-1', 'user-1')).rejects.toBeInstanceOf(ConflictException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('ClientPayout var → ConflictException, transaction açılmaz', async () => {
    const { service, transaction } = setup({ payout: 1 });

    await expect(service.delete('tenant-1', 'case-1', 'user-1')).rejects.toBeInstanceOf(ConflictException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('ClientPayoutManualReversal var → ConflictException, transaction açılmaz', async () => {
    const { service, transaction } = setup({ manualReversal: 1 });

    await expect(service.delete('tenant-1', 'case-1', 'user-1')).rejects.toBeInstanceOf(ConflictException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('birden fazla blocker aynı anda → hata kodu CASE_DELETE_FINANCIAL_ACTIVITY, mesaj hepsini listeler', async () => {
    const { service } = setup({ collection: 2, offset: 1, payout: 1, manualReversal: 1 });

    await expect(service.delete('tenant-1', 'case-1', 'user-1')).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'CASE_DELETE_FINANCIAL_ACTIVITY',
        message: expect.stringContaining('2 tahsilat'),
      }),
    });
  });

  it('sayaç sorguları tenant+caseId scoped çağrılır', async () => {
    const { service, collectionCount, offsetCount, payoutCount, manualReversalCount } = setup();

    await service.delete('tenant-1', 'case-1', 'user-1');

    expect(collectionCount).toHaveBeenCalledWith({ where: { tenantId: 'tenant-1', caseId: 'case-1' } });
    expect(offsetCount).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', OR: [{ payableCaseId: 'case-1' }, { expenseCaseId: 'case-1' }] },
    });
    expect(payoutCount).toHaveBeenCalledWith({ where: { tenantId: 'tenant-1', caseId: 'case-1' } });
    expect(manualReversalCount).toHaveBeenCalledWith({ where: { tenantId: 'tenant-1', caseId: 'case-1' } });
  });

  it('case bulunamazsa (findOne 404) → finansal guard hiç çalışmaz', async () => {
    const { service, collectionCount } = setup();
    (service as any).findOne = jest.fn(async () => {
      throw new Error('not found');
    });

    await expect(service.delete('tenant-1', 'foreign-case', 'user-1')).rejects.toThrow('not found');
    expect(collectionCount).not.toHaveBeenCalled();
  });
});
