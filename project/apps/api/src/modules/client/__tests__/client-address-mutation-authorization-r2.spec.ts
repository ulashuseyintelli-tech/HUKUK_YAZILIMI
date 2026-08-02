/**
 * CLIENT-OWN-13-I02-R2-ADDRESS-MUTATION-AUTHORIZATION-I01 — owner test matrisi (19 madde).
 *
 * OWNER DECISIONS (RATIFIED):
 *  D01 "B+"  — standart adres girişi USER'da kalır; hukuki durum değiştiren aksiyonlar elevated.
 *  D02       — current/primary mutation = ELEVATED.
 *  D03       — hiç aktif birincil yokken ilk adresin otomatik birincil olması = STANDARD.
 *  D04       — tenant write hardening dahil.
 *  D05       — fiziksel silme DEĞİŞMEDİ / fail-closed.
 *  D06       — mevcut merkezi policy yeniden kullanılır (paralel sistem YOK).
 *  D07       — **UserRole.ADMIN tek başına elevated DEĞİLDİR.**
 *
 * R01 analizinin kapattığı açık: bu yüzeyde `JwtAuthGuard` dışında hiçbir yetki katmanı yoktu
 * (repoda `APP_GUARD`/`RolesGuard`/`@Roles()` yok) ve `role` hiç thread edilmiyordu → VIEWER
 * adres oluşturabiliyor, değiştirebiliyor, arşivleyebiliyor, geri alabiliyordu.
 *
 * PII: bu dosyada adres içeriği sentetiktir; assertion'lar 403 gövdesinde ve audit metadata'sında
 * `street/city/district/postalCode` BULUNMADIĞINI da doğrular.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { ForbiddenException } from '@nestjs/common';
import { ClientAddressService } from '../client-address.service';
import { CLIENT_MUTATION_REASON, requiresElevatedAddressAuthority } from '../client-mutation-policy';
import type { ClientMutationActorContext } from '../client.service';

const SYNTHETIC_STREET = 'Sentetik Mahallesi 1234 Sokak No 5';
const SYNTHETIC_CITY = 'Sentetikşehir';

const actor = (role: string, tenantId = 't1', userId = 'u1'): ClientMutationActorContext => ({
  userId,
  tenantId,
  role,
});

type AddressRow = {
  id: string;
  clientId: string;
  type: string;
  street: string | null;
  city: string | null;
  district: string | null;
  region: string | null;
  postalCode: string | null;
  isPrimary: boolean;
  isCurrent: boolean;
};

const row = (over: Partial<AddressRow> = {}): AddressRow => ({
  id: 'a1',
  clientId: 'c1',
  type: 'HOME',
  street: SYNTHETIC_STREET,
  city: SYNTHETIC_CITY,
  district: null,
  region: null,
  postalCode: null,
  isPrimary: false,
  isCurrent: true,
  ...over,
});

/**
 * Yazma yüzeylerinin TAMAMINI sayan prisma sahtesi.
 * `updateManyCount` ile koşullu yazımın `count` sonucu sürülebilir (race testi).
 */
const buildPrisma = (opts: {
  target?: AddressRow | null;
  siblings?: AddressRow[];
  activePrimaryCount?: number;
  updateManyCount?: number;
} = {}) => {
  const siblings = opts.siblings ?? [];
  const tx = {
    client: { findFirst: jest.fn().mockResolvedValue({ id: 'c1' }) },
    clientAddress: {
      findMany: jest.fn().mockResolvedValue(siblings),
      create: jest.fn().mockImplementation(async ({ data }: any) => row({ id: 'new', ...data })),
      update: jest.fn().mockResolvedValue(row()),
      updateMany: jest.fn().mockResolvedValue({ count: opts.updateManyCount ?? 1 }),
      findFirstOrThrow: jest.fn().mockImplementation(async () => opts.target ?? row()),
    },
  };
  const prisma: any = {
    client: { findFirst: jest.fn().mockResolvedValue({ id: 'c1' }) },
    clientAddress: {
      findFirst: jest.fn().mockResolvedValue(opts.target === undefined ? row() : opts.target),
      count: jest.fn().mockResolvedValue(opts.activePrimaryCount ?? 0),
    },
    $transaction: jest.fn().mockImplementation(async (cb: any) => (typeof cb === 'function' ? cb(tx) : [])),
  };
  return { prisma, tx };
};

