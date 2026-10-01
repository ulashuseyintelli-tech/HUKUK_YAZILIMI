/**
 * K3-L KP-8 (owner kararı 2026-10-01) — evrak taraması (OCR) sonucu kullanıcı teyidi olmadan BORÇ YARATMAZ.
 *
 *  - Tek belge taraması ve çoklu taramadaki FATURA / DİĞER satırları alacak kalemine / `dues`'a doğrudan yazılmaz;
 *    "karar bekleyen tarama kaydı" kuyruğuna girer. Kalem yalnız kullanıcı kaydı alacak kalemi formunda inceleyip
 *    "Kalemi Listeye Ekle" dediğinde oluşur (mevcut oluşum ve onay kapıları aynen: kalem sihirbazın normal yolundan gider).
 *  - FATURA taslak kaleme yönlendirilir (fatura no, tarih, tutar, KDV bilgisi forma taşınır).
 *  - DİĞER (ve tek belge taramasındaki kira / cari hesap / sözleşme): kullanıcı belgeyi sınıflandırır (kalem türü seçer)
 *    ya da yalnız ek belge olarak tutar. Varsayılan kalem türü YOKTUR (genel belge → anapara yedeği yok).
 *  - Evrak ↔ kalem ilişkisi: taslaktan üretilen kalem `ocrDraftId` / `ocrBelgeTuru` taşır; aynı fatura (no + tutar + para
 *    birimi) ikinci kez eklenmez → ikinci anapara oluşmaz.
 *
 * `instruments[]` yalnız kambiyo evrakı (çek / senet / poliçe) taşır; sunucu kabul kapısı aynen kalır.
 * SAF: durum ve yan etki yok. Tek kaynak sihirbazın `ocrClaimDrafts` durumudur.
 */

export type OcrClaimDraftKind = "FATURA" | "CEK" | "SENET" | "DIGER";
/** PENDING = kullanıcı kararı bekliyor (dosya açılmaz); DOCUMENT_ONLY = yalnız ek belge, borç YOK. */
export type OcrClaimDraftStatus = "PENDING" | "DOCUMENT_ONLY";

export interface OcrClaimDraft {
  id: string;
  kind: OcrClaimDraftKind;
  /** Taramanın bildirdiği belge türü (yalnız gösterim): FATURA, CEK, SENET, KIRA, CARI_HESAP, SOZLESME, DIGER … */
  documentType: string;
  status: OcrClaimDraftStatus;
  /** Taramanın okuduğu tutar (faturada KDV dahil genel toplam); okunamadıysa null */
  amount: number | null;
  currency: string;
  documentNo: string;
  issueDate?: string;
  dueDate?: string;
  kdvRate?: number;
  kdvAmount?: number;
  origin: "OCR_SINGLE" | "OCR_MULTI";
}

/** Kambiyo evrakı: yalnız bunlar `instruments[]` ile gider. */
const KAMBIYO_TYPES: ReadonlySet<string> = new Set(["CEK", "SENET", "POLICE"]);

const cents = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};
const normalizeDocumentNo = (value: unknown): string => String(value ?? "").replace(/\s+/g, "").toUpperCase();
const normalizeCurrency = (value: unknown): string => String(value || "TRY").trim().toUpperCase();

let draftSeq = 0;
export function newOcrClaimDraftId(): string {
  draftSeq += 1;
  return `ocr_${Date.now().toString(36)}_${draftSeq}`;
}

function draftKindOf(documentType: unknown): OcrClaimDraftKind {
  return documentType === "FATURA" ? "FATURA" : documentType === "CEK" ? "CEK" : documentType === "SENET" ? "SENET" : "DIGER";
}

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  FATURA: "Fatura",
  CEK: "Çek",
  SENET: "Senet",
  KIRA: "Kira belgesi",
  CARI_HESAP: "Cari hesap belgesi",
  SOZLESME: "Sözleşme",
  DIGER: "Diğer belge",
};

export function ocrDraftDocumentLabel(draft: Pick<OcrClaimDraft, "documentType">): string {
  return DOCUMENT_TYPE_LABELS[draft.documentType] ?? "Diğer belge";
}

/** Taramadan gelen bir evrak satırının ayrım için okunan alanları (tarama satırı ve kayıtlı `instruments[]` öğesi ortak). */
export interface ScannedDocumentLike {
  type: string;
  documentNo?: string;
  amount?: number;
  currency?: string;
  issueDate?: string;
  dueDate?: string;
}

/**
 * Taramadan gelen satırları ayırır: kambiyo → `instruments[]` (çoklu taramada çağıran `selectedInstrumentsToPayload`
 * uygular; eski taslak geri yüklenirken kayıtlı öğeler aynen kalır); fatura / diğer → karar bekleyen kayıt. Hiçbir satır
 * atılmaz.
 */
