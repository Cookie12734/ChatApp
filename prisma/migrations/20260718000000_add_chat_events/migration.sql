CREATE TABLE "ChatEvent" (
    "id" BIGSERIAL NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "audienceIds" TEXT[] NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ChatEvent_createdAt_idx" ON "ChatEvent"("createdAt");
CREATE INDEX "ChatEvent_audienceIds_idx" ON "ChatEvent" USING GIN ("audienceIds");
