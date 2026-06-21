/**
 * M2-G5a — rapor/filtre effectiveOwner rebind (getCasesWithSummary where-building).
 * KURAL: her param KENDİ kolonuna bakar; K1 bridge yok → Lawyer/Staff ↔ User cross-fallback YOK.
 * Legacy sorumluPersonelId paramı eski davranışı KORUR. effectiveOwner fallback'i gösterim/aggregate'e ait.
 */

import { ReportService } from "../report.service";

const build = () => {
  const findMany = jest.fn((..._a: any[]) => Promise.resolve([] as any[]));
  const prisma: any = { case: { findMany } };
  const svc = new ReportService(prisma, {} as any, {} as any);
  return { svc, findMany };
};
const whereOf = (findMany: any) => findMany.mock.calls[0][0].where;

describe("ReportService.getCasesWithSummary — G5a person filter rebind", () => {
  it("(1) responsibleLawyerId → where.responsibleLawyerId (gerçek-kişi avukat kolonu); legacy zorlanmaz", async () => {
    const { svc, findMany } = build();
    await svc.getCasesWithSummary("t1", { responsibleLawyerId: "L1" });
    const where = whereOf(findMany);
    expect(where).toMatchObject({ tenantId: "t1", responsibleLawyerId: "L1" });
    expect(where.sorumluPersonelId).toBeUndefined();
    expect(where.responsibleStaffId).toBeUndefined();
  });

  it("(2) responsibleStaffId → where.responsibleStaffId", async () => {
    const { svc, findMany } = build();
    await svc.getCasesWithSummary("t1", { responsibleStaffId: "S1" });
    const where = whereOf(findMany);
    expect(where).toMatchObject({ tenantId: "t1", responsibleStaffId: "S1" });
    expect(where.responsibleLawyerId).toBeUndefined();
  });

  it("(3) sorumluPersonelId → eski davranış KORUNUR (legacy User kolonu); responsible* ZORLANMAZ", async () => {
    const { svc, findMany } = build();
    await svc.getCasesWithSummary("t1", { sorumluPersonelId: "u9" });
    const where = whereOf(findMany);
    expect(where).toMatchObject({ tenantId: "t1", sorumluPersonelId: "u9" });
    expect(where.responsibleLawyerId).toBeUndefined();
    expect(where.responsibleStaffId).toBeUndefined();
  });

  it("(4) karışık (responsibleLawyerId + sorumluPersonelId) → her ikisi AND, deterministik (cross-bridge YOK)", async () => {
    const { svc, findMany } = build();
    await svc.getCasesWithSummary("t1", { responsibleLawyerId: "L1", sorumluPersonelId: "u9" });
    const where = whereOf(findMany);
    expect(where).toMatchObject({ tenantId: "t1", responsibleLawyerId: "L1", sorumluPersonelId: "u9" });
  });

  it("(5) tenant scope korunur + person filtre yokken owner kolonlarının HİÇBİRİ where'de yok", async () => {
    const { svc, findMany } = build();
    await svc.getCasesWithSummary("t1", {});
    const where = whereOf(findMany);
    expect(where.tenantId).toBe("t1");
    expect(where.sorumluPersonelId).toBeUndefined();
    expect(where.responsibleLawyerId).toBeUndefined();
    expect(where.responsibleStaffId).toBeUndefined();
  });
});