export function splitDetectedInstruments<T extends ScannedDocumentLike>(detected: readonly T[]): {
  kambiyo: T[];
  drafts: OcrClaimDraft[];
} {
  const kambiyo: T[] = [];
  const drafts: OcrClaimDraft[] = [];
  for (const instrument of detected) {
    if (KAMBIYO_TYPES.has(String(instrument.type))) {
      kambiyo.push(instrument);
      continue;
    }
    const amount = Number(instrument.amount);
    drafts.push({
      id: newOcrClaimDraftId(),
      kind: draftKindOf(instrument.type),
      documentType: String(instrument.type || "DIGER"),
      status: "PENDING",
      amount: Number.isFinite(amount) && amount > 0 ? amount : null,
      currency: normalizeCurrency(instrument.currency),
      documentNo: String(instrument.documentNo ?? ""),
      ...(instrument.issueDate ? { issueDate: instrument.issueDate } : {}),
      ...(instrument.dueDate ? { dueDate: instrument.dueDate } : {}),
      origin: "OCR_MULTI",
    });
  }
  return { kambiyo, drafts };
}

/** Tek belge taraması sonucu → karar bekleyen kayıt (tutar okunmadıysa null: gösterilecek bir alacak yok). */
export function ocrClaimDraftFromDebtInfo(
  debtInfo:
    | { amount?: number; currency?: string; dueDate?: string; issueDate?: string; documentNo?: string; kdvRate?: number; kdvAmount?: number }
    | null
    | undefined,
  documentType?: string,
): OcrClaimDraft | null {
  if (!debtInfo || !(Number(debtInfo.amount) > 0)) return null;
  return {
    id: newOcrClaimDraftId(),
    kind: draftKindOf(documentType),
    documentType: String(documentType || "DIGER"),
    status: "PENDING",
    amount: Number(debtInfo.amount),
    currency: normalizeCurrency(debtInfo.currency),
    documentNo: String(debtInfo.documentNo ?? ""),
    ...(debtInfo.issueDate ? { issueDate: debtInfo.issueDate } : {}),
    ...(debtInfo.dueDate ? { dueDate: debtInfo.dueDate } : {}),
    ...(debtInfo.kdvRate != null ? { kdvRate: debtInfo.kdvRate } : {}),
    ...(debtInfo.kdvAmount != null ? { kdvAmount: debtInfo.kdvAmount } : {}),
    origin: "OCR_SINGLE",
  };
}

/** Aynı belge kuyruğa iki kez girmez (tür + no + tutar + para birimi). */
export function isSameOcrDocument(a: OcrClaimDraft, b: OcrClaimDraft): boolean {
  return (
    a.kind === b.kind &&
    normalizeDocumentNo(a.documentNo) === normalizeDocumentNo(b.documentNo) &&
    cents(a.amount) === cents(b.amount) &&
    a.currency === b.currency
  );
}

/** Kalem listesinde AYNI fatura (no + tutar + para birimi) var mı? `ignoreIndex` düzenlenen kalemin kendisidir. */
export function findDuplicateFaturaIndex(raw: any, items: ReadonlyArray<{ raw: any }>, ignoreIndex: number | null = null): number {
  if (!raw || raw.kalemTuru !== "FATURA") return -1;
  const documentNo = normalizeDocumentNo(raw.faturaBilgileri?.faturaNo);
  const amount = cents(raw.bakiyeTutar);
  if (!documentNo || amount === null) return -1;
  const currency = normalizeCurrency(raw.currency);
  return items.findIndex(
    (item, index) =>
      index !== ignoreIndex &&
      item.raw?.kalemTuru === "FATURA" &&
      normalizeDocumentNo(item.raw?.faturaBilgileri?.faturaNo) === documentNo &&
      cents(item.raw?.bakiyeTutar) === amount &&
      normalizeCurrency(item.raw?.currency) === currency,
  );
}

function isFaturaDraftAlreadyListed(draft: OcrClaimDraft, items: ReadonlyArray<{ raw: any }>): boolean {
  if (draft.kind !== "FATURA") return false;
  return (
    findDuplicateFaturaIndex(
      { kalemTuru: "FATURA", faturaBilgileri: { faturaNo: draft.documentNo }, bakiyeTutar: draft.amount, currency: draft.currency },
      items,
    ) >= 0
  );
}

/**
 * Kuyruğa yeni tarama kayıtlarını işler.
 *  - `replacePendingMulti`: çoklu tarama her kabulde SEÇİMİ yeniler (kambiyo `instruments` REPLACE kuralının eşi) —
 *    önceki çoklu taramadan kalan ve hâlâ karar bekleyen kayıtlar yeni seçimle değiştirilir. Kullanıcının verdiği karar
 *    (yalnız ek belge) ve tek belge taramasından gelen kayıtlar KORUNUR.
 *  - Aynı belge kuyruğa ikinci kez girmez; kalem listesinde zaten bulunan fatura yeniden karar beklemez.
 */
