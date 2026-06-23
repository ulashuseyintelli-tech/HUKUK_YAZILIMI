/**
 * A1d-pre G1 — orientation-robust extraction birim testi.
 * Fixture'lar GERÇEK round-1 gpt-4o ölçümünden (2026-06-23, QNB çeki 180° dönük):
 *   0°  → jenerik placeholder ("İlk Ciro"...)        [model isim okuyamadı]
 *   90° → "Süleyman Akbulut" ×4  conf .9             [YÜKSEK GÜVENLİ HALÜSİNASYON]
 *   180°→ "İklim Ayakkabı..."(≈İŞIKLI) + "Sünger San Plastik..."(=SÜNGERSAN) [DOĞRU açı]
 *   270°→ "EFELER MAK" / "DİLEK KAYA" ×2             [halüsinasyon]
 * Front-payee (ön-yüz lehtarı) = "İşıklı Ayakkabı Sanayi ve Ticaret".
 * KIRMIZI ÇİZGİ testi: 90° yüksek-confidence olmasına rağmen SEÇİLMEMELİ (confidence tek başına yetersiz).
 */
import {
  EndorsementItem,
  OrientationCandidate,
  isGenericPlaceholder,
  looksLikeRealEntity,
  tokenOverlap,
  isStrongZero,
  scoreCandidate,
  selectOrientation,
  extractWithAdaptiveOrientation,
} from "../endorsement-orientation";

const FRONT_PAYEE = ["İşıklı Ayakkabı Sanayi ve Ticaret"];

const ciro = (name: string, confidence: number, over: Partial<EndorsementItem> = {}): EndorsementItem => ({
  order: null, name, type: "CIRO", cancelled: false, confidence, ...over,
});

const R1 = {
  0: [ciro("İlk Ciro", 0.8), ciro("İkinci Ciro", 0.8), ciro("Üçüncü Ciro", 0.8), ciro("Dördüncü Ciro", 0.8), ciro("Beşinci Ciro", 0.8)],
  90: [ciro("Süleyman Akbulut", 0.9), ciro("Süleyman Akbulut", 0.9), ciro("Süleyman Akbulut", 0.9), ciro("Süleyman Akbulut", 0.9)],
  180: [
    ciro("İklim Ayakkabı Sanayi ve Ticaret Ltd. Şti.", 0.95),
    ciro("Sünger San Plastik ve Kauçuk Sanayi Ticaret Ltd. Şti.", 0.95),
    { order: null, name: "Banka Şerhi", type: "BANKA_SERHI" as const, cancelled: false, confidence: 0.9 },
  ],
  270: [ciro("EFELER MAK. İNŞ. SAN. VE TİC. LTD. ŞTİ.", 0.9), ciro("DİLEK KAYA", 0.9), ciro("DİLEK KAYA", 0.9)],
};
const cand = (angle: 0 | 90 | 180 | 270): OrientationCandidate => ({ angle, items: (R1 as any)[angle] });

describe("endorsement-orientation — saf yardımcılar", () => {
  it("isGenericPlaceholder: 'İlk Ciro'/'1. Ciro'/'İmza' jenerik; gerçek şirket değil", () => {
    expect(isGenericPlaceholder("İlk Ciro")).toBe(true);
    expect(isGenericPlaceholder("İkinci Ciro")).toBe(true);
    expect(isGenericPlaceholder("İmza")).toBe(true);
    expect(isGenericPlaceholder("İklim Ayakkabı Sanayi ve Ticaret Ltd. Şti.")).toBe(false);
  });

  it("looksLikeRealEntity: kurum eki veya ≥2 ayırt-edici token", () => {
    expect(looksLikeRealEntity("Sünger San Plastik Ltd. Şti.")).toBe(true);
    expect(looksLikeRealEntity("Süleyman Akbulut")).toBe(true);
    expect(looksLikeRealEntity("İlk Ciro")).toBe(false);
  });

  it("tokenOverlap: İşıklı↔İklim 'AYAKKABI' ortak → eşleşme; alakasız → 0", () => {
    expect(tokenOverlap("İklim Ayakkabı Sanayi ve Ticaret Ltd. Şti.", "İşıklı Ayakkabı Sanayi ve Ticaret")).toBeGreaterThan(0);
    expect(tokenOverlap("Süleyman Akbulut", "İşıklı Ayakkabı Sanayi ve Ticaret")).toBe(0);
  });
});

