/**
 * D-G4 — Dosya görevi eskalasyon İÇERİK helper'ları (saf; DB/IO yok).
 * Mail HTML detaylı (dosya/görev/öncelik/son tarih/kalan/mevcut kademe/sonraki kademe/link),
 * SMS kısa. Tier-farkındalı "sonraki kademe" + etiketler.
 */

import {
  caseTaskTierLabel,
  caseTaskDeepLink,
  nextCaseTaskEscalationLine,
  caseTaskEscalationSubject,
  buildCaseTaskEmailHtml,
  buildCaseTaskSmsText,
} from "../case-task-escalation-content";

const NOW = new Date(2026, 5, 1, 9, 0, 0);

const task = (over: any = {}) => ({
  title: "Tebligat İade - Ali",
  caseId: "c1",
  case: { fileNumber: "2026/1" },
  dueDate: new Date(2026, 5, 4, 9, 0, 0), // +3 gün
  priority: "HIGH",
  ...over,
});

describe("case-task-escalation-content", () => {
  beforeEach(() => {
    delete process.env.FRONTEND_URL;
  });

  it("caseTaskTierLabel: tier → Türkçe etiket", () => {
    expect(caseTaskTierLabel("RESPONSIBLE")).toBe("Dosya Sorumlusu");
    expect(caseTaskTierLabel("TEAM_LEAD")).toBe("Takım Lideri");
    expect(caseTaskTierLabel("MANAGER")).toBe("Yönetici Avukat");
    expect(caseTaskTierLabel("FOUNDER")).toBe("Kurucu/Ortak Avukat");
  });

  it("caseTaskDeepLink: caseId → /cases/:id; yoksa boş", () => {
    expect(caseTaskDeepLink("c1")).toBe("http://localhost:3002/cases/c1");
    expect(caseTaskDeepLink(null)).toBe("");
  });

  it("nextCaseTaskEscalationLine: tier-farkındalı sonraki kademe", () => {
    const at = new Date(2026, 5, 3, 14, 7);
    expect(nextCaseTaskEscalationLine("RESPONSIBLE", at)).toContain("takım liderine/yönetici");
    expect(nextCaseTaskEscalationLine("TEAM_LEAD", at)).toContain("yönetici avukata");
    expect(nextCaseTaskEscalationLine("MANAGER", at)).toContain("kurucu/ortak");
    expect(nextCaseTaskEscalationLine("FOUNDER", at)).toContain("tekrar hatırlatılacaktır");
  });

  it("caseTaskEscalationSubject: [Dosya Görevi · kademe] dosyaNo — görev", () => {
    expect(caseTaskEscalationSubject(task(), "RESPONSIBLE")).toBe(
      "[Dosya Görevi · Dosya Sorumlusu] 2026/1 — Tebligat İade - Ali"
    );
  });

  it("buildCaseTaskEmailHtml: tüm alanları içerir", () => {
    const html = buildCaseTaskEmailHtml({
      recipientName: "Ayşe Kaya",
      task: task({ description: "MERNİS sorgula" }),
      tier: "RESPONSIBLE",
      now: NOW,
      nextAt: new Date(2026, 5, 3, 9, 0),
    });
    expect(html).toContain("Sayın Ayşe Kaya");
    expect(html).toContain("<b>Dosya:</b> 2026/1");
    expect(html).toContain("<b>Görev:</b> Tebligat İade - Ali");
    expect(html).toContain("MERNİS sorgula"); // açıklama
    expect(html).toContain("<b>Öncelik:</b> Yüksek");
    expect(html).toContain("<b>Son Tarih:</b>");
    expect(html).toContain("<b>Kalan Süre:</b>");
    expect(html).toContain("<b>Mevcut Kademe:</b> Dosya Sorumlusu");
    expect(html).toContain("/cases/c1");
    expect(html).toContain("Sonraki Kademe");
  });

  it("buildCaseTaskSmsText: kısa, dosyaNo+görev+kalan içerir", () => {
    const sms = buildCaseTaskSmsText({ recipientName: "Ayşe Kaya", task: task(), now: NOW });
    expect(sms).toContain("Ayşe Kaya");
    expect(sms).toContain("2026/1");
    expect(sms).toContain("Tebligat İade - Ali");
    expect(sms).toContain("Kalan süre");
    expect(sms.length).toBeLessThan(200); // SMS kısa olmalı
  });
});
