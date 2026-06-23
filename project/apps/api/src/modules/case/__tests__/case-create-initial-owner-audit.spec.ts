/**
 * WP-1d-pre — CaseService.create() creation-anı canonical operasyon owner audit.
 *
 * WP-1a (owner DEĞİŞİM audit) + WP-1b (createdById) tamamdı; bu PR sorumluluk yaşam-döngüsünün
 * BAŞLANGIÇ event'ini ekler: create payload'ında gerçek-kişi Dosya Operasyon Sorumlusu
 * (responsibleLawyerId XOR responsibleStaffId) SET edildiyse, tx commit SONRASI initial-owner
 * audit yazılır (action:CREATE + metadata.changeType:OPERATION_OWNER_INITIALIZED).
 *
 * Test harness = TX-COMPLETE (STOP-sentinel DEĞİL): $transaction fake bir `result` döndürür
 * (clientId null + boş diziler → POA/masraf/staff/demote dalları atlanır) → create() POST-TX
 * bloğuna kadar TAM koşar → initial-owner audit gözlemlenebilir. Create başarısızsa (tx throw)
 * post-tx hiç çalışmaz → audit yazılmaz.
 *
 * Kapsam: YALNIZ creation-time canonical owner audit. Temporal query / userId sweep / terminoloji /
 * staff-owner guard / devir / OwnerChangeHistory / migration YOK.
 */

import { CaseService } from '../case.service';

// initial-owner audit'i ayırt eden imza (genel CREATE CASE audit'inde changeType YOK).
const OWNER_INIT_AUDIT = expect.objectContaining({
  metadata: expect.objectContaining({ changeType: 'OPERATION_OWNER_INITIALIZED' }),
});

function setup() {
  const stub = {} as any;
  const service = new CaseService(stub, stub, stub, stub, stub, stub, stub, stub, stub, stub);

  const auditLog = jest.fn(async () => undefined);
  const lawyerFindFirst = jest.fn(async () => null as any);
  const staffFindFirst = jest.fn(async () => null as any);

  // $transaction fake result: create() post-tx'in audit'e ulaşması için minimum alanlar.
  // clientId=null → masraf seti dalı atlanır; boş diziler → POA döngüsü atlanır;
  // selectionProvided=false → auditStaffAssignment atlanır; responsibleKeptId=null → ASSIGN-4b atlanır.
  const txResult = {
    case: { id: 'case-1', fileNumber: 'F1', type: 'GENEL', clientId: null },
    clientIds: [] as string[],
    lawyerIds: [] as string[],
    staffResult: { selectionProvided: false, assigned: [] as any[] },
    responsibleKeptId: null as string | null,
    responsibleDemotedIds: [] as string[],
  };
  const transaction = jest.fn(async (_cb: any) => txResult);

  // pre-tx adımları (bu testin kapsamı dışı) no-op → create() audit'e ulaşır
  (service as any).validateSubCategoryRules = () => {};
  (service as any).validateCaseFkOwnership = jest.fn(async () => {});
  (service as any).resolveInlinePartiesBeforeTx = jest.fn(async () => {});
  (service as any).validateDebtorOwnershipBeforeCreate = jest.fn(async () => {});
  // post-tx bağımlılıklar
  (service as any).auditService = { log: auditLog };
  (service as any).clientInfoRequestService = { sendAutoRequestOnCaseCreate: jest.fn(() => Promise.resolve()) };
  // prisma: validateResponsibleSelection lawyer/staffMember.findFirst kullanır; $transaction fake result.
  (service as any).prisma = {
    lawyer: { findFirst: lawyerFindFirst },
    staffMember: { findFirst: staffFindFirst },
    $transaction: transaction,
  };

  return { service, auditLog, lawyerFindFirst, staffFindFirst, transaction };
}

describe('WP-1d-pre CaseService.create() — creation-anı operasyon owner audit', () => {
  it('LAWYER owner set → initial-owner audit (old null/null → new lawyer; actor+tenant+changeType)', async () => {
    const { service, auditLog, lawyerFindFirst } = setup();
    lawyerFindFirst.mockResolvedValue({ id: 'law-X' });

    await service.create('tenant-1', { responsibleLawyerId: 'law-X', creditors: [] } as any, 'creator-1');

    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        action: 'CREATE',
        entityType: 'CASE',
        entityId: 'case-1',
        userId: 'creator-1',
        oldValues: { responsibleLawyerId: null, responsibleStaffId: null },
        newValues: { responsibleLawyerId: 'law-X', responsibleStaffId: null },
        metadata: expect.objectContaining({
          changeType: 'OPERATION_OWNER_INITIALIZED',
          source: 'CaseService.create',
          createdById: 'creator-1',
          temporalOrigin: true,
        }),
      }),
    );
  });

  it('STAFF owner set → initial-owner audit (old null/null → new staff)', async () => {
    const { service, auditLog, staffFindFirst } = setup();
    staffFindFirst.mockResolvedValue({ id: 'stf-Y' });

    await service.create('tenant-1', { responsibleStaffId: 'stf-Y', creditors: [] } as any, 'creator-1');

    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        action: 'CREATE',
        entityType: 'CASE',
        entityId: 'case-1',
        userId: 'creator-1',
        oldValues: { responsibleLawyerId: null, responsibleStaffId: null },
        newValues: { responsibleLawyerId: null, responsibleStaffId: 'stf-Y' },
        metadata: expect.objectContaining({ changeType: 'OPERATION_OWNER_INITIALIZED' }),
      }),
    );
  });

  it('canonical owner YOK → initial-owner audit YAZILMAZ (legacy sorumluPersonelId ile karıştırma yok)', async () => {
    const { service, auditLog } = setup();

    await service.create('tenant-1', { creditors: [] } as any, 'creator-1');

    expect(auditLog).not.toHaveBeenCalledWith(OWNER_INIT_AUDIT);
    // ...ama genel CREATE CASE audit'i yine yazılır (regresyon yok)
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CREATE',
        entityType: 'CASE',
        description: expect.stringContaining('Yeni takip'),
      }),
    );
  });

  it('create BAŞARISIZ (tx throw) → initial-owner audit YAZILMAZ (commit-sonrası yazım)', async () => {
    const { service, auditLog, lawyerFindFirst, transaction } = setup();
    lawyerFindFirst.mockResolvedValue({ id: 'law-X' });
    transaction.mockRejectedValue(new Error('tx failed'));

    await expect(
      service.create('tenant-1', { responsibleLawyerId: 'law-X', creditors: [] } as any, 'creator-1'),
    ).rejects.toThrow();

    expect(auditLog).not.toHaveBeenCalledWith(OWNER_INIT_AUDIT);
  });
});
