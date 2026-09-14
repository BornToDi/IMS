-- AlterTable
ALTER TABLE "User" ADD COLUMN "inventoryRole" TEXT;

-- CreateTable
CREATE TABLE "InventoryDevice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serialNumber" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "deviceType" TEXT NOT NULL DEFAULT 'POS',
    "supplier" TEXT,
    "purchaseDate" DATETIME,
    "warrantyUntil" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'IN_STOCK',
    "bankId" TEXT,
    "location" TEXT NOT NULL,
    "merchant" TEXT,
    "branch" TEXT,
    "tid" TEXT,
    "mid" TEXT,
    "address" TEXT,
    "engineer" TEXT,
    "deploymentDate" DATETIME,
    "remarks" TEXT,
    "reference" TEXT,
    "dueDate" DATETIME,
    "faultType" TEXT,
    "repairReceivedDate" DATETIME,
    "technician" TEXT,
    "repairStatus" TEXT,
    "repairCost" REAL NOT NULL DEFAULT 0,
    "repairReturnDate" DATETIME,
    "replacementSerial" TEXT,
    "pendingReturn" BOOLEAN NOT NULL DEFAULT false,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "InventoryDevice_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "BankMaster" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InventoryEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deviceId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "previousStatus" TEXT,
    "newStatus" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "remarks" TEXT,
    "details" TEXT NOT NULL,
    "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryEvent_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "InventoryDevice" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InventoryDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deviceId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "content" BLOB NOT NULL,
    "size" INTEGER NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryDocument_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "InventoryDevice" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InventorySetting" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "lowStockThreshold" INTEGER NOT NULL DEFAULT 10,
    "pendingDays" INTEGER NOT NULL DEFAULT 7
);

-- CreateTable
CREATE TABLE "InventoryAdminAudit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "action" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_BankMaster" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "branch" TEXT,
    "contactPerson" TEXT,
    "contactDetails" TEXT,
    "agreementReference" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_BankMaster" ("createdAt", "id", "name", "updatedAt") SELECT "createdAt", "id", "name", "updatedAt" FROM "BankMaster";
DROP TABLE "BankMaster";
ALTER TABLE "new_BankMaster" RENAME TO "BankMaster";
CREATE UNIQUE INDEX "BankMaster_name_key" ON "BankMaster"("name");
CREATE INDEX "BankMaster_name_idx" ON "BankMaster"("name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "InventoryDevice_serialNumber_key" ON "InventoryDevice"("serialNumber");

-- CreateIndex
CREATE INDEX "InventoryDevice_bankId_status_idx" ON "InventoryDevice"("bankId", "status");

-- CreateIndex
CREATE INDEX "InventoryDevice_status_model_idx" ON "InventoryDevice"("status", "model");

-- CreateIndex
CREATE INDEX "InventoryDevice_warrantyUntil_idx" ON "InventoryDevice"("warrantyUntil");

-- CreateIndex
CREATE INDEX "InventoryEvent_deviceId_createdAt_idx" ON "InventoryEvent"("deviceId", "createdAt");

-- CreateIndex
CREATE INDEX "InventoryEvent_action_occurredAt_idx" ON "InventoryEvent"("action", "occurredAt");

-- CreateIndex
CREATE INDEX "InventoryDocument_deviceId_idx" ON "InventoryDocument"("deviceId");

-- Preserve the existing serial directory without guessing its physical lifecycle.
-- RECEIVED records must be verified and moved to stock before new allocations.
INSERT OR IGNORE INTO "BankMaster" ("id", "name", "createdAt", "updatedAt")
SELECT lower(hex(randomblob(16))), trim("bankName"), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "PosSerial" WHERE trim("bankName") <> '' GROUP BY trim("bankName");

INSERT INTO "InventoryDevice" ("id", "serialNumber", "brand", "model", "status", "bankId", "location", "remarks", "createdAt", "updatedAt")
SELECT 'legacy-' || p."id", upper(trim(p."serialNumber")), 'Unverified', coalesce(nullif(p."model", ''), 'Unverified'),
  'RECEIVED', b."id", coalesce(nullif(p."location", ''), 'Unverified location'),
  'Imported from the POS serial directory. Verify physical stock and device details before allocation. Previous directory status: ' || p."status",
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "PosSerial" p LEFT JOIN "BankMaster" b ON b."name" = trim(p."bankName")
WHERE trim(p."serialNumber") <> ''
GROUP BY upper(trim(p."serialNumber"));

INSERT INTO "InventoryEvent" ("id", "deviceId", "action", "newStatus", "actorId", "actorName", "remarks", "details")
SELECT lower(hex(randomblob(16))), d."id", 'LEGACY_IMPORT', 'RECEIVED', 'migration', 'System migration', d."remarks",
  json_object('before', null, 'after', json_object('serialNumber', d."serialNumber", 'status', d."status", 'location', d."location", 'bankName', b."name"))
FROM "InventoryDevice" d LEFT JOIN "BankMaster" b ON b."id" = d."bankId";
