/**
 * P4-1 (A1-V1b) — endorsement-extractor unit testleri.
 * ANA GUARD: applyEndorsementPass YALNIZ endorsementNames yazar; ön-yüz alanları IMMUTABLE
 * (drawerName/amount/issueDate/dueDate/documentNo) → #294 ön-yüz regresyonu yapısal olarak imkansız.
 */

import {
  applyEndorsementPass,
  selectBackPages,
  BACK_ENDORSEMENT_PROMPT,
  EndorsementExtractor,
} from "../endorsement-extractor";
import { Instrument, PageCandidate } from "../debt-instrument.types";
import { Page } from "../pdf-segmentation";

function cek(over: Partial<Instrument> = {}): Instrument {
  return {
    type: "CEK",
    currency: "TRY",
    confidence: 90,
    drawerName: "GORKA KOZMETİK SAN. VE TİC. A.Ş.",
    amount: 400000,
    documentNo: "0265895",
    issueDate: "2025-12-30",
    bankName: "X Bank",
    sourcePages: [1, 2],
    ...over,
  };
}
const frontCand = (idx: number): PageCandidate => ({ pageIndex: idx, face: true, back: false });
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
  async () => ({ endorsementNames: list, evidence: "ciro edilmiştir ..." });

describe("BACK_ENDORSEMENT_PROMPT", () => {
  // Türkçe-İ tuzağı: önce harf-eşle sonra lower
  const norm = BACK_ENDORSEMENT_PROMPT.replace(/İ/g, "i").replace(/I/g, "ı").toLowerCase();

  it("ciro/kaşe isim odaklı + keşideci dışlama bağlamı içerir", () => {
    expect(norm).toContain("ciro");
    expect(norm).toContain("kaşe");
    expect(norm).toContain("keşideci");
    expect(norm).toContain("endorsementnames");
  });

  it("sıra/zincir kurmayı YASAKLAR (A1 türevi, bu pass değil)", () => {
    expect(norm).toMatch(/sıra|zincir/);
    expect(norm).toContain("hamiline"); // beyaz ciro → boş
  });
});

describe("selectBackPages", () => {
  it("yalnız arka (back/endorsementMarkers) sayfaları döner", () => {
    const got = selectBackPages(cek(), [frontCand(1), backCand(2)], [imgPage(1), imgPage(2)]);
    expect(got.map((p) => p.pageIndex)).toEqual([2]);
  });

  it("kambiyo olmayan (FATURA) → boş", () => {
    const got = selectBackPages(cek({ type: "FATURA" }), [frontCand(1), backCand(2)], [imgPage(1), imgPage(2)]);
    expect(got).toEqual([]);
  });

  it("arka yüz yoksa (yalnız ön) → boş", () => {
    const got = selectBackPages(cek({ sourcePages: [1] }), [frontCand(1), backCand(2)], [imgPage(1), imgPage(2)]);
    expect(got).toEqual([]);
  });

  it("SENET/POLICE de kambiyo sayılır", () => {
    expect(selectBackPages(cek({ type: "SENET" }), [backCand(2)], [imgPage(2)]).length).toBe(1);
    expect(selectBackPages(cek({ type: "POLICE" }), [backCand(2)], [imgPage(2)]).length).toBe(1);
  });
});

