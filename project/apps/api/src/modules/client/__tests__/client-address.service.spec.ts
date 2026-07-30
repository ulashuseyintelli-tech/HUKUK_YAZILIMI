/**
 * ClientAddress-2 — service-layer davranış testleri (mocked Prisma; ClientAddress tablosu
 * dev DB'de henüz yok, migration apply ClientAddress-1'de bilerek yapılmadı — bu yüzden
 * gerçek DB'ye vuran integration test YOK, yalnız unit).
 */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ClientAddressService } from '../client-address.service';

const DEFAULT_ADDRESS = {
  id: 'addr-1',
  clientId: 'client-1',
  type: 'BEYAN',
  street: 'Eski Sokak',
  city: 'İstanbul',
  district: 'Kadıköy',
  region: null,
  postalCode: null,
  isPrimary: false,
  isCurrent: true,
};

/**
 * CLIENT-ARC-07-LIFECYCLE-INVARIANT-I01 HARNESS GÜNCELLEMESİ:
 * servis artık kardeş durumunu `tx.clientAddress.count()` YERİNE minimum projeksiyonlu
 * `tx.clientAddress.findMany()` ile okur (invariant değerlendirmesi §49 için gerekli).
 * `count` mock'u ARTIK KULLANILMIYOR ve kaldırıldı. Assertion'lar DEĞİŞTİRİLMEDİ —
 * yalnız harness servisin yeni okuma şekline hizalandı ve §49-GEÇERLİ kardeş kümesi üretir
 * (aksi halde yeni invariant guard'ı testin kurmak istediği durumu haklı olarak reddederdi).
 */
function defaultSiblings(opts: { address?: any; addressCount?: number }, addressFixture: any) {
  if (opts.addressCount !== undefined) {
    // addressCount kadar mevcut satır; İLKİ primary (gerçekçi: ilk adres otomatik primary olur).
    return Array.from({ length: opts.addressCount }, (_, i) => ({
      id: `addr-existing-${i + 1}`,
      clientId: 'client-1',
      isPrimary: i === 0,
      isCurrent: true,
    }));
  }
  if (!addressFixture) return [];
  const target = {
    id: addressFixture.id,
    clientId: addressFixture.clientId,
    isPrimary: addressFixture.isPrimary,
    isCurrent: addressFixture.isCurrent,
  };
  // Hedef satır primary değilse kümede AYRI bir primary bulunmalı (§49 INV-03).
  return target.isPrimary
    ? [target]
    : [target, { id: 'addr-primary', clientId: 'client-1', isPrimary: true, isCurrent: true }];
}

function buildHarness(
  opts: { client?: any; address?: any; addressCount?: number; siblings?: any[] } = {},
) {
  const addressFixture = 'address' in opts ? opts.address : DEFAULT_ADDRESS;
  const siblings = opts.siblings ?? defaultSiblings(opts, addressFixture);
  const tx = {
    clientAddress: {
      findMany: jest.fn().mockResolvedValue(siblings),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'addr-new', ...data })),
      update: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'addr-1', clientId: 'client-1', ...data })),
      delete: jest.fn().mockResolvedValue({ id: 'addr-1' }),
    },
    client: {
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };
  const prisma: any = {
    client: {
      findFirst: jest.fn().mockResolvedValue('client' in opts ? opts.client : { id: 'client-1' }),
    },
    clientAddress: {
      findFirst: jest.fn().mockResolvedValue(addressFixture),
    },
    $transaction: jest.fn().mockImplementation(async (cb: any) => cb(tx)),
  };
  // CLIENT-ARC-07-ARCHIVE-RESTORE-AUDIT-I02 HARNESS GÜNCELLEMESİ: servise AuditService enjekte
  // edildi (archive/restore transaction-içi audit yazar). Bu spec'teki create/update/remove
  // yolları audit YAZMAZ — mock yalnız constructor'ı karşılamak için var; assertion'lar
  // DEĞİŞTİRİLMEDİ.
  const audit: any = { logInTransaction: jest.fn().mockResolvedValue(undefined), log: jest.fn() };
  return { svc: new ClientAddressService(prisma, audit), prisma, tx, audit };
}

