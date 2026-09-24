-- CreateTable
CREATE TABLE "QualityScoreHistory" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "subScores" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QualityScoreHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QualityScoreHistory_pageId_idx" ON "QualityScoreHistory"("pageId");

-- CreateIndex
CREATE INDEX "QualityScoreHistory_siteId_idx" ON "QualityScoreHistory"("siteId");

-- CreateIndex
CREATE INDEX "QualityScoreHistory_createdAt_idx" ON "QualityScoreHistory"("createdAt");
