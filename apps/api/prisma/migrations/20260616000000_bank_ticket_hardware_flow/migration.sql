
-- Bank ticket and hardware movement workflow
CREATE TABLE "BankTicket" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "ticketNo" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "tidNumber" TEXT,
  "posSerial" TEXT,
  "zoneName" TEXT,
  "serviceType" TEXT,
  "merchantAddress" TEXT,
  "priority" TEXT NOT NULL DEFAULT 'NORMAL',
  "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
  "bankUserId" TEXT NOT NULL,
  "assignedAdminId" TEXT,
  "assignedEmployeeId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "BankTicket_bankUserId_fkey" FOREIGN KEY ("bankUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BankTicket_assignedAdminId_fkey" FOREIGN KEY ("assignedAdminId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "BankTicket_ticketNo_key" ON "BankTicket"("ticketNo");
CREATE INDEX "BankTicket_bankUserId_status_idx" ON "BankTicket"("bankUserId", "status");
CREATE INDEX "BankTicket_assignedAdminId_idx" ON "BankTicket"("assignedAdminId");
CREATE INDEX "BankTicket_assignedEmployeeId_idx" ON "BankTicket"("assignedEmployeeId");
CREATE INDEX "BankTicket_createdAt_idx" ON "BankTicket"("createdAt");

CREATE TABLE "TicketUpdate" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "ticketId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'COMMENT',
  "message" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TicketUpdate_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "BankTicket" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TicketUpdate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "TicketUpdate_ticketId_createdAt_idx" ON "TicketUpdate"("ticketId", "createdAt");
CREATE INDEX "TicketUpdate_userId_idx" ON "TicketUpdate"("userId");

CREATE TABLE "HardwareBatch" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "batchNo" TEXT NOT NULL,
  "bankName" TEXT,
  "ticketId" TEXT,
  "createdById" TEXT NOT NULL,
  "assignedToId" TEXT,
  "totalQuantity" INTEGER NOT NULL DEFAULT 0,
  "receivedQuantity" INTEGER NOT NULL DEFAULT 0,
  "repairedQuantity" INTEGER NOT NULL DEFAULT 0,
  "faultyQuantity" INTEGER NOT NULL DEFAULT 0,
  "pendingQuantity" INTEGER NOT NULL DEFAULT 0,
  "returnedQuantity" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'SENT',
  "note" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "HardwareBatch_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "BankTicket" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "HardwareBatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "HardwareBatch_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "HardwareBatch_batchNo_key" ON "HardwareBatch"("batchNo");
CREATE INDEX "HardwareBatch_assignedToId_status_idx" ON "HardwareBatch"("assignedToId", "status");
CREATE INDEX "HardwareBatch_ticketId_idx" ON "HardwareBatch"("ticketId");
CREATE INDEX "HardwareBatch_createdAt_idx" ON "HardwareBatch"("createdAt");

CREATE TABLE "HardwareUpdate" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "batchId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'COMMENT',
  "quantity" INTEGER,
  "receivedQuantity" INTEGER,
  "repairedQuantity" INTEGER,
  "faultyQuantity" INTEGER,
  "pendingQuantity" INTEGER,
  "returnedQuantity" INTEGER,
  "comment" TEXT,
  "mentionedUserIds" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HardwareUpdate_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "HardwareBatch" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "HardwareUpdate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "HardwareUpdate_batchId_createdAt_idx" ON "HardwareUpdate"("batchId", "createdAt");
CREATE INDEX "HardwareUpdate_userId_idx" ON "HardwareUpdate"("userId");
