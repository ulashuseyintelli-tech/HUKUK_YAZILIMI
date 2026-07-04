/**
 * ACT-04 (G3, PR-A1d-pre §3.3) — endorsement-region-classifier unit testleri.
 * ANA GUARD: yalnız CIRO/BANKA_SERHI/IPTAL (+UNKNOWN fallback) üretir; "KONKORDATO" gibi
 * kapsam-dışı bir değer AI'dan gelse bile ASLA sızmaz (normalizeClassification UNKNOWN'a düşürür).
 * Production call-site henüz YOK (wiring ayrı, owner-gated faz).
 */

import {
  classifyEndorsementRegion,
  classifyEndorsementRegions,
  normalizeClassification,
  buildRegionContext,
  REGION_CLASSIFICATION_PROMPT,
  RegionClassifier,
  __testing,
} from "../endorsement-region-classifier";
import { EndorsementRegion } from "../endorsement-region-detector";

function region(over: Partial<EndorsementRegion> = {}): EndorsementRegion {
  return {
    vertical: "MIDDLE",
    horizontal: "CENTER",
    visibility: "CLEAR",
    cancellationOverlap: false,
    confidence: 80,
    ...over,
  };
}

describe("REGION_CLASSIFICATION_PROMPT", () => {
  const norm = REGION_CLASSIFICATION_PROMPT.replace(/İ/g, "i").replace(/I/g, "ı").toLowerCase();

  it("üç kategoriyi (CIRO/BANKA_SERHI/IPTAL) açıkça içerir", () => {
    // Kategori isimleri kod-tanımlayıcısı (ASCII "I") — Türkçe İ/I normalize dönüşümüne
    // sokmadan HAM prompt üzerinde kontrol edilir (mekanik transform "SERHI"yi "serhı" yapar,
    // doğal Türkçe metin değil bu, yanlış-negatif riskini önlemek için ham string kullanılır).
    expect(REGION_CLASSIFICATION_PROMPT).toContain("CIRO");
    expect(REGION_CLASSIFICATION_PROMPT).toContain("BANKA_SERHI");
    expect(REGION_CLASSIFICATION_PROMPT).toContain("IPTAL");
  });

  it("KONKORDATO'nun bir kategori OLMADIĞINI açıkça belirtir (Master Triage kontaminasyonu koruması)", () => {
    expect(norm).toContain("konkordato");
    expect(norm).toContain("diye bir sınıf yok");
  });

  it("sıra/zincir/isim çıkarımı yapmamayı söyler (§3.5+ kapsam dışı)", () => {
    expect(norm).toMatch(/isim ç[ıi]karma/);
  });
});

describe("buildRegionContext", () => {
  it("konum + görünürlük bilgisini içerir, cevabı DİKTE ETMEZ", () => {
    const ctx = buildRegionContext(region({ vertical: "BOTTOM", horizontal: "LEFT", visibility: "FAINT" }));
    expect(ctx).toContain("BOTTOM");
    expect(ctx).toContain("LEFT");
    expect(ctx).toContain("FAINT");
    expect(ctx).not.toMatch(/CIRO|BANKA_SERHI|IPTAL/);
  });

  it("cancellationOverlap=true ise üst-üste binme notunu ekler", () => {
    const ctx = buildRegionContext(region({ cancellationOverlap: true }));
    expect(ctx).toContain("başka bir işaret");
  });

  it("cancellationOverlap=false ise üst-üste binme notu YOK", () => {
    const ctx = buildRegionContext(region({ cancellationOverlap: false }));
    expect(ctx).not.toContain("başka bir işaret");
  });

  it("ACT-03'ten gelen rationale varsa bağlama eklenir", () => {
    const ctx = buildRegionContext(region({ rationale: "sayfa altında soluk kaşe" }));
    expect(ctx).toContain("sayfa altında soluk kaşe");
  });
});

describe("normalizeClassification", () => {
  it("geçerli tipi olduğu gibi geçirir", () => {
    expect(normalizeClassification({ type: "CIRO", confidence: 85, rationale: "net imza" })).toEqual({
      type: "CIRO",
      confidence: 85,
      rationale: "net imza",
    });
  });

  it("BANKA_SERHI ve IPTAL de geçerli kabul edilir", () => {
    expect(normalizeClassification({ type: "BANKA_SERHI", confidence: 70 }).type).toBe("BANKA_SERHI");
    expect(normalizeClassification({ type: "IPTAL", confidence: 60 }).type).toBe("IPTAL");
  });

  it("'KONKORDATO' AI'dan gelse bile UNKNOWN'a düşer (asla 4. kategoriye sızmaz)", () => {
    const out = normalizeClassification({ type: "KONKORDATO", confidence: 90 });
    expect(out.type).toBe("UNKNOWN");
  });

  it("herhangi bir geçersiz/uydurma tip → UNKNOWN", () => {
    expect(normalizeClassification({ type: "GARBAGE", confidence: 50 }).type).toBe("UNKNOWN");
    expect(normalizeClassification({ type: 123, confidence: 50 }).type).toBe("UNKNOWN");
    expect(normalizeClassification({ confidence: 50 }).type).toBe("UNKNOWN");
  });

  it("confidence 0-100 aralığına clamp edilir", () => {
    expect(normalizeClassification({ type: "CIRO", confidence: 150 }).confidence).toBe(100);
    expect(normalizeClassification({ type: "CIRO", confidence: -10 }).confidence).toBe(0);
  });

  it("rationale çok uzunsa kırpılır", () => {
    const long = "y".repeat(500);
    expect(normalizeClassification({ type: "CIRO", confidence: 50, rationale: long }).rationale!.length).toBe(
      __testing.MAX_RATIONALE_LEN,
    );
  });

  it("null/undefined/dizi girdi → UNKNOWN + confidence 0 (crash yok)", () => {
    expect(normalizeClassification(null)).toEqual({ type: "UNKNOWN", confidence: 0, rationale: undefined });
    expect(normalizeClassification(undefined)).toEqual({ type: "UNKNOWN", confidence: 0, rationale: undefined });
    expect(normalizeClassification([1, 2, 3])).toEqual({ type: "UNKNOWN", confidence: 0, rationale: undefined });
  });
});

