-- Repair the historical add/drop ordering without changing applied migrations.
-- Existing databases may be missing the column; fresh databases may already have it.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "insta_name" TEXT;

-- Login lookups require one normalized Instagram username per account.
CREATE UNIQUE INDEX IF NOT EXISTS "users_insta_name_key" ON "users"("insta_name");
