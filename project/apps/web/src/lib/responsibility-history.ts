// WP-1d-4c-2: Sorumluluk Değişim Geçmişi (timeline) UI için saf yardımcılar + tipler.
// Mevcut READ-ONLY endpoint: GET /cases/:id/responsibility-history. Yeni backend YOK.
// Confidence etiketleri responsibility-at'tan reuse edilir (tek-kaynak).

import { type ResponsibilityConfidence } from "./responsibility-at";

export type PartyRef = { type: "LAWYER" | "STAFF" | "NONE" | "UNKNOWN"; id: string | null };
export type HistoryEventType = "operationOwner" | "legalResponsibleLawyer";

export interface ResponsibilityHistoryEvent {
  id: string;
  type: HistoryEventType;
  effectiveAt: string;
  changedByUserId: string | null;
  confidence: ResponsibilityConfidence | string;
  oldValue: PartyRef;
  newValue: PartyRef;
  sourceEventId: string;
  note?: string;
}

export interface ResponsibilityHistoryResult {
  caseId: string;
  from: string | null;
  to: string | null;
  events: ResponsibilityHistoryEvent[];
  horizon: { note?: string };
}

export interface ResponsibilityHistoryParams {
  from?: string;
  to?: string;
  includeInferred?: boolean;
  type?: HistoryEventType | "all";
}

/** Değişiklik türü kullanıcı etiketi. */
export const HISTORY_CHANGE_TYPE_LABEL: Record<string, string> = {
  operationOwner: "Dosya Operasyon Sorumlusu",
  legalResponsibleLawyer: "Hukuki Sorumlu Avukat",
};
export function changeTypeLabel(t: string): string {
  return HISTORY_CHANGE_TYPE_LABEL[t] ?? t;
}

/**
 * PartyRef → kullanıcı etiketi (DÜRÜSTLÜK kuralları):
 * - NONE → "Atanmamış" (yalnız gerçekten kimse yoksa)
 * - UNKNOWN → "Bilinmiyor" (kim olduğu çözülemiyor) — "Atanmamış" İLE KARIŞTIRILMAZ
 * - LAWYER/STAFF → çözülen isim (varsa); yoksa tip etiketi ("Avukat"/"Personel") — ham id GÖSTERİLMEZ
 */
export function formatParty(ref: PartyRef | undefined | null, nameById?: Record<string, string>): string {
  if (!ref) return "Bilinmiyor";
  switch (ref.type) {
    case "NONE":
      return "Atanmamış";
    case "UNKNOWN":
      return "Bilinmiyor";
    case "LAWYER":
      return (ref.id && nameById?.[ref.id]) || "Avukat";
    case "STAFF":
      return (ref.id && nameById?.[ref.id]) || "Personel";
    default:
      return "Bilinmiyor";
  }
}

/** Endpoint path'i (params opsiyonel; verilenler encode edilir). */
export function buildResponsibilityHistoryPath(caseId: string, params: ResponsibilityHistoryParams = {}): string {
  const qs = new URLSearchParams();
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);
  if (params.includeInferred !== undefined) qs.set("includeInferred", String(params.includeInferred));
  if (params.type) qs.set("type", params.type);
  const q = qs.toString();
  return `/cases/${caseId}/responsibility-history${q ? `?${q}` : ""}`;
}
