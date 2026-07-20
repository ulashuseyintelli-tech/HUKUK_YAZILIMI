-- OFFICE-AUTH-P01: additive-only. tokenVersion parola değişince artırılır, JWT validation'da
-- DB değeriyle karşılaştırılır (eski/claimsiz token'lar 0 kabul edilip reddedilir).
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "passwordChangedAt" TIMESTAMP(3),
ADD COLUMN     "tokenVersion" INTEGER NOT NULL DEFAULT 0;