const buildSvc = (opts: Parameters<typeof buildPrisma>[0] & { eligible?: boolean } = {}) => {
  const { prisma, tx } = buildPrisma(opts);
  const audit = { log: jest.fn().mockResolvedValue(undefined), logInTransaction: jest.fn().mockResolvedValue(undefined) };
  const office = { isApproverEligible: jest.fn().mockResolvedValue(opts.eligible ?? false) };
  const svc = new ClientAddressService(prisma as any, audit as any, office as any);
  return { svc, prisma, tx, audit, office };
};

const forbiddenBody = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ForbiddenException);
    return (e as ForbiddenException).getResponse() as any;
  }
  throw new Error('ForbiddenException bekleniyordu, atılmadı');
};

/** Reddedilen istekte HİÇBİR yazma yüzeyine dokunulmadığını kanıtlar. */
const expectNoWrites = (prisma: any, tx: any) => {
  expect(prisma.$transaction).not.toHaveBeenCalled();
  expect(tx.clientAddress.create).not.toHaveBeenCalled();
  expect(tx.clientAddress.update).not.toHaveBeenCalled();
  expect(tx.clientAddress.updateMany).not.toHaveBeenCalled();
};

const NEW_ADDRESS = { type: 'HOME', street: SYNTHETIC_STREET, city: SYNTHETIC_CITY } as any;

// =========================================================================================
// 1-4. VIEWER — dört mutasyonun tamamında 403
// =========================================================================================
describe('R2 — VIEWER hiçbir adres mutasyonu yapamaz', () => {
  it('1. VIEWER create → 403, yazma yok', async () => {
    const { svc, prisma, tx } = buildSvc();
    const body = await forbiddenBody(() => svc.create('t1', 'c1', NEW_ADDRESS, actor('VIEWER')));
    expect(body.code).toBe(CLIENT_MUTATION_REASON.VIEWER_DENIED);
    expectNoWrites(prisma, tx);
  });

  it('2. VIEWER update → 403, yazma yok', async () => {
    const { svc, prisma, tx } = buildSvc({ target: row({ isPrimary: false }) });
    const body = await forbiddenBody(() => svc.update('t1', 'c1', 'a1', { city: 'X' } as any, actor('VIEWER')));
    expect(body.code).toBe(CLIENT_MUTATION_REASON.VIEWER_DENIED);
    expectNoWrites(prisma, tx);
  });

  it('3. VIEWER archive → 403, yazma yok', async () => {
    const { svc, prisma, tx } = buildSvc({ target: row({ isPrimary: false }) });
    const body = await forbiddenBody(() => svc.archive('t1', 'c1', 'a1', {}, actor('VIEWER')));
    expect(body.code).toBe(CLIENT_MUTATION_REASON.VIEWER_DENIED);
    expectNoWrites(prisma, tx);
  });

  it('4. VIEWER restore → 403, yazma yok', async () => {
    const { svc, prisma, tx } = buildSvc({ target: row({ isCurrent: false }) });
    const body = await forbiddenBody(() => svc.restore('t1', 'c1', 'a1', {}, actor('VIEWER')));
    expect(body.code).toBe(CLIENT_MUTATION_REASON.VIEWER_DENIED);
    expectNoWrites(prisma, tx);
  });
});

// =========================================================================================
// 5-7. USER standart yetki (owner B)
// =========================================================================================
describe('R2 — USER standart adres işlemleri', () => {
  it('5. USER ilk adres create → PASS ve otomatik birincil (D03: STANDARD)', async () => {
    const { svc, prisma, tx, office } = buildSvc({ siblings: [], activePrimaryCount: 0 });

    await svc.create('t1', 'c1', NEW_ADDRESS, actor('USER'));

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(tx.clientAddress.create).toHaveBeenCalled();
    expect(tx.clientAddress.create.mock.calls[0][0].data.isPrimary).toBe(true);
    // Otomatik birincil bir DEVİR değildir → eligibility hiç sorgulanmaz.
    expect(office.isApproverEligible).not.toHaveBeenCalled();
  });

  it('6. USER birincil-olmayan yeni adres create → PASS', async () => {
    const existing = row({ id: 'a0', isPrimary: true, isCurrent: true });
    const { svc, prisma, tx, office } = buildSvc({ siblings: [existing], activePrimaryCount: 1 });

    await svc.create('t1', 'c1', NEW_ADDRESS, actor('USER'));

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(tx.clientAddress.create.mock.calls[0][0].data.isPrimary).toBe(false);
    expect(office.isApproverEligible).not.toHaveBeenCalled();
  });

  it('7. USER birincil-olmayan adresin olağan alanlarını update → PASS', async () => {
    const target = row({ id: 'a1', isPrimary: false, isCurrent: true });
    const { svc, prisma, tx, office } = buildSvc({ target, siblings: [target, row({ id: 'a0', isPrimary: true })] });

    await svc.update('t1', 'c1', 'a1', { city: 'Yeni Sehir' } as any, actor('USER'));

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(tx.clientAddress.updateMany).toHaveBeenCalled();
    expect(office.isApproverEligible).not.toHaveBeenCalled();
  });
});

