/**
 * PR-ASSIGN-4b — "her dosyada TAM OLARAK 1 sorumlu avukat" invariant testleri.
 *
 * Saf karar: planResponsible (keepId + demoteIds).
 * Servis akışları (mock prisma + $transaction passthrough + auditService override):
 * - updateCaseLawyer: yeni RESPONSIBLE → eski demote · son sorumluyu düşürme → BadRequest · audit
 * - addCaseLawyer: yeni RESPONSIBLE → eski demote · audit
 * - removeCaseLawyer: sorumlu silinince fallback promote · son avukatsa izinli · audit
 *
 * create() dedupe kararı planResponsible ("çoklu responsible → tek sorumlu") ile kanıtlanır;
 * create() wiring'i tek-satır (tx içi planResponsible + update) ve canlı/CI e2e ile doğrulanır
 * (mevcut B5/D test deseni — saf karar test edilir, dev DB wiring ayrı).
 */

import { BadRequestException } from '@nestjs/common';
import { CaseService, planResponsible } from '../case.service';

// ============================ SAF HELPER: planResponsible ============================
describe('ASSIGN-4b planResponsible (tam-1 sorumlu kararı, saf)', () => {
  it('boş liste → keepId null, demote yok', () => {
    expect(planResponsible([], null)).toEqual({ keepId: null, demoteIds: [] });
  });

  it('preferId verilirse (update/add) → o korunur, diğer sorumlular demote', () => {
    const r = planResponsible(
      [
        { id: 'a', lawyerRank: 'PARTNER', isResponsible: true },
        { id: 'b', lawyerRank: 'LAWYER', isResponsible: false },
      ],
      'b',
    );
    expect(r.keepId).toBe('b');
    expect(r.demoteIds).toEqual(['a']); // eski sorumlu a düşer
  });

  it('create dedupe: çoklu responsible → önceliğe göre tam 1 (PARTNER kalır), diğerleri demote', () => {
    const r = planResponsible(
      [
        { id: 'law', lawyerRank: 'LAWYER', isResponsible: true },
        { id: 'part', lawyerRank: 'PARTNER', isResponsible: true },
      ],
      null,
    );
    expect(r.keepId).toBe('part'); // PARTNER > LAWYER
    expect(r.demoteIds).toEqual(['law']);
  });

  it('0 sorumlu → önceliğe göre BİR yükselt (demote yok)', () => {
    const r = planResponsible(
      [
        { id: 'i', lawyerRank: 'INTERN', isResponsible: false },
        { id: 'a', lawyerRank: 'AUTHORIZED', isResponsible: false },
      ],
      null,
    );
    expect(r.keepId).toBe('a'); // AUTHORIZED > INTERN
    expect(r.demoteIds).toEqual([]);
  });

  it('tam 1 sorumlu zaten varsa → o kalır, demote yok (idempotent)', () => {
    const r = planResponsible(
      [
        { id: 'x', lawyerRank: 'LAWYER', isResponsible: true },
        { id: 'y', lawyerRank: 'LAWYER', isResponsible: false },
      ],
      null,
    );
    expect(r.keepId).toBe('x');
    expect(r.demoteIds).toEqual([]);
  });
});

// ============================ SERVİS AKIŞLARI ============================
const makeService = () => {
  const stub = {} as any;
  // CaseService constructor 10 dep — hepsi stub; prisma + auditService test içinde override.
  return new CaseService(stub, stub, stub, stub, stub, stub, stub, stub, stub, stub);
};

