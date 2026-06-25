ALTER TABLE "Workspace" ADD COLUMN "tidNumber" TEXT;
ALTER TABLE "Workspace" ADD COLUMN "posSerial" TEXT;
ALTER TABLE "Workspace" ADD COLUMN "zoneName" TEXT;
ALTER TABLE "Workspace" ADD COLUMN "serviceType" TEXT;
ALTER TABLE "Workspace" ADD COLUMN "merchantAddress" TEXT;
ALTER TABLE "Workspace" ADD COLUMN "taskStatus" TEXT NOT NULL DEFAULT 'PENDING';
ALTER TABLE "Workspace" ADD COLUMN "startedAt" DATETIME;
ALTER TABLE "Workspace" ADD COLUMN "completedAt" DATETIME;
ALTER TABLE "Workspace" ADD COLUMN "assignedEmployeeId" TEXT;

CREATE TABLE "WorkspaceUpdate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "serviceType" TEXT,
    "remarks" TEXT,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "latitude" REAL,
    "longitude" REAL,
    "locationLabel" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkspaceUpdate_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WorkspaceUpdate_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "WorkspaceAttachment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "updateId" TEXT,
    "uploadedById" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkspaceAttachment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WorkspaceAttachment_updateId_fkey" FOREIGN KEY ("updateId") REFERENCES "WorkspaceUpdate" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WorkspaceAttachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "Workspace_assignedEmployeeId_idx" ON "Workspace"("assignedEmployeeId");
CREATE INDEX "Workspace_taskStatus_idx" ON "Workspace"("taskStatus");
CREATE INDEX "WorkspaceUpdate_workspaceId_createdAt_idx" ON "WorkspaceUpdate"("workspaceId", "createdAt");
CREATE INDEX "WorkspaceUpdate_employeeId_idx" ON "WorkspaceUpdate"("employeeId");
CREATE INDEX "WorkspaceAttachment_workspaceId_createdAt_idx" ON "WorkspaceAttachment"("workspaceId", "createdAt");
CREATE INDEX "WorkspaceAttachment_updateId_idx" ON "WorkspaceAttachment"("updateId");