// =========================================================================================
// 8-11. USER elevated gerektiren işlemleri YAPAMAZ (owner C)
// =========================================================================================
describe('R2 — USER elevated işlemleri yapamaz', () => {
  it('8. USER mevcut BİRİNCİL adresin içeriğini update → 403', async () => {
    const target = row({ id: 'a1', isPrimary: true, isCurrent: true });
    const { svc, prisma, tx, office } = buildSvc({ target, eligible: false });

    const body = await forbiddenBody(() =>
      svc.update('t1', 'c1', 'a1', { city: 'Yeni Sehir' } as any, actor('USER')),
    );

    expect(body.code).toBe(CLIENT_MUTATION_REASON.LIFECYCLE_DENIED);
    expect(office.isApproverEligible).toHaveBeenCalledWith('u1', 't1');
    expectNoWrites(prisma, tx);
  });

  it('9. USER birincillik devri (isPrimary=true) → 403', async () => {
    const target = row({ id: 'a1', isPrimary: false, isCurrent: true });
    const { svc, prisma, tx } = buildSvc({ target, eligible: false });

    const body = await forbiddenBody(() =>
      svc.update('t1', 'c1', 'a1', { isPrimary: true } as any, actor('USER')),
    );

    expect(body.code).toBe(CLIENT_MUTATION_REASON.LIFECYCLE_DENIED);
    expectNoWrites(prisma, tx);
  });

  it('9b. USER mevcut aktif birincili düşürecek AÇIK primary talebiyle create → 403', async () => {
    const { svc, prisma, tx } = buildSvc({
      siblings: [row({ id: 'a0', isPrimary: true, isCurrent: true })],
      activePrimaryCount: 1,
      eligible: false,
    });

    const body = await forbiddenBody(() =>
      svc.create('t1', 'c1', { ...NEW_ADDRESS, isPrimary: true }, actor('USER')),
    );

    expect(body.code).toBe(CLIENT_MUTATION_REASON.LIFECYCLE_DENIED);
    expectNoWrites(prisma, tx);
  });

  it('10. USER archive → 403', async () => {
    const { svc, prisma, tx } = buildSvc({ target: row({ isPrimary: false }), eligible: false });
    const body = await forbiddenBody(() => svc.archive('t1', 'c1', 'a1', {}, actor('USER')));
    expect(body.code).toBe(CLIENT_MUTATION_REASON.LIFECYCLE_DENIED);
    expectNoWrites(prisma, tx);
  });

  it('11. USER restore → 403 (makePrimary=false olsa bile)', async () => {
    const { svc, prisma, tx } = buildSvc({ target: row({ isCurrent: false }), eligible: false });
    const body = await forbiddenBody(() => svc.restore('t1', 'c1', 'a1', { makePrimary: false }, actor('USER')));
    expect(body.code).toBe(CLIENT_MUTATION_REASON.LIFECYCLE_DENIED);
    expectNoWrites(prisma, tx);
  });
});

