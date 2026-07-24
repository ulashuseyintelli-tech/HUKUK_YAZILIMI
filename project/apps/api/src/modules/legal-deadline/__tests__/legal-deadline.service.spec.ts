/**
 * MPB-028(a) PR-2 — LegalDeadlineService birim testleri (mock Prisma).
 *
 * Üç endişe grubu:
 * 1) Hukuki rejim hesaplaması (Bölüm 3 tablosu, TK 21/2 regresyon testi dahil).
 * 2) Snapshot yaşam döngüsü (immutable/idempotent/supersede/tenant-isolation).
 * 3) Tarih kavramı ayrımı (legalServiceDate ≠ finalizationDate, backfill yok).
 */
import { NotFoundException, BadRequestException } from "@nestjs/common";
import { LegalDeadlineService } from "../legal-deadline.service";

function buildTebligat(overrides: Partial<{
  id: string;
  tenantId: string;
  caseId: string;
  caseDebtorId: string | null;
  tk21Type: string | null;
  channel: string;
  muhtarlikDate: Date | null;
  ilanDate: Date | null;
  deliveredAt: Date | null;
}> = {}) {
  return {
    id: "teb-1",
    tenantId: "tenant-a",
    caseId: "case-1",
    caseDebtorId: "cd-1",
    tk21Type: null,
    channel: "PTT",
    muhtarlikDate: null,
    ilanDate: null,
    deliveredAt: null,
    ...overrides,
  };
}

function buildPrisma(tebligat: any, existingActive: any = null) {
  const tx: any = {
    legalDeadlineSnapshot: {
      findFirst: jest.fn().mockResolvedValue(existingActive),
      update: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: "snap-new", ...data })),
    },
  };
  const prisma: any = {
    tebligat: { findFirst: jest.fn().mockResolvedValue(tebligat) },
    $transaction: jest.fn().mockImplementation(async (cb: any) => cb(tx)),
  };
  return { prisma, tx };
}

