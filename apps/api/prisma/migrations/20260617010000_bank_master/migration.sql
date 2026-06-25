-- CreateTable
CREATE TABLE "BankMaster" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "BankMaster_name_key" ON "BankMaster"("name");

-- CreateIndex
CREATE INDEX "BankMaster_name_idx" ON "BankMaster"("name");

-- Seed from existing POS serial bank names
INSERT OR IGNORE INTO "BankMaster" ("id", "name", "createdAt", "updatedAt")
SELECT lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(2))) || '-' || lower(hex(randomblob(6))), "bankName", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "PosSerial"
WHERE "bankName" IS NOT NULL AND TRIM("bankName") <> '';
