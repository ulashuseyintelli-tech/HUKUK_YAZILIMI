import { WorkflowEngine } from "../workflow-engine.service";

/**
 * MPB-028(a) PR-5 (owner GO-IMPLEMENT, 2026-07-14 — "PR-5 yalnız calculateNextActionTime
 * kapsamında, NotificationQueue yalnız legacy fallback").
 *
 * `WorkflowEngine.calculateNextActionTime`'ın PAYMENT_ORDER/WAITING_RESPONSE dalı: flag
 * açıkken bu case için en son Tebligat kaydı üzerinden kanonik
 * `LegalPeriodCalculationService`'i (PR-3C) çağırır. Flag kapalıyken, servis inject
 * edilmemişse, Tebligat yoksa veya kanonik kural UNRESOLVED dönerse legacy
 * `NotificationQueue` formülüne (tebligattan +10 gün) DÜŞER — davranış hiç değişmez.
 * ENFORCEMENT/SEIZURE dalları bu PR'ın kapsamı dışıdır, hiç değiştirilmedi.
 */
describe("MPB-028(a) PR-5: WorkflowEngine.calculateNextActionTime legacy vs kanonik", () => {
  const ORIGINAL_ENV = process.env.LEGAL_TIME_CUTOVER;
  const tenantId = "tenant-1";
  const caseId = "case-1";
  const deliveredAt = new Date("2026-05-01T00:00:00.000Z");
  const legacyExpected = new Date(deliveredAt.getTime() + 10 * 24 * 60 * 60 * 1000);

  afterEach(() => {
    if (ORIGINAL_ENV === undefined) {
      delete process.env.LEGAL_TIME_CUTOVER;
    } else {
      process.env.LEGAL_TIME_CUTOVER = ORIGINAL_ENV;
    }
  });

  function makeCaseRow(workflowStage: string, overrides: Record<string, unknown> = {}) {
    return {
      id: caseId,
      tenantId,
      workflowStage,
      notifications: [{ deliveredAt }],
      ...overrides,
    };
  }

  function makeEngine(options: {
    caseRow: Record<string, unknown>;
    tebligat?: { id: string } | null;
    canonicalResult?: unknown;
    withLegalPeriodService?: boolean;
  }) {
    const { caseRow, tebligat = null, canonicalResult, withLegalPeriodService = true } = options;

    const prisma: any = {
      case: { findFirst: jest.fn().mockResolvedValue(caseRow) },
      tebligat: { findFirst: jest.fn().mockResolvedValue(tebligat) },
    };

    const legalPeriodCalculationService = withLegalPeriodService
      ? { computeCanonicalLegalPeriod: jest.fn().mockResolvedValue(canonicalResult) }
      : undefined;

    const engine = new WorkflowEngine(
      prisma,
      {} as any,
      {} as any,
      undefined,
      legalPeriodCalculationService as any,
    );

    return { engine, prisma, legalPeriodCalculationService };
  }

  it("flag kapalıyken PAYMENT_ORDER'da legacy (+10 gün) döner, kanonik motor hiç çağrılmaz", async () => {
    delete process.env.LEGAL_TIME_CUTOVER;
    const { engine, prisma, legalPeriodCalculationService } = makeEngine({
      caseRow: makeCaseRow("PAYMENT_ORDER"),
      canonicalResult: { status: "RESOLVED", nextActionEligibleDate: new Date("2099-01-01T00:00:00.000Z") },
    });

    const result = await engine.calculateNextActionTime(caseId, tenantId);

    expect(result).toEqual(legacyExpected);
    expect(prisma.tebligat.findFirst).not.toHaveBeenCalled();
    expect(legalPeriodCalculationService?.computeCanonicalLegalPeriod).not.toHaveBeenCalled();
  });

  it("flag açık ama legalPeriodCalculationService inject edilmemişse legacy'ye düşer", async () => {
    process.env.LEGAL_TIME_CUTOVER = "true";
    const { engine } = makeEngine({
      caseRow: makeCaseRow("WAITING_RESPONSE"),
      withLegalPeriodService: false,
    });

    const result = await engine.calculateNextActionTime(caseId, tenantId);

    expect(result).toEqual(legacyExpected);
  });

  it("flag açık + ilgili Tebligat yoksa legacy'ye düşer (tahmini tarih üretmez)", async () => {
    process.env.LEGAL_TIME_CUTOVER = "true";
    const { engine, prisma, legalPeriodCalculationService } = makeEngine({
      caseRow: makeCaseRow("WAITING_RESPONSE"),
      tebligat: null,
    });

    const result = await engine.calculateNextActionTime(caseId, tenantId);

    expect(result).toEqual(legacyExpected);
    expect(prisma.tebligat.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId, caseId } }),
    );
    expect(legalPeriodCalculationService?.computeCanonicalLegalPeriod).not.toHaveBeenCalled();
  });

  it("flag açık + kanonik motor UNRESOLVED dönerse legacy'ye düşer (fail-closed fallback)", async () => {
    process.env.LEGAL_TIME_CUTOVER = "true";
    const { engine } = makeEngine({
      caseRow: makeCaseRow("PAYMENT_ORDER"),
      tebligat: { id: "tebligat-1" },
      canonicalResult: { status: "UNRESOLVED", reason: "LEGAL_PERIOD_RULE_UNRESOLVED" },
    });

    const result = await engine.calculateNextActionTime(caseId, tenantId);

    expect(result).toEqual(legacyExpected);
  });

  it("flag açık + kanonik motor RESOLVED dönerse nextActionEligibleDate döner (legacy'den FARKLI)", async () => {
    process.env.LEGAL_TIME_CUTOVER = "true";
    const eligibleDate = new Date("2026-05-20T00:00:00.000Z");
    const { engine, legalPeriodCalculationService } = makeEngine({
      caseRow: makeCaseRow("WAITING_RESPONSE"),
      tebligat: { id: "tebligat-1" },
      canonicalResult: { status: "RESOLVED", nextActionEligibleDate: eligibleDate },
    });

    const result = await engine.calculateNextActionTime(caseId, tenantId);

    expect(result).toEqual(eligibleDate);
    expect(result).not.toEqual(legacyExpected);
    expect(legalPeriodCalculationService?.computeCanonicalLegalPeriod).toHaveBeenCalledWith({
      tenantId,
      tebligatId: "tebligat-1",
      caseId,
    });
  });

  it("Tebligat sorgusu her zaman doğru tenantId ile filtrelenir (cross-tenant sızıntısı yok)", async () => {
    process.env.LEGAL_TIME_CUTOVER = "true";
    const otherTenantId = "tenant-OTHER";
    const { engine, prisma } = makeEngine({
      caseRow: makeCaseRow("PAYMENT_ORDER", { tenantId: otherTenantId }),
      tebligat: null,
    });

    await engine.calculateNextActionTime(caseId, otherTenantId);

    expect(prisma.tebligat.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: otherTenantId, caseId } }),
    );
  });

  it("ENFORCEMENT aşamasında flag AÇIK olsa bile kanonik motor hiç çağrılmaz (kapsam dışı, davranış değişmez)", async () => {
    process.env.LEGAL_TIME_CUTOVER = "true";
    const { engine, prisma, legalPeriodCalculationService } = makeEngine({
      caseRow: makeCaseRow("ENFORCEMENT"),
    });

    const result = await engine.calculateNextActionTime(caseId, tenantId);

    expect(result).not.toBeNull();
    expect(prisma.tebligat.findFirst).not.toHaveBeenCalled();
    expect(legalPeriodCalculationService?.computeCanonicalLegalPeriod).not.toHaveBeenCalled();
  });

  it("SEIZURE aşamasında flag AÇIK olsa bile kanonik motor hiç çağrılmaz (kapsam dışı, davranış değişmez)", async () => {
    process.env.LEGAL_TIME_CUTOVER = "true";
    const { engine, prisma, legalPeriodCalculationService } = makeEngine({
      caseRow: makeCaseRow("SEIZURE"),
    });

    const result = await engine.calculateNextActionTime(caseId, tenantId);

    expect(result).not.toBeNull();
    expect(prisma.tebligat.findFirst).not.toHaveBeenCalled();
    expect(legalPeriodCalculationService?.computeCanonicalLegalPeriod).not.toHaveBeenCalled();
  });

  it("deliveredAt yoksa ve flag açıksa + Tebligat yoksa null döner (mevcut davranış, regresyon)", async () => {
    process.env.LEGAL_TIME_CUTOVER = "true";
    const { engine } = makeEngine({
      caseRow: makeCaseRow("WAITING_RESPONSE", { notifications: [] }),
      tebligat: null,
    });

    const result = await engine.calculateNextActionTime(caseId, tenantId);

    expect(result).toBeNull();
  });
});
