/**
 * VER-02 — settings/clients (A) ve client-form (B) yüzeylerinin gönderdiği data.addresses[]
 * artık gerçek ClientAddress tablosuna da yazılır (contacts ile aynı desen). Flat kolonlar
 * (address/city/district/region) DEĞİŞMEDEN korunur. UPDATE'te yalnız müvekkilin HENÜZ hiç
 * ClientAddress satırı yoksa yazılır — Workspace-yönetimli mevcut satırlara ASLA dokunulmaz.
 */
import { ClientService } from "../client.service";

function buildHarness(
  // `existing` — update()'in KENDİ kaydını çeken pre-check için (bulunmalı, truthy).
  // `dupLookup` — create()'in TCKN/VKN duplicate-arama sorgusu için (varsayılan: null = duplicate YOK,
  //   gerçek create yolu çalışsın). Bu ikisi AYNI `prisma.client.findFirst` mock'unu paylaşır ama
  //   anlamları farklıdır — create testleri dupLookup'ı, update testleri existing'i kullanır.
  opts: { existing?: any; updateCount?: number; addressCount?: number; dupLookup?: any } = {},
) {
  const tx = {
    client: {
      create: jest.fn().mockResolvedValue({ id: "c1" }),
      updateMany: jest.fn().mockResolvedValue({ count: opts.updateCount ?? 1 }),
      findFirst: jest.fn().mockResolvedValue({ id: "c1", isActive: true }),
    },
    clientContact: { createMany: jest.fn().mockResolvedValue({}), deleteMany: jest.fn().mockResolvedValue({}) },
    clientAddress: {
      createMany: jest.fn().mockResolvedValue({}),
      count: jest.fn().mockResolvedValue(opts.addressCount ?? 0),
    },
  };
  const prisma: any = {
    client: {
      findFirst: jest.fn().mockResolvedValue(
        opts.existing !== undefined
          ? opts.existing
          : opts.dupLookup !== undefined
            ? opts.dupLookup
            : { id: "c1", tenantId: "t1", isActive: true, contacts: [] },
      ),
    },
    $transaction: jest.fn().mockImplementation(async (cb: any) => cb(tx)),
  };
  const audit = { logInTransaction: jest.fn().mockResolvedValue(undefined), log: jest.fn() };
  const officeApproval = { isApproverEligible: jest.fn().mockResolvedValue(true) };
  const svc = new ClientService(prisma, audit as any, officeApproval as any);
  jest.spyOn(svc as any, "syncContactFollowUpTaskSafe").mockResolvedValue(undefined);
  return { svc, prisma, tx, audit, officeApproval };
}

/** create() testleri için: TCKN/VKN duplicate-arama HER ZAMAN null dönmeli (gerçek create yolu çalışsın). */
function buildCreateHarness(opts: { addressCount?: number } = {}) {
  return buildHarness({ dupLookup: null, addressCount: opts.addressCount });
}

