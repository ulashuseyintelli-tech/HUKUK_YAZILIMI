/**
 * CLIENT-OWN-13-I02-R1A-REACTIVATE-VIA-CREATE-LIFECYCLE-GATE-I01 — owner test matrisi.
 *
 * OWNER CLARIFICATION (RATIFIED): her `Client.isActive:false → true` geçişi, hangi entrypoint
 * üzerinden oluşursa oluşsun **lifecycle mutation**'dır. Create yetkisi lifecycle yetkisini
 * İÇERMEZ: USER yeni müvekkil oluşturabilir, fakat pasif mevcut kaydı create üzerinden
 * reaktive EDEMEZ. `UserRole.ADMIN` tek başına lifecycle yetkisi SAĞLAMAZ — eşik mevcut
 * `officeApproval.isApproverEligible` predicate'idir (PARTNER veya `canApproveOfficeActions`).
 *
 * Bu, `client.service.ts`'teki tarihsel "Reactivate-via-create BU KAPSAM DIŞI" (Task 8A)
 * ifadesini SUPERSEDED_BY_OWNER_CLARIFICATION yapar.
 *
 * PII: TCKN/VKN değerleri sentetiktir.
 */

import { ForbiddenException } from '@nestjs/common';
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
 * `onUpdateMany`: koşullu reaktivasyon yazımının sonucunu (count) sürmek için — race testi.
 */