describe("LegalDeadlineService — hukuki rejim hesaplaması", () => {
  it("doğrudan/elden teslim: legalServiceDate = deliveredAt, gecikmesiz", async () => {
    const tebligat = buildTebligat({ deliveredAt: new Date("2026-01-10T00:00:00Z") });
    const { prisma, tx } = buildPrisma(tebligat);
    const svc = new LegalDeadlineService(prisma);

    await svc.calculateDeadline({ tenantId: "tenant-a", tebligatId: "teb-1", objectionPeriodDays: 7 });

    const created = tx.legalDeadlineSnapshot.create.mock.calls[0][0].data;
    expect(created.legalServiceDate).toEqual(new Date("2026-01-10T00:00:00Z"));
    expect(created.deadlineReasonCode).toBe("DIRECT_DELIVERY");
    // calculationRule artık LegalServiceDateRuleCore'un IMMEDIATE_SERVICE rejim adını
    // yansıtır (I02 delegasyonu) — deadlineReasonCode (dış/public alan) değişmedi.
    expect(created.calculationRule).toBe("IMMEDIATE_SERVICE_NO_DELAY");
  });

  it("TK 21/1 (bilinen adreste imtina): legalServiceDate = muhtarlikDate, gecikmesiz", async () => {
    const tebligat = buildTebligat({ tk21Type: "TK_21_1", muhtarlikDate: new Date("2026-01-10T00:00:00Z") });
    const { prisma, tx } = buildPrisma(tebligat);
    const svc = new LegalDeadlineService(prisma);

    await svc.calculateDeadline({ tenantId: "tenant-a", tebligatId: "teb-1", objectionPeriodDays: 7 });

    const created = tx.legalDeadlineSnapshot.create.mock.calls[0][0].data;
    expect(created.legalServiceDate).toEqual(new Date("2026-01-10T00:00:00Z"));
    expect(created.deadlineReasonCode).toBe("TK_21_1");
  });

  it("REGRESYON — TK 21/2 (MERNİS): legalServiceDate = ilanDate AYNEN, +15 gün YOK", async () => {
    const tebligat = buildTebligat({ tk21Type: "TK_21_2", ilanDate: new Date("2026-01-10T00:00:00Z") });
    const { prisma, tx } = buildPrisma(tebligat);
    const svc = new LegalDeadlineService(prisma);

    await svc.calculateDeadline({ tenantId: "tenant-a", tebligatId: "teb-1", objectionPeriodDays: 7 });

    const created = tx.legalDeadlineSnapshot.create.mock.calls[0][0].data;
    // MPB-028(a) düzeltmesinden önce bu satır 2026-01-25 (ilanDate + 15) olurdu — hatalıydı.
    expect(created.legalServiceDate).toEqual(new Date("2026-01-10T00:00:00Z"));
    expect(created.deadlineReasonCode).toBe("TK_21_2");
    expect(created.calculationRule).toBe("TK_21_2_NO_DELAY");
  });

  it("DEBTOR-OF01-HISTORY-P04-B-R2-I02 — TK m.20: Tebligat'ta güvenilir completion mode kaynağı yok → fail-closed (eski koşulsuz +15 gün davranışı KALDIRILDI)", async () => {
    const tebligat = buildTebligat({ tk21Type: "TK_20", ilanDate: new Date("2026-01-10T00:00:00Z") });
    const { prisma, tx } = buildPrisma(tebligat);
    const svc = new LegalDeadlineService(prisma);

    await expect(
      svc.calculateDeadline({ tenantId: "tenant-a", tebligatId: "teb-1", objectionPeriodDays: 7 }),
    ).rejects.toThrow(BadRequestException);
    expect(tx.legalDeadlineSnapshot.create).not.toHaveBeenCalled();
  });

  it("TK m.20: hem ilanDate hem muhtarlikDate yoksa → fail-closed (tarih kaynağı eksik)", async () => {
    const tebligat = buildTebligat({ tk21Type: "TK_20", ilanDate: null, muhtarlikDate: null });
    const { prisma, tx } = buildPrisma(tebligat);
    const svc = new LegalDeadlineService(prisma);

    await expect(
      svc.calculateDeadline({ tenantId: "tenant-a", tebligatId: "teb-1", objectionPeriodDays: 7 }),
    ).rejects.toThrow(BadRequestException);
    expect(tx.legalDeadlineSnapshot.create).not.toHaveBeenCalled();
  });

  it("ilanen tebliğ (m.31): legalServiceDate = ilanDate + 7 gün", async () => {
    const tebligat = buildTebligat({ channel: "ILANEN", ilanDate: new Date("2026-01-10T00:00:00Z") });
    const { prisma, tx } = buildPrisma(tebligat);
    const svc = new LegalDeadlineService(prisma);

    await svc.calculateDeadline({ tenantId: "tenant-a", tebligatId: "teb-1", objectionPeriodDays: 7 });

    const created = tx.legalDeadlineSnapshot.create.mock.calls[0][0].data;
    expect(created.legalServiceDate).toEqual(new Date("2026-01-17T00:00:00Z"));
    expect(created.deadlineReasonCode).toBe("ILANEN_M31");
  });

  it.each(["UETS", "KEP"])("%s (e-tebligat m.7/a): legalServiceDate = deliveredAt + 5 gün", async (channel) => {
    const tebligat = buildTebligat({ channel, deliveredAt: new Date("2026-01-10T00:00:00Z") });
    const { prisma, tx } = buildPrisma(tebligat);
    const svc = new LegalDeadlineService(prisma);

    await svc.calculateDeadline({ tenantId: "tenant-a", tebligatId: "teb-1", objectionPeriodDays: 7 });

    const created = tx.legalDeadlineSnapshot.create.mock.calls[0][0].data;
    expect(created.legalServiceDate).toEqual(new Date("2026-01-15T00:00:00Z"));
    expect(created.deadlineReasonCode).toBe("UETS_M7A");
  });

  it("fail-closed: hiçbir rejim sinyali eşleşmezse BadRequestException, tahmin YAPILMAZ", async () => {
    const tebligat = buildTebligat(); // tüm tarih alanları null, channel=PTT ama tk21Type yok
    const { prisma, tx } = buildPrisma(tebligat);
    const svc = new LegalDeadlineService(prisma);

    await expect(
      svc.calculateDeadline({ tenantId: "tenant-a", tebligatId: "teb-1", objectionPeriodDays: 7 }),
    ).rejects.toThrow(BadRequestException);
    expect(tx.legalDeadlineSnapshot.create).not.toHaveBeenCalled();
  });

  it("tebligat bulunamazsa NotFoundException (cross-tenant dahil, enumeration yok)", async () => {
    const { prisma } = buildPrisma(null);
    const svc = new LegalDeadlineService(prisma);

    await expect(
      svc.calculateDeadline({ tenantId: "tenant-a", tebligatId: "yok", objectionPeriodDays: 7 }),
    ).rejects.toThrow(NotFoundException);
  });

  it("tebligat sorgusu tenant-scoped where ile yapılır", async () => {
    const tebligat = buildTebligat({ deliveredAt: new Date("2026-01-10T00:00:00Z") });
    const { prisma } = buildPrisma(tebligat);
    const svc = new LegalDeadlineService(prisma);

    await svc.calculateDeadline({ tenantId: "tenant-a", tebligatId: "teb-1", objectionPeriodDays: 7 });

    expect(prisma.tebligat.findFirst).toHaveBeenCalledWith({
      where: { id: "teb-1", tenantId: "tenant-a" },
    });
  });
});

