import { randomUUID } from "node:crypto";
import type { Prisma, UserRole } from "@prisma/client";
import type { TaskReviewEventType } from "./task-review";

/**
 * F03-A2 (OFP-03a / OFF-INV-08; owner kararı K10 "paketteki sınır", 25.11.2026) — genel görev geçmişi: sabitler + saf yardımcılar.
 *
 * `TaskHistoryEvent` ekleme-yalnız (append-only) tablodur ve domain yazımıyla AYNI işlemde yazılır: geçmiş yazılamazsa görev
 * değişikliği de geri alınır. İptal olguları bu tabloya YAZILMAZ; `TaskCancellationEvent`'te kalır (#3090) ve okuma ucunda
 * birlikte sıralanır.
 *
 * KAPSAM SINIRI (K10): geçmişi yalnız görev uçları (TaskService: oluşturma / güncelleme) ve müvekkil eksik-bilgi görevinin
 * yeniden doğuşu (ClientService) yazar. Diğer sistem üreticileri (borçlu, masraf, müvekkil ekstresi, zamanlayıcı, eskalasyon)
 * kendi yazımlarında geçmiş YAZMAZ; okuma ucu bu sınırı yanıtta bildirir. Eski kayıtlar için geriye dönük satır ÜRETİLMEZ.
 *
 * Olay türü / aktör türü / yetki kaynağı METİN kolonlarıdır (enum değil): yeni tür eklemek şema değişikliği ve eski derlemenin
 * okuma kırılmasını doğurmaz.
 */
export const TASK_HISTORY_EVENT = {
  CREATED: "CREATED",
  ASSIGNEE_CHANGED: "ASSIGNEE_CHANGED",
  STATUS_CHANGED: "STATUS_CHANGED",
  /** Kapalı (COMPLETED / CANCELLED) görevin yeniden açık duruma (PENDING / IN_PROGRESS) dönmesi. */
  REOPENED: "REOPENED",
  PRIORITY_CHANGED: "PRIORITY_CHANGED",
  DUE_DATE_CHANGED: "DUE_DATE_CHANGED",
  CASE_LINK_CHANGED: "CASE_LINK_CHANGED",
} as const;
export type TaskHistoryEventType = (typeof TASK_HISTORY_EVENT)[keyof typeof TASK_HISTORY_EVENT];

export const TASK_HISTORY_ACTOR = { USER: "USER", SYSTEM: "SYSTEM" } as const;

/** Aktörün değişikliği HANGİ sıfatla yaptığı (anlık görüntü). Yetki ÜRETMEZ; yalnız mevcut kuralın izidir. */
export const TASK_HISTORY_AUTHORITY = {
  CREATOR: "CREATOR",
  ASSIGNEE: "ASSIGNEE",
  ADMIN: "ADMIN",
  /** Görevle özel ilişkisi olmayan, yazma yetkili büro kullanıcısı (bugünkü PUT /tasks kuralı). */
  TENANT_WRITER: "TENANT_WRITER",
  SYSTEM_PRODUCER: "SYSTEM_PRODUCER",
} as const;

/** Müvekkil eksik-bilgi (iletişim) görevini yeniden açan üretici (ClientService.syncContactFollowUpTask). */
export const TASK_HISTORY_PRODUCER_CLIENT_CONTACT = "CLIENT_CONTACT_FOLLOWUP";

const OPEN_STATUSES = new Set(["PENDING", "IN_PROGRESS"]);
const CLOSED_STATUSES = new Set(["COMPLETED", "CANCELLED"]);

export interface TaskHistorySnapshot {
  status: string;
  priority: string;
  assigneeId: string | null;
  dueDate: Date | null;
  caseId: string | null;
  completedAt?: Date | null;
  completedByUserId?: string | null;
  resolutionType?: string | null;
}

export interface TaskHistoryChange {
  /** Genel olay türü ya da (F03-C) kontrol olayı; kolon metindir, yeni tür şema değişikliği gerektirmez. */
  eventType: TaskHistoryEventType | TaskReviewEventType;
  fromValue: string | null;
  toValue: string | null;
  details?: Prisma.InputJsonValue;
  /** Kullanıcının yazdığı gerekçe (F03-C: kontrol kararı / kontrol işaretinin kaldırılması); 1–2000 karakter. */
  reason?: string;
}

const iso = (value: Date | null | undefined): string | null => (value instanceof Date ? value.toISOString() : null);

/**
 * İki görev durumu arasındaki İZLENEN alan farkları (atama, durum, öncelik, son tarih, dosya bağı). Değişmeyen alan olay ÜRETMEZ.
 * Kapalı → açık geçiş `REOPENED` olarak yazılır ve önceki kapanış atfını `details` içinde saklar (yeniden açma atfı siler).
 */
