-- Additive, explicit POA-to-existing-Case links. Existing records are not inferred or backfilled.
CREATE UNIQUE INDEX "ClientPowerOfAttorney_id_clientId_tenantId_key"
  ON "ClientPowerOfAttorney"("id", "clientId", "tenantId");

CREATE TABLE "PoaCaseLink" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "poaId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "caseId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sourcePoaUpdatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PoaCaseLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PoaCaseLink_poaId_caseId_key" ON "PoaCaseLink"("poaId", "caseId");
CREATE INDEX "PoaCaseLink_tenantId_poaId_idx" ON "PoaCaseLink"("tenantId", "poaId");
CREATE INDEX "PoaCaseLink_caseId_clientId_idx" ON "PoaCaseLink"("caseId", "clientId");

ALTER TABLE "PoaCaseLink" ADD CONSTRAINT "PoaCaseLink_poaId_clientId_tenantId_fkey"
  FOREIGN KEY ("poaId", "clientId", "tenantId")
  REFERENCES "ClientPowerOfAttorney"("id", "clientId", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PoaCaseLink" ADD CONSTRAINT "PoaCaseLink_caseId_tenantId_fkey"
  FOREIGN KEY ("caseId", "tenantId")
  REFERENCES "Case"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PoaCaseLink" ADD CONSTRAINT "PoaCaseLink_caseId_clientId_fkey"
  FOREIGN KEY ("caseId", "clientId")
  REFERENCES "CaseClient"("caseId", "clientId") ON DELETE RESTRICT ON UPDATE CASCADE;
