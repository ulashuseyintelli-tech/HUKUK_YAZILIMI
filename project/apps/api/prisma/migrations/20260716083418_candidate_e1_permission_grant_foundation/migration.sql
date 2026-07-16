-- CreateEnum
CREATE TYPE "PermissionGrantScope" AS ENUM ('DIRECT_REPORTS', 'TEAM', 'GLOBAL');

-- CreateEnum
CREATE TYPE "PermissionGrantEffect" AS ENUM ('ALLOW', 'DENY');

-- CreateTable
CREATE TABLE "PermissionGrant" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "subjectUserId" TEXT NOT NULL,
    "permissionKey" TEXT NOT NULL,
    "effect" "PermissionGrantEffect" NOT NULL DEFAULT 'ALLOW',
    "scope" "PermissionGrantScope" NOT NULL DEFAULT 'TEAM',
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3),
    "grantedByUserId" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PermissionGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PermissionGrant_tenantId_idx" ON "PermissionGrant"("tenantId");

-- CreateIndex
CREATE INDEX "PermissionGrant_tenantId_subjectUserId_idx" ON "PermissionGrant"("tenantId", "subjectUserId");

-- CreateIndex
CREATE INDEX "PermissionGrant_tenantId_permissionKey_idx" ON "PermissionGrant"("tenantId", "permissionKey");

-- CreateIndex
CREATE INDEX "PermissionGrant_validUntil_idx" ON "PermissionGrant"("validUntil");
