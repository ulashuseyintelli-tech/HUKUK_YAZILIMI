import { addDays, addMonths } from "./escalation-logic";

/**
 * Dosya görevi (case-linked LEGAL_WORKFLOW) owner-first eskalasyonunun SAF karar mantığı (D-G2).
 * DB/IO yok → tamamen test edilebilir. CaseTaskEscalationService (D-G3) bunu çağırıp sonucu uygular.
 * Operasyonel motorun escalation-logic.ts'inden AYRI (K-D1) — ladder ve enum farklı.
 *
 * Yerel `CaseTaskTier` string-union'ı Prisma `CaseTaskTier` enum'u ile YAPISAL OLARAK ÖZDEŞTİR
 * (aynı string değerler) → D-G3 servisi Prisma enum'uyla sorunsuz alışveriş eder. Saf modülü
 * Prisma client'ından bağımsız tutmak (ve client-regen bağımlılığından kaçınmak) için yerel tanımlanır.
 */

export type CaseTaskTier = "RESPONSIBLE" | "TEAM_LEAD" | "MANAGER" | "FOUNDER";

export interface CaseTaskEscalationConfig {
  ownerDays: number; // RESPONSIBLE → bir üst kademe eşiği (gün) — Office.caseTaskOwnerDays
  teamLeadDays: number; // TEAM_LEAD → MANAGER eşiği (gün) — Office.caseTaskTeamLeadDays
  managerDays: number; // MANAGER → FOUNDER eşiği (gün) — Office.caseTaskManagerDays
  repeatMonths: number; // FOUNDER periyodik tekrar (ay) — Office.opRepeatMonths reuse
  hasTeamLead: boolean; // Office.escalationTeamLeadLawyerIds boş değil mi (K-D2: boşsa L1 atlanır)
}

export interface CaseTaskEscalationState {
  createdAt: Date;
  caseEscalationLevel: CaseTaskTier | null;
  caseLastNotifiedLevel: CaseTaskTier | null;
  caseNextFollowUpAt: Date | null;
}

export interface CaseTaskEscalationUpdate {
  caseEscalationLevel: CaseTaskTier;
  /** Gönderim BAŞARILI olursa (ya da gerekmiyorsa) kalıcı yapılacak guard değeri. */
  caseLastNotifiedLevel: CaseTaskTier;
  /**
   * Gönderim BAŞARISIZ/ATLANMIŞ olursa kalıcı yapılacak guard değeri (notify-advance ÖNCESİ baseline).
   * notifyTier set iken bu değer mevcut level'dan FARKLIDIR → sonraki tick aynı tier'ı retry eder.
   * (retry-safety: guard yalnız SENT'te ilerler — operasyonel motorla aynı disiplin.)
   */
  caseLastNotifiedLevelOnFailure: CaseTaskTier | null;
  caseNextFollowUpAt: Date;
  /** Bu tick'te bildirim atılacak tier; null ise gönderim yok (zaten bildirilmiş). */
  notifyTier: CaseTaskTier | null;
}

/**
 * Bir dosya görevinin ŞU ANKİ tick'te ne yapılacağını hesaplar (owner-first):
 *  - Başlangıç kademesi RESPONSIBLE (Dosya Sorumlusu); ilk eşik createdAt + ownerDays.
 *  - Süre dolduysa (now >= next) bir üst kademeye ilerlet:
 *      RESPONSIBLE → (hasTeamLead ? TEAM_LEAD : MANAGER)  [K-D2: takım lideri yoksa atla]
 *      TEAM_LEAD   → MANAGER
 *      MANAGER     → FOUNDER
 *      FOUNDER     → periyodik TEKRAR (aynı tier, yeniden bildir, next += repeatMonths)
 *  - Yeni tier henüz bildirilmediyse (lastNotified != level) bildirilir.
 * lastNotifiedLevel guard'ı sayesinde aynı tier'a saat başı tekrar gönderilmez.
 */
export function computeCaseTaskEscalationUpdate(
  task: CaseTaskEscalationState,
  cfg: CaseTaskEscalationConfig,
  now: Date
): CaseTaskEscalationUpdate {
  let level: CaseTaskTier = task.caseEscalationLevel ?? "RESPONSIBLE";
  let lastNotified: CaseTaskTier | null = task.caseLastNotifiedLevel ?? null;
  let next: Date = task.caseNextFollowUpAt ?? addDays(task.createdAt, cfg.ownerDays);

  const due = now.getTime() >= next.getTime();

  if (due) {
    if (level === "RESPONSIBLE") {
      // K-D2: takım lideri yapılandırılmamışsa TEAM_LEAD kademesi atlanır → doğrudan Yönetici.
      if (cfg.hasTeamLead) {
        level = "TEAM_LEAD";
        next = addDays(now, cfg.teamLeadDays);
      } else {
        level = "MANAGER";
        next = addDays(now, cfg.managerDays);
      }
    } else if (level === "TEAM_LEAD") {
      level = "MANAGER";
      next = addDays(now, cfg.managerDays);
    } else if (level === "MANAGER") {
      level = "FOUNDER";
      next = addMonths(now, cfg.repeatMonths);
    } else {
      // FOUNDER → periyodik tekrar: tier sabit, yeniden bildirilmeli.
      next = addMonths(now, cfg.repeatMonths);
      lastNotified = null; // re-send tetikle
    }
  }

  // notify-advance ÖNCESİ baseline: gönderim başarısız/atlanırsa bu kalıcı yapılır → retry mümkün.
  const guardBaseline: CaseTaskTier | null = lastNotified;

  let notifyTier: CaseTaskTier | null = null;
  if (lastNotified !== level) {
    notifyTier = level;
    lastNotified = level;
  }

  return {
    caseEscalationLevel: level,
    caseLastNotifiedLevel: lastNotified,
    caseLastNotifiedLevelOnFailure: guardBaseline,
    caseNextFollowUpAt: next,
    notifyTier,
  };
}

/** Bir tier'da hangi kanallar kullanılır (politika KİLİTLİ: SMS yalnız FOUNDER — operasyonelle aynı). */
export function channelsForCaseTaskTier(tier: CaseTaskTier): { email: boolean; sms: boolean } {
  return { email: true, sms: tier === "FOUNDER" };
}
