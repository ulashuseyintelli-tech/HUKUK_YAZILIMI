/**
 * F03-C (OFP-04; owner kararları K3-a, K4-b, K5-b, K5b-a, K8, K9 — 25.11.2026) — görev içi bağımsız ilk kontrol: ekran yardımcıları.
 *
 * Sunucu durumu: `status` (PENDING / IN_PROGRESS / COMPLETED / CANCELLED) + AYRI kontrol alanları
 * (`reviewRequired`, `reviewStatus`, `reviewSubmittedByUserId`, `reviewedByUserId`, `reviewNote`).
 * "Kontrolde" görev sunucuda `IN_PROGRESS` + `reviewStatus = AWAITING` olarak durur; ekran onu ayrı bir durum gibi gösterir ama
 * yeni bir durum değeri UYDURMAZ. Buradaki yetki yardımcıları yalnız DÜĞME SUNUMU içindir: kararı sunucu verir (kişi düzeyi
 * bağımsızlık — aynı kişinin ikinci hesabı — ve görev görünüm kapsamı yalnız sunucuda sınanabilir).
 */
export interface TaskReviewFields {
  status: string;
  createdById?: string | null;
  reviewRequired?: boolean | null;
  reviewStatus?: string | null;
  reviewSubmittedByUserId?: string | null;
  reviewedByUserId?: string | null;
  reviewNote?: string | null;
  /** Sistem üreticisi izleri: biri doluysa görev kullanıcının açtığı görev değildir ve kontrole tabi tutulamaz. */
  dedupeKey?: string | null;
  taskSubType?: string | null;
  clientId?: string | null;
  debtorId?: string | null;
  addressId?: string | null;
}

export interface ReviewViewer {
  id: string;
  role?: string | null;
}

export const isAwaitingReview = (task: Pick<TaskReviewFields, "status" | "reviewStatus">): boolean =>
  task.status === "IN_PROGRESS" && task.reviewStatus === "AWAITING";

const isOpen = (task: Pick<TaskReviewFields, "status">): boolean => task.status === "PENDING" || task.status === "IN_PROGRESS";

export interface TaskReviewBadge {
  label: string;
  tone: "info" | "warning" | "success" | "neutral";
}

/** Görev kartındaki kontrol rozeti; kontrole tabi olmayan ve kontrol geçmişi bulunmayan görevde rozet yoktur. */
export function taskReviewBadge(task: TaskReviewFields): TaskReviewBadge | null {
  if (isAwaitingReview(task)) return { label: "Kontrolde", tone: "info" };
  if (task.status === "COMPLETED" && task.reviewStatus === "APPROVED") return { label: "Kontrol edildi", tone: "success" };
  if (isOpen(task)) {
    if (task.reviewStatus === "REVISION_REQUESTED") return { label: "Revizyon istendi", tone: "warning" };
    if (task.reviewStatus === "REJECTED") return { label: "Kontrolde reddedildi", tone: "warning" };
    if (task.reviewRequired) return { label: "Kontrol gerekli", tone: "neutral" };
  }
  return null;
}

/**
 * Karar düğmeleri kime SUNULUR (K5b-a): büro yöneticisi (ADMIN) ya da görevi oluşturan; işi yapan hesabın kendisi hariç.
 * Aynı kişinin başka hesabı burada bilinemez → sunucu 403 `TASK_REVIEW_SAME_PERSON` döner ve ekran nedenini yazar.
 */
export function canOfferReviewDecision(viewer: ReviewViewer | null | undefined, task: TaskReviewFields): boolean {
  if (!viewer || !isAwaitingReview(task)) return false;
  if (viewer.role === "VIEWER") return false;
  if (task.reviewSubmittedByUserId && task.reviewSubmittedByUserId === viewer.id) return false;
  return viewer.role === "ADMIN" || (!!task.createdById && task.createdById === viewer.id);
}

/** "Kontrol işaretini kaldır" kime sunulur (K8): görevi oluşturan ya da büro yöneticisi; kapalı görevde sunulmaz. */
export function canOfferReviewRequirementRemoval(viewer: ReviewViewer | null | undefined, task: TaskReviewFields): boolean {
  if (!viewer || !task.reviewRequired) return false;
  if (viewer.role === "VIEWER" || !isOpen(task)) return false;
  return viewer.role === "ADMIN" || (!!task.createdById && task.createdById === viewer.id);
}

/** "Kontrol gerekli yap" kime sunulur (K4-b): YALNIZ görevi oluşturana; kullanıcının açtığı, açık ve işaretsiz görevde. */
export function canOfferReviewRequirementSet(viewer: ReviewViewer | null | undefined, task: TaskReviewFields): boolean {
  if (!viewer || viewer.role === "VIEWER" || task.reviewRequired || !isOpen(task)) return false;
  if (!task.createdById || task.createdById !== viewer.id) return false;
  return !(task.dedupeKey || task.taskSubType || task.clientId || task.debtorId || task.addressId);
}

export type ReviewDecisionKind = "APPROVE" | "REQUEST_REVISION" | "REJECT";
export type ReviewActionKind = ReviewDecisionKind | "REMOVE_REQUIREMENT" | "SET_REQUIREMENT";

export const REVIEW_DECISION_KINDS: readonly ReviewDecisionKind[] = ["APPROVE", "REQUEST_REVISION", "REJECT"];

