/**
 * PR-U4: Müvekkil UPDATE-path kimlik-block.
 * client.service.update'te guard YOKTU. Müvekkilde TCKN zorunlu/kesin → isim-review YOK;
 * yalnız kesin kimlik (TCKN/VKN) collision block (self hariç, aktif, kimlik gerçekten değişince).
 *
 * C0-a: update happy-path artık $transaction içinde + audit. Dup-block transaction'dan ÖNCE çalışır.
 */
import { ConflictException } from "@nestjs/common";
import { ClientService } from "../client.service";

describe("ClientService.update — kimlik-block (PR-U4)", () => {
  const existing = {
    id: "self", type: "INDIVIDUAL", tckn: "11111111111", vkn: null,
    identityNo: "11111111111", name: "Ali Veli", displayName: "Ali Veli", contactFollowUpStatus: null,
    contacts: [],
  };
  const build = (dup: any = null) => {
    const tx = {
      client: {
        update: jest.fn().mockResolvedValue({}),
        // Task1 (#656): update() artık tenant-scoped updateMany + re-fetch findFirst kullanıyor.
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findFirst: jest.fn().mockResolvedValue({ id: "self" }),
      },
      clientContact: { deleteMany: jest.fn().mockResolvedValue({}), createMany: jest.fn().mockResolvedValue({}) },
    };
    const prisma: any = {
      client: {
        // where.OR → kimlik dup sorgusu; aksi halde existing (findOne + ilk fetch)
        findFirst: jest.fn().mockImplementation(({ where }: any) => Promise.resolve(where?.OR ? dup : existing)),
        update: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn().mockImplementation(async (cb: any) => cb(tx)),
    };
    const audit = { logInTransaction: jest.fn().mockResolvedValue(undefined) };
    return { svc: new ClientService(prisma, audit as any), prisma, tx, audit };
  };

  it("TCKN değişti + başka aktif müvekkilde var → 409 DUPLICATE_IDENTITY (mutation yok)", async () => {
    const { svc, prisma } = build({ id: "o1", displayName: "Başka Müvekkil" });
    await expect(svc.update("self", "t1", { type: "INDIVIDUAL", tckn: "22222222222" })).rejects.toThrow(ConflictException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("DUPLICATE_IDENTITY gövdesi code + existingClient döndürür", async () => {
    const { svc } = build({ id: "o1", displayName: "Başka Müvekkil" });
    expect.assertions(2);
    try {
      await svc.update("self", "t1", { type: "INDIVIDUAL", tckn: "22222222222" });
    } catch (e: any) {
      const body = e.getResponse();
      expect(body.code).toBe("DUPLICATE_IDENTITY");
      expect(body.existingClient).toEqual({ id: "o1", name: "Başka Müvekkil" });
    }
  });

  it("VKN değişti + başka aktif müvekkilde var → 409 DUPLICATE_IDENTITY (mutation yok)", async () => {
    const { svc, prisma } = build({ id: "o2", displayName: "Şirket A.Ş." });
    await expect(svc.update("self", "t1", { type: "COMPANY", vkn: "3333333333" })).rejects.toThrow(ConflictException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("kimlik değişti ama başka eşleşme yok (self hariç) → güncellenir (tx + audit)", async () => {
    const { svc, tx, audit } = build(null);
    await svc.update("self", "t1", { type: "INDIVIDUAL", tckn: "22222222222" });
    expect(tx.client.updateMany).toHaveBeenCalled();
    expect(audit.logInTransaction).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ action: "CLIENT_UPDATE", entityId: "self" }),
    );
  });

  it("kimlik değişmedi (yalnız telefon) → guard tetiklenmez, güncellenir", async () => {
    const { svc, tx } = build({ id: "o1" });
    await svc.update("self", "t1", { type: "INDIVIDUAL", phone: "05551112233" });
    expect(tx.client.updateMany).toHaveBeenCalled();
  });

  it("isim değişti ama kimlik aynı → MÜVEKKİLDE isim-review YOK → güncellenir", async () => {
    const { svc, tx } = build({ id: "o1" });
    await svc.update("self", "t1", { type: "INDIVIDUAL", firstName: "Yeni", lastName: "Isim", tckn: "11111111111" });
    expect(tx.client.updateMany).toHaveBeenCalled();
  });
});
