// A2-min / A3 (PR-2) — OCR extraction feedback: PII'SİZ telemetri payload üretimi (saf, test edilebilir).
//
// Amaç: kullanıcının ACCEPT'te OCR ön-doldurmasını alan-bazlı ne kadar düzelttiğini ölçmek.
// KRİTİK INVARYANT: ham OCR değeri / kullanıcı final değeri / iş değeri (tutar, çek no, tarih)
// payload'a ASLA girmez — yalnız edited:boolean + confidence/groupConfidence/needsReview/type/field.
// Backend (POST /ocr/extraction-feedback) forbidNonWhitelisted ile ikinci kalkan.

import { Instrument } from "./ocr-instrument";
import type { ReviewRow } from "./ocr-instrument";

/** Telemetri sözlüğü — kanonik domain InstrumentType'tan (CEK/SENET/...) BİLEREK ayrı (analytics sınırı). */
export type TelemetryDocType = "CHECK" | "PROMISSORY_NOTE" | "UNKNOWN";

/** İlk kapsam: yalnız 4 düzenlenebilir instrument alanı (party/A1 alanları SONRAKİ PR). */
export type TelemetryField = "documentNo" | "issueDate" | "dueDate" | "amount";
const TELEMETRY_FIELDS: TelemetryField[] = ["documentNo", "issueDate", "dueDate", "amount"];

export interface OcrExtractionFeedbackItem {
  instrumentType: TelemetryDocType;
  field: TelemetryField;
  edited: boolean;
  confidence: number;
  groupConfidence?: number;
  needsReview?: boolean;
}

export interface OcrExtractionFeedbackPayload {
  documentType: TelemetryDocType;
  items: OcrExtractionFeedbackItem[];
}

/** CEK→CHECK · SENET→PROMISSORY_NOTE · diğer/bilinmeyen→UNKNOWN. (documentType de aynı string'lerle.) */
export function mapToTelemetryType(t: string | undefined | null): TelemetryDocType {
  if (t === "CEK") return "CHECK";
  if (t === "SENET") return "PROMISSORY_NOTE";
  return "UNKNOWN";
}

/**
 * Alan OCR-orijinaline göre DEĞİŞTİ mi? (yalnız bool; değer döndürmez/saklamaz).
 * - orijinal boş + final boş   → false
 * - orijinal boş + final dolu   → true  (OCR kaçırdı, kullanıcı doldurdu)
 * - orijinal dolu + final değişti → true
 */
export function isFieldEdited(original: unknown, final: unknown): boolean {
  const norm = (v: unknown): string => {
    if (v === undefined || v === null) return "";
    if (typeof v === "number") return Number.isNaN(v) ? "" : String(v);
    return String(v).trim();
  };
  return norm(original) !== norm(final);
}

function clampPct(n: number): number {
  if (typeof n !== "number" || Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * PII'SİZ extraction feedback payload üretir.
 * - YALNIZ seçili instrument'lar (M1).
 * - reviewRows, originalInstruments ile İNDEKS hizalı (buildInitialReviewRows 1:1 kopya kurar;
 *   tabloda satır eklenmez/silinmez → hizalama korunur).
 * - Her seçili instrument için 4 alan; edited = orijinal[i].field vs final[i].field.
 * - Seçili instrument yoksa null döner (istek atılmaz).
 */
export function buildExtractionFeedbackPayload(
  documentType: string | undefined | null,
  originalInstruments: Instrument[] | undefined,
  reviewRows: ReviewRow[],
): OcrExtractionFeedbackPayload | null {
  const originals = originalInstruments ?? [];
  const items: OcrExtractionFeedbackItem[] = [];

  reviewRows.forEach((row, i) => {
    if (!row.selected) return; // M1: yalnız seçili (accepted) instrument'lar
    const original = originals[i];
    const final = row.instrument;

    for (const field of TELEMETRY_FIELDS) {
      const item: OcrExtractionFeedbackItem = {
        instrumentType: mapToTelemetryType(final.type),
        field,
        edited: isFieldEdited(original ? original[field] : undefined, final[field]),
        confidence: clampPct(final.confidence),
      };
      if (final.groupConfidence != null) {
        // domain 0-1 → telemetri 0-100 (InstrumentReviewTable görünümüyle aynı ölçek).
        item.groupConfidence = clampPct(final.groupConfidence * 100);
      }
      if (final.needsReview != null) {
        item.needsReview = final.needsReview;
      }
      items.push(item);
    }
  });

  if (items.length === 0) return null;
  return { documentType: mapToTelemetryType(documentType), items };
}
