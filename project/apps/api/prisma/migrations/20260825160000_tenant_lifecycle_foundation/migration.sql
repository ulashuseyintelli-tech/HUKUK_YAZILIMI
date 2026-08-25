-- CreateEnum
CREATE TYPE "TenantLifecycle" AS ENUM ('PROVISIONING', 'ACTIVE', 'QUIESCING', 'SUSPENDED', 'RETIRED');

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "lifecycle" "TenantLifecycle" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "lifecycleChangedAt" TIMESTAMP(3),
ADD COLUMN     "lifecycleReason" TEXT,
ADD COLUMN     "lifecycleTarget" "TenantLifecycle",
ADD COLUMN     "quiesceToken" TEXT;

-- CreateIndex
CREATE INDEX "Tenant_lifecycle_idx" ON "Tenant"("lifecycle");

