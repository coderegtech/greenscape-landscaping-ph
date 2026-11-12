-- Optional supporting attachment on attendance correction requests.
ALTER TABLE "AttendanceCorrection" ADD COLUMN "attachmentId" UUID;
ALTER TABLE "AttendanceCorrection" ADD CONSTRAINT "AttendanceCorrection_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