describe('ASSIGN-4b CaseService.updateCaseLawyer (tam-1 invariant)', () => {
  function setup(opts: { targetResponsible: boolean; caseLawyers: { id: string; isResponsible: boolean }[] }) {
    const service = makeService();
    const txUpdate = jest.fn(async ({ data }: any) => ({
      id: 'cl-1',
      role: data.role ?? 'ASSIGNED',
      casePermissions: null,
      ...data,
      lawyer: { id: 'l-1', name: 'Av', surname: 'X', barNumber: '1', lawyerRank: 'LAWYER' },
    }));
    const auditLog = jest.fn(async () => undefined);
    const mockPrisma = {
      case: { findFirst: jest.fn(async () => ({ id: 'case-1', tenantId: 'tenant-1' })) },
      caseLawyer: {
        findFirst: jest.fn(async () => ({
          id: 'cl-1',
          caseId: 'case-1',
          isResponsible: opts.targetResponsible,
          lawyer: { name: 'Av', surname: 'X' },
        })),
        findMany: jest.fn(async () => opts.caseLawyers),
      },
      $transaction: jest.fn(async (cb: any) => cb({ caseLawyer: { update: txUpdate } })),
    };
    (service as any).prisma = mockPrisma;
    (service as any).auditService = { log: auditLog };
    return { service, txUpdate, auditLog };
  }

  const call = (service: any, data: any) => service.updateCaseLawyer('tenant-1', 'case-1', 'cl-1', data);

  it('yeni RESPONSIBLE → eski sorumlu(lar) demote (isResponsible=false + role=ASSIGNED)', async () => {
    const { service, txUpdate } = setup({
      targetResponsible: false,
      caseLawyers: [
        { id: 'cl-0', isResponsible: true }, // mevcut sorumlu
        { id: 'cl-1', isResponsible: false }, // hedef (sorumlu yapılacak)
      ],
    });

    await call(service, { role: 'RESPONSIBLE' });

    // hedef güncellendi + eski sorumlu demote edildi
    expect(txUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'cl-1' }, data: expect.objectContaining({ role: 'RESPONSIBLE', isResponsible: true }) }),
    );
    expect(txUpdate).toHaveBeenCalledWith({ where: { id: 'cl-0' }, data: { isResponsible: false, role: 'ASSIGNED' } });
  });

  it('son sorumluyu düşürme (başka sorumlu yok) → BadRequest, yazım yok', async () => {
    const { service, txUpdate } = setup({
      targetResponsible: true,
      caseLawyers: [{ id: 'cl-1', isResponsible: true }], // tek sorumlu = hedef
    });

    await expect(call(service, { role: 'ASSIGNED' })).rejects.toThrow(BadRequestException);
    expect(txUpdate).not.toHaveBeenCalled();
  });

  it('başka sorumlu varken hedefi düşürmek serbest (BadRequest YOK)', async () => {
    const { service, txUpdate } = setup({
      targetResponsible: true,
      caseLawyers: [
        { id: 'cl-1', isResponsible: true },
        { id: 'cl-2', isResponsible: true }, // drift: 2 sorumlu → birini düşürmek serbest
      ],
    });

    await call(service, { role: 'ASSIGNED' });
    expect(txUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'cl-1' }, data: expect.objectContaining({ role: 'ASSIGNED', isResponsible: false }) }),
    );
  });

  it('audit: demote edilenler newValues.demotedCaseLawyerIds içinde', async () => {
    const { service, auditLog } = setup({
      targetResponsible: false,
      caseLawyers: [
        { id: 'cl-0', isResponsible: true },
        { id: 'cl-1', isResponsible: false },
      ],
    });

    await call(service, { isResponsible: true });

    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'UPDATE',
        entityType: 'CASE_LAWYER',
        entityId: 'cl-1',
        newValues: expect.objectContaining({ demotedCaseLawyerIds: ['cl-0'] }),
      }),
    );
  });

  it('sorumlu-dışı alan güncellemesi (canSign) → invariant tetiklenmez, demote yok', async () => {
    const { service, txUpdate } = setup({
      targetResponsible: false,
      caseLawyers: [
        { id: 'cl-0', isResponsible: true },
        { id: 'cl-1', isResponsible: false },
      ],
    });

    await call(service, { canSign: true });
    // yalnız hedef güncellenir, cl-0 demote EDİLMEZ
    expect(txUpdate).toHaveBeenCalledTimes(1);
    expect(txUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'cl-1' } }));
  });
});

describe('ASSIGN-4b CaseService.addCaseLawyer (tam-1 invariant)', () => {
  function setup(opts: { role?: string; otherResponsible: { id: string }[] }) {
    const service = makeService();
    const txCreate = jest.fn(async ({ data }: any) => ({
      id: 'cl-new',
      ...data,
      lawyer: { id: data.lawyerId, name: 'Yeni', surname: 'Av', barNumber: '9', lawyerRank: 'PARTNER' },
    }));
    const txFindMany = jest.fn(async () => opts.otherResponsible);
    const txUpdate = jest.fn(async () => ({}));
    const auditLog = jest.fn(async () => undefined);
    const mockPrisma = {
      case: { findFirst: jest.fn(async () => ({ id: 'case-1', tenantId: 'tenant-1' })) },
      lawyer: { findFirst: jest.fn(async () => ({ id: 'law-1', tenantId: 'tenant-1', lawyerRank: 'PARTNER' })) },
      caseLawyer: { findFirst: jest.fn(async () => null) }, // henüz ekli değil
      $transaction: jest.fn(async (cb: any) =>
        cb({ caseLawyer: { create: txCreate, findMany: txFindMany, update: txUpdate } }),
      ),
    };
    (service as any).prisma = mockPrisma;
    (service as any).auditService = { log: auditLog };
    return { service, txCreate, txFindMany, txUpdate, auditLog };
  }

  it('yeni eklenen RESPONSIBLE → eski sorumlu demote + audit', async () => {
    const { service, txUpdate, auditLog } = setup({ otherResponsible: [{ id: 'cl-0' }] });

    await (service as any).addCaseLawyer('tenant-1', 'case-1', { lawyerId: 'law-1', role: 'RESPONSIBLE' });

    expect(txUpdate).toHaveBeenCalledWith({ where: { id: 'cl-0' }, data: { isResponsible: false, role: 'ASSIGNED' } });
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'UPDATE',
        entityType: 'CASE_LAWYER',
        newValues: expect.objectContaining({ demotedCaseLawyerIds: ['cl-0'] }),
      }),
    );
  });

  it('yeni eklenen RESPONSIBLE ama mevcut sorumlu yok → demote yok (demote-audit yok)', async () => {
    const { service, txUpdate, auditLog } = setup({ otherResponsible: [] });

    await (service as any).addCaseLawyer('tenant-1', 'case-1', { lawyerId: 'law-1', role: 'RESPONSIBLE' });

    expect(txUpdate).not.toHaveBeenCalled();
    // ASSIGN-4c: ekleme artık her zaman CREATE audit'ler; burada 4b DEMOTE-UPDATE audit'i OLMAMALI.
    expect(auditLog).not.toHaveBeenCalledWith(
      expect.objectContaining({ newValues: expect.objectContaining({ demotedCaseLawyerIds: expect.anything() }) }),
    );
  });
});