describe("classifyEndorsementRegion", () => {
  it("imageRef/text yoksa classifier'ı hiç ÇAĞIRMADAN UNKNOWN döner", async () => {
    const classifier = jest.fn().mockResolvedValue({ type: "CIRO", confidence: 90 });
    const out = await classifyEndorsementRegion(region(), {}, classifier as unknown as RegionClassifier);
    expect(out).toEqual({ type: "UNKNOWN", confidence: 0 });
    expect(classifier).not.toHaveBeenCalled();
  });

  it("imageRef verilirse classifier'a prompt + imageRef + regionContext geçer", async () => {
    const classifier = jest.fn().mockResolvedValue({ type: "CIRO", confidence: 90 });
    await classifyEndorsementRegion(region({ vertical: "TOP" }), { imageRef: "/tmp/back.png" }, classifier as unknown as RegionClassifier);
    const arg = classifier.mock.calls[0][0];
    expect(arg.prompt).toBe(REGION_CLASSIFICATION_PROMPT);
    expect(arg.imageRef).toBe("/tmp/back.png");
    expect(arg.regionContext).toContain("TOP");
  });

  it("gerçek AI çıktısını (CIRO, yüksek güven) doğru normalize eder", async () => {
    const classifier: RegionClassifier = async () => ({ type: "CIRO", confidence: 92, rationale: "IŞIKLI AYAKKABI kaşesi net" });
    const out = await classifyEndorsementRegion(region(), { imageRef: "/tmp/x.png" }, classifier);
    expect(out.type).toBe("CIRO");
    expect(out.confidence).toBe(92);
  });

  it("banka şerhi senaryosu (Ziraat ibraz kaşesi) → BANKA_SERHI", async () => {
    const classifier: RegionClassifier = async () => ({
      type: "BANKA_SERHI",
      confidence: 88,
      rationale: "T.C. Ziraat Bankası ibraz kaşesi",
    });
    const out = await classifyEndorsementRegion(region(), { imageRef: "/tmp/x.png" }, classifier);
    expect(out.type).toBe("BANKA_SERHI");
  });

  it("iptal-üstü-binme sinyali taşıyan bölge → IPTAL sınıflandırması (round-1 KARBOY/İPTAL senaryosu benzeri)", async () => {
    const classifier: RegionClassifier = async (input) => {
      // AI, regionContext'teki üst-üste-binme notunu kendi muhakemesiyle kullanır (mekanik değil).
      expect(input.regionContext).toContain("başka bir işaret");
      return { type: "IPTAL", confidence: 65, rationale: "çapraz çizgi + İPTAL ibaresi" };
    };
    const out = await classifyEndorsementRegion(region({ cancellationOverlap: true }), { imageRef: "/tmp/x.png" }, classifier);
    expect(out.type).toBe("IPTAL");
  });

  it("AI hatası çağırana fırlatılır (bu katman yutmaz — henüz canlı akışa wire değil)", async () => {
    const classifier: RegionClassifier = async () => {
      throw new Error("vision call failed");
    };
    await expect(classifyEndorsementRegion(region(), { imageRef: "/tmp/x.png" }, classifier)).rejects.toThrow(
      "vision call failed",
    );
  });
});

describe("classifyEndorsementRegions (batch)", () => {
  it("her bölgeyi ayrı ayrı sınıflar, sırayı korur", async () => {
    const regions = [region({ vertical: "TOP" }), region({ vertical: "MIDDLE" }), region({ vertical: "BOTTOM", cancellationOverlap: true })];
    const classifier: RegionClassifier = async (input) => {
      if (input.regionContext.includes("TOP")) return { type: "CIRO", confidence: 90 };
      if (input.regionContext.includes("BOTTOM")) return { type: "IPTAL", confidence: 60 };
      return { type: "BANKA_SERHI", confidence: 80 };
    };
    const out = await classifyEndorsementRegions(regions, { imageRef: "/tmp/x.png" }, classifier);
    expect(out.map((r) => r.type)).toEqual(["CIRO", "BANKA_SERHI", "IPTAL"]);
  });

  it("boş bölge listesi → boş sonuç, classifier hiç çağrılmaz", async () => {
    const classifier = jest.fn().mockResolvedValue({ type: "CIRO", confidence: 90 });
    const out = await classifyEndorsementRegions([], { imageRef: "/tmp/x.png" }, classifier as unknown as RegionClassifier);
    expect(out).toEqual([]);
    expect(classifier).not.toHaveBeenCalled();
  });
});
