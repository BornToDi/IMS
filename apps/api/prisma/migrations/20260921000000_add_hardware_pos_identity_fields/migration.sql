-- Add the POS identity fields used by the hardware inventory flow.
ALTER TABLE "InventoryDevice" ADD COLUMN "telco" TEXT;
ALTER TABLE "InventoryDevice" ADD COLUMN "simEi" TEXT;
