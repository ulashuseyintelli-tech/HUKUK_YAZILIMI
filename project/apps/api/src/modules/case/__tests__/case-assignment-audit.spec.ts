/**
 * PR-ASSIGN-4c — atama audit + batchUpdate tenant guard testleri.
 *
 * - addCaseLawyer → CASE_LAWYER CREATE audit (4b'nin demote UPDATE audit'i ayrı kalır).
 * - removeCaseLawyer → CASE_LAWYER DELETE audit (4b'nin promote UPDATE audit'i ayrı kalır).
 * - batchUpdate → sorumluPersonelId tenant-validate (yoksa BadRequest) + tek özet CASE UPDATE audit.
 *
 * Mock prisma + $transaction passthrough + auditService override (3a/4b deseni).
 */

import { BadRequestException } from '@nestjs/common';
import { CaseService } from '../case.service';

const makeService = () => {
  const stub = {} as any;
  return new CaseService(stub, stub, stub, stub, stub, stub, stub, stub, stub, stub);
};

describe('ASSIGN-4c CaseService.addCaseLawyer — CASE_LAWYER CREATE audit', () => {
  it('avukat eklenince CREATE audit üretilir (newValues: lawyerId/role/isResponsible)', async () => {
    const service = makeService();
    const auditLog = jest.fn(async () => undefined);
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
      caseLawyer: { findFirst: jest.fn(async () => null) },
      $transaction: jest.fn(async (cb: any) =>
        cb({ caseLawyer: { create: txCreate, findMany: jest.fn(async () => []), update: jest.fn() } }),
      ),
    };
    (service as any).auditService = { log: auditLog };

    await (service as any).addCaseLawyer('tenant-1', 'case-1', { lawyerId: 'law-1', role: 'ASSIGNED' });

    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        action: 'CREATE',
        entityType: 'CASE_LAWYER',
        entityId: 'cl-new',
        newValues: { lawyerId: 'law-1', role: 'ASSIGNED', isResponsible: false },
      }),
    );
  });
});

describe('ASSIGN-4c CaseService.removeCaseLawyer — CASE_LAWYER DELETE audit', () => {
  it('avukat çıkarılınca DELETE audit üretilir (oldValues: lawyerId/role/isResponsible)', async () => {
    const service = makeService();
    const auditLog = jest.fn(async () => undefined);
    (service as any).prisma = {
      case: { findFirst: jest.fn(async () => ({ id: 'case-1', tenantId: 'tenant-1' })) },
      caseLawyer: {
        findFirst: jest.fn(async () => ({
          id: 'cl-1',
          caseId: 'case-1',
          lawyerId: 'law-1',
          role: 'ASSIGNED',
          isResponsible: false,
        })),
      },
      $transaction: jest.fn(async (cb: any) =>
        cb({ caseLawyer: { delete: jest.fn(async () => ({})), findMany: jest.fn(async () => []), update: jest.fn() } }),
      ),
    };
    (service as any).auditService = { log: auditLog };

    await (service as any).removeCaseLawyer('tenant-1', 'case-1', 'cl-1');

    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        action: 'DELETE',
        entityType: 'CASE_LAWYER',
        entityId: 'cl-1',
        oldValues: { lawyerId: 'law-1', role: 'ASSIGNED', isResponsible: false },
      }),
    );
  });
});

describe('ASSIGN-4c CaseService.batchUpdate — tenant guard + özet audit', () => {
  function setup(opts: { userFound?: any }) {
    const service = makeService();
    const auditLog = jest.fn(async () => undefined);
    const updateMany = jest.fn(async () => ({ count: 2 }));
    const userFindFirst = jest.fn(async () => ('userFound' in opts ? opts.userFound : { id: 'u1', tenantId: 'tenant-1' }));
    (service as any).prisma = {
      user: { findFirst: userFindFirst },
      case: { updateMany },
      // lookup tabloları: updates yalnız sorumluPersonelId içerdiğinde validateLookupIds bunlara dokunmaz
    };
    (service as any).auditService = { log: auditLog };
    return { service, auditLog, updateMany, userFindFirst };
  }

  it('geçerli sorumluPersonelId → updateMany + tek özet CASE UPDATE audit', async () => {
    const { service, auditLog, updateMany } = setup({ userFound: { id: 'u1', tenantId: 'tenant-1' } });

    const res = await (service as any).batchUpdate('tenant-1', ['c1', 'c2'], { sorumluPersonelId: 'u1' });

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['c1', 'c2'] }, tenantId: 'tenant-1' } }),
    );
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'UPDATE',
        entityType: 'CASE',
        newValues: { caseIds: ['c1', 'c2'], updates: { sorumluPersonelId: 'u1' }, updatedCount: 2 },
        description: 'Toplu dosya güncellemesi',
      }),
    );
    expect(res).toEqual({ updatedCount: 2 });
  });

  it('başka tenant / olmayan sorumluPersonelId → BadRequest, updateMany YOK', async () => {
    const { service, updateMany } = setup({ userFound: null });

    await expect(
      (service as any).batchUpdate('tenant-1', ['c1'], { sorumluPersonelId: 'foreign' }),
    ).rejects.toThrow(BadRequestException);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('sorumluPersonelId yoksa → user kontrolü YOK, updateMany + audit (mevcut davranış korunur)', async () => {
    const { service, auditLog, updateMany, userFindFirst } = setup({});

    await (service as any).batchUpdate('tenant-1', ['c1'], { riskId: null });

    expect(userFindFirst).not.toHaveBeenCalled();
    expect(updateMany).toHaveBeenCalled();
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'UPDATE', entityType: 'CASE' }));
  });
});