describe("LegalDeadlineService — snapshot yaşam döngüsü", () => {
  it("hiç ACTIVE snapshot yokken: yalnız create çağrılır, supersedesSnapshotId=null", async () => {
    const tebligat = buildTebligat({ deliveredAt: new Date("2026-01-10T00:00:00Z") });
    const { prisma, tx } = buildPrisma(tebligat, null);
    const svc = new LegalDeadlineService(prisma);

    await svc.calculateDeadline({ tenantId: "tenant-a", tebligatId: "teb-1", objectionPeriodDays: 7 });

    expect(tx.legalDeadlineSnapshot.update).not.toHaveBeenCalled();
    expect(tx.legalDeadlineSnapshot.create).toHaveBeenCalledTimes(1);
    expect(tx.legalDeadlineSnapshot.create.mock.calls[0][0].data.supersedesSnapshotId).toBeNull();
    expect(tx.legalDeadlineSnapshot.create.mock.calls[0][0].data.status).toBe("ACTIVE");
  });

  it("idempotent no-op: mevcut ACTIVE snapshot birebir aynı sonuçtaysa yeni satır YAZILMAZ", async () => {
    const tebligat = buildTebligat({ deliveredAt: new Date("2026-01-10T00:00:00Z") });
    const existingActive = {
      id: "snap-existing",
      legalServiceDate: new Date("2026-01-10T00:00:00Z"),
      dueDate: new Date("2026-01-17T00:00:00Z"),
      deadlineReasonCode: "DIRECT_DELIVERY",
      calculationVersion: "legal-deadline-v1",
    };
    const { prisma, tx } = buildPrisma(tebligat, existingActive);
    const svc = new LegalDeadlineService(prisma);

    const result = await svc.calculateDeadline({ tenantId: "tenant-a", tebligatId: "teb-1", objectionPeriodDays: 7 });

    expect(tx.legalDeadlineSnapshot.create).not.toHaveBeenCalled();
    expect(tx.legalDeadlineSnapshot.update).not.toHaveBeenCalled();
    expect(result).toBe(existingActive);
  });

  it("supersede: sonuç değiştiyse (örn. gün sayısı revize) eski ACTIVE → SUPERSEDED, yeni ACTIVE oluşur", async () => {
    const tebligat = buildTebligat({ deliveredAt: new Date("2026-01-10T00:00:00Z") });
    const existingActive = {
      id: "snap-existing",
      legalServiceDate: new Date("2026-01-10T00:00:00Z"),
      dueDate: new Date("2026-01-15T00:00:00Z"), // eski hesap: farklı gün sayısıyla üretilmiş
      deadlineReasonCode: "DIRECT_DELIVERY",
      calculationVersion: "legal-deadline-v1",
    };
    const { prisma, tx } = buildPrisma(tebligat, existingActive);
    const svc = new LegalDeadlineService(prisma);

    await svc.calculateDeadline({ tenantId: "tenant-a", tebligatId: "teb-1", objectionPeriodDays: 7 });

    expect(tx.legalDeadlineSnapshot.update).toHaveBeenCalledWith({
      where: { id: "snap-existing" },
      data: { status: "SUPERSEDED" },
    });
    const created = tx.legalDeadlineSnapshot.create.mock.calls[0][0].data;
    expect(created.supersedesSnapshotId).toBe("snap-existing");
    expect(created.status).toBe("ACTIVE");
    // Eski satırın hesaplanan alanları (legalServiceDate/dueDate/reasonCode) hiçbir zaman
    // update edilmez — yalnız status (yaşam döngüsü meta verisi) değişir.
    expect(tx.legalDeadlineSnapshot.update.mock.calls[0][0].data).not.toHaveProperty("legalServiceDate");
    expect(tx.legalDeadlineSnapshot.update.mock.calls[0][0].data).not.toHaveProperty("dueDate");
  });

  it("snapshot sorgusu tenant + sourceTebligatId + status=ACTIVE ile daraltılır (cross-tenant snapshot asla görülmez)", async () => {
    const tebligat = buildTebligat({ deliveredAt: new Date("2026-01-10T00:00:00Z") });
    const { prisma, tx } = buildPrisma(tebligat, null);
    const svc = new LegalDeadlineService(prisma);

    await svc.calculateDeadline({ tenantId: "tenant-a", tebligatId: "teb-1", objectionPeriodDays: 7 });

    expect(tx.legalDeadlineSnapshot.findFirst).toHaveBeenCalledWith({
      where: { tenantId: "tenant-a", sourceTebligatId: "teb-1", status: "ACTIVE" },
    });
  });
});

