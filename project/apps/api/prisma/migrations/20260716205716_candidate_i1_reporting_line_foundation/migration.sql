-- CreateTable
CREATE TABLE "ReportingLine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "managerUserId" TEXT NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportingLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReportingLine_tenantId_idx" ON "ReportingLine"("tenantId");

-- CreateIndex
CREATE INDEX "ReportingLine_tenantId_actorUserId_idx" ON "ReportingLine"("tenantId", "actorUserId");

-- CreateIndex
CREATE INDEX "ReportingLine_tenantId_managerUserId_idx" ON "ReportingLine"("tenantId", "managerUserId");
