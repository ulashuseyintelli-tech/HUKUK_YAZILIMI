import { EscalationTier } from "@prisma/client";

/**
 * Operasyonel eskalasyon motorunun SAF karar mantığı (PR-3b).
 * DB/IO yok → tamamen test edilebilir. Servis bunu çağırır, sonucu uygular.
 */

export interface EscalationConfig {
  reminderDays: number; // STAFF→MANAGER eşiği (gün) — opReminderDays
  founderDays: number; // MANAGER→FOUNDER eşiği (gün) — opFounderDays
  repeatMonths: number; // FOUNDER periyodik tekrar (ay) — opRepeatMonths
}

export interface EscalationTaskState {
  createdAt: Date;
  escalationLevel: EscalationTier | null;
  lastNotifiedLevel: EscalationTier | null;
  nextFollowUpAt: Date | null;
}

export interface EscalationUpdate {
  escalationLevel: EscalationTier;
  lastNotifiedLevel: EscalationTier;
  nextFollowUpAt: Date;
  /** Bu tick'te bildirim atılacak tier; null ise gönderim yok (zaten bildirilmiş). */
  notifyTier: EscalationTier | null;
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function addMonths(d: Date, n: number): Date {
  const r = new Date(d);
  r.setMonth(r.getMonth() + n);
  return r;
}

/** Türk cep numarasını SMS için normalize eder (90XXXXXXXXXX). Geçersizse null. */
export function normalizeTrPhone(raw?: string | null): string | null {
  if (typeof raw !== "string") return null;
  const digits = raw.replace(/\D/g, "");
  let national: string;
  if (digits.length === 12 && digits.startsWith("90")) national = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) national = digits.slice(1);
  else if (digits.length === 10) national = digits;
  else return null;
  if (!national.startsWith("5")) return null; // cep 5 ile başlar; sabit hat reddedilir
  return `90${national}`;
}

/**
 * Bir operasyonel görevin ŞU ANKİ tick'te ne yapılacağını hesaplar:
 *  - Süre dolduysa (now >= nextFollowUpAt) bir üst tier'a ilerlet.
 *  - Yeni tier henüz bildirilmediyse (lastNotifiedLevel != escalationLevel) bildir.
 *  - FOUNDER'da süre dolarsa periyodik TEKRAR: aynı tier, yeniden bildir, nextFollowUpAt += repeatMonths.
 * lastNotifiedLevel guard'ı sayesinde aynı tier'a saat başı tekrar gönderilmez.
 */
export function computeEscalationUpdate(
  task: EscalationTaskState,
  cfg: EscalationConfig,
  now: Date
): EscalationUpdate {
  let level: EscalationTier = task.escalationLevel ?? "STAFF";
  let lastNotified: EscalationTier | null = task.lastNotifiedLevel ?? null;
  let next: Date = task.nextFollowUpAt ?? addDays(task.createdAt, cfg.reminderDays);

  const due = now.getTime() >= next.getTime();

  if (due) {
    if (level === "STAFF") {
      level = "MANAGER";
      next = addDays(task.createdAt, cfg.founderDays);
    } else if (level === "MANAGER") {
      level = "FOUNDER";
      next = addMonths(now, cfg.repeatMonths);
    } else {
      // FOUNDER → periyodik tekrar: tier sabit, yeniden bildirilmeli
      next = addMonths(now, cfg.repeatMonths);
      lastNotified = null; // re-send tetikle
    }
  }

  let notifyTier: EscalationTier | null = null;
  if (lastNotified !== level) {
    notifyTier = level;
    lastNotified = level;
  }

  return { escalationLevel: level, lastNotifiedLevel: lastNotified, nextFollowUpAt: next, notifyTier };
}

/** Bir tier'da hangi kanallar kullanılır (politika KİLİTLİ: SMS yalnız FOUNDER). */
export function channelsForTier(tier: EscalationTier): { email: boolean; sms: boolean } {
  return { email: true, sms: tier === "FOUNDER" };
}
