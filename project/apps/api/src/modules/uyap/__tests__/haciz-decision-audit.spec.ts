/**
 * PR-D4e-6 — Haciz gönderim anında BACKEND-otoriter risk snapshot AuditLog'a yazılır (karar-anı izi).
 * Net sınır: blok yok, best-effort (audit hatası haczi kesmez), canlı skor persist'i DEĞİL.
 */

import { UyapService } from "../uyap.service";
// DEBTOR-UYAP-HACIZ-TENANT-GUARD-P1-I02 FIXTURE YUKSELTMESI (assertion ZAYIFLATILMADI):
// UYAP hukuki gonderim yollari artik KOSULSUZ olarak dosya sahipligi + gecerli vekalet
// ister. Bu spec'lerin amaci yetki DEGIL (transport truthfulness / evidence / log ownership
// / audit); dolayisiyla fixture yetkili bir baglam saglar. Yetki davranisinin KENDISI
// uyap-legal-authority-tenant-guard.spec.ts icinde ayrica ve tam olarak test edilir.
const AUTHORIZED_CASE = {
  id: 'c1',
  tenantId: 'tenant-A',
  caseClients: [{ clientId: 'client-1', client: { id: 'client-1' } }],
  lawyers: [{ lawyerId: 'lawyer-1', lawyer: { id: 'lawyer-1' } }],
};
const buildAuthorizedPoaService = () => ({
  checkValidPoa: jest.fn().mockResolvedValue({ isValid: true, message: 'ok' }),
});
const buildAuthorizedCaseFindFirst = () =>
  jest.fn(async (args: any) => ({ ...AUTHORIZED_CASE, id: args?.where?.id ?? 'c1' }));


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
    case: { findFirst: buildAuthorizedCaseFindFirst() },
    uyapRequestLog: {
      create: jest.fn().mockResolvedValue({ id: "req1" }),
      update: jest.fn().mockResolvedValue({}),
    },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  };
  const validationGate: any = {
    checkPreHacizIntelligence: riskImpl || jest.fn().mockResolvedValue(buildRisk()),
  };
  // I15-D1: triggerHacizAuthorization — bu dosyanın odağı CPE-yok senaryosudur; casePolicyEngine
  // hâlâ kasıtlı undefined (CPE atlanır), yalnız yeni zorunlu authority mock'u eklenir.
  const svc = new UyapService(
    prisma,
    buildAuthorizedPoaService() as any,
    validationGate,
    { report: jest.fn() } as any,
    undefined,
    undefined,
    undefined,
    {
      assertAuthorized: jest.fn(async () => ({ debtorId: 'debtor-default' })),
      revalidateCaseDebtorFreshness: jest.fn(async () => undefined),
    } as any,
  ); // casePolicyEngine yok → CPE atlanır
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

    // CLIENT-SEC-H2C-P02-R1: 2. arg = trusted execution tenant (authenticated context).
    const res = await svc.pushHacizRequest(req(), "t1");

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

    await svc.pushHacizRequest(req({ userId: undefined }), "t1");

    const audit = prisma.auditLog.create.mock.calls[0][0].data;
    expect(audit.userId).toBeNull();
    expect(audit.userName).toBe("SYSTEM");
  });

  it("BEST-EFFORT: risk hesabı patlasa da haciz BAŞARILI (audit yutulur)", async () => {
    const { svc, prisma } = build(jest.fn().mockRejectedValue(new Error("boom")));

    const res = await svc.pushHacizRequest(req(), "t1");

    expect(res.success).toBe(true); // haciz kesilmez
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("BEST-EFFORT: AuditLog yazımı patlasa da haciz BAŞARILI", async () => {
    const { svc, prisma } = build();
    prisma.auditLog.create.mockRejectedValueOnce(new Error("db down"));

    const res = await svc.pushHacizRequest(req(), "t1");
    expect(res.success).toBe(true);
  });

  it("DTO tenantId yoksa (POA/audit alanı) audit atlanır ama haciz BAŞARILI — trusted execution tenant ayrı", async () => {
    const { svc, prisma, validationGate } = build();

    // DTO.tenantId (POA + D4e-6 audit alanı) yok → audit atlanır; ama trusted execution tenant ("t1")
    // ayrı 2. arg olarak sağlanır (CLIENT-SEC-H2C-P02-R1). Bu iki eksen birbirine bağlı DEĞİL.
    const res = await svc.pushHacizRequest(req({ tenantId: undefined }), "t1");

    expect(res.success).toBe(true);
    expect(validationGate.checkPreHacizIntelligence).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
    // Log ownership yine de trusted tenant'tan yazılır (DTO'dan bağımsız):
    expect(prisma.uyapRequestLog.create.mock.calls[0][0].data.tenantId).toBe("t1");
  });

  it("logRequest transport log'una caseId set edilir (D6-Q5)", async () => {
    const { svc, prisma } = build();

    await svc.pushHacizRequest(req(), "t1");

    expect(prisma.uyapRequestLog.create.mock.calls[0][0].data.caseId).toBe("c1");
  });
});
