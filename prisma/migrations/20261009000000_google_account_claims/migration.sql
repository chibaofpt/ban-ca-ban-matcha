-- Generated from local Prisma datamodels only; historical replay remains gated by NOTES.md.
-- Existing users remain LEGACY_PHONE; no points, vouchers, contacts or credentials are rewritten.
BEGIN;
-- CreateEnum
CREATE TYPE "AccountOrigin" AS ENUM ('LEGACY_PHONE', 'GOOGLE_EMAIL');

-- CreateEnum
CREATE TYPE "GoogleAuthPurpose" AS ENUM ('LOGIN', 'CLAIM', 'LINK', 'REAUTH');

-- CreateEnum
CREATE TYPE "OtpPurpose" AS ENUM ('LEGACY_REGISTRATION', 'PHONE_GHOST_CLAIM');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "account_origin" "AccountOrigin" NOT NULL DEFAULT 'LEGACY_PHONE',
ADD COLUMN     "email" TEXT,
ADD COLUMN     "google_sub" TEXT,
ALTER COLUMN "phone_number" DROP NOT NULL,
ALTER COLUMN "password_hash" DROP NOT NULL;

-- AlterTable
ALTER TABLE "otp_attempts" ADD COLUMN     "actor_session_id" TEXT,
ADD COLUMN     "actor_user_id" UUID,
ADD COLUMN     "purpose" "OtpPurpose" NOT NULL DEFAULT 'LEGACY_REGISTRATION',
ADD COLUMN     "target_user_id" UUID;

-- CreateTable
CREATE TABLE "account_claim_links" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "account_claim_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "google_auth_attempts" (
    "id" UUID NOT NULL,
    "purpose" "GoogleAuthPurpose" NOT NULL,
    "nonce_hash" TEXT NOT NULL,
    "binding_hash" TEXT NOT NULL,
    "actor_user_id" UUID,
    "actor_session_id" TEXT,
    "claim_link_id" UUID,
    "claim_token_hash" TEXT,
    "verified_google_sub" TEXT,
    "verified_at" TIMESTAMPTZ(6),
    "consumed_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "google_auth_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_merges" (
    "source_user_id" UUID NOT NULL,
    "target_user_id" UUID NOT NULL,
    "proof_kind" TEXT NOT NULL,
    "proof_reference" TEXT NOT NULL,
    "performed_by" UUID,
    "audit" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_merges_pkey" PRIMARY KEY ("source_user_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "account_claim_links_user_id_key" ON "account_claim_links"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "account_claim_links_token_hash_key" ON "account_claim_links"("token_hash");

-- CreateIndex
CREATE INDEX "account_claim_links_expires_at_idx" ON "account_claim_links"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "google_auth_attempts_nonce_hash_key" ON "google_auth_attempts"("nonce_hash");

-- CreateIndex
CREATE INDEX "google_auth_attempts_expires_at_idx" ON "google_auth_attempts"("expires_at");

-- CreateIndex
CREATE INDEX "google_auth_attempts_actor_user_id_idx" ON "google_auth_attempts"("actor_user_id");

-- CreateIndex
CREATE INDEX "account_merges_target_user_id_idx" ON "account_merges"("target_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_google_sub_key" ON "users"("google_sub");

-- AddForeignKey
ALTER TABLE "account_claim_links" ADD CONSTRAINT "account_claim_links_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_claim_links" ADD CONSTRAINT "account_claim_links_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "google_auth_attempts" ADD CONSTRAINT "google_auth_attempts_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "google_auth_attempts" ADD CONSTRAINT "google_auth_attempts_claim_link_id_fkey" FOREIGN KEY ("claim_link_id") REFERENCES "account_claim_links"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_merges" ADD CONSTRAINT "account_merges_source_user_id_fkey" FOREIGN KEY ("source_user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_merges" ADD CONSTRAINT "account_merges_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_merges" ADD CONSTRAINT "account_merges_performed_by_fkey" FOREIGN KEY ("performed_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- Account proof and merge audit are server-only; custom sessions do not use PostgREST.
ALTER TABLE public."account_claim_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."google_auth_attempts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."account_merges" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."account_claim_links", public."google_auth_attempts", public."account_merges" FROM PUBLIC, anon, authenticated, service_role;

-- Middleware may read only the alias edge using its server credential; proof/audit remain private.
GRANT SELECT (source_user_id, target_user_id) ON TABLE public."account_merges" TO service_role;

COMMIT;