import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  aggregateOcrInstruments,
  findOcrDuplicateOfClaimRaw,
  ocrDuplicateMessage,
  ocrInstrumentsOf,
} from "@/lib/wizard-ocr-instruments";
import type { CaseInstrumentPayload } from "@/components/debtor/ocr-instrument";

/**
 * K3-L (owner GO 2026-09-30 madde 3) — evrak taramasından gelen kambiyo kayıtları alacak kalemleri adımında görünür;
 * tek kaynak sihirbazın `instruments` durumu. Aynı evrak elle ikinci kez eklenmez (ikinci anapara kaydı olmaz), toplam
 * kalem listesi toplamından ayrı gösterilir (aynı para iki kez sayılmaz).
 */
const ocrCek = (over: Partial<CaseInstrumentPayload> = {}): CaseInstrumentPayload => ({
  type: "CEK",
  amount: 15000.5,
  issueDate: "2026-01-10",
  documentNo: "CK 1234",
  currency: "TRY",
  ...over,
});
const manualCekRaw = (over: Record<string, unknown> = {}) => ({
  kalemTuru: "CEK",
  bakiyeTutar: 15000.5,
  currency: "TRY",
  cekBilgileri: { cekSeriNo: "ck1234" },
  ...over,
});

describe("taramadan gelen kayıtlar", () => {
  it("elle girilen kambiyo (source MANUAL) listeye karışmaz", () => {
    expect(ocrInstrumentsOf([ocrCek(), ocrCek({ source: "MANUAL" }), ocrCek({ source: "OCR" })])).toHaveLength(2);
  });

  it("toplam para birimi bazında, kuruş kesin; geçersiz / sıfır tutar sayılmaz", () => {
    expect(
      aggregateOcrInstruments([
        ocrCek({ amount: 0.1 }),
        ocrCek({ amount: 0.2 }),
        ocrCek({ amount: 100, currency: "USD" }),
        ocrCek({ amount: 0 }),
        ocrCek({ amount: 5, source: "MANUAL" }),
      ]),
    ).toEqual([
      { currency: "TRY", amount: 0.3, count: 2 },
      { currency: "USD", amount: 100, count: 1 },
    ]);
  });
});

describe("aynı evrak elle ikinci kez eklenmez", () => {
  it("tür + numara (boşluk / harf farkı yok sayılır) + tutar + para birimi aynıysa eşleşir", () => {
    expect(findOcrDuplicateOfClaimRaw(manualCekRaw(), [ocrCek()])).toMatchObject({ documentNo: "CK 1234" });
    expect(
      findOcrDuplicateOfClaimRaw(
        { kalemTuru: "SENET", bakiyeTutar: 700, currency: "TRY", senetBilgileri: { senetNo: "S-9" } },
        [ocrCek({ type: "SENET", documentNo: "s-9", amount: 700 })],
      ),
    ).not.toBeNull();
  });

  it.each([
    ["farklı tutar", manualCekRaw({ bakiyeTutar: 15000.51 })],
    ["farklı numara", manualCekRaw({ cekBilgileri: { cekSeriNo: "CK1235" } })],
    ["farklı para birimi", manualCekRaw({ currency: "USD" })],
    ["farklı tür (senet)", { kalemTuru: "SENET", bakiyeTutar: 15000.5, currency: "TRY", senetBilgileri: { senetNo: "CK1234" } }],
    ["numarasız kalem", manualCekRaw({ cekBilgileri: {} })],
    ["kambiyo dışı kalem", { kalemTuru: "FATURA", bakiyeTutar: 15000.5 }],
  ])("%s → eşleşme yok", (_label, raw) => {
    expect(findOcrDuplicateOfClaimRaw(raw, [ocrCek()])).toBeNull();
  });

  it("elle girilmiş (MANUAL) kayıtla karşılaştırılmaz; mesaj numarayı ve sonucu söyler", () => {
    expect(findOcrDuplicateOfClaimRaw(manualCekRaw(), [ocrCek({ source: "MANUAL" })])).toBeNull();
    const msg = ocrDuplicateMessage(ocrCek());
    expect(msg).toContain("CK 1234 numaralı çek");
    expect(msg).toContain("iki anapara kaydı");
  });
});

describe("sihirbaz sayfası (kaynak kilidi)", () => {
  const page = readFileSync("src/app/(dashboard)/cases/new/page.tsx", "utf8");

  it("liste ve toplam tek kaynaktan (instruments) türetilir; kalem listesine KOPYALANMAZ", () => {
    expect(page).toContain("const ocrInstruments = ocrInstrumentsOf(instruments);");
    expect(page).toContain("const ocrInstrumentAggregates = aggregateOcrInstruments(instruments);");
    expect(page).toContain('data-testid="wizard-ocr-instruments"');
    expect(page).not.toMatch(/applyClaimDraftItems\([^)]*ocrInstruments/);
    expect(page).not.toMatch(/setInstruments\([^)]*claimDraftItems/);
  });

  it("aynı evrak hem eklemede hem gönderimde reddedilir", () => {
    expect(page).toContain("const ocrDuplicate = findOcrDuplicateOfClaimRaw(claimFormBuffer, instruments);");
    expect(page).toContain("for (const raw of [...claimDraftItems.map((ci) => ci.raw), ...(pendingRaw ? [pendingRaw] : [])]) {");
    expect(page.match(/setError\(ocrDuplicateMessage\(ocrDuplicate\)\);/g) ?? []).toHaveLength(2);
  });
});
