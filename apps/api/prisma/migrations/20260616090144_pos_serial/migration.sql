-- DropIndex
DROP INDEX "Announcement_authorId_idx";

-- DropIndex
DROP INDEX "Announcement_workspaceId_idx";

-- DropIndex
DROP INDEX "Meeting_organizerId_idx";

-- DropIndex
DROP INDEX "Meeting_workspaceId_idx";

-- DropIndex
DROP INDEX "MeetingInvite_userId_idx";

-- DropIndex
DROP INDEX "MeetingInvite_meetingId_idx";

-- DropIndex
DROP INDEX "Workspace_taskStatus_idx";

-- DropIndex
DROP INDEX "Workspace_assignedEmployeeId_idx";

-- DropIndex
DROP INDEX "Workspace_ticketId_key";

-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PosSerial" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bankName" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "model" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_PosSerial" ("bankName", "createdAt", "id", "model", "serialNumber", "status", "updatedAt") SELECT "bankName", "createdAt", "id", "model", "serialNumber", "status", "updatedAt" FROM "PosSerial";
DROP TABLE "PosSerial";
ALTER TABLE "new_PosSerial" RENAME TO "PosSerial";
CREATE UNIQUE INDEX "PosSerial_serialNumber_key" ON "PosSerial"("serialNumber");
CREATE INDEX "PosSerial_bankName_idx" ON "PosSerial"("bankName");
CREATE INDEX "PosSerial_serialNumber_idx" ON "PosSerial"("serialNumber");
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
