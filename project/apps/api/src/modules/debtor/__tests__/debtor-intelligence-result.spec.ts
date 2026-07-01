/**
 * PR-D4e-3a — İstihbarat SONUÇ yazma: asimetrik DebtorAddress besleme (computeIntelAddressUpdate)
 * + createIntelligence transaction (kayıt + adres besleme + INTEL görev kapama).
 */

import { DebtorService, computeIntelAddressUpdate } from "../debtor.service";

describe("computeIntelAddressUpdate — asimetrik overwrite (M-c/M-d)", () => {
  it("VERIFIED_PRESENT: verified=true + verifiedSource=FIELD + confidence max(existing,80)", () => {
    expect(computeIntelAddressUpdate({ verified: false, confidenceScore: 50 }, "VERIFIED_PRESENT"))
      .toEqual({ verified: true, verifiedSource: "FIELD", confidenceScore: 80 });
    expect(computeIntelAddressUpdate({ verified: false, confidenceScore: 95 }, "VERIFIED_PRESENT")!.confidenceScore).toBe(95);
  });

  it("VERIFIED_ABSENT + zayıf/FIELD kaynak → verified=false + ADDRESS_SUSPECT + confidence min(existing,20)", () => {
    const r = computeIntelAddressUpdate({ verified: true, verifiedSource: "FIELD", confidenceScore: 90, riskFlags: [] }, "VERIFIED_ABSENT");
    expect(r).toMatchObject({ verified: false, confidenceScore: 20 });
    expect(r!.riskFlags).toContain("ADDRESS_SUSPECT");
  });

  it("VERIFIED_ABSENT + OTORİTER kaynak (UYAP) → verified KÖRLEMESİNE ezilmez (set edilmez)", () => {
    const r = computeIntelAddressUpdate({ verified: true, verifiedSource: "UYAP AA - q1", confidenceScore: 90, riskFlags: [] }, "VERIFIED_ABSENT");
    expect(r).not.toHaveProperty("verified"); // korunur
    expect(r!.riskFlags).toContain("ADDRESS_SUSPECT");
    expect(r!.confidenceScore).toBe(20);
  });

  it("INCONCLUSIVE / NOT_FOUND → adres update YOK (null)", () => {
    expect(computeIntelAddressUpdate({ verified: true }, "INCONCLUSIVE")).toBeNull();
    expect(computeIntelAddressUpdate({ verified: true }, "NOT_FOUND")).toBeNull();
  });

  it("ADDRESS_SUSPECT mükerrer eklenmez", () => {
    const r = computeIntelAddressUpdate({ verified: false, verifiedSource: null, riskFlags: ["ADDRESS_SUSPECT"] }, "VERIFIED_ABSENT");
    expect(r!.riskFlags!.filter((f) => f === "ADDRESS_SUSPECT")).toHaveLength(1);
  });
});

describe("DebtorService.createIntelligence (transaction)", () => {
  const buildPrisma = (over: { debtor?: any; address?: any; task?: any } = {}) => {
    const tx = {
      debtorIntelligence: { create: jest.fn().mockResolvedValue({ id: "intel1" }) },
      debtorAddress: { update: jest.fn().mockResolvedValue({}) },
      task: {
        findUnique: jest.fn().mockResolvedValue(over.task ?? null),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    return {
      _tx: tx,
      debtor: { findFirst: jest.fn().mockResolvedValue("debtor" in over ? over.debtor : { id: "d1" }) },
      debtorAddress: { findFirst: jest.fn().mockResolvedValue("address" in over ? over.address : null) },
      $transaction: jest.fn().mockImplementation(async (cb: any) => cb(tx)),
    };
  };

  it("PRESENT + addressId + açık INTEL görev → kayıt + adres besleme + görev MANUAL COMPLETED", async () => {
    const prisma = buildPrisma({
      address: { id: "a1", verified: false, verifiedSource: null, confidenceScore: 10, riskFlags: [] },
      task: { id: "tk", status: "PENDING" },
    }) as any;
    const svc = new DebtorService(prisma, { logInTransaction: jest.fn().mockResolvedValue(undefined), log: jest.fn().mockResolvedValue(undefined) } as any, {} as any);

    await svc.createIntelligence("t1", "d1", "u9", { addressId: "a1", intelType: "LOCATION_VERIFICATION", result: "VERIFIED_PRESENT", confidence: 95 });

    const intelData = prisma._tx.debtorIntelligence.create.mock.calls[0][0].data;
    expect(intelData).toMatchObject({ tenantId: "t1", debtorId: "d1", addressId: "a1", result: "VERIFIED_PRESENT", createdById: "u9" });
    expect(prisma._tx.debtorAddress.update.mock.calls[0][0].data).toMatchObject({ verified: true, verifiedSource: "FIELD", confidenceScore: 80 });
    expect(prisma._tx.task.update.mock.calls[0][0].data).toMatchObject({ status: "COMPLETED", resolutionType: "MANUAL", completedByUserId: "u9" });
  });

  it("INCONCLUSIVE → yalnız kayıt, adres update YOK", async () => {
    const prisma = buildPrisma({ address: { id: "a1", verified: true, verifiedSource: "UYAP", confidenceScore: 90, riskFlags: [] } }) as any;
    const svc = new DebtorService(prisma, { logInTransaction: jest.fn().mockResolvedValue(undefined), log: jest.fn().mockResolvedValue(undefined) } as any, {} as any);

    await svc.createIntelligence("t1", "d1", "u9", { addressId: "a1", intelType: "LOCATION_VERIFICATION", result: "INCONCLUSIVE" });

    expect(prisma._tx.debtorIntelligence.create).toHaveBeenCalled();
    expect(prisma._tx.debtorAddress.update).not.toHaveBeenCalled();
  });

  it("tenant guard: borçlu yoksa NotFound", async () => {
    const prisma = buildPrisma({ debtor: null }) as any;
    const svc = new DebtorService(prisma, { logInTransaction: jest.fn().mockResolvedValue(undefined), log: jest.fn().mockResolvedValue(undefined) } as any, {} as any);
    await expect(svc.createIntelligence("t1", "dX", "u9", { intelType: "LOCATION_VERIFICATION", result: "IN_FIELD" })).rejects.toThrow();
  });

  it("addressId başka borçluya aitse BadRequest", async () => {
    const prisma = buildPrisma({ debtor: { id: "d1" }, address: null }) as any; // address.findFirst null
    const svc = new DebtorService(prisma, { logInTransaction: jest.fn().mockResolvedValue(undefined), log: jest.fn().mockResolvedValue(undefined) } as any, {} as any);
    await expect(svc.createIntelligence("t1", "d1", "u9", { addressId: "aX", intelType: "LOCATION_VERIFICATION", result: "VERIFIED_PRESENT" })).rejects.toThrow();
  });
});
