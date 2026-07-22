-- RCV-CLAIM-FORM-P02-S08-I02A
-- Additive, writer-disabled ClaimItem formation intent/snapshot foundation.
-- No existing row is mutated and no runtime writer is activated by this migration.

-- Existing ClaimItem rows already have globally unique id values. This additive
-- parent key makes tenant/case-scoped snapshot references DB-enforceable.
CREATE UNIQUE INDEX "ClaimItem_tenantId_caseId_id_key"
ON "ClaimItem"("tenantId", "caseId", "id");

CREATE TABLE "ClaimItemFormationIntent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "contractVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "normalizedInputChecksum" TEXT NOT NULL,
    "normalizedInputContractVersion" TEXT NOT NULL,
    "intentChecksum" TEXT NOT NULL,
    "checksumAlgorithm" TEXT NOT NULL,
    "canonicalSerializationVersion" TEXT NOT NULL,
    "approvalRequestId" TEXT NOT NULL,
    "approvalReferenceVersion" TEXT NOT NULL,
    "approvalReferenceHash" TEXT NOT NULL,
    "requesterUserId" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "causationId" TEXT,
    "sourceIdentityVersion" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceSlot" TEXT NOT NULL,
    "sourceIdentityHash" TEXT NOT NULL,
    "sourceVersionId" TEXT NOT NULL,
    "sourceVersion" TEXT NOT NULL,
    "canonicalSourceFingerprint" TEXT NOT NULL,
    "fingerprintAlgorithm" TEXT NOT NULL,
    "fingerprintVersion" TEXT NOT NULL,
    "sourceResolutionContractVersion" TEXT NOT NULL,
    "sourceResolutionHash" TEXT NOT NULL,
    "componentCategory" TEXT NOT NULL,
    "componentSubtypeCode" TEXT NOT NULL,
    "componentSubtypeVersion" TEXT NOT NULL,
    "componentSubtypeChecksum" TEXT NOT NULL,
    "legalBasisCode" TEXT NOT NULL,
    "legalBasisVersion" TEXT NOT NULL,
    "legalBasisChecksum" TEXT NOT NULL,
    "legalBasisRegistryReleaseId" TEXT NOT NULL,
    "legalBasisRegistryReleaseChecksum" TEXT NOT NULL,
    "legalBasisResolutionContractVersion" TEXT NOT NULL,
    "legalBasisResolutionHash" TEXT NOT NULL,
    "originalAmountMinor" BIGINT NOT NULL,
    "demandedAmountMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "minorUnit" INTEGER NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "liabilityContextVersion" TEXT NOT NULL,
    "liabilityContextCanonicalPayload" TEXT NOT NULL,
    "liabilityContextHash" TEXT NOT NULL,
    "interestEligibility" TEXT NOT NULL,
    "interestPolicyRef" TEXT,
    "interestPolicyVersion" TEXT,
    "ruleRef" TEXT,
    "ruleVersion" TEXT,
    "evidenceRefsContractVersion" TEXT NOT NULL,
    "evidenceRefsCanonicalPayload" TEXT NOT NULL,
    "evidenceRefsHash" TEXT NOT NULL,
    "provenanceContractVersion" TEXT NOT NULL,
    "provenanceCanonicalPayload" TEXT NOT NULL,
    "provenanceHash" TEXT NOT NULL,

    CONSTRAINT "ClaimItemFormationIntent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "claim_formation_intent_expiry_check"
        CHECK ("expiresAt" = "createdAt" + INTERVAL '24 hours'),
    CONSTRAINT "claim_formation_intent_money_check"
        CHECK ("originalAmountMinor" > 0 AND "demandedAmountMinor" > 0),
    CONSTRAINT "claim_formation_intent_currency_check"
        CHECK ("currency" ~ '^[A-Z]{3}$' AND "minorUnit" BETWEEN 0 AND 6),
    CONSTRAINT "claim_formation_intent_source_check"
        CHECK ("sourceType" = 'CASE_DOCUMENT'),
    CONSTRAINT "claim_formation_intent_component_check"
        CHECK ("componentCategory" IN ('PRINCIPAL', 'COST', 'ANCILLARY', 'ACCRUED_INTEREST')),
    CONSTRAINT "claim_formation_intent_interest_check"
        CHECK (
            "interestEligibility" IN ('ACCRUES', 'NO_INTEREST', 'UNRESOLVED')
            AND (("interestPolicyRef" IS NULL AND "interestPolicyVersion" IS NULL)
                OR (btrim("interestPolicyRef") <> '' AND btrim("interestPolicyVersion") <> ''))
            AND (("ruleRef" IS NULL AND "ruleVersion" IS NULL)
                OR (btrim("ruleRef") <> '' AND btrim("ruleVersion") <> ''))
            AND (
                ("interestEligibility" = 'ACCRUES'
                    AND "interestPolicyRef" IS NOT NULL
                    AND "ruleRef" IS NOT NULL)
                OR
                ("interestEligibility" IN ('NO_INTEREST', 'UNRESOLVED')
                    AND "interestPolicyRef" IS NULL
                    AND "ruleRef" IS NULL)
            )
        ),
    CONSTRAINT "claim_formation_intent_algorithm_check"
        CHECK ("checksumAlgorithm" = 'SHA-256' AND "fingerprintAlgorithm" = 'SHA-256'),
    CONSTRAINT "claim_formation_intent_hash_check"
        CHECK (
            "normalizedInputChecksum" ~ '^[0-9a-f]{64}$'
            AND "intentChecksum" ~ '^[0-9a-f]{64}$'
            AND "approvalReferenceHash" ~ '^[0-9a-f]{64}$'
            AND "sourceIdentityHash" ~ '^[0-9a-f]{64}$'
            AND "canonicalSourceFingerprint" ~ '^[0-9a-f]{64}$'
            AND "sourceResolutionHash" ~ '^[0-9a-f]{64}$'
            AND "componentSubtypeChecksum" ~ '^[0-9a-f]{64}$'
            AND "legalBasisChecksum" ~ '^[0-9a-f]{64}$'
            AND "legalBasisRegistryReleaseChecksum" ~ '^[0-9a-f]{64}$'
            AND "legalBasisResolutionHash" ~ '^[0-9a-f]{64}$'
            AND "liabilityContextHash" ~ '^[0-9a-f]{64}$'
            AND "evidenceRefsHash" ~ '^[0-9a-f]{64}$'
            AND "provenanceHash" ~ '^[0-9a-f]{64}$'
        ),
    CONSTRAINT "claim_formation_intent_nonblank_check"
        CHECK (
            btrim("id") <> ''
            AND btrim("tenantId") <> ''
            AND btrim("caseId") <> ''
            AND btrim("contractVersion") <> ''
            AND btrim("idempotencyKey") <> ''
            AND btrim("normalizedInputContractVersion") <> ''
            AND btrim("canonicalSerializationVersion") <> ''
            AND btrim("approvalRequestId") <> ''
            AND btrim("approvalReferenceVersion") <> ''
            AND btrim("requesterUserId") <> ''
            AND btrim("correlationId") <> ''
            AND ("causationId" IS NULL OR btrim("causationId") <> '')
            AND btrim("sourceIdentityVersion") <> ''
            AND btrim("sourceId") <> ''
            AND btrim("sourceSlot") <> ''
            AND btrim("sourceVersionId") <> ''
            AND btrim("sourceVersion") <> ''
            AND btrim("fingerprintVersion") <> ''
            AND btrim("sourceResolutionContractVersion") <> ''
            AND btrim("componentSubtypeCode") <> ''
            AND btrim("componentSubtypeVersion") <> ''
            AND btrim("legalBasisCode") <> ''
            AND btrim("legalBasisVersion") <> ''
            AND btrim("legalBasisRegistryReleaseId") <> ''
            AND btrim("legalBasisResolutionContractVersion") <> ''
            AND btrim("liabilityContextVersion") <> ''
            AND btrim("liabilityContextCanonicalPayload") <> ''
            AND btrim("evidenceRefsContractVersion") <> ''
            AND btrim("evidenceRefsCanonicalPayload") <> ''
            AND btrim("provenanceContractVersion") <> ''
            AND btrim("provenanceCanonicalPayload") <> ''
        )
);