describe("applyEndorsementPass", () => {
  it("arka yüzden endorsementNames yazar", async () => {
    const inst = cek();
    await applyEndorsementPass(
      [inst],
      [frontCand(1), backCand(2)],
      [imgPage(1), imgPage(2)],
      names(["Süreyya Avcıoğlan", "Şükrü Akdoğan"]),
    );
    expect(inst.endorsementNames).toEqual(["Süreyya Avcıoğlan", "Şükrü Akdoğan"]);
  });

  it("🔒 YALNIZ endorsementNames değişir; ön-yüz alanları IMMUTABLE", async () => {
    const inst = cek();
    const before = {
      type: inst.type,
      drawerName: inst.drawerName,
      amount: inst.amount,
      currency: inst.currency,
      issueDate: inst.issueDate,
      dueDate: inst.dueDate,
      documentNo: inst.documentNo,
      bankName: inst.bankName,
      confidence: inst.confidence,
    };
    await applyEndorsementPass([inst], [frontCand(1), backCand(2)], [imgPage(1), imgPage(2)], names(["X"]));
    expect({
      type: inst.type,
      drawerName: inst.drawerName,
      amount: inst.amount,
      currency: inst.currency,
      issueDate: inst.issueDate,
      dueDate: inst.dueDate,
      documentNo: inst.documentNo,
      bankName: inst.bankName,
      confidence: inst.confidence,
    }).toEqual(before);
    expect(inst.endorsementNames).toEqual(["X"]); // tek değişen alan
  });

  it("AI throw → graceful (endorsementNames yazılmaz, dışarı throw yok)", async () => {
    const inst = cek();
    const throwing: EndorsementExtractor = async () => {
      throw new Error("boom");
    };
    await expect(
      applyEndorsementPass([inst], [frontCand(1), backCand(2)], [imgPage(1), imgPage(2)], throwing),
    ).resolves.toBeUndefined();
    expect(inst.endorsementNames).toBeUndefined();
    expect(inst.whiteEndorsementDetected).toBeUndefined(); // AI okuyamadı → "beyaz ciro" DEĞİL (okunamadı ≠ isim yok)
  });

  it("kambiyo olmayan enstrüman → atla (endorsementNames yok)", async () => {
    const inst = cek({ type: "FATURA" });
    await applyEndorsementPass([inst], [frontCand(1), backCand(2)], [imgPage(1), imgPage(2)], names(["X"]));
    expect(inst.endorsementNames).toBeUndefined();
  });

  it("boş çıktı + arka marker VAR (hamiline/beyaz ciro) → endorsementNames YOK + whiteEndorsementDetected=true", async () => {
    const inst = cek();
    await applyEndorsementPass([inst], [backCand(2)], [imgPage(2)], names([]));
    expect(inst.endorsementNames).toBeUndefined();
    expect(inst.whiteEndorsementDetected).toBe(true); // imza/kaşe markeri var + isim yok → muhtemel beyaz ciro
  });

  it("isim VARSA whiteEndorsementDetected SET EDİLMEZ (adlı ciro ≠ beyaz ciro)", async () => {
    const inst = cek();
    await applyEndorsementPass([inst], [backCand(2)], [imgPage(2)], names(["Ada Lovelace"]));
    expect(inst.endorsementNames).toEqual(["Ada Lovelace"]);
    expect(inst.whiteEndorsementDetected).toBeUndefined();
  });

  it("arka-yüz markeri YOK (yalnız ön) → whiteEndorsementDetected SET EDİLMEZ (ciro yok ≠ beyaz ciro)", async () => {
    const inst = cek({ sourcePages: [1] });
    await applyEndorsementPass([inst], [frontCand(1), backCand(2)], [imgPage(1), imgPage(2)], names([]));
    expect(inst.endorsementNames).toBeUndefined();
    expect(inst.whiteEndorsementDetected).toBeUndefined(); // arka sinyal yok → flag yok
  });

  it("🔒 beyaz ciro SİNYALİ ön-yüz alanlarını DEĞİŞTİRMEZ (yalnız sinyal)", async () => {
    const inst = cek();
    const before = {
      drawerName: inst.drawerName,
      amount: inst.amount,
      documentNo: inst.documentNo,
      issueDate: inst.issueDate,
      currency: inst.currency,
    };
    await applyEndorsementPass([inst], [backCand(2)], [imgPage(2)], names([]));
    expect({
      drawerName: inst.drawerName,
      amount: inst.amount,
      documentNo: inst.documentNo,
      issueDate: inst.issueDate,
      currency: inst.currency,
    }).toEqual(before);
    expect(inst.whiteEndorsementDetected).toBe(true);
  });

  it("dedupe (Türkçe-duyarlı) + trim", async () => {
    const inst = cek({ sourcePages: [2] });
    await applyEndorsementPass(
      [inst],
      [backCand(2)],
      [imgPage(2)],
      names(["  Ada Lovelace  ", "ada lovelace", "ADA LOVELACE"]),
    );
    expect(inst.endorsementNames).toEqual(["Ada Lovelace"]);
  });

  it("çok arka sayfa → union", async () => {
    const inst = cek({ sourcePages: [1, 2, 3] });
    let call = 0;
    const ex: EndorsementExtractor = async () => ({ endorsementNames: call++ === 0 ? ["A Kişi"] : ["B Kişi"] });
    await applyEndorsementPass([inst], [frontCand(1), backCand(2), backCand(3)], [imgPage(1), imgPage(2), imgPage(3)], ex);
    expect([...(inst.endorsementNames ?? [])].sort()).toEqual(["A Kişi", "B Kişi"]);
  });

  it("imageRef ve text yoksa sayfa atlanır (çıkaracak içerik yok)", async () => {
    const inst = cek({ sourcePages: [2] });
    const emptyPage: Page = { pageIndex: 2, kind: "IMAGE", hasText: false, needsImageExtraction: true, source: "pdf-parse" };
    let called = false;
    const ex: EndorsementExtractor = async () => {
      called = true;
      return { endorsementNames: ["X"] };
    };
    await applyEndorsementPass([inst], [backCand(2)], [emptyPage], ex);
    expect(called).toBe(false);
    expect(inst.endorsementNames).toBeUndefined();
  });
});
