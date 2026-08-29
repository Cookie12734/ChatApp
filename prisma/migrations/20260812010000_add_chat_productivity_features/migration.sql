BEGIN;

CREATE TYPE "ServerVisibility" AS ENUM ('PRIVATE', 'PUBLIC');
CREATE TYPE "ServerCategory" AS ENUM ('COMMUNITY', 'GAMES', 'STUDY', 'HOBBIES', 'WELLBEING', 'OTHER');
CREATE TYPE "GroupMemberRole" AS ENUM ('OWNER', 'MEMBER');
CREATE TYPE "AttachmentKind" AS ENUM ('IMAGE', 'PDF', 'LINK');
CREATE TYPE "MatchingRating" AS ENUM ('NEGATIVE', 'NEUTRAL', 'POSITIVE');
CREATE TYPE "RematchRequestStatus" AS ENUM ('PENDING', 'MATCHED', 'EXPIRED');

ALTER TABLE "DirectMessage" ADD COLUMN "replyToId" TEXT;
ALTER TABLE "ServerMessage" ADD COLUMN "replyToId" TEXT;
ALTER TABLE "ChatServer"
  ADD COLUMN "visibility" "ServerVisibility" NOT NULL DEFAULT 'PRIVATE',
  ADD COLUMN "category" "ServerCategory",
  ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "MatchingResult"
  ADD COLUMN "firstUserRating" "MatchingRating",
  ADD COLUMN "secondUserRating" "MatchingRating",
  ADD COLUMN "firstUserChatConsentAt" TIMESTAMP(3),
  ADD COLUMN "secondUserChatConsentAt" TIMESTAMP(3);

CREATE TABLE "NotificationPreference" (
  "userId" TEXT NOT NULL,
  "directMessages" BOOLEAN NOT NULL DEFAULT true,
  "groupMessages" BOOLEAN NOT NULL DEFAULT true,
  "mentions" BOOLEAN NOT NULL DEFAULT true,
  "friendRequests" BOOLEAN NOT NULL DEFAULT true,
  "matching" BOOLEAN NOT NULL DEFAULT true,
  "showMessagePreview" BOOLEAN NOT NULL DEFAULT false,
  "quietHoursStart" INTEGER,
  "quietHoursEnd" INTEGER,
  "timeZone" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("userId"),
  CONSTRAINT "NotificationPreference_quiet_hours_check" CHECK (
    ("quietHoursStart" IS NULL AND "quietHoursEnd" IS NULL)
    OR
    ("quietHoursStart" IS NOT NULL AND "quietHoursEnd" IS NOT NULL
      AND "quietHoursStart" BETWEEN 0 AND 1439
      AND "quietHoursEnd" BETWEEN 0 AND 1439)
  )
);

CREATE TABLE "PushSubscription" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "endpoint" TEXT NOT NULL,
  "p256dh" TEXT NOT NULL,
  "auth" TEXT NOT NULL,
  "expirationTime" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DirectMessageReaction" (
  "messageId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "emoji" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DirectMessageReaction_pkey" PRIMARY KEY ("messageId", "userId", "emoji")
);

CREATE TABLE "SavedDirectMessage" (
  "userId" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SavedDirectMessage_pkey" PRIMARY KEY ("userId", "messageId")
);

CREATE TABLE "GroupConversation" (
  "id" TEXT NOT NULL,
  "name" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GroupConversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GroupConversationMember" (
  "groupId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "GroupMemberRole" NOT NULL DEFAULT 'MEMBER',
  "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GroupConversationMember_pkey" PRIMARY KEY ("groupId", "userId")
);

