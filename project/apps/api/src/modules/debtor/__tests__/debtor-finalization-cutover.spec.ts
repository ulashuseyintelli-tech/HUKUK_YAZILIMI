import { DebtorService } from "../debtor.service";

/**
 * MPB-028(a) PR-4 (owner revizyonu, 2026-07-14 — "PR-4 dar düzeltme").
 *
 * `finalizationDate` (LEGACY COMPATIBILITY alanı — GERÇEK bir kesinleşme OLGUSU DEĞİLDİR,
 * yalnız tebliğ + sabit 7 gün eski/kaba bir TAHMİN formülüdür) ve
 * `finalizationRequestEligibleDate` (kesinleştirme TALEBİ için uygunluk hesabı — kanonik
 * hukuki süre motorunun ürettiği bir HESAPLAMA, o da GERÇEK bir kesinleşme olgusu DEĞİLDİR)
 * KESİNLİKLE ayrı alanlardır:
 * - `finalizationDate`: flag'den TAMAMEN bağımsız, HER ZAMAN mevcut LEGACY (+7 gün) formülü.
 *   Bu PR hiçbir canonical hesapla doldurmaz, yeniden anlamlandırmaz, otomatik üretmez.
 * - `finalizationRequestEligibleDate` + `finalizationEligibilitySource`: flag kapalıyken
 *   LEGACY (+7 gün, AYNI değer — yalnız geriye dönük tutarlılık için), flag açıkken CANONICAL
 *   (kanonik motor) veya UNRESOLVED (fail-closed, tahmini tarih YOK).
 */
