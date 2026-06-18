// PR-3a — OCR çoklu-enstrüman: frontend tip mirror + saf instrumentsToDues helper.
// Backend debt-instrument.types.ts ile AYNI şekil (ileride @hukuk/types'a taşınabilir).
// PR-3a: yalnız tip + mapping. UI tablo/wiring PR-3b'de.

export type InstrumentType = "CEK" | "SENET" | "POLICE" | "FATURA" | "DIGER";
export type Currency = "TRY" | "USD" | "EUR" | "GBP" | "CHF";
export type GroupingMethod =
  | "DOCUMENT_NO_MATCH"
  | "FACE_SIGNAL"
  | "SEQUENTIAL_HEURISTIC"
  | "TYPE_BOUNDARY"
  | "WEAK_AMOUNT_ONLY"
  | "AMBIGUOUS";

export interface Instrument {
  type: InstrumentType;
  documentNo?: string;
  amount?: number;
  currency: Currency;
  issueDate?: string;
  dueDate?: string;
  bankName?: string;
  branchName?: string;
  iban?: string;
  drawerName?: string;
  debtorCandidates?: string[];
  pageRange?: [number, number];
  confidence: number;
  // PR-2a-1 / PR-2b-2 meta (review UI'da gösterilir — PR-3b)
  sourcePages?: number[];
  needsReview?: boolean;
  duplicateCandidateReason?: string;
  groupingMethod?: GroupingMethod;
  groupConfidence?: number;
  evidenceText?: string;
}

/** instrumentsToDues çıktısı — wizard DueItem'in ilgili alt kümesi (amount STRING). */
export interface InstrumentDue {
  type: "PRINCIPAL";
  description: string;
  amount: string;
  dueDate: string;
}

export const INSTRUMENT_TYPE_LABELS: Record<InstrumentType, string> = {
  CEK: "Çek",
  SENET: "Senet",
  POLICE: "Poliçe",
  FATURA: "Fatura",
  DIGER: "Belge",
};

/**
 * Seçilen N enstrümanı N alacak kalemine (PRINCIPAL due) çevirir (1:1, sıra korunur).
 * Saf fonksiyon (deterministik, test edilebilir).
 *  - amount yoksa boş string (kullanıcı UI'da doldurur — PR-3b).
 *  - dueDate yoksa defaultDueDate (caller bugünü verir; helper Date.now KULLANMAZ).
 */
export function instrumentsToDues(instruments: Instrument[], defaultDueDate = ""): InstrumentDue[] {
  return instruments.map((i) => {
    const label = INSTRUMENT_TYPE_LABELS[i.type] ?? "Belge";
    const description = i.documentNo
      ? `${i.documentNo} numaralı ${label} (asıl alacak)`
      : `${label} (asıl alacak)`;
    return {
      type: "PRINCIPAL",
      description,
      amount: i.amount != null ? String(i.amount) : "",
      dueDate: i.dueDate || defaultDueDate,
    };
  });
}

// ── PR-3b: review tablosu satırı + accept davranış kararı (saf, test edilebilir) ──

/** Review tablosunda tek satır: seçim + (düzenlenebilir) enstrüman kopyası. */
export interface ReviewRow {
  selected: boolean;
  instrument: Instrument;
}

export type ScanAcceptDecision =
  | { mode: "instruments"; instruments: Instrument[] }
  | { mode: "debtInfo" };

/**
 * Accept kararı (KRİTİK SINIR): instruments.length > 1 → YALNIZ onInstrumentsDetected
 * (seçili enstrümanlar); aksi → YALNIZ eski onDebtInfoDetected. Çift-ekleme önlenir.
 */
export function decideScanAccept(
  allInstruments: Instrument[] | undefined,
  selectedInstruments: Instrument[],
): ScanAcceptDecision {
  if (allInstruments && allInstruments.length > 1) {
    return { mode: "instruments", instruments: selectedInstruments };
  }
  return { mode: "debtInfo" };
}

