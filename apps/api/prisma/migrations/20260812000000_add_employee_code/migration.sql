ALTER TABLE "User" ADD COLUMN "employeeCode" TEXT;

CREATE UNIQUE INDEX "User_employeeCode_key" ON "User"("employeeCode");
