import { CaseTaskTier } from "./case-task-escalation-logic";
import { formatRemaining, formatTrDateTime, priorityTr } from "./operational-escalation.service";

/**
 * D-G4 — Dosya görevi eskalasyon bildirim İÇERİĞİ (saf, test edilebilir; DB/IO yok).
 * CaseTaskEscalationService.dispatch bunları kullanır. Motor/state-machine mantığı BURADA DEĞİL
 * (yalnız sunum). Mail HTML detaylı, SMS kısa. Operasyonel saf helper'lar (formatRemaining/
 * formatTrDateTime/priorityTr) reuse edilir.
 */

const TIER_LABEL: Record<CaseTaskTier, string> = {
  RESPONSIBLE: "Dosya Sorumlusu",
  TEAM_LEAD: "Takım Lideri",
  MANAGER: "Yönetici Avukat",
  FOUNDER: "Kurucu/Ortak Avukat",
};

/** Tier → insan-okunur Türkçe etiket (mail/SMS başlık ve "mevcut kademe" için). */
export function caseTaskTierLabel(tier: CaseTaskTier): string {
  return TIER_LABEL[tier];
}

/** Dosya detay deep-link. caseId yoksa boş döner. */
export function caseTaskDeepLink(caseId: string | null | undefined): string {
  if (!caseId) return "";
  const base = (process.env.FRONTEND_URL || "http://localhost:3002").replace(/\/$/, "");
  return `${base}/cases/${caseId}`;
}

/** "Sonraki kademe" satırı (tier-farkındalı). */
export function nextCaseTaskEscalationLine(tier: CaseTaskTier, nextAt: Date | null): string {
  const dateStr = nextAt ? formatTrDateTime(nextAt) : "ileri tarihte";
  if (tier === "RESPONSIBLE") return `Tamamlanmazsa ${dateStr} tarihinde takım liderine/yönetici avukata bildirilecektir.`;
  if (tier === "TEAM_LEAD") return `Tamamlanmazsa ${dateStr} tarihinde yönetici avukata bildirilecektir.`;
  if (tier === "MANAGER") return `Tamamlanmazsa ${dateStr} tarihinde kurucu/ortak avukata bildirilecektir.`;
  return `Tamamlanmazsa ${dateStr} tarihinde tekrar hatırlatılacaktır.`; // FOUNDER
}

/** Mail konusu: [Dosya Görevi · <kademe>] <dosyaNo> — <görev>. */
export function caseTaskEscalationSubject(task: any, tier: CaseTaskTier): string {
  const fileNumber = task?.case?.fileNumber || "-";
  return `[Dosya Görevi · ${TIER_LABEL[tier]}] ${fileNumber} — ${task?.title || "Görev"}`;
}

/** Detaylı HTML mail gövdesi: dosya/görev/öncelik/son tarih/kalan süre/mevcut kademe/sonraki kademe/link. */
export function buildCaseTaskEmailHtml(opts: {
  recipientName: string;
  task: any;
  tier: CaseTaskTier;
  now: Date;
  nextAt: Date | null;
}): string {
  const { recipientName, task, tier, now, nextAt } = opts;
  const fileNumber = task?.case?.fileNumber || "-";
  const dueStr = task?.dueDate ? formatTrDateTime(task.dueDate) : "Belirtilmemiş";
  const remainingStr = formatRemaining(task?.dueDate, now);
  const priorityStr = priorityTr(task?.priority);
  const link = caseTaskDeepLink(task?.caseId);
  const descHtml = task?.description ? `<b>Açıklama:</b><br>${String(task.description).replace(/\n/g, "<br>")}<br><br>` : "";

  return (
    `Sayın ${recipientName},<br><br>` +
    `Aşağıdaki dosya göreviniz takibinizi bekliyor:<br><br>` +
    `<b>Dosya:</b> ${fileNumber}<br>` +
    `<b>Görev:</b> ${task?.title || "-"}<br>` +
    descHtml +
    `<b>Öncelik:</b> ${priorityStr}<br>` +
    `<b>Son Tarih:</b> ${dueStr}<br>` +
    `<b>Kalan Süre:</b> ${remainingStr}<br>` +
    `<b>Mevcut Kademe:</b> ${TIER_LABEL[tier]}<br><br>` +
    (link ? `<b>Dosyaya Git:</b><br><a href="${link}">${link}</a><br><br>` : "") +
    `<b>Sonraki Kademe:</b><br>${nextCaseTaskEscalationLine(tier, nextAt)}`
  );
}

/** Kısa SMS metni (FOUNDER kademesinde gönderilir). */
export function buildCaseTaskSmsText(opts: { recipientName: string; task: any; now: Date }): string {
  const { recipientName, task, now } = opts;
  const fileNumber = task?.case?.fileNumber || "-";
  const remainingStr = formatRemaining(task?.dueDate, now);
  return `Sayın ${recipientName}, ${fileNumber} dosya görevi (${task?.title || "görev"}) takip bekliyor. Kalan süre: ${remainingStr}.`;
}
