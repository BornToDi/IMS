-- SQLite doesn't support ALTER TABLE MODIFY, so we need to recreate the table

PRAGMA foreign_keys=OFF;

-- Create new table with workspaceId as nullable
CREATE TABLE "Announcement_new" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT,
  "authorId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "isPinned" BOOLEAN NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "Announcement_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Announcement_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Copy data from old table
INSERT INTO "Announcement_new" SELECT * FROM "Announcement";

-- Drop old table
DROP TABLE "Announcement";

-- Rename new table
ALTER TABLE "Announcement_new" RENAME TO "Announcement";

-- Recreate indexes
CREATE INDEX "Announcement_workspaceId_idx" ON "Announcement"("workspaceId");
CREATE INDEX "Announcement_authorId_idx" ON "Announcement"("authorId");

PRAGMA foreign_keys=ON;