export const REVIEW_DECISION_LABEL: Record<ReviewDecisionKind, string> = {
  APPROVE: "Onayla",
  REQUEST_REVISION: "Revizyon iste",
  REJECT: "Reddet",
};

export interface ReviewActionText {
  title: string;
  description: string;
  /** Metin alanı etiketi; `null` → metin alanı yok. */
  textLabel: string | null;
  /** Metin zorunlu mu (ret, revizyon, işaretin kaldırılması). */
  textRequired: boolean;
  confirm: string;
  failure: string;
  stale: string;
}

/** Kontrol penceresinin metinleri. Sonuç cümleleri sunucunun yaptığını söyler; fazlasını vaat etmez. */
export const REVIEW_ACTION_TEXT: Record<ReviewActionKind, ReviewActionText> = {
  APPROVE: {
    title: "Kontrol: onayla",
    description: "Onaylanınca görev tamamlanmış sayılır; tamamlama işi yapan kişiye yazılır.",
    textLabel: "Not (isteğe bağlı)",
    textRequired: false,
    confirm: "Onayla",
    failure: "Kontrol kararı kaydedilemedi. Görev DEĞİŞMEDİ.",
    stale: "Kontrol kararı KAYDEDİLDİ, ancak liste yenilenemedi.",
  },
  REQUEST_REVISION: {
    title: "Kontrol: revizyon iste",
    description: "Görev, işi yapan kişiye “devam ediyor” olarak döner. Gerekçe görevde ve geçmişinde kalır.",
    textLabel: "Revizyon gerekçesi",
    textRequired: true,
    confirm: "Revizyon iste",
    failure: "Kontrol kararı kaydedilemedi. Görev DEĞİŞMEDİ.",
    stale: "Kontrol kararı KAYDEDİLDİ, ancak liste yenilenemedi.",
  },
  REJECT: {
    title: "Kontrol: reddet",
    description: "Görev havuza döner: “bekliyor” olur ve atananı kaldırılır; iş yapılmamış sayılır, görev yeniden atanmayı bekler. Gerekçe görevde ve geçmişinde kalır.",
    textLabel: "Ret gerekçesi",
    textRequired: true,
    confirm: "Reddet",
    failure: "Kontrol kararı kaydedilemedi. Görev DEĞİŞMEDİ.",
    stale: "Kontrol kararı KAYDEDİLDİ, ancak liste yenilenemedi.",
  },
  REMOVE_REQUIREMENT: {
    title: "Kontrol işaretini kaldır",
    description:
      "Görev kontrolsüz tamamlanabilir olur. Kontrol bekleniyorsa bekleyen kontrol düşer ve görev “devam ediyor” kalır. Kaldırma, gerekçesiyle görev geçmişine yazılır.",
    textLabel: "Kaldırma gerekçesi",
    textRequired: true,
    confirm: "İşareti kaldır",
    failure: "Kontrol işareti kaldırılamadı. Görev DEĞİŞMEDİ.",
    stale: "Kontrol işareti KALDIRILDI, ancak liste yenilenemedi.",
  },
  SET_REQUIREMENT: {
    title: "Kontrol gerekli yap",
    description: "Görev tamamlandığında, işi yapandan başka bir kişi (görevi görebilen büro yöneticisi ya da siz) onaylamadan tamamlanmış sayılmaz.",
    textLabel: null,
    textRequired: false,
    confirm: "İşaretle",
    failure: "Kontrol işareti konamadı. Görev DEĞİŞMEDİ.",
    stale: "Kontrol işareti KONDU, ancak liste yenilenemedi.",
  },
};

/** Görev oluşturma penceresindeki "Kontrol gerekli" kutusunun açıklaması. */
export const REVIEW_REQUIRED_HINT =
  "Görev tamamlandığında, işi yapandan başka bir kişi (görevi görebilen büro yöneticisi ya da siz) onaylamadan tamamlanmış sayılmaz.";
/** İşaretli görev tamamlandığında gösterilen bilgi. */
export const REVIEW_SUBMITTED_NOTICE = "Görev kontrole gönderildi; onaylanınca tamamlanmış sayılır.";
/** Kontrolde bekleyen görevde, karar veremeyen kullanıcıya gösterilen açıklama. */
export const REVIEW_AWAITING_HINT = "Kontrol bekleniyor: kararı işi yapandan başka bir kişi (büro yöneticisi ya da görevi oluşturan) verir.";
/** Kontrolde bekleyen görevin durumu neden değiştirilemez. */
export const REVIEW_AWAITING_STATUS_HINT = "Görev kontrolde; durumu yalnız kontrol kararıyla ya da kontrol işaretinin kaldırılmasıyla değişir.";

/** Son kontrol kararının kart üzerindeki tek satırlık özeti (karar yoksa null). */
export function lastReviewDecisionText(task: TaskReviewFields): string | null {
  const note = task.reviewNote?.trim();
  if (task.reviewStatus === "REVISION_REQUESTED") return `Revizyon istendi${note ? `: ${note}` : ""}`;
  if (task.reviewStatus === "REJECTED") return `Kontrolde reddedildi${note ? `: ${note}` : ""}`;
  if (task.reviewStatus === "APPROVED") return `Kontrol edildi${note ? `: ${note}` : ""}`;
  return null;
}
