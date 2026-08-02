import { readFileSync } from 'fs';
import { join } from 'path';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  evaluateClientAddressLifecycle,
  isClientAddressLifecycleValid,
  type ClientAddressLifecycleRow,
} from '../client-address-lifecycle';
import { ClientAddressService } from '../client-address.service';

/** Kaynak-metin assertion'ları için (kapsam-dışı davranışın EKLENMEDİĞİNİ kanıtlar). */
const SERVICE_SOURCE = readFileSync(join(__dirname, '..', 'client-address.service.ts'), 'utf-8');

/**
 * CLIENT-ARC-07-LIFECYCLE-INVARIANT-I01 — §49 invariant temeli.
 *
 * KANONİK OTORİTE: CLIENT-GOVERNANCE-CHARTER.md §49 (D01/D02, owner-ratified).
 *
 * KAPSAM: saf resolver + mevcut ClientAddress yazma yollarının transaction-içi guard'ı.
 * KAPSAM DIŞI (bu dosya BUNLARI TEST ETMEZ çünkü UYGULANMADI): archive/restore endpoint,
 * lifecycle audit, GET/history API, UI, backfill, kaynak-otorite göçü.
 */

const R = (
  over: Partial<ClientAddressLifecycleRow> & Pick<ClientAddressLifecycleRow, 'isPrimary' | 'isCurrent'>,
): ClientAddressLifecycleRow => ({ id: 'a1', clientId: 'c1', ...over });

