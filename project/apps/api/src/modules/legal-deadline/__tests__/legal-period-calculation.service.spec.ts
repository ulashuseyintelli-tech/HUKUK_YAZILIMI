/**
 * MPB-028(a) PR-3C — LegalPeriodCalculationService birim testleri (mock LegalDeadlineService
 * + mock ProceedingClassificationService).
 *
 * Endişe grupları: periodStartDate=+1 gün, max(...) formülü, UNRESOLVED zinciri (3 farklı
 * neden), SPECIFIC_PERFORMANCE caller-supplied fail-closed, hiçbir DB yazımı yapılmadığı.
 */
import { BadRequestException } from "@nestjs/common";
import { ProceedingType, RentalType, JudgmentExecutionType, NextActionType } from "@prisma/client";
import { LegalPeriodCalculationService } from "../legal-period-calculation.service";

function buildLegalDeadlineService(legalServiceDate: Date | null) {
  return {
    resolveLegalServiceDateForTebligat: jest.fn().mockResolvedValue(
      legalServiceDate ? { legalServiceDate, deadlineReasonCode: "DIRECT_DELIVERY", calculationRule: "DIRECT_NO_DELAY" } : null,
    ),
  } as any;
}

function buildClassificationService(classification: { proceedingType: ProceedingType; subTypeCode: string | null } | null) {
  return {
    resolveProceedingClassification: jest.fn().mockResolvedValue(classification),
  } as any;
}

describe("LegalPeriodCalculationService — RESOLVED senaryolar", () => {
  it("GENERAL_EXECUTION: periodStartDate=legalServiceDate+1, nextActionWaitingDays=max(7,7)=7", async () => {
    const legalServiceDate = new Date("2026-07-13T00:00:00Z");
    const svc = new LegalPeriodCalculationService(
      buildLegalDeadlineService(legalServiceDate),
      buildClassificationService({ proceedingType: ProceedingType.GENERAL_EXECUTION, subTypeCode: null }),
    );

    const result = await svc.computeCanonicalLegalPeriod({
      tenantId: "tenant-a",
      tebligatId: "teb-1",
      caseId: "case-1",
    });

    expect(result.status).toBe("RESOLVED");
    if (result.status !== "RESOLVED") throw new Error("unreachable");
    expect(result.periodStartDate).toEqual(new Date("2026-07-14T00:00:00Z"));
    expect(result.nextActionWaitingDays).toBe(7);
    expect(result.nextActionEligibleDate).toEqual(new Date("2026-07-20T00:00:00Z")); // +1 (start) + 7 - 1
    expect(result.nextActionType).toBe(NextActionType.HACIZ_REQUEST_ELIGIBLE);
  });

  it("RENT.CROP: max(7, 60)=60 — itiraz süresi ödeme/tahliye süresinden kısa olduğunda tahliye kazanır", async () => {
    const legalServiceDate = new Date("2026-01-01T00:00:00Z");
    const svc = new LegalPeriodCalculationService(
      buildLegalDeadlineService(legalServiceDate),
      buildClassificationService({ proceedingType: ProceedingType.RENT, subTypeCode: RentalType.CROP }),
    );

    const result = await svc.computeCanonicalLegalPeriod({
      tenantId: "tenant-a",
      tebligatId: "teb-1",
      caseId: "case-1",
    });

    expect(result.status).toBe("RESOLVED");
    if (result.status !== "RESOLVED") throw new Error("unreachable");
    expect(result.nextActionWaitingDays).toBe(60);
  });

  it("JUDGMENT_ENFORCEMENT.SPECIFIC_PERFORMANCE: caller-supplied performanceDays kullanılır", async () => {
    const legalServiceDate = new Date("2026-01-01T00:00:00Z");
    const svc = new LegalPeriodCalculationService(
      buildLegalDeadlineService(legalServiceDate),
      buildClassificationService({
        proceedingType: ProceedingType.JUDGMENT_ENFORCEMENT,
        subTypeCode: JudgmentExecutionType.SPECIFIC_PERFORMANCE,
      }),
    );

    const result = await svc.computeCanonicalLegalPeriod({
      tenantId: "tenant-a",
      tebligatId: "teb-1",
      caseId: "case-1",
      callerSuppliedPerformanceDays: 45,
    });

    expect(result.status).toBe("RESOLVED");
    if (result.status !== "RESOLVED") throw new Error("unreachable");
    expect(result.performanceDays).toBe(45);
    expect(result.nextActionWaitingDays).toBe(45);
  });

  it("JUDGMENT_ENFORCEMENT.SPECIFIC_PERFORMANCE: callerSuppliedPerformanceDays eksikse fail-closed", async () => {
    const svc = new LegalPeriodCalculationService(
      buildLegalDeadlineService(new Date("2026-01-01T00:00:00Z")),
      buildClassificationService({
        proceedingType: ProceedingType.JUDGMENT_ENFORCEMENT,
        subTypeCode: JudgmentExecutionType.SPECIFIC_PERFORMANCE,
      }),
    );

    await expect(
      svc.computeCanonicalLegalPeriod({ tenantId: "tenant-a", tebligatId: "teb-1", caseId: "case-1" }),
    ).rejects.toThrow(BadRequestException);
  });

  it.each([-1, 0, 1.5, 400])(
    "JUDGMENT_ENFORCEMENT.SPECIFIC_PERFORMANCE: geçersiz callerSuppliedPerformanceDays (%s) fail-closed",
    async (invalidValue) => {
      const svc = new LegalPeriodCalculationService(
        buildLegalDeadlineService(new Date("2026-01-01T00:00:00Z")),
        buildClassificationService({
          proceedingType: ProceedingType.JUDGMENT_ENFORCEMENT,
          subTypeCode: JudgmentExecutionType.SPECIFIC_PERFORMANCE,
        }),
      );

      await expect(
        svc.computeCanonicalLegalPeriod({
          tenantId: "tenant-a",
          tebligatId: "teb-1",
          caseId: "case-1",
          callerSuppliedPerformanceDays: invalidValue,
        }),
      ).rejects.toThrow(BadRequestException);
    },
  );
});

