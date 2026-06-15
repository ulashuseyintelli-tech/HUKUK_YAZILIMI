/**
 * PR-D2b — Tereke (ESTATE) update: estateHeirs atomik replace (deleteMany+create) + deceasedName
 * değişince name/identityNo recompute. Ayrı endpoint yok; Debtor.update() içinde transaction.
 */

import { DebtorService } from "../debtor.service";

const buildEstatePrisma = (existing: any) => {
  const tx = {
    estateHeir: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
    debtor: { update: jest.fn().mockImplementation((a: any) => Promise.resolve({ ...existing, ...a.data })) },
  };
  return {
    _tx: tx,
    debtor: {
      findFirst: jest.fn().mockResolvedValueOnce(existing).mockResolvedValueOnce(null),
      update: jest.fn().mockImplementation((a: any) => Promise.resolve({ ...existing, ...a.data })),
    },
    $transaction: jest.fn().mockImplementation(async (cb: any) => cb(tx)),
  };
};

const estateExisting = {
  id: "e1", tenantId: "t1", type: "ESTATE",
  deceasedName: "Ahmet Yılmaz", deceasedTckn: "11111111111",
  firstName: null, lastName: null, companyName: null, institutionName: null,
  tckn: null, vkn: null, detsisNo: null,
  name: "Ahmet Yılmaz Mirasçıları", identityNo: "11111111111",
};

describe("DebtorService.update — ESTATE (PR-D2b)", () => {
  it("estateHeirs gönderilince: deleteMany + create AYNI transaction'da, scalar update ile", async () => {
    const prisma = buildEstatePrisma(estateExisting) as any;
    const svc = new DebtorService(prisma);

    await svc.update("t1", "e1", {
      estateHeirs: [
        { name: "Mirasçı 1", tckn: "22222222222", address: "Adres 1" },
        { name: "Mirasçı 2" },
      ],
    } as any);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma._tx.estateHeir.deleteMany).toHaveBeenCalledWith({ where: { debtorId: "e1" } });
    const data = prisma._tx.debtor.update.mock.calls[0][0].data;
    expect(data.estateHeirs.create).toHaveLength(2);
    expect(data.estateHeirs.create[0]).toMatchObject({ name: "Mirasçı 1", tckn: "22222222222", address: "Adres 1" });
    expect(data.estateHeirs.create[1].address).toBe(""); // zorunlu alan → fallback ""
    // Scalar update aynı transaction debtor.update'inde (ayrı prisma.debtor.update YOK)
    expect(prisma.debtor.update).not.toHaveBeenCalled();
  });

  it("deceasedName değişince name/identityNo recompute (X Mirasçıları formatı)", async () => {
    const prisma = buildEstatePrisma(estateExisting) as any;
    const svc = new DebtorService(prisma);

    await svc.update("t1", "e1", { deceasedName: "Mehmet Demir", deceasedTckn: "33333333333", estateHeirs: [{ name: "M" }] } as any);

    const data = prisma._tx.debtor.update.mock.calls[0][0].data;
    expect(data.name).toBe("Mehmet Demir Mirasçıları");
    expect(data.identityNo).toBe("33333333333");
  });

  it("estateHeirs GÖNDERİLMEZSE transaction kullanılmaz, mirasçılara dokunulmaz", async () => {
    const prisma = buildEstatePrisma(estateExisting) as any;
    const svc = new DebtorService(prisma);

    await svc.update("t1", "e1", { deceasedName: "Yeni Ad" } as any);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.debtor.update).toHaveBeenCalledTimes(1); // düz scalar update
    const data = prisma.debtor.update.mock.calls[0][0].data;
    expect(data.name).toBe("Yeni Ad Mirasçıları");
    expect(data.estateHeirs).toBeUndefined();
  });
});
