-- Make VoucherPackage the only campaign/template aggregate. Promotion tables are known empty.
BEGIN;

ALTER TABLE "voucher_packages"
  ADD COLUMN "ends_at" TIMESTAMPTZ(6);

ALTER TYPE "PromotionScopeRole" RENAME TO "BundleScopeRole";
ALTER TYPE "PromotionApplicationStatus" RENAME TO "BundleApplicationStatus";

CREATE TABLE "voucher_bundle_rules" (
  "package_id" UUID NOT NULL,
  "buy_quantity" INTEGER NOT NULL,
  "reward_quantity" INTEGER NOT NULL,
  "reward_kind" "BundleRewardKind" NOT NULL,
  "reward_mode" "BundleRewardMode" NOT NULL,
  "benefit_scaling" "BundleBenefitScaling" NOT NULL DEFAULT 'PER_BUNDLE',
  "max_applications_order" INTEGER NOT NULL DEFAULT 1,
  "max_reward_units_order" INTEGER,
  CONSTRAINT "voucher_bundle_rules_pkey" PRIMARY KEY ("package_id"),
  CONSTRAINT "voucher_bundle_rules_positive_values" CHECK (
    "buy_quantity" > 0
    AND "reward_quantity" > 0
    AND "max_applications_order" > 0
    AND ("max_reward_units_order" IS NULL OR "max_reward_units_order" > 0)
  )
);

CREATE TABLE "voucher_bundle_product_scopes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "package_id" UUID NOT NULL,
  "role" "BundleScopeRole" NOT NULL,
  "menu_item_id" UUID NOT NULL,
  "size" "Size",
  "matcha_powder_id" UUID,
  "milk_type_id" UUID,
  "reference_price_vnd" INTEGER,
  CONSTRAINT "voucher_bundle_product_scopes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "voucher_bundle_product_scopes_nonnegative_credit" CHECK (
    "reference_price_vnd" IS NULL OR "reference_price_vnd" >= 0
  )
);

CREATE TABLE "voucher_bundle_addon_rewards" (
  "package_id" UUID NOT NULL,
  "addon_option_id" UUID NOT NULL,
  CONSTRAINT "voucher_bundle_addon_rewards_pkey"
    PRIMARY KEY ("package_id", "addon_option_id")
);

CREATE TABLE "order_bundle_applications" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "order_id" UUID NOT NULL,
  "voucher_id" UUID NOT NULL,
  "application_count" INTEGER NOT NULL,
  "status" "BundleApplicationStatus" NOT NULL DEFAULT 'RESERVED',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "order_bundle_applications_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "order_bundle_applications_positive_count" CHECK ("application_count" > 0)
);

CREATE TABLE "order_bundle_rewards" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "application_id" UUID NOT NULL,
  "order_item_id" UUID,
  "order_item_addon_id" UUID,
  "quantity" INTEGER NOT NULL,
  "discount_vnd" INTEGER NOT NULL,
  CONSTRAINT "order_bundle_rewards_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "order_bundle_rewards_exactly_one_target"
    CHECK (num_nonnulls("order_item_id", "order_item_addon_id") = 1),
  CONSTRAINT "order_bundle_rewards_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "order_bundle_rewards_discount_check" CHECK ("discount_vnd" >= 0)
);

CREATE UNIQUE INDEX "voucher_bundle_product_scopes_package_id_role_menu_item_id_size_matcha_powder_id_milk_type_id_key"
  ON "voucher_bundle_product_scopes"("package_id", "role", "menu_item_id", "size", "matcha_powder_id", "milk_type_id");
CREATE INDEX "voucher_bundle_product_scopes_package_id_role_idx"
  ON "voucher_bundle_product_scopes"("package_id", "role");
CREATE INDEX "voucher_bundle_product_scopes_menu_item_id_idx"
  ON "voucher_bundle_product_scopes"("menu_item_id");
CREATE INDEX "voucher_bundle_product_scopes_matcha_powder_id_idx"
  ON "voucher_bundle_product_scopes"("matcha_powder_id");
