-- Add optional location sharing fields for chat messages.
ALTER TABLE "Message" ADD COLUMN "latitude" REAL;
ALTER TABLE "Message" ADD COLUMN "longitude" REAL;
ALTER TABLE "Message" ADD COLUMN "locationLabel" TEXT;

ALTER TABLE "GlobalMessage" ADD COLUMN "latitude" REAL;
ALTER TABLE "GlobalMessage" ADD COLUMN "longitude" REAL;
ALTER TABLE "GlobalMessage" ADD COLUMN "locationLabel" TEXT;
