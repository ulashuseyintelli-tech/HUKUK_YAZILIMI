-- lastGreetingRunAt: Otomatik tebrik scheduler'ının o tenant (Office) için en son BAŞARIYLA
-- çalıştığı an. Aynı-gün tekrar gönderim guard'ı: scheduler her dakika çalışır, ama bir tenant
-- için gün içinde yalnız bir kez tebrik gönderir (date(lastGreetingRunAt) === bugün ise atlanır).
-- Additive: nullable, default yok → mevcut satırları ETKİLEMEZ (NULL = "bugün henüz çalışmadı",
-- ilk uygun zamanda çalışır). Geriye uyumlu, veri kaybı yok.
-- NOT: DB apply (migrate dev/deploy) AYRI/sonra; bu dosya repo'ya hazır girer.

ALTER TABLE "Office" ADD COLUMN "lastGreetingRunAt" TIMESTAMP(3);
