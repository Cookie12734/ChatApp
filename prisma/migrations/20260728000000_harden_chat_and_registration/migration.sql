CREATE TYPE "MessageKind" AS ENUM ('DIRECT', 'SERVER');
CREATE TYPE "ReportReason" AS ENUM ('HARASSMENT', 'SELF_HARM', 'SPAM', 'OTHER');
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'REVIEWED');

CREATE TABLE "PendingRegistration" (
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendingRegistration_pkey" PRIMARY KEY ("email")
);

ALTER TABLE "ChatEvent" ADD COLUMN "serverId" TEXT;
ALTER TABLE "DirectMessage" ADD COLUMN "clientId" TEXT;
ALTER TABLE "ServerMessage" ADD COLUMN "clientId" TEXT;
ALTER TABLE "User" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "MessageReport" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT,
    "reportedUserId" TEXT,
    "messageId" TEXT NOT NULL,
    "messageKind" "MessageKind" NOT NULL,
    "reason" "ReportReason" NOT NULL,
    "details" TEXT,
    "contentSnapshot" TEXT NOT NULL,
    "serverId" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageReport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PendingRegistration_token_key" ON "PendingRegistration"("token");
CREATE INDEX "PendingRegistration_expires_idx" ON "PendingRegistration"("expires");
CREATE INDEX "PendingRegistration_userId_idx" ON "PendingRegistration"("userId");
CREATE INDEX "ChatEvent_serverId_id_idx" ON "ChatEvent"("serverId", "id");
CREATE UNIQUE INDEX "DirectMessage_senderId_clientId_key" ON "DirectMessage"("senderId", "clientId");
CREATE UNIQUE INDEX "ServerMessage_senderId_clientId_key" ON "ServerMessage"("senderId", "clientId");
CREATE UNIQUE INDEX "MessageReport_reporterId_messageKind_messageId_key" ON "MessageReport"("reporterId", "messageKind", "messageId");
CREATE INDEX "MessageReport_reportedUserId_createdAt_idx" ON "MessageReport"("reportedUserId", "createdAt");
CREATE INDEX "MessageReport_serverId_status_createdAt_idx" ON "MessageReport"("serverId", "status", "createdAt");
CREATE INDEX "MessageReport_createdAt_idx" ON "MessageReport"("createdAt");

ALTER TABLE "MessageReport"
ADD CONSTRAINT "MessageReport_reporterId_fkey"
FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MessageReport"
ADD CONSTRAINT "MessageReport_reportedUserId_fkey"
FOREIGN KEY ("reportedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MessageReport"
ADD CONSTRAINT "MessageReport_reviewedById_fkey"
FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
