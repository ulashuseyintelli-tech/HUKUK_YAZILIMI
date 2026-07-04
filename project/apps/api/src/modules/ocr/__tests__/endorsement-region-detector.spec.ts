/**
 * ACT-03 (G2, PR-A1d-pre §3.2) — endorsement-region-detector unit testleri.
 * ANA GUARD: bu modül YALNIZ nitel bölge tespiti üretir; isim/sınıflandırma/sıra YOK,
 * production OCR akışından çağrılan bir call-site henüz YOK (wiring ayrı, owner-gated faz).
 */

import {
  detectEndorsementRegions,
  normalizeRegions,
  REGION_DETECTION_PROMPT,
  RegionDetector,
  EndorsementRegion,
  __testing,
} from "../endorsement-region-detector";

describe("REGION_DETECTION_PROMPT", () => {
  const norm = REGION_DETECTION_PROMPT.replace(/İ/g, "i").replace(/I/g, "ı").toLowerCase();

  it("bölge/konum/görünürlük odaklıdır, isim/sınıflandırma çıkarmamayı açıkça söyler", () => {
    expect(norm).toContain("bölge");
    expect(norm).toContain("vertical");
    expect(norm).toContain("visibility");
    expect(norm).toContain("cancellationoverlap");
    // İ/I Türkçe dönüşüm belirsizliğinden kaçınmak için regex-tolerant kontrol (endorsement-extractor
    // testindeki [ıi] deseniyle tutarlı) — tam karakter kompozisyonuna bağımlı olmadan anlamı doğrular.
    expect(norm).toMatch(/[iı]sim ç[ıi]karma/);
  });

  it("sınıflandırma yapmamayı (ciro/banka şerhi/iptal) açıkça dışlar", () => {
    expect(norm).toContain("sınıflandırma yapma");
  });
});

describe("normalizeRegions", () => {
  it("geçerli bölgeyi olduğu gibi geçirir", () => {
    const out = normalizeRegions([
      {
        vertical: "BOTTOM",
        horizontal: "LEFT",
        visibility: "FAINT",
        cancellationOverlap: false,
        confidence: 72,
        rationale: "sayfa altında soluk kaşe",
      },
    ]);
    expect(out).toEqual([
      {
        vertical: "BOTTOM",
        horizontal: "LEFT",
        visibility: "FAINT",
        cancellationOverlap: false,
        confidence: 72,
        rationale: "sayfa altında soluk kaşe",
      },
    ]);
  });

  it("geçersiz enum değerlerini UNKNOWN'a düşürür (uydurma/crash yerine güvenli varsayılan)", () => {
    const out = normalizeRegions([
      { vertical: "GARBAGE", horizontal: "NONSENSE", visibility: "???", cancellationOverlap: false, confidence: 50 },
    ]);
    expect(out[0].vertical).toBe("UNKNOWN");
    expect(out[0].horizontal).toBe("UNKNOWN");
    expect(out[0].visibility).toBe("UNKNOWN");
  });

  it("confidence 0-100 aralığına clamp edilir", () => {
    const out = normalizeRegions([
      { vertical: "TOP", horizontal: "CENTER", visibility: "CLEAR", cancellationOverlap: false, confidence: 150 },
      { vertical: "TOP", horizontal: "CENTER", visibility: "CLEAR", cancellationOverlap: false, confidence: -20 },
    ]);
    expect(out[0].confidence).toBe(100);
    expect(out[1].confidence).toBe(0);
  });

  it("cancellationOverlap yalnız literal true ise true olur (truthy-ama-değil-boolean → false)", () => {
    const out = normalizeRegions([
      { vertical: "TOP", horizontal: "CENTER", visibility: "CLEAR", cancellationOverlap: "yes", confidence: 50 },
    ]);
    expect(out[0].cancellationOverlap).toBe(false);
  });

  it("rationale çok uzunsa kırpılır", () => {
    const long = "x".repeat(500);
    const out = normalizeRegions([
      { vertical: "TOP", horizontal: "CENTER", visibility: "CLEAR", cancellationOverlap: false, confidence: 50, rationale: long },
    ]);
    expect(out[0].rationale!.length).toBe(__testing.MAX_RATIONALE_LEN);
  });

  it("boş/eksik rationale → undefined (uydurma yok)", () => {
    const out = normalizeRegions([
      { vertical: "TOP", horizontal: "CENTER", visibility: "CLEAR", cancellationOverlap: false, confidence: 50, rationale: "  " },
    ]);
    expect(out[0].rationale).toBeUndefined();
  });

  it("dizi olmayan girdi → boş dizi (crash yok)", () => {
    expect(normalizeRegions(null)).toEqual([]);
    expect(normalizeRegions(undefined)).toEqual([]);
    expect(normalizeRegions("garbage")).toEqual([]);
    expect(normalizeRegions({ not: "an array" })).toEqual([]);
  });

  it("dizi içindeki geçersiz (non-object) elemanları atlar, diğerlerini korur", () => {
    const out = normalizeRegions([
      null,
      "garbage",
      { vertical: "TOP", horizontal: "CENTER", visibility: "CLEAR", cancellationOverlap: false, confidence: 80 },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].vertical).toBe("TOP");
  });

  it(`enstrüman başına en fazla ${__testing.MAX_REGIONS_PER_PAGE} bölge kabul eder (garbage-in koruması)`, () => {
    const many = Array.from({ length: __testing.MAX_REGIONS_PER_PAGE + 10 }, () => ({
      vertical: "TOP",
      horizontal: "CENTER",
      visibility: "CLEAR",
      cancellationOverlap: false,
      confidence: 50,
    }));
    expect(normalizeRegions(many)).toHaveLength(__testing.MAX_REGIONS_PER_PAGE);
  });
});

