-- CreateTable
CREATE TABLE "PageAuditLogEntry" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "userId" TEXT,
    "userEmail" TEXT,
    "action" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PageAuditLogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PageAuditLogEntry_pageId_idx" ON "PageAuditLogEntry"("pageId");

-- CreateIndex
CREATE INDEX "PageAuditLogEntry_siteId_idx" ON "PageAuditLogEntry"("siteId");

-- CreateIndex
CREATE INDEX "PageAuditLogEntry_createdAt_idx" ON "PageAuditLogEntry"("createdAt");
