import { DebtorService } from "./debtor.service";

/**
 * COK_YUKSEK / RISK_BANKRUPTCY MAPPING FIX.
 *
 * Manuel `Debtor.riskLevel === "COK_YUKSEK"` artık `RISK_BANKRUPTCY`/"İflas riski"
 * DEĞİL, `RISK_VERY_HIGH`/"Çok yüksek risk (manuel değerlendirme)" üretir
 * (severity DANGER korunur). RISK_BANKRUPTCY gerçek/doğrulanmış iflas sinyali
 * için rezerve kalır. Saf birim test: calculateDebtorIssues girdilerden hesap
 * yapan private bir metottur; prototype üzerinden çağrılır (DB/DI yok).
 */
describe("DebtorService — COK_YUKSEK → RISK_VERY_HIGH mapping", () => {
  function callCalculateIssues(riskLevel: string | null) {
    const svc = Object.create(DebtorService.prototype) as DebtorService;
    const caseDebtor = {
      serviceStatus: "DELIVERED",
      deliveredDate: new Date(),
      updatedAt: new Date(),
      assetLastQueryAt: new Date(),
    };
    const debtor = {
      type: "INDIVIDUAL",
      identityNo: "12345678901",
      phone: "5551112233",
      email: "borclu@example.com",
      riskLevel,
    };
    const address = { id: "addr-1" };
    return (svc as any).calculateDebtorIssues(caseDebtor, debtor, address) as Array<{
      code: string;
      level: string;
      label: string;
    }>;
  }

  it("COK_YUKSEK → RISK_VERY_HIGH / 'Çok yüksek risk (manuel değerlendirme)' / DANGER üretir", () => {
    const issues = callCalculateIssues("COK_YUKSEK");
    const riskIssues = issues.filter((i) => i.code.startsWith("RISK_"));

    expect(riskIssues).toEqual([
      {
        code: "RISK_VERY_HIGH",
        level: "DANGER",
        label: "Çok yüksek risk (manuel değerlendirme)",
      },
    ]);
  });

  it("REGRESYON: COK_YUKSEK artık RISK_BANKRUPTCY/'İflas riski' ÜRETMEZ", () => {
    const issues = callCalculateIssues("COK_YUKSEK");

    expect(issues.some((i) => i.code === "RISK_BANKRUPTCY")).toBe(false);
    expect(issues.some((i) => i.label === "İflas riski")).toBe(false);
  });

  it.each(["YUKSEK", "ORTA", "DUSUK"])(
    "diğer seviyeler değişmedi: %s hiçbir RISK_* issue üretmez",
    (riskLevel) => {
      const issues = callCalculateIssues(riskLevel);
      expect(issues.filter((i) => i.code.startsWith("RISK_"))).toEqual([]);
    },
  );

  it("riskLevel yoksa RISK_* issue üretilmez", () => {
    const issues = callCalculateIssues(null);
    expect(issues.filter((i) => i.code.startsWith("RISK_"))).toEqual([]);
  });
});