CREATE TABLE "ClaimFormationSnapshot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "claimItemId" TEXT NOT NULL,
    "formationIntentId" TEXT NOT NULL,
    "approvalRequestId" TEXT NOT NULL,
    "snapshotContractVersion" TEXT NOT NULL,
    "snapshotSerializationVersion" TEXT NOT NULL,
    "snapshotVersion" INTEGER NOT NULL,
    "supersedesSnapshotId" TEXT,
    "intentChecksum" TEXT NOT NULL,
    "approvalReferenceHash" TEXT NOT NULL,
    "normalizedInputChecksum" TEXT NOT NULL,
    "snapshotCanonicalPayload" TEXT NOT NULL,
    "snapshotHash" TEXT NOT NULL,
    "sourceIdentityVersion" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceSlot" TEXT NOT NULL,
    "sourceIdentityHash" TEXT NOT NULL,
    "sourceVersionId" TEXT NOT NULL,
    "sourceVersion" TEXT NOT NULL,
    "canonicalSourceFingerprint" TEXT NOT NULL,
    "fingerprintAlgorithm" TEXT NOT NULL,
    "fingerprintVersion" TEXT NOT NULL,
    "sourceResolutionContractVersion" TEXT NOT NULL,
    "sourceResolutionHash" TEXT NOT NULL,
    "componentCategory" TEXT NOT NULL,
    "componentSubtypeCode" TEXT NOT NULL,
    "componentSubtypeVersion" TEXT NOT NULL,
    "componentSubtypeChecksum" TEXT NOT NULL,
    "legalBasisCode" TEXT NOT NULL,
    "legalBasisVersion" TEXT NOT NULL,
    "legalBasisChecksum" TEXT NOT NULL,
    "legalBasisRegistryReleaseId" TEXT NOT NULL,
    "legalBasisRegistryReleaseChecksum" TEXT NOT NULL,
    "legalBasisResolutionContractVersion" TEXT NOT NULL,
    "legalBasisResolutionHash" TEXT NOT NULL,
    "originalAmountMinor" BIGINT NOT NULL,
    "demandedAmountMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "minorUnit" INTEGER NOT NULL,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "liabilityContextVersion" TEXT NOT NULL,
    "liabilityContextCanonicalPayload" TEXT NOT NULL,
    "liabilityContextHash" TEXT NOT NULL,
    "interestEligibility" TEXT NOT NULL,
    "interestPolicyRef" TEXT,
    "interestPolicyVersion" TEXT,
    "ruleRef" TEXT,
    "ruleVersion" TEXT,
    "evidenceRefsContractVersion" TEXT NOT NULL,
    "evidenceRefsCanonicalPayload" TEXT NOT NULL,
    "evidenceRefsHash" TEXT NOT NULL,
    "provenanceContractVersion" TEXT NOT NULL,
    "provenanceCanonicalPayload" TEXT NOT NULL,
    "provenanceHash" TEXT NOT NULL,
    "admissionResult" TEXT NOT NULL,
    "claimItemPayloadHash" TEXT NOT NULL,
    "requesterUserId" TEXT NOT NULL,
    "approverUserId" TEXT NOT NULL,
    "approvalDecidedAt" TIMESTAMP(3) NOT NULL,
    "commandId" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "causationId" TEXT,
    "formationAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClaimFormationSnapshot_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "claim_formation_snapshot_version_check"
        CHECK (
            ("snapshotVersion" = 1 AND "supersedesSnapshotId" IS NULL)
            OR ("snapshotVersion" > 1 AND "supersedesSnapshotId" IS NOT NULL)
        ),
    CONSTRAINT "claim_formation_snapshot_money_check"
        CHECK ("originalAmountMinor" > 0 AND "demandedAmountMinor" > 0),
    CONSTRAINT "claim_formation_snapshot_currency_check"
        CHECK ("currency" ~ '^[A-Z]{3}$' AND "minorUnit" BETWEEN 0 AND 6),
    CONSTRAINT "claim_formation_snapshot_source_check"
        CHECK ("sourceType" = 'CASE_DOCUMENT'),
    CONSTRAINT "claim_formation_snapshot_component_check"
        CHECK ("componentCategory" IN ('PRINCIPAL', 'COST', 'ANCILLARY', 'ACCRUED_INTEREST')),
    CONSTRAINT "claim_formation_snapshot_admission_check"
        CHECK (
            ("admissionResult" = 'ALLOWED' AND "interestEligibility" <> 'UNRESOLVED')
            OR
            ("admissionResult" = 'ALLOWED_WITH_POLICY_HOLD' AND "interestEligibility" = 'UNRESOLVED')
        ),
    CONSTRAINT "claim_formation_snapshot_interest_check"
        CHECK (
            "interestEligibility" IN ('ACCRUES', 'NO_INTEREST', 'UNRESOLVED')
            AND (("interestPolicyRef" IS NULL AND "interestPolicyVersion" IS NULL)
                OR (btrim("interestPolicyRef") <> '' AND btrim("interestPolicyVersion") <> ''))
            AND (("ruleRef" IS NULL AND "ruleVersion" IS NULL)
                OR (btrim("ruleRef") <> '' AND btrim("ruleVersion") <> ''))
            AND (
                ("interestEligibility" = 'ACCRUES'
                    AND "interestPolicyRef" IS NOT NULL
                    AND "ruleRef" IS NOT NULL)
                OR
                ("interestEligibility" IN ('NO_INTEREST', 'UNRESOLVED')
                    AND "interestPolicyRef" IS NULL
                    AND "ruleRef" IS NULL)
            )
        ),
    CONSTRAINT "claim_formation_snapshot_algorithm_check"
        CHECK ("fingerprintAlgorithm" = 'SHA-256'),
    CONSTRAINT "claim_formation_snapshot_hash_check"
        CHECK (
            "intentChecksum" ~ '^[0-9a-f]{64}$'
            AND "approvalReferenceHash" ~ '^[0-9a-f]{64}$'
            AND "normalizedInputChecksum" ~ '^[0-9a-f]{64}$'
            AND "snapshotHash" ~ '^[0-9a-f]{64}$'
            AND "sourceIdentityHash" ~ '^[0-9a-f]{64}$'
            AND "canonicalSourceFingerprint" ~ '^[0-9a-f]{64}$'
            AND "sourceResolutionHash" ~ '^[0-9a-f]{64}$'
            AND "componentSubtypeChecksum" ~ '^[0-9a-f]{64}$'
            AND "legalBasisChecksum" ~ '^[0-9a-f]{64}$'
            AND "legalBasisRegistryReleaseChecksum" ~ '^[0-9a-f]{64}$'
            AND "legalBasisResolutionHash" ~ '^[0-9a-f]{64}$'
            AND "liabilityContextHash" ~ '^[0-9a-f]{64}$'
            AND "evidenceRefsHash" ~ '^[0-9a-f]{64}$'
            AND "provenanceHash" ~ '^[0-9a-f]{64}$'
            AND "claimItemPayloadHash" ~ '^[0-9a-f]{64}$'
        ),
    CONSTRAINT "claim_formation_snapshot_time_check"
        CHECK ("approvalDecidedAt" <= "formationAt" AND "formationAt" <= "createdAt"),
    CONSTRAINT "claim_formation_snapshot_nonblank_check"
        CHECK (
            btrim("id") <> ''
            AND btrim("tenantId") <> ''
            AND btrim("caseId") <> ''
            AND btrim("claimItemId") <> ''
            AND btrim("formationIntentId") <> ''
            AND btrim("approvalRequestId") <> ''
            AND btrim("snapshotContractVersion") <> ''
            AND btrim("snapshotSerializationVersion") <> ''
            AND btrim("snapshotCanonicalPayload") <> ''
            AND btrim("sourceIdentityVersion") <> ''
            AND btrim("sourceId") <> ''
            AND btrim("sourceSlot") <> ''
            AND btrim("sourceVersionId") <> ''
            AND btrim("sourceVersion") <> ''
            AND btrim("fingerprintVersion") <> ''
            AND btrim("sourceResolutionContractVersion") <> ''
            AND btrim("componentSubtypeCode") <> ''
            AND btrim("componentSubtypeVersion") <> ''
            AND btrim("legalBasisCode") <> ''
            AND btrim("legalBasisVersion") <> ''
            AND btrim("legalBasisRegistryReleaseId") <> ''
            AND btrim("legalBasisResolutionContractVersion") <> ''
            AND btrim("liabilityContextVersion") <> ''
            AND btrim("liabilityContextCanonicalPayload") <> ''
            AND btrim("evidenceRefsContractVersion") <> ''
            AND btrim("evidenceRefsCanonicalPayload") <> ''
            AND btrim("provenanceContractVersion") <> ''
            AND btrim("provenanceCanonicalPayload") <> ''
            AND btrim("requesterUserId") <> ''
            AND btrim("approverUserId") <> ''
            AND btrim("commandId") <> ''
            AND btrim("correlationId") <> ''
            AND ("causationId" IS NULL OR btrim("causationId") <> '')
        )
);

