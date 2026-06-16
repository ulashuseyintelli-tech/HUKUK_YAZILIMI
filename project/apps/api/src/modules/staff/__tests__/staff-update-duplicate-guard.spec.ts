/**
 * PR-U3: Personel UPDATE-path duplicate guard.
 * create guard (#134) vardı ama staff.service.update'te HİÇ guard yoktu → edit ile mükerrer
 * ("Ali Veli" açıp düzenleyip "Mehmet Yılmaz" yaparak mevcut personelin ikizine dönüştürme).
 */
import { ConflictException } from "@nestjs/common";
import { StaffService } from "../staff.service";

describe("StaffService.update — duplicate guard (PR-U3)", () => {
  const self = { id: "self", firstName: "Ali", lastName: "Veli", tckn: null };
  const build = (others: any[]) => {
    const prisma: any = {
      staffMember: {
        findFirst: jest.fn().mockResolvedValue(self), // mevcut kayıt
        findMany: jest.fn().mockResolvedValue(others), // diğer aktif kayıtlar (id != self)
        update: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: "self", ...data })),
      },
    };
    return { svc: new StaffService(prisma), prisma };
  };

  it("isim değişti + başka aktif kayıtta aynı isim + confirm yok → 409 SIMILAR_NAME_REVIEW", async () => {
    const { svc, prisma } = build([{ id: "o1", firstName: "Mehmet", lastName: "Yılmaz", isActive: true }]);
    await expect(svc.update("self", "t1", { firstName: "Mehmet", lastName: "Yılmaz" })).rejects.toThrow(ConflictException);
    expect(prisma.staffMember.update).not.toHaveBeenCalled();
  });

  it("SIMILAR_NAME_REVIEW gövdesi code + candidates döndürür", async () => {
    const { svc } = build([{ id: "o1", firstName: "Mehmet", lastName: "Yılmaz", isActive: true }]);
    expect.assertions(2);
    try {
      await svc.update("self", "t1", { firstName: "mehmet", lastName: "yılmaz" });
    } catch (e: any) {
      const body = e.getResponse();
      expect(body.code).toBe("SIMILAR_NAME_REVIEW");
      expect(body.candidates).toEqual([{ id: "o1", name: "Mehmet Yılmaz" }]);
    }
  });

  it("isim değişti + confirmSimilarNameUpdate=true → güncellenir (flag prisma'ya yazılmaz)", async () => {
    const { svc, prisma } = build([{ id: "o1", firstName: "Mehmet", lastName: "Yılmaz", isActive: true }]);
    await svc.update("self", "t1", { firstName: "Mehmet", lastName: "Yılmaz", confirmSimilarNameUpdate: true });
    expect(prisma.staffMember.update).toHaveBeenCalled();
    const writtenData = prisma.staffMember.update.mock.calls[0][0].data;
    expect(writtenData.confirmSimilarNameUpdate).toBeUndefined();
    expect(writtenData.firstName).toBe("Mehmet");
  });

  it("TCKN değişti + başka aktif kayıtta var → 409 DUPLICATE_IDENTITY (confirm GEÇMEZ)", async () => {
    const { svc, prisma } = build([{ id: "o1", firstName: "X", lastName: "Y", tckn: "99999999999", isActive: true }]);
    expect.assertions(2);
    try {
      await svc.update("self", "t1", { tckn: "99999999999", confirmSimilarNameUpdate: true });
    } catch (e: any) {
      expect(e.getResponse().code).toBe("DUPLICATE_IDENTITY");
    }
    expect(prisma.staffMember.update).not.toHaveBeenCalled();
  });

  it("isim değişti ama başka eşleşme yok (self hariç) → güncellenir", async () => {
    const { svc, prisma } = build([]);
    await svc.update("self", "t1", { firstName: "Yeni", lastName: "Isim" });
    expect(prisma.staffMember.update).toHaveBeenCalled();
  });

  it("isim/kimlik değişmedi (yalnız telefon) → guard tetiklenmez, güncellenir", async () => {
    const { svc, prisma } = build([]);
    await svc.update("self", "t1", { phone: "05551112233" });
    expect(prisma.staffMember.update).toHaveBeenCalled();
    expect(prisma.staffMember.findMany).not.toHaveBeenCalled(); // guard sorgusu hiç çalışmadı
  });
});
