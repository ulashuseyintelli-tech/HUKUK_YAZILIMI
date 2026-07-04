/**
 * ACT-05 (G4, PR-A1d-pre §3.4) — endorsement-completeness-scoring unit testleri.
 * ANA GUARD: yalnız CIRO+UNKNOWN risk adayı; BANKA_SERHI/IPTAL asla ciroCount'a veya risk
 * sayımına girmez. Round-2 dataset'e bağımlı değildir (sentetik girdiler kullanılır).
 * Production call-site henüz YOK (wiring ayrı, owner-gated faz — §3.5/§3.6 kapsamı).
 */

import {
  scoreCompleteness,
  isAtRiskRegion,
  RegionCompletenessInput,
  __testing,
} from "../endorsement-completeness-scoring";
import { EndorsementRegion } from "../endorsement-region-detector";
import { RegionClassification } from "../endorsement-region-classifier";

function region(over: Partial<EndorsementRegion> = {}): EndorsementRegion {
  return {
    vertical: "MIDDLE",
    horizontal: "CENTER",
    visibility: "CLEAR",
    cancellationOverlap: false,
    confidence: 90,
    ...over,
  };
}

function classification(over: Partial<RegionClassification> = {}): RegionClassification {
  return {
    type: "CIRO",
    confidence: 90,
    ...over,
  };
}

function pair(
  regionOver: Partial<EndorsementRegion> = {},
  classificationOver: Partial<RegionClassification> = {},
): RegionCompletenessInput {
  return { region: region(regionOver), classification: classification(classificationOver) };
}

describe("scoreCompleteness", () => {
  it("hiç bölge yoksa OK döner (boş sayfa completeness riski değildir)", () => {
    const result = scoreCompleteness([]);
    expect(result).toEqual({ ciroCount: 0, atRiskCount: 0, completeness: "OK", warning: undefined });
  });

  it("tüm bölgeler net (CLEAR) ve yüksek-güven CIRO ise OK döner, uyarı yok", () => {
    const result = scoreCompleteness([pair(), pair(), pair()]);
    expect(result.ciroCount).toBe(3);
    expect(result.atRiskCount).toBe(0);
    expect(result.completeness).toBe("OK");
    expect(result.warning).toBeUndefined();
  });

  it("düşük-güven CIRO bölgesi varsa completeness LOW ve uyarı doludur", () => {
    const result = scoreCompleteness([pair(), pair({}, { confidence: 20 })]);
    expect(result.ciroCount).toBe(2);
    expect(result.atRiskCount).toBe(1);
    expect(result.completeness).toBe("LOW");
    expect(result.warning).toBe(__testing.LOW_COMPLETENESS_WARNING);
  });

  it("kısmi/soluk/üst-üste-binmiş (PARTIAL/FAINT/OVERLAPPING) görünürlük LOW üretir", () => {
    for (const visibility of ["PARTIAL", "FAINT", "OVERLAPPING"] as const) {
      const result = scoreCompleteness([pair({ visibility })]);
      expect(result.completeness).toBe("LOW");
    }
  });

  it("UNKNOWN sınıflandırma (belirsiz kaldı) da risk adayıdır — düşük güvenle LOW üretir", () => {
    const result = scoreCompleteness([pair({}, { type: "UNKNOWN", confidence: 10 })]);
    expect(result.ciroCount).toBe(0); // UNKNOWN ciroCount'a girmez
    expect(result.atRiskCount).toBe(1);
    expect(result.completeness).toBe("LOW");
  });

  it("UNKNOWN ama yüksek-güven+net görünürlük ise risk sayılmaz (nadir ama olası)", () => {
    const result = scoreCompleteness([pair({}, { type: "UNKNOWN", confidence: 95 })]);
    expect(result.atRiskCount).toBe(0);
    expect(result.completeness).toBe("OK");
  });

  it("BANKA_SERHI hiçbir zaman ciroCount'a veya risk sayımına girmez (düşük güvenle bile)", () => {
    const result = scoreCompleteness([
      pair({ visibility: "PARTIAL" }, { type: "BANKA_SERHI", confidence: 5 }),
    ]);
    expect(result.ciroCount).toBe(0);
    expect(result.atRiskCount).toBe(0);
    expect(result.completeness).toBe("OK");
  });

  it("IPTAL hiçbir zaman ciroCount'a veya risk sayımına girmez (düşük güvenle bile)", () => {
    const result = scoreCompleteness([
      pair({ visibility: "OVERLAPPING", confidence: 5 }, { type: "IPTAL", confidence: 5 }),
    ]);
    expect(result.ciroCount).toBe(0);
    expect(result.atRiskCount).toBe(0);
    expect(result.completeness).toBe("OK");
  });

  it("karma sayfa: 2 net CIRO + 1 riskli CIRO + 1 BANKA_SERHI → ciroCount=3, atRisk=1, LOW", () => {
    const result = scoreCompleteness([
      pair(),
      pair(),
      pair({ visibility: "FAINT" }),
      pair({}, { type: "BANKA_SERHI" }),
    ]);
    expect(result.ciroCount).toBe(3);
    expect(result.atRiskCount).toBe(1);
    expect(result.completeness).toBe("LOW");
  });
});

describe("isAtRiskRegion", () => {
  it("eşik sınırında (tam LOW_CONFIDENCE_THRESHOLD) risk SAYILMAZ (< kullanılır, <= değil)", () => {
    const input = pair({}, { confidence: __testing.LOW_CONFIDENCE_THRESHOLD });
    expect(isAtRiskRegion(input)).toBe(false);
  });

  it("eşiğin bir altı risk SAYILIR", () => {
    const input = pair({}, { confidence: __testing.LOW_CONFIDENCE_THRESHOLD - 1 });
    expect(isAtRiskRegion(input)).toBe(true);
  });

  it("region.confidence düşük ama classification.confidence yüksekse yine de risk sayılır (ikisi de kontrol edilir)", () => {
    const input = pair({ confidence: 10 }, { confidence: 95 });
    expect(isAtRiskRegion(input)).toBe(true);
  });
});
