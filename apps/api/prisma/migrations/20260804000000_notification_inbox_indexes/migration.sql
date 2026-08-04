CREATE INDEX IF NOT EXISTS "Notification_userId_isRead_createdAt_idx"
ON "Notification"("userId", "isRead", "createdAt");

CREATE INDEX IF NOT EXISTS "Notification_workspaceId_createdAt_idx"
ON "Notification"("workspaceId", "createdAt");
