/**
 * F03-C (OFP-04 / WR01 B05, D-WR-2; owner kararları K3-a, K4-b, K5-b, K5b-a, K8, K9 — 25.11.2026) — görev içi bağımsız ilk kontrol:
 * sabitler + saf yardımcılar.
 *
 * - Taşıyıcı görevin KENDİ durum makinesidir (K3-a); ADR-009 OfficeApprovalRequest kullanılmaz, ikinci onay motoru kurulmaz.
 * - Kontrole tabi görev: oluşturanın "kontrol gerekli" işaretlediği, kullanıcı tarafından açılmış görev (K4-b; varsayılan kapalı).
 *   Sistem üreticilerinin görevleri ve AUTO_SYSTEM kapanışları kontrole girmez.
 * - Kontrol durumu AYRI alanlardadır; `TaskStatus` enum'una değer EKLENMEZ. "Kontrolde" görev `status = IN_PROGRESS` kalır
 *   (tamamlanmış SAYILMAZ): mevcut açık-görev süzgeçleri (eskalasyon, zamanlayıcı, dosya listesi) görevi düşürmez; "tamamlandı"
 *   sayan tüketiciler (rapor, performans) görevi kontrol onayına kadar saymaz. Eski derleme yeni kolonları okumaz ve görevi
 *   "devam ediyor" görür.
 * - Kontrol edebilenler (K5b-a): aynı büronun aktif ADMIN'leri + görevi oluşturan; işi yapanla AYNI KİŞİ olan (kişi düzeyi,
 *   `common/approval-identity`) hariç.
 */
export const TASK_REVIEW_STATUS = {
  /** İşi yapan tamamladı; farklı bir kişinin kararı bekleniyor. */
  AWAITING: "AWAITING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  REVISION_REQUESTED: "REVISION_REQUESTED",
} as const;
export type TaskReviewStatus = (typeof TASK_REVIEW_STATUS)[keyof typeof TASK_REVIEW_STATUS];

export const TASK_REVIEW_DECISION = {
  APPROVE: "APPROVE",
  REJECT: "REJECT",
  REQUEST_REVISION: "REQUEST_REVISION",
} as const;
export type TaskReviewDecision = (typeof TASK_REVIEW_DECISION)[keyof typeof TASK_REVIEW_DECISION];

/** Görev geçmişi olay türleri (TaskHistoryEvent.eventType metin kolonu). */
export const TASK_REVIEW_EVENT = {
  REQUIREMENT_SET: "REVIEW_REQUIREMENT_SET",
  REQUIREMENT_REMOVED: "REVIEW_REQUIREMENT_REMOVED",
  SUBMITTED: "REVIEW_SUBMITTED",
  APPROVED: "REVIEW_APPROVED",
  REJECTED: "REVIEW_REJECTED",
  REVISION_REQUESTED: "REVIEW_REVISION_REQUESTED",
} as const;
export type TaskReviewEventType = (typeof TASK_REVIEW_EVENT)[keyof typeof TASK_REVIEW_EVENT];

/** Kararın geçmişteki yetki kaynağı izi. */
export const TASK_REVIEW_AUTHORITY = { ADMIN: "REVIEWER_ADMIN", CREATOR: "REVIEWER_CREATOR" } as const;

export const TASK_REVIEW_ERROR = {
  /** K5 / K8: işi yapandan (ya da yapacak olandan) başka kontrol edebilecek kişi yok. */
  NO_ELIGIBLE_REVIEWER: "TASK_REVIEW_NO_ELIGIBLE_REVIEWER",
  /** Görev kontrolde; durum yalnız kontrol kararıyla ya da kontrol işaretinin kaldırılmasıyla değişir. */
  AWAITING: "TASK_REVIEW_AWAITING",
  /** Karar verilecek bekleyen bir kontrol yok. */
  NOT_AWAITING: "TASK_REVIEW_NOT_AWAITING",
  /** Karar veren, işi yapanla aynı kişi (aynı hesap ya da aynı kişinin başka hesabı). */
  SAME_PERSON: "TASK_REVIEW_SAME_PERSON",
  /** Aktör bu görevde kontrol kararı veremez / işareti değiştiremez. */
  NOT_AUTHORIZED: "TASK_REVIEW_NOT_AUTHORIZED",
  /** Görev kontrole tabi tutulamaz (sistem görevi / kapalı görev). */
  NOT_APPLICABLE: "TASK_REVIEW_NOT_APPLICABLE",
} as const;

export interface TaskReviewState {
  status: string;
  reviewRequired: boolean;
  reviewStatus: string | null;
}

/** "Kontrolde": iki koşul birlikte. Eski derleme ya da başka yol durumu değiştirdiyse bayat AWAITING kontrolde sayılmaz. */
export function isAwaitingReview(task: Pick<TaskReviewState, "status" | "reviewStatus">): boolean {
  return task.status === "IN_PROGRESS" && task.reviewStatus === TASK_REVIEW_STATUS.AWAITING;
}

/**
 * Kontrole tabi tutulabilir görev (K4-b): kullanıcı tarafından açılmış (oluşturanı var), sistem üreticisine ait olmayan
 * (mükerrer anahtarı / alt türü / müvekkil-borçlu-adres bağı yok) ve kapalı olmayan görev.
 */
export function isReviewApplicable(task: {
  status: string;
  createdById: string | null;
  dedupeKey: string | null;
  taskSubType: string | null;
  clientId: string | null;
  debtorId: string | null;
  addressId: string | null;
}): boolean {
  if (!task.createdById) return false;
  if (task.dedupeKey || task.taskSubType || task.clientId || task.debtorId || task.addressId) return false;
  return task.status === "PENDING" || task.status === "IN_PROGRESS";
}

/**
 * Karar sonrası görev durumu (K9 "revizyon kişiye, ret havuza"): onay → tamamlandı; revizyon → işi yapanda devam ediyor;
 * ret → bekliyor (iş yapılmamış sayılır). Ret ayrıca atananı kaldırır (havuz); atama alanını servis yazar.
 */
export function statusAfterReviewDecision(decision: TaskReviewDecision): "COMPLETED" | "IN_PROGRESS" | "PENDING" {
  if (decision === TASK_REVIEW_DECISION.APPROVE) return "COMPLETED";
  if (decision === TASK_REVIEW_DECISION.REQUEST_REVISION) return "IN_PROGRESS";
  return "PENDING";
}

export function reviewStatusAfterDecision(decision: TaskReviewDecision): TaskReviewStatus {
  if (decision === TASK_REVIEW_DECISION.APPROVE) return TASK_REVIEW_STATUS.APPROVED;
  if (decision === TASK_REVIEW_DECISION.REQUEST_REVISION) return TASK_REVIEW_STATUS.REVISION_REQUESTED;
  return TASK_REVIEW_STATUS.REJECTED;
}

export function reviewEventForDecision(decision: TaskReviewDecision): string {
  if (decision === TASK_REVIEW_DECISION.APPROVE) return TASK_REVIEW_EVENT.APPROVED;
  if (decision === TASK_REVIEW_DECISION.REQUEST_REVISION) return TASK_REVIEW_EVENT.REVISION_REQUESTED;
  return TASK_REVIEW_EVENT.REJECTED;
}