describe("ClientService.create — VER-02 ClientAddress persist", () => {
  it("[1] çoklu adres → tx.clientAddress.createMany 2 satırla çağrılır, isPrimary doğru", async () => {
    const { svc, tx } = buildCreateHarness();
    await svc.create(
      "t1",
      {
        type: "PERSON",
        firstName: "A",
        lastName: "B",
        tckn: "11111111110",
        addresses: [
          { street: "Cad 1", city: "İstanbul", isPrimary: true },
          { street: "Cad 2", city: "Ankara", isPrimary: false },
        ],
      }, { userId: "u1", tenantId: "t1", role: 'ADMIN' },
    );
    expect(tx.clientAddress.createMany).toHaveBeenCalledTimes(1);
    const data = tx.clientAddress.createMany.mock.calls[0][0].data;
    expect(data).toHaveLength(2);
    expect(data[0]).toMatchObject({ clientId: "c1", street: "Cad 1", city: "İstanbul", isPrimary: true });
    expect(data[1]).toMatchObject({ clientId: "c1", street: "Cad 2", city: "Ankara", isPrimary: false });
  });

  it("[2] tek adres (B yüzeyi deseni) → tx.clientAddress.createMany 1 satırla çağrılır, isPrimary=true", async () => {
    const { svc, tx } = buildCreateHarness();
    await svc.create(
      "t1",
      {
        type: "PERSON",
        firstName: "A",
        lastName: "B",
        tckn: "11111111110",
        addresses: [{ street: "Tek Cad", city: "İzmir", isPrimary: true }],
      }, { userId: "u1", tenantId: "t1", role: 'ADMIN' },
    );
    const data = tx.clientAddress.createMany.mock.calls[0][0].data;
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({ clientId: "c1", street: "Tek Cad", isPrimary: true });
  });

  it("[3] adres yok (undefined) → tx.clientAddress.createMany HİÇ çağrılmaz", async () => {
    const { svc, tx } = buildCreateHarness();
    await svc.create("t1", { type: "PERSON", firstName: "A", lastName: "B", tckn: "11111111110" }, { userId: "u1", tenantId: "t1", role: 'ADMIN' });
    expect(tx.clientAddress.createMany).not.toHaveBeenCalled();
  });

  it("[4] boş street/city (yalnız whitespace) → filtrelenir, createMany çağrılmaz", async () => {
    const { svc, tx } = buildCreateHarness();
    await svc.create(
      "t1",
      {
        type: "PERSON",
        firstName: "A",
        lastName: "B",
        tckn: "11111111110",
        addresses: [{ street: "   ", city: "  ", isPrimary: true }],
      }, { userId: "u1", tenantId: "t1", role: 'ADMIN' },
    );
    expect(tx.clientAddress.createMany).not.toHaveBeenCalled();
  });

  it("[5] C2-I08 E1 — flat kolonlar ARTIK YAZILMAZ: tx.client.create data'sında address/city/district/region/postalCode YOK", async () => {
    const { svc, tx } = buildCreateHarness();
    await svc.create(
      "t1",
      {
        type: "PERSON",
        firstName: "A",
        lastName: "B",
        tckn: "11111111110",
        addresses: [{ street: "Cad 1", city: "İstanbul", isPrimary: true }],
      }, { userId: "u1", tenantId: "t1", role: 'ADMIN' },
    );
    const clientData = tx.client.create.mock.calls[0][0].data;
    for (const flat of ["address", "city", "district", "region", "postalCode"]) {
      expect(clientData[flat]).toBeUndefined();
    }
    // Relational yazım korunur (adresin tek hedefi ClientAddress).
    expect(tx.clientAddress.createMany).toHaveBeenCalledTimes(1);
  });

  it("[5b] C2-I08 E1 — legacy flat-only payload relational girdiye SENTEZLENİR (veri kaybı yok)", async () => {
    const { svc, tx } = buildCreateHarness();
    await svc.create(
      "t1",
      {
        type: "PERSON",
        firstName: "A",
        lastName: "B",
        tckn: "11111111110",
        address: "Eski Mah. 5",
        city: "Ankara",
        district: "Çankaya",
        postalCode: "06000",
      }, { userId: "u1", tenantId: "t1", role: 'ADMIN' },
    );
    const clientData = tx.client.create.mock.calls[0][0].data;
    expect(clientData.address).toBeUndefined();
    expect(clientData.city).toBeUndefined();
    expect(tx.clientAddress.createMany).toHaveBeenCalledTimes(1);
    const rows = tx.clientAddress.createMany.mock.calls[0][0].data;
    expect(rows[0]).toMatchObject({ street: "Eski Mah. 5", city: "Ankara", district: "Çankaya", postalCode: "06000", isPrimary: true });
  });
});