CREATE TABLE "GroupMessage" (
  "id" TEXT NOT NULL,
  "clientId" TEXT,
  "content" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "senderId" TEXT NOT NULL,
  "replyToId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GroupMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GroupMessageReaction" (
  "messageId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "emoji" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GroupMessageReaction_pkey" PRIMARY KEY ("messageId", "userId", "emoji")
);

CREATE TABLE "SavedGroupMessage" (
  "userId" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SavedGroupMessage_pkey" PRIMARY KEY ("userId", "messageId")
);

CREATE TABLE "ServerMessageReaction" (
  "messageId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "emoji" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServerMessageReaction_pkey" PRIMARY KEY ("messageId", "userId", "emoji")
);

CREATE TABLE "SavedServerMessage" (
  "userId" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SavedServerMessage_pkey" PRIMARY KEY ("userId", "messageId")
);

CREATE TABLE "MessageAttachment" (
  "id" TEXT NOT NULL,
  "uploaderId" TEXT NOT NULL,
  "kind" "AttachmentKind" NOT NULL,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "data" BYTEA,
  "externalUrl" TEXT,
  "directMessageId" TEXT,
  "serverMessageId" TEXT,
  "groupMessageId" TEXT,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MessageAttachment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MessageAttachment_target_check" CHECK (
    (num_nonnulls("directMessageId", "serverMessageId", "groupMessageId") = 0 AND "expiresAt" IS NOT NULL)
    OR
    (num_nonnulls("directMessageId", "serverMessageId", "groupMessageId") = 1 AND "expiresAt" IS NULL)
  ),
  CONSTRAINT "MessageAttachment_payload_check" CHECK (
    ("kind" = 'LINK' AND "externalUrl" IS NOT NULL AND "data" IS NULL AND "size" = 0)
    OR
    ("kind" IN ('IMAGE', 'PDF') AND "data" IS NOT NULL AND "externalUrl" IS NULL
      AND octet_length("data") = "size" AND "size" BETWEEN 1 AND 8388608)
  ),
  CONSTRAINT "MessageAttachment_size_check" CHECK ("size" BETWEEN 0 AND 8388608)
);

