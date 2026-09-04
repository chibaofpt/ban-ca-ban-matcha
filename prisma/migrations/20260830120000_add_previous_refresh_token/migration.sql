-- Retain one rotated refresh token briefly so concurrent requests converge on
-- the same stable session without creating a replacement session row.
ALTER TABLE "sessions" ADD COLUMN "previous_refresh_token" TEXT;

CREATE UNIQUE INDEX "sessions_previous_refresh_token_key"
ON "sessions"("previous_refresh_token");
