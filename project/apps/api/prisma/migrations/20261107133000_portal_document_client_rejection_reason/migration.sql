-- Additive only: preserve historical notification bodies and review records.
ALTER TABLE "PortalNotification" ADD COLUMN "clientRejectionReason" TEXT;