describe("LegalPeriodCalculationService — UNRESOLVED zinciri (fail-closed, tahmin yok)", () => {
  it("classification null ise PROCEEDING_TYPE_UNRESOLVED", async () => {
    const svc = new LegalPeriodCalculationService(buildLegalDeadlineService(new Date()), buildClassificationService(null));

    const result = await svc.computeCanonicalLegalPeriod({ tenantId: "tenant-a", tebligatId: "teb-1", caseId: "case-1" });

    expect(result).toEqual({ status: "UNRESOLVED", reason: "PROCEEDING_TYPE_UNRESOLVED" });
  });

  it("kural bulunamazsa (PLEDGE) LEGAL_PERIOD_RULE_UNRESOLVED", async () => {
    const svc = new LegalPeriodCalculationService(
      buildLegalDeadlineService(new Date()),
      buildClassificationService({ proceedingType: ProceedingType.PLEDGE, subTypeCode: null }),
    );

    const result = await svc.computeCanonicalLegalPeriod({ tenantId: "tenant-a", tebligatId: "teb-1", caseId: "case-1" });

    expect(result).toEqual({ status: "UNRESOLVED", reason: "LEGAL_PERIOD_RULE_UNRESOLVED" });
  });

  it("legalServiceDate hesaplanamazsa LEGAL_SERVICE_DATE_UNRESOLVED", async () => {
    const svc = new LegalPeriodCalculationService(
      buildLegalDeadlineService(null),
      buildClassificationService({ proceedingType: ProceedingType.GENERAL_EXECUTION, subTypeCode: null }),
    );

    const result = await svc.computeCanonicalLegalPeriod({ tenantId: "tenant-a", tebligatId: "teb-1", caseId: "case-1" });

    expect(result).toEqual({ status: "UNRESOLVED", reason: "LEGAL_SERVICE_DATE_UNRESOLVED" });
  });
});

describe("LegalPeriodCalculationService — read-only (owner Decision: Representative Evidence kapsam dışı)", () => {
  it("hiçbir Prisma yazma metodu servislere enjekte edilmez / çağrılmaz (yalnız resolveLegalServiceDateForTebligat + resolveProceedingClassification çağrılır)", async () => {
    const legalDeadlineService = buildLegalDeadlineService(new Date("2026-01-01T00:00:00Z"));
    const classificationService = buildClassificationService({
      proceedingType: ProceedingType.GENERAL_EXECUTION,
      subTypeCode: null,
    });
    const svc = new LegalPeriodCalculationService(legalDeadlineService, classificationService);

    await svc.computeCanonicalLegalPeriod({ tenantId: "tenant-a", tebligatId: "teb-1", caseId: "case-1" });

    expect(legalDeadlineService.resolveLegalServiceDateForTebligat).toHaveBeenCalledTimes(1);
    expect(classificationService.resolveProceedingClassification).toHaveBeenCalledTimes(1);
  });
});
