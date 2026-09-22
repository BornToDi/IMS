ALTER TABLE "PosSerial" ADD COLUMN "tidNumber" TEXT;
ALTER TABLE "PosSerial" ADD COLUMN "midNumber" TEXT;
ALTER TABLE "PosSerial" ADD COLUMN "merchantName" TEXT;
ALTER TABLE "PosSerial" ADD COLUMN "merchantAddress" TEXT;
ALTER TABLE "PosSerial" ADD COLUMN "merchantStatus" TEXT;
ALTER TABLE "PosSerial" ADD COLUMN "operator" TEXT;
ALTER TABLE "PosSerial" ADD COLUMN "simNumber" TEXT;
ALTER TABLE "PosSerial" ADD COLUMN "remarks" TEXT;

CREATE INDEX "PosSerial_tidNumber_idx" ON "PosSerial"("tidNumber");
