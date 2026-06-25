/**
 * PR-ASSIGN-4b — "her dosyada TAM OLARAK 1 sorumlu avukat" invariant testleri.
 *
 * Saf karar: planResponsible (keepId + demoteIds).
 * Servis akışları (mock prisma + $transaction passthrough + auditService override):
 * - updateCaseLawyer: WP-1d-5-7 — hukuki sorumlu ekseni (RESPONSIBLE/isResponsible/mevcut-sorumlu demote) REDDEDİLİR (kanonik uç); sorumlu-dışı rol/yetki güncellenir
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

describe('WP-1d-5-7 CaseService.updateCaseLawyer (hukuki sorumlu ekseni kanonik-uç-only)', () => {
  // Bu uç artık sorumluluk eksenine (RESPONSIBLE/isResponsible) dokunmaz → tek prisma.caseLawyer.update
  // (eski $transaction/demote-loop yok). Mock buna göre: caseLawyer.update doğrudan mock'lanır.
  function setup(opts: { targetResponsible: boolean }) {
    const service = makeService();
    const update = jest.fn(async ({ data }: any) => ({
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
        update,
      },
    };
    (service as any).prisma = mockPrisma;
    (service as any).auditService = { log: auditLog };
    return { service, update, auditLog };
  }

  const call = (service: any, data: any) =>
    service.updateCaseLawyer('tenant-1', 'case-1', 'cl-1', data, 'actor-1');

  const CANONICAL_ONLY = /LEGAL_RESPONSIBLE_CHANGE_VIA_CANONICAL_ENDPOINT_ONLY/;

  it("role:'RESPONSIBLE' (promote) → reddedilir (kanonik uç) + yazım yok", async () => {
    const { service, update } = setup({ targetResponsible: false });
    await expect(call(service, { role: 'RESPONSIBLE' })).rejects.toThrow(CANONICAL_ONLY);
    expect(update).not.toHaveBeenCalled();
  });

  it('isResponsible:true → reddedilir + yazım yok', async () => {
    const { service, update } = setup({ targetResponsible: false });
    await expect(call(service, { isResponsible: true })).rejects.toThrow(BadRequestException);
    expect(update).not.toHaveBeenCalled();
  });

  it('isResponsible:false → reddedilir (eksen bu uçtan kapalı) + yazım yok', async () => {
    const { service, update } = setup({ targetResponsible: false });
    await expect(call(service, { isResponsible: false })).rejects.toThrow(BadRequestException);
    expect(update).not.toHaveBeenCalled();
  });

  it("mevcut sorumluyu role:'ASSIGNED' ile düşürme (demote) → reddedilir + yazım yok", async () => {
    const { service, update } = setup({ targetResponsible: true });
    await expect(call(service, { role: 'ASSIGNED' })).rejects.toThrow(CANONICAL_ONLY);
    expect(update).not.toHaveBeenCalled();
  });

  it('sorumlu-OLMAYAN avukatın rolü ASSIGNED→ASSISTANT → izinli; isResponsible bu uçtan YAZILMAZ', async () => {
    const { service, update } = setup({ targetResponsible: false });
    await call(service, { role: 'ASSISTANT' });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'cl-1' }, data: expect.objectContaining({ role: 'ASSISTANT' }) }),
    );
    expect(update.mock.calls[0][0].data).not.toHaveProperty('isResponsible');
  });

  it('sorumlu-dışı alan (canSign) → izinli, tek update', async () => {
    const { service, update } = setup({ targetResponsible: false });
    await call(service, { canSign: true });
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'cl-1' } }));
  });

  it('mevcut sorumlunun yalnız yetki/bildirim güncellemesi (rol YOK) → izinli', async () => {
    const { service, update } = setup({ targetResponsible: true });
    await call(service, { canSign: true, receiveNotifications: false });
    expect(update).toHaveBeenCalledTimes(1);
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

// WP-1d-5-7: ASSIGN-4b-DB updateCaseLawyer reorder + P2002→409 testleri KALDIRILDI.
// Gerekçe: updateCaseLawyer artık sorumluluk eksenini (RESPONSIBLE/isResponsible) DEĞİŞTİRMEZ
// (yukarıdaki guard reddeder) → ne demote/promote reorder ne de kısmi-tekil-index P2002 bu uçtan
// tetiklenir. Sorumlu değişikliğinin clear-before-set sırası + audit'i kanonik serviste test edilir:
// legal-responsible-lawyer-change.service.spec.ts.

describe('ASSIGN-4b-DB addCaseLawyer — reorder', () => {
  it('mevcut sorumlu ÖNCE düşürülür (NOT filtresiz), yeni satır SONRA create edilir', async () => {
    const service = makeService();
    const txCreate = jest.fn(async ({ data }: any) => ({
      id: 'cl-new', ...data,
      lawyer: { id: data.lawyerId, name: 'Yeni', surname: 'Av', barNumber: '9', lawyerRank: 'PARTNER' },
    }));
    const txFindMany = jest.fn(async () => [{ id: 'cl-0' }]);
    const txUpdate = jest.fn(async () => ({}));
    (service as any).prisma = {
      case: { findFirst: jest.fn(async () => ({ id: 'case-1', tenantId: 'tenant-1' })) },
      lawyer: { findFirst: jest.fn(async () => ({ id: 'law-1', tenantId: 'tenant-1', lawyerRank: 'PARTNER' })) },
      caseLawyer: { findFirst: jest.fn(async () => null) },
      $transaction: jest.fn(async (cb: any) =>
        cb({ caseLawyer: { create: txCreate, findMany: txFindMany, update: txUpdate } }),
      ),
    };
    (service as any).auditService = { log: jest.fn(async () => undefined) };

    await (service as any).addCaseLawyer('tenant-1', 'case-1', { lawyerId: 'law-1', role: 'RESPONSIBLE' });

    // demote update, create'DEN ÖNCE çağrıldı
    expect(txUpdate.mock.invocationCallOrder[0]).toBeLessThan(txCreate.mock.invocationCallOrder[0]);
    // findMany NOT filtresi olmadan çağrıldı (yeni satır henüz yok)
    expect(txFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { caseId: 'case-1', isResponsible: true } }),
    );
  });
});
