-- K3 AUTO-GENERATE FORMATION BATCH (owner GO 2026-09-28): tek OfficeApproval talebi, ayni belgeden uretilen
-- birden cok ClaimItemFormationIntent'i (or. cek bedeli + karsiliksiz cek tazminati) TEK degismez onay icerigine
-- baglayabilir; onayda kalemlerin tamami ayni transaction'da olusur.
--
-- Neden gerekli: (tenantId, approvalRequestId) intent ve snapshot'ta tekildi -> bir onay = bir kalem. Toplu atomik
-- olusum icin konum (approvalBatchPosition) eklenir ve tekillik (tenantId, approvalRequestId, konum) olur.
-- Geriye uyumlu: yeni kolon NOT NULL DEFAULT 0; mevcut satirlarin hepsi konum 0 ile eski tekilligi zaten sagladigi
-- icin yeni tekillik ihlal edilmez; veri degismez, backfill yok. Tekli akis (konum 0) davranisi DEGISMEZ.
-- Snapshot dogrulama tetikleyicisi konumu da intent ile birebir karsilastirir (asagida; govde onceki surumle AYNI,
-- yalniz approvalBatchPosition iki ROW'a eklendi).

ALTER TABLE "ClaimItemFormationIntent" ADD COLUMN "approvalBatchPosition" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ClaimFormationSnapshot" ADD COLUMN "approvalBatchPosition" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "ClaimItemFormationIntent"
ADD CONSTRAINT "claim_formation_intent_batch_position_check"
CHECK ("approvalBatchPosition" BETWEEN 0 AND 7);
ALTER TABLE "ClaimFormationSnapshot"
ADD CONSTRAINT "claim_formation_snapshot_batch_position_check"
CHECK ("approvalBatchPosition" BETWEEN 0 AND 7);

DROP INDEX "ClaimItemFormationIntent_tenantId_approvalRequestId_key";
CREATE UNIQUE INDEX "claim_formation_intent_approval_position_unique"
ON "ClaimItemFormationIntent"("tenantId", "approvalRequestId", "approvalBatchPosition");

DROP INDEX "ClaimFormationSnapshot_tenantId_approvalRequestId_key";
CREATE UNIQUE INDEX "claim_formation_snapshot_approval_position_unique"
ON "ClaimFormationSnapshot"("tenantId", "approvalRequestId", "approvalBatchPosition");

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
        NEW."approvalBatchPosition",
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
        NEW."legalBasisProjectionBindingContractVersion",
        NEW."legalBasisProjectionBindingCanonicalPayload",
        NEW."legalBasisProjectionBindingChecksum",
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
        bound_intent."approvalBatchPosition",
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
        bound_intent."legalBasisProjectionBindingContractVersion",
        bound_intent."legalBasisProjectionBindingCanonicalPayload",
        bound_intent."legalBasisProjectionBindingChecksum",
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
