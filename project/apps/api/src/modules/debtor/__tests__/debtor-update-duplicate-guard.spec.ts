/**
 * PR-U2: Borçlu UPDATE-path duplicate guard.
 * create guard'ı vardı; update'te kimlik block vardı ama (a) code'suzdu, (b) isim review YOKTU →
 * "Ali Veli" açıp düzenleyip "Mehmet Yılmaz" yaparak mevcut bir borçlunun ikizine dönüştürülebiliyordu.
 */
import { ConflictException } from "@nestjs/common";
import { DebtorService } from "../debtor.service";
import { DebtorType } from "../dto/debtor.dto";

describe("DebtorService.update — duplicate guard (PR-U2)", () => {
  const self = {
    id: "self", type: DebtorType.INDIVIDUAL, firstName: "Ali", lastName: "Veli",
    name: "Ali Veli", tckn: null, vkn: null, detsisNo: null,
  };
  const build = (others: any[], identityDup: any = null) => {
    const prisma: any = {
      debtor: {
        // findOne + syncDebtorTaskByIdSafe → self; checkDuplicateInternal (where.OR) → identityDup
        findFirst: jest.fn().mockImplementation(({ where }: any) =>
          Promise.resolve(where?.OR ? identityDup : self),
        ),
        findMany: jest.fn().mockResolvedValue(others), // isim review adayları (self hariç)
        update: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: "self", ...data })),
      },
    };
    return {
      svc: new DebtorService(
        prisma,
        { logInTransaction: jest.fn().mockResolvedValue(undefined), log: jest.fn().mockResolvedValue(undefined) } as any,
        {} as any,
      ),
      prisma,
    };
  };

  it("isim değişti + başka kayıtta aynı isim + confirm yok → 409 SIMILAR_NAME_REVIEW", async () => {
    const { svc, prisma } = build([{ id: "o1", name: "Mehmet Yılmaz" }]);
    await expect(svc.update("t1", "self", { firstName: "Mehmet", lastName: "Yılmaz" })).rejects.toThrow(ConflictException);
    expect(prisma.debtor.update).not.toHaveBeenCalled();
  });

  it("SIMILAR_NAME_REVIEW gövdesi code + candidates döndürür", async () => {
    const { svc } = build([{ id: "o1", name: "Mehmet Yılmaz" }]);
    expect.assertions(2);
    try {
      await svc.update("t1", "self", { firstName: "mehmet", lastName: "yılmaz" });
    } catch (e: any) {
      const body = e.getResponse();
      expect(body.code).toBe("SIMILAR_NAME_REVIEW");
      expect(body.candidates).toEqual([{ id: "o1", name: "Mehmet Yılmaz" }]);
    }
  });

  it("isim değişti + confirmSimilarNameUpdate=true → güncellenir (flag prisma'ya yazılmaz)", async () => {
    const { svc, prisma } = build([{ id: "o1", name: "Mehmet Yılmaz" }]);
    await svc.update("t1", "self", { firstName: "Mehmet", lastName: "Yılmaz", confirmSimilarNameUpdate: true });
    expect(prisma.debtor.update).toHaveBeenCalled();
    const writtenData = prisma.debtor.update.mock.calls[0][0].data;
    expect(writtenData.confirmSimilarNameUpdate).toBeUndefined();
    expect(writtenData.name).toBe("Mehmet Yılmaz");
  });

  it("kimlik (TCKN) değişti + başka kayıtta var → 409 DUPLICATE_IDENTITY (confirm GEÇMEZ)", async () => {
    const { svc, prisma } = build([], { id: "o1", name: "X", type: DebtorType.INDIVIDUAL });
    expect.assertions(2);
    try {
      await svc.update("t1", "self", { tckn: "99999999999", confirmSimilarNameUpdate: true });
    } catch (e: any) {
      expect(e.getResponse().code).toBe("DUPLICATE_IDENTITY");
    }
    expect(prisma.debtor.update).not.toHaveBeenCalled();
  });

  it("isim değişti ama başka eşleşme yok (self hariç) → güncellenir", async () => {
    const { svc, prisma } = build([]);
    await svc.update("t1", "self", { firstName: "Yeni", lastName: "Isim" });
    expect(prisma.debtor.update).toHaveBeenCalled();
  });

  it("isim/kimlik değişmedi (yalnız telefon) → guard tetiklenmez, güncellenir", async () => {
    const { svc, prisma } = build([]);
    await svc.update("t1", "self", { phone: "05551112233" });
    expect(prisma.debtor.update).toHaveBeenCalled();
    expect(prisma.debtor.findMany).not.toHaveBeenCalled(); // isim review sorgusu hiç çalışmadı
  });
});
