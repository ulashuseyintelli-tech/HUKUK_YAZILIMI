-- ClientAddress-1: additive schema for multi-address support on Client.
-- Does NOT touch Client.address/city/district/postalCode/region (flat columns kept).
-- Does NOT touch any other table. APPLY requires separate owner GO (not run by this task).

-- CreateEnum
CREATE TYPE "ClientAddressType" AS ENUM ('MERNIS', 'TICARI', 'TEBLIGAT', 'FATURA', 'BEYAN');

-- CreateTable
CREATE TABLE "ClientAddress" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "type" "ClientAddressType" NOT NULL DEFAULT 'BEYAN',
    "street" TEXT,
    "city" TEXT,
    "district" TEXT,
    "region" TEXT,
    "postalCode" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientAddress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClientAddress_clientId_idx" ON "ClientAddress"("clientId");

-- CreateIndex
CREATE INDEX "ClientAddress_type_idx" ON "ClientAddress"("type");

-- CreateIndex
CREATE INDEX "ClientAddress_isCurrent_idx" ON "ClientAddress"("isCurrent");

-- AddForeignKey
ALTER TABLE "ClientAddress" ADD CONSTRAINT "ClientAddress_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
