-- FIND-C4: additive optimistic concurrency metadata; no business data is rewritten.
ALTER TABLE "Client" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;
