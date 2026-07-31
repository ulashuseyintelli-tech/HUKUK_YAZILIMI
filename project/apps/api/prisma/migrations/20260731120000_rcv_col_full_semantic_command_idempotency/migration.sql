-- RCV-COL-IDEM-01: full semantic Collection command evidence.
-- Additive, default-free, no-backfill. Legacy rows remain explicit NULL evidence.
ALTER TABLE "Collection"
  ADD COLUMN "commandFingerprintVersion" TEXT,
  ADD COLUMN "commandFingerprint" TEXT,
  ADD COLUMN "commandCanonicalPayload" TEXT;

ALTER TABLE "Collection"
  ADD CONSTRAINT "ck_collection_command_evidence_complete"
  CHECK (
    (
      "commandFingerprintVersion" IS NULL
      AND "commandFingerprint" IS NULL
      AND "commandCanonicalPayload" IS NULL
    )
    OR
    (
      "commandFingerprintVersion" IS NOT NULL
      AND "commandFingerprint" IS NOT NULL
      AND "commandCanonicalPayload" IS NOT NULL
      AND "commandFingerprintVersion" = 'RCV-COL-CMD/v1'
      AND "commandFingerprint" ~ '^[0-9a-f]{64}$'
      AND btrim("commandCanonicalPayload") <> ''
    )
  );

CREATE FUNCTION "forbid_collection_command_evidence_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF
    NEW."commandFingerprintVersion" IS DISTINCT FROM OLD."commandFingerprintVersion"
    OR NEW."commandFingerprint" IS DISTINCT FROM OLD."commandFingerprint"
    OR NEW."commandCanonicalPayload" IS DISTINCT FROM OLD."commandCanonicalPayload"
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '45010',
      MESSAGE = 'COLLECTION_COMMAND_EVIDENCE_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "trg_collection_command_evidence_immutable"
BEFORE UPDATE ON "Collection"
FOR EACH ROW
EXECUTE FUNCTION "forbid_collection_command_evidence_mutation"();
