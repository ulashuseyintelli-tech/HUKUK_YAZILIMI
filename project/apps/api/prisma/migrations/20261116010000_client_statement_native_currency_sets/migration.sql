-- CreateTable
CREATE TABLE "ClientStatementNativeSet" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "sourceCutAt" TIMESTAMP(3) NOT NULL,
    "sourceCaseIds" TEXT[],
    "memberCount" INTEGER NOT NULL,
    "memberHash" TEXT NOT NULL,
    "status" "ClientStatementStatus" NOT NULL DEFAULT 'ACTIVE',
    "supersededById" TEXT,
    "closedAt" TIMESTAMP(3),
    "closeNote" TEXT,
    "generatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientStatementNativeSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientStatementNativeDocument" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "setId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "render" JSONB NOT NULL,
    "renderHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientStatementNativeDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientStatementNativeArtifact" (
    "documentId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "pdf" BYTEA NOT NULL,
    "sha256" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientStatementNativeArtifact_pkey" PRIMARY KEY ("documentId")
);

-- CreateTable
CREATE TABLE "ClientStatementNativeDelivery" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "setId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "memberHash" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "status" "ClientStatementDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "reservedAt" TIMESTAMP(3),
    "lastAttemptAt" TIMESTAMP(3),
    "nextRetryAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientStatementNativeDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClientStatementNativeSet_tenantId_clientId_periodStart_peri_idx" ON "ClientStatementNativeSet"("tenantId", "clientId", "periodStart", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "ClientStatementNativeSet_id_tenantId_clientId_key" ON "ClientStatementNativeSet"("id", "tenantId", "clientId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientStatementNativeSet_id_tenantId_key" ON "ClientStatementNativeSet"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientStatementNativeDocument_setId_currency_key" ON "ClientStatementNativeDocument"("setId", "currency");

-- CreateIndex
CREATE UNIQUE INDEX "ClientStatementNativeDocument_id_tenantId_key" ON "ClientStatementNativeDocument"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientStatementNativeArtifact_documentId_tenantId_key" ON "ClientStatementNativeArtifact"("documentId", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientStatementNativeDelivery_dedupeKey_key" ON "ClientStatementNativeDelivery"("dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "ClientStatementNativeDelivery_tenantId_clientId_periodKey_key" ON "ClientStatementNativeDelivery"("tenantId", "clientId", "periodKey");

-- AddForeignKey
ALTER TABLE "ClientStatementNativeSet" ADD CONSTRAINT "ClientStatementNativeSet_clientId_tenantId_fkey" FOREIGN KEY ("clientId", "tenantId") REFERENCES "Client"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientStatementNativeDocument" ADD CONSTRAINT "ClientStatementNativeDocument_setId_tenantId_fkey" FOREIGN KEY ("setId", "tenantId") REFERENCES "ClientStatementNativeSet"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientStatementNativeArtifact" ADD CONSTRAINT "ClientStatementNativeArtifact_documentId_tenantId_fkey" FOREIGN KEY ("documentId", "tenantId") REFERENCES "ClientStatementNativeDocument"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientStatementNativeDelivery" ADD CONSTRAINT "ClientStatementNativeDelivery_setId_tenantId_clientId_fkey" FOREIGN KEY ("setId", "tenantId", "clientId") REFERENCES "ClientStatementNativeSet"("id", "tenantId", "clientId") ON DELETE RESTRICT ON UPDATE CASCADE;
-- E2 is additive. No legacy snapshot, H6 relation or financial source row is rewritten.
CREATE UNIQUE INDEX "ClientStatementNativeSet_one_active_period" ON "ClientStatementNativeSet" ("tenantId", "clientId", "periodStart", "periodEnd") WHERE "status" = 'ACTIVE';
ALTER TABLE "ClientStatementNativeSet" ADD CONSTRAINT "NativeSet_shape_check" CHECK ("periodEnd" >= "periodStart" AND "memberCount" > 0 AND "memberHash" ~ '^[a-f0-9]{64}$');
ALTER TABLE "ClientStatementNativeDocument" ADD CONSTRAINT "NativeDocument_shape_check" CHECK ("currency" ~ '^[A-Z]{3}$' AND "renderHash" ~ '^[a-f0-9]{64}$');
ALTER TABLE "ClientStatementNativeArtifact" ADD CONSTRAINT "NativeArtifact_shape_check" CHECK (octet_length("pdf") > 4 AND "sha256" ~ '^[a-f0-9]{64}$');
ALTER TABLE "ClientStatementNativeDelivery" ADD CONSTRAINT "NativeDelivery_shape_check" CHECK ("attempts" >= 0 AND "memberHash" ~ '^[a-f0-9]{64}$' AND ("status" <> 'SENT' OR "sentAt" IS NOT NULL));

CREATE FUNCTION "guard_native_statement_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'E2 immutable document history cannot be deleted'; END IF;
  IF TG_TABLE_NAME <> 'ClientStatementNativeSet' THEN RAISE EXCEPTION 'E2 document content is immutable'; END IF;
  IF (to_jsonb(NEW) - ARRAY['status','supersededById','closedAt','closeNote']) IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['status','supersededById','closedAt','closeNote']) THEN
    RAISE EXCEPTION 'E2 financial snapshot is immutable';
  END IF;
  IF OLD."status" <> 'ACTIVE' AND (NEW."status" <> OLD."status" OR NEW."closedAt" IS DISTINCT FROM OLD."closedAt" OR NEW."closeNote" IS DISTINCT FROM OLD."closeNote") THEN
    RAISE EXCEPTION 'E2 terminal lifecycle cannot be rewritten';
  END IF;
  IF OLD."supersededById" IS NOT NULL AND NEW."supersededById" IS DISTINCT FROM OLD."supersededById" THEN
    RAISE EXCEPTION 'E2 supersession is immutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "NativeSet_immutable" BEFORE UPDATE OR DELETE ON "ClientStatementNativeSet" FOR EACH ROW EXECUTE FUNCTION "guard_native_statement_immutable"();
CREATE TRIGGER "NativeDocument_immutable" BEFORE UPDATE OR DELETE ON "ClientStatementNativeDocument" FOR EACH ROW EXECUTE FUNCTION "guard_native_statement_immutable"();
CREATE TRIGGER "NativeArtifact_immutable" BEFORE UPDATE OR DELETE ON "ClientStatementNativeArtifact" FOR EACH ROW EXECUTE FUNCTION "guard_native_statement_immutable"();
