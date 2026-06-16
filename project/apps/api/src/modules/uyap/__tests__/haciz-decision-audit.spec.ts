/**
 * PR-D4e-6 — Haciz gönderim anında BACKEND-otoriter risk snapshot AuditLog'a yazılır (karar-anı izi).
 * Net sınır: blok yok, best-effort (audit hatası haczi kesmez), canlı skor persist'i DEĞİL.
 */

import { UyapService } from "../uyap.service";

const buildRisk = () => ({
  caseId: "c1",
  isValid: true,
  warnings: [],
  overallLevel: "YUKSEK",
  debtors: [
    { debtorId: "d1", name: "ABC LTD", level: "YUKSEK", score: 80, reasons: [{ id: "INTEL_ADDRESS_UNVERIFIED", message: "x", severity: "HIGH" }, { id: "INTEL_90D_MISSING", message: "y", severity: "MEDIUM" }] },
  ],
});

const build = (riskImpl?: any) => {
  const prisma: any = {
    uyapRequestLog: {
      create: jest.fn().mockResolvedValue({ id: "req1" }),
      update: jest.fn().mockResolvedValue({}),
    },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  };
  const validationGate: any = {
    checkPreHacizIntelligence: riskImpl || jest.fn().mockResolvedValue(buildRisk()),
  };
  const svc = new UyapService(prisma, {} as any, validationGate); // casePolicyEngine yok → CPE atlanır
  return { svc, prisma, validationGate };
};

const req = (over: any = {}) => ({
  caseId: "c1",
  targetType: "BANK" as const,
  targetDetails: { assetId: "a1" },
  amount: 1000,
  tenantId: "t1",
  userId: "u1",
  skipPoaCheck: true,
  ...over,
});

describe("UyapService.pushHacizRequest — D4e-6 karar-anı audit", () => {
  it("submission anında riski YENİDEN hesaplar + AuditLog'a snapshot yazar", async () => {
    const { svc, prisma, validationGate } = build();

    const res = await svc.pushHacizRequest(req());

    expect(res.success).toBe(true);
    expect(validationGate.checkPreHacizIntelligence).toHaveBeenCalledWith("t1", "c1");

    const audit = prisma.auditLog.create.mock.calls[0][0].data;
    expect(audit).toMatchObject({
      tenantId: "t1",
      action: "HACIZ_REQUEST_SUBMITTED",
      entityType: "CASE",
      entityId: "c1",
      userId: "u1",
    });
    expect(audit.metadata.overallLevel).toBe("YUKSEK");
    expect(audit.metadata.debtors).toEqual([
      { debtorId: "d1", name: "ABC LTD", level: "YUKSEK", reasonIds: ["INTEL_ADDRESS_UNVERIFIED", "INTEL_90D_MISSING"] },
    ]);
    expect(audit.metadata.uyapRequestId).toBe("req1");
    expect(audit.metadata.targetType).toBe("BANK");
  });

  it("userId yoksa SYSTEM aktör (otomasyon/retry yolu)", async () => {
    const { svc, prisma } = build();

    await svc.pushHacizRequest(req({ userId: undefined }));

    const audit = prisma.auditLog.create.mock.calls[0][0].data;
    expect(audit.userId).toBeNull();
    expect(audit.userName).toBe("SYSTEM");
  });

  it("BEST-EFFORT: risk hesabı patlasa da haciz BAŞARILI (audit yutulur)", async () => {
    const { svc, prisma } = build(jest.fn().mockRejectedValue(new Error("boom")));

    const res = await svc.pushHacizRequest(req());

    expect(res.success).toBe(true); // haciz kesilmez
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("BEST-EFFORT: AuditLog yazımı patlasa da haciz BAŞARILI", async () => {
    const { svc, prisma } = build();
    prisma.auditLog.create.mockRejectedValueOnce(new Error("db down"));

    const res = await svc.pushHacizRequest(req());
    expect(res.success).toBe(true);
  });

  it("tenantId yoksa audit atlanır ama haciz BAŞARILI", async () => {
    const { svc, prisma, validationGate } = build();

    const res = await svc.pushHacizRequest(req({ tenantId: undefined }));

    expect(res.success).toBe(true);
    expect(validationGate.checkPreHacizIntelligence).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("logRequest transport log'una caseId set edilir (D6-Q5)", async () => {
    const { svc, prisma } = build();

    await svc.pushHacizRequest(req());

    expect(prisma.uyapRequestLog.create.mock.calls[0][0].data.caseId).toBe("c1");
  });
});
