CREATE TABLE IF NOT EXISTS "PosSerial" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bankName" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "model" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "PosSerial_serialNumber_key" ON "PosSerial"("serialNumber");
CREATE INDEX IF NOT EXISTS "PosSerial_bankName_idx" ON "PosSerial"("bankName");
CREATE INDEX IF NOT EXISTS "PosSerial_serialNumber_idx" ON "PosSerial"("serialNumber");