describe('ARC-07 I01 — saf resolver (DB yok, yan etki yok)', () => {
  it('[1] bir current + bir primary → GEÇERLİ', () => {
    expect(evaluateClientAddressLifecycle('c1', [R({ isPrimary: true, isCurrent: true })])).toEqual({
      valid: true,
    });
  });

  it('[2] çok current + TAM BİR primary → GEÇERLİ (INV-05 çok-current izinli)', () => {
    const rows = [
      R({ id: 'a1', isPrimary: true, isCurrent: true }),
      R({ id: 'a2', isPrimary: false, isCurrent: true }),
      R({ id: 'a3', isPrimary: false, isCurrent: true }),
    ];
    expect(isClientAddressLifecycleValid('c1', rows)).toBe(true);
  });

  it('[3] sıfır current + sıfır primary → GEÇERLİ (INV-04)', () => {
    expect(isClientAddressLifecycleValid('c1', [])).toBe(true);
    // Yalnız arşiv satır varsa da geçerli: current yok → primary gerekmez.
    expect(isClientAddressLifecycleValid('c1', [R({ isPrimary: false, isCurrent: false })])).toBe(true);
  });

  it('[4] primary current DEĞİL → GEÇERSİZ, PRIMARY_NOT_CURRENT / INV-01', () => {
    const res = evaluateClientAddressLifecycle('c1', [R({ isPrimary: true, isCurrent: false })]);
    expect(res.valid).toBe(false);
    expect(res.code).toBe('PRIMARY_NOT_CURRENT');
    expect(res.invariant).toBe('INV-01');
  });

  it('[5] arşiv (non-current) satır primary → GEÇERSİZ (INV-02, INV-01 ile AYNI koşul)', () => {
    // KOD BİRLEŞTİRME kanıtı: ARCHIVED_PRIMARY ayrı kod olarak ÜRETİLMEDİ.
    const res = evaluateClientAddressLifecycle('c1', [
      R({ id: 'a1', isPrimary: false, isCurrent: true }),
      R({ id: 'a2', isPrimary: true, isCurrent: false }),
    ]);
    expect(res.valid).toBe(false);
    expect(res.code).toBe('PRIMARY_NOT_CURRENT');
  });

  it('[6] çok primary → GEÇERSİZ, MULTIPLE_PRIMARY / INV-06', () => {
    const res = evaluateClientAddressLifecycle('c1', [
      R({ id: 'a1', isPrimary: true, isCurrent: true }),
      R({ id: 'a2', isPrimary: true, isCurrent: true }),
    ]);
    expect(res.valid).toBe(false);
    expect(res.code).toBe('MULTIPLE_PRIMARY');
    expect(res.invariant).toBe('INV-06');
  });

  it('[7] current satır var ama primary YOK → GEÇERSİZ, CURRENT_WITHOUT_PRIMARY / INV-03', () => {
    const res = evaluateClientAddressLifecycle('c1', [
      R({ id: 'a1', isPrimary: false, isCurrent: true }),
      R({ id: 'a2', isPrimary: false, isCurrent: true }),
    ]);
    expect(res.valid).toBe(false);
    expect(res.code).toBe('CURRENT_WITHOUT_PRIMARY');
    expect(res.invariant).toBe('INV-03');
  });

  it('[8] BAŞKA müvekkilin satırı invariant\'ı SAĞLAYAMAZ → CLIENT_SCOPE_MISMATCH / INV-08', () => {
    // c1'in current satırı primary'siz; primary BAŞKA müvekkilde (c2). Bu küme GEÇERLİ SAYILMAZ.
    const res = evaluateClientAddressLifecycle('c1', [
      R({ id: 'a1', clientId: 'c1', isPrimary: false, isCurrent: true }),
      R({ id: 'a2', clientId: 'c2', isPrimary: true, isCurrent: true }),
    ]);
    expect(res.valid).toBe(false);
    expect(res.code).toBe('CLIENT_SCOPE_MISMATCH');
    expect(res.invariant).toBe('INV-08');
  });

  it('[9] ihlal kodu DETERMİNİSTİK — aynı girdi her zaman aynı kod', () => {
    const rows = [
      R({ id: 'a1', isPrimary: true, isCurrent: true }),
      R({ id: 'a2', isPrimary: true, isCurrent: true }),
    ];
    const first = evaluateClientAddressLifecycle('c1', rows);
    for (let i = 0; i < 5; i++) {
      expect(evaluateClientAddressLifecycle('c1', rows)).toEqual(first);
    }
  });

  it('[10] girdi SIRASI sonucu DEĞİŞTİRMEZ (sabit öncelik)', () => {
    // Aynı kümede iki ihlal birlikte: primary-not-current + çok primary.
    const a = R({ id: 'a1', isPrimary: true, isCurrent: false });
    const b = R({ id: 'a2', isPrimary: true, isCurrent: true });
    const c = R({ id: 'a3', isPrimary: true, isCurrent: true });
    const forward = evaluateClientAddressLifecycle('c1', [a, b, c]);
    const reversed = evaluateClientAddressLifecycle('c1', [c, b, a]);
    const shuffled = evaluateClientAddressLifecycle('c1', [b, a, c]);
    expect(forward).toEqual(reversed);
    expect(forward).toEqual(shuffled);
    // Öncelik: PRIMARY_NOT_CURRENT, MULTIPLE_PRIMARY'den ÖNCE gelir.
    expect(forward.code).toBe('PRIMARY_NOT_CURRENT');
  });

  it('[10b] geçerli kümede sıra bağımsızlığı da korunur', () => {
    const rows = [
      R({ id: 'a1', isPrimary: false, isCurrent: true }),
      R({ id: 'a2', isPrimary: true, isCurrent: true }),
      R({ id: 'a3', isPrimary: false, isCurrent: false }),
    ];
    expect(isClientAddressLifecycleValid('c1', rows)).toBe(true);
    expect(isClientAddressLifecycleValid('c1', [...rows].reverse())).toBe(true);
  });
});

// ————————————————————————————————————————————————————————————————————————
// SERVİS ENTEGRASYONU
// ————————————————————————————————————————————————————————————————————————

type Sib = { id: string; clientId: string; isPrimary: boolean; isCurrent: boolean };

