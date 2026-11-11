-- Auth, account and AI assistant (feature/auth-chatbot). Only this change: tables from other branches are left alone.

-- AlterTable
ALTER TABLE "ContactInquiry" ADD COLUMN     "userId" UUID;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "avatarUrl" TEXT;

-- CreateTable
CREATE TABLE "WishlistItem" (
    "userId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

CONSTRAINT "WishlistItem_pkey" PRIMARY KEY ("userId","productId")
);

-- CreateTable
CREATE TABLE "AssistantConversation" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'New conversation',
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

CONSTRAINT "AssistantConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssistantMessage" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "provider" TEXT,
    "model" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

CONSTRAINT "AssistantMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssistantConversation_userId_updatedAt_idx" ON "AssistantConversation"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "AssistantConversation_updatedAt_idx" ON "AssistantConversation"("updatedAt");

-- CreateIndex
CREATE INDEX "AssistantMessage_conversationId_createdAt_idx" ON "AssistantMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "AssistantMessage_createdAt_idx" ON "AssistantMessage"("createdAt");

-- CreateIndex
CREATE INDEX "ContactInquiry_userId_idx" ON "ContactInquiry"("userId");

-- AddForeignKey
ALTER TABLE "ContactInquiry" ADD CONSTRAINT "ContactInquiry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WishlistItem" ADD CONSTRAINT "WishlistItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WishlistItem" ADD CONSTRAINT "WishlistItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantConversation" ADD CONSTRAINT "AssistantConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantMessage" ADD CONSTRAINT "AssistantMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AssistantConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
