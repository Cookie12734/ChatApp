BEGIN;

CREATE INDEX "VerificationToken_expires_idx" ON "VerificationToken"("expires");

DROP INDEX "MatchingQueue_matchingResultId_key";
CREATE INDEX "MatchingQueue_matchingResultId_idx" ON "MatchingQueue"("matchingResultId");

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Post" LIMIT 1) THEN
    RAISE EXCEPTION 'Refusing to remove the non-empty Post table';
  END IF;
END $$;

DROP TABLE "Post";

COMMIT;