const buildPrisma = (opts: { duplicate?: any; onUpdateMany?: () => { count: number } } = {}) => {
  const tx = {
    client: {
      create: jest.fn().mockResolvedValue({ id: 'new' }),
      update: jest.fn().mockResolvedValue({ id: 'c1' }),
      updateMany: jest.fn().mockImplementation(async () => (opts.onUpdateMany ? opts.onUpdateMany() : { count: 1 })),
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
    client: {
      findFirst: jest.fn().mockImplementation(({ where }: any) =>
        // OR → dedup taraması; diğer → findOne (mutasyon sonrası dönüş)
        where?.OR
          ? Promise.resolve(opts.duplicate ?? null)
          : Promise.resolve({ id: 'c1', tenantId: 't1', isActive: true, contacts: [] }),
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

const buildSvc = (opts: { eligible?: boolean; duplicate?: any; onUpdateMany?: () => { count: number } } = {}) => {
  const { prisma, tx } = buildPrisma({ duplicate: opts.duplicate, onUpdateMany: opts.onUpdateMany });
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
    // Yeni kayıt lifecycle mutasyonu DEĞİLDİR → eligibility sorgusuna gerek yok.
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
// 3-6. Pasif duplicate → lifecycle yetkisi
// =========================================================================================
describe('R1A — pasif duplicate reaktivasyonu lifecycle yetkisine tabidir', () => {
  it('3. USER + inactive duplicate → 403 LIFECYCLE_DENIED, hiçbir yazma yok', async () => {
    const { svc, prisma, tx, audit } = buildSvc({ duplicate: INACTIVE_DUP, eligible: false });

    const body = await forbiddenBody(() =>
      svc.create('t1', { ...newClientPayload(SYNTHETIC_TCKN) }, actor('USER')),
    );

    expect(body.code).toBe(CLIENT_MUTATION_REASON.LIFECYCLE_DENIED);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.client.updateMany).not.toHaveBeenCalled();
    expect(tx.client.update).not.toHaveBeenCalled();
    expect(audit.logInTransaction).not.toHaveBeenCalled();
  });

  it('4. ADMIN fakat lifecycle-ineligible + inactive duplicate → 403 (ADMIN tek başına YETMEZ)', async () => {
    const { svc, prisma, office } = buildSvc({ duplicate: INACTIVE_DUP, eligible: false });

    const body = await forbiddenBody(() =>
      svc.create('t1', newClientPayload(SYNTHETIC_TCKN), actor('ADMIN')),
    );

    expect(body.code).toBe(CLIENT_MUTATION_REASON.LIFECYCLE_DENIED);
    expect(office.isApproverEligible).toHaveBeenCalledWith('u1', 't1');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('5. eligible avukat/partner + inactive duplicate → reaktivasyon başarılı', async () => {
    const { svc, prisma, tx, audit } = buildSvc({ duplicate: INACTIVE_DUP, eligible: true });

    const res: any = await svc.create('t1', newClientPayload(SYNTHETIC_TCKN), actor('USER', 't1', 'lawyer-1'));

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(tx.client.updateMany).toHaveBeenCalledWith({
      where: { id: 'dup-1', tenantId: 't1', isActive: false },
      data: { isActive: true },
    });
    expect(audit.logInTransaction).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ action: 'CLIENT_REACTIVATE', entityType: 'CLIENT', entityId: 'dup-1' }),
    );
    expect(res._reactivated).toBe(true);
    expect(res._existingReturned).toBe(true);
  });

  it('6. canApproveOfficeActions=true aktör + inactive duplicate → başarılı (aynı predicate)', async () => {
    // `isApproverEligible` TRUE dönen her aktör yeterlidir; CLIENT bu hesabı KOPYALAMAZ.
    const { svc, prisma, office } = buildSvc({ duplicate: INACTIVE_DUP, eligible: true });

    await svc.create('t1', newClientPayload(SYNTHETIC_TCKN), actor('USER', 't1', 'delege-avukat'));

    expect(office.isApproverEligible).toHaveBeenCalledWith('delege-avukat', 't1');
    expect(prisma.$transaction).toHaveBeenCalled();
  });
});

// =========================================================================================
// 7-9. Üç entrypoint de AYNI servis kapısından geçer
// =========================================================================================
describe('R1A — bütün create entrypoint-leri aynı kapıdan geçer', () => {
  it('7. direct POST /clients USER reactivation attempt → 403', async () => {
    const { svc, prisma } = buildSvc({ duplicate: INACTIVE_DUP, eligible: false });

    const body = await forbiddenBody(() =>
      svc.create('t1', newClientPayload(SYNTHETIC_TCKN), actor('USER')),
    );

    expect(body.code).toBe(CLIENT_MUTATION_REASON.LIFECYCLE_DENIED);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('8. CASE inline creditor USER reactivation attempt → 403, taraf id ATANMAZ', async () => {
    const { svc, prisma } = buildSvc({ duplicate: INACTIVE_DUP, eligible: false });
    const caseSvc: any = Object.create(CaseService.prototype);
    caseSvc.clientService = svc;
    caseSvc.lawyerService = { create: jest.fn() };
    const dto: any = {
      creditors: [{ name: 'Ahmet Yilmaz', type: 'PERSON', identityNo: SYNTHETIC_TCKN }],
      lawyers: [],
    };
    const ctx = buildClientMutationActor({ userId: 'u1', tenantId: 't1', role: 'USER' });

    const body = await forbiddenBody(() => caseSvc.resolveInlinePartiesBeforeTx('t1', dto, ctx));

    expect(body.code).toBe(CLIENT_MUTATION_REASON.LIFECYCLE_DENIED);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(dto.creditors[0].id).toBeUndefined();
  });

  it('9. import yolundaki USER reactivation attempt → 403 (servis sınırı, controller-özel kontrol YOK)', async () => {
    // Import satır döngüsü `ClientService.create`'i doğrudan çağırır; kapı ORADADIR.
    // (Excel katmanı ayrı dosyada; burada servis sözleşmesi sabitlenir.)
    const { svc, prisma } = buildSvc({ duplicate: INACTIVE_DUP, eligible: false });

    const body = await forbiddenBody(() =>
      svc.create('t1', newClientPayload(SYNTHETIC_TCKN), actor('USER', 't1', 'import-actor')),
    );

    expect(body.code).toBe(CLIENT_MUTATION_REASON.LIFECYCLE_DENIED);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

// =========================================================================================
// 10-13. Reddedilen istek: kalıcılık yok, tenant, fail-closed
// =========================================================================================
describe('R1A — reddedilen istek kalıcılık üretmez', () => {
  it('10. denied sonrası isActive HÂLÂ false (hiçbir bayrak çevrilmedi)', async () => {
    const dup = { ...INACTIVE_DUP };
    const { svc, prisma, tx } = buildSvc({ duplicate: dup, eligible: false });

    await forbiddenBody(() => svc.create('t1', newClientPayload(SYNTHETIC_TCKN), actor('USER')));

    expect(dup.isActive).toBe(false);
    expect(tx.client.updateMany).not.toHaveBeenCalled();
    expect(prisma.client.updateMany).not.toHaveBeenCalled();
    expect(prisma.client.update).not.toHaveBeenCalled();
  });

  it('11. denied istek partial field update ÜRETMEZ (contact/adres yüzeyleri de sessiz)', async () => {
    const { svc, tx } = buildSvc({ duplicate: INACTIVE_DUP, eligible: false });

    await forbiddenBody(() =>
      svc.create('t1', { ...newClientPayload(SYNTHETIC_TCKN), phone: '05551112233', notes: 'x' }, actor('USER')),
    );

    expect(tx.client.create).not.toHaveBeenCalled();
    expect(tx.clientContact.createMany).not.toHaveBeenCalled();
    expect(tx.clientAddress.createMany).not.toHaveBeenCalled();
    expect(tx.clientAddress.create).not.toHaveBeenCalled();
  });

  it('12. tenant mismatch → deny (lifecycle sorgusuna bile gidilmez)', async () => {
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

// =========================================================================================
// 14. Aktif duplicate davranışı DEĞİŞMEDİ
// =========================================================================================
describe('R1A — aktif duplicate davranışı korunur', () => {
  it('14. USER + aktif duplicate → mutasyon YOK, lifecycle sorgusu YOK, mevcut kayıt döner', async () => {
    const { svc, prisma, office } = buildSvc({ duplicate: ACTIVE_DUP, eligible: false });

    const res: any = await svc.create('t1', newClientPayload(SYNTHETIC_TCKN), actor('USER'));

    expect(prisma.$transaction).not.toHaveBeenCalled();
    // Aktif duplicate lifecycle geçişi DEĞİLDİR → eligibility sorgulanmaz (davranış aynen).
    expect(office.isApproverEligible).not.toHaveBeenCalled();
    expect(res._existingReturned).toBe(true);
    expect(res._reactivated).toBe(false);
  });
});

// =========================================================================================
// 15. Audit / PII
// =========================================================================================
describe('R1A — audit ve PII', () => {
  it('15. lifecycle reddi gövdesinde ham TCKN/VKN veya alan DEĞERİ bulunmaz', async () => {
    const { svc } = buildSvc({ duplicate: INACTIVE_DUP, eligible: false });

    const body = await forbiddenBody(() =>
      svc.create(
        't1',
        { type: 'PERSON', firstName: 'GIZLIAD', lastName: 'GIZLISOYAD', tckn: SYNTHETIC_TCKN },
        actor('USER'),
      ),
    );

    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain(SYNTHETIC_TCKN);
    expect(serialized).not.toContain('GIZLIAD');
    expect(serialized).not.toContain('GIZLISOYAD');
    expect(body.code).toBe(CLIENT_MUTATION_REASON.LIFECYCLE_DENIED);
  });

  it('15b. başarılı reaktivasyon audit metadata-sında ham kimlik bulunmaz', async () => {
    const { svc, audit } = buildSvc({ duplicate: INACTIVE_DUP, eligible: true });

    await svc.create('t1', newClientPayload(SYNTHETIC_TCKN), actor('ADMIN'));

    const entry = audit.logInTransaction.mock.calls[0][1];
    expect(JSON.stringify(entry)).not.toContain(SYNTHETIC_TCKN);
    expect(entry.metadata).toEqual({ reactivatedFromDedupe: true });
  });
});

// =========================================================================================
// 16. Concurrency — stale inactive gözlem yetkisiz/hayalet yazma doğurmaz
// =========================================================================================
describe('R1A — TOCTOU / concurrency', () => {
  it('16. yazma yetkilendirilen DURUMA koşulludur: kayıt bu arada aktifleşirse audit YAZILMAZ', async () => {
    // Eşzamanlı başka bir işlem kaydı zaten aktif yapmış → koşullu updateMany count=0.
    const { svc, tx, audit } = buildSvc({
      duplicate: INACTIVE_DUP,
      eligible: true,
      onUpdateMany: () => ({ count: 0 }),
    });

    await svc.create('t1', newClientPayload(SYNTHETIC_TCKN), actor('ADMIN'));

    expect(tx.client.updateMany).toHaveBeenCalledWith({
      where: { id: 'dup-1', tenantId: 't1', isActive: false },
      data: { isActive: true },
    });
    // Olay GERÇEKLEŞMEDİ → CLIENT_REACTIVATE audit'i de yazılmaz (hayalet kayıt üretilmez).
    expect(audit.logInTransaction).not.toHaveBeenCalled();
  });

  it('16b. koşullu yazma tenant predicate TAŞIR (cross-tenant reaktivasyon imkânsız)', async () => {
    const { svc, tx } = buildSvc({ duplicate: INACTIVE_DUP, eligible: true });

    await svc.create('t1', newClientPayload(SYNTHETIC_TCKN), actor('ADMIN'));

    const where = tx.client.updateMany.mock.calls[0][0].where;
    expect(where.tenantId).toBe('t1');
    expect(where.isActive).toBe(false);
  });
});
