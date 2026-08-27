-- Add option-level lifecycle so referenced options can be retired without hard deletion.
ALTER TABLE "addon_options"
ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true;

-- Retire the two legacy sentinel options. Absence now means "no addon".
UPDATE "addon_options" AS ao
SET "is_active" = false,
    "is_default" = false
FROM "addon_groups" AS ag
WHERE ag."id" = ao."addon_group_id"
  AND (
    (ag."name" = 'Kem' AND ao."label" = 'Không kem')
    OR (ag."name" = 'Extra Matcha' AND ao."gram_value" = 0)
  );

-- Every addon is opt-in during phase 1. The deprecated columns are dropped in phase 2.
UPDATE "addon_groups"
SET "is_required" = false,
    "min_quantity" = NULL;

UPDATE "addon_options"
SET "is_default" = false;

-- Remove zero-value order rows only when no addon voucher was ever linked to them.
DELETE FROM "order_item_addons" AS oia
USING "addon_options" AS ao, "addon_groups" AS ag
WHERE oia."addon_option_id" = ao."id"
  AND ao."addon_group_id" = ag."id"
  AND oia."unit_price_vnd" = 0
  AND (
    (ag."name" = 'Kem' AND ao."label" = 'Không kem')
    OR (ag."name" = 'Extra Matcha' AND ao."gram_value" = 0)
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "order_item_addon_vouchers" AS oiav
    WHERE oiav."order_item_id" = oia."order_item_id"
      AND oiav."addon_option_id" = oia."addon_option_id"
  );

-- This invalid package is inactive, targets dynamic Extra Matcha, and has never issued a voucher.
DELETE FROM "voucher_packages" AS vp
USING "addon_options" AS ao, "addon_groups" AS ag
WHERE vp."addon_option_id" = ao."id"
  AND ao."addon_group_id" = ag."id"
  AND vp."voucher_type" = 'ADDON'
  AND vp."is_active" = false
  AND ag."name" = 'Extra Matcha'
  AND ao."gram_value" = 0
  AND NOT EXISTS (
    SELECT 1 FROM "vouchers" AS v WHERE v."package_id" = vp."id"
  );