describe("LegalDeadlineService — tarih kavramı ayrımı", () => {
  it("finalizationDate bu serviste hiçbir zaman doldurulmaz (owner Decision 6)", async () => {
    const tebligat = buildTebligat({ deliveredAt: new Date("2026-01-10T00:00:00Z") });
    const { prisma, tx } = buildPrisma(tebligat);
    const svc = new LegalDeadlineService(prisma);

    await svc.calculateDeadline({ tenantId: "tenant-a", tebligatId: "teb-1", objectionPeriodDays: 7 });

    const created = tx.legalDeadlineSnapshot.create.mock.calls[0][0].data;
    expect(created.finalizationDate).toBeUndefined();
  });

  it("dueDate = legalServiceDate + objectionPeriodDays; itiraz gün sayısı serviste tahmin edilmez, parametre olarak gelir", async () => {
    const tebligat = buildTebligat({ deliveredAt: new Date("2026-01-10T00:00:00Z") });
    const { prisma, tx } = buildPrisma(tebligat);
    const svc = new LegalDeadlineService(prisma);

    await svc.calculateDeadline({ tenantId: "tenant-a", tebligatId: "teb-1", objectionPeriodDays: 10 });

    const created = tx.legalDeadlineSnapshot.create.mock.calls[0][0].data;
    expect(created.legalServiceDate).toEqual(new Date("2026-01-10T00:00:00Z"));
    expect(created.dueDate).toEqual(new Date("2026-01-20T00:00:00Z"));
  });

  it("NotificationQueue hiçbir zaman okunmaz — prisma mock'ında notificationQueue delegate'i yok, servis onu aramaz", async () => {
    const tebligat = buildTebligat({ deliveredAt: new Date("2026-01-10T00:00:00Z") });
    const { prisma } = buildPrisma(tebligat);
    // Bilinçli olarak notificationQueue delegate'i hiç tanımlanmadı — servis buna erişmeye
    // çalışırsa TypeError fırlar ve test kırılır (dolaylı kanıt: erişmiyor).
    const svc = new LegalDeadlineService(prisma);

    await expect(
      svc.calculateDeadline({ tenantId: "tenant-a", tebligatId: "teb-1", objectionPeriodDays: 7 }),
    ).resolves.toBeDefined();
  });
});

