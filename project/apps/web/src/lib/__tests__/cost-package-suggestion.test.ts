/**
 * Masraf paketi önerisi — eksik önerinin gösterim yardımcısı. Karar ve metin sunucudandır; istemci tutar üretmez.
 */
import { describe, expect, it } from "vitest";
import { notCalculableLabels, type CostPackageIncompleteSuggestion } from "../cost-package-suggestion";

const incomplete = (labels: string[]): CostPackageIncompleteSuggestion => ({
  reasonCode: "COST_PACKAGE_FX_BASIS_POLICY_MISSING",
  message: "Paket önerisi eksik.",
  requiredInfo: labels.map((label) => `${label} tutarı (TL)`),
  notCalculableItems: labels.map((label, index) => ({ itemCode: `KALEM_${index}`, label, isEditable: true, sortOrder: index })),
  caseCurrency: "USD",
  basisCurrencies: ["USD"],
  tariffCurrency: "TRY",
});

describe("notCalculableLabels", () => {
  it("hesaplanamayan kalemleri sunucunun gönderdiği adla ve sırayla sayar", () => {
    expect(notCalculableLabels(incomplete(["Peşin Harç"]))).toBe("Peşin Harç");
    expect(notCalculableLabels(incomplete(["Peşin Harç", "Tahsil Harcı"]))).toBe("Peşin Harç, Tahsil Harcı");
  });

  it("eksik öneri yoksa (TL dosya / oranlı kalemi olmayan paket) boştur", () => {
    expect(notCalculableLabels(null)).toBe("");
    expect(notCalculableLabels(undefined)).toBe("");
    expect(notCalculableLabels(incomplete([]))).toBe("");
  });
});