export function mergeOcrClaimDrafts(
  existing: readonly OcrClaimDraft[],
  incoming: readonly OcrClaimDraft[],
  options: { replacePendingMulti?: boolean; listedItems?: ReadonlyArray<{ raw: any }> } = {},
): OcrClaimDraft[] {
  const merged = options.replacePendingMulti
    ? existing.filter((draft) => !(draft.origin === "OCR_MULTI" && draft.status === "PENDING"))
    : [...existing];
  for (const draft of incoming) {
    if (merged.some((current) => isSameOcrDocument(current, draft))) continue;
    if (isFaturaDraftAlreadyListed(draft, options.listedItems ?? [])) continue;
    merged.push(draft);
  }
  return merged;
}

export function pendingOcrClaimDrafts(drafts: readonly OcrClaimDraft[]): OcrClaimDraft[] {
  return drafts.filter((draft) => draft.status === "PENDING");
}

/** Eski taslak / bozuk kayıt savunması: yalnız biçimi geçerli kayıtlar geri yüklenir. */
export function sanitizeOcrClaimDrafts(value: unknown): OcrClaimDraft[] {
  if (!Array.isArray(value)) return [];
  const out: OcrClaimDraft[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.id !== "string" || !e.id) continue;
    if (e.kind !== "FATURA" && e.kind !== "CEK" && e.kind !== "SENET" && e.kind !== "DIGER") continue;
    const amount = Number(e.amount);
    out.push({
      id: e.id,
      kind: e.kind,
      documentType: typeof e.documentType === "string" && e.documentType ? e.documentType : e.kind,
      // Bilinmeyen durum karar verilmiş SAYILMAZ (fail-closed: karar bekler)
      status: e.status === "DOCUMENT_ONLY" ? "DOCUMENT_ONLY" : "PENDING",
      amount: e.amount !== null && Number.isFinite(amount) && amount > 0 ? amount : null,
      currency: normalizeCurrency(e.currency),
      documentNo: String(e.documentNo ?? ""),
      ...(typeof e.issueDate === "string" && e.issueDate ? { issueDate: e.issueDate } : {}),
      ...(typeof e.dueDate === "string" && e.dueDate ? { dueDate: e.dueDate } : {}),
      ...(typeof e.kdvRate === "number" ? { kdvRate: e.kdvRate } : {}),
      ...(typeof e.kdvAmount === "number" ? { kdvAmount: e.kdvAmount } : {}),
      origin: e.origin === "OCR_MULTI" ? "OCR_MULTI" : "OCR_SINGLE",
    });
  }
  return out;
}

/**
 * DİĞER belgede kullanıcının seçebileceği kalem türleri — varsayılan YOK; fer'i / masraf türleri yok (belge bir alacağın
 * dayanağıdır; masraf vb. formdan ayrıca girilir).
 */
export const OCR_DIGER_CLAIM_KINDS = [
  { value: "FATURA", label: "Fatura alacağı" },
  { value: "KIRA", label: "Kira alacağı" },
  { value: "SENET", label: "Senet / bono" },
  { value: "CEK", label: "Çek" },
  { value: "ASIL_ALACAK", label: "Genel alacak (sözleşme / cari hesap vb.)" },
] as const;
export type OcrDigerClaimKind = (typeof OCR_DIGER_CLAIM_KINDS)[number]["value"];

/** Kaydın forma yüklenirken kullanılacak kalem türü: FATURA / CEK / SENET bellidir; DİĞER'de kullanıcının seçimi şarttır. */
export function claimKindForOcrDraft(draft: OcrClaimDraft, selectedKind?: string | null): string | null {
  if (draft.kind !== "DIGER") return draft.kind;
  return OCR_DIGER_CLAIM_KINDS.some((option) => option.value === selectedKind) ? (selectedKind as string) : null;
}

/**
 * Dosya açılışında alacak kalemi para birimi taşımaz (dosya para birimi kullanılır). Belge başka para birimindeyse
 * kayıt forma yüklenmez: tarama dosya para birimini kendiliğinden değiştirmez, tutar da başka para birimine yazılmaz.
 */
export function ocrDraftCurrencyConflict(draft: Pick<OcrClaimDraft, "currency">, caseCurrency: string | null | undefined): boolean {
  return normalizeCurrency(draft.currency) !== normalizeCurrency(caseCurrency);
}

/**
 * Kayıttan, kullanıcının inceleyeceği form girdisi (alacak kalemi formunun `initialItems[0]` biçimi). Faiz alanları
 * BİLEREK verilmez: formun kendi alanı görünür ve kullanıcı seçer (tarama faiz kararı vermez). Okunamayan tarih
 * uydurulmaz (boş kalır; form tarih girilmeden kalemi vermez).
 */
