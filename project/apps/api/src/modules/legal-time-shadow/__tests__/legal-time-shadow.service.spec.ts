/**
 * MPB-028(a) PR-3 — LegalTimeShadowService birim testleri (mock Prisma + mock
 * LegalDeadlineService).
 *
 * Üç endişe grubu:
 * 1) Feature flag davranışı (kapalıyken tam no-op).
 * 2) Delta hesaplama senaryoları (aynı/erken/geç tarih + 6 rejim + legacy/canonical yok).
 * 3) Immutable diff kaydı + Evidence Report.
 */
import { NotFoundException } from "@nestjs/common";
import { LegalTimeShadowService } from "../legal-time-shadow.service";

function buildTebligat(overrides: Partial<{ id: string; tenantId: string; caseId: string }> = {}) {
  return { id: "teb-1", tenantId: "tenant-a", caseId: "case-1", ...overrides };
}

function buildPrisma(opts: {
  tebligat?: any;
  caseData?: { workflowStage: string } | null;
  notifications?: Array<{ deliveredAt: Date }>;
}) {
  const prisma: any = {
    tebligat: { findFirst: jest.fn().mockResolvedValue(opts.tebligat ?? null) },
    case: { findFirst: jest.fn().mockResolvedValue(opts.caseData ?? null) },
    notificationQueue: { findMany: jest.fn().mockResolvedValue(opts.notifications ?? []) },
    legalTimeShadowDiff: {
      create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: "diff-new", ...data })),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
  return prisma;
}

function buildLegalDeadlineService(result: { legalServiceDate: Date; deadlineReasonCode: string } | null) {
  return {
    resolveLegalServiceDateForTebligat: jest.fn().mockResolvedValue(result),
  } as any;
}

const ORIGINAL_ENV = process.env.LEGAL_TIME_SHADOW_ENABLED;
afterEach(() => {
  process.env.LEGAL_TIME_SHADOW_ENABLED = ORIGINAL_ENV;
});

describe("LegalTimeShadowService — feature flag", () => {
  it("flag tanımsız (varsayılan): kapalı, hiçbir DB işlemi yapılmaz, null döner", async () => {
    delete process.env.LEGAL_TIME_SHADOW_ENABLED;
    const prisma = buildPrisma({});
    const svc = new LegalTimeShadowService(prisma, buildLegalDeadlineService(null));

    const result = await svc.computeShadowDiff({ tenantId: "tenant-a", tebligatId: "teb-1" });

    expect(result).toBeNull();
    expect(prisma.tebligat.findFirst).not.toHaveBeenCalled();
    expect(prisma.legalTimeShadowDiff.create).not.toHaveBeenCalled();
  });

  it("flag='false': kapalı, no-op", async () => {
    process.env.LEGAL_TIME_SHADOW_ENABLED = "false";
    const prisma = buildPrisma({});
    const svc = new LegalTimeShadowService(prisma, buildLegalDeadlineService(null));

    const result = await svc.computeShadowDiff({ tenantId: "tenant-a", tebligatId: "teb-1" });

    expect(result).toBeNull();
    expect(prisma.legalTimeShadowDiff.create).not.toHaveBeenCalled();
  });

  it("flag='true': açık, hesaplama çalışır", async () => {
    process.env.LEGAL_TIME_SHADOW_ENABLED = "true";
    const tebligat = buildTebligat();
    const prisma = buildPrisma({
      tebligat,
      caseData: { workflowStage: "PAYMENT_ORDER" },
      notifications: [{ deliveredAt: new Date("2026-07-18T00:00:00Z") }],
    });
    const svc = new LegalTimeShadowService(
      prisma,
      buildLegalDeadlineService({ legalServiceDate: new Date("2026-07-18T00:00:00Z"), deadlineReasonCode: "DIRECT_DELIVERY" }),
    );

    const result = await svc.computeShadowDiff({ tenantId: "tenant-a", tebligatId: "teb-1" });

    expect(result).not.toBeNull();
    expect(prisma.legalTimeShadowDiff.create).toHaveBeenCalledTimes(1);
  });
});

