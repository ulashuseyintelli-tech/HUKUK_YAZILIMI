/**
 * PR-D4e-3b/D4e-4/D4e-5 — Haciz öncesi saha istihbaratı SOFT-UYARILARI + risk read-model (read-only, BLOK YOK).
 * D4e-5 sonrası sinyaller: INTEL_90D_MISSING(yalnız VERIFIED_PRESENT sustur) · INTEL_VERIFIED_ABSENT_RECENT ·
 * INTEL_NO_ADDRESS · INTEL_ETEBLIGAT_NO_PHYSICAL_VERIFY · INTEL_ADDRESS_UNVERIFIED.
 * Borçlu adı warning içinde; isValid her zaman true; hiçbir yazma yok.
 */

import { ValidationGateService } from "../validation-gate.service";

/**
 * Result/time-aware prisma mock. debtorIntelligence.count where'ine göre döner:
 *  - result=VERIFIED_PRESENT + addressId  → physicalPresent (S2)
 *  - result=VERIFIED_PRESENT + createdAt  → recentPresent   (S1 suppressor)
 *  - result=VERIFIED_ABSENT  + createdAt  → recentAbsent    (yeni sinyal)
 */
const buildPrisma = (
  caseDebtors: any[],
  opts: { recentPresent?: number; recentAbsent?: number; physicalPresent?: number } = {}
) => ({
  case: { findFirst: jest.fn().mockResolvedValue({ id: "c1" }) },
  caseDebtor: { findMany: jest.fn().mockResolvedValue(caseDebtors) },
  debtorIntelligence: {
    count: jest.fn().mockImplementation(({ where }: any) => {
      if (where.result === "VERIFIED_PRESENT" && where.addressId) return Promise.resolve(opts.physicalPresent ?? 0);
      if (where.result === "VERIFIED_PRESENT") return Promise.resolve(opts.recentPresent ?? 0);
      if (where.result === "VERIFIED_ABSENT") return Promise.resolve(opts.recentAbsent ?? 0);
      return Promise.resolve(0);
    }),
  },
});

const svcWith = (prisma: any) => new ValidationGateService(prisma);

describe("checkPreHacizIntelligence (PR-D4e-3b/4/5)", () => {
  it("eksik borçlu → 90D + e-tebligat-fiziksel-yok + adres-doğrulanmamış, borçlu adıyla; level YUKSEK", async () => {
    const prisma = buildPrisma(
      [
        {
          serviceStatus: "DELIVERED",
          serviceChannel: "UETS",
          debtor: { id: "d1", name: "ABC LTD", debtorAddresses: [{ id: "a1", verified: false, verifiedSource: null }] },
          selectedAddress: { id: "a1", verified: false, verifiedSource: null },
        },
      ],
      { recentPresent: 0, physicalPresent: 0, recentAbsent: 0 }
    ) as any;

    const res = await svcWith(prisma).checkPreHacizIntelligence("t1", "c1");

    expect(res.isValid).toBe(true); // BLOK YOK
    const ids = res.warnings.map((w) => w.id);
    expect(ids).toEqual(expect.arrayContaining(["INTEL_90D_MISSING", "INTEL_ETEBLIGAT_NO_PHYSICAL_VERIFY", "INTEL_ADDRESS_UNVERIFIED"]));
    expect(res.warnings.every((w) => w.severity === "WARNING")).toBe(true);
    expect(res.warnings[0].message).toContain("ABC LTD"); // borçlu adı kırılımı

    expect(res.debtors).toHaveLength(1);
    expect(res.debtors[0]).toMatchObject({ debtorId: "d1", name: "ABC LTD", level: "YUKSEK" });
    expect(res.debtors[0].reasons).toHaveLength(3);
    expect(res.overallLevel).toBe("YUKSEK");
  });

  it("tam doğrulanmış borçlu → 0 warning (recent VERIFIED_PRESENT + NORMAL kanal + verified FIELD adres)", async () => {
    const prisma = buildPrisma(
      [
        {
          serviceStatus: "SENT",
          serviceChannel: "NORMAL",
          debtor: { id: "d2", name: "XYZ", debtorAddresses: [{ id: "a2", verified: true, verifiedSource: "FIELD" }] },
          selectedAddress: { id: "a2", verified: true, verifiedSource: "FIELD" },
        },
      ],
      { recentPresent: 1 }
    ) as any;

    const res = await svcWith(prisma).checkPreHacizIntelligence("t1", "c1");
    expect(res.isValid).toBe(true);
    expect(res.warnings).toHaveLength(0);
    expect(res.debtors).toHaveLength(0); // sinyal yok → UI susar
    expect(res.overallLevel).toBe("YOK");
  });

  it("otoriter (UYAP) verified adres → ADDRESS_UNVERIFIED VERİR (FIELD değil); recent PRESENT ile S1 susar", async () => {
    const prisma = buildPrisma(
      [
        {
          serviceStatus: "SENT",
          serviceChannel: "NORMAL",
          debtor: { id: "d3", name: "Kamu Kurumu", debtorAddresses: [{ id: "a3", verified: true, verifiedSource: "UYAP AA" }] },
          selectedAddress: { id: "a3", verified: true, verifiedSource: "UYAP AA" },
        },
      ],
      { recentPresent: 1 }
    ) as any;

    const res = await svcWith(prisma).checkPreHacizIntelligence("t1", "c1");
    expect(res.warnings.map((w) => w.id)).toEqual(["INTEL_ADDRESS_UNVERIFIED"]);
  });

  it("dosya yoksa → CASE_NOT_FOUND warning, isValid true (blok yok)", async () => {
    const prisma = { case: { findFirst: jest.fn().mockResolvedValue(null) } } as any;
    const res = await svcWith(prisma).checkPreHacizIntelligence("t1", "cX");
    expect(res.isValid).toBe(true);
    expect(res.warnings[0].id).toBe("CASE_NOT_FOUND");
    expect(res.debtors).toHaveLength(0);
    expect(res.overallLevel).toBe("YOK");
  });
});
