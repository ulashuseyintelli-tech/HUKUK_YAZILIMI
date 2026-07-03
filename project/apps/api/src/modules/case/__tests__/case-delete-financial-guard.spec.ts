/**
 * CBND-4 (H7) + CS2 — CaseService.delete() footprint guard'ı.
 *
 * CBND-4: Collection→Case onDelete:Cascade → tahsilat kayıtları case silinince SESSİZCE silinirdi;
 * 4 finansal sayaç (Collection/ClientOffset/ClientPayout/ClientPayoutManualReversal) explicit kontrol.
 *
 * CS2 (CS1 owner-karar): guard FOOTPRINT'e genişletildi — hukuki/operasyonel izler de sayılır
 * (LedgerEntry, ClaimItem, Due, Tebligat, ExpenseRequest, Task, DecisionLog, IcrabotTimelineEntry,
 * CaseDocument). Yapısal bağlar (CaseDebtor/CaseClient/CaseLawyer/CaseStaff) footprint SAYILMAZ.
 * Ek: Restrict-P2003 → kontrollü 409; delete audit'i logInTransaction (gerçek tx-bağlı).
 *
 * Test deseni (case-update-fk-tenant ile aynı): mock prisma + findOne override.
 */
import { ConflictException } from '@nestjs/common';
import { CaseService } from '../case.service';

type Counts = {
  collection?: number; offset?: number; payout?: number; manualReversal?: number;
  ledgerEntry?: number; claimItem?: number; due?: number; tebligat?: number;
  expenseRequest?: number; task?: number; decisionLog?: number; timelineEntry?: number; caseDocument?: number;
};

function setup(counts: Counts = {}, opts: { deleteError?: any } = {}) {
  const stub = {} as any;
  const service = new CaseService(stub, stub, stub, stub, stub, stub, stub, stub, stub, stub);

  const mkCount = (n?: number) => jest.fn(async () => n ?? 0);
  const counters = {
    collection: mkCount(counts.collection),
    clientOffset: mkCount(counts.offset),
    clientPayout: mkCount(counts.payout),
    clientPayoutManualReversal: mkCount(counts.manualReversal),
    ledgerEntry: mkCount(counts.ledgerEntry),
    claimItem: mkCount(counts.claimItem),
    due: mkCount(counts.due),
    tebligat: mkCount(counts.tebligat),
    expenseRequest: mkCount(counts.expenseRequest),
    task: mkCount(counts.task),
    decisionLog: mkCount(counts.decisionLog),
    icrabotTimelineEntry: mkCount(counts.timelineEntry),
    caseDocument: mkCount(counts.caseDocument),
  };

  const caseDelete = opts.deleteError
    ? jest.fn(async () => { throw opts.deleteError; })
    : jest.fn(async () => ({ id: 'case-1' }));
  const auditLogInTx = jest.fn(async () => undefined);
  const txMock = { case: { delete: caseDelete } };
  const transaction = jest.fn(async (cb: any) => cb(txMock));

  (service as any).findOne = jest.fn(async () => ({ id: 'case-1', tenantId: 'tenant-1', fileNumber: 'F-1' }));
  (service as any).auditService = { log: jest.fn(async () => undefined), logInTransaction: auditLogInTx };
  (service as any).prisma = {
    collection: { count: counters.collection },
    clientOffset: { count: counters.clientOffset },
    clientPayout: { count: counters.clientPayout },
    clientPayoutManualReversal: { count: counters.clientPayoutManualReversal },
    ledgerEntry: { count: counters.ledgerEntry },
    claimItem: { count: counters.claimItem },
    due: { count: counters.due },
    tebligat: { count: counters.tebligat },
    expenseRequest: { count: counters.expenseRequest },
    task: { count: counters.task },
    decisionLog: { count: counters.decisionLog },
    icrabotTimelineEntry: { count: counters.icrabotTimelineEntry },
    caseDocument: { count: counters.caseDocument },
    $transaction: transaction,
  };

  return { service, counters, caseDelete, auditLogInTx, transaction, txMock };
}

