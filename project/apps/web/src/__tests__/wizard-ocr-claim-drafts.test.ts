import { describe, it, expect } from "vitest";
import {
  claimKindForOcrDraft,
  claimRawFromOcrDraft,
  findDuplicateFaturaIndex,
  isOcrDraftPending,
  mergeOcrClaimDrafts,
  ocrClaimDraftFromDebtInfo,
  ocrDraftCurrencyConflict,
  ocrDraftDocumentLabel,
  ocrKdvFieldsForDue,
  pendingOcrClaimDrafts,
  sanitizeOcrClaimDrafts,
  splitDetectedInstruments,
  type OcrClaimDraft,
} from "@/lib/wizard-ocr-claim-drafts";
import { selectedInstrumentsToPayload, type Instrument } from "@/components/debtor/ocr-instrument";

/**
 * K3-L KP-8 (owner kararı 2026-10-01) — evrak taraması kullanıcı teyidi olmadan borç yaratmaz: fatura ve diğer belgeler
 * karar bekleyen kayıt olur; kalem yalnız kullanıcı formda inceleyip eklediğinde oluşur. Aynı fatura ikinci anapara
 * üretmez.
 */
const instrument = (over: Partial<Instrument>): Instrument => ({
  type: "CEK",
  documentNo: "CK-1",
  amount: 1000,
  currency: "TRY",
  issueDate: "2026-01-10",
  confidence: 0.9,
  ...over,
});
const draft = (over: Partial<OcrClaimDraft> = {}): OcrClaimDraft => ({
  id: "d1",
  kind: "FATURA",
  documentType: "FATURA",
  status: "PENDING",
  amount: 11800,
  currency: "TRY",
  documentNo: "FTR 2026/15",
  origin: "OCR_MULTI",
  ...over,
});

describe("çoklu tarama: kambiyo ↔ fatura / diğer ayrımı", () => {
  it("çek / senet / poliçe evrak kaydına, fatura ve diğer belge karar bekleyen kayda gider; hiçbir satır atılmaz", () => {
    const { kambiyo, drafts } = splitDetectedInstruments([
      instrument({ type: "CEK", documentNo: "CK-1" }),
      instrument({ type: "FATURA", documentNo: "FTR-9", amount: 11800, dueDate: "2026-02-01" }),
      instrument({ type: "SENET", documentNo: "S-2" }),
      instrument({ type: "DIGER", documentNo: "", amount: 500 }),
      instrument({ type: "POLICE", documentNo: "P-3" }),
    ]);

    expect(kambiyo.map((i) => i.type)).toEqual(["CEK", "SENET", "POLICE"]);
    expect(selectedInstrumentsToPayload(kambiyo).every((p) => ["CEK", "SENET", "POLICE"].includes(p.type))).toBe(true);
    expect(drafts.map((d) => [d.kind, d.documentType, d.status, d.amount, d.origin])).toEqual([
      ["FATURA", "FATURA", "PENDING", 11800, "OCR_MULTI"],
      ["DIGER", "DIGER", "PENDING", 500, "OCR_MULTI"],
    ]);
    expect(drafts[0]).toMatchObject({ documentNo: "FTR-9", issueDate: "2026-01-10", dueDate: "2026-02-01", currency: "TRY" });
  });

  it("tutarı okunmamış belge de kayıt olur (tutar null) — sessizce düşmez", () => {
    const { drafts } = splitDetectedInstruments([instrument({ type: "FATURA", amount: undefined })]);
    expect(drafts).toHaveLength(1);
    expect(drafts[0].amount).toBeNull();
  });
});

