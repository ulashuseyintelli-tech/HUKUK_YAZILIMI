-- C36 — SMOKE PRINCIPAL FOUNDATION (SALT ADDITIVE)
--
-- Mevcut hicbir tablo/kolon/enum DEGISTIRILMEZ, YENIDEN ADLANDIRILMAZ veya DUSURULMEZ.
-- Bu nedenle RELEASE13 ayni DB semasi uzerinde calismaya DEVAM EDEBILIR (backward-compatible).
--
-- NOT: dosyaya BEGIN/COMMIT EKLENMEZ — Prisma her migration'i kendi transaction'inda
-- calistirir; elle transaction acmak advisory-lock/DDL semantigini bozar.

-- CreateEnum
CREATE TYPE "SmokePrincipalPurpose" AS ENUM ('SMOKE');

-- CreateEnum
CREATE TYPE "SmokePrincipalStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateTable
CREATE TABLE "SmokePrincipal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purpose" "SmokePrincipalPurpose" NOT NULL DEFAULT 'SMOKE',
    "status" "SmokePrincipalStatus" NOT NULL DEFAULT 'ACTIVE',
    "credentialHash" TEXT NOT NULL,
    "authGeneration" INTEGER NOT NULL DEFAULT 0,
    "provisionNonce" TEXT NOT NULL,
    "provisionReceipt" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "SmokePrincipal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SmokePrincipal_userId_key" ON "SmokePrincipal"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SmokePrincipal_provisionNonce_key" ON "SmokePrincipal"("provisionNonce");

-- CreateIndex
CREATE INDEX "SmokePrincipal_status_idx" ON "SmokePrincipal"("status");

-- CreateIndex
CREATE INDEX "SmokePrincipal_expiresAt_idx" ON "SmokePrincipal"("expiresAt");

-- AddForeignKey
ALTER TABLE "SmokePrincipal" ADD CONSTRAINT "SmokePrincipal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;