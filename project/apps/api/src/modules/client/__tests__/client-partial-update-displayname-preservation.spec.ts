/**
 * C1-B02 (FIND-C1, CLAUDE-CLIENT-C1): partial-update `displayName`/`name` veri kaybı.
 *
 * Kusur (characterization ÖNCE KIRMIZI): `update()` displayName'i KOŞULSUZ olarak
 * `data.type`/`data.companyName`/`data.firstName`/`data.lastName`'den yeniden hesaplar ve
 * KOŞULSUZ yazar. Standart-only bir update (ör. `{phone}`) `data.type`'ı undefined bırakır
 * → `''` hesaplanır → SENSITIVE sınıfındaki `displayName` elevated yetki olmadan BOŞ
 * string ile ezilir. Partial-sensitive yasak olduğu için (policy D02) elevated olmayan
 * kullanıcılar tam bu yola itilir — köşe vaka değil, normal edit yolu.
 *
 * Beklenen davranış (fix sonrası YEŞİL):
 *  - Standart-only ve lifecycle-only payload displayName/name'e HİÇ dokunmaz
 *    (updateMany data'sında undefined → Prisma "dokunma" semantiği).
 *  - Kimlik-türeten alanlardan biri (type/companyName/firstName/lastName) GERÇEKTEN
 *    gönderildiğinde displayName yeniden hesaplanır; eksik bileşenler MEVCUT kayıttan
 *    tamamlanır (kısmi kimlik payload'unun boş bileşenle silmesi de aynı veri kaybıdır).
 *  - Tam form davranışı (tüm kimlik alanları gönderilir) DEĞİŞMEZ.
 */
import { ClientService } from "../client.service";

describe("ClientService.update — FIND-C1 displayName/name koruması (C1-B02)", () => {
  const existingPerson = {
    id: "self",
    type: "PERSON",
    firstName: "Ali",
    lastName: "Veli",
    companyName: null,
    tckn: "11111111111",
    vkn: null,
    identityNo: "11111111111",
    name: "Ali Veli",
    displayName: "Ali Veli",
    isActive: true,
    contactFollowUpStatus: null,
    contacts: [],
  };
  const existingCompany = {
    id: "self",
    type: "COMPANY",
    firstName: null,
    lastName: null,
    companyName: "Delta İnşaat A.Ş.",
    tckn: null,
    vkn: "1234567912",
    identityNo: "1234567912",
    name: "Delta İnşaat A.Ş.",
    displayName: "Delta İnşaat A.Ş.",
    isActive: true,
    contactFollowUpStatus: null,
    contacts: [],
  };

  const build = (existing: any) => {
    const tx = {
      client: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findFirst: jest.fn().mockResolvedValue({ id: existing.id }),
      },
      clientContact: {
        deleteMany: jest.fn().mockResolvedValue({}),
        createMany: jest.fn().mockResolvedValue({}),
      },
    };
    const prisma: any = {
      client: {
        // where.OR → kimlik dup sorgusu (null = eşleşme yok); aksi hâlde existing snapshot.
        findFirst: jest
          .fn()
          .mockImplementation(({ where }: any) => Promise.resolve(where?.OR ? null : existing)),
      },
      $transaction: jest.fn().mockImplementation(async (cb: any) => cb(tx)),
    };
    const audit = { logInTransaction: jest.fn().mockResolvedValue(undefined) };
    const officeApproval = { isApproverEligible: jest.fn().mockResolvedValue(true) };
    const svc = new ClientService(prisma, audit as any, officeApproval as any);
    const writtenData = () => tx.client.updateMany.mock.calls[0][0].data;
    return { svc, tx, writtenData };
  };

  const actorUser = { userId: "u1", tenantId: "t1", role: "USER" } as any;
  const actorAdmin = { userId: "u1", tenantId: "t1", role: "ADMIN" } as any;

  it("standart-only update ({phone}): displayName ve name YAZILMAZ (undefined → dokunma)", async () => {
    const { svc, writtenData } = build(existingPerson);
    await svc.update("self", "t1", { phone: "05551112233" }, actorUser);
    const data = writtenData();
    expect(data.displayName).toBeUndefined();
    expect(data.name).toBeUndefined();
  });

  it("lifecycle-only update ({isActive:false}): displayName ve name YAZILMAZ", async () => {
    const { svc, writtenData } = build(existingPerson);
    await svc.update("self", "t1", { isActive: false }, actorAdmin);
    const data = writtenData();
    expect(data.displayName).toBeUndefined();
    expect(data.name).toBeUndefined();
    expect(data.isActive).toBe(false);
  });

  it("kısmi kimlik ({firstName}): eksik bileşen MEVCUT kayıttan tamamlanır → 'Yeni Veli'", async () => {
    const { svc, writtenData } = build(existingPerson);
    await svc.update("self", "t1", { firstName: "Yeni" }, actorAdmin);
    const data = writtenData();
    expect(data.displayName).toBe("Yeni Veli");
    expect(data.name).toBe("Yeni Veli");
  });

  it("kısmi kimlik ({companyName}, type GÖNDERİLMEDEN): mevcut COMPANY tipiyle hesaplanır", async () => {
    const { svc, writtenData } = build(existingCompany);
    await svc.update("self", "t1", { companyName: "Yeni Delta A.Ş." }, actorAdmin);
    const data = writtenData();
    expect(data.displayName).toBe("Yeni Delta A.Ş.");
    expect(data.name).toBe("Yeni Delta A.Ş.");
  });

  it("tam form (PERSON, tüm kimlik alanları): mevcut davranış DEĞİŞMEZ", async () => {
    const { svc, writtenData } = build(existingPerson);
    await svc.update(
      "self",
      "t1",
      { type: "PERSON", firstName: "Mehmet", lastName: "Akın", tckn: "11111111111" },
      actorAdmin,
    );
    const data = writtenData();
    expect(data.displayName).toBe("Mehmet Akın");
    expect(data.name).toBe("Mehmet Akın");
  });

  it("tam form (COMPANY): displayName=companyName (regresyon)", async () => {
    const { svc, writtenData } = build(existingCompany);
    await svc.update(
      "self",
      "t1",
      { type: "COMPANY", companyName: "Delta İnşaat A.Ş.", vkn: "1234567912" },
      actorAdmin,
    );
    const data = writtenData();
    expect(data.displayName).toBe("Delta İnşaat A.Ş.");
    expect(data.name).toBe("Delta İnşaat A.Ş.");
  });

  it("yalnız {name} gönderilirse: name yazılır, displayName'e DOKUNULMAZ", async () => {
    const { svc, writtenData } = build(existingPerson);
    await svc.update("self", "t1", { name: "Serbest Ad" }, actorAdmin);
    const data = writtenData();
    expect(data.displayName).toBeUndefined();
    expect(data.name).toBe("Serbest Ad");
  });
});