// =========================================================================================
// 12-14. Elevated aktör + D07 (ADMIN tek başına yetmez)
// =========================================================================================
describe('R2 — elevated aktör ve ADMIN ayrımı', () => {
  it('12. Eligible aktör birincil güncelleme/devri → PASS', async () => {
    const target = row({ id: 'a1', isPrimary: true, isCurrent: true });
    const { svc, prisma, office } = buildSvc({ target, siblings: [target], eligible: true });

    await svc.update('t1', 'c1', 'a1', { city: 'Yeni Sehir' } as any, actor('USER', 't1', 'lawyer-1'));

    expect(office.isApproverEligible).toHaveBeenCalledWith('lawyer-1', 't1');
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('13. Eligible aktör archive → PASS', async () => {
    const target = row({ id: 'a1', isPrimary: false, isCurrent: true });
    const { svc, prisma, tx } = buildSvc({
      target,
      siblings: [target, row({ id: 'a0', isPrimary: true, isCurrent: true })],
      eligible: true,
    });

    await svc.archive('t1', 'c1', 'a1', {}, actor('USER', 't1', 'lawyer-1'));

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(tx.clientAddress.updateMany).toHaveBeenCalled();
  });

  it('13b. Eligible aktör restore → PASS', async () => {
    const target = row({ id: 'a1', isPrimary: false, isCurrent: false });
    const { svc, prisma } = buildSvc({
      target,
      siblings: [target, row({ id: 'a0', isPrimary: true, isCurrent: true })],
      eligible: true,
    });

    await svc.restore('t1', 'c1', 'a1', {}, actor('USER', 't1', 'lawyer-1'));

    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('14. D07 — lifecycle-ineligible ADMIN elevated işlemi YAPAMAZ → 403', async () => {
    const { svc, prisma, tx, office } = buildSvc({ target: row({ isPrimary: true }), eligible: false });

    const body = await forbiddenBody(() =>
      svc.update('t1', 'c1', 'a1', { city: 'X' } as any, actor('ADMIN')),
    );

    expect(body.code).toBe(CLIENT_MUTATION_REASON.LIFECYCLE_DENIED);
    expect(office.isApproverEligible).toHaveBeenCalledWith('u1', 't1');
    expectNoWrites(prisma, tx);
  });

  it('14b. ADMIN standart işlem yapabilir (coarse gate yalnız VIEWER rolünü reddeder)', async () => {
    const target = row({ id: 'a1', isPrimary: false, isCurrent: true });
    // Invariant: güncel adres kümesinde bir birincil BULUNMALI → birincil kardeş eklenir.
    const { svc, prisma } = buildSvc({
      target,
      siblings: [target, row({ id: 'a0', isPrimary: true, isCurrent: true })],
      eligible: false,
    });

    await svc.update('t1', 'c1', 'a1', { city: 'X' } as any, actor('ADMIN'));

    expect(prisma.$transaction).toHaveBeenCalled();
  });
});

// =========================================================================================
// 15-17. Tenant, race ve PII
// =========================================================================================
describe('R2 — tenant / race / PII', () => {
  it('15. tenant mismatch → yazma yok, varlık sızıntısı yok (hiç sorgu yapılmaz)', async () => {
    const { svc, prisma, tx, office } = buildSvc({ eligible: true });

    const body = await forbiddenBody(() =>
      svc.create('tenant-A', 'c1', NEW_ADDRESS, actor('ADMIN', 'tenant-B')),
    );

    expect(body.code).toBe(CLIENT_MUTATION_REASON.TENANT_MISMATCH);
    // Hiç okuma bile yapılmaz → "müvekkil var mı" bilgisi sızmaz.
    expect(prisma.client.findFirst).not.toHaveBeenCalled();
    expect(prisma.clientAddress.findFirst).not.toHaveBeenCalled();
    expect(office.isApproverEligible).not.toHaveBeenCalled();
    expectNoWrites(prisma, tx);
  });

  it('15b. yazmalar tenant-scoped parent ilişkisi taşır (D04)', async () => {
    const target = row({ id: 'a1', isPrimary: false, isCurrent: true });
    const { svc, tx } = buildSvc({
      target,
      siblings: [target, row({ id: 'a0', isPrimary: true, isCurrent: true })],
    });

    await svc.update('t1', 'c1', 'a1', { city: 'X' } as any, actor('USER'));

    const where = tx.clientAddress.updateMany.mock.calls[0][0].where;
    expect(where.client).toEqual({ tenantId: 't1' });
    expect(where.id).toBe('a1');
  });

  it('16. koşullu yazma count=0 → sonraki yazma ve audit ÜRETİLMEZ', async () => {
    const target = row({ id: 'a1', isPrimary: false, isCurrent: true });
    const { svc, tx, audit } = buildSvc({
      target,
      siblings: [target, row({ id: 'a0', isPrimary: true, isCurrent: true })],
      updateManyCount: 0,
    });

    await expect(svc.update('t1', 'c1', 'a1', { city: 'X' } as any, actor('USER'))).rejects.toBeTruthy();

    expect(tx.clientAddress.findFirstOrThrow).not.toHaveBeenCalled();
    expect(audit.logInTransaction).not.toHaveBeenCalled();
  });

  it('17. 403 gövdesi ham adres verisi TAŞIMAZ', async () => {
    const { svc } = buildSvc({ target: row({ isPrimary: true }), eligible: false });

    const body = await forbiddenBody(() =>
      svc.update('t1', 'c1', 'a1', { street: SYNTHETIC_STREET, city: SYNTHETIC_CITY } as any, actor('USER')),
    );

    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain(SYNTHETIC_STREET);
    expect(serialized).not.toContain(SYNTHETIC_CITY);
    expect(body.code).toBe(CLIENT_MUTATION_REASON.LIFECYCLE_DENIED);
  });

  it('17b. başarılı mutasyonun audit metadata-sı ham adres verisi TAŞIMAZ', async () => {
    const { svc, audit } = buildSvc({ siblings: [], activePrimaryCount: 0 });

    await svc.create('t1', 'c1', NEW_ADDRESS, actor('USER'));

    const serialized = JSON.stringify(audit.logInTransaction.mock.calls);
    expect(serialized).not.toContain(SYNTHETIC_STREET);
    expect(serialized).not.toContain(SYNTHETIC_CITY);
  });
});

// =========================================================================================
// 18-19. Sınıflandırma sözleşmesi + R1/R1A regresyon yok + DELETE değişmedi
// =========================================================================================
describe('R2 — sözleşme sabitleri', () => {
  const read = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8');

  it('18. R1/R1A davranışı gerilemez: client create/update actor ZORUNLU + reactivate kapısı yerinde', () => {
    const src = read('client.service.ts');
    expect(src).toMatch(/async create\([^)]*actor:\s*ClientMutationActorContext\s*\)/s);
    expect(src).toMatch(/async update\([^)]*actor:\s*ClientMutationActorContext\s*\)/s);
    expect(src).toContain('assertCanReactivateViaCreate');
    expect(src).not.toMatch(/async create\([^)]*actor\?:/s);
  });

  it('18b. adres servisinde actor ZORUNLU (fail-open `actor?:` imzası kalmadı)', () => {
    const src = read('client-address.service.ts');
    for (const m of ['create', 'update', 'archive', 'restore']) {
      expect(src).toMatch(new RegExp(`async ${m}\\([^)]*actor:\\s*ClientMutationActorContext`, 's'));
    }
    expect(src).not.toMatch(/async (create|update|archive|restore)\([^)]*actor\?:\s*AuditActor/s);
  });

  it('19. DELETE fail-closed sözleşmesi DEĞİŞMEDİ (D05)', async () => {
    const src = read('client-address.service.ts');
    expect(src).toMatch(/async remove\(tenantId: string, clientId: string, addressId: string\): Promise<never>/);
    expect(src).toContain('CLIENT_ADDRESS_PHYSICAL_DELETE_NOT_AUTHORIZED');
    // remove() actor ALMAZ ve yetki kapısı EKLENMEDİ (owner E).
    expect(src).not.toMatch(/async remove\([^)]*actor/s);

    const { svc, prisma, tx } = buildSvc({ target: row() });
    await expect(svc.remove('t1', 'c1', 'a1')).rejects.toBeTruthy();
    expectNoWrites(prisma, tx);
  });

  it('19b. sınıflandırma tablosu owner D02/D03 ile birebir', () => {
    // ARCHIVE / RESTORE her zaman elevated.
    expect(requiresElevatedAddressAuthority({ operation: 'ARCHIVE' })).toBe(true);
    expect(requiresElevatedAddressAuthority({ operation: 'RESTORE' })).toBe(true);
    // UPDATE: hedef birincilse veya devir talebi varsa.
    expect(requiresElevatedAddressAuthority({ operation: 'UPDATE', targetIsPrimary: true })).toBe(true);
    expect(requiresElevatedAddressAuthority({ operation: 'UPDATE', requestsPrimary: true })).toBe(true);
    expect(requiresElevatedAddressAuthority({ operation: 'UPDATE' })).toBe(false);
    // CREATE: yalnız MEVCUT aktif birincili düşürecek açık talep.
    expect(requiresElevatedAddressAuthority({ operation: 'CREATE', requestsPrimary: true, hasActivePrimary: true })).toBe(true);
    // D03 — ilk adresin otomatik birincil olması STANDARD.
    expect(requiresElevatedAddressAuthority({ operation: 'CREATE', requestsPrimary: true, hasActivePrimary: false })).toBe(false);
    expect(requiresElevatedAddressAuthority({ operation: 'CREATE' })).toBe(false);
    // Bilinmeyen işlem → fail-closed.
    expect(requiresElevatedAddressAuthority({ operation: 'WHATEVER' as any })).toBe(true);
  });
});
