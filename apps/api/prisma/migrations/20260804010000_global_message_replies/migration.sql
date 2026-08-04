ALTER TABLE "GlobalMessage" ADD COLUMN "replyToId" TEXT
REFERENCES "GlobalMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "GlobalMessage_replyToId_idx"
ON "GlobalMessage"("replyToId");
