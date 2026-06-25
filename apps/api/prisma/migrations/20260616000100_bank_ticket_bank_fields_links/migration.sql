-- Add bank identity fields and clickable notification target URLs after BankTicket exists.
ALTER TABLE "User" ADD COLUMN "bankName" TEXT;
ALTER TABLE "BankTicket" ADD COLUMN "bankName" TEXT;
ALTER TABLE "Notification" ADD COLUMN "targetUrl" TEXT;

-- SQLite cannot add a foreign key column safely with ALTER TABLE, so Workspace is re-created.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Workspace" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "accentColor" TEXT,
    "tidNumber" TEXT,
    "posSerial" TEXT,
    "zoneName" TEXT,
    "serviceType" TEXT,
    "merchantAddress" TEXT,
    "bankName" TEXT,
    "taskStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "isImportant" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "assignedEmployeeId" TEXT,
    "ticketId" TEXT,
    "ownerId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Workspace_assignedEmployeeId_fkey" FOREIGN KEY ("assignedEmployeeId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Workspace_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "BankTicket" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Workspace_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Workspace" ("accentColor", "assignedEmployeeId", "completedAt", "createdAt", "description", "id", "isImportant", "merchantAddress", "name", "ownerId", "posSerial", "serviceType", "startedAt", "taskStatus", "tidNumber", "updatedAt", "zoneName")
SELECT "accentColor", "assignedEmployeeId", "completedAt", "createdAt", "description", "id", "isImportant", "merchantAddress", "name", "ownerId", "posSerial", "serviceType", "startedAt", "taskStatus", "tidNumber", "updatedAt", "zoneName" FROM "Workspace";
DROP TABLE "Workspace";
ALTER TABLE "new_Workspace" RENAME TO "Workspace";
CREATE UNIQUE INDEX "Workspace_ticketId_key" ON "Workspace"("ticketId");
CREATE INDEX "Workspace_assignedEmployeeId_idx" ON "Workspace"("assignedEmployeeId");
CREATE INDEX "Workspace_taskStatus_idx" ON "Workspace"("taskStatus");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