CREATE INDEX "voucher_bundle_product_scopes_milk_type_id_idx"
  ON "voucher_bundle_product_scopes"("milk_type_id");
CREATE INDEX "voucher_bundle_addon_rewards_addon_option_id_idx"
  ON "voucher_bundle_addon_rewards"("addon_option_id");
CREATE UNIQUE INDEX "order_bundle_applications_order_id_key"
  ON "order_bundle_applications"("order_id");
CREATE UNIQUE INDEX "order_bundle_applications_voucher_id_key"
  ON "order_bundle_applications"("voucher_id");
CREATE INDEX "order_bundle_applications_status_idx"
  ON "order_bundle_applications"("status");
CREATE INDEX "order_bundle_rewards_application_id_idx"
  ON "order_bundle_rewards"("application_id");
CREATE INDEX "order_bundle_rewards_order_item_id_idx"
  ON "order_bundle_rewards"("order_item_id");
CREATE INDEX "order_bundle_rewards_order_item_addon_id_idx"
  ON "order_bundle_rewards"("order_item_addon_id");

ALTER TABLE "voucher_bundle_rules" ADD CONSTRAINT "voucher_bundle_rules_package_id_fkey"
  FOREIGN KEY ("package_id") REFERENCES "voucher_packages"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "voucher_bundle_product_scopes" ADD CONSTRAINT "voucher_bundle_product_scopes_package_id_fkey"
  FOREIGN KEY ("package_id") REFERENCES "voucher_bundle_rules"("package_id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "voucher_bundle_product_scopes" ADD CONSTRAINT "voucher_bundle_product_scopes_menu_item_id_fkey"
  FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "voucher_bundle_product_scopes" ADD CONSTRAINT "voucher_bundle_product_scopes_matcha_powder_id_fkey"
  FOREIGN KEY ("matcha_powder_id") REFERENCES "matcha_powder"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "voucher_bundle_product_scopes" ADD CONSTRAINT "voucher_bundle_product_scopes_milk_type_id_fkey"
  FOREIGN KEY ("milk_type_id") REFERENCES "milk_type"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "voucher_bundle_addon_rewards" ADD CONSTRAINT "voucher_bundle_addon_rewards_package_id_fkey"
  FOREIGN KEY ("package_id") REFERENCES "voucher_bundle_rules"("package_id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "voucher_bundle_addon_rewards" ADD CONSTRAINT "voucher_bundle_addon_rewards_addon_option_id_fkey"
  FOREIGN KEY ("addon_option_id") REFERENCES "addon_options"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "order_bundle_applications" ADD CONSTRAINT "order_bundle_applications_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "order_bundle_applications" ADD CONSTRAINT "order_bundle_applications_voucher_id_fkey"
  FOREIGN KEY ("voucher_id") REFERENCES "vouchers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "order_bundle_rewards" ADD CONSTRAINT "order_bundle_rewards_application_id_fkey"
  FOREIGN KEY ("application_id") REFERENCES "order_bundle_applications"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "order_bundle_rewards" ADD CONSTRAINT "order_bundle_rewards_order_item_id_fkey"
  FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "order_bundle_rewards" ADD CONSTRAINT "order_bundle_rewards_order_item_addon_id_fkey"
  FOREIGN KEY ("order_item_addon_id") REFERENCES "order_item_addons"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE public."voucher_bundle_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."voucher_bundle_product_scopes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."voucher_bundle_addon_rewards" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."order_bundle_applications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."order_bundle_rewards" ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public."voucher_bundle_rules" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON TABLE public."voucher_bundle_product_scopes" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON TABLE public."voucher_bundle_addon_rewards" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON TABLE public."order_bundle_applications" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON TABLE public."order_bundle_rewards" FROM PUBLIC, anon, authenticated, service_role;

DROP TABLE "order_promotion_rewards";
DROP TABLE "order_promotion_applications";
DROP TABLE "promotion_addon_rewards";
DROP TABLE "promotion_product_scopes";
DROP TABLE "promotion_bundle_rules";
DROP TABLE "promotions";

COMMIT;
