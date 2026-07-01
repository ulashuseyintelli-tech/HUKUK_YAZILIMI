/**
 * PR-D1 — Debtor.update() computed name/identityNo drift fix.
 * Eski bug: identityNo yalnız ad-alanları değişince hesaplanıyordu → sadece tckn/vkn değişince
 * identityNo eski kalıyordu (tek-kaynak drift). Artık her update'te yeniden hesaplanır.
 */

import { DebtorService } from "../debtor.service";
import { DebtorType } from "../dto/debtor.dto";

const buildPrisma = (existing: any) => ({
  debtor: {
    // 1. çağrı: findOne (mevcut), 2. çağrı: checkDuplicateInternal (dup yok → null)
    findFirst: jest.fn().mockResolvedValueOnce(existing).mockResolvedValueOnce(null),
    update: jest.fn().mockImplementation((args: any) => Promise.resolve({ ...existing, ...args.data })),
  },
});

describe("DebtorService.update — identity/name drift fix", () => {
  it("INDIVIDUAL: sadece TCKN değişince identityNo yeniden hesaplanır (name korunur)", async () => {
    const existing = {
      id: "d1", tenantId: "t1", type: "INDIVIDUAL",
      firstName: "Ali", lastName: "Veli", tckn: "11111111111",
      companyName: null, institutionName: null, deceasedName: null,
      vkn: null, detsisNo: null, deceasedTckn: null,
      name: "Ali Veli", identityNo: "11111111111",
    };
    const prisma = buildPrisma(existing) as any;
    const svc = new DebtorService(prisma, { logInTransaction: jest.fn().mockResolvedValue(undefined), log: jest.fn().mockResolvedValue(undefined) } as any, {} as any);

    await svc.update("t1", "d1", { tckn: "22222222222" } as any);

    const data = prisma.debtor.update.mock.calls[0][0].data;
    expect(data.identityNo).toBe("22222222222"); // DRIFT FIX: artık güncellenir
    expect(data.name).toBe("Ali Veli"); // ad değişmedi → korunur
  });

  it("COMPANY: sadece VKN değişince identityNo yeniden hesaplanır", async () => {
    const existing = {
      id: "d2", tenantId: "t1", type: "COMPANY",
      companyName: "X A.Ş.", vkn: "1111111111",
      firstName: null, lastName: null, institutionName: null, deceasedName: null,
      tckn: null, detsisNo: null, deceasedTckn: null,
      name: "X A.Ş.", identityNo: "1111111111",
    };
    const prisma = buildPrisma(existing) as any;
    const svc = new DebtorService(prisma, { logInTransaction: jest.fn().mockResolvedValue(undefined), log: jest.fn().mockResolvedValue(undefined) } as any, {} as any);

    await svc.update("t1", "d2", { vkn: "2222222222" } as any);

    const data = prisma.debtor.update.mock.calls[0][0].data;
    expect(data.identityNo).toBe("2222222222");
    expect(data.name).toBe("X A.Ş.");
  });

  it("INDIVIDUAL: soyad değişince name yeniden hesaplanır", async () => {
    const existing = {
      id: "d3", tenantId: "t1", type: "INDIVIDUAL",
      firstName: "Ali", lastName: "Veli", tckn: "11111111111",
      companyName: null, institutionName: null, deceasedName: null,
      vkn: null, detsisNo: null, deceasedTckn: null,
      name: "Ali Veli", identityNo: "11111111111",
    };
    const prisma = buildPrisma(existing) as any;
    const svc = new DebtorService(prisma, { logInTransaction: jest.fn().mockResolvedValue(undefined), log: jest.fn().mockResolvedValue(undefined) } as any, {} as any);

    await svc.update("t1", "d3", { lastName: "Yılmaz" } as any);

    const data = prisma.debtor.update.mock.calls[0][0].data;
    expect(data.name).toBe("Ali Yılmaz");
    expect(data.identityNo).toBe("11111111111"); // tckn değişmedi → korunur
  });
});