CREATE INDEX "ClaimItemFormationIntent_tenantId_caseId_idx"
ON "ClaimItemFormationIntent"("tenantId", "caseId");
CREATE INDEX "ClaimItemFormationIntent_tenantId_sourceIdentityHash_idx"
ON "ClaimItemFormationIntent"("tenantId", "sourceIdentityHash");
CREATE INDEX "ClaimItemFormationIntent_expiresAt_idx"
ON "ClaimItemFormationIntent"("expiresAt");
CREATE UNIQUE INDEX "ClaimItemFormationIntent_tenantId_id_key"
ON "ClaimItemFormationIntent"("tenantId", "id");
CREATE UNIQUE INDEX "ClaimItemFormationIntent_tenantId_caseId_id_key"
ON "ClaimItemFormationIntent"("tenantId", "caseId", "id");
CREATE UNIQUE INDEX "ClaimItemFormationIntent_tenantId_idempotencyKey_key"
ON "ClaimItemFormationIntent"("tenantId", "idempotencyKey");
CREATE UNIQUE INDEX "ClaimItemFormationIntent_tenantId_approvalRequestId_key"
ON "ClaimItemFormationIntent"("tenantId", "approvalRequestId");

CREATE INDEX "ClaimFormationSnapshot_tenantId_caseId_claimItemId_idx"
ON "ClaimFormationSnapshot"("tenantId", "caseId", "claimItemId");
CREATE INDEX "ClaimFormationSnapshot_tenantId_sourceIdentityHash_idx"
ON "ClaimFormationSnapshot"("tenantId", "sourceIdentityHash");
CREATE INDEX "ClaimFormationSnapshot_formationAt_idx"
ON "ClaimFormationSnapshot"("formationAt");
CREATE UNIQUE INDEX "ClaimFormationSnapshot_tenantId_id_key"
ON "ClaimFormationSnapshot"("tenantId", "id");
CREATE UNIQUE INDEX "ClaimFormationSnapshot_tenantId_caseId_formationIntentId_key"
ON "ClaimFormationSnapshot"("tenantId", "caseId", "formationIntentId");
CREATE UNIQUE INDEX "ClaimFormationSnapshot_tenantId_approvalRequestId_key"
ON "ClaimFormationSnapshot"("tenantId", "approvalRequestId");
CREATE UNIQUE INDEX "ClaimFormationSnapshot_tenantId_claimItemId_snapshotVersion_key"
ON "ClaimFormationSnapshot"("tenantId", "claimItemId", "snapshotVersion");
CREATE UNIQUE INDEX "claim_formation_snapshot_source_version_unique"
ON "ClaimFormationSnapshot"("tenantId", "sourceIdentityHash", "snapshotVersion");
CREATE UNIQUE INDEX "ClaimFormationSnapshot_tenantId_supersedesSnapshotId_key"
ON "ClaimFormationSnapshot"("tenantId", "supersedesSnapshotId");

