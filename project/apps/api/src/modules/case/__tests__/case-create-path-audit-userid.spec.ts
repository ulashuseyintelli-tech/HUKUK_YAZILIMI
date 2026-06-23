/**
 * WP-1c-1 — create-yolu AuditLog event'lerinde actor `userId` sertleştirmesi.
 *
 * Envanter (WP-1c-0): create() post-tx'te 3 user-driven AuditService.log var ve `userId` TAŞIMIYOR:
 *   - CASE CREATE (1990) · CASE_STAFF auditStaffAssignment (1444) · CASE_LAWYER demote (2028).
 * (OPERATION_OWNER_INITIALIZED [2005] WP-1d-pre'de zaten userId taşıyor.)
 * create() zaten `userId` parametresi alır → audit'lere bağlanması yeterli (controller/migration YOK).
 *
 * Kabul: create sırasında yazılan user-driven AuditLog kayıtlarında userId === creatorUserId.
 * Harness = TX-COMPLETE (STOP-sentinel değil): $transaction fake `result` döndürür; staffResult.
 * selectionProvided=true + responsibleKeptId/demotedIds → staff + demote audit'leri de ateşlenir.
 */

import { CaseService } from '../case.service';

function setup() {
  const stub = {} as any;
  const service = new CaseService(stub, stub, stub, stub, stub, stub, stub, stub, stub, stub);

  const auditLog = jest.fn(async () => undefined);
  // create post-tx: staff (selectionProvided) + demote (responsibleKeptId+demotedIds) audit'leri ateşlensin.
  const txResult = {
    case: { id: 'case-1', fileNumber: 'F1', type: 'GENEL', clientId: null },
    clientIds: [] as string[],
    lawyerIds: [] as string[],
    staffResult: { selectionProvided: true, assigned: [{ staffMemberId: 's1', roleOnCase: 'PERSONEL' }] },
    responsibleKeptId: 'cl-1',
    responsibleDemotedIds: ['cl-2'],
  };

  (service as any).validateSubCategoryRules = () => {};
  (service as any).validateCaseFkOwnership = jest.fn(async () => {});
  (service as any).resolveInlinePartiesBeforeTx = jest.fn(async () => {});
  (service as any).validateDebtorOwnershipBeforeCreate = jest.fn(async () => {});
  (service as any).auditService = { log: auditLog };
  (service as any).clientInfoRequestService = { sendAutoRequestOnCaseCreate: jest.fn(() => Promise.resolve()) };
  (service as any).prisma = {
    lawyer: { findFirst: jest.fn(async () => null) },
    staffMember: { findFirst: jest.fn(async () => null) },
    $transaction: jest.fn(async (_cb: any) => txResult),
  };

  return { service, auditLog };
}

// auditLog çağrıları arasından entityType + (ops.) description ile birini bul.
const findCall = (auditLog: jest.Mock, entityType: string, descSub?: string) =>
  auditLog.mock.calls
    .map((c) => c[0])
    .find((a) => a?.entityType === entityType && (descSub ? String(a?.description ?? '').includes(descSub) : true));

describe('WP-1c-1 — create-yolu AuditLog actor userId', () => {
  it('CASE CREATE audit → userId = creatorUserId', async () => {
    const { service, auditLog } = setup();
    await service.create('tenant-1', { creditors: [] } as any, 'creator-1');
    const ev = findCall(auditLog, 'CASE', 'Yeni takip');
    expect(ev).toBeDefined();
    expect(ev.userId).toBe('creator-1');
  });

  it('CASE_STAFF (auditStaffAssignment) audit → userId = creatorUserId', async () => {
    const { service, auditLog } = setup();
    await service.create('tenant-1', { creditors: [] } as any, 'creator-1');
    const ev = findCall(auditLog, 'CASE_STAFF');
    expect(ev).toBeDefined();
    expect(ev.userId).toBe('creator-1');
  });

  it('CASE_LAWYER demote audit → userId = creatorUserId', async () => {
    const { service, auditLog } = setup();
    await service.create('tenant-1', { creditors: [] } as any, 'creator-1');
    const ev = findCall(auditLog, 'CASE_LAWYER', 'fazla sorumlu');
    expect(ev).toBeDefined();
    expect(ev.userId).toBe('creator-1');
  });

  it('create-yolu user-driven event\'lerin HİÇBİRİ userId-siz değil (system-null yok)', async () => {
    const { service, auditLog } = setup();
    await service.create('tenant-1', { creditors: [] } as any, 'creator-1');
    const createPath = auditLog.mock.calls
      .map((c) => c[0])
      .filter((a) => ['CASE', 'CASE_STAFF', 'CASE_LAWYER'].includes(a?.entityType));
    expect(createPath.length).toBeGreaterThan(0);
    for (const ev of createPath) {
      expect(ev.userId).toBe('creator-1');
    }
  });
});
