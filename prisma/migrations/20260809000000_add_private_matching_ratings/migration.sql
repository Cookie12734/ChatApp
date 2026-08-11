-- Individual rating values are intentionally not stored. Only aggregate totals
-- and whether each participant has rated a match are retained.
ALTER TABLE "User"
ADD COLUMN "matchingRatingTotal" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "matchingRatingCount" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "MatchingResult" (
    "id" TEXT NOT NULL,
    "firstUserId" TEXT NOT NULL,
    "secondUserId" TEXT NOT NULL,
    "topic" "MatchingTopic" NOT NULL,
    "firstUserRatedAt" TIMESTAMP(3),
    "secondUserRatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchingResult_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "MatchingQueue" ADD COLUMN "matchingResultId" TEXT;

CREATE UNIQUE INDEX "MatchingQueue_matchingResultId_key"
ON "MatchingQueue"("matchingResultId");
CREATE INDEX "MatchingResult_firstUserId_firstUserRatedAt_createdAt_idx"
ON "MatchingResult"("firstUserId", "firstUserRatedAt", "createdAt");
CREATE INDEX "MatchingResult_secondUserId_secondUserRatedAt_createdAt_idx"
ON "MatchingResult"("secondUserId", "secondUserRatedAt", "createdAt");

ALTER TABLE "MatchingResult"
ADD CONSTRAINT "MatchingResult_firstUserId_fkey"
FOREIGN KEY ("firstUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MatchingResult"
ADD CONSTRAINT "MatchingResult_secondUserId_fkey"
FOREIGN KEY ("secondUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MatchingQueue"
ADD CONSTRAINT "MatchingQueue_matchingResultId_fkey"
FOREIGN KEY ("matchingResultId") REFERENCES "MatchingResult"("id") ON DELETE SET NULL ON UPDATE CASCADE;
