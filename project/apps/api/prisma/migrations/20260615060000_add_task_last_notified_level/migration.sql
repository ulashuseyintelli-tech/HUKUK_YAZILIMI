-- PR-3b: Eskalasyon çift-gönderim guard'ı. Bir tier'a bildirim atılınca set edilir;
-- scheduler her saat çalışsa da aynı tier'a tekrar mail/SMS basmaz. ADDITIVE, nullable.
-- NOT: DB apply (migrate deploy) ayrı; prod N/A.

ALTER TABLE "Task" ADD COLUMN "lastNotifiedLevel" "EscalationTier";
