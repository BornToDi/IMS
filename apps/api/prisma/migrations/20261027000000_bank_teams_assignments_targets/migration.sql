-- CreateTable
CREATE TABLE "BankPosAssignment" (
    "deviceId" TEXT NOT NULL PRIMARY KEY,
    "employeeId" TEXT NOT NULL,
    "assignedBy" TEXT NOT NULL,
    "assignedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "BankPosAssignment_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "InventoryDevice" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BankPosAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BankAssignmentHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bankId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "previousEmployeeId" TEXT,
    "employeeId" TEXT,
    "employeeName" TEXT,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BankAssignmentHistory_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "BankMaster" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BankTarget" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bankId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "startsAt" DATETIME NOT NULL,
    "dueAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BankTarget_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "BankMaster" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BankTarget_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BankTargetCompletion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "targetId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedBy" TEXT,
    "reviewedAt" DATETIME,
    "reviewNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BankTargetCompletion_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "BankTarget" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employeeCode" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "userRole" TEXT NOT NULL DEFAULT 'EMPLOYEE',
    "inventoryRole" TEXT,
    "bankName" TEXT,
    "bankId" TEXT,
    "bankRole" TEXT,
    "bankStatus" TEXT NOT NULL DEFAULT 'APPROVED',
    "bankVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "BankMaster" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_User" ("avatarUrl", "bankName", "createdAt", "email", "employeeCode", "id", "inventoryRole", "name", "passwordHash", "updatedAt", "userRole") SELECT "avatarUrl", "bankName", "createdAt", "email", "employeeCode", "id", "inventoryRole", "name", "passwordHash", "updatedAt", "userRole" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_employeeCode_key" ON "User"("employeeCode");
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "BankPosAssignment_employeeId_idx" ON "BankPosAssignment"("employeeId");

-- CreateIndex
CREATE INDEX "BankAssignmentHistory_bankId_createdAt_idx" ON "BankAssignmentHistory"("bankId", "createdAt");

-- CreateIndex
CREATE INDEX "BankAssignmentHistory_deviceId_createdAt_idx" ON "BankAssignmentHistory"("deviceId", "createdAt");

-- CreateIndex
CREATE INDEX "BankTarget_bankId_employeeId_dueAt_idx" ON "BankTarget"("bankId", "employeeId", "dueAt");

-- CreateIndex
CREATE INDEX "BankTargetCompletion_targetId_status_idx" ON "BankTargetCompletion"("targetId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "BankTargetCompletion_targetId_deviceId_key" ON "BankTargetCompletion"("targetId", "deviceId");


-- Link legacy bank accounts without granting bank-admin privileges.
UPDATE "User" SET "bankId" = (SELECT "id" FROM "BankMaster" WHERE lower(trim("name")) = lower(trim("User"."bankName")) LIMIT 1) WHERE "userRole" = 'BANK' AND "bankId" IS NULL;

CREATE INDEX "User_bankId_userRole_bankStatus_idx" ON "User"("bankId", "userRole", "bankStatus");

UPDATE "User" SET "bankName" = (SELECT "name" FROM "BankMaster" WHERE "id" = "User"."bankId") WHERE "userRole" = 'BANK' AND "bankId" IS NOT NULL;
