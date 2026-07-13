/**
 * MPB-028(a) PR-3C — legal-period-rule-matrix birim testleri.
 *
 * Owner'ın onayladığı TÜM kesin kombinasyonların doğru döndüğünü ve owner'ın açıkça
 * "doğrulanmamış süre kuralı ekleme; UNRESOLVED bırak" dediği ProceedingType'ların
 * (PLEDGE/MORTGAGE/bağımsız EVICTION/PUBLIC_RECEIVABLE) hiçbir kural döndürmediğini doğrular.
 */
import {
  ProceedingType,
  RentalType,
  BankruptcyType,
  JudgmentExecutionType,
  NextActionType,
} from "@prisma/client";
import { resolveLegalPeriodRule } from "../legal-period-rule-matrix";

describe("resolveLegalPeriodRule — owner onaylı kesin kurallar", () => {
  it("GENERAL_EXECUTION (Form 7): 7/7, toplam 7, HACIZ_REQUEST_ELIGIBLE", () => {
    const rule = resolveLegalPeriodRule(ProceedingType.GENERAL_EXECUTION);
    expect(rule).not.toBeNull();
    expect(rule).toMatchObject({
      objectionDays: 7,
      paymentDays: 7,
      vacateDays: null,
      performanceDays: null,
      complaintDays: null,
      nextActionType: NextActionType.HACIZ_REQUEST_ELIGIBLE,
    });
  });

  it("CAMBIO: itiraz 5, ödeme 10 — enstrüman türüne göre farklılaşmaz (owner Decision)", () => {
    const rule = resolveLegalPeriodRule(ProceedingType.CAMBIO);
    expect(rule).not.toBeNull();
    expect(rule).toMatchObject({
      objectionDays: 5,
      paymentDays: 10,
      nextActionType: NextActionType.HACIZ_REQUEST_ELIGIBLE,
    });
  });

  it.each([
    [RentalType.RESIDENTIAL_COMMERCIAL, 30],
    [RentalType.GENERAL, 10],
    [RentalType.CROP, 60],
    [RentalType.EVICTION_COMMITMENT, 15],
  ])("RENT.%s: itiraz 7, tahliye %i", (rentalType, expectedVacateDays) => {
    const rule = resolveLegalPeriodRule(ProceedingType.RENT, rentalType);
    expect(rule).not.toBeNull();
    expect(rule!.objectionDays).toBe(7);
    expect(rule!.vacateDays).toBe(expectedVacateDays);
    expect(rule!.paymentDays).toBeNull();
    expect(rule!.nextActionType).toBe(NextActionType.EVICTION_REQUEST_ELIGIBLE);
  });

  it("RENT (subType olmadan): UNRESOLVED — RENT tek başına yeterli değildir (owner Decision)", () => {
    expect(resolveLegalPeriodRule(ProceedingType.RENT)).toBeNull();
  });

  it("BANKRUPTCY.ORDINARY: 7/7", () => {
    const rule = resolveLegalPeriodRule(ProceedingType.BANKRUPTCY, BankruptcyType.ORDINARY);
    expect(rule).toMatchObject({
      objectionDays: 7,
      paymentDays: 7,
      nextActionType: NextActionType.BANKRUPTCY_REQUEST_ELIGIBLE,
    });
  });

  it("BANKRUPTCY.CAMBIO: 5/5 — adi iflasla aynı kategoride eritilmez (owner Decision)", () => {
    const rule = resolveLegalPeriodRule(ProceedingType.BANKRUPTCY, BankruptcyType.CAMBIO);
    expect(rule).toMatchObject({
      objectionDays: 5,
      paymentDays: 5,
      nextActionType: NextActionType.BANKRUPTCY_REQUEST_ELIGIBLE,
    });
  });

  it("BANKRUPTCY (subType olmadan): UNRESOLVED", () => {
    expect(resolveLegalPeriodRule(ProceedingType.BANKRUPTCY)).toBeNull();
  });

  it("JUDGMENT_ENFORCEMENT.MONEY_OR_SECURITY: 7 gün, FORCED_PERFORMANCE_ELIGIBLE", () => {
    const rule = resolveLegalPeriodRule(ProceedingType.JUDGMENT_ENFORCEMENT, JudgmentExecutionType.MONEY_OR_SECURITY);
    expect(rule).toMatchObject({
      performanceDays: 7,
      objectionDays: null,
      nextActionType: NextActionType.FORCED_PERFORMANCE_ELIGIBLE,
    });
  });

  it("JUDGMENT_ENFORCEMENT.MOVABLE_DELIVERY: 7 gün, FORCED_DELIVERY_ELIGIBLE", () => {
    const rule = resolveLegalPeriodRule(ProceedingType.JUDGMENT_ENFORCEMENT, JudgmentExecutionType.MOVABLE_DELIVERY);
    expect(rule).toMatchObject({
      performanceDays: 7,
      nextActionType: NextActionType.FORCED_DELIVERY_ELIGIBLE,
    });
  });

  it("JUDGMENT_ENFORCEMENT.IMMOVABLE_DELIVERY_OR_EVICTION: 7 gün tahliye, EVICTION_REQUEST_ELIGIBLE", () => {
    const rule = resolveLegalPeriodRule(
      ProceedingType.JUDGMENT_ENFORCEMENT,
      JudgmentExecutionType.IMMOVABLE_DELIVERY_OR_EVICTION,
    );
    expect(rule).toMatchObject({
      vacateDays: 7,
      nextActionType: NextActionType.EVICTION_REQUEST_ELIGIBLE,
    });
  });

  it("JUDGMENT_ENFORCEMENT.SPECIFIC_PERFORMANCE: sabit süre YOK, requiresCallerSuppliedPerformanceDays=true", () => {
    const rule = resolveLegalPeriodRule(ProceedingType.JUDGMENT_ENFORCEMENT, JudgmentExecutionType.SPECIFIC_PERFORMANCE);
    expect(rule).not.toBeNull();
    expect(rule!.performanceDays).toBeNull();
    expect(rule!.requiresCallerSuppliedPerformanceDays).toBe(true);
    expect(rule!.nextActionType).toBe(NextActionType.FORCED_PERFORMANCE_ELIGIBLE);
  });

  it("JUDGMENT_ENFORCEMENT.MORTGAGE_JUDGMENT: 30 gün, SALE_REQUEST_ELIGIBLE", () => {
    const rule = resolveLegalPeriodRule(ProceedingType.JUDGMENT_ENFORCEMENT, JudgmentExecutionType.MORTGAGE_JUDGMENT);
    expect(rule).toMatchObject({
      performanceDays: 30,
      nextActionType: NextActionType.SALE_REQUEST_ELIGIBLE,
    });
  });

  it("JUDGMENT_ENFORCEMENT (subType olmadan): UNRESOLVED — tek genel ILAMLI koduyla süre hesabı yapılmaz", () => {
    expect(resolveLegalPeriodRule(ProceedingType.JUDGMENT_ENFORCEMENT)).toBeNull();
  });
});

describe("resolveLegalPeriodRule — owner'ın açıkça UNRESOLVED bıraktığı ProceedingType'lar", () => {
  it.each([ProceedingType.PLEDGE, ProceedingType.MORTGAGE, ProceedingType.EVICTION, ProceedingType.PUBLIC_RECEIVABLE])(
    "%s: doğrulanmamış süre kuralı eklenmedi — UNRESOLVED",
    (proceedingType) => {
      expect(resolveLegalPeriodRule(proceedingType)).toBeNull();
    },
  );
});

describe("resolveLegalPeriodRule — hiçbir sonuç enstrüman ayrımı taşımaz (owner Decision)", () => {
  it("CAMBIO ve BANKRUPTCY.CAMBIO kuralları instrumentType alanı İÇERMEZ", () => {
    const cambio = resolveLegalPeriodRule(ProceedingType.CAMBIO);
    const bankruptcyCambio = resolveLegalPeriodRule(ProceedingType.BANKRUPTCY, BankruptcyType.CAMBIO);
    expect(cambio).not.toHaveProperty("instrumentType");
    expect(bankruptcyCambio).not.toHaveProperty("instrumentType");
  });
});
