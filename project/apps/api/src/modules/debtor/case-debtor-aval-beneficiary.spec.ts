import { CaseDebtorService } from "./case-debtor.service";

/**
 * K3-L (owner kararı 2026-09-28) — lehine aval bilgisi: yalnız AVAL rolünde, kendisini göstermez, aynı dosyanın ETKİN
 * borçlusunu gösterir; rol AVAL'dan çıkarsa temizlenir. Çek tazminatı sorumluluğu bu bilgiye dayanır.
 */
describe("CaseDebtorService lehine aval bilgisi (K3-L)", () => {
  let prisma: any;
  let audit: any;
  let service: CaseDebtorService;
  const lifecycleGuard = { assertActiveByCaseDebtorId: jest.fn().mockResolvedValue({ lifecycleStatus: "ACTIVE" }) };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      case: { findFirst: jest.fn().mockResolvedValue({ id: "case-1", tenantId: "tenant-1" }) },
      debtor: { findFirst: jest.fn().mockResolvedValue({ id: "aval-1", kepAddress: null, debtorAddresses: [] }) },
      debtorAddress: { findFirst: jest.fn() },
      caseDebtor: { findFirst: jest.fn(), create: jest.fn().mockResolvedValue({ id: "cd-new" }), update: jest.fn() },
    };
    audit = { log: jest.fn() };
    service = new CaseDebtorService(prisma, audit, {} as any, lifecycleGuard as any);
  });

  const codeOf = async (promise: Promise<unknown>) => {
    try {
      await promise;
    } catch (error: any) {
      return error?.response?.code ?? "OTHER";
    }
    return "NO_ERROR";
  };

  describe("addDebtorToCase", () => {
    it("AVAL + aynı dosyanın etkin borçlusu → kaydedilir", async () => {
      prisma.caseDebtor.findFirst
        .mockResolvedValueOnce(null) // aynı rol mükerrer kontrolü
        .mockResolvedValueOnce({ id: "cd-drawer" }); // lehine aval verilen etkin borçlu
      await service.addDebtorToCase("tenant-1", "case-1", { debtorId: "aval-1", role: "AVAL", avalForDebtorId: "drawer-1" } as any);
      expect(prisma.caseDebtor.findFirst).toHaveBeenLastCalledWith({
        where: { caseId: "case-1", debtorId: "drawer-1", lifecycleStatus: "ACTIVE" },
        select: { id: true },
      });
      expect(prisma.caseDebtor.create.mock.calls[0][0].data).toMatchObject({ role: "AVAL", avalForDebtorId: "drawer-1" });
    });

    it.each([
      ["AVAL dışı rol", { role: "CIRANTA", avalForDebtorId: "drawer-1" }, null, "AVAL_BENEFICIARY_ROLE_MISMATCH"],
      ["kendi lehine", { role: "AVAL", avalForDebtorId: "aval-1" }, null, "AVAL_BENEFICIARY_SELF"],
      ["dosyada olmayan / pasif borçlu", { role: "AVAL", avalForDebtorId: "drawer-x" }, null, "AVAL_BENEFICIARY_NOT_IN_CASE"],
    ])("%s → 400 %s, kayıt yok", async (_name, extra, beneficiary, code) => {
      prisma.caseDebtor.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(beneficiary);
      expect(await codeOf(service.addDebtorToCase("tenant-1", "case-1", { debtorId: "aval-1", ...extra } as any))).toBe(code);
      expect(prisma.caseDebtor.create).not.toHaveBeenCalled();
    });

    it("bilgi verilmezse null yazılır (mevcut davranış)", async () => {
      prisma.caseDebtor.findFirst.mockResolvedValueOnce(null);
      await service.addDebtorToCase("tenant-1", "case-1", { debtorId: "aval-1", role: "AVAL" } as any);
      expect(prisma.caseDebtor.create.mock.calls[0][0].data.avalForDebtorId).toBeNull();
    });
  });

  describe("updateCaseDebtor", () => {
    const current = (over: Record<string, unknown> = {}) => ({
      id: "cd-1",
      caseId: "case-1",
      debtorId: "aval-1",
      role: "AVAL",
      avalForDebtorId: "drawer-1",
      ilanenJustification: null,
      debtor: { kepAddress: null },
      case: { id: "case-1" },
      ...over,
    });

    it("rol AVAL'dan çıkarsa lehine aval bilgisi temizlenir ve denetime yazılır", async () => {
      prisma.caseDebtor.findFirst.mockResolvedValueOnce(current()).mockResolvedValueOnce(null);
      prisma.caseDebtor.update.mockResolvedValue({ ...current(), role: "CIRANTA", avalForDebtorId: null });
      await service.updateCaseDebtor("tenant-1", "cd-1", { role: "CIRANTA" } as any, { userId: "u-1" } as any);
      expect(prisma.caseDebtor.update.mock.calls[0][0].data).toMatchObject({ role: "CIRANTA", avalForDebtorId: null });
      const fieldDiff = audit.log.mock.calls[0][0].metadata.fieldDiff.map((d: any) => d.field);
      expect(fieldDiff).toEqual(expect.arrayContaining(["role", "avalForDebtorId"]));
    });

    it("null gönderilirse temizlenir; geçersiz lehine bilgi reddedilir", async () => {
      prisma.caseDebtor.findFirst.mockResolvedValueOnce(current());
      prisma.caseDebtor.update.mockResolvedValue({ ...current(), avalForDebtorId: null });
      await service.updateCaseDebtor("tenant-1", "cd-1", { avalForDebtorId: null } as any);
      expect(prisma.caseDebtor.update.mock.calls[0][0].data.avalForDebtorId).toBeNull();

      prisma.caseDebtor.findFirst.mockResolvedValueOnce(current({ role: "CIRANTA", avalForDebtorId: null }));
      expect(await codeOf(service.updateCaseDebtor("tenant-1", "cd-1", { avalForDebtorId: "drawer-1" } as any))).toBe(
        "AVAL_BENEFICIARY_ROLE_MISMATCH",
      );
      expect(prisma.caseDebtor.update).toHaveBeenCalledTimes(1);
    });
  });
});
