/**
 * C-PR2 — Second-pass payee-only extractor testleri (AI mock; gerçek AI çağrısı YOK).
 *
 * KRİTİK guard: pass YALNIZ payeeName + payeeEvidence üretir; drawerName/issueDate/dueDate/amount/
 * documentNo IMMUTABLE. Yalnız CEK + FACE; mevcut payeeName EZİLMEZ; null → boş; throw → graceful.
 * (Prompt'un AI etkisi unit-test EDİLEMEZ → canlı Gorka gate.)
 */
import {
  PAYEE_EXTRACTION_PROMPT,
  selectPayeeFacePage,
  applyPayeePass,
  PayeeExtractor,
} from "../payee-extractor";
import { Instrument, PageCandidate } from "../debt-instrument.types";
import { Page } from "../pdf-segmentation";

const norm = (s: string) => s.replace(/İ/g, "i").replace(/I/g, "ı").toLowerCase();

const inst = (over: Partial<Instrument> = {}): Instrument =>
  ({ type: "CEK", currency: "TRY", confidence: 90, sourcePages: [1], ...over } as Instrument);
const cand = (over: Partial<PageCandidate> & { pageIndex: number }): PageCandidate => ({ ...over });
const pg = (over: Partial<Page> & { pageIndex: number }): Page =>
  ({ kind: "TEXT", hasText: true, needsImageExtraction: false, source: "pdf-parse", ...over } as Page);

describe("PAYEE_EXTRACTION_PROMPT — payee-only kurallar mevcut", () => {
  const P = PAYEE_EXTRACTION_PROMPT;
  const L = norm(P);
  it("lehtar + emrine/ödeyiniz cue'ları var", () => {
    expect(L).toContain("lehtar");
    expect(L).toContain("emrine");
    expect(L).toContain("ödeyiniz");
  });
  it("keşideci/imzacı/kaşe ÇIKARMA yasağı var", () => {
    expect(L).toContain("keşideci");
    expect(L).toContain("çıkarma");
  });
  it("emin değilse null + yalnız payeeName/payeeEvidence", () => {
    expect(L).toContain("null");
    expect(P).toContain("payeeName");
    expect(P).toContain("payeeEvidence");
  });
});

describe("selectPayeeFacePage — seçim/atlama (saf)", () => {
  it("CEK + face candidate + sayfa → sayfayı döner", () => {
    const out = selectPayeeFacePage(inst({ sourcePages: [1, 2] }), [cand({ pageIndex: 1, face: true })], [pg({ pageIndex: 1 })]);
    expect(out?.pageIndex).toBe(1);
  });
  it("CEK DEĞİL → null", () => {
    expect(selectPayeeFacePage(inst({ type: "SENET" }), [cand({ pageIndex: 1, face: true })], [pg({ pageIndex: 1 })])).toBeNull();
  });
  it("mevcut payeeName VAR → null (EZME)", () => {
    expect(selectPayeeFacePage(inst({ payeeName: "Var" }), [cand({ pageIndex: 1, face: true })], [pg({ pageIndex: 1 })])).toBeNull();
  });
  it("FACE candidate yok (face=false) → null", () => {
    expect(selectPayeeFacePage(inst(), [cand({ pageIndex: 1, face: false })], [pg({ pageIndex: 1 })])).toBeNull();
  });
  it("face candidate var ama sayfa bulunamaz → null", () => {
    expect(selectPayeeFacePage(inst(), [cand({ pageIndex: 1, face: true })], [pg({ pageIndex: 9 })])).toBeNull();
  });
});

describe("applyPayeePass — YALNIZ payeeName/payeeEvidence; diğer alanlar IMMUTABLE", () => {
  const facePages = () => [pg({ pageIndex: 1, kind: "IMAGE", imageRef: "/img.png", needsImageExtraction: true })];
  const faceCands = () => [cand({ pageIndex: 1, face: true })];

  it("payee dolu döner → payeeName+payeeEvidence set; drawer/tarih/tutar/no DEĞİŞMEZ", async () => {
    const mock: PayeeExtractor = jest.fn(async () => ({ payeeName: "Müvekkil A", payeeEvidence: "...emrine Müvekkil A" }));
    const i = inst({ documentNo: "0265897", drawerName: "Gorka", issueDate: "2025-12-30", dueDate: undefined, amount: 400000 });
    await applyPayeePass([i], faceCands(), facePages(), mock);
    expect(i.payeeName).toBe("Müvekkil A");
    expect(i.payeeEvidence).toBe("...emrine Müvekkil A");
    // GUARD: diğer alanlar dokunulmadı
    expect(i.drawerName).toBe("Gorka");
    expect(i.issueDate).toBe("2025-12-30");
    expect(i.amount).toBe(400000);
    expect(i.documentNo).toBe("0265897");
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it("null payee → payeeName boş bırakılır", async () => {
    const mock: PayeeExtractor = jest.fn(async () => ({ payeeName: null, payeeEvidence: null }));
    const i = inst({ documentNo: "CK", drawerName: "Gorka" });
    await applyPayeePass([i], faceCands(), facePages(), mock);
    expect(i.payeeName).toBeUndefined();
    expect(i.drawerName).toBe("Gorka");
  });

  it("mevcut payeeName → EZİLMEZ (pass çağrılmaz)", async () => {
    const mock: PayeeExtractor = jest.fn(async () => ({ payeeName: "Yeni" }));
    const i = inst({ payeeName: "Manuel A" });
    await applyPayeePass([i], faceCands(), facePages(), mock);
    expect(i.payeeName).toBe("Manuel A");
    expect(mock).not.toHaveBeenCalled();
  });

  it("CEK dışı + face yok → atlanır (pass çağrılmaz)", async () => {
    const mock: PayeeExtractor = jest.fn(async () => ({ payeeName: "X" }));
    await applyPayeePass([inst({ type: "SENET" }), inst({ sourcePages: [1] })], [cand({ pageIndex: 1, face: false })], facePages(), mock);
    expect(mock).not.toHaveBeenCalled();
  });

  it("payeeExtract throw → graceful (tarama bozulmaz, alan dokunulmaz)", async () => {
    const mock: PayeeExtractor = jest.fn(async () => { throw new Error("AI 500"); });
    const i = inst({ drawerName: "Gorka" });
    await expect(applyPayeePass([i], faceCands(), facePages(), mock)).resolves.toBeUndefined();
    expect(i.payeeName).toBeUndefined();
    expect(i.drawerName).toBe("Gorka");
  });

  it("uzun evidence → ~200 char'a kırpılır", async () => {
    const long = "x".repeat(500);
    const mock: PayeeExtractor = jest.fn(async () => ({ payeeName: "A", payeeEvidence: long }));
    const i = inst();
    await applyPayeePass([i], faceCands(), facePages(), mock);
    expect(i.payeeEvidence!.length).toBe(200);
  });
});
