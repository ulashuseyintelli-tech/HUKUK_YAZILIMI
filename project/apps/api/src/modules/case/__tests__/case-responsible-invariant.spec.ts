/**
 * PR-ASSIGN-4b — "her dosyada TAM OLARAK 1 sorumlu avukat" invariant testleri.
 *
 * Saf karar: planResponsible (keepId + demoteIds).
 * Servis akışları (mock prisma + $transaction passthrough + auditService override):
 * - updateCaseLawyer: WP-1d-5-7 — hukuki sorumlu ekseni (RESPONSIBLE/isResponsible/mevcut-sorumlu demote) REDDEDİLİR (kanonik uç); sorumlu-dışı rol/yetki güncellenir
 * - addCaseLawyer: WP-1d-5-9 — mevcut sorumlu varken RESPONSIBLE reddedilir / rank-default ASSIGNED'a indirilir (demote YOK); sorumlu yokken initialization korunur
 * - removeCaseLawyer: WP-1d-5-9 — mevcut sorumlu silme reddedilir (kanonik replacement); non-responsible silme serbest (auto-promote YOK)
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

describe('WP-1d-5-9 CaseService.addCaseLawyer (lifecycle — mevcut sorumlu korunur)', () => {
  // WP-1d-5-9: addCaseLawyer artık mevcut sorumluyu demote ETMEZ → $transaction/findMany/update yok.
  // Mock: caseLawyer.count (mevcut responsible sayısı) + caseLawyer.create (doğrudan).
  function setup(opts: { existingResponsible: number; lawyerRank?: string }) {
    const service = makeService();
    const create = jest.fn(async ({ data }: any) => ({
      id: 'cl-new',
      ...data,
      lawyer: { id: data.lawyerId, name: 'Yeni', surname: 'Av', barNumber: '9', lawyerRank: opts.lawyerRank ?? 'PARTNER' },
    }));
    const count = jest.fn(async () => opts.existingResponsible);
    const auditLog = jest.fn(async () => undefined);
    const mockPrisma = {
      case: { findFirst: jest.fn(async () => ({ id: 'case-1', tenantId: 'tenant-1' })) },
      lawyer: { findFirst: jest.fn(async () => ({ id: 'law-1', tenantId: 'tenant-1', lawyerRank: opts.lawyerRank ?? 'PARTNER' })) },
      caseLawyer: {
        findFirst: jest.fn(async () => null), // henüz ekli değil
        count,
        create,
      },
    };
    (service as any).prisma = mockPrisma;
    (service as any).auditService = { log: auditLog };
    return { service, create, count, auditLog };
  }

  const add = (service: any, data: any) => service.addCaseLawyer('tenant-1', 'case-1', data, 'actor-1');
  const CANONICAL_REQ = /LEGAL_RESPONSIBLE_CHANGE_REQUIRES_CANONICAL_ENDPOINT/;

  it('L3: mevcut sorumlu VARKEN role=RESPONSIBLE → reddedilir, create YOK', async () => {
    const { service, create } = setup({ existingResponsible: 1 });
    await expect(add(service, { lawyerId: 'law-1', role: 'RESPONSIBLE' })).rejects.toThrow(CANONICAL_REQ);
    expect(create).not.toHaveBeenCalled();
  });

  it('L4: mevcut sorumlu VARKEN rank-default PARTNER (rol verilmedi) → ASSIGNED ile eklenir; eski sorumlu KORUNUR (demote yok)', async () => {
    const { service, create } = setup({ existingResponsible: 1, lawyerRank: 'PARTNER' });
    await add(service, { lawyerId: 'law-1' });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ role: 'ASSIGNED', isResponsible: false }) }),
    );
  });

  it('L2: mevcut sorumlu YOKKEN role=RESPONSIBLE → ilk responsible (initialization)', async () => {
    const { service, create } = setup({ existingResponsible: 0 });
    await add(service, { lawyerId: 'law-1', role: 'RESPONSIBLE' });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ role: 'RESPONSIBLE', isResponsible: true }) }),
    );
  });

  it('L2: mevcut sorumlu YOKKEN rank-default PARTNER → ilk responsible (initialization)', async () => {
    const { service, create } = setup({ existingResponsible: 0, lawyerRank: 'PARTNER' });
    await add(service, { lawyerId: 'law-1' });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ role: 'RESPONSIBLE', isResponsible: true }) }),
    );
  });

  it('mevcut sorumlu VARKEN explicit role=ASSIGNED → non-responsible eklenir (serbest)', async () => {
    const { service, create } = setup({ existingResponsible: 1 });
    await add(service, { lawyerId: 'law-1', role: 'ASSIGNED' });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ role: 'ASSIGNED', isResponsible: false }) }),
    );
  });
});

describe('WP-1d-5-9 CaseService.removeCaseLawyer (lifecycle — mevcut sorumlu silinemez)', () => {
  // WP-1d-5-9: removeCaseLawyer mevcut sorumluyu silmeyi reddeder → auto-promote/$transaction yok.
  // Mock: caseLawyer.findFirst + caseLawyer.delete (doğrudan).
  function setup(opts: { removedResponsible: boolean }) {
    const service = makeService();
    const del = jest.fn(async () => ({}));
    const auditLog = jest.fn(async () => undefined);
    const mockPrisma = {
      case: { findFirst: jest.fn(async () => ({ id: 'case-1', tenantId: 'tenant-1' })) },
      caseLawyer: {
        findFirst: jest.fn(async () => ({
          id: 'cl-1',
          caseId: 'case-1',
          lawyerId: 'law-1',
          role: opts.removedResponsible ? 'RESPONSIBLE' : 'ASSIGNED',
          isResponsible: opts.removedResponsible,
        })),
        delete: del,
      },
    };
    (service as any).prisma = mockPrisma;
    (service as any).auditService = { log: auditLog };
    return { service, del, auditLog };
  }

  const remove = (service: any) => service.removeCaseLawyer('tenant-1', 'case-1', 'cl-1', 'actor-1');
  const REMOVAL_REQ = /LEGAL_RESPONSIBLE_REMOVAL_REQUIRES_CANONICAL_REPLACEMENT/;

  it('L5: mevcut hukuki sorumlu silme → reddedilir; delete YOK, audit YOK', async () => {
    const { service, del, auditLog } = setup({ removedResponsible: true });
    await expect(remove(service)).rejects.toThrow(REMOVAL_REQ);
    expect(del).not.toHaveBeenCalled();
    expect(auditLog).not.toHaveBeenCalled();
  });

  it('L6: sorumlu-OLMAYAN avukat silme → delete + DELETE audit; auto-promote YOK', async () => {
    const { service, del, auditLog } = setup({ removedResponsible: false });
    const res = await remove(service);
    expect(del).toHaveBeenCalledWith({ where: { id: 'cl-1' } });
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'DELETE', entityType: 'CASE_LAWYER', entityId: 'cl-1' }),
    );
    expect(auditLog).not.toHaveBeenCalledWith(
      expect.objectContaining({ newValues: expect.objectContaining({ reason: 'RESPONSIBLE_REMOVED_AUTO_PROMOTE' }) }),
    );
    expect(res).toEqual({ success: true });
  });
});

// WP-1d-5-7: ASSIGN-4b-DB updateCaseLawyer reorder + P2002→409 testleri KALDIRILDI.
// Gerekçe: updateCaseLawyer artık sorumluluk eksenini (RESPONSIBLE/isResponsible) DEĞİŞTİRMEZ
// (yukarıdaki guard reddeder) → ne demote/promote reorder ne de kısmi-tekil-index P2002 bu uçtan
// tetiklenir. Sorumlu değişikliğinin clear-before-set sırası + audit'i kanonik serviste test edilir:
// legal-responsible-lawyer-change.service.spec.ts.

// WP-1d-5-9: ASSIGN-4b-DB addCaseLawyer reorder (demote-before-create) testi KALDIRILDI.
// Gerekçe: addCaseLawyer artık mevcut sorumlu varken yeni avukatı RESPONSIBLE YAPMAZ (L3 reddeder /
// L4 ASSIGNED'a indirir) → demote/reorder bu yoldan tetiklenmez. Sorumlu değişikliği kanonik
// LegalResponsibleLawyerService'tedir (clear-before-set orada test edilir).
