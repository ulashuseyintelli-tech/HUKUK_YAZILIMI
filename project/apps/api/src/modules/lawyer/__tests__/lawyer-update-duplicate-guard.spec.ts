/**
 * PR-U1: Avukat UPDATE-path duplicate guard.
 * create guard'ı vardı ama edit yan kapısı açıktı: "Ulaş Telli" açıp sonra "Hüseyin" ekleyerek
 * mükerrer "Ulaş Hüseyin Telli" üretilebiliyordu. Update'te de self-hariç kimlik/isim kontrolü.
 */
import { ConflictException } from "@nestjs/common";
import { LawyerService } from "../lawyer.service";

describe("LawyerService.update — duplicate guard (PR-U1)", () => {
  const build = (selfRecord: any, others: any[]) => {
    const prisma: any = {
      lawyer: {
        findFirst: jest.fn().mockResolvedValue(selfRecord), // findOne(self)
        findMany: jest.fn().mockResolvedValue(others), // diğer aktif kayıtlar (id != self)
        update: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ ...selfRecord, ...data })),
      },
    };
    // K1-4b: LawyerService artık AuditService de alıyor; duplicate-guard testleri delegation'a dokunmaz → audit mock yeter.
    const audit: any = { log: jest.fn().mockResolvedValue(undefined) };
    // L1A: constructor 3. parametre (OfficeApprovalService) aldı; bu testler deactivate'e dokunmaz → boş mock yeter.
    const officeApproval: any = { isApproverEligible: jest.fn() };
    return { svc: new LawyerService(prisma, audit, officeApproval), prisma, audit };
  };
  const self = { id: "self", name: "Ali", surname: "Veli", tckn: null, barNumber: null, isActive: true };

  it("isim değişti + başka aktif kayıtta aynı isim + confirm yok → 409 SIMILAR_NAME_REVIEW", async () => {
    const { svc, prisma } = build(self, [{ id: "o1", name: "Mehmet", surname: "Yılmaz", isActive: true }]);
    await expect(svc.update("t1", "self", { name: "Mehmet", surname: "Yılmaz" })).rejects.toThrow(ConflictException);
    expect(prisma.lawyer.update).not.toHaveBeenCalled();
  });

  it("SIMILAR_NAME_REVIEW gövdesi code + candidates döndürür", async () => {
    const { svc } = build(self, [{ id: "o1", name: "Mehmet", surname: "Yılmaz", isActive: true }]);
    expect.assertions(2);
    try {
      await svc.update("t1", "self", { name: "mehmet", surname: "yılmaz" });
    } catch (e: any) {
      const body = e.getResponse();
      expect(body.code).toBe("SIMILAR_NAME_REVIEW");
      expect(body.candidates).toEqual([{ id: "o1", name: "Mehmet Yılmaz" }]);
    }
  });

  it("isim değişti + confirmSimilarNameUpdate=true → güncellenir (flag prisma'ya yazılmaz)", async () => {
    const { svc, prisma } = build(self, [{ id: "o1", name: "Mehmet", surname: "Yılmaz", isActive: true }]);
    await svc.update("t1", "self", { name: "Mehmet", surname: "Yılmaz", confirmSimilarNameUpdate: true });
    expect(prisma.lawyer.update).toHaveBeenCalled();
    const writtenData = prisma.lawyer.update.mock.calls[0][0].data;
    expect(writtenData.confirmSimilarNameUpdate).toBeUndefined();
    expect(writtenData.name).toBe("Mehmet");
  });

  it("TCKN değişti + başka aktif kayıtta var → 409 DUPLICATE_IDENTITY (confirm GEÇMEZ)", async () => {
    const { svc, prisma } = build(self, [{ id: "o1", name: "X", surname: "Y", tckn: "99999999999", isActive: true }]);
    expect.assertions(2);
    try {
      await svc.update("t1", "self", { tckn: "99999999999", confirmSimilarNameUpdate: true });
    } catch (e: any) {
      expect(e.getResponse().code).toBe("DUPLICATE_IDENTITY");
    }
    expect(prisma.lawyer.update).not.toHaveBeenCalled();
  });

  it("isim değişti ama başka eşleşme yok (self hariç) → güncellenir", async () => {
    const { svc, prisma } = build(self, []);
    await svc.update("t1", "self", { name: "Yeni", surname: "Isim" });
    expect(prisma.lawyer.update).toHaveBeenCalled();
  });

  it("isim/kimlik değişmedi (yalnız telefon) → guard tetiklenmez, güncellenir", async () => {
    const { svc, prisma } = build(self, []);
    await svc.update("t1", "self", { phone: "05551112233" });
    expect(prisma.lawyer.update).toHaveBeenCalled();
    expect(prisma.lawyer.findMany).not.toHaveBeenCalled(); // guard sorgusu hiç çalışmadı
  });
});
