-- Admin-provisioned accounts (employees, staff) start with a temporary password that must be replaced.
ALTER TABLE "User" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
