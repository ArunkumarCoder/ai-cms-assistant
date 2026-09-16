-- CreateTable
CREATE TABLE "AiCallLog" (
    "id" TEXT NOT NULL,
    "callType" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "estimatedCostUsd" DOUBLE PRECISION NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "success" BOOLEAN NOT NULL,
    "errorMessage" TEXT,
    "siteId" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiCallLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiCallLog_callType_idx" ON "AiCallLog"("callType");

-- CreateIndex
CREATE INDEX "AiCallLog_siteId_idx" ON "AiCallLog"("siteId");

-- CreateIndex
CREATE INDEX "AiCallLog_createdAt_idx" ON "AiCallLog"("createdAt");
