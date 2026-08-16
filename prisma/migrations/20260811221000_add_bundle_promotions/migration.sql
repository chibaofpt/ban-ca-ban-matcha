-- Add immutable BUY X GET Y promotion rules and idempotent voucher issuance.
BEGIN;

ALTER TYPE "VoucherType" ADD VALUE 'BUNDLE';
CREATE TYPE "VoucherAcquisitionMode" AS ENUM ('POINTS_EXCHANGE', 'FREE_CLAIM', 'AUTO_GRANT');
CREATE TYPE "BundleRewardKind" AS ENUM ('PRODUCT', 'ADDON');
CREATE TYPE "BundleRewardMode" AS ENUM ('SAME_CONFIG', 'FIXED_CONFIG', 'ALLOWED_SCOPE');
CREATE TYPE "BundleBenefitScaling" AS ENUM ('PER_BUNDLE', 'ONCE_PER_ORDER', 'PER_QUALIFYING_ITEM');
CREATE TYPE "PromotionScopeRole" AS ENUM ('QUALIFIER', 'REWARD');
CREATE TYPE "PromotionApplicationStatus" AS ENUM ('RESERVED', 'REDEEMED', 'CANCELLED');

ALTER TABLE "voucher_packages"
  ADD COLUMN "acquisition_mode" "VoucherAcquisitionMode" NOT NULL DEFAULT 'POINTS_EXCHANGE';
ALTER TABLE "vouchers"
  ADD COLUMN "issued_via" "VoucherAcquisitionMode" NOT NULL DEFAULT 'POINTS_EXCHANGE';
ALTER TABLE "promotions"
  ALTER COLUMN "max_redemptions" DROP NOT NULL,
  ADD COLUMN "published_at" TIMESTAMPTZ(6),
  ADD COLUMN "voucher_package_id" UUID;

CREATE TABLE "promotion_bundle_rules" (
  "promotion_id" UUID NOT NULL,
  "buy_quantity" INTEGER NOT NULL,
  "reward_quantity" INTEGER NOT NULL,
  "reward_kind" "BundleRewardKind" NOT NULL,
  "reward_mode" "BundleRewardMode" NOT NULL,
  "benefit_scaling" "BundleBenefitScaling" NOT NULL DEFAULT 'PER_BUNDLE',
  "max_applications_order" INTEGER NOT NULL DEFAULT 1,
  "max_reward_units_order" INTEGER,
  "include_addons" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "promotion_bundle_rules_pkey" PRIMARY KEY ("promotion_id"),
  CONSTRAINT "promotion_bundle_rules_positive_quantities" CHECK (
    "buy_quantity" > 0 AND "reward_quantity" > 0 AND "max_applications_order" > 0
    AND ("max_reward_units_order" IS NULL OR "max_reward_units_order" > 0)
  )
);

CREATE TABLE "promotion_product_scopes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "promotion_id" UUID NOT NULL,
  "role" "PromotionScopeRole" NOT NULL,
  "menu_item_id" UUID NOT NULL,
  "size" "Size",
  "matcha_powder_id" UUID,
  "milk_type_id" UUID,
  "reference_price_vnd" INTEGER,
  CONSTRAINT "promotion_product_scopes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "promotion_product_scopes_nonnegative_credit" CHECK (
    "reference_price_vnd" IS NULL OR "reference_price_vnd" >= 0
  )
);

CREATE TABLE "promotion_addon_rewards" (
  "promotion_id" UUID NOT NULL,
  "addon_option_id" UUID NOT NULL,
  CONSTRAINT "promotion_addon_rewards_pkey" PRIMARY KEY ("promotion_id", "addon_option_id")
);

CREATE TABLE "voucher_grants" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "package_id" UUID NOT NULL,
  "voucher_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "voucher_grants_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "order_promotion_applications" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "order_id" UUID NOT NULL,
  "voucher_id" UUID NOT NULL,
  "promotion_id" UUID NOT NULL,
  "application_count" INTEGER NOT NULL,
  "status" "PromotionApplicationStatus" NOT NULL DEFAULT 'RESERVED',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "order_promotion_applications_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "order_promotion_applications_positive_count" CHECK ("application_count" > 0)
);

CREATE TABLE "order_promotion_rewards" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "application_id" UUID NOT NULL,
  "order_item_id" UUID,
  "order_item_addon_id" UUID,
  "quantity" INTEGER NOT NULL,
  "discount_vnd" INTEGER NOT NULL,
  CONSTRAINT "order_promotion_rewards_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "order_promotion_rewards_exactly_one_target"
    CHECK (num_nonnulls("order_item_id", "order_item_addon_id") = 1),
  CONSTRAINT "order_promotion_rewards_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "order_promotion_rewards_discount_check" CHECK ("discount_vnd" >= 0)
);

