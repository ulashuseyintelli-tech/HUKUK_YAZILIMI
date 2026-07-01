/**
 * ClientAddress-2 — service-layer davranış testleri (mocked Prisma; ClientAddress tablosu
 * dev DB'de henüz yok, migration apply ClientAddress-1'de bilerek yapılmadı — bu yüzden
 * gerçek DB'ye vuran integration test YOK, yalnız unit).
 */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ClientAddressService } from '../client-address.service';

function buildHarness(opts: { client?: any; address?: any; addressCount?: number } = {}) {
  const tx = {
    clientAddress: {
      count: jest.fn().mockResolvedValue(opts.addressCount ?? 0),
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
      findFirst: jest.fn().mockResolvedValue(
        'address' in opts
          ? opts.address
          : {
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
            },
      ),
    },
    $transaction: jest.fn().mockImplementation(async (cb: any) => cb(tx)),
  };
  return { svc: new ClientAddressService(prisma), prisma, tx };
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

    await svc.update('tenant-1', 'addr-2', { isPrimary: true });

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

    await svc.update('tenant-1', 'addr-1', { isPrimary: true, city: 'Ankara' });

    expect(tx.clientAddress.updateMany).not.toHaveBeenCalled();
    expect(tx.clientAddress.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ city: 'Ankara', isPrimary: true }) }),
    );
  });

  it('update isPrimary belirtilmezse mevcut isPrimary alanına dokunulmaz (undefined -> Prisma no-op)', async () => {
    const { svc, tx } = buildHarness();

    await svc.update('tenant-1', 'addr-1', { city: 'İzmir' });

    expect(tx.clientAddress.updateMany).not.toHaveBeenCalled();
    expect(tx.clientAddress.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ city: 'İzmir', isPrimary: undefined }) }),
    );
  });

  it('payload dışındaki mevcut adresler silinmez: create/update hiçbir zaman deleteMany çağırmaz', async () => {
    const { svc, tx } = buildHarness({ addressCount: 2 });

    await svc.create('tenant-1', 'client-1', CREATE_INPUT);
    await svc.update('tenant-1', 'addr-1', { city: 'Bursa' });

    expect(tx.clientAddress.delete).not.toHaveBeenCalled();
    expect((tx.clientAddress as any).deleteMany).toBeUndefined();
  });

  it('primary adres silinmesi reddedilir (BadRequestException), delete çağrılmaz', async () => {
    const { svc, prisma } = buildHarness({
      address: { id: 'addr-1', clientId: 'client-1', isPrimary: true, isCurrent: true, type: 'BEYAN', street: null, city: null, district: null, region: null, postalCode: null },
    });

    await expect(svc.remove('tenant-1', 'addr-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.clientAddress.delete).toBeUndefined();
  });

  it('primary olmayan adres silinebilir', async () => {
    const { svc, prisma } = buildHarness({
      address: { id: 'addr-1', clientId: 'client-1', isPrimary: false, isCurrent: true, type: 'BEYAN', street: null, city: null, district: null, region: null, postalCode: null },
    });
    prisma.clientAddress.delete = jest.fn().mockResolvedValue({ id: 'addr-1' });

    await svc.remove('tenant-1', 'addr-1');

    expect(prisma.clientAddress.delete).toHaveBeenCalledWith({ where: { id: 'addr-1' } });
  });

  it('create/update/remove hiçbir zaman Client (flat adres kolonları) tablosuna yazmaz', async () => {
    const { svc, tx, prisma } = buildHarness();
    prisma.clientAddress.delete = jest.fn().mockResolvedValue({});

    await svc.create('tenant-1', 'client-1', CREATE_INPUT);
    await svc.update('tenant-1', 'addr-1', { city: 'Antalya' });
    await svc.remove('tenant-1', 'addr-1');

    expect(tx.client.update).not.toHaveBeenCalled();
    expect(tx.client.updateMany).not.toHaveBeenCalled();
  });

  it('tenant dışı/olmayan client için create 404 döner', async () => {
    const { svc } = buildHarness({ client: null });
    await expect(svc.create('tenant-1', 'client-x', CREATE_INPUT)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('tenant dışı/olmayan adres için update/remove 404 döner', async () => {
    const { svc } = buildHarness({ address: null });
    await expect(svc.update('tenant-1', 'addr-x', { city: 'X' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.remove('tenant-1', 'addr-x')).rejects.toBeInstanceOf(NotFoundException);
  });
});