describe("detectEndorsementRegions", () => {
  const mockDetector =
    (regions: EndorsementRegion[]): RegionDetector =>
    async () => ({ regions });

  it("imageRef/text yoksa detector'ı hiç ÇAĞIRMADAN boş dizi döner", async () => {
    const detector = jest.fn().mockResolvedValue({ regions: [] });
    const out = await detectEndorsementRegions({}, detector as unknown as RegionDetector);
    expect(out).toEqual([]);
    expect(detector).not.toHaveBeenCalled();
  });

  it("imageRef verilirse detector'a REGION_DETECTION_PROMPT + imageRef geçer", async () => {
    const detector = jest.fn().mockResolvedValue({ regions: [] });
    await detectEndorsementRegions({ imageRef: "/tmp/back.png" }, detector as unknown as RegionDetector);
    expect(detector).toHaveBeenCalledWith({
      prompt: REGION_DETECTION_PROMPT,
      imageRef: "/tmp/back.png",
      text: undefined,
    });
  });

  it("gerçek AI çıktısını (QNB round-1 senaryosu benzeri: KARBOY soluk + İPTAL üst-binme) doğru normalize eder", async () => {
    const detector = mockDetector([
      { vertical: "TOP", horizontal: "LEFT", visibility: "CLEAR", cancellationOverlap: false, confidence: 92, rationale: "IŞIKLI AYAKKABI kaşesi net" },
      { vertical: "MIDDLE", horizontal: "CENTER", visibility: "CLEAR", cancellationOverlap: false, confidence: 88 },
      { vertical: "BOTTOM", horizontal: "RIGHT", visibility: "FAINT", cancellationOverlap: true, confidence: 55, rationale: "soluk kaşe + üstünde çapraz çizgi" },
    ]);
    const out = await detectEndorsementRegions({ imageRef: "/tmp/qnb-back.png" }, detector);
    expect(out).toHaveLength(3);
    expect(out[2].cancellationOverlap).toBe(true);
    expect(out[2].visibility).toBe("FAINT");
  });

  it("AI hatası çağırana fırlatılır (bu katman yutmaz — endorsement-extractor'dan farklı: henüz canlı akışa wire değil)", async () => {
    const detector: RegionDetector = async () => {
      throw new Error("vision call failed");
    };
    await expect(detectEndorsementRegions({ imageRef: "/tmp/x.png" }, detector)).rejects.toThrow("vision call failed");
  });

  it("regions alanı eksik/undefined dönerse boş dizi verir (crash yok)", async () => {
    const detector: RegionDetector = async () => ({}) as any;
    const out = await detectEndorsementRegions({ imageRef: "/tmp/x.png" }, detector);
    expect(out).toEqual([]);
  });
});
