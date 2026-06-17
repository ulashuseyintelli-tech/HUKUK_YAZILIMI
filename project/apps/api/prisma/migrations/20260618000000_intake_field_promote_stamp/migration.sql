-- ClientIntakeField promote audit damgası (Faz 4.7 PR-C2b-pre).
-- Eski satırlar null (doğal); YENİ promote akışları (promoteSoftField/promoteAddress/promote)
-- bu iki alanı MUTLAKA set eder. Additive + nullable → mevcut veri/davranış bozulmaz.
ALTER TABLE "ClientIntakeField" ADD COLUMN "promotedAt" TIMESTAMP(3);
ALTER TABLE "ClientIntakeField" ADD COLUMN "promotedById" TEXT;