const CREATE_INPUT = { street: 'Yeni Sokak', city: 'İstanbul', district: 'Beşiktaş' };

describe('ClientAddressService', () => {
  it('ilk adres otomatik isPrimary=true olur', async () => {
    const { svc, tx } = buildHarness({ addressCount: 0 });

    await svc.create('tenant-1', 'client-1', CREATE_INPUT);

    expect(tx.clientAddress.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isPrimary: true }) }),
    );
    // ilk adreste unset-siblings gereksiz ama zararsız; asıl kanıt: create isPrimary:true aldı.
  });

  it('ikinci adres (isPrimary belirtilmezse) isPrimary=false olur', async () => {
    const { svc, tx } = buildHarness({ addressCount: 1 });

    await svc.create('tenant-1', 'client-1', CREATE_INPUT);

    expect(tx.clientAddress.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isPrimary: false }) }),
    );
    expect(tx.clientAddress.updateMany).not.toHaveBeenCalled();
  });

  it('yeni primary set edilince (create, isPrimary:true) eski primary false olur', async () => {
    const { svc, tx } = buildHarness({ addressCount: 1 });

    await svc.create('tenant-1', 'client-1', { ...CREATE_INPUT, isPrimary: true });

    expect(tx.clientAddress.updateMany).toHaveBeenCalledWith({
      where: { clientId: 'client-1', isPrimary: true },
      data: { isPrimary: false },
    });
    expect(tx.clientAddress.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isPrimary: true }) }),
    );
    // sibling-unset create'ten ÖNCE çağrılır (transaction sırası)
    expect(tx.clientAddress.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      tx.clientAddress.create.mock.invocationCallOrder[0],
    );
  });

  it('update isPrimary=true invariant korunur: diğer primary adresler false olur', async () => {
    const { svc, tx } = buildHarness({
      address: { id: 'addr-2', clientId: 'client-1', isPrimary: false, isCurrent: true, type: 'BEYAN', street: null, city: null, district: null, region: null, postalCode: null },
    });

    await svc.update('tenant-1', 'client-1', 'addr-2', { isPrimary: true });

    expect(tx.clientAddress.updateMany).toHaveBeenCalledWith({
      where: { clientId: 'client-1', isPrimary: true },
      data: { isPrimary: false },
    });
    expect(tx.clientAddress.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'addr-2' }, data: expect.objectContaining({ isPrimary: true }) }),
    );
  });

  it('update isPrimary zaten true olan adres için tekrar sibling-unset çağırmaz (no-op idempotent)', async () => {
    const { svc, tx } = buildHarness({
      address: { id: 'addr-1', clientId: 'client-1', isPrimary: true, isCurrent: true, type: 'BEYAN', street: null, city: null, district: null, region: null, postalCode: null },
    });

    await svc.update('tenant-1', 'client-1', 'addr-1', { isPrimary: true, city: 'Ankara' });

    expect(tx.clientAddress.updateMany).not.toHaveBeenCalled();
    expect(tx.clientAddress.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ city: 'Ankara', isPrimary: true }) }),
    );
  });

  it('update isPrimary belirtilmezse mevcut isPrimary alanına dokunulmaz (undefined -> Prisma no-op)', async () => {
    const { svc, tx } = buildHarness();

    await svc.update('tenant-1', 'client-1', 'addr-1', { city: 'İzmir' });

    expect(tx.clientAddress.updateMany).not.toHaveBeenCalled();
    expect(tx.clientAddress.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ city: 'İzmir', isPrimary: undefined }) }),
    );
  });

  it('payload dışındaki mevcut adresler silinmez: create/update hiçbir zaman deleteMany çağırmaz', async () => {
    const { svc, tx } = buildHarness({ addressCount: 2 });

    await svc.create('tenant-1', 'client-1', CREATE_INPUT);
    await svc.update('tenant-1', 'client-1', 'addr-1', { city: 'Bursa' });

    expect(tx.clientAddress.delete).not.toHaveBeenCalled();
    expect((tx.clientAddress as any).deleteMany).toBeUndefined();
  });

  it('primary adres silinmesi reddedilir (BadRequestException), delete çağrılmaz', async () => {
    const { svc, prisma } = buildHarness({
      address: { id: 'addr-1', clientId: 'client-1', isPrimary: true, isCurrent: true, type: 'BEYAN', street: null, city: null, district: null, region: null, postalCode: null },
    });

    await expect(svc.remove('tenant-1', 'client-1', 'addr-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.clientAddress.delete).toBeUndefined();
  });

  it('I02: primary OLMAYAN adres de fiziksel olarak silinemez (fail-closed)', async () => {
    const { svc, tx } = buildHarness({
      address: { id: 'addr-1', clientId: 'client-1', isPrimary: false, isCurrent: true, type: 'BEYAN', street: null, city: null, district: null, region: null, postalCode: null },
    });

    // I02 KASITLI DAVRANIŞ DEĞİŞİKLİĞİ (owner §7 + charter §49.4/§49.9):
    // Eskiden bu test non-primary silmenin İZİNLİ olduğunu kanıtlıyordu. Artık fiziksel silme
    // KOŞULSUZ fail-closed'dır — POL-E'nin sekiz ön koşulu runtime'da temsil edilmediği için
    // hiçbir silme "yetkili" sayılamaz. Test GEVŞETİLMEDİ; beklenti TERS ÇEVRİLDİ ve silmenin
    // GERÇEKTEN çağrılmadığı ayrıca kanıtlanıyor.
    await expect(svc.remove('tenant-1', 'client-1', 'addr-1')).rejects.toMatchObject({
      response: { code: 'CLIENT_ADDRESS_PHYSICAL_DELETE_NOT_AUTHORIZED' },
    });
    expect(tx.clientAddress.delete).not.toHaveBeenCalled();
  });

  it('create/update hiçbir zaman Client (flat adres kolonları) tablosuna yazmaz; remove hiç yazmaz', async () => {
    const { svc, tx } = buildHarness();

    await svc.create('tenant-1', 'client-1', CREATE_INPUT);
    await svc.update('tenant-1', 'client-1', 'addr-1', { city: 'Antalya' });
    // remove artık her zaman reddeder (I02 fail-closed) → hiçbir yazma yapmaz.
    await expect(svc.remove('tenant-1', 'client-1', 'addr-1')).rejects.toBeInstanceOf(BadRequestException);

    expect(tx.client.update).not.toHaveBeenCalled();
    expect(tx.client.updateMany).not.toHaveBeenCalled();
  });

  it('tenant dışı/olmayan client için create 404 döner', async () => {
    const { svc } = buildHarness({ client: null });
    await expect(svc.create('tenant-1', 'client-x', CREATE_INPUT)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('tenant dışı/olmayan adres için update/remove 404 döner', async () => {
    const { svc } = buildHarness({ address: null });
    await expect(svc.update('tenant-1', 'client-1', 'addr-x', { city: 'X' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.remove('tenant-1', 'client-1', 'addr-x')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('update/remove sorgusu addressId ile birlikte clientId ve tenantId filtresi de ekler (DBND-D6A-1: cross-client erişim + route collision fix)', async () => {
    const { svc, prisma } = buildHarness();

    await svc.update('tenant-1', 'client-1', 'addr-1', { city: 'X' });

    expect(prisma.clientAddress.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'addr-1', clientId: 'client-1', client: { tenantId: 'tenant-1' } },
      }),
    );
  });
});