describe("LegalDeadlineService — objectionPeriodDays doğrulama (MPB-028(a) PR-2 blocker resolution)", () => {
  it("geçerli pozitif tam sayı: dueDate doğru hesaplanır", async () => {
    const tebligat = buildTebligat({ deliveredAt: new Date("2026-01-10T00:00:00Z") });
    const { prisma, tx } = buildPrisma(tebligat);
    const svc = new LegalDeadlineService(prisma);

    await svc.calculateDeadline({ tenantId: "tenant-a", tebligatId: "teb-1", objectionPeriodDays: 7 });

    const created = tx.legalDeadlineSnapshot.create.mock.calls[0][0].data;
    expect(created.dueDate).toEqual(new Date("2026-01-17T00:00:00Z"));
  });

  it.each([undefined, null, "7" as any, 3.5])("geçersiz/eksik değer (%p) → fail-closed BadRequestException", async (value) => {
    const tebligat = buildTebligat({ deliveredAt: new Date("2026-01-10T00:00:00Z") });
    const { prisma, tx } = buildPrisma(tebligat);
    const svc = new LegalDeadlineService(prisma);

    await expect(
      svc.calculateDeadline({ tenantId: "tenant-a", tebligatId: "teb-1", objectionPeriodDays: value as any }),
    ).rejects.toThrow(BadRequestException);
    expect(tx.legalDeadlineSnapshot.create).not.toHaveBeenCalled();
  });

  it.each([0, -1, -7])("sıfır/negatif değer (%p) → fail-closed BadRequestException", async (value) => {
    const tebligat = buildTebligat({ deliveredAt: new Date("2026-01-10T00:00:00Z") });
    const { prisma, tx } = buildPrisma(tebligat);
    const svc = new LegalDeadlineService(prisma);

    await expect(
      svc.calculateDeadline({ tenantId: "tenant-a", tebligatId: "teb-1", objectionPeriodDays: value }),
    ).rejects.toThrow(BadRequestException);
    expect(tx.legalDeadlineSnapshot.create).not.toHaveBeenCalled();
  });

  it("aşırı büyük değer (366) → fail-closed BadRequestException, servis varsayılan üretmez", async () => {
    const tebligat = buildTebligat({ deliveredAt: new Date("2026-01-10T00:00:00Z") });
    const { prisma, tx } = buildPrisma(tebligat);
    const svc = new LegalDeadlineService(prisma);

    await expect(
      svc.calculateDeadline({ tenantId: "tenant-a", tebligatId: "teb-1", objectionPeriodDays: 366 }),
    ).rejects.toThrow(BadRequestException);
    expect(tx.legalDeadlineSnapshot.create).not.toHaveBeenCalled();
  });

  it("sınır değer (365) kabul edilir", async () => {
    const tebligat = buildTebligat({ deliveredAt: new Date("2026-01-10T00:00:00Z") });
    const { prisma, tx } = buildPrisma(tebligat);
    const svc = new LegalDeadlineService(prisma);

    await svc.calculateDeadline({ tenantId: "tenant-a", tebligatId: "teb-1", objectionPeriodDays: 365 });

    expect(tx.legalDeadlineSnapshot.create).toHaveBeenCalledTimes(1);
  });

  it("objectionPeriodDays doğrulaması Tebligat sorgusundan ÖNCE çalışır (fail-fast, gereksiz DB erişimi yok)", async () => {
    const { prisma } = buildPrisma(null);
    const svc = new LegalDeadlineService(prisma);

    await expect(
      svc.calculateDeadline({ tenantId: "tenant-a", tebligatId: "teb-1", objectionPeriodDays: -1 }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.tebligat.findFirst).not.toHaveBeenCalled();
  });

  it("CaseType/subType gün sayısı tahmini için KULLANILMAZ — mock prisma'da case delegate'i hiç yok, servis erişmiyor", async () => {
    const tebligat = buildTebligat({ deliveredAt: new Date("2026-01-10T00:00:00Z") });
    const { prisma } = buildPrisma(tebligat);
    // case delegate'i bilinçli olarak tanımlanmadı — servis CaseType okumaya çalışsaydı
    // TypeError fırlardı (dolaylı kanıt: hiç erişmiyor, objectionPeriodDays salt parametre).
    const svc = new LegalDeadlineService(prisma);

    await expect(
      svc.calculateDeadline({ tenantId: "tenant-a", tebligatId: "teb-1", objectionPeriodDays: 10 }),
    ).resolves.toBeDefined();
  });
});
