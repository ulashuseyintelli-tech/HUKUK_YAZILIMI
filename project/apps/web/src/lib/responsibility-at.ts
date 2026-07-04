// WP-1d-4a: Case detail temporal sorumluluk paneli için saf yardımcılar + tipler.
// Mevcut READ-ONLY endpoint'i kullanır: GET /cases/:id/responsibility-at?asOf=
// Yeni backend reconstruction / mutation / audit YOK. Sözleşme: docs/wp1d-temporal-responsibility-query-contract.md

export type ResponsibilityConfidence =
  | "EVENT_CONFIRMED"
  | "INFERRED_FROM_SNAPSHOT"
  | "UNKNOWN_BEFORE_HORIZON";

export type CombinedResponsibilityResult = {
  caseId: string;
  asOf: string;
  operationOwner: {
    type: "LAWYER" | "STAFF" | "NONE" | "UNKNOWN";
    id: string | null;
    confidence: ResponsibilityConfidence;
    sourceEventId?: string;
    changedByUserId?: string | null;
    effectiveAt?: string;
  };
  legalResponsibleLawyer: {
    lawyerId: string | null;
    confidence: ResponsibilityConfidence;
    sourceEventId?: string;
    changedByUserId?: string | null;
    effectiveAt?: string;
  };
  horizon: {
    operationOwnerInstrumentationStartedAt?: string;
    legalResponsibleInstrumentationStartedAt?: string;
    note?: string;
  };
};

/** Endpoint path'i (asOf opsiyonel; verilirse encode edilir). */
export function buildResponsibilityAtPath(caseId: string, asOf?: string): string {
  const base = `/cases/${caseId}/responsibility-at`;
  return asOf ? `${base}?asOf=${encodeURIComponent(asOf)}` : base;
}

/** Kanonik alan etiketleri. */
export const RESPONSIBILITY_FIELD_LABELS = {
  operationOwner: "Dosya Operasyon Sorumlusu",
  legalResponsibleLawyer: "Hukuki Sorumlu Avukat",
  changedByUser: "Değiştiren Kullanıcı",
  effectiveAt: "Geçerlilik Tarihi",
  confidence: "Güven Düzeyi",
} as const;

const CONFIDENCE_LABEL: Record<ResponsibilityConfidence, string> = {
  EVENT_CONFIRMED: "Audit kaydıyla doğrulandı",
  INFERRED_FROM_SNAPSHOT: "Mevcut kayıttan çıkarıldı",
  UNKNOWN_BEFORE_HORIZON: "Bu tarih için kesin kayıt yok",
};

const CONFIDENCE_TOOLTIP: Record<ResponsibilityConfidence, string> = {
  EVENT_CONFIRMED: "Bu bilgi AuditLog event stream üzerinden doğrulanmıştır.",
  INFERRED_FROM_SNAPSHOT:
    "Bu bilgi doğrudan geçmiş event'ten değil, mevcut kayıt/snapshot üzerinden çıkarılmıştır.",
  UNKNOWN_BEFORE_HORIZON:
    "Bu tarih, ilgili sorumluluk audit enstrümantasyonu öncesinde olabilir veya yeterli kayıt bulunmamıştır.",
};

/** Güven düzeyi kısa kullanıcı etiketi (bilinmeyen → "—"). */
export function confidenceLabel(c?: ResponsibilityConfidence | string | null): string {
  if (!c) return "—";
  return CONFIDENCE_LABEL[c as ResponsibilityConfidence] ?? "—";
}

/** Güven düzeyi açıklaması (tooltip + inline "Kaynak açıklaması" olarak kullanılır). */
export function confidenceTooltip(c?: ResponsibilityConfidence | string | null): string {
  if (!c) return "";
  return CONFIDENCE_TOOLTIP[c as ResponsibilityConfidence] ?? "";
}

/** Güven düzeyi rozet renk sınıfları (yanlış-kesinlik vermeyen, dürüst tonlar). */
export function confidenceBadgeClass(c?: ResponsibilityConfidence | string | null): string {
  switch (c) {
    case "EVENT_CONFIRMED":
      return "bg-green-100 text-green-700";
    case "INFERRED_FROM_SNAPSHOT":
      return "bg-amber-100 text-amber-700";
    case "UNKNOWN_BEFORE_HORIZON":
      return "bg-gray-200 text-gray-600";
    default:
      return "bg-gray-100 text-gray-500";
  }
}

/**
 * datetime-local input değerini ISO 8601'e çevirir (endpoint asOf için).
 * Boş/geçersiz → null (çağıran taraf 400'e düşmeden engeller).
 */
export function localInputToIso(local?: string | null): string | null {
  if (!local) return null;
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}
