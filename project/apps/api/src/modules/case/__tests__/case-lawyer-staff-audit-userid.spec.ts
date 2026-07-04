/**
 * WP-1c-3 — CASE_LAWYER / CASE_STAFF mutasyon AuditLog event'lerinde actor `userId`.
 *
 * Envanter (WP-1c-0): addCaseLawyer/removeCaseLawyer/updateCaseLawyer/updateCaseStaff audit'leri
 * `userId` taşımıyordu ve metotlar `userId` parametresi almıyordu → controller @CurrentUser("id")
 * + service param (LAST) + audit userId. Kapsam: YALNIZ bu 4 mutasyon. Temporal/schema/terminoloji HARİÇ.
 *
 * Harness mock prisma + $transaction passthrough (case-assignment-audit deseni). userId LAST eklendiği
 * için mevcut 4c spec çağrıları (as any, 3-arg) etkilenmez; bu spec userId'yi açıkça doğrular.
 */

import { CaseService } from '../case.service';

const ACTOR = 'user-actor-1';

const makeService = () => {
  const stub = {} as any;
  const service = new CaseService(stub, stub, stub, stub, stub, stub, stub, stub, stub, stub);
  const auditLog = jest.fn(async () => undefined);
  (service as any).auditService = { log: auditLog };
  return { service, auditLog };
};

describe('WP-1c-3 — CASE_LAWYER/CASE_STAFF audit actor userId', () => {
  it('addCaseLawyer → CASE_LAWYER CREATE audit userId = actor', async () => {
    const { service, auditLog } = makeService();
    const txCreate = jest.fn(async ({ data }: any) => ({
      id: 'cl-new',
      lawyerId: data.lawyerId,
      role: data.role,
      isResponsible: data.isResponsible,
      lawyer: { id: data.lawyerId, name: 'Ada', surname: 'Av', barNumber: '5', lawyerRank: 'LAWYER' },
    }));
    (service as any).prisma = {
      case: { findFirst: jest.fn(async () => ({ id: 'case-1', tenantId: 'tenant-1' })) },
      lawyer: { findFirst: jest.fn(async () => ({ id: 'law-1', tenantId: 'tenant-1', lawyerRank: 'LAWYER' })) },
      // WP-1d-5-9: addCaseLawyer count (mevcut responsible) + doğrudan create (eski $transaction yok).
      caseLawyer: { findFirst: jest.fn(async () => null), count: jest.fn(async () => 0), create: txCreate },
    };

    await (service as any).addCaseLawyer('tenant-1', 'case-1', { lawyerId: 'law-1', role: 'ASSIGNED' }, ACTOR);

    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CREATE', entityType: 'CASE_LAWYER', userId: ACTOR }),
    );
  });

  it('removeCaseLawyer → CASE_LAWYER DELETE audit userId = actor', async () => {
    const { service, auditLog } = makeService();
    (service as any).prisma = {
      case: { findFirst: jest.fn(async () => ({ id: 'case-1', tenantId: 'tenant-1' })) },
      caseLawyer: {
        findFirst: jest.fn(async () => ({ id: 'cl-1', caseId: 'case-1', lawyerId: 'law-1', role: 'ASSIGNED', isResponsible: false })),
        // WP-1d-5-9: non-responsible silme doğrudan delete (eski $transaction/auto-promote yok).
        delete: jest.fn(async () => ({})),
      },
    };

    await (service as any).removeCaseLawyer('tenant-1', 'case-1', 'cl-1', ACTOR);

    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'DELETE', entityType: 'CASE_LAWYER', entityId: 'cl-1', userId: ACTOR }),
    );
  });

  it('updateCaseLawyer → CASE_LAWYER UPDATE audit userId = actor', async () => {
    const { service, auditLog } = makeService();
    (service as any).prisma = {
      case: { findFirst: jest.fn(async () => ({ id: 'case-1', tenantId: 'tenant-1' })) },
      caseLawyer: {
        findFirst: jest.fn(async () => ({ id: 'cl-1', caseId: 'case-1', isResponsible: false, lawyer: { name: 'Ada', surname: 'Av' } })),
        // WP-1d-5-7: updateCaseLawyer artık doğrudan caseLawyer.update çağırır (eski $transaction/demote-loop yok).
        update: jest.fn(async () => ({ id: 'cl-1', role: 'ASSIGNED', casePermissions: null, lawyer: { name: 'Ada', surname: 'Av' } })),
      },
    };

    // canSign-only → sorumluluk değişmez (guard tetiklenmez) → tek update
    await (service as any).updateCaseLawyer('tenant-1', 'case-1', 'cl-1', { canSign: true }, ACTOR);

    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'UPDATE', entityType: 'CASE_LAWYER', entityId: 'cl-1', userId: ACTOR }),
    );
  });

  it('updateCaseStaff → CASE_STAFF UPDATE audit userId = actor', async () => {
    const { service, auditLog } = makeService();
    (service as any).prisma = {
      case: { findFirst: jest.fn(async () => ({ id: 'case-1', tenantId: 'tenant-1' })) },
      caseStaff: {
        findFirst: jest.fn(async () => ({ id: 'cs-1', caseId: 'case-1' })),
        update: jest.fn(async () => ({ staffMember: { firstName: 'X', lastName: 'Y' } })),
      },
    };

    await (service as any).updateCaseStaff('tenant-1', 'case-1', 'cs-1', { notes: 'x' }, ACTOR);

    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'UPDATE', entityType: 'CASE_STAFF', entityId: 'cs-1', userId: ACTOR }),
    );
  });
});
