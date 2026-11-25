/**
 * F03-A2 (OFP-03a) — görev geçmişi satırının ekran metni (saf dönüştürücü).
 *
 * `GET /tasks/:id/history` genel geçmişi (TaskHistoryEvent) ve gerekçeli iptalleri (TaskCancellationEvent) tek sıralı listede verir.
 * Bu dosya yalnız sunucunun verdiği değerleri adlandırır; eksik bilgiyi UYDURMAZ: adı çözülemeyen kişi / dosya için ad yazılmaz,
 * bilinmeyen olay türü ham koduyla gösterilir.
 */
export interface TaskHistoryItem {
  id: string;
  kind: "HISTORY" | "CANCELLATION";
  eventType: string;
  actorType: string;
  actorUserId: string | null;
  actorName: string | null;
  actorRole: string | null;
  authoritySource: string;
  fromValue: string | null;
  toValue: string | null;
  fromLabel: string | null;
  toLabel: string | null;
  reason: string | null;
  correlationId: string | null;
  createdAt: string;
}

export interface TaskHistoryCoverage {
  /** Görevin oluşturulması geçmişte kayıtlı mı (kayıt başlamadan önce açılan görevde `false`). */
  creationRecorded: boolean;
  /** Sistem üreticilerinin BÜTÜN yazımları geçmişe giriyor mu (bugün `false`: yalnız müvekkil eksik-bilgi yeniden doğuşu girer). */
  systemWritersRecorded: boolean;
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Bekliyor",
  IN_PROGRESS: "Devam Ediyor",
  COMPLETED: "Tamamlandı",
  CANCELLED: "İptal edildi",
};
const PRIORITY_LABEL: Record<string, string> = { LOW: "Düşük", MEDIUM: "Orta", HIGH: "Yüksek", URGENT: "Acil" };
const AUTHORITY_LABEL: Record<string, string> = {
  CREATOR: "görevi oluşturan",
  ASSIGNEE: "atanan",
  ADMIN: "yönetici",
  TENANT_WRITER: "büro kullanıcısı",
  SYSTEM_PRODUCER: "sistem",
  // F03-C: kontrol kararını hangi sıfatla verdiği.
  REVIEWER_ADMIN: "kontrol eden yönetici",
  REVIEWER_CREATOR: "kontrol eden, görevi oluşturan",
};

const NONE = "—";
const status = (v: string | null) => (v ? STATUS_LABEL[v] ?? v : NONE);
const priority = (v: string | null) => (v ? PRIORITY_LABEL[v] ?? v : NONE);
const date = (v: string | null) => {
  if (!v) return NONE;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString("tr-TR");
};
/** Ad çözülemediyse (kişi kaldırılmış / dosya aktöre görünmüyor) ad UYDURULMAZ. */
const person = (value: string | null, label: string | null) => (value ? label ?? "adı görüntülenemeyen kullanıcı" : "atanmamış");
const caseRef = (value: string | null, label: string | null) => (value ? label ?? "görüntüleme yetkiniz olmayan dosya" : "dosyasız");

/** Olayın tek satırlık açıklaması. */
export function describeTaskHistoryEvent(item: TaskHistoryItem): string {
  switch (item.eventType) {
    case "CREATED":
      return "Görev oluşturuldu";
    case "ASSIGNEE_CHANGED":
      return `Atanan: ${person(item.fromValue, item.fromLabel)} → ${person(item.toValue, item.toLabel)}`;
    case "STATUS_CHANGED":
      return `Durum: ${status(item.fromValue)} → ${status(item.toValue)}`;
    case "REOPENED":
      return `Yeniden açıldı: ${status(item.fromValue)} → ${status(item.toValue)}`;
    case "PRIORITY_CHANGED":
      return `Öncelik: ${priority(item.fromValue)} → ${priority(item.toValue)}`;
    case "DUE_DATE_CHANGED":
      return `Bitiş tarihi: ${date(item.fromValue)} → ${date(item.toValue)}`;
    case "CASE_LINK_CHANGED":
      return `Dosya: ${caseRef(item.fromValue, item.fromLabel)} → ${caseRef(item.toValue, item.toLabel)}`;
    case "CANCELLED":
      return `İptal edildi: ${status(item.fromValue)} → ${status(item.toValue)}`;
    // F03-C: görev içi bağımsız ilk kontrol. "Kontrolde" ayrı bir durum değeri değildir; olay adı ne olduğunu söyler.
    case "REVIEW_REQUIREMENT_SET":
      return "Kontrol gerekli olarak işaretlendi";
    case "REVIEW_REQUIREMENT_REMOVED":
      return "Kontrol işareti kaldırıldı";
    case "REVIEW_SUBMITTED":
      return "Tamamlandı bildirildi; kontrole gönderildi";
    case "REVIEW_APPROVED":
      return "Kontrol: onaylandı — görev tamamlandı";
    case "REVIEW_REVISION_REQUESTED":
      return "Kontrol: revizyon istendi — görev işi yapana döndü";
    case "REVIEW_REJECTED":
      return "Kontrol: reddedildi — görev yeniden bekliyor";
    default:
      return item.eventType;
  }
}

/** Değişikliği yapan: kullanıcı adı (çözülemezse kimliği) ya da "Sistem"; yanında hangi sıfatla yaptığı. */
export function describeTaskHistoryActor(item: TaskHistoryItem): string {
  const who = item.actorType === "SYSTEM" ? "Sistem" : item.actorName || item.actorUserId || "bilinmeyen kullanıcı";
  const as = AUTHORITY_LABEL[item.authoritySource];
  return as && item.actorType !== "SYSTEM" ? `${who} (${as})` : who;
}

/** Geçmişin kapsam sınırı: ekran, kayıtlı olmayanı "değişmedi" gibi göstermez. */
export function taskHistoryCoverageNotes(coverage: TaskHistoryCoverage | null | undefined): string[] {
  const notes: string[] = [];
  if (!coverage) return notes;
  if (!coverage.creationRecorded) {
    notes.push("Bu görevin geçmiş kaydı sonradan başladı: oluşturulması ve kayıt başlamadan önceki değişiklikleri burada yer almaz.");
  }
  if (!coverage.systemWritersRecorded) {
    notes.push("Görev ekranından ve dosyadan yapılan değişiklikler kayıtlıdır. Sistemin kendiliğinden yaptığı değişiklikler (borçlu, masraf, ekstre, zamanlayıcı kaynaklı) bu geçmişte yer almaz.");
  }
  return notes;
}