function buildService(opts: { siblings: Sib[]; clientFound?: boolean }) {
  const tx = {
    clientAddress: {
      findMany: jest.fn().mockResolvedValue(opts.siblings),
      // OWN-13 I02-R2 (D04): `updateMany` artık FINAL WRITE'tır ve `count` KONTROL EDİLİR
      // (0 → NotFound, sonraki yazma/audit yok). Bu suite invariant ihlallerini ölçer, yazma
      // yarışını değil → başarılı yazma (count=1) kurulur; sonuç `findFirstOrThrow` ile okunur.
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findFirstOrThrow: jest
        .fn()
        .mockImplementation(({ where }: any) => Promise.resolve({ id: where.id, clientId: 'c1' })),
      create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'new', ...data })),
      update: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'a1', ...data })),
      delete: jest.fn().mockResolvedValue({ id: 'a2' }),
    },
    // D04: create() parent Client'ı AYNI transaction içinde tenant-scoped YENİDEN doğrular.
    client: {
      findFirst: jest
        .fn()
        .mockImplementation(() => Promise.resolve(opts.clientFound === false ? null : { id: 'c1' })),
    },
  };
  let rolledBack = false;
  const prisma: any = {
    client: {
      findFirst: jest.fn().mockResolvedValue(opts.clientFound === false ? null : { id: 'c1' }),
    },
    clientAddress: {
      // OWN-13 I02-R2 (D02/D03): AÇIK birincillik talebinde "mevcut aktif birincil var mı"
      // sorulur — sınıflandırma STANDARD/ELEVATED ayrımı için buna bakar.
      count: jest
        .fn()
        .mockImplementation(async () => opts.siblings.filter((s) => s.isPrimary && s.isCurrent).length),
      findFirst: jest.fn().mockImplementation(({ where }: any) => {
        const found = opts.siblings.find((s) => s.id === where.id);
        return Promise.resolve(found ? { ...found, type: 'BEYAN', street: null, city: null, district: null, region: null, postalCode: null } : null);
      }),
      delete: jest.fn(),
    },
    // Gerçek transaction semantiği: callback throw ederse yazmalar COMMIT EDİLMEZ.
    $transaction: jest.fn().mockImplementation(async (cb: any) => {
      try {
        return await cb(tx);
      } catch (e) {
        rolledBack = true;
        throw e;
      }
    }),
  };
  // I02: servise AuditService enjekte edildi. Bu spec I01 invariant davranışını ölçer; audit
  // içeriği I02 spec'inde doğrulanır. Mock hata YUTMAZ (gerçek logInTransaction gibi).
  const audit: any = { logInTransaction: jest.fn().mockResolvedValue(undefined), log: jest.fn() };
  const svc = new ClientAddressService(prisma, audit, { isApproverEligible: jest.fn().mockResolvedValue(true) } as any);
  return { svc, prisma, tx, audit, wasRolledBack: () => rolledBack };
}

