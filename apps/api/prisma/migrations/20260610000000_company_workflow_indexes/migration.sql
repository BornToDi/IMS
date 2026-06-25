-- Company workflow hardening: duplicate prevention and frequent query indexes.
CREATE UNIQUE INDEX IF NOT EXISTS "WorkspaceMember_workspaceId_userId_key" ON "WorkspaceMember"("workspaceId", "userId");
CREATE INDEX IF NOT EXISTS "WorkspaceMember_userId_idx" ON "WorkspaceMember"("userId");
CREATE INDEX IF NOT EXISTS "Goal_workspaceId_status_idx" ON "Goal"("workspaceId", "status");
CREATE INDEX IF NOT EXISTS "Goal_ownerId_idx" ON "Goal"("ownerId");
CREATE INDEX IF NOT EXISTS "ActionItem_workspaceId_status_idx" ON "ActionItem"("workspaceId", "status");
CREATE INDEX IF NOT EXISTS "ActionItem_assigneeId_idx" ON "ActionItem"("assigneeId");
CREATE INDEX IF NOT EXISTS "ActionItem_goalId_idx" ON "ActionItem"("goalId");
CREATE INDEX IF NOT EXISTS "Message_workspaceId_createdAt_idx" ON "Message"("workspaceId", "createdAt");
CREATE INDEX IF NOT EXISTS "GlobalMessage_createdAt_idx" ON "GlobalMessage"("createdAt");
CREATE INDEX IF NOT EXISTS "GlobalMessage_authorId_idx" ON "GlobalMessage"("authorId");