CREATE TABLE "RematchRequest" (
  "id" TEXT NOT NULL,
  "matchingResultId" TEXT NOT NULL,
  "firstUserRequestedAt" TIMESTAMP(3),
  "secondUserRequestedAt" TIMESTAMP(3),
  "status" "RematchRequestStatus" NOT NULL DEFAULT 'PENDING',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RematchRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");
CREATE INDEX "DirectMessage_replyToId_idx" ON "DirectMessage"("replyToId");
CREATE INDEX "DirectMessageReaction_userId_createdAt_idx" ON "DirectMessageReaction"("userId", "createdAt");
CREATE INDEX "SavedDirectMessage_userId_createdAt_idx" ON "SavedDirectMessage"("userId", "createdAt");
CREATE INDEX "SavedDirectMessage_messageId_idx" ON "SavedDirectMessage"("messageId");
CREATE INDEX "GroupConversation_createdById_updatedAt_idx" ON "GroupConversation"("createdById", "updatedAt");
CREATE INDEX "GroupConversationMember_userId_createdAt_idx" ON "GroupConversationMember"("userId", "createdAt");
CREATE UNIQUE INDEX "GroupMessage_senderId_clientId_key" ON "GroupMessage"("senderId", "clientId");
CREATE INDEX "GroupMessage_groupId_createdAt_idx" ON "GroupMessage"("groupId", "createdAt");
CREATE INDEX "GroupMessage_senderId_createdAt_idx" ON "GroupMessage"("senderId", "createdAt");
CREATE INDEX "GroupMessage_replyToId_idx" ON "GroupMessage"("replyToId");
CREATE INDEX "GroupMessageReaction_userId_createdAt_idx" ON "GroupMessageReaction"("userId", "createdAt");
CREATE INDEX "SavedGroupMessage_userId_createdAt_idx" ON "SavedGroupMessage"("userId", "createdAt");
CREATE INDEX "SavedGroupMessage_messageId_idx" ON "SavedGroupMessage"("messageId");
CREATE INDEX "ServerMessage_replyToId_idx" ON "ServerMessage"("replyToId");
CREATE INDEX "ServerMessageReaction_userId_createdAt_idx" ON "ServerMessageReaction"("userId", "createdAt");
CREATE INDEX "SavedServerMessage_userId_createdAt_idx" ON "SavedServerMessage"("userId", "createdAt");
CREATE INDEX "SavedServerMessage_messageId_idx" ON "SavedServerMessage"("messageId");
CREATE INDEX "MessageAttachment_uploaderId_createdAt_idx" ON "MessageAttachment"("uploaderId", "createdAt");
CREATE INDEX "MessageAttachment_directMessageId_idx" ON "MessageAttachment"("directMessageId");
CREATE INDEX "MessageAttachment_serverMessageId_idx" ON "MessageAttachment"("serverMessageId");
CREATE INDEX "MessageAttachment_groupMessageId_idx" ON "MessageAttachment"("groupMessageId");
CREATE INDEX "MessageAttachment_expiresAt_idx" ON "MessageAttachment"("expiresAt");
CREATE UNIQUE INDEX "RematchRequest_matchingResultId_key" ON "RematchRequest"("matchingResultId");
CREATE INDEX "RematchRequest_status_expiresAt_idx" ON "RematchRequest"("status", "expiresAt");
CREATE INDEX "ChatServer_visibility_category_createdAt_idx" ON "ChatServer"("visibility", "category", "createdAt");
CREATE INDEX "MatchingResult_firstUserId_createdAt_id_idx" ON "MatchingResult"("firstUserId", "createdAt", "id");
CREATE INDEX "MatchingResult_secondUserId_createdAt_id_idx" ON "MatchingResult"("secondUserId", "createdAt", "id");

ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectMessage" ADD CONSTRAINT "DirectMessage_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "DirectMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DirectMessageReaction" ADD CONSTRAINT "DirectMessageReaction_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "DirectMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectMessageReaction" ADD CONSTRAINT "DirectMessageReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SavedDirectMessage" ADD CONSTRAINT "SavedDirectMessage_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "DirectMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SavedDirectMessage" ADD CONSTRAINT "SavedDirectMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GroupConversation" ADD CONSTRAINT "GroupConversation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GroupConversationMember" ADD CONSTRAINT "GroupConversationMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "GroupConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GroupConversationMember" ADD CONSTRAINT "GroupConversationMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GroupMessage" ADD CONSTRAINT "GroupMessage_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "GroupConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GroupMessage" ADD CONSTRAINT "GroupMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GroupMessage" ADD CONSTRAINT "GroupMessage_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "GroupMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GroupMessageReaction" ADD CONSTRAINT "GroupMessageReaction_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "GroupMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GroupMessageReaction" ADD CONSTRAINT "GroupMessageReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SavedGroupMessage" ADD CONSTRAINT "SavedGroupMessage_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "GroupMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SavedGroupMessage" ADD CONSTRAINT "SavedGroupMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServerMessage" ADD CONSTRAINT "ServerMessage_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "ServerMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ServerMessageReaction" ADD CONSTRAINT "ServerMessageReaction_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ServerMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServerMessageReaction" ADD CONSTRAINT "ServerMessageReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SavedServerMessage" ADD CONSTRAINT "SavedServerMessage_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ServerMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SavedServerMessage" ADD CONSTRAINT "SavedServerMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MessageAttachment" ADD CONSTRAINT "MessageAttachment_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MessageAttachment" ADD CONSTRAINT "MessageAttachment_directMessageId_fkey" FOREIGN KEY ("directMessageId") REFERENCES "DirectMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MessageAttachment" ADD CONSTRAINT "MessageAttachment_serverMessageId_fkey" FOREIGN KEY ("serverMessageId") REFERENCES "ServerMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MessageAttachment" ADD CONSTRAINT "MessageAttachment_groupMessageId_fkey" FOREIGN KEY ("groupMessageId") REFERENCES "GroupMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RematchRequest" ADD CONSTRAINT "RematchRequest_matchingResultId_fkey" FOREIGN KEY ("matchingResultId") REFERENCES "MatchingResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