describe("MPB-028(a) PR-4: DebtorService finalizationDate vs finalizationRequestEligibleDate", () => {
  const ORIGINAL_ENV = process.env.LEGAL_TIME_CUTOVER;
  const tenantId = "tenant-1";
  const caseId = "case-1";
  const deliveredAt = new Date("2026-05-01T00:00:00.000Z");
  const legacyExpected = new Date(deliveredAt.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

  afterEach(() => {
    if (ORIGINAL_ENV === undefined) {
      delete process.env.LEGAL_TIME_CUTOVER;
    } else {
      process.env.LEGAL_TIME_CUTOVER = ORIGINAL_ENV;
    }
  });

  const address = { id: "addr-1", district: "Kadikoy", city: "Istanbul", fullText: "Adres 1" };

  const makeCaseDebtor = (overrides: Record<string, unknown> = {}) => ({
    id: "cd-1",
    caseId,
    lifecycleStatus: "ACTIVE",
    role: "ASIL_BORCLU",
    serviceStatus: "DELIVERED",
    serviceChannel: null,
    trackingNo: null,
    sentAt: null,
    deliveredAt,
    returnedAt: null,
    returnReason: null,
    assetVehicle: "UNKNOWN",
    assetRealEstate: "UNKNOWN",
    assetBank: "UNKNOWN",
    assetSgkWage: "UNKNOWN",
    assetLastQueryAt: null,
    selectedAddress: address,
    updatedAt: new Date("2026-05-02T00:00:00.000Z"),
    debtor: {
      id: "debtor-1",
      name: "Test Borclu",
      type: "INDIVIDUAL",
      identityNo: "11111111111",
      tckn: "11111111111",
      vkn: null,
      phone: "05551234567",
      email: null,
      riskLevel: null,
      status: null,
      debtorAddresses: [address],
    },
    ...overrides,
  });

  function makeService(options: {
    caseDebtors?: Array<Record<string, unknown>>;
    tebligat?: { id: string } | null;
    canonicalResult?: unknown;
    withLegalPeriodService?: boolean;
  } = {}) {
    const { caseDebtors = [makeCaseDebtor()], tebligat = null, canonicalResult, withLegalPeriodService = true } = options;

    const prisma: any = {
      case: { findFirst: jest.fn().mockResolvedValue({ id: caseId }) },
      caseDebtor: {
        findMany: jest.fn().mockResolvedValue(caseDebtors),
        findFirst: jest.fn().mockResolvedValue(caseDebtors[0] ?? null),
      },
      debtorAddress: { findMany: jest.fn().mockResolvedValue([]) },
      addressResearch: { findUnique: jest.fn().mockResolvedValue(null) },
      tebligat: { findFirst: jest.fn().mockResolvedValue(tebligat) },
      collection: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const legalPeriodCalculationService = withLegalPeriodService
      ? { computeCanonicalLegalPeriod: jest.fn().mockResolvedValue(canonicalResult) }
      : undefined;

    const service = new DebtorService(
      prisma,
      { logInTransaction: jest.fn().mockResolvedValue(undefined), log: jest.fn().mockResolvedValue(undefined) } as any,
      {} as any,
      undefined,
      undefined,
      legalPeriodCalculationService as any
    );

    return { service, prisma, legalPeriodCalculationService };
  }

  describe("getDebtorsForCase", () => {
    it("finalizationDate HER ZAMAN LEGACY (+7 gün) — flag açık/kapalı FARK ETMEZ", async () => {
      process.env.LEGAL_TIME_CUTOVER = "true";
      const { service } = makeService({
        tebligat: { id: "tebligat-1" },
        canonicalResult: { status: "RESOLVED", nextActionEligibleDate: new Date("2099-01-01T00:00:00.000Z") },
      });

      const result = await service.getDebtorsForCase(tenantId, caseId);

      // finalizationDate kanonik sonuçtan (2099) DEĞİL, her zaman +7 gün formülünden gelir.
      expect(result.items[0].finalizationDate).toBe(legacyExpected);
    });

    it("flag kapalıyken finalizationEligibilitySource=LEGACY, kanonik motor hiç çağrılmaz", async () => {
      delete process.env.LEGAL_TIME_CUTOVER;
      const { service, prisma, legalPeriodCalculationService } = makeService({
        canonicalResult: { status: "RESOLVED", nextActionEligibleDate: new Date("2099-01-01T00:00:00.000Z") },
      });

      const result = await service.getDebtorsForCase(tenantId, caseId);

      expect(result.items[0].finalizationEligibilitySource).toBe("LEGACY");
      expect(result.items[0].finalizationRequestEligibleDate).toBe(legacyExpected);
      expect(result.items[0].finalizationDate).toBe(legacyExpected);
      expect(prisma.tebligat.findFirst).not.toHaveBeenCalled();
      expect(legalPeriodCalculationService?.computeCanonicalLegalPeriod).not.toHaveBeenCalled();
    });

    it("flag açık ama legalPeriodCalculationService inject edilmemişse eligibility LEGACY'ye düşer", async () => {
      process.env.LEGAL_TIME_CUTOVER = "true";
      const { service } = makeService({ withLegalPeriodService: false });

      const result = await service.getDebtorsForCase(tenantId, caseId);

      expect(result.items[0].finalizationEligibilitySource).toBe("LEGACY");
      expect(result.items[0].finalizationRequestEligibleDate).toBe(legacyExpected);
      expect(result.items[0].finalizationDate).toBe(legacyExpected);
    });

    it("flag açık + ilgili Tebligat yoksa eligibility UNRESOLVED döner (finalizationDate ETKİLENMEZ)", async () => {
      process.env.LEGAL_TIME_CUTOVER = "true";
      const { service, prisma, legalPeriodCalculationService } = makeService({ tebligat: null });

      const result = await service.getDebtorsForCase(tenantId, caseId);

      expect(result.items[0].finalizationEligibilitySource).toBe("UNRESOLVED");
      expect(result.items[0].finalizationRequestEligibleDate).toBeUndefined();
      expect(result.items[0].finalizationDate).toBe(legacyExpected); // ETKİLENMEDİ
      expect(prisma.tebligat.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId, caseDebtorId: "cd-1" } })
      );
      expect(legalPeriodCalculationService?.computeCanonicalLegalPeriod).not.toHaveBeenCalled();
    });

    it("flag açık + kanonik motor RESOLVED dönerse finalizationRequestEligibleDate=nextActionEligibleDate (finalizationDate ETKİLENMEZ)", async () => {
      process.env.LEGAL_TIME_CUTOVER = "true";
      const eligibleDate = new Date("2026-05-10T00:00:00.000Z");
      const { service, legalPeriodCalculationService } = makeService({
        tebligat: { id: "tebligat-1" },
        canonicalResult: { status: "RESOLVED", nextActionEligibleDate: eligibleDate },
      });

      const result = await service.getDebtorsForCase(tenantId, caseId);

      expect(result.items[0].finalizationEligibilitySource).toBe("CANONICAL");
      expect(result.items[0].finalizationRequestEligibleDate).toBe(eligibleDate.toISOString());
      expect(result.items[0].finalizationDate).toBe(legacyExpected); // ETKİLENMEDİ
      expect(legalPeriodCalculationService?.computeCanonicalLegalPeriod).toHaveBeenCalledWith({
        tenantId,
        tebligatId: "tebligat-1",
        caseId,
      });
    });

    it("flag açık + kanonik motor UNRESOLVED dönerse fail-closed UNRESOLVED döner", async () => {
      process.env.LEGAL_TIME_CUTOVER = "true";
      const { service } = makeService({
        tebligat: { id: "tebligat-1" },
        canonicalResult: { status: "UNRESOLVED", reason: "LEGAL_PERIOD_RULE_UNRESOLVED" },
      });

      const result = await service.getDebtorsForCase(tenantId, caseId);

      expect(result.items[0].finalizationEligibilitySource).toBe("UNRESOLVED");
      expect(result.items[0].finalizationRequestEligibleDate).toBeUndefined();
    });

    it("deliveredAt yoksa flag'den bağımsız LEGACY (undefined tarih) döner", async () => {
      process.env.LEGAL_TIME_CUTOVER = "true";
      const { service, prisma } = makeService({
        caseDebtors: [makeCaseDebtor({ deliveredAt: null })],
      });

      const result = await service.getDebtorsForCase(tenantId, caseId);

      expect(result.items[0].finalizationEligibilitySource).toBe("LEGACY");
      expect(result.items[0].finalizationRequestEligibleDate).toBeUndefined();
      expect(result.items[0].finalizationDate).toBeUndefined();
      expect(prisma.tebligat.findFirst).not.toHaveBeenCalled();
    });

    it("Tebligat sorgusu her zaman doğru tenantId ile filtrelenir (cross-tenant sızıntısı yok)", async () => {
      process.env.LEGAL_TIME_CUTOVER = "true";
      const otherTenantId = "tenant-OTHER";
      const { service, prisma } = makeService({ tebligat: null });

      await service.getDebtorsForCase(otherTenantId, caseId);

      expect(prisma.tebligat.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: otherTenantId, caseDebtorId: "cd-1" } })
      );
    });
  });

  describe("getCaseDebtorDetail", () => {
    it("liste ile AYNI kaynak/flag mantığını uygular (CANONICAL), finalizationDate ETKİLENMEZ", async () => {
      process.env.LEGAL_TIME_CUTOVER = "true";
      const eligibleDate = new Date("2026-05-10T00:00:00.000Z");
      const { service, prisma } = makeService({
        tebligat: { id: "tebligat-1" },
        canonicalResult: { status: "RESOLVED", nextActionEligibleDate: eligibleDate },
      });
      prisma.caseDebtor.findFirst = jest.fn().mockResolvedValue(makeCaseDebtor());

      const detail = await service.getCaseDebtorDetail(tenantId, caseId, "cd-1");

      expect(detail.finalizationEligibilitySource).toBe("CANONICAL");
      expect(detail.finalizationRequestEligibleDate).toBe(eligibleDate.toISOString());
      expect(detail.finalizationDate).toBe(legacyExpected);
    });

    it("flag kapalıyken LEGACY hesabını korur", async () => {
      delete process.env.LEGAL_TIME_CUTOVER;
      const { service, prisma } = makeService();
      prisma.caseDebtor.findFirst = jest.fn().mockResolvedValue(makeCaseDebtor());

      const detail = await service.getCaseDebtorDetail(tenantId, caseId, "cd-1");

      expect(detail.finalizationEligibilitySource).toBe("LEGACY");
      expect(detail.finalizationRequestEligibleDate).toBe(legacyExpected);
      expect(detail.finalizationDate).toBe(legacyExpected);
    });
  });
});
