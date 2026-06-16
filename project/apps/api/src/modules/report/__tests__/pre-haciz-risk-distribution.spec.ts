/**
 * D4e-8 — Pre-haciz risk DAĞILIM/TEŞHİS raporu (READ-ONLY ölçüm).
 * Mevcut checkPreHacizIntelligence'ı örneklem dosyalarda yeniden çalıştırıp dağılım üretir.
 * Kalıcı yazım yok, blok yok, ağırlık/eşik değişmez, kör tarama yok (limit cap'li).
 */

import { ReportService } from "../report.service";

const makeRisk = (overallLevel: string, debtors: any[]) => ({ caseId: "c", isValid: true, warnings: [], overallLevel, debtors });

const build = (cases: any[], riskByCase: Record<string, any>, debtorTotal = 0) => {
  const prisma: any = {
    case: { findMany: jest.fn().mockResolvedValue(cases) },
    caseDebtor: { count: jest.fn().mockResolvedValue(debtorTotal) },
  };
  const validationGate: any = {
    checkPreHacizIntelligence: jest.fn().mockImplementation((_t: string, caseId: string) => Promise.resolve(riskByCase[caseId])),
  };
  const svc = new ReportService(prisma, {} as any, validationGate);
  return { svc, prisma, validationGate };
};

describe("ReportService.getPreHacizRiskDistribution", () => {
  it("overallLevel + debtorLevel + reasonId frekansı toplar", async () => {
    const { svc } = build(
      [{ id: "c1" }, { id: "c2" }, { id: "c3" }],
      {
        c1: makeRisk("YUKSEK", [{ debtorId: "d1", name: "A", level: "YUKSEK", reasons: [{ id: "INTEL_ADDRESS_UNVERIFIED" }, { id: "INTEL_90D_MISSING" }] }]),
        c2: makeRisk("ORTA", [{ debtorId: "d2", name: "B", level: "ORTA", reasons: [{ id: "INTEL_90D_MISSING" }] }]),
        c3: makeRisk("YOK", []),
      },
      5,
    );

    const r = await svc.getPreHacizRiskDistribution("t1", {});

    expect(r.scannedCaseCount).toBe(3);
    expect(r.evaluatedCaseCount).toBe(3);
    expect(r.totalDebtorCount).toBe(5);
    expect(r.flaggedDebtorCount).toBe(2);
    expect(r.overallLevelDistribution).toEqual({ YUKSEK: 1, ORTA: 1, DUSUK: 0, YOK: 1 });
    expect(r.debtorLevelDistribution).toEqual({ YUKSEK: 1, ORTA: 1, DUSUK: 0 });
    expect(r.reasonFrequency).toEqual({ INTEL_ADDRESS_UNVERIFIED: 1, INTEL_90D_MISSING: 2 });
  });

  it("limit cap'lenir (default 100, max 500) + status query'si where'e geçer", async () => {
    const { svc, prisma } = build([], {}, 0);

    await svc.getPreHacizRiskDistribution("t1", { limit: 9999, status: "DERDEST" });
    expect(prisma.case.findMany.mock.calls[0][0].take).toBe(500); // cap

    await svc.getPreHacizRiskDistribution("t1", { limit: 0 });
    expect(prisma.case.findMany.mock.calls[1][0].take).toBe(1); // alt sınır

    const whereStatuses = prisma.case.findMany.mock.calls[0][0].where.caseStatus.in;
    expect(whereStatuses).toEqual(["DERDEST"]);
  });

  it("varsayılan statü = DERDEST + ISLEMDE", async () => {
    const { svc, prisma } = build([], {}, 0);
    await svc.getPreHacizRiskDistribution("t1", {});
    expect(prisma.case.findMany.mock.calls[0][0].where.caseStatus.in).toEqual(["DERDEST", "ISLEMDE"]);
  });

  it("best-effort: tek dosya hatası raporu düşürmez (diğerleri sayılır)", async () => {
    const { svc } = build(
      [{ id: "c1" }, { id: "c2" }],
      { c1: makeRisk("YUKSEK", [{ debtorId: "d1", name: "A", level: "YUKSEK", reasons: [] }]) },
      // c2 risk undefined → checkPreHacizIntelligence c2 için undefined döner → erişim hatası → yutulur
    );

    const r = await svc.getPreHacizRiskDistribution("t1", {});
    expect(r.scannedCaseCount).toBe(2);
    expect(r.evaluatedCaseCount).toBe(1); // c2 düştü
    expect(r.overallLevelDistribution.YUKSEK).toBe(1);
  });

  it("hiç dosya yok → boş dağılım, caseDebtor.count çağrılmaz", async () => {
    const { svc, prisma } = build([], {}, 0);
    const r = await svc.getPreHacizRiskDistribution("t1", {});
    expect(r.scannedCaseCount).toBe(0);
    expect(r.totalDebtorCount).toBe(0);
    expect(prisma.caseDebtor.count).not.toHaveBeenCalled();
  });
});
