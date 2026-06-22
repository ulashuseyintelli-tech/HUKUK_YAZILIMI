/**
 * D — OCR GÜVENLİK İNVARYANTLARI (characterization safety-net).
 *
 * AMAÇ: Faz 3 (arka-yüz OCR) / payee-kalite / avalist çalışmaları ÖNCESİ regresyon ağı —
 * MEVCUT davranışı KİLİTLER. Yeni behavior YOK · production code YOK · yalnız invariant.
 * Bir test KIRILIRSA = bilinçli bir davranış değişikliği kararı gerektirir (sessiz kayma değil).
 *
 * Alan 4 (payeeName chain NODE'a dönüşmez) mapper'a ait → cross-module test import'undan
 * kaçınmak için `case/__tests__/ocr-instrument-to-case-instrument.mapper.spec.ts`'te (D-INV-4).
 */
import { applyEndorsementPass, EndorsementExtractor } from "../endorsement-extractor";
import { capConfidenceForPrintDateAmbiguity } from "../page-candidate-extractor";
import { Instrument, PageCandidate } from "../debt-instrument.types";
import { Page } from "../pdf-segmentation";

const cek = (over: Partial<Instrument> = {}): Instrument => ({
  type: "CEK",
  currency: "TRY",
  confidence: 90,
  drawerName: "GORKA KOZMETİK SAN. VE TİC. A.Ş.",
  amount: 400000,
  documentNo: "0265895",
  issueDate: "2025-12-30",
  bankName: "X Bank",
  sourcePages: [2],
  ...over,
});
const backCand = (idx: number): PageCandidate => ({
  pageIndex: idx,
  face: false,
  back: true,
  endorsementMarkers: true,
});
const imgPage = (idx: number): Page => ({
  pageIndex: idx,
  kind: "IMAGE",
  hasText: false,
  needsImageExtraction: true,
  imageRef: `/tmp/p${idx}.png`,
  source: "pdf-parse",
});
const names =
  (list: string[]): EndorsementExtractor =>
  async () => ({ endorsementNames: list });

describe("D-INV-1: endorsementNames — ham isim listesi; cap'li; ön-yüz IMMUTABLE", () => {
  it("20'den fazla aday → MAX 20 (garbage-in cap)", async () => {
    const inst = cek();
    const many = Array.from({ length: 25 }, (_, i) => `Ciranta ${i + 1}`);
    await applyEndorsementPass([inst], [backCand(2)], [imgPage(2)], names(many));
    expect(inst.endorsementNames).toHaveLength(20);
  });

  it("çok uzun isim → 120 karaktere trim", async () => {
    const inst = cek();
    await applyEndorsementPass([inst], [backCand(2)], [imgPage(2)], names(["A".repeat(130)]));
    expect(inst.endorsementNames?.[0]).toHaveLength(120);
  });

  it("ön-yüz alanları (drawerName/amount/issueDate/documentNo/currency) DEĞİŞMEZ", async () => {
    const inst = cek();
    const before = {
      drawerName: inst.drawerName,
      amount: inst.amount,
      issueDate: inst.issueDate,
      documentNo: inst.documentNo,
      currency: inst.currency,
    };
    await applyEndorsementPass([inst], [backCand(2)], [imgPage(2)], names(["Ciranta X"]));
    expect({
      drawerName: inst.drawerName,
      amount: inst.amount,
      issueDate: inst.issueDate,
      documentNo: inst.documentNo,
      currency: inst.currency,
    }).toEqual(before);
  });
});

describe("D-INV-2: whiteEndorsementDetected — yalnız SİNYAL (okunamadı ≠ isim yok)", () => {
  it("arka marker + okundu + isim YOK → true (muhtemel beyaz ciro)", async () => {
    const inst = cek();
    await applyEndorsementPass([inst], [backCand(2)], [imgPage(2)], names([]));
    expect(inst.whiteEndorsementDetected).toBe(true);
    expect(inst.endorsementNames).toBeUndefined();
  });

  it("isim VAR → flag YOK (adlı ciro ≠ beyaz ciro)", async () => {
    const inst = cek();
    await applyEndorsementPass([inst], [backCand(2)], [imgPage(2)], names(["Ciranta"]));
    expect(inst.whiteEndorsementDetected).toBeUndefined();
  });

  it("AI hata (okunamadı) → flag YOK (okunamadı ≠ isim yok)", async () => {
    const inst = cek();
    const throwing: EndorsementExtractor = async () => {
      throw new Error("boom");
    };
    await applyEndorsementPass([inst], [backCand(2)], [imgPage(2)], throwing);
    expect(inst.whiteEndorsementDetected).toBeUndefined();
  });
});

describe("D-INV-3: çek issueDate basım-guard — yalnız confidence tavanlanır", () => {
  it("CEK + basım/baskı/print izi → confidence Math.min(_, 45)", () => {
    expect(capConfidenceForPrintDateAmbiguity("CEK", "basım tarihi görüldü", 90)).toBe(45);
    expect(capConfidenceForPrintDateAmbiguity("CEK", "baskı 2019", 95)).toBe(45);
    expect(capConfidenceForPrintDateAmbiguity("CEK", "print date 2019", 80)).toBe(45);
  });

  it("iz YOK / ÇEK-dışı / evidenceText yok → confidence AYNEN (davranış-nötr)", () => {
    expect(capConfidenceForPrintDateAmbiguity("CEK", "keşide yeri/tarih net", 90)).toBe(90);
    expect(capConfidenceForPrintDateAmbiguity("SENET", "basım tarihi", 90)).toBe(90);
    expect(capConfidenceForPrintDateAmbiguity("CEK", undefined, 90)).toBe(90);
  });

  it("mevcut güven zaten <=45 ise KORUNUR (Math.min yükseltmez)", () => {
    expect(capConfidenceForPrintDateAmbiguity("CEK", "basım", 30)).toBe(30);
  });
});
