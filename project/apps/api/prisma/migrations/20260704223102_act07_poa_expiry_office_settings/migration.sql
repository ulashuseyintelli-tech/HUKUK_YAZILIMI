-- ACT-07: Vekalet Süresi Uyarısı büro-geneli ayarları (additive, E-POSTA-ONLY kapsam)

-- AlterEnum
ALTER TYPE "PoaExpiryRecipientSource" ADD VALUE 'OFFICE_OVERRIDE';

-- AlterTable
ALTER TABLE "Office" ADD COLUMN     "poaExpiryNotificationEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "poaExpiryThresholdDays" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "poaExpiryRecipientLawyerIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
