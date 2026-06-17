-- Faz 4.5: ClientIntakeSubmission.claimedById/claimedAt (additive) — review claim için
ALTER TABLE "ClientIntakeSubmission" ADD COLUMN "claimedById" TEXT;
ALTER TABLE "ClientIntakeSubmission" ADD COLUMN "claimedAt" TIMESTAMP(3);