describe('ARC-07 I01 — servis: create()', () => {
  it('[11] ilk adres GEÇERLİ durum üretir (otomatik primary)', async () => {
    const { svc, tx } = buildService({ siblings: [] });
    await svc.create('t1', 'c1', { type: 'BEYAN', street: 'X' } as any, { userId: 'fixture-actor', tenantId: 't1', role: 'ADMIN' });
    expect(tx.clientAddress.create).toHaveBeenCalledTimes(1);
    expect(tx.clientAddress.create.mock.calls[0][0].data.isPrimary).toBe(true);
  });

  it('[12] ikinci NON-primary current adres İZİNLİ (primary zaten var)', async () => {
    const { svc, tx } = buildService({
      siblings: [{ id: 'a1', clientId: 'c1', isPrimary: true, isCurrent: true }],
    });
    await svc.create('t1', 'c1', { type: 'TEBLIGAT', street: 'Y' } as any, { userId: 'fixture-actor', tenantId: 't1', role: 'ADMIN' });
    expect(tx.clientAddress.create).toHaveBeenCalledTimes(1);
    expect(tx.clientAddress.create.mock.calls[0][0].data.isPrimary).toBe(false);
    // Mevcut primary DÜŞÜRÜLMEZ.
    expect(tx.clientAddress.updateMany).not.toHaveBeenCalled();
  });

  it('[13] ikinci PRIMARY talebi mevcut primary\'yi düşürür — çok-primary OLUŞMAZ', async () => {
    const { svc, tx } = buildService({
      siblings: [{ id: 'a1', clientId: 'c1', isPrimary: true, isCurrent: true }],
    });
    await svc.create('t1', 'c1', { type: 'TICARI', street: 'Z', isPrimary: true } as any, { userId: 'fixture-actor', tenantId: 't1', role: 'ADMIN' });
    expect(tx.clientAddress.updateMany).toHaveBeenCalledWith({
      // D04: kardeş birincillik-düşürme yazması da tenant-scoped parent ilişkisi taşır.
      where: { clientId: 'c1', isPrimary: true, client: { tenantId: 't1' } },
      data: { isPrimary: false },
    });
    expect(tx.clientAddress.create.mock.calls[0][0].data.isPrimary).toBe(true);
  });

  it('[13b] KRİTİK — current satır var ama primary YOKken non-primary create REDDEDİLİR', async () => {
    // §49/§4A: "non-primary current adres yalnız BAŞKA bir current primary varsa izinli".
    const { svc, tx, wasRolledBack } = buildService({
      siblings: [{ id: 'a1', clientId: 'c1', isPrimary: false, isCurrent: true }],
    });
    await expect(svc.create('t1', 'c1', { type: 'BEYAN', street: 'Q' } as any, { userId: 'fixture-actor', tenantId: 't1', role: 'ADMIN' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(tx.clientAddress.create).not.toHaveBeenCalled();
    expect(wasRolledBack()).toBe(true);
  });

  it('[13c] yalnız ARŞİV satır varsa yeni adres primary olur (INV-07)', async () => {
    const { svc, tx } = buildService({
      siblings: [{ id: 'a1', clientId: 'c1', isPrimary: false, isCurrent: false }],
    });
    await svc.create('t1', 'c1', { type: 'BEYAN', street: 'W' } as any, { userId: 'fixture-actor', tenantId: 't1', role: 'ADMIN' });
    expect(tx.clientAddress.create.mock.calls[0][0].data.isPrimary).toBe(true);
  });
});

describe('ARC-07 I01 — servis: update()', () => {
  it('[14] tek primary current varken update onu UNSET EDEMEZ (API primary düşürmez)', async () => {
    const { svc, tx } = buildService({
      siblings: [{ id: 'a1', clientId: 'c1', isPrimary: true, isCurrent: true }],
    });
    // isPrimary:false gönderilse bile bayrak DEĞİŞMEZ (undefined geçilir) → küme geçerli kalır.
    await svc.update('t1', 'c1', 'a1', { street: 'yeni', isPrimary: false } as any, { userId: 'fixture-actor', tenantId: 't1', role: 'ADMIN' });
    // D04: final write `updateMany`. Hedef satırın yazımı, unset olmayan çağrıdır.
    const targetWrite = tx.clientAddress.updateMany.mock.calls.find(([a]: any[]) => a?.where?.id);
    expect(targetWrite[0].data.isPrimary).toBeUndefined();
  });

  it('[15] arşiv (non-current) satırı primary yapma girişimi REDDEDİLİR', async () => {
    const { svc, tx, wasRolledBack } = buildService({
      siblings: [
        { id: 'a1', clientId: 'c1', isPrimary: true, isCurrent: true },
        { id: 'a2', clientId: 'c1', isPrimary: false, isCurrent: false },
      ],
    });
    await expect(
      svc.update('t1', 'c1', 'a2', { isPrimary: true } as any, { userId: 'fixture-actor', tenantId: 't1', role: 'ADMIN' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.clientAddress.update).not.toHaveBeenCalled();
    // D04: satir guncellemesi artik `updateMany` ile yapilir — o da cagrilmamali.
    expect(tx.clientAddress.updateMany).not.toHaveBeenCalled();
    expect(wasRolledBack()).toBe(true);
  });

  it('[15b] current satırı primary\'ye terfi GEÇERLİ — diğerleri düşer', async () => {
    const { svc, tx } = buildService({
      siblings: [
        { id: 'a1', clientId: 'c1', isPrimary: true, isCurrent: true },
        { id: 'a2', clientId: 'c1', isPrimary: false, isCurrent: true },
      ],
    });
    await svc.update('t1', 'c1', 'a2', { isPrimary: true } as any, { userId: 'fixture-actor', tenantId: 't1', role: 'ADMIN' });
    expect(tx.clientAddress.updateMany).toHaveBeenCalled();
    // D04: final write `updateMany`. Hedef satırın yazımı, unset olmayan çağrıdır.
    const promoted = tx.clientAddress.updateMany.mock.calls.find(([a]: any[]) => a?.where?.id);
    expect(promoted[0].data.isPrimary).toBe(true);
  });

  it('[16] tenant/client kapsamı FAIL-CLOSED — bulunamayan adres 404', async () => {
    const { svc } = buildService({ siblings: [] });
    await expect(svc.update('t1', 'c1', 'yok', { street: 'x' } as any, { userId: 'fixture-actor', tenantId: 't1', role: 'ADMIN' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('[17] invariant ihlalinde transaction ROLLBACK olur, hiçbir yazma COMMIT EDİLMEZ', async () => {
    const { svc, tx, wasRolledBack } = buildService({
      siblings: [
        { id: 'a1', clientId: 'c1', isPrimary: true, isCurrent: true },
        { id: 'a2', clientId: 'c1', isPrimary: false, isCurrent: false },
      ],
    });
    await expect(svc.update('t1', 'c1', 'a2', { isPrimary: true } as any, { userId: 'fixture-actor', tenantId: 't1', role: 'ADMIN' })).rejects.toThrow();
    expect(wasRolledBack()).toBe(true);
    expect(tx.clientAddress.update).not.toHaveBeenCalled();
    // D04: satir guncellemesi artik `updateMany` ile yapilir — o da cagrilmamali.
    expect(tx.clientAddress.updateMany).not.toHaveBeenCalled();
    expect(tx.clientAddress.updateMany).not.toHaveBeenCalled();
  });
});

/**
 * I02 KASITLI GÜNCELLEME — bu describe bloğu I01'de "silme YENİDEN TASARLANMADI" sınırını
 * pinliyordu. `CLIENT-ARC-07-ARCHIVE-RESTORE-AUDIT-I02` owner §7 ve charter §49.4/§49.9 gereği
 * fiziksel silmeyi KOŞULSUZ fail-closed yaptı. Aşağıdaki testler GEVŞETİLMEDİ — beklentiler
 * yeni kanonik davranışa TERS ÇEVRİLDİ ve silmenin gerçekten hiç çağrılmadığı korunuyor.
 */
describe('ARC-07 I02 — servis: remove() (fiziksel silme FAIL-CLOSED)', () => {
  it('[18] birincil adres silinemez — artık fiziksel-silme kodu döner (I01 primary-delete reddini KAPSAR)', async () => {
    const { svc, tx } = buildService({
      siblings: [
        { id: 'a1', clientId: 'c1', isPrimary: true, isCurrent: true },
        { id: 'a2', clientId: 'c1', isPrimary: false, isCurrent: true },
      ],
    });
    await expect(svc.remove('t1', 'c1', 'a1')).rejects.toMatchObject({
      response: { code: 'CLIENT_ADDRESS_PHYSICAL_DELETE_NOT_AUTHORIZED' },
    });
    expect(tx.clientAddress.delete).not.toHaveBeenCalled();
  });

  it('[18b] non-primary silme de REDDEDİLİR (I01\'de izinliydi — I02 fail-closed)', async () => {
    const { svc, tx } = buildService({
      siblings: [
        { id: 'a1', clientId: 'c1', isPrimary: true, isCurrent: true },
        { id: 'a2', clientId: 'c1', isPrimary: false, isCurrent: true },
      ],
    });
    await expect(svc.remove('t1', 'c1', 'a2')).rejects.toMatchObject({
      response: { code: 'CLIENT_ADDRESS_PHYSICAL_DELETE_NOT_AUTHORIZED' },
    });
    expect(tx.clientAddress.delete).not.toHaveBeenCalled();
  });

  it('[18c] DELETE sessizce arşivlemeye ÇEVRİLMEZ — hiçbir isCurrent mutasyonu yapılmaz', async () => {
    const { svc, tx } = buildService({
      siblings: [{ id: 'a2', clientId: 'c1', isPrimary: false, isCurrent: true }],
    });
    await expect(svc.remove('t1', 'c1', 'a2')).rejects.toBeDefined();
    expect(tx.clientAddress.update).not.toHaveBeenCalled();
    // D04: satir guncellemesi artik `updateMany` ile yapilir — o da cagrilmamali.
    expect(tx.clientAddress.updateMany).not.toHaveBeenCalled();
    expect(tx.clientAddress.updateMany).not.toHaveBeenCalled();
    expect(tx.clientAddress.delete).not.toHaveBeenCalled();
  });

  it('[19] I03 sınırı: create/update/remove + archive/restore + tek scope\'lu okuma; I04+ yüzeyi YOK', () => {
    const proto = Object.getOwnPropertyNames(ClientAddressService.prototype);
    expect(proto).toContain('create');
    expect(proto).toContain('update');
    expect(proto).toContain('remove');
    // I02 EKLEDİ:
    expect(proto).toContain('archive');
    expect(proto).toContain('restore');
    // I03 EKLEDİ (KASITLI GÜNCELLEME — bu blok I02'de "okuma yüzeyi YOK" diyordu):
    expect(proto).toContain('findForClient');
    // Okuma metodu tenant kapsamını KAYBETMEZ (scope predicate kaynakta kanıtlanır).
    expect(SERVICE_SOURCE).toMatch(/client: \{ tenantId \}/);
    // I04+ (production kanıtı / backfill) HÂLÂ YOK:
    expect(proto).not.toContain('backfill');
    expect(proto).not.toContain('countProduction');
    // Eski I03-sınırı isimleri de hâlâ yok (tekil/kapsamsız okuma açılmadı):
    expect(proto).not.toContain('findHistory');
    expect(proto).not.toContain('findAll');
    // isCurrent mutasyonu ARTIK VAR ve YALNIZ açık arşiv/restore yolundadır.
    expect(SERVICE_SOURCE).toMatch(/isCurrent:\s*false/);
  });

  it('[20] invariant kararı KİŞİSEL ADRES İÇERİĞİ gerektirmez — yalnız 4 alan seçilir', async () => {
    const { svc, tx } = buildService({
      siblings: [{ id: 'a1', clientId: 'c1', isPrimary: true, isCurrent: true }],
    });
    await svc.create('t1', 'c1', { type: 'BEYAN', street: 'X' } as any, { userId: 'fixture-actor', tenantId: 't1', role: 'ADMIN' });
    const select = tx.clientAddress.findMany.mock.calls[0][0].select;
    expect(Object.keys(select).sort()).toEqual(['clientId', 'id', 'isCurrent', 'isPrimary']);
    expect(select).not.toHaveProperty('street');
    expect(select).not.toHaveProperty('city');
  });
});

describe('ARC-07 I01 — regresyon sınırları', () => {
  it('[21] mevcut isPrimary davranışı UYUMLU: ilk adres otomatik primary, ikinci değil', async () => {
    const first = buildService({ siblings: [] });
    await first.svc.create('t1', 'c1', { type: 'BEYAN' } as any, { userId: 'fixture-actor', tenantId: 't1', role: 'ADMIN' });
    expect(first.tx.clientAddress.create.mock.calls[0][0].data.isPrimary).toBe(true);

    const second = buildService({
      siblings: [{ id: 'a1', clientId: 'c1', isPrimary: true, isCurrent: true }],
    });
    await second.svc.create('t1', 'c1', { type: 'BEYAN' } as any, { userId: 'fixture-actor', tenantId: 't1', role: 'ADMIN' });
    expect(second.tx.clientAddress.create.mock.calls[0][0].data.isPrimary).toBe(false);
  });

  it('[22] VER-02 yolu ETKİLENMEDİ — bu servis client.service.ts persist yolunu ÇAĞIRMAZ', () => {
    // VER-02 persist'i client.service.ts create()/update() içindedir; bu servis ona dokunmaz.
    expect(SERVICE_SOURCE).not.toMatch(/_addressesSkipped/);
    // I02 GÜNCELLEMESİ: `client.service`'e TEK referans `import type { AuditActor }`'dır —
    // TİP-ONLY, runtime'da silinir, çalışma zamanı bağımlılığı ÜRETMEZ. Runtime import
    // (from '...client.service' — `import type` OLMAYAN) BULUNMAMALIDIR.
    // OWN-13 I02-R2: tip-only import'a `ClientMutationActorContext` EKLENDİ (zorunlu actor
    // bağlamı). ASIL invariant KORUNUR: `client.service`'e runtime bağımlılığı YOKTUR —
    // referans hâlâ TEK ve `import type` (derlemede silinir).
    expect(SERVICE_SOURCE).toMatch(
      /import type \{ ClientMutationActorContext \} from '\.\/client\.service'/,
    );
    expect(SERVICE_SOURCE).not.toMatch(/^import \{[^}]*\} from '\.\/client\.service'/m);
    // VER-02'nin persist ettiği düz kolon yolu ya da ClientService metodu ÇAĞRILMAZ.
    expect(SERVICE_SOURCE).not.toMatch(/clientService|ClientService/);
  });

  it('[23] flat Client adres kolonları bu serviste OKUNMAZ/YAZILMAZ (profil görünümü değişmez)', () => {
    expect(SERVICE_SOURCE).not.toMatch(/client\.update|clientPrimaryAddress|clientResolvedAddress/);
  });

  it('[24] doküman/UYAP çıktı yolu bu serviste hiç referans EDİLMEZ (PR #1926 davranışı korunur)', () => {
    expect(SERVICE_SOURCE).not.toMatch(/document|uyap|template/i);
  });
});
