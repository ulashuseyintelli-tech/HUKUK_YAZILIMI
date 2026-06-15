-- PR-3a: Görev & Eskalasyon config + iletişim alanları (cep/whatsapp).
-- ADDITIVE: tüm kolonlar nullable veya default'lu → mevcut satırlar ETKİLENMEZ. Yeni tablo YOK.
-- Eskalasyon motoru (PR-3b) bu alanları OKUR; bu PR yalnız veri+UI (config/contact).
-- NOT: DB apply (migrate deploy) ayrı adım; prod N/A.

-- Avukat & Personel: ofis telefonundan ayrı cep + whatsapp (SMS/WhatsApp eskalasyonu için)
ALTER TABLE "Lawyer" ADD COLUMN "mobilePhone" TEXT;
ALTER TABLE "Lawyer" ADD COLUMN "whatsappPhone" TEXT;
ALTER TABLE "StaffMember" ADD COLUMN "mobilePhone" TEXT;
ALTER TABLE "StaffMember" ADD COLUMN "whatsappPhone" TEXT;

-- Büro-geneli eskalasyon politikası (Office üzerinde — smtp/sms/greeting ayarlarıyla aynı yerde)
ALTER TABLE "Office" ADD COLUMN "escalationManagerLawyerId" TEXT;
ALTER TABLE "Office" ADD COLUMN "escalationFounderLawyerId" TEXT;
ALTER TABLE "Office" ADD COLUMN "opReminderDays" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "Office" ADD COLUMN "opFounderDays" INTEGER NOT NULL DEFAULT 6;
ALTER TABLE "Office" ADD COLUMN "opRepeatMonths" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "Office" ADD COLUMN "opEmailEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Office" ADD COLUMN "opSmsEnabled" BOOLEAN NOT NULL DEFAULT true;