describe("endorsement-orientation — açı seçimi (round-1 gerçek fixture)", () => {
  it("DOĞRU açıyı (180°) seçer: gerçek cirantalar + front-payee eşleşmesi", () => {
    const sel = selectOrientation([cand(0), cand(90), cand(180), cand(270)], FRONT_PAYEE);
    expect(sel.chosenAngle).toBe(180);
    expect(sel.items.map((i) => i.name).join(" ")).toMatch(/Ayakkabı/);
  });

  it("🔴 KIRMIZI ÇİZGİ: 90° YÜKSEK CONFIDENCE (0.9) olmasına rağmen SEÇİLMEZ (halüsinasyon-güvenliği)", () => {
    const sel = selectOrientation([cand(0), cand(90), cand(180), cand(270)], FRONT_PAYEE);
    expect(sel.chosenAngle).not.toBe(90);
    const s90 = sel.audit.find((a) => a.angle === 90)!;
    const s180 = sel.audit.find((a) => a.angle === 180)!;
    // confidence yüksek ama tekrar-cezası + front-payee-eşleşmesizlik → 90 < 180
    expect(s90.score.confidence).toBeGreaterThanOrEqual(0.85); // gerçekten yüksek confidence
    expect(s90.score.total).toBeLessThan(s180.score.total); // yine de kaybeder
  });

  it("jenerik 0° en düşük skor (generic penalty)", () => {
    const sel = selectOrientation([cand(0), cand(90), cand(180), cand(270)], FRONT_PAYEE);
    const s0 = sel.audit.find((a) => a.angle === 0)!;
    const others = sel.audit.filter((a) => a.angle !== 0);
    for (const o of others) expect(s0.score.total).toBeLessThanOrEqual(o.score.total);
  });
});

describe("endorsement-orientation — isStrongZero / adaptif eskalasyon", () => {
  const strongZero: OrientationCandidate = {
    angle: 0,
    items: [ciro("İşıklı Ayakkabı Sanayi ve Ticaret Ltd. Şti.", 0.95), ciro("Süngersan Plastik Ltd. Şti.", 0.92)],
  };

  it("güçlü 0° (gerçek ad + front-payee eşleşme, jenerik yok) → eskalasyon YOK", () => {
    expect(isStrongZero(strongZero, FRONT_PAYEE)).toBe(true);
  });

  it("jenerik/zayıf 0° (round-1) → eskalasyon GEREKİR", () => {
    expect(isStrongZero(cand(0), FRONT_PAYEE)).toBe(false);
  });

  it("adaptif: güçlü 0° → yalnız 0° çağrılır (maliyet); diğer açılar denenmez", async () => {
    const calls: number[] = [];
    const extractAtAngle = async (a: 0 | 90 | 180 | 270) => { calls.push(a); return (strongZero.angle === a ? strongZero.items : []); };
    const sel = await extractWithAdaptiveOrientation(extractAtAngle as any, FRONT_PAYEE);
    expect(calls).toEqual([0]);
    expect(sel.chosenAngle).toBe(0);
  });

  it("adaptif: zayıf 0° → 4 açı denenir → 180° seçilir", async () => {
    const calls: number[] = [];
    const extractAtAngle = async (a: 0 | 90 | 180 | 270) => { calls.push(a); return (R1 as any)[a]; };
    const sel = await extractWithAdaptiveOrientation(extractAtAngle as any, FRONT_PAYEE);
    expect(calls.sort((x, y) => x - y)).toEqual([0, 90, 180, 270]);
    expect(sel.chosenAngle).toBe(180);
  });
});
