ALTER TABLE "voucher_package_menu_item_scopes"
  ADD COLUMN "size" "Size",
  ADD COLUMN "matcha_powder_id" UUID,
  ADD COLUMN "milk_type_id" UUID,
  ADD COLUMN "covered_price_vnd" INTEGER;

ALTER TABLE "voucher_menu_item_scopes"
  ADD COLUMN "size" "Size",
  ADD COLUMN "matcha_powder_id" UUID,
  ADD COLUMN "milk_type_id" UUID,
  ADD COLUMN "covered_price_vnd" INTEGER;

CREATE TABLE "voucher_package_addon_option_scopes" (
  "voucher_package_id" UUID NOT NULL,
  "addon_option_id" UUID NOT NULL,
  CONSTRAINT "voucher_package_addon_option_scopes_pkey"
    PRIMARY KEY ("voucher_package_id", "addon_option_id"),
  CONSTRAINT "voucher_package_addon_option_scopes_voucher_package_id_fkey"
    FOREIGN KEY ("voucher_package_id") REFERENCES "voucher_packages"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "voucher_package_addon_option_scopes_addon_option_id_fkey"
    FOREIGN KEY ("addon_option_id") REFERENCES "addon_options"("id")
    ON DELETE NO ACTION ON UPDATE NO ACTION
);

CREATE INDEX "voucher_package_addon_option_scopes_addon_option_id_idx"
  ON "voucher_package_addon_option_scopes"("addon_option_id");

CREATE TABLE "voucher_addon_option_scopes" (
  "voucher_id" UUID NOT NULL,
  "addon_option_id" UUID NOT NULL,
  CONSTRAINT "voucher_addon_option_scopes_pkey"
    PRIMARY KEY ("voucher_id", "addon_option_id"),
  CONSTRAINT "voucher_addon_option_scopes_voucher_id_fkey"
    FOREIGN KEY ("voucher_id") REFERENCES "vouchers"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "voucher_addon_option_scopes_addon_option_id_fkey"
    FOREIGN KEY ("addon_option_id") REFERENCES "addon_options"("id")
    ON DELETE NO ACTION ON UPDATE NO ACTION
);

CREATE INDEX "voucher_addon_option_scopes_addon_option_id_idx"
  ON "voucher_addon_option_scopes"("addon_option_id");

ALTER TABLE public."voucher_package_addon_option_scopes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."voucher_addon_option_scopes" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."voucher_package_addon_option_scopes"
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON TABLE public."voucher_addon_option_scopes"
  FROM PUBLIC, anon, authenticated, service_role;

INSERT INTO "voucher_package_menu_item_scopes"
  ("voucher_package_id", "menu_item_id", "size", "matcha_powder_id", "milk_type_id", "covered_price_vnd")
SELECT "id", "menu_item_id",
  CASE WHEN "voucher_type" = 'PRODUCT' THEN "size" ELSE NULL END,
  CASE WHEN "voucher_type" = 'PRODUCT' THEN "matcha_powder_id" ELSE NULL END,
  CASE WHEN "voucher_type" = 'PRODUCT' THEN "milk_type_id" ELSE NULL END,
  CASE WHEN "voucher_type" = 'PRODUCT' THEN "covered_price_vnd" ELSE NULL END
FROM "voucher_packages"
WHERE "voucher_type" IN ('PRODUCT', 'ITEM', 'PRODUCT_DISCOUNT')
  AND "menu_item_id" IS NOT NULL
ON CONFLICT ("voucher_package_id", "menu_item_id") DO UPDATE SET
  "size" = EXCLUDED."size",
  "matcha_powder_id" = EXCLUDED."matcha_powder_id",
  "milk_type_id" = EXCLUDED."milk_type_id",
  "covered_price_vnd" = EXCLUDED."covered_price_vnd";

INSERT INTO "voucher_menu_item_scopes"
  ("voucher_id", "menu_item_id", "size", "matcha_powder_id", "milk_type_id", "covered_price_vnd")
SELECT "id", "menu_item_id",
  CASE WHEN "voucher_type" = 'PRODUCT' THEN "size" ELSE NULL END,
  CASE WHEN "voucher_type" = 'PRODUCT' THEN "matcha_powder_id" ELSE NULL END,
  CASE WHEN "voucher_type" = 'PRODUCT' THEN "milk_type_id" ELSE NULL END,
  CASE WHEN "voucher_type" = 'PRODUCT' THEN "covered_price_vnd" ELSE NULL END
FROM "vouchers"
WHERE "voucher_type" IN ('PRODUCT', 'ITEM', 'PRODUCT_DISCOUNT')
  AND "menu_item_id" IS NOT NULL
ON CONFLICT ("voucher_id", "menu_item_id") DO UPDATE SET
  "size" = EXCLUDED."size",
  "matcha_powder_id" = EXCLUDED."matcha_powder_id",
  "milk_type_id" = EXCLUDED."milk_type_id",
  "covered_price_vnd" = EXCLUDED."covered_price_vnd";

INSERT INTO "voucher_package_addon_option_scopes" ("voucher_package_id", "addon_option_id")
SELECT "id", "addon_option_id" FROM "voucher_packages"
WHERE "voucher_type" = 'ADDON' AND "addon_option_id" IS NOT NULL;

INSERT INTO "voucher_addon_option_scopes" ("voucher_id", "addon_option_id")
SELECT "id", "addon_option_id" FROM "vouchers"
WHERE "voucher_type" = 'ADDON' AND "addon_option_id" IS NOT NULL;