CREATE UNIQUE INDEX "promotions_voucher_package_id_key"
  ON "promotions"("voucher_package_id");
CREATE UNIQUE INDEX "promotion_product_scopes_promotion_id_role_menu_item_id_size_matcha_powder_id_milk_type_id_key"
  ON "promotion_product_scopes"("promotion_id", "role", "menu_item_id", "size", "matcha_powder_id", "milk_type_id");
CREATE INDEX "promotion_product_scopes_promotion_id_role_idx"
  ON "promotion_product_scopes"("promotion_id", "role");
CREATE UNIQUE INDEX "voucher_grants_voucher_id_key" ON "voucher_grants"("voucher_id");
CREATE UNIQUE INDEX "voucher_grants_user_id_package_id_key"
  ON "voucher_grants"("user_id", "package_id");
CREATE INDEX "voucher_grants_package_id_idx" ON "voucher_grants"("package_id");
CREATE UNIQUE INDEX "order_promotion_applications_order_id_key"
  ON "order_promotion_applications"("order_id");
CREATE UNIQUE INDEX "order_promotion_applications_voucher_id_key"
  ON "order_promotion_applications"("voucher_id");
CREATE INDEX "order_promotion_applications_promotion_id_status_idx"
  ON "order_promotion_applications"("promotion_id", "status");
CREATE INDEX "order_promotion_rewards_application_id_idx"
  ON "order_promotion_rewards"("application_id");

ALTER TABLE "promotions" ADD CONSTRAINT "promotions_voucher_package_id_fkey"
  FOREIGN KEY ("voucher_package_id") REFERENCES "voucher_packages"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_valid_window"
  CHECK ("starts_at" < "ends_at");
ALTER TABLE "promotion_bundle_rules" ADD CONSTRAINT "promotion_bundle_rules_promotion_id_fkey"
  FOREIGN KEY ("promotion_id") REFERENCES "promotions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "promotion_product_scopes" ADD CONSTRAINT "promotion_product_scopes_promotion_id_fkey"
  FOREIGN KEY ("promotion_id") REFERENCES "promotion_bundle_rules"("promotion_id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "promotion_product_scopes" ADD CONSTRAINT "promotion_product_scopes_menu_item_id_fkey"
  FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "promotion_product_scopes" ADD CONSTRAINT "promotion_product_scopes_matcha_powder_id_fkey"
  FOREIGN KEY ("matcha_powder_id") REFERENCES "matcha_powder"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "promotion_product_scopes" ADD CONSTRAINT "promotion_product_scopes_milk_type_id_fkey"
  FOREIGN KEY ("milk_type_id") REFERENCES "milk_type"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "promotion_addon_rewards" ADD CONSTRAINT "promotion_addon_rewards_promotion_id_fkey"
  FOREIGN KEY ("promotion_id") REFERENCES "promotion_bundle_rules"("promotion_id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "promotion_addon_rewards" ADD CONSTRAINT "promotion_addon_rewards_addon_option_id_fkey"
  FOREIGN KEY ("addon_option_id") REFERENCES "addon_options"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "voucher_grants" ADD CONSTRAINT "voucher_grants_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "voucher_grants" ADD CONSTRAINT "voucher_grants_package_id_fkey"
  FOREIGN KEY ("package_id") REFERENCES "voucher_packages"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "voucher_grants" ADD CONSTRAINT "voucher_grants_voucher_id_fkey"
  FOREIGN KEY ("voucher_id") REFERENCES "vouchers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "order_promotion_applications" ADD CONSTRAINT "order_promotion_applications_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "order_promotion_applications" ADD CONSTRAINT "order_promotion_applications_voucher_id_fkey"
  FOREIGN KEY ("voucher_id") REFERENCES "vouchers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "order_promotion_applications" ADD CONSTRAINT "order_promotion_applications_promotion_id_fkey"
  FOREIGN KEY ("promotion_id") REFERENCES "promotions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "order_promotion_rewards" ADD CONSTRAINT "order_promotion_rewards_application_id_fkey"
  FOREIGN KEY ("application_id") REFERENCES "order_promotion_applications"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "order_promotion_rewards" ADD CONSTRAINT "order_promotion_rewards_order_item_id_fkey"
  FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "order_promotion_rewards" ADD CONSTRAINT "order_promotion_rewards_order_item_addon_id_fkey"
  FOREIGN KEY ("order_item_addon_id") REFERENCES "order_item_addons"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE public."promotion_bundle_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."promotion_product_scopes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."promotion_addon_rewards" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."voucher_grants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."order_promotion_applications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."order_promotion_rewards" ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public."promotion_bundle_rules" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON TABLE public."promotion_product_scopes" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON TABLE public."promotion_addon_rewards" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON TABLE public."voucher_grants" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON TABLE public."order_promotion_applications" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON TABLE public."order_promotion_rewards" FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
