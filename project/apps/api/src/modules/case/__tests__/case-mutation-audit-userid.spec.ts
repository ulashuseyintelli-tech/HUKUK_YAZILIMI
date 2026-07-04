/**
 * WP-1c-2 — CASE mutasyon (update/delete/batchUpdate) AuditLog event'lerinde actor `userId`.
 *
 * Envanter (WP-1c-0): bu 3 user-driven CASE mutasyonu audit'i `userId` taşımıyordu ve metotlar
 * `userId` parametresi almıyordu → controller `@CurrentUser("id")` + service param + audit userId.
 * Kapsam: YALNIZ update/delete/batchUpdate. CASE_LAWYER/CASE_STAFF (WP-1c-3) ve diğerleri HARİÇ.
 *
 * `(service as any)` ile çağrılır: 4. arg (userId) implementasyon ÖNCESİ derlensin; değişiklik-öncesi
 * kodda audit `userId` taşımaz → assertion RED, fix sonrası GREEN.
 */

import { CaseService } from '../case.service';

const ACTOR = 'user-actor-1';

const makeSvc = () => {
  const stub = {} as any;
  const service = new CaseService(stub, stub, stub, stub, stub, stub, stub, stub, stub, stub);
  const auditLog = jest.fn(async () => undefined);
  // CS2: delete() audit'i artık logInTransaction ile tx-bağlı yazılır (update/batchUpdate log() kalır).
  const auditLogInTx = jest.fn(async () => undefined);
  (service as any).auditService = { log: auditLog, logInTransaction: auditLogInTx };
  (service as any).findOne = jest.fn(async (_t: string, id: string) => ({ id, fileNumber: 'F1' }));
  (service as any).validateCaseFkOwnership = jest.fn(async () => {});
  (service as any).validateLookupIds = jest.fn(async () => {});
  return { service, auditLog, auditLogInTx };
};

// CS2: assertNoCaseFootprint 13 sayaç sorgular — hepsi 0 dönen mock seti (footprint-yok senaryosu).
const zeroFootprintCounts = () => ({
  collection: { count: jest.fn().mockResolvedValue(0) },
  clientOffset: { count: jest.fn().mockResolvedValue(0) },
  clientPayout: { count: jest.fn().mockResolvedValue(0) },
  clientPayoutManualReversal: { count: jest.fn().mockResolvedValue(0) },
  ledgerEntry: { count: jest.fn().mockResolvedValue(0) },
  claimItem: { count: jest.fn().mockResolvedValue(0) },
  due: { count: jest.fn().mockResolvedValue(0) },
  tebligat: { count: jest.fn().mockResolvedValue(0) },
  expenseRequest: { count: jest.fn().mockResolvedValue(0) },
  task: { count: jest.fn().mockResolvedValue(0) },
  decisionLog: { count: jest.fn().mockResolvedValue(0) },
  icrabotTimelineEntry: { count: jest.fn().mockResolvedValue(0) },
  caseDocument: { count: jest.fn().mockResolvedValue(0) },
});

describe('WP-1c-2 — CASE update/delete/batchUpdate audit actor userId', () => {
  it('update → CASE UPDATE audit userId = actor', async () => {
    const { service, auditLog } = makeSvc();
    (service as any).prisma = { case: { update: jest.fn(async () => ({ fileNumber: 'F1' })) } };

    await (service as any).update('t1', 'case-1', { notes: 'x' }, ACTOR);

    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'UPDATE', entityType: 'CASE', entityId: 'case-1', userId: ACTOR }),
    );
  });

  it('delete → CASE DELETE audit userId = actor (CS2: logInTransaction ile tx içinde)', async () => {
    const { service, auditLogInTx } = makeSvc();
    (service as any).prisma = {
      // CS2: delete() transaction'dan ÖNCE assertNoCaseFootprint çağırır (13 sayaç).
      // Bu test footprint YOK senaryosunu kanıtlar (0 → guard geçer, audit-userId akışı sürer).
      ...zeroFootprintCounts(),
      $transaction: jest.fn(async (cb: any) => cb({ case: { delete: jest.fn(async () => ({})) } })),
    };

    await (service as any).delete('t1', 'case-1', ACTOR);

    expect(auditLogInTx).toHaveBeenCalledWith(
      expect.anything(), // tx client
      expect.objectContaining({ action: 'DELETE', entityType: 'CASE', entityId: 'case-1', userId: ACTOR }),
    );
  });

  it('batchUpdate → CASE UPDATE özet audit userId = actor', async () => {
    const { service, auditLog } = makeSvc();
    (service as any).prisma = { case: { updateMany: jest.fn(async () => ({ count: 2 })) } };

    await (service as any).batchUpdate('t1', ['c1', 'c2'], { riskId: null }, ACTOR);

    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'UPDATE',
        entityType: 'CASE',
        userId: ACTOR,
        newValues: expect.objectContaining({ caseIds: ['c1', 'c2'] }),
      }),
    );
  });
});
