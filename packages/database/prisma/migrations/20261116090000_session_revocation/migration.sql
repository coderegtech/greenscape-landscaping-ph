-- "Sign out everywhere": sessions that signed in before this time are refused.
ALTER TABLE "User" ADD COLUMN "sessionsValidAfter" TIMESTAMP(3);
