/**
 * CLIENT-OWN-13-I02-R1A-REACTIVATE-VIA-CREATE-LIFECYCLE-GATE-I01 — owner test matrisi (R1A) →
 * **CL-R04 ile GÜNCELLENDİ (owner kararı 2026-10-29/30).**
 *
 * R1A (RATIFIED, korunur): her `Client.isActive:false → true` geçişi lifecycle mutation'dır; create yetkisi lifecycle
 * yetkisini İÇERMEZ; `UserRole.ADMIN` tek başına lifecycle yetkisi SAĞLAMAZ (eşik `officeApproval.isApproverEligible`).
 *
 * CL-R04 (owner): create/dedup yolu ARTIK HİÇBİR KOŞULDA REAKTİVE ETMEZ — yetkili aktör dahil. Pasif mükerrer kayıt:
 *  - aktörün K16 okuma kapsamında ise 409 `DUPLICATE_IDENTITY_INACTIVE` (profil/id yok),
 *  - kapsam DIŞI ise (aktif ya da pasif) genel 409 `DUPLICATE_IDENTITY` (profil, id, aktiflik bilgisi yok).
 * Aktif ve kapsam İÇİ mükerrer kayıt K16 CONTACT_DETAIL maskeli presenter + `_existingReturned` ile döner.
 * Reaktivasyon yalnız mevcut yetkili lifecycle ucu (PUT /clients/:id isActive → assertCanManageLifecycle).
 * Bütün create entrypoint'leri (direct / CASE satır içi / import) AYNI servis kapısından geçer; ret → yazma YOK
 * (CASE satır içi: dava transaction'ı geri alınır).
 *
 * PII: TCKN/VKN değerleri sentetiktir.
 */

import { ConflictException, ForbiddenException } from '@nestjs/common';
import { ClientService, buildClientMutationActor, type ClientMutationActorContext } from '../client.service';
import { CLIENT_MUTATION_REASON } from '../client-mutation-policy';
import { CaseService } from '../../case/case.service';

const SYNTHETIC_TCKN = '40294995552';
const OTHER_TCKN = '10000000146';

const actor = (role: string, tenantId = 't1', userId = 'u1'): ClientMutationActorContext => ({
  userId,
  tenantId,
  role,
});

/**
 * `duplicate`: dedup taramasının (OR) döndüreceği kayıt — null ise "gerçekten yeni".
 * `inScope`: K16 kapsam probunun (where.AND) sonucu — varsayılan kapsam İÇİ.
 */
const buildPrisma = (opts: { duplicate?: any; inScope?: boolean } = {}) => {
  const tx = {
    client: {
      create: jest.fn().mockResolvedValue({ id: 'new' }),
      update: jest.fn().mockResolvedValue({ id: 'c1' }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findFirst: jest.fn().mockResolvedValue({ id: 'c1' }),
    },
    clientContact: {
      createMany: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({}),
    },
    clientAddress: {
      findMany: jest.fn().mockResolvedValue([]),
      createMany: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const prisma: any = {
    // K16 kapsam türetimi aktörü okur (USER/ADMIN, aktif)
    user: { findFirst: jest.fn().mockResolvedValue({ id: 'u1' }) },
    client: {
      findFirst: jest.fn().mockImplementation(({ where }: any) =>
        // OR → dedup taraması; AND → K16 kapsam probu; diğer → findOne (dönüş)
        where?.OR
          ? Promise.resolve(opts.duplicate ?? null)
          : where?.AND
            ? Promise.resolve(opts.inScope === false ? null : { id: where.id })
            : Promise.resolve({ id: where?.id ?? 'c1', tenantId: 't1', isActive: true, tckn: SYNTHETIC_TCKN, notes: 'gizli', contacts: [] }),
      ),
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 'new' }),
      update: jest.fn().mockResolvedValue({ id: 'c1' }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    clientAddress: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn().mockImplementation(async (cb: any) => (typeof cb === 'function' ? cb(tx) : [])),
  };
  return { prisma, tx };
};

const buildSvc = (opts: { eligible?: boolean; duplicate?: any; inScope?: boolean } = {}) => {
  const { prisma, tx } = buildPrisma({ duplicate: opts.duplicate, inScope: opts.inScope });
  const audit = { log: jest.fn().mockResolvedValue(undefined), logInTransaction: jest.fn().mockResolvedValue(undefined) };
  const office = { isApproverEligible: jest.fn().mockResolvedValue(opts.eligible ?? false) };
  const svc = new ClientService(prisma as any, audit as any, office as any);
  return { svc, prisma, tx, audit, office };
};

/** Pasif (soft-deleted) duplicate kayıt. */
const INACTIVE_DUP = { id: 'dup-1', tenantId: 't1', isActive: false, displayName: 'Pasif Müvekkil' };
/** Aktif duplicate kayıt. */
const ACTIVE_DUP = { id: 'dup-2', tenantId: 't1', isActive: true, displayName: 'Aktif Müvekkil' };

const forbiddenBody = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ForbiddenException);
    return (e as ForbiddenException).getResponse() as any;
  }
  throw new Error('ForbiddenException bekleniyordu, atılmadı');
};