describe('CBND-4 (H7) + CS2 CaseService.delete() — footprint guard', () => {
  it('footprint yok (tüm sayaçlar 0) → silme AYNEN devam eder, audit logInTransaction ile tx içinde yazılır', async () => {
    const { service, caseDelete, auditLogInTx, txMock } = setup();

    const result = await service.delete('tenant-1', 'case-1', 'user-1');

    expect(result).toEqual({ success: true });
    expect(caseDelete).toHaveBeenCalledWith({ where: { id: 'case-1' } });
    expect(auditLogInTx).toHaveBeenCalledTimes(1);
    const [txArg, input] = auditLogInTx.mock.calls[0] as any[];
    expect(txArg).toBe(txMock); // CS2: audit GERÇEKTEN aynı tx client'ına bağlı
    expect(input).toMatchObject({ action: 'DELETE', entityType: 'CASE', entityId: 'case-1', userId: 'user-1' });
  });

  // CBND-4 orijinal 4 finansal sayaç — davranış AYNEN korunur.
  it.each([
    ['Collection', { collection: 3 }],
    ['ClientOffset', { offset: 1 }],
    ['ClientPayout', { payout: 1 }],
    ['ClientPayoutManualReversal', { manualReversal: 1 }],
  ] as [string, Counts][])('%s var → ConflictException, transaction HİÇ açılmaz', async (_label, counts) => {
    const { service, transaction, caseDelete } = setup(counts);

    await expect(service.delete('tenant-1', 'case-1', 'user-1')).rejects.toBeInstanceOf(ConflictException);
    expect(transaction).not.toHaveBeenCalled();
    expect(caseDelete).not.toHaveBeenCalled();
  });

  // CS2 footprint matrisi — her yeni sayaç tek başına silmeyi bloklar.
  it.each([
    ['LedgerEntry', { ledgerEntry: 1 }],
    ['ClaimItem', { claimItem: 2 }],
    ['Due', { due: 1 }],
    ['Tebligat', { tebligat: 1 }],
    ['ExpenseRequest', { expenseRequest: 1 }],
    ['Task', { task: 4 }],
    ['DecisionLog', { decisionLog: 1 }],
    ['IcrabotTimelineEntry', { timelineEntry: 7 }],
    ['CaseDocument', { caseDocument: 1 }],
  ] as [string, Counts][])('CS2: %s var → ConflictException CASE_DELETE_FINANCIAL_ACTIVITY, transaction açılmaz', async (label, counts) => {
    const { service, transaction } = setup(counts);

    await expect(service.delete('tenant-1', 'case-1', 'user-1')).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'CASE_DELETE_FINANCIAL_ACTIVITY',
        message: expect.stringContaining(label),
      }),
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it('birden fazla blocker aynı anda → hata kodu CASE_DELETE_FINANCIAL_ACTIVITY, mesaj hepsini listeler', async () => {
    const { service } = setup({ collection: 2, ledgerEntry: 1, due: 3, caseDocument: 1 });

    await expect(service.delete('tenant-1', 'case-1', 'user-1')).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'CASE_DELETE_FINANCIAL_ACTIVITY',
        message: expect.stringContaining('2 tahsilat'),
      }),
    });
  });

  it('sayaç sorguları tenant/caseId scoped çağrılır (tenantId alanı olan modellerde tenantId dahil)', async () => {
    const { service, counters } = setup();

    await service.delete('tenant-1', 'case-1', 'user-1');

    expect(counters.collection).toHaveBeenCalledWith({ where: { tenantId: 'tenant-1', caseId: 'case-1' } });
    expect(counters.clientOffset).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', OR: [{ payableCaseId: 'case-1' }, { expenseCaseId: 'case-1' }] },
    });
    expect(counters.ledgerEntry).toHaveBeenCalledWith({ where: { tenantId: 'tenant-1', caseId: 'case-1' } });
    expect(counters.claimItem).toHaveBeenCalledWith({ where: { tenantId: 'tenant-1', caseId: 'case-1' } });
    expect(counters.tebligat).toHaveBeenCalledWith({ where: { tenantId: 'tenant-1', caseId: 'case-1' } });
    expect(counters.expenseRequest).toHaveBeenCalledWith({ where: { tenantId: 'tenant-1', caseId: 'case-1' } });
    expect(counters.task).toHaveBeenCalledWith({ where: { tenantId: 'tenant-1', caseId: 'case-1' } });
    // tenantId alanı olmayan/nullable modeller: yalnız caseId (Case zaten tenant-scoped findOne'dan geçti).
    expect(counters.due).toHaveBeenCalledWith({ where: { caseId: 'case-1' } });
    expect(counters.decisionLog).toHaveBeenCalledWith({ where: { caseId: 'case-1' } });
    expect(counters.icrabotTimelineEntry).toHaveBeenCalledWith({ where: { caseId: 'case-1' } });
    expect(counters.caseDocument).toHaveBeenCalledWith({ where: { caseId: 'case-1' } });
  });

  it('CS2: sayaçlarda olmayan Restrict ilişki → ham P2003 DEĞİL, kontrollü 409 CASE_DELETE_RESTRICTED_RELATION', async () => {
    const p2003: any = new Error('Foreign key constraint failed');
    p2003.code = 'P2003';
    const { service } = setup({}, { deleteError: p2003 });

    await expect(service.delete('tenant-1', 'case-1', 'user-1')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'CASE_DELETE_RESTRICTED_RELATION' }),
    });
  });

  it('CS2: P2003 dışı hata AYNEN fırlatılır (yutulmaz)', async () => {
    const boom = new Error('db down');
    const { service } = setup({}, { deleteError: boom });

    await expect(service.delete('tenant-1', 'case-1', 'user-1')).rejects.toThrow('db down');
  });

  it('case bulunamazsa (findOne 404) → footprint guard hiç çalışmaz', async () => {
    const { service, counters } = setup();
    (service as any).findOne = jest.fn(async () => {
      throw new Error('not found');
    });

    await expect(service.delete('tenant-1', 'foreign-case', 'user-1')).rejects.toThrow('not found');
    expect(counters.collection).not.toHaveBeenCalled();
  });
});