describe("tek belge taraması", () => {
  it("fatura: tutar, belge no, tarihler ve KDV bilgisi kayda taşınır; borç OLUŞMAZ (yalnız kayıt döner)", () => {
    const d = ocrClaimDraftFromDebtInfo(
      { amount: 11800, currency: "TRY", documentNo: "FTR-9", issueDate: "2026-01-05", dueDate: "2026-02-01", kdvRate: 18, kdvAmount: 1800 },
      "FATURA",
    );
    expect(d).toMatchObject({
      kind: "FATURA",
      status: "PENDING",
      amount: 11800,
      documentNo: "FTR-9",
      issueDate: "2026-01-05",
      dueDate: "2026-02-01",
      kdvRate: 18,
      kdvAmount: 1800,
      origin: "OCR_SINGLE",
    });
  });

  it("kira / cari hesap / sözleşme / diğer → sınıflandırma isteyen kayıt (tür tahmin edilmez)", () => {
    for (const type of ["KIRA", "CARI_HESAP", "SOZLESME", "DIGER", undefined]) {
      const d = ocrClaimDraftFromDebtInfo({ amount: 100, currency: "TRY" }, type);
      expect(d?.kind).toBe("DIGER");
      expect(claimKindForOcrDraft(d!, null)).toBeNull();
      expect(claimKindForOcrDraft(d!, "MASRAF")).toBeNull();
      expect(claimKindForOcrDraft(d!, "ASIL_ALACAK")).toBe("ASIL_ALACAK");
    }
    expect(ocrDraftDocumentLabel({ documentType: "CARI_HESAP" })).toBe("Cari hesap belgesi");
    expect(ocrDraftDocumentLabel({ documentType: "???" })).toBe("Diğer belge");
  });

  it("çek / senet tek belge: türü bellidir, yine de karar bekler", () => {
    const d = ocrClaimDraftFromDebtInfo({ amount: 5000, currency: "TRY", documentNo: "CK-7" }, "CEK")!;
    expect(d.kind).toBe("CEK");
    expect(d.status).toBe("PENDING");
    expect(claimKindForOcrDraft(d)).toBe("CEK");
  });

  it("tutar yoksa / sıfırsa kayıt üretilmez", () => {
    expect(ocrClaimDraftFromDebtInfo({ currency: "TRY" }, "FATURA")).toBeNull();
    expect(ocrClaimDraftFromDebtInfo({ amount: 0, currency: "TRY" }, "FATURA")).toBeNull();
    expect(ocrClaimDraftFromDebtInfo(null, "FATURA")).toBeNull();
  });
});

describe("kuyruk birleştirme", () => {
  it("aynı belge (tür + no boşluk/harf farkı yok + tutar + para birimi) ikinci kez girmez; mevcut karar korunur", () => {
    const kept = draft({ id: "keep", status: "DOCUMENT_ONLY" });
    const merged = mergeOcrClaimDrafts([kept], [draft({ id: "new", documentNo: "ftr2026/15" })]);
    expect(merged).toEqual([kept]);
  });

  it("farklı tutar ya da para birimi ayrı belgedir", () => {
    const merged = mergeOcrClaimDrafts([draft()], [draft({ id: "d2", amount: 11800.01 }), draft({ id: "d3", currency: "USD" })]);
    expect(merged.map((d) => d.id)).toEqual(["d1", "d2", "d3"]);
  });

  it("yeniden çoklu tarama: karar bekleyen eski çoklu kayıtlar yeni seçimle değişir; karar ve tek belge kaydı korunur", () => {
    const existing = [
      draft({ id: "old-pending", documentNo: "A" }),
      draft({ id: "old-doc-only", documentNo: "B", status: "DOCUMENT_ONLY" }),
      draft({ id: "single", documentNo: "C", origin: "OCR_SINGLE" }),
    ];
    const merged = mergeOcrClaimDrafts(existing, [draft({ id: "fresh", documentNo: "D" })], { replacePendingMulti: true });
    expect(merged.map((d) => d.id)).toEqual(["old-doc-only", "single", "fresh"]);
  });

  it("yeniden çoklu taramada aynı belgenin kaydı KİMLİĞİYLE korunur (formda incelenen kayıtla bağ kopmaz)", () => {
    const existing = [draft({ id: "in-review", documentNo: "A" }), draft({ id: "gone", documentNo: "B" })];
    const merged = mergeOcrClaimDrafts(
      existing,
      [draft({ id: "rescan-a", documentNo: "a" }), draft({ id: "rescan-c", documentNo: "C" })],
      { replacePendingMulti: true },
    );
    expect(merged.map((d) => d.id)).toEqual(["in-review", "rescan-c"]);
  });

  it("formdaki kaydın hâlâ karar bekleyip beklemediği: çıkarılmış ya da ek belgeye çevrilmiş kayıt beklemez", () => {
    const drafts = [draft({ id: "p" }), draft({ id: "d", documentNo: "X", status: "DOCUMENT_ONLY" })];
    expect(isOcrDraftPending(drafts, "p")).toBe(true);
    expect(isOcrDraftPending(drafts, "d")).toBe(false);
    expect(isOcrDraftPending(drafts, "yok")).toBe(false);
    expect(isOcrDraftPending(drafts, undefined)).toBe(false);
  });

  it("kalem listesinde zaten bulunan fatura yeniden karar beklemez (ikinci anapara yolu açılmaz)", () => {
    const listed = [{ raw: { kalemTuru: "FATURA", faturaBilgileri: { faturaNo: "FTR 2026/15" }, bakiyeTutar: 11800, currency: "TRY" } }];
    expect(mergeOcrClaimDrafts([], [draft()], { listedItems: listed })).toEqual([]);
    expect(mergeOcrClaimDrafts([], [draft({ amount: 5 })], { listedItems: listed })).toHaveLength(1);
  });

  it("karar bekleyenler: yalnız ek belge kararı verilmiş kayıt beklemez", () => {
    expect(pendingOcrClaimDrafts([draft(), draft({ id: "d2", documentNo: "X", status: "DOCUMENT_ONLY" })]).map((d) => d.id)).toEqual(["d1"]);
  });
});