export function claimRawFromOcrDraft(draft: OcrClaimDraft, kalemTuru: string): Record<string, unknown> {
  const amount = draft.amount ?? 0;
  const base: Record<string, unknown> = {
    kalemTuru,
    toplamTutar: amount,
    bakiyeTutar: amount,
    currency: draft.currency,
    vadeTarihi: draft.dueDate ?? "",
    ocrDraftId: draft.id,
    ocrBelgeTuru: draft.documentType,
    ocrTutar: draft.amount,
  };
  if (kalemTuru === "FATURA") {
    return {
      ...base,
      faturaBilgileri: { faturaNo: draft.documentNo, faturaTarihi: draft.issueDate ?? "" },
      ...(draft.kdvRate != null ? { ocrKdvRate: draft.kdvRate } : {}),
      ...(draft.kdvAmount != null ? { ocrKdvAmount: draft.kdvAmount } : {}),
    };
  }
  if (kalemTuru === "CEK") {
    // Çekte vade yoktur: form alanı "Vade/Keşide" keşide tarihidir. Keşide okunmadıysa taramadaki tek tarih keşide
    // sayılır (mevcut çek kuralı); iki tarih farklıysa ikincisi ibraz tarihi olarak önerilir, kullanıcı doğrular.
    const kesinKeside = draft.issueDate ?? draft.dueDate ?? "";
    const ibraz = draft.issueDate && draft.dueDate && draft.dueDate !== draft.issueDate ? draft.dueDate : "";
    return {
      ...base,
      vadeTarihi: kesinKeside,
      cekBilgileri: { ibrazTarihi: ibraz, duzenlemeYeri: "", cekSeriNo: draft.documentNo, hesapNo: "", bankaVeSube: "", cekiImzalayanlar: "" },
    };
  }
  if (kalemTuru === "SENET") {
    return { ...base, senetBilgileri: { senetNo: draft.documentNo, duzenlemeYeri: "", duzenlemeTarihi: draft.issueDate ?? "" } };
  }
  return { ...base, aciklama: draft.documentNo ? `${draft.documentNo} numaralı belge` : "" };
}

/**
 * Taramadan gelen fatura KDV bilgisi yalnız kalem tutarı taramadaki tutarla AYNI kaldıysa due'ya yazılır. Kullanıcı
 * tutarı değiştirdiyse taramanın KDV tutarı artık o kaleme ait değildir → yazılmaz (yanlış kayıt üretilmez).
 */
export function ocrKdvFieldsForDue(raw: any): { hasKdv?: boolean; kdvRate?: number; kdvAmount?: number } {
  if (!raw || raw.kalemTuru !== "FATURA" || raw.ocrKdvRate == null) return {};
  const amount = cents(raw.bakiyeTutar);
  if (amount === null || amount !== cents(raw.ocrTutar)) return {};
  const rate = Number(raw.ocrKdvRate);
  if (!Number.isFinite(rate)) return {};
  const kdvAmount = Number(raw.ocrKdvAmount);
  return { hasKdv: true, kdvRate: rate, ...(raw.ocrKdvAmount != null && Number.isFinite(kdvAmount) ? { kdvAmount } : {}) };
}

export function duplicateFaturaMessage(raw: any): string {
  return (
    `${raw?.faturaBilgileri?.faturaNo ?? ""} numaralı fatura aynı tutar ve para birimiyle zaten kalem listesinde. Aynı fatura ` +
    "ikinci kez eklenirse iki anapara kaydı oluşur; mevcut kalemi düzenleyin."
  );
}

export function pendingOcrDraftsMessage(count: number): string {
  return (
    `Evrak taramasından gelen ${count} kayıt karar bekliyor. Tarama sonucu kendiliğinden alacak kalemi oluşturmaz: ` +
    "alacak kalemleri adımında her kaydı inceleyip kalem olarak ekleyin, yalnız ek belge olarak tutun ya da çıkarın."
  );
}

/** Adım uyarısı (borçlular / alacak kalemleri): gönderim hatasından AYRI, kısa metin. */
export function pendingOcrDraftsNotice(count: number): string {
  return `Evrak taramasından gelen ${count} kayıt alacak kalemleri adımında kararınızı bekliyor.`;
}

export function ocrDraftCurrencyConflictMessage(draft: Pick<OcrClaimDraft, "currency">, caseCurrency: string | null | undefined): string {
  return (
    `Belgenin para birimi ${normalizeCurrency(draft.currency)}, dosya para birimi ${normalizeCurrency(caseCurrency)}. Tarama dosya para ` +
    "birimini değiştirmez ve tutarı başka para birimine yazmaz. Dosya para birimini takip bilgileri adımında değiştirin " +
    "ya da kaydı çıkarıp kalemi elle girin."
  );
}