describe("LegalTimeShadowService — delta senaryoları", () => {
  beforeEach(() => {
    process.env.LEGAL_TIME_SHADOW_ENABLED = "true";
  });

  it("aynı tarih: delta=0", async () => {
    const prisma = buildPrisma({
      tebligat: buildTebligat(),
      caseData: { workflowStage: "PAYMENT_ORDER" },
      notifications: [{ deliveredAt: new Date("2026-07-18T00:00:00Z") }],
    });
    const svc = new LegalTimeShadowService(
      prisma,
      buildLegalDeadlineService({ legalServiceDate: new Date("2026-07-18T00:00:00Z"), deadlineReasonCode: "DIRECT_DELIVERY" }),
    );

    await svc.computeShadowDiff({ tenantId: "tenant-a", tebligatId: "teb-1" });

    const created = prisma.legalTimeShadowDiff.create.mock.calls[0][0].data;
    expect(created.deltaDays).toBe(0);
    expect(created.legacyDate).toEqual(new Date("2026-07-18T00:00:00Z"));
    expect(created.canonicalDate).toEqual(new Date("2026-07-18T00:00:00Z"));
  });

  it("erken tarih: canonical < legacy → negatif delta", async () => {
    const prisma = buildPrisma({
      tebligat: buildTebligat(),
      caseData: { workflowStage: "PAYMENT_ORDER" },
      notifications: [{ deliveredAt: new Date("2026-07-20T00:00:00Z") }],
    });
    const svc = new LegalTimeShadowService(
      prisma,
      buildLegalDeadlineService({ legalServiceDate: new Date("2026-07-18T00:00:00Z"), deadlineReasonCode: "TK_21_1" }),
    );

    await svc.computeShadowDiff({ tenantId: "tenant-a", tebligatId: "teb-1" });

    const created = prisma.legalTimeShadowDiff.create.mock.calls[0][0].data;
    expect(created.deltaDays).toBe(-2);
  });

  it("geç tarih (owner örneği): legacy 2026-07-18, canonical 2026-07-20 → delta +2", async () => {
    const prisma = buildPrisma({
      tebligat: buildTebligat(),
      caseData: { workflowStage: "PAYMENT_ORDER" },
      notifications: [{ deliveredAt: new Date("2026-07-18T00:00:00Z") }],
    });
    const svc = new LegalTimeShadowService(
      prisma,
      buildLegalDeadlineService({ legalServiceDate: new Date("2026-07-20T00:00:00Z"), deadlineReasonCode: "TK_20" }),
    );

    await svc.computeShadowDiff({ tenantId: "tenant-a", tebligatId: "teb-1" });

    const created = prisma.legalTimeShadowDiff.create.mock.calls[0][0].data;
    expect(created.deltaDays).toBe(2);
  });

  it.each([
    ["TK_20", 15],
    ["TK_21_1", 0],
    ["TK_21_2", 0],
    ["UETS_M7A", 5],
    ["ILANEN_M31", 7],
    ["DIRECT_DELIVERY", 0],
  ])("rejim %s: canonical reasonCode diff kaydına yansır", async (reasonCode, expectedOffsetDays) => {
    const legacyBase = new Date("2026-07-01T00:00:00Z");
    const canonicalDate = new Date(legacyBase);
    canonicalDate.setDate(canonicalDate.getDate() + expectedOffsetDays);

    const prisma = buildPrisma({
      tebligat: buildTebligat(),
      caseData: { workflowStage: "PAYMENT_ORDER" },
      notifications: [{ deliveredAt: legacyBase }],
    });
    const svc = new LegalTimeShadowService(
      prisma,
      buildLegalDeadlineService({ legalServiceDate: canonicalDate, deadlineReasonCode: reasonCode }),
    );

    await svc.computeShadowDiff({ tenantId: "tenant-a", tebligatId: "teb-1" });

    const created = prisma.legalTimeShadowDiff.create.mock.calls[0][0].data;
    expect(created.reasonCode).toBe(reasonCode);
    expect(created.deltaDays).toBe(expectedOffsetDays);
  });

  it("legacy veri yok (NotificationQueue boş) → legacyDate=null, reasonCode NO_LEGACY_DATA", async () => {
    const prisma = buildPrisma({
      tebligat: buildTebligat(),
      caseData: { workflowStage: "PAYMENT_ORDER" },
      notifications: [],
    });
    const svc = new LegalTimeShadowService(
      prisma,
      buildLegalDeadlineService({ legalServiceDate: new Date("2026-07-18T00:00:00Z"), deadlineReasonCode: "TK_21_1" }),
    );

    await svc.computeShadowDiff({ tenantId: "tenant-a", tebligatId: "teb-1" });

    const created = prisma.legalTimeShadowDiff.create.mock.calls[0][0].data;
    expect(created.legacyDate).toBeNull();
    expect(created.deltaDays).toBeNull();
  });

  it("canonical hesaplanamıyor (rejim eşleşmedi) → canonicalDate=null, reasonCode CANONICAL_UNRESOLVED", async () => {
    const prisma = buildPrisma({
      tebligat: buildTebligat(),
      caseData: { workflowStage: "PAYMENT_ORDER" },
      notifications: [{ deliveredAt: new Date("2026-07-18T00:00:00Z") }],
    });
    const svc = new LegalTimeShadowService(prisma, buildLegalDeadlineService(null));

    await svc.computeShadowDiff({ tenantId: "tenant-a", tebligatId: "teb-1" });

    const created = prisma.legalTimeShadowDiff.create.mock.calls[0][0].data;
    expect(created.canonicalDate).toBeNull();
    expect(created.reasonCode).toBe("CANONICAL_UNRESOLVED");
    expect(created.deltaDays).toBeNull();
  });

  it.each(["ENFORCEMENT", "SEIZURE", "CLOSED"])(
    "workflowStage=%s: legacy uygulanamaz (WorkflowEngine bu aşamada NotificationQueue okumuyor), tahmin YAPILMAZ",
    async (workflowStage) => {
      const prisma = buildPrisma({
        tebligat: buildTebligat(),
        caseData: { workflowStage },
        notifications: [{ deliveredAt: new Date("2026-07-18T00:00:00Z") }],
      });
      const svc = new LegalTimeShadowService(
        prisma,
        buildLegalDeadlineService({ legalServiceDate: new Date("2026-07-20T00:00:00Z"), deadlineReasonCode: "TK_21_1" }),
      );

      await svc.computeShadowDiff({ tenantId: "tenant-a", tebligatId: "teb-1" });

      const created = prisma.legalTimeShadowDiff.create.mock.calls[0][0].data;
      expect(created.legacyDate).toBeNull();
      expect(created.reasonCode).toBe("LEGACY_NOT_APPLICABLE_WORKFLOW_STAGE");
      // notificationQueue.findMany hiç çağrılmamalı — uygun olmayan aşamada sorgu bile atılmaz.
      expect(prisma.notificationQueue.findMany).not.toHaveBeenCalled();
    },
  );

  it("tebligat bulunamazsa NotFoundException (cross-tenant dahil, enumeration yok)", async () => {
    const prisma = buildPrisma({ tebligat: null });
    const svc = new LegalTimeShadowService(prisma, buildLegalDeadlineService(null));

    await expect(
      svc.computeShadowDiff({ tenantId: "tenant-a", tebligatId: "yok" }),
    ).rejects.toThrow(NotFoundException);
  });

  it("tebligat sorgusu tenant-scoped where ile yapılır", async () => {
    const prisma = buildPrisma({
      tebligat: buildTebligat(),
      caseData: { workflowStage: "PAYMENT_ORDER" },
      notifications: [{ deliveredAt: new Date("2026-07-18T00:00:00Z") }],
    });
    const svc = new LegalTimeShadowService(
      prisma,
      buildLegalDeadlineService({ legalServiceDate: new Date("2026-07-18T00:00:00Z"), deadlineReasonCode: "TK_21_1" }),
    );

    await svc.computeShadowDiff({ tenantId: "tenant-a", tebligatId: "teb-1" });

    expect(prisma.tebligat.findFirst).toHaveBeenCalledWith({
      where: { id: "teb-1", tenantId: "tenant-a" },
    });
  });
});