ALTER TABLE "ClaimItemFormationIntent"
ADD CONSTRAINT "ClaimItemFormationIntent_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ClaimItemFormationIntent"
ADD CONSTRAINT "ClaimItemFormationIntent_tenantId_caseId_fkey"
FOREIGN KEY ("tenantId", "caseId") REFERENCES "Case"("tenantId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ClaimItemFormationIntent"
ADD CONSTRAINT "ClaimItemFormationIntent_tenantId_requesterUserId_fkey"
FOREIGN KEY ("tenantId", "requesterUserId") REFERENCES "User"("tenantId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ClaimFormationSnapshot"
ADD CONSTRAINT "ClaimFormationSnapshot_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ClaimFormationSnapshot"
ADD CONSTRAINT "ClaimFormationSnapshot_tenantId_caseId_fkey"
FOREIGN KEY ("tenantId", "caseId") REFERENCES "Case"("tenantId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ClaimFormationSnapshot"
ADD CONSTRAINT "ClaimFormationSnapshot_tenantId_caseId_claimItemId_fkey"
FOREIGN KEY ("tenantId", "caseId", "claimItemId")
REFERENCES "ClaimItem"("tenantId", "caseId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ClaimFormationSnapshot"
ADD CONSTRAINT "ClaimFormationSnapshot_tenantId_caseId_formationIntentId_fkey"
FOREIGN KEY ("tenantId", "caseId", "formationIntentId")
REFERENCES "ClaimItemFormationIntent"("tenantId", "caseId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ClaimFormationSnapshot"
ADD CONSTRAINT "ClaimFormationSnapshot_tenantId_requesterUserId_fkey"
FOREIGN KEY ("tenantId", "requesterUserId") REFERENCES "User"("tenantId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ClaimFormationSnapshot"
ADD CONSTRAINT "ClaimFormationSnapshot_tenantId_approverUserId_fkey"
FOREIGN KEY ("tenantId", "approverUserId") REFERENCES "User"("tenantId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ClaimFormationSnapshot"
ADD CONSTRAINT "ClaimFormationSnapshot_tenantId_supersedesSnapshotId_fkey"
FOREIGN KEY ("tenantId", "supersedesSnapshotId")
REFERENCES "ClaimFormationSnapshot"("tenantId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- The snapshot must be an exact immutable projection of its one consumed intent.
-- Advisory locks close concurrent source/ClaimItem binding races without touching
-- any existing ClaimItem writer because this trigger exists only on the new table.
CREATE OR REPLACE FUNCTION validate_claim_formation_snapshot()
RETURNS TRIGGER AS $$
DECLARE
    bound_intent "ClaimItemFormationIntent"%ROWTYPE;
    previous_snapshot "ClaimFormationSnapshot"%ROWTYPE;
BEGIN
    SELECT * INTO STRICT bound_intent
    FROM "ClaimItemFormationIntent"
    WHERE "tenantId" = NEW."tenantId"
      AND "caseId" = NEW."caseId"
      AND "id" = NEW."formationIntentId";

    IF ROW(
        NEW."approvalRequestId",
        NEW."intentChecksum",
        NEW."approvalReferenceHash",
        NEW."normalizedInputChecksum",
        NEW."sourceIdentityVersion",
        NEW."sourceType",
        NEW."sourceId",
        NEW."sourceSlot",
        NEW."sourceIdentityHash",
        NEW."sourceVersionId",
        NEW."sourceVersion",
        NEW."canonicalSourceFingerprint",
        NEW."fingerprintAlgorithm",
        NEW."fingerprintVersion",
        NEW."sourceResolutionContractVersion",
        NEW."sourceResolutionHash",
        NEW."componentCategory",
        NEW."componentSubtypeCode",
        NEW."componentSubtypeVersion",
        NEW."componentSubtypeChecksum",
        NEW."legalBasisCode",
        NEW."legalBasisVersion",
        NEW."legalBasisChecksum",
        NEW."legalBasisRegistryReleaseId",
        NEW."legalBasisRegistryReleaseChecksum",
        NEW."legalBasisResolutionContractVersion",
        NEW."legalBasisResolutionHash",
        NEW."originalAmountMinor",
        NEW."demandedAmountMinor",
        NEW."currency",
        NEW."minorUnit",
        NEW."effectiveAt",
        NEW."liabilityContextVersion",
        NEW."liabilityContextCanonicalPayload",
        NEW."liabilityContextHash",
        NEW."interestEligibility",
        NEW."interestPolicyRef",
        NEW."interestPolicyVersion",
        NEW."ruleRef",
        NEW."ruleVersion",
        NEW."evidenceRefsContractVersion",
        NEW."evidenceRefsCanonicalPayload",
        NEW."evidenceRefsHash",
        NEW."provenanceContractVersion",
        NEW."provenanceCanonicalPayload",
        NEW."provenanceHash",
        NEW."requesterUserId",
        NEW."correlationId",
        NEW."causationId"
    ) IS DISTINCT FROM ROW(
        bound_intent."approvalRequestId",
        bound_intent."intentChecksum",
        bound_intent."approvalReferenceHash",
        bound_intent."normalizedInputChecksum",
        bound_intent."sourceIdentityVersion",
        bound_intent."sourceType",
        bound_intent."sourceId",
        bound_intent."sourceSlot",
        bound_intent."sourceIdentityHash",
        bound_intent."sourceVersionId",
        bound_intent."sourceVersion",
        bound_intent."canonicalSourceFingerprint",
        bound_intent."fingerprintAlgorithm",
        bound_intent."fingerprintVersion",
        bound_intent."sourceResolutionContractVersion",
        bound_intent."sourceResolutionHash",
        bound_intent."componentCategory",
        bound_intent."componentSubtypeCode",
        bound_intent."componentSubtypeVersion",
        bound_intent."componentSubtypeChecksum",
        bound_intent."legalBasisCode",
        bound_intent."legalBasisVersion",
        bound_intent."legalBasisChecksum",
        bound_intent."legalBasisRegistryReleaseId",
        bound_intent."legalBasisRegistryReleaseChecksum",
        bound_intent."legalBasisResolutionContractVersion",
        bound_intent."legalBasisResolutionHash",
        bound_intent."originalAmountMinor",
        bound_intent."demandedAmountMinor",
        bound_intent."currency",
        bound_intent."minorUnit",
        bound_intent."effectiveAt",
        bound_intent."liabilityContextVersion",
        bound_intent."liabilityContextCanonicalPayload",
        bound_intent."liabilityContextHash",
        bound_intent."interestEligibility",
        bound_intent."interestPolicyRef",
        bound_intent."interestPolicyVersion",
        bound_intent."ruleRef",
        bound_intent."ruleVersion",
        bound_intent."evidenceRefsContractVersion",
        bound_intent."evidenceRefsCanonicalPayload",
        bound_intent."evidenceRefsHash",
        bound_intent."provenanceContractVersion",
        bound_intent."provenanceCanonicalPayload",
        bound_intent."provenanceHash",
        bound_intent."requesterUserId",
        bound_intent."correlationId",
        bound_intent."causationId"
    ) THEN
        RAISE EXCEPTION 'claim_formation_snapshot_intent_mismatch'
            USING ERRCODE = '23514';
    END IF;

    IF NEW."formationAt" < bound_intent."createdAt"
       OR NEW."formationAt" > bound_intent."expiresAt"
       OR NEW."approvalDecidedAt" < bound_intent."createdAt" THEN
        RAISE EXCEPTION 'claim_formation_snapshot_expired_or_temporally_invalid'
            USING ERRCODE = '23514';
    END IF;

    PERFORM pg_advisory_xact_lock(
        hashtextextended(NEW."tenantId" || E'\x1fsource\x1f' || NEW."sourceIdentityHash", 0)
    );
    PERFORM pg_advisory_xact_lock(
        hashtextextended(NEW."tenantId" || E'\x1fclaim\x1f' || NEW."claimItemId", 0)
    );

    IF EXISTS (
        SELECT 1
        FROM "ClaimFormationSnapshot" s
        WHERE s."tenantId" = NEW."tenantId"
          AND s."sourceIdentityHash" = NEW."sourceIdentityHash"
          AND (
              s."sourceIdentityVersion" <> NEW."sourceIdentityVersion"
              OR s."sourceType" <> NEW."sourceType"
              OR s."sourceId" <> NEW."sourceId"
              OR s."sourceSlot" <> NEW."sourceSlot"
              OR s."claimItemId" <> NEW."claimItemId"
          )
    ) THEN
        RAISE EXCEPTION 'claim_formation_source_identity_binding_conflict'
            USING ERRCODE = '23505';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM "ClaimFormationSnapshot" s
        WHERE s."tenantId" = NEW."tenantId"
          AND s."claimItemId" = NEW."claimItemId"
          AND s."sourceIdentityHash" <> NEW."sourceIdentityHash"
    ) THEN
        RAISE EXCEPTION 'claim_formation_claim_item_source_binding_conflict'
            USING ERRCODE = '23505';
    END IF;

    IF NEW."snapshotVersion" > 1 THEN
        SELECT * INTO STRICT previous_snapshot
        FROM "ClaimFormationSnapshot"
        WHERE "tenantId" = NEW."tenantId"
          AND "id" = NEW."supersedesSnapshotId";

        IF previous_snapshot."claimItemId" <> NEW."claimItemId"
           OR previous_snapshot."sourceIdentityHash" <> NEW."sourceIdentityHash"
           OR previous_snapshot."snapshotVersion" <> NEW."snapshotVersion" - 1 THEN
            RAISE EXCEPTION 'claim_formation_snapshot_supersession_conflict'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "validate_claim_formation_snapshot_before_insert"
BEFORE INSERT ON "ClaimFormationSnapshot"
FOR EACH ROW EXECUTE FUNCTION validate_claim_formation_snapshot();

-- Both records are immutable legal/audit facts. Reuse the canonical repository
-- immutability function introduced by the legal-kernel foundation.
CREATE TRIGGER "prevent_claim_item_formation_intent_update"
BEFORE UPDATE ON "ClaimItemFormationIntent"
FOR EACH ROW EXECUTE FUNCTION raise_immutable_error();

CREATE TRIGGER "prevent_claim_item_formation_intent_delete"
BEFORE DELETE ON "ClaimItemFormationIntent"
FOR EACH ROW EXECUTE FUNCTION raise_immutable_error();

CREATE TRIGGER "prevent_claim_formation_snapshot_update"
BEFORE UPDATE ON "ClaimFormationSnapshot"
FOR EACH ROW EXECUTE FUNCTION raise_immutable_error();

CREATE TRIGGER "prevent_claim_formation_snapshot_delete"
BEFORE DELETE ON "ClaimFormationSnapshot"
FOR EACH ROW EXECUTE FUNCTION raise_immutable_error();
