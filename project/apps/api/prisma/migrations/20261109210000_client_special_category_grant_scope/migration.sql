-- K7.3 scoped bindings only; no existing data or grant is changed.
SET lock_timeout = '3s';
SET statement_timeout = '60s';

-- CreateTable
CREATE TABLE "ClientSpecialCategoryGrantScope" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "permissionGrantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "caseId" TEXT,
    "revokedAt" TIMESTAMP(3),
    "revokedByUserId" TEXT,
    "revokeReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientSpecialCategoryGrantScope_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClientSpecialCategoryGrantScope_tenantId_clientId_caseId_idx" ON "ClientSpecialCategoryGrantScope"("tenantId", "clientId", "caseId");

-- CreateIndex
CREATE INDEX "ClientSpecialCategoryGrantScope_tenantId_revokedAt_idx" ON "ClientSpecialCategoryGrantScope"("tenantId", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ClientSpecialCategoryGrantScope_permissionGrantId_tenantId_key" ON "ClientSpecialCategoryGrantScope"("permissionGrantId", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "PermissionGrant_id_tenantId_key" ON "PermissionGrant"("id", "tenantId");

-- AddForeignKey
ALTER TABLE "ClientSpecialCategoryGrantScope" ADD CONSTRAINT "ClientSpecialCategoryGrantScope_permissionGrantId_tenantId_fkey" FOREIGN KEY ("permissionGrantId", "tenantId") REFERENCES "PermissionGrant"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientSpecialCategoryGrantScope" ADD CONSTRAINT "ClientSpecialCategoryGrantScope_clientId_tenantId_fkey" FOREIGN KEY ("clientId", "tenantId") REFERENCES "Client"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