describe("ClientService.update — VER-02 ClientAddress persist (Workspace koruması)", () => {
  it("[6] mevcut ClientAddress satırı 0 → data.addresses[] gerçek tabloya yazılır", async () => {
    const { svc, tx } = buildHarness({ addressCount: 0 });
    await svc.update(
      "c1",
      "t1",
      { type: "PERSON", firstName: "A", lastName: "B", addresses: [{ street: "Yeni Cad", city: "Bursa", isPrimary: true }] }, { userId: "u1", tenantId: "t1", role: 'ADMIN' },
    );
    expect(tx.clientAddress.count).toHaveBeenCalledWith({ where: { clientId: "c1" } });
    expect(tx.clientAddress.createMany).toHaveBeenCalledTimes(1);
    const data = tx.clientAddress.createMany.mock.calls[0][0].data;
    expect(data[0]).toMatchObject({ clientId: "c1", street: "Yeni Cad", city: "Bursa" });
  });

  it("[7] KRİTİK — mevcut ClientAddress satırı VAR (Workspace-yönetimli) → createMany ASLA çağrılmaz, mevcut satırlara dokunulmaz", async () => {
    const { svc, tx } = buildHarness({ addressCount: 2 });
    await svc.update(
      "c1",
      "t1",
      { type: "PERSON", firstName: "A", lastName: "B", addresses: [{ street: "Legacy Form Cad", city: "X", isPrimary: true }] }, { userId: "u1", tenantId: "t1", role: 'ADMIN' },
    );
    expect(tx.clientAddress.count).toHaveBeenCalledWith({ where: { clientId: "c1" } });
    expect(tx.clientAddress.createMany).not.toHaveBeenCalled();
  });

  it("[8] data.addresses hiç gönderilmemiş → tx.clientAddress.count bile çağrılmaz (gereksiz DB hit yok)", async () => {
    const { svc, tx } = buildHarness({ addressCount: 0 });
    await svc.update("c1", "t1", { type: "PERSON", firstName: "A", lastName: "B" }, { userId: "u1", tenantId: "t1", role: 'ADMIN' });
    expect(tx.clientAddress.count).not.toHaveBeenCalled();
    expect(tx.clientAddress.createMany).not.toHaveBeenCalled();
  });

  it("[9] C2-I08 E1 — update flat kolon YAZMAZ: updateMany data'sında address/city/district/region/postalCode YOK (mevcut satır değeri DOKUNULMADAN kalır)", async () => {
    const { svc, tx } = buildHarness({ addressCount: 0 });
    await svc.update(
      "c1",
      "t1",
      { type: "PERSON", firstName: "A", lastName: "B", addresses: [{ street: "Cad X", city: "Adana", isPrimary: true }] }, { userId: "u1", tenantId: "t1", role: 'ADMIN' },
    );
    const clientData = tx.client.updateMany.mock.calls[0][0].data;
    for (const flat of ["address", "city", "district", "region", "postalCode"]) {
      expect(flat in clientData ? clientData[flat] : undefined).toBeUndefined();
    }
  });
});

/**
 * VER-02 — YANILTICI BAŞARI ÖNLEME. Legacy form (settings/clients) /clients LİSTESİNDEN beslenir
 * ve liste projeksiyonu `addresses` İÇERMEZ → yapısal adresin varlığını submit'ten önce bilemez.
 * Bu yüzden gerçeği backend bildirir; sessiz kalması kullanıcının adresi kaydettiğini sanmasına
 * yol açardı.
 */
describe("ClientService.update — VER-02 _addressesSkipped sinyali", () => {
  it("[10] yapısal satır VAR + adres gönderildi → yanıtta _addressesSkipped:true", async () => {
    const { svc } = buildHarness({ addressCount: 2 });
    const res: any = await svc.update(
      "c1",
      "t1",
      { type: "PERSON", firstName: "A", lastName: "B", addresses: [{ street: "Legacy Cad", city: "X", isPrimary: true }] }, { userId: "u1", tenantId: "t1", role: 'ADMIN' },
    );
    expect(res._addressesSkipped).toBe(true);
  });

  it("[11] yapısal satır YOK (adres gerçekten yazıldı) → _addressesSkipped YOK", async () => {
    const { svc } = buildHarness({ addressCount: 0 });
    const res: any = await svc.update(
      "c1",
      "t1",
      { type: "PERSON", firstName: "A", lastName: "B", addresses: [{ street: "Yeni Cad", city: "Bursa", isPrimary: true }] }, { userId: "u1", tenantId: "t1", role: 'ADMIN' },
    );
    expect(res._addressesSkipped).toBeUndefined();
  });

  it("[12] adres HİÇ gönderilmedi (yapısal satır olsa bile) → _addressesSkipped YOK (yanlış alarm yok)", async () => {
    const { svc } = buildHarness({ addressCount: 3 });
    const res: any = await svc.update("c1", "t1", { type: "PERSON", firstName: "A", lastName: "B" }, { userId: "u1", tenantId: "t1", role: 'ADMIN' });
    expect(res._addressesSkipped).toBeUndefined();
  });

  it("[13] yapısal satır VAR fakat gönderilen adresler BOŞ (whitespace) → _addressesSkipped YOK", async () => {
    const { svc } = buildHarness({ addressCount: 2 });
    const res: any = await svc.update(
      "c1",
      "t1",
      { type: "PERSON", firstName: "A", lastName: "B", addresses: [{ street: "  ", city: "  ", isPrimary: true }] }, { userId: "u1", tenantId: "t1", role: 'ADMIN' },
    );
    expect(res._addressesSkipped).toBeUndefined();
  });
});