export function diffTaskHistory(before: TaskHistorySnapshot, after: TaskHistorySnapshot): TaskHistoryChange[] {
  const changes: TaskHistoryChange[] = [];
  if (before.status !== after.status) {
    const reopened = CLOSED_STATUSES.has(before.status) && OPEN_STATUSES.has(after.status);
    changes.push({
      eventType: reopened ? TASK_HISTORY_EVENT.REOPENED : TASK_HISTORY_EVENT.STATUS_CHANGED,
      fromValue: before.status,
      toValue: after.status,
      ...(reopened
        ? {
            details: {
              previousCompletedAt: iso(before.completedAt),
              previousCompletedByUserId: before.completedByUserId ?? null,
              previousResolutionType: before.resolutionType ?? null,
            },
          }
        : {}),
    });
  }
  if ((before.assigneeId ?? null) !== (after.assigneeId ?? null)) {
    changes.push({ eventType: TASK_HISTORY_EVENT.ASSIGNEE_CHANGED, fromValue: before.assigneeId ?? null, toValue: after.assigneeId ?? null });
  }
  if (before.priority !== after.priority) {
    changes.push({ eventType: TASK_HISTORY_EVENT.PRIORITY_CHANGED, fromValue: before.priority, toValue: after.priority });
  }
  if (iso(before.dueDate) !== iso(after.dueDate)) {
    changes.push({ eventType: TASK_HISTORY_EVENT.DUE_DATE_CHANGED, fromValue: iso(before.dueDate), toValue: iso(after.dueDate) });
  }
  if ((before.caseId ?? null) !== (after.caseId ?? null)) {
    changes.push({ eventType: TASK_HISTORY_EVENT.CASE_LINK_CHANGED, fromValue: before.caseId ?? null, toValue: after.caseId ?? null });
  }
  return changes;
}

/** Oluşturma olayı: başlangıç değerleri `details` içinde (önceki değer yoktur). */
export function createdTaskHistory(after: TaskHistorySnapshot): TaskHistoryChange {
  return {
    eventType: TASK_HISTORY_EVENT.CREATED,
    fromValue: null,
    toValue: after.status,
    details: { status: after.status, priority: after.priority, assigneeId: after.assigneeId ?? null, dueDate: iso(after.dueDate), caseId: after.caseId ?? null },
  };
}

/** Kullanıcı aktörün görevle ilişkisi → yetki kaynağı izi. Sıra: oluşturan > atanan > ADMIN > büro yazarı. */
export function taskHistoryUserAuthority(actor: { id: string; role: string }, task: { createdById?: string | null; assigneeId?: string | null }): string {
  if (task.createdById && task.createdById === actor.id) return TASK_HISTORY_AUTHORITY.CREATOR;
  if (task.assigneeId && task.assigneeId === actor.id) return TASK_HISTORY_AUTHORITY.ASSIGNEE;
  if (actor.role === "ADMIN") return TASK_HISTORY_AUTHORITY.ADMIN;
  return TASK_HISTORY_AUTHORITY.TENANT_WRITER;
}

export const newTaskHistoryCorrelationId = (): string => randomUUID();

/** Kullanıcı eylemi satırları (aynı istekten doğan satırlar tek `correlationId` taşır). */
export function userTaskHistoryRows(input: {
  tenantId: string;
  taskId: string;
  actor: { id: string; role: UserRole };
  authoritySource: string;
  correlationId: string;
  changes: TaskHistoryChange[];
}): Prisma.TaskHistoryEventCreateManyInput[] {
  return input.changes.map((change) => ({
    tenantId: input.tenantId,
    taskId: input.taskId,
    eventType: change.eventType,
    actorType: TASK_HISTORY_ACTOR.USER,
    actorUserId: input.actor.id,
    actorRole: input.actor.role,
    authoritySource: input.authoritySource,
    fromValue: change.fromValue,
    toValue: change.toValue,
    ...(change.details !== undefined ? { details: change.details } : {}),
    ...(change.reason !== undefined ? { reason: change.reason } : {}),
    correlationId: input.correlationId,
  }));
}

/** Sistem üreticisi satırı: aktör kullanıcı YOKTUR; üretici adı `details.producer` içinde taşınır. */
export function systemTaskHistoryRow(input: {
  tenantId: string;
  taskId: string;
  producer: string;
  change: TaskHistoryChange;
  correlationId?: string;
}): Prisma.TaskHistoryEventCreateManyInput {
  const details = { ...((input.change.details as Record<string, unknown> | undefined) ?? {}), producer: input.producer };
  return {
    tenantId: input.tenantId,
    taskId: input.taskId,
    eventType: input.change.eventType,
    actorType: TASK_HISTORY_ACTOR.SYSTEM,
    actorUserId: null,
    actorRole: null,
    authoritySource: TASK_HISTORY_AUTHORITY.SYSTEM_PRODUCER,
    fromValue: input.change.fromValue,
    toValue: input.change.toValue,
    details: details as Prisma.InputJsonValue,
    correlationId: input.correlationId ?? newTaskHistoryCorrelationId(),
  };
}
