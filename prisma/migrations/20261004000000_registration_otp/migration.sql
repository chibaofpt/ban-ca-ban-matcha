-- Generated offline with prisma migrate diff after migrate:dev --create-only hit historical P3006.
-- Only registration settings and nullable cookie-binding metadata are introduced; no user backfill.
BEGIN;

-- AlterTable
ALTER TABLE "otp_attempts" ADD COLUMN "binding_hash" TEXT;

-- CreateTable
CREATE TABLE "registration_otp_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "otp_enabled" BOOLEAN NOT NULL DEFAULT false,
    "daily_send_limit" INTEGER NOT NULL DEFAULT 100,
    "revision" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "registration_otp_settings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "registration_otp_settings_singleton" CHECK ("id" = 1),
    CONSTRAINT "registration_otp_settings_daily_positive" CHECK ("daily_send_limit" > 0),
    CONSTRAINT "registration_otp_settings_revision_nonnegative" CHECK ("revision" >= 0)
);

INSERT INTO "registration_otp_settings" ("id", "otp_enabled", "daily_send_limit", "revision")
VALUES (1, false, 100, 0);

-- Custom cookie authentication is handled through the direct Prisma owner, never PostgREST.
ALTER TABLE public."registration_otp_settings" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."registration_otp_settings" FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
