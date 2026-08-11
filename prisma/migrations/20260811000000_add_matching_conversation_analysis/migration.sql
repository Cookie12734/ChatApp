ALTER TABLE "MatchingResult"
ADD COLUMN "firstUserConversationConsent" BOOLEAN,
ADD COLUMN "secondUserConversationConsent" BOOLEAN;

CREATE TABLE "MatchingTopicProfile" (
    "userId" TEXT NOT NULL,
    "topic" "MatchingTopic" NOT NULL,
    "vector" JSONB NOT NULL,
    "sampleCount" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatchingTopicProfile_pkey" PRIMARY KEY ("userId", "topic")
);

CREATE INDEX "MatchingTopicProfile_topic_updatedAt_idx"
ON "MatchingTopicProfile"("topic", "updatedAt");

ALTER TABLE "MatchingTopicProfile"
ADD CONSTRAINT "MatchingTopicProfile_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
