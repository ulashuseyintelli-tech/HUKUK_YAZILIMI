-- CreateEnum
CREATE TYPE "ExternalCaseStatusSource" AS ENUM ('MANUAL', 'SYSTEM_DERIVED', 'UYAP_RESULT');

-- CreateEnum
CREATE TYPE "ExternalCaseClosureReason" AS ENUM ('FULLY_COLLECTED', 'NEGATIVE_RESPONSE', 'DUPLICATE_RECORD', 'SUPERSEDED', 'OTHER');

-- AlterTable
ALTER TABLE "ExternalCase" ADD COLUMN     "closureReason" "ExternalCaseClosureReason",
ADD COLUMN     "externalReference" TEXT,
ADD COLUMN     "statusChangedAt" TIMESTAMP(3),
ADD COLUMN     "statusChangedBy" TEXT,
ADD COLUMN     "statusOccurredAt" TIMESTAMP(3),
ADD COLUMN     "statusSource" "ExternalCaseStatusSource";

-- DEBTOR-EXTERNAL-CASE-STATUS-INTEGRITY-P1-I15-D2 kapsam notu: `prisma migrate dev`
-- burada ayrica BankSettlementEvidence/BankTransaction FK adlarini yeniden adlandiran
-- 2 "RenameForeignKey" ifadesi uretti (schema.prisma'daki mevcut @relation tanimi ile
-- gecmis migration dosyalarindaki FK adi arasinda ONCEDEN VAR OLAN, bu PR'dan tamamen
-- bagimsiz bir drift). git diff ile dogrulandi: bu migration'a yol acan schema.prisma
-- degisikligi YALNIZ ExternalCase alanlaridir (39 satir ekleme, Bank modellerine sifir
-- dokunus). O 2 ifade kasitli olarak buradan CIKARILDI (D2 kapsami disi, ayri bir
-- gorev/PR konusu) — bu migration yalnizca yukaridaki additive ExternalCase
-- degisikliklerini icerir.
