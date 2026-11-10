-- AlterTable
ALTER TABLE "Announcement" ADD COLUMN     "legacyId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "legacyUid" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Announcement_legacyId_key" ON "Announcement"("legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "User_legacyUid_key" ON "User"("legacyUid");