describe('ASSIGN-4b CaseService.removeCaseLawyer (tam-1 invariant)', () => {
  function setup(opts: { removedResponsible: boolean; remaining: { id: string; isResponsible: boolean; lawyer: { lawyerRank: string | null } }[] }) {
    const service = makeService();
    const txDelete = jest.fn(async () => ({}));
    const txFindMany = jest.fn(async () => opts.remaining);
    const txUpdate = jest.fn(async () => ({}));
    const auditLog = jest.fn(async () => undefined);
    const mockPrisma = {
      case: { findFirst: jest.fn(async () => ({ id: 'case-1', tenantId: 'tenant-1' })) },
      caseLawyer: {
        findFirst: jest.fn(async () => ({ id: 'cl-1', caseId: 'case-1', isResponsible: opts.removedResponsible })),
      },
      $transaction: jest.fn(async (cb: any) =>
        cb({ caseLawyer: { delete: txDelete, findMany: txFindMany, update: txUpdate } }),
      ),
    };
    (service as any).prisma = mockPrisma;
    (service as any).auditService = { log: auditLog };
    return { service, txDelete, txUpdate, auditLog };
  }

  it('sorumlu silinince ve başka avukat varsa → fallback promote + audit', async () => {
    const { service, txDelete, txUpdate, auditLog } = setup({
      removedResponsible: true,
      remaining: [{ id: 'cl-2', isResponsible: false, lawyer: { lawyerRank: 'LAWYER' } }],
    });

    const res = await (service as any).removeCaseLawyer('tenant-1', 'case-1', 'cl-1');

    expect(txDelete).toHaveBeenCalledWith({ where: { id: 'cl-1' } });
    expect(txUpdate).toHaveBeenCalledWith({ where: { id: 'cl-2' }, data: { isResponsible: true, role: 'RESPONSIBLE' } });
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'UPDATE', entityType: 'CASE_LAWYER', entityId: 'cl-2' }),
    );
    expect(res).toEqual({ success: true });
  });

  it('son avukatsa (kalan yok) → avukatsız kalabilir, promote yok (promote-audit yok)', async () => {
    const { service, txDelete, txUpdate, auditLog } = setup({ removedResponsible: true, remaining: [] });

    const res = await (service as any).removeCaseLawyer('tenant-1', 'case-1', 'cl-1');

    expect(txDelete).toHaveBeenCalledWith({ where: { id: 'cl-1' } });
    expect(txUpdate).not.toHaveBeenCalled();
    // ASSIGN-4c: silme artık her zaman DELETE audit'ler; burada 4b PROMOTE-UPDATE audit'i OLMAMALI.
    expect(auditLog).not.toHaveBeenCalledWith(
      expect.objectContaining({ newValues: expect.objectContaining({ reason: 'RESPONSIBLE_REMOVED_AUTO_PROMOTE' }) }),
    );
    expect(res).toEqual({ success: true });
  });

  it('sorumlu-olmayan avukat silinince → promote yok (mevcut sorumlu korunur)', async () => {
    const { service, txDelete, txUpdate, auditLog } = setup({
      removedResponsible: false,
      remaining: [{ id: 'cl-2', isResponsible: true, lawyer: { lawyerRank: 'LAWYER' } }],
    });

    await (service as any).removeCaseLawyer('tenant-1', 'case-1', 'cl-1');

    expect(txDelete).toHaveBeenCalledWith({ where: { id: 'cl-1' } });
    expect(txUpdate).not.toHaveBeenCalled();
    // ASSIGN-4c: silme her zaman DELETE audit'ler; 4b PROMOTE-UPDATE audit'i OLMAMALI.
    expect(auditLog).not.toHaveBeenCalledWith(
      expect.objectContaining({ newValues: expect.objectContaining({ reason: 'RESPONSIBLE_REMOVED_AUTO_PROMOTE' }) }),
    );
  });
});