describe("LegalTimeShadowService — immutable diff kaydı", () => {
  beforeEach(() => {
    process.env.LEGAL_TIME_SHADOW_ENABLED = "true";
  });

  it("yalnız create çağrılır; mock'ta update/delete tanımlı değil (çağrılırsa TypeError fırlar)", async () => {
    const prisma = buildPrisma({
      tebligat: buildTebligat(),
      caseData: { workflowStage: "PAYMENT_ORDER" },
      notifications: [{ deliveredAt: new Date("2026-07-18T00:00:00Z") }],
    });
    // Bilinçli olarak legalTimeShadowDiff.update/delete hiç tanımlanmadı.
    const svc = new LegalTimeShadowService(
      prisma,
      buildLegalDeadlineService({ legalServiceDate: new Date("2026-07-20T00:00:00Z"), deadlineReasonCode: "TK_20" }),
    );

    await expect(
      svc.computeShadowDiff({ tenantId: "tenant-a", tebligatId: "teb-1" }),
    ).resolves.toBeDefined();
    expect(prisma.legalTimeShadowDiff.create).toHaveBeenCalledTimes(1);
  });

  it("aynı tebligat için ikinci çağrı YENİ bir satır oluşturur (supersede/update YOK — her hesap bağımsız kayıt)", async () => {
    const prisma = buildPrisma({
      tebligat: buildTebligat(),
      caseData: { workflowStage: "PAYMENT_ORDER" },
      notifications: [{ deliveredAt: new Date("2026-07-18T00:00:00Z") }],
    });
    const svc = new LegalTimeShadowService(
      prisma,
      buildLegalDeadlineService({ legalServiceDate: new Date("2026-07-20T00:00:00Z"), deadlineReasonCode: "TK_20" }),
    );

    await svc.computeShadowDiff({ tenantId: "tenant-a", tebligatId: "teb-1" });
    await svc.computeShadowDiff({ tenantId: "tenant-a", tebligatId: "teb-1" });

    expect(prisma.legalTimeShadowDiff.create).toHaveBeenCalledTimes(2);
  });
});