describe("forma yükleme", () => {
  it("fatura: fatura no / tarih / vade / tutar taşınır; faiz alanı verilmez; kayıt bağı (ocrDraftId) korunur", () => {
    const raw = claimRawFromOcrDraft(draft({ issueDate: "2026-01-05", dueDate: "2026-02-01", kdvRate: 18, kdvAmount: 1800 }), "FATURA");
    expect(raw).toMatchObject({
      kalemTuru: "FATURA",
      toplamTutar: 11800,
      bakiyeTutar: 11800,
      currency: "TRY",
      vadeTarihi: "2026-02-01",
      faturaBilgileri: { faturaNo: "FTR 2026/15", faturaTarihi: "2026-01-05" },
      ocrDraftId: "d1",
      ocrBelgeTuru: "FATURA",
      ocrTutar: 11800,
      ocrKdvRate: 18,
      ocrKdvAmount: 1800,
    });
    expect(raw).not.toHaveProperty("takipOncesiFaiz");
    expect(raw).not.toHaveProperty("faizOrani");
  });

  it("okunamayan tarih uydurulmaz (boş kalır)", () => {
    expect(claimRawFromOcrDraft(draft(), "FATURA")).toMatchObject({ vadeTarihi: "", faturaBilgileri: { faturaTarihi: "" } });
  });

  it("çek: tek tarih keşide sayılır; iki farklı tarihte ikincisi ibraz olarak önerilir", () => {
    const single = claimRawFromOcrDraft(draft({ kind: "CEK", documentType: "CEK", documentNo: "CK-7", dueDate: "2026-03-01" }), "CEK");
    expect(single).toMatchObject({ vadeTarihi: "2026-03-01", cekBilgileri: { cekSeriNo: "CK-7", ibrazTarihi: "" } });
    const both = claimRawFromOcrDraft(
      draft({ kind: "CEK", documentType: "CEK", documentNo: "CK-7", issueDate: "2026-02-20", dueDate: "2026-03-01" }),
      "CEK",
    );
    expect(both).toMatchObject({ vadeTarihi: "2026-02-20", cekBilgileri: { ibrazTarihi: "2026-03-01" } });
  });

  it("senet ve genel alacak", () => {
    expect(
      claimRawFromOcrDraft(draft({ kind: "SENET", documentType: "SENET", documentNo: "S-2", issueDate: "2026-01-01", dueDate: "2026-06-01" }), "SENET"),
    ).toMatchObject({ vadeTarihi: "2026-06-01", senetBilgileri: { senetNo: "S-2", duzenlemeTarihi: "2026-01-01" } });
    expect(claimRawFromOcrDraft(draft({ kind: "DIGER", documentType: "SOZLESME", documentNo: "SZ-1" }), "ASIL_ALACAK")).toMatchObject({
      kalemTuru: "ASIL_ALACAK",
      aciklama: "SZ-1 numaralı belge",
      ocrBelgeTuru: "SOZLESME",
    });
  });
});