const conflictBody = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ConflictException);
    return (e as ConflictException).getResponse() as any;
  }
  throw new Error('ConflictException bekleniyordu, atılmadı');
};

const newClientPayload = (tckn = OTHER_TCKN) => ({
  type: 'PERSON',
  firstName: 'Yeni',
  lastName: 'Müvekkil',
  tckn,
});

// =========================================================================================
// 1-2. Gerçekten yeni kayıt — D01 politikası DEĞİŞMEDİ
// =========================================================================================
describe('R1A — gerçekten yeni kayıt (create politikası korunur)', () => {
  it('1. USER + gerçekten yeni client → başarılı, lifecycle sorgusu YAPILMAZ', async () => {
    const { svc, prisma, office } = buildSvc({ duplicate: null });

    await svc.create('t1', newClientPayload(), actor('USER'));

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(office.isApproverEligible).not.toHaveBeenCalled();
  });

  it('2. VIEWER + gerçekten yeni client → 403 (D01 aynen)', async () => {
    const { svc, prisma } = buildSvc({ duplicate: null });

    const body = await forbiddenBody(() => svc.create('t1', newClientPayload(), actor('VIEWER')));

    expect(body.code).toBe(CLIENT_MUTATION_REASON.VIEWER_DENIED);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('2b. ADMIN + gerçekten yeni client → başarılı (lifecycle eligible OLMASA bile)', async () => {
    const { svc, prisma } = buildSvc({ duplicate: null, eligible: false });

    await svc.create('t1', newClientPayload(), actor('ADMIN'));

    expect(prisma.$transaction).toHaveBeenCalled();
  });
});

// =========================================================================================
// 3-6. Pasif duplicate → CL-R04: create REAKTİVE ETMEZ (yetkiden bağımsız)
// =========================================================================================
describe('CL-R04 — pasif duplicate: create hiçbir koşulda reaktive etmez', () => {
  it('3. USER + inactive duplicate (kapsam içi) → 409 DUPLICATE_IDENTITY_INACTIVE; hiçbir yazma yok; lifecycle sorgusu YAPILMAZ', async () => {
    const { svc, prisma, tx, audit, office } = buildSvc({ duplicate: INACTIVE_DUP, eligible: false });

    const body = await conflictBody(() => svc.create('t1', newClientPayload(SYNTHETIC_TCKN), actor('USER')));

    expect(body.code).toBe('DUPLICATE_IDENTITY_INACTIVE');
    expect(body).not.toHaveProperty('id');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.client.updateMany).not.toHaveBeenCalled();
    expect(tx.client.update).not.toHaveBeenCalled();
    expect(audit.logInTransaction).not.toHaveBeenCalled();
    expect(office.isApproverEligible).not.toHaveBeenCalled();
  });

  it('4. ADMIN (lifecycle-ineligible) + inactive duplicate → 409 INACTIVE (eski 403 LIFECYCLE_DENIED yolu kalktı; yetki sorulmaz)', async () => {
    const { svc, prisma, office } = buildSvc({ duplicate: INACTIVE_DUP, eligible: false });

    const body = await conflictBody(() => svc.create('t1', newClientPayload(SYNTHETIC_TCKN), actor('ADMIN')));

    expect(body.code).toBe('DUPLICATE_IDENTITY_INACTIVE');
    expect(office.isApproverEligible).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('5. eligible avukat/partner + inactive duplicate → YİNE 409 INACTIVE; updateMany ve CLIENT_REACTIVATE audit YOK', async () => {
    const { svc, prisma, tx, audit } = buildSvc({ duplicate: INACTIVE_DUP, eligible: true });

    const body = await conflictBody(() => svc.create('t1', newClientPayload(SYNTHETIC_TCKN), actor('USER', 't1', 'lawyer-1')));

    expect(body.code).toBe('DUPLICATE_IDENTITY_INACTIVE');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.client.updateMany).not.toHaveBeenCalled();
    expect(audit.logInTransaction).not.toHaveBeenCalled();
  });

  it('6. kapsam DIŞI pasif duplicate (eligible aktör bile) → GENEL 409 DUPLICATE_IDENTITY; aktiflik/id/profil bilgisi YOK', async () => {
    const { svc, prisma, tx } = buildSvc({ duplicate: INACTIVE_DUP, eligible: true, inScope: false });

    const body = await conflictBody(() => svc.create('t1', newClientPayload(SYNTHETIC_TCKN), actor('USER', 't1', 'delege-avukat')));

    expect(body.code).toBe('DUPLICATE_IDENTITY');
    expect(body).not.toHaveProperty('id');
    expect(body).not.toHaveProperty('isActive');
    expect(JSON.stringify(body)).not.toContain('dup-1');
    expect(JSON.stringify(body)).not.toContain('Pasif');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.client.updateMany).not.toHaveBeenCalled();
  });

  it('6b. kapsam DIŞI AKTİF duplicate → aynı GENEL 409 gövdesi (aktif/pasif ayrımı sızmaz)', async () => {
    const inactive = buildSvc({ duplicate: INACTIVE_DUP, inScope: false });
    const active = buildSvc({ duplicate: ACTIVE_DUP, inScope: false });

    const a = await conflictBody(() => inactive.svc.create('t1', newClientPayload(SYNTHETIC_TCKN), actor('USER')));
    const b = await conflictBody(() => active.svc.create('t1', newClientPayload(SYNTHETIC_TCKN), actor('USER')));

    expect(a).toEqual(b);
    expect(a.code).toBe('DUPLICATE_IDENTITY');
  });

  it('6c. kapsam İÇİ AKTİF duplicate → K16 maskeli dönüş + _existingReturned; _reactivated daima false; notlar yok', async () => {
    const { svc, prisma } = buildSvc({ duplicate: ACTIVE_DUP });

    const res: any = await svc.create('t1', newClientPayload(SYNTHETIC_TCKN), actor('USER'));

    expect(res._existingReturned).toBe(true);
    expect(res._reactivated).toBe(false);
    expect(res.id).toBe('dup-2');
    expect(res.tckn).toBe('402****52');
    expect(res).not.toHaveProperty('notes');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

// =========================================================================================
// 7-9. Üç entrypoint de AYNI servis kapısından geçer
// =========================================================================================
describe('CL-R04 — bütün create entrypoint-leri aynı kapıdan geçer', () => {
  it('7. direct POST /clients USER + pasif duplicate → 409 (yazma yok)', async () => {
    const { svc, prisma } = buildSvc({ duplicate: INACTIVE_DUP, eligible: false });

    const body = await conflictBody(() => svc.create('t1', newClientPayload(SYNTHETIC_TCKN), actor('USER')));

    expect(body.code).toBe('DUPLICATE_IDENTITY_INACTIVE');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('8. CASE satır içi alacaklı: kapsam DIŞI mevcut müvekkil → 409 fırlar (dava transaction\'ı geri alınır), taraf id ATANMAZ', async () => {
    const { svc, prisma } = buildSvc({ duplicate: ACTIVE_DUP, eligible: true, inScope: false });
    const caseSvc: any = Object.create(CaseService.prototype);
    caseSvc.clientService = svc;
    caseSvc.lawyerService = { create: jest.fn() };
    const dto: any = {
      creditors: [{ name: 'Ahmet Yilmaz', type: 'PERSON', identityNo: SYNTHETIC_TCKN }],
      lawyers: [],
    };
    const ctx = buildClientMutationActor({ userId: 'u1', tenantId: 't1', role: 'USER' });

    const body = await conflictBody(() => caseSvc.resolveInlinePartiesInTx('t1', dto, ctx));

    expect(body.code).toBe('DUPLICATE_IDENTITY');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(dto.creditors[0].id).toBeUndefined();
  });

  it('8b. CASE satır içi alacaklı: kapsam İÇİ aktif mevcut müvekkil bağlanır (yalnız id kullanılır)', async () => {
    const { svc } = buildSvc({ duplicate: ACTIVE_DUP });
    const caseSvc: any = Object.create(CaseService.prototype);
    caseSvc.clientService = svc;
    caseSvc.lawyerService = { create: jest.fn() };
    const dto: any = {
      creditors: [{ name: 'Ahmet Yilmaz', type: 'PERSON', identityNo: SYNTHETIC_TCKN }],
      lawyers: [],
    };
    const ctx = buildClientMutationActor({ userId: 'u1', tenantId: 't1', role: 'USER' });

    await caseSvc.resolveInlinePartiesInTx('t1', dto, ctx);

    expect(dto.creditors[0].id).toBe('dup-2');
  });

  it('9. import yolundaki USER + pasif duplicate → 409 (servis sınırı, controller-özel kontrol YOK)', async () => {
    const { svc, prisma } = buildSvc({ duplicate: INACTIVE_DUP, eligible: false });

    const body = await conflictBody(() => svc.create('t1', newClientPayload(SYNTHETIC_TCKN), actor('USER', 't1', 'import-actor')));

    expect(body.code).toBe('DUPLICATE_IDENTITY_INACTIVE');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

// =========================================================================================
// 10-13. Reddedilen istek: kalıcılık yok, tenant, fail-closed
// =========================================================================================
describe('R1A/CL-R04 — reddedilen istek kalıcılık üretmez', () => {
  it('10. ret sonrası isActive HÂLÂ false (hiçbir bayrak çevrilmedi)', async () => {
    const dup = { ...INACTIVE_DUP };
    const { svc, prisma, tx } = buildSvc({ duplicate: dup, eligible: true });

    await conflictBody(() => svc.create('t1', newClientPayload(SYNTHETIC_TCKN), actor('USER')));

    expect(dup.isActive).toBe(false);
    expect(tx.client.updateMany).not.toHaveBeenCalled();
    expect(prisma.client.updateMany).not.toHaveBeenCalled();
    expect(prisma.client.update).not.toHaveBeenCalled();
  });

  it('11. ret partial field update ÜRETMEZ (contact/adres yüzeyleri de sessiz)', async () => {
    const { svc, tx } = buildSvc({ duplicate: INACTIVE_DUP, eligible: true });

    await conflictBody(() =>
      svc.create('t1', { ...newClientPayload(SYNTHETIC_TCKN), phone: '05551112233', notes: 'x' }, actor('USER')),
    );

    expect(tx.client.create).not.toHaveBeenCalled();
    expect(tx.clientContact.createMany).not.toHaveBeenCalled();
    expect(tx.clientAddress.createMany).not.toHaveBeenCalled();
    expect(tx.clientAddress.create).not.toHaveBeenCalled();
  });

  it('12. tenant mismatch → deny (dedup ve kapsam sorgusuna bile gidilmez)', async () => {
    const { svc, prisma, office } = buildSvc({ duplicate: INACTIVE_DUP, eligible: true });

    const body = await forbiddenBody(() =>
      svc.create('tenant-A', newClientPayload(SYNTHETIC_TCKN), actor('ADMIN', 'tenant-B')),
    );

    expect(body.code).toBe(CLIENT_MUTATION_REASON.TENANT_MISMATCH);
    expect(prisma.client.findFirst).not.toHaveBeenCalled();
    expect(office.isApproverEligible).not.toHaveBeenCalled();
  });

  it('13. actor yok / role yok → fail-closed', async () => {
    const { svc, prisma } = buildSvc({ duplicate: INACTIVE_DUP, eligible: true });

    const noRole = await forbiddenBody(() =>
      svc.create('t1', newClientPayload(SYNTHETIC_TCKN), buildClientMutationActor({ userId: 'u1', tenantId: 't1' })),
    );
    expect(noRole.code).toBe(CLIENT_MUTATION_REASON.UNKNOWN_ROLE);

    const noActor = await forbiddenBody(() =>
      svc.create('t1', newClientPayload(SYNTHETIC_TCKN), buildClientMutationActor({ tenantId: 't1', role: 'ADMIN' })),
    );
    expect(noActor.code).toBe(CLIENT_MUTATION_REASON.NO_ACTOR);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