/** Tablo görünürken buton metni "Seçili evrakları ekle"; aksi "Tümünü Ekle". */
export function acceptButtonLabel(hasInstrumentTable: boolean): string {
  return hasInstrumentTable ? "Seçili evrakları ekle" : "Tümünü Ekle";
}

/** Tablo görünür ve hiç seçim yoksa accept butonu disabled. */
export function isAcceptDisabled(hasInstrumentTable: boolean, selectedCount: number): boolean {
  return hasInstrumentTable && selectedCount === 0;
}

/** instruments>1 ise tablo gösterilir (veri-bazlı kapı; flag bilgisi yok). */
export function shouldShowInstrumentTable(instruments: Instrument[] | undefined): boolean {
  return !!instruments && instruments.length > 1;
}

/**
 * PR-N1 — Review tablosunun ilk satırları: needsReview=true → default SEÇİLİ DEĞİL
 * (sistem "emin değilim" diyorsa kalemi otomatik takibe sokmaz); aksi seçili.
 * Enstrümanın KOPYASINI taşır (tabloda düzenlenir; orijinal mutasyona uğramaz).
 */
export function buildInitialReviewRows(instruments: Instrument[]): ReviewRow[] {
  return instruments.map((i) => ({ selected: i.needsReview !== true, instrument: { ...i } }));
}

// ── PR-N4a: createCase payload instruments[] şekli + zorunlu-alan doğrulama (saf) ──

/**
 * Backend CaseInstrumentInputDto AYNASI (createCase payload `instruments[]` öğesi).
 * Yalnız CaseInstrument'a aktarılabilir alanlar (payeeName OCR'da yok → taşınmaz).
 */
export interface CaseInstrumentPayload {
  type: InstrumentType;
  amount: number;
  issueDate: string;
  documentNo: string;
  currency: Currency;
  dueDate?: string;
  bankName?: string;
  branchName?: string;
  drawerName?: string;
}

/**
 * Enstrüman CaseInstrument olabilmek için gerekli alanlar TAM mı (N3-pure invariant aynası).
 * documentNo (boş değil) + amount (>0) + currency + issueDate. Eksikse backend sessiz atlar/400.
 */
export function isInstrumentComplete(i: Instrument): boolean {
  return (
    !!i.documentNo &&
    i.documentNo.trim() !== "" &&
    i.amount != null &&
    i.amount > 0 &&
    !!i.currency &&
    !!i.issueDate
  );
}

/**
 * Frontend Instrument → backend CaseInstrumentInputDto şekli (saf). YALNIZ isInstrumentComplete
 * geçen enstrümanlar için çağrılır (zorunlu alanlar garanti). Wiring/payload N4b'de.
 */
export function instrumentToCaseInstrumentPayload(i: Instrument): CaseInstrumentPayload {
  return {
    type: i.type,
    amount: i.amount as number,
    issueDate: i.issueDate as string,
    documentNo: i.documentNo as string,
    currency: i.currency,
    dueDate: i.dueDate,
    bankName: i.bankName,
    branchName: i.branchName,
    drawerName: i.drawerName,
  };
}

/** Seçili enstrümanlardan herhangi biri eksikse true (accept butonu disabled için). */
export function hasIncompleteSelected(selected: Instrument[]): boolean {
  return selected.some((i) => !isInstrumentComplete(i));
}

/**
 * PR-N4b: seçili enstrümanları createCase payload `instruments[]` şekline çevirir (REPLACE caller'da).
 * Savunmacı: eksik (isInstrumentComplete=false) olanları ELER (N4a accept-gating zaten engeller).
 * Sıra korunur. instrumentsToDues YERİNE bu kullanılır → çek dues'a PRINCIPAL KONMAZ (K1).
 */
export function selectedInstrumentsToPayload(instruments: Instrument[]): CaseInstrumentPayload[] {
  return instruments.filter(isInstrumentComplete).map(instrumentToCaseInstrumentPayload);
}