describe("para birimi", () => {
  it("belge dosya para biriminden farklıysa çakışma; aynıysa (harf / boşluk farkı yok) değil", () => {
    expect(ocrDraftCurrencyConflict({ currency: "USD" }, "TRY")).toBe(true);
    expect(ocrDraftCurrencyConflict({ currency: "TRY" }, " try ")).toBe(false);
    expect(ocrDraftCurrencyConflict({ currency: "TRY" }, undefined)).toBe(false);
  });
});

describe("aynı fatura ikinci kez eklenmez", () => {
  const items = [
    { raw: { kalemTuru: "FATURA", faturaBilgileri: { faturaNo: "FTR 2026/15" }, bakiyeTutar: 11800, currency: "TRY" } },
    { raw: { kalemTuru: "ASIL_ALACAK", bakiyeTutar: 11800, currency: "TRY" } },
  ];
  const raw = (over: Record<string, unknown> = {}) => ({
    kalemTuru: "FATURA",
    faturaBilgileri: { faturaNo: "ftr2026/15" },
    bakiyeTutar: 11800,
    currency: "TRY",
    ...over,
  });

  it("no (boşluk / harf farkı yok) + tutar (kuruş) + para birimi aynıysa eşleşir", () => {
    expect(findDuplicateFaturaIndex(raw(), items, null)).toBe(0);
  });

  it("düzenlenen kalemin kendisi eşleşme sayılmaz", () => {
    expect(findDuplicateFaturaIndex(raw(), items, 0)).toBe(-1);
  });

  it("farklı tutar / para birimi / tür ya da numarasız fatura eşleşmez", () => {
    expect(findDuplicateFaturaIndex(raw({ bakiyeTutar: 11800.01 }), items, null)).toBe(-1);
    expect(findDuplicateFaturaIndex(raw({ currency: "USD" }), items, null)).toBe(-1);
    expect(findDuplicateFaturaIndex(raw({ kalemTuru: "ASIL_ALACAK" }), items, null)).toBe(-1);
    expect(findDuplicateFaturaIndex(raw({ faturaBilgileri: { faturaNo: "" } }), items, null)).toBe(-1);
  });
});

describe("KDV bilgisi", () => {
  const raw = (over: Record<string, unknown> = {}) => ({
    kalemTuru: "FATURA",
    bakiyeTutar: 11800,
    ocrTutar: 11800,
    ocrKdvRate: 18,
    ocrKdvAmount: 1800,
    ...over,
  });

  it("tutar taramadaki tutarla aynıysa due'ya yazılır", () => {
    expect(ocrKdvFieldsForDue(raw())).toEqual({ hasKdv: true, kdvRate: 18, kdvAmount: 1800 });
    expect(ocrKdvFieldsForDue(raw({ ocrKdvAmount: undefined }))).toEqual({ hasKdv: true, kdvRate: 18 });
  });

  it("kullanıcı tutarı değiştirdiyse, tür fatura değilse ya da tarama KDV okumadıysa yazılmaz", () => {
    expect(ocrKdvFieldsForDue(raw({ bakiyeTutar: 10000 }))).toEqual({});
    expect(ocrKdvFieldsForDue(raw({ kalemTuru: "ASIL_ALACAK" }))).toEqual({});
    expect(ocrKdvFieldsForDue(raw({ ocrKdvRate: undefined }))).toEqual({});
    expect(ocrKdvFieldsForDue(raw({ ocrTutar: null }))).toEqual({});
    expect(ocrKdvFieldsForDue(null)).toEqual({});
  });
});

describe("taslaktan geri yükleme", () => {
  it("yalnız biçimi geçerli kayıtlar gelir; bilinmeyen durum karar verilmiş sayılmaz", () => {
    const restored = sanitizeOcrClaimDrafts([
      draft({ status: "DOCUMENT_ONLY" }),
      { ...draft({ id: "d2", documentNo: "Z" }), status: "APPROVED" },
      { id: "", kind: "FATURA" },
      { id: "x", kind: "ILAM" },
      null,
      "metin",
    ]);
    expect(restored.map((d) => [d.id, d.status])).toEqual([
      ["d1", "DOCUMENT_ONLY"],
      ["d2", "PENDING"],
    ]);
    expect(sanitizeOcrClaimDrafts(undefined)).toEqual([]);
    expect(sanitizeOcrClaimDrafts({})).toEqual([]);
  });
});
