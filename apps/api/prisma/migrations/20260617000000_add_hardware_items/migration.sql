-- CreateTable
CREATE TABLE "HardwareItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "batchId" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "problem" TEXT NOT NULL,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "HardwareItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "HardwareBatch" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "HardwareItem_batchId_idx" ON "HardwareItem"("batchId");

-- CreateIndex
CREATE INDEX "HardwareItem_serialNumber_idx" ON "HardwareItem"("serialNumber");
