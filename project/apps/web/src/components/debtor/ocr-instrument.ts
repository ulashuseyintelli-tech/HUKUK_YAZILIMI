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
