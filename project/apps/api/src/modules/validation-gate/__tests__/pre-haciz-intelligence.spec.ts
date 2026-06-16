/**
 * PR-D4e-3b — Haciz öncesi saha istihbaratı SOFT-UYARILARI (read-only, BLOK YOK).
 * 3 sinyal: INTEL_90D_MISSING · INTEL_ETEBLIGAT_NO_PHYSICAL_VERIFY · INTEL_ADDRESS_UNVERIFIED.
 * Borçlu adı warning içinde; isValid her zaman true; hiçbir yazma yok.
 */

import { ValidationGateService } from "../validation-gate.service";

const buildPrisma = (caseDebtors: any[], opts: { recent?: number; physical?: number } = {}) => ({
  case: { findFirst: jest.fn().mockResolvedValue({ id: "c1" }) },
  caseDebtor: { findMany: jest.fn().mockResolvedValue(caseDebtors) },
  debtorIntelligence: {
    count: jest.fn().mockImplementation(({ where }: any) =>
      Promise.resolve(where.result === "VERIFIED_PRESENT" ? (opts.physical ?? 0) : (opts.recent ?? 0))
    ),
  },
});

const svcWith = (prisma: any) => {
  const s = new ValidationGateService(prisma);
  return s;
};

describe("checkPreHacizIntelligence (PR-D4e-3b)", () => {
  it("eksik borçlu → 3 warning (90D + e-tebligat-fiziksel-yok + adres-doğrulanmamış), borçlu adıyla", async () => {
    const prisma = buildPrisma([
      {
        serviceStatus: "DELIVERED",
        serviceChannel: "UETS",
        debtor: { id: "d1", name: "ABC LTD", debtorAddresses: [{ id: "a1", verified: false, verifiedSource: null }] },
        selectedAddress: { id: "a1", verified: false, verifiedSource: null },
      },
    ], { recent: 0, physical: 0 }) as any;

    const res = await svcWith(prisma).checkPreHacizIntelligence("t1", "c1");

    expect(res.isValid).toBe(true); // BLOK YOK
    const ids = res.warnings.map((w) => w.id);
    expect(ids).toEqual(expect.arrayContaining(["INTEL_90D_MISSING", "INTEL_ETEBLIGAT_NO_PHYSICAL_VERIFY", "INTEL_ADDRESS_UNVERIFIED"]));
    expect(res.warnings.every((w) => w.severity === "WARNING")).toBe(true);
    expect(res.warnings[0].message).toContain("ABC LTD"); // borçlu adı kırılımı

    // PR-D4e-4: risk read-model zenginleşmesi (warnings[] geriye uyum için KORUNUR)
    expect(res.debtors).toHaveLength(1);
    expect(res.debtors[0]).toMatchObject({ debtorId: "d1", name: "ABC LTD", level: "YUKSEK" }); // 2×HIGH+1×MEDIUM
    expect(res.debtors[0].reasons).toHaveLength(3);
    expect(res.overallLevel).toBe("YUKSEK");
  });

  it("tam doğrulanmış borçlu → 0 warning (recent intel + NORMAL kanal + verified FIELD adres)", async () => {
    const prisma = buildPrisma([
      {
        serviceStatus: "SENT",
        serviceChannel: "NORMAL",
        debtor: { id: "d2", name: "XYZ", debtorAddresses: [{ id: "a2", verified: true, verifiedSource: "FIELD" }] },
        selectedAddress: { id: "a2", verified: true, verifiedSource: "FIELD" },
      },
    ], { recent: 1 }) as any;

    const res = await svcWith(prisma).checkPreHacizIntelligence("t1", "c1");
    expect(res.isValid).toBe(true);
    expect(res.warnings).toHaveLength(0);
    // PR-D4e-4: sinyal yok → debtors boş, overall YOK (UI susar)
    expect(res.debtors).toHaveLength(0);
    expect(res.overallLevel).toBe("YOK");
  });

  it("otoriter (UYAP) verified adres → ADDRESS_UNVERIFIED FİRELENİR (FIELD değil ama verified=true+kaynak güçlü)", async () => {
    // verifiedSource='UYAP' && verified=true → kural: verifiedSource !== 'FIELD' → uyarı VERİR (fiili saha teyidi ayrı eksen).
    const prisma = buildPrisma([
      {
        serviceStatus: "SENT",
        serviceChannel: "NORMAL",
        debtor: { id: "d3", name: "Kamu Kurumu", debtorAddresses: [{ id: "a3", verified: true, verifiedSource: "UYAP AA" }] },
        selectedAddress: { id: "a3", verified: true, verifiedSource: "UYAP AA" },
      },
    ], { recent: 1 }) as any;

    const res = await svcWith(prisma).checkPreHacizIntelligence("t1", "c1");
    expect(res.warnings.map((w) => w.id)).toEqual(["INTEL_ADDRESS_UNVERIFIED"]);
  });

  it("dosya yoksa → CASE_NOT_FOUND warning, isValid true (blok yok)", async () => {
    const prisma = { case: { findFirst: jest.fn().mockResolvedValue(null) } } as any;
    const res = await svcWith(prisma).checkPreHacizIntelligence("t1", "cX");
    expect(res.isValid).toBe(true);
    expect(res.warnings[0].id).toBe("CASE_NOT_FOUND");
  });
});
