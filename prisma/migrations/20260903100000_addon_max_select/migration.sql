-- Add new columns with defaults
ALTER TABLE "addon_groups" ADD COLUMN "max_select" INT NOT NULL DEFAULT 1;
ALTER TABLE "addon_groups" ADD COLUMN "is_dynamic_gram" BOOLEAN NOT NULL DEFAULT false;

-- Preserve the old QUANTITY capacity as the maximum number of distinct options.
-- SELECTOR and TOGGLE groups remain single-select.
UPDATE "addon_groups"
SET "max_select" = CASE
  WHEN "type" = 'QUANTITY' THEN GREATEST(COALESCE("max_quantity", 1), 1)
  ELSE 1
END;

-- Backfill is_dynamic_gram for Extra Matcha groups
-- (groups where ALL active options have gram_value set)
UPDATE "addon_groups"
SET "is_dynamic_gram" = true,
    "max_select" = 1
WHERE "type" = 'SELECTOR'
  AND NOT EXISTS (
    SELECT 1 FROM "addon_options"
    WHERE "addon_options"."addon_group_id" = "addon_groups"."id"
      AND "addon_options"."is_active" = true
      AND "addon_options"."gram_value" IS NULL
  )
  AND EXISTS (
    SELECT 1 FROM "addon_options"
    WHERE "addon_options"."addon_group_id" = "addon_groups"."id"
      AND "addon_options"."is_active" = true
  );

-- Drop type column and enum
ALTER TABLE "addon_groups" DROP COLUMN "type";
DROP TYPE "AddonType";
