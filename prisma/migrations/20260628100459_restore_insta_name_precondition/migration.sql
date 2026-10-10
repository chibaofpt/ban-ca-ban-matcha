-- Compatibility prerequisite for fresh/shadow replay of the historical DROP.
-- Added in October 2026; the directory sorts before 20260628100500 intentionally.
-- Existing databases that already applied that history retain their column/data:
-- this pending migration only adds the column when it is absent.
-- Keep all applied migration files and ledger entries unchanged.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "insta_name" TEXT;