describe("LegalTimeShadowService — Evidence Report", () => {
  it("zero/non-zero/unresolved sayıları doğru hesaplanır; HİÇBİR kategori üretilmez (owner Decision 7)", async () => {
    const rows = [
      { deltaDays: 0 },
      { deltaDays: 0 },
      { deltaDays: 2 },
      { deltaDays: 7 },
      { deltaDays: 15 },
      { deltaDays: 20 },
      { deltaDays: null },
    ];
    const prisma: any = {
      legalTimeShadowDiff: { findMany: jest.fn().mockResolvedValue(rows) },
    };
    const svc = new LegalTimeShadowService(prisma, buildLegalDeadlineService(null));

    const report = await svc.buildEvidenceReport("tenant-a");

    expect(report.totalCount).toBe(7);
    expect(report.zeroDeltaCount).toBe(2);
    expect(report.nonZeroDeltaCount).toBe(4);
    expect(report.unresolvedCount).toBe(1);
    // Owner Decision 7: delta kategorisi (SMALL/MEDIUM/LARGE vb.) hukuki bir sınıflandırmadır,
    // teknik katman üretmez — bu alanların hiçbiri raporda YOKTUR.
    expect(report).not.toHaveProperty("deltaCategories");
    expect(report).not.toHaveProperty("representativeEvidence");
  });

  it("TÜM kayıtları döner; ilk-N limiti UYGULANMAZ (owner Decision 8)", async () => {
    const rows = Array.from({ length: 25 }, (_, i) => ({ id: `diff-${i}`, deltaDays: i + 1 }));
    const prisma: any = {
      legalTimeShadowDiff: { findMany: jest.fn().mockResolvedValue(rows) },
    };
    const svc = new LegalTimeShadowService(prisma, buildLegalDeadlineService(null));

    const report = await svc.buildEvidenceReport("tenant-a");

    // Owner Decision 8: filtreleme (ilk 10/100/tarih aralığı) UI/raporlama katmanının işidir.
    expect(report.records).toHaveLength(25);
    expect(report.records).toEqual(rows);
  });

  it("tenant-scoped sorgu ile daraltılır", async () => {
    const prisma: any = {
      legalTimeShadowDiff: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const svc = new LegalTimeShadowService(prisma, buildLegalDeadlineService(null));

    await svc.buildEvidenceReport("tenant-a");

    expect(prisma.legalTimeShadowDiff.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: "tenant-a" } }),
    );
  });
});
