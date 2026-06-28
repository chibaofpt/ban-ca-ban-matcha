-- CreateEnum
CREATE TYPE "Role" AS ENUM ('CUSTOMER', 'STAFF', 'ADMIN');

-- CreateEnum
CREATE TYPE "VoucherType" AS ENUM ('DISCOUNT', 'PRODUCT', 'ADDON', 'FREESHIP');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('PERCENT', 'FIXED');

-- CreateEnum
CREATE TYPE "VoucherStatus" AS ENUM ('ACTIVE', 'RESERVED', 'REDEEMED', 'EXPIRED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "UsedChannel" AS ENUM ('ONLINE', 'OFFLINE');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'ADMIN_CONFIRMED', 'STAFF_DONE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('COUNTER', 'PICKUP', 'DELIVERY');

-- CreateEnum
CREATE TYPE "AddonType" AS ENUM ('SELECTOR', 'TOGGLE', 'QUANTITY');

-- CreateEnum
CREATE TYPE "SweetnessLevel" AS ENUM ('NONE', 'QUARTER', 'HALF', 'THREE_QUARTER', 'FULL', 'EXTRA');

-- CreateEnum
CREATE TYPE "Size" AS ENUM ('M', 'L', 'XL');

-- CreateEnum
CREATE TYPE "IceOption" AS ENUM ('NORMAL', 'LESS_ICE', 'NO_ICE', 'SEPARATE_ICE');

-- CreateEnum
CREATE TYPE "PowderType" AS ENUM ('RECOMMEND', 'NEW', 'SEASONAL', 'NONE');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'CUSTOMER',
    "points_balance" INTEGER NOT NULL DEFAULT 0,
    "qr_token" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "otp_enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "refresh_token" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rotating_at" TIMESTAMPTZ(6),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "addresses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "full_address" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "receiver_name" TEXT NOT NULL,
    "receiver_phone" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "distance_km" DOUBLE PRECISION,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otp_attempts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "phone_number" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voucher_packages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "description" TEXT,
    "voucher_type" "VoucherType" NOT NULL,
    "points_cost" INTEGER NOT NULL,
    "discount_type" "DiscountType",
    "discount_value" INTEGER,
    "menu_item_id" UUID,
    "size" "Size",
    "matcha_powder_id" UUID,
    "milk_type_id" UUID,
    "included_addon_option_ids" TEXT[],
    "addon_option_id" UUID,
    "covered_price_vnd" INTEGER,
    "covered_delivery_fee_vnd" INTEGER,
    "min_order_vnd" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "expires_after_days" INTEGER,
    "quantity" INTEGER,
    "max_per_user" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "voucher_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vouchers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "package_id" UUID NOT NULL,
    "qr_token" TEXT NOT NULL DEFAULT (gen_random_uuid())::text,
    "voucher_type" "VoucherType" NOT NULL,
    "discount_type" "DiscountType",
    "discount_value" INTEGER,
    "menu_item_id" UUID,
    "size" "Size",
    "matcha_powder_id" UUID,
    "milk_type_id" UUID,
    "included_addon_option_ids" TEXT[],
    "addon_option_id" UUID,
    "covered_price_vnd" INTEGER,
    "covered_delivery_fee_vnd" INTEGER,
    "min_order_vnd" INTEGER,
    "status" "VoucherStatus" NOT NULL DEFAULT 'ACTIVE',
    "used_channel" "UsedChannel",
    "expires_at" TIMESTAMPTZ(6),
    "redeemed_at" TIMESTAMPTZ(6),
    "redeemed_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vouchers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "points_log" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "performed_by" UUID,
    "reversed_log_id" UUID,
    "order_id" UUID,
    "voucher_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "points_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "title" TEXT NOT NULL,
    "description" TEXT,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "max_redemptions" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promotions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "image_url" TEXT,
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_seasonal" BOOLEAN NOT NULL DEFAULT false,
    "matcha_powder_id" UUID,
    "default_powder_id" UUID,
    "custom_powder_grams" JSONB,
    "base_liquid_note" TEXT,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "menu_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "addon_groups" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "AddonType" NOT NULL,
    "is_required" BOOLEAN NOT NULL,
    "min_quantity" INTEGER,
    "max_quantity" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "addon_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "addon_options" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "addon_group_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "price_vnd" INTEGER NOT NULL DEFAULT 0,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "gram_value" DECIMAL,

    CONSTRAINT "addon_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_item_sizes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "menu_item_id" UUID NOT NULL,
    "size" "Size" NOT NULL,
    "base_price_vnd" INTEGER,

    CONSTRAINT "menu_item_sizes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "order_type" "OrderType" NOT NULL DEFAULT 'COUNTER',
    "order_code" TEXT,
    "subtotal_vnd" INTEGER NOT NULL,
    "total_voucher_discount_vnd" INTEGER NOT NULL DEFAULT 0,
    "total_vnd" INTEGER NOT NULL,
    "points_earned" INTEGER,
    "pickup_time" TIMESTAMPTZ(6),
    "note" TEXT,
    "payment_confirmed_at" TIMESTAMPTZ(6),
    "payment_confirmed_by" UUID,
    "auto_cancel_at" TIMESTAMPTZ(6),
    "address_id" UUID,
    "delivery_address" TEXT,
    "delivery_lat" DOUBLE PRECISION,
    "delivery_lng" DOUBLE PRECISION,
    "delivery_distance_km" DOUBLE PRECISION,
    "delivery_receiver_name" TEXT,
    "delivery_receiver_phone" TEXT,
    "shipping_fee_vnd" INTEGER NOT NULL DEFAULT 0,
    "freeship_discount_vnd" INTEGER NOT NULL DEFAULT 0,
    "grand_total_vnd" INTEGER NOT NULL DEFAULT 0,
    "freeship_voucher_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "handled_by" UUID,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "menu_item_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price_vnd" INTEGER NOT NULL,
    "addons_price_vnd" INTEGER NOT NULL DEFAULT 0,
    "product_voucher_discount_vnd" INTEGER NOT NULL DEFAULT 0,
    "total_discount_vnd" INTEGER NOT NULL DEFAULT 0,
    "product_voucher_id" UUID,
    "surplus_points" INTEGER,
    "note" TEXT,
    "sweetness" "SweetnessLevel" NOT NULL DEFAULT 'FULL',
    "size" "Size" NOT NULL,
    "selected_powder_id" UUID,
    "selected_milk_type_id" UUID,
    "ice_option" "IceOption" NOT NULL DEFAULT 'NORMAL',
    "coldwhisk" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_item_addons" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_item_id" UUID NOT NULL,
    "addon_option_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price_vnd" INTEGER NOT NULL,

    CONSTRAINT "order_item_addons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_discount_vouchers" (
    "order_id" UUID NOT NULL,
    "voucher_id" UUID NOT NULL,
    "discount_applied_vnd" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "order_discount_vouchers_pkey" PRIMARY KEY ("order_id","voucher_id")
);

-- CreateTable
CREATE TABLE "order_item_addon_vouchers" (
    "order_item_id" UUID NOT NULL,
    "voucher_id" UUID NOT NULL,
    "addon_option_id" UUID NOT NULL,
    "discount_applied_vnd" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "order_item_addon_vouchers_pkey" PRIMARY KEY ("order_item_id","voucher_id")
);

-- CreateTable
CREATE TABLE "matcha_powder" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "manufacturer" TEXT,
    "description" TEXT,
    "price_per_gram" INTEGER NOT NULL,
    "type" "PowderType" NOT NULL DEFAULT 'NONE',
    "reference_latte_item_id" UUID,
    "fragrance" INTEGER,
    "body" INTEGER,
    "bitterness" INTEGER,
    "umami" INTEGER,
    "color" INTEGER,
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "matcha_powder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "milk_type" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "price_per_ml" INTEGER NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "milk_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "default_size_config" (
    "size" "Size" NOT NULL,
    "milk_ml" INTEGER NOT NULL,
    "powder_gram" DECIMAL NOT NULL,

    CONSTRAINT "default_size_config_pkey" PRIMARY KEY ("size")
);

-- CreateTable
CREATE TABLE "powder_size_config" (
    "powder_id" UUID NOT NULL,
    "size" "Size" NOT NULL,
    "grams" DECIMAL NOT NULL,

    CONSTRAINT "powder_size_config_pkey" PRIMARY KEY ("powder_id","size")
);

-- CreateTable
CREATE TABLE "fusion_allowed_powder" (
    "menu_item_id" UUID NOT NULL,
    "powder_id" UUID NOT NULL,

    CONSTRAINT "fusion_allowed_powder_pkey" PRIMARY KEY ("menu_item_id","powder_id")
);

-- CreateTable
CREATE TABLE "store_schedule" (
    "id" TEXT NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "slot" INTEGER NOT NULL,
    "open_time" TEXT NOT NULL,
    "close_time" TEXT NOT NULL,

    CONSTRAINT "store_schedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_temporary_closure" (
    "id" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "closed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "opened_at" TIMESTAMP(3),

    CONSTRAINT "store_temporary_closure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_logs" (
    "id" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'error',
    "source" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "stack" TEXT,
    "context" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_subscriptions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_number_key" ON "users"("phone_number");

-- CreateIndex
CREATE UNIQUE INDEX "users_qr_token_key" ON "users"("qr_token");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_refresh_token_key" ON "sessions"("refresh_token");

-- CreateIndex
CREATE INDEX "idx_sessions_refresh_token" ON "sessions"("refresh_token");

-- CreateIndex
CREATE INDEX "idx_sessions_user_id" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "addresses_user_id_idx" ON "addresses"("user_id");

-- CreateIndex
CREATE INDEX "idx_otp_attempts_phone" ON "otp_attempts"("phone_number");

-- CreateIndex
CREATE UNIQUE INDEX "vouchers_qr_token_key" ON "vouchers"("qr_token");

-- CreateIndex
CREATE INDEX "idx_vouchers_qr_token" ON "vouchers"("qr_token");

-- CreateIndex
CREATE INDEX "idx_vouchers_status" ON "vouchers"("status");

-- CreateIndex
CREATE INDEX "idx_vouchers_user_id" ON "vouchers"("user_id");

-- CreateIndex
CREATE INDEX "idx_points_log_created_at" ON "points_log"("created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_points_log_user_id" ON "points_log"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "menu_items_matcha_powder_id_key" ON "menu_items"("matcha_powder_id");

-- CreateIndex
CREATE INDEX "idx_menu_items_category" ON "menu_items"("category");

-- CreateIndex
CREATE INDEX "idx_menu_items_is_available" ON "menu_items"("is_available");

-- CreateIndex
CREATE INDEX "idx_menu_item_sizes_menu_item_id" ON "menu_item_sizes"("menu_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "menu_item_sizes_menu_item_id_size_key" ON "menu_item_sizes"("menu_item_id", "size");

-- CreateIndex
CREATE UNIQUE INDEX "orders_order_code_key" ON "orders"("order_code");

-- CreateIndex
CREATE INDEX "idx_orders_created_at" ON "orders"("created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_orders_status" ON "orders"("status");

-- CreateIndex
CREATE INDEX "idx_orders_user_id" ON "orders"("user_id");

-- CreateIndex
CREATE INDEX "idx_orders_order_type" ON "orders"("order_type");

-- CreateIndex
CREATE INDEX "idx_orders_auto_cancel_at" ON "orders"("auto_cancel_at");

-- CreateIndex
CREATE INDEX "idx_order_items_order_id" ON "order_items"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "matcha_powder_reference_latte_item_id_key" ON "matcha_powder"("reference_latte_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "store_schedule_day_of_week_slot_key" ON "store_schedule"("day_of_week", "slot");

-- CreateIndex
CREATE INDEX "idx_system_logs_created_at" ON "system_logs"("created_at" DESC);

-- CreateIndex
CREATE INDEX "push_subscriptions_user_id_idx" ON "push_subscriptions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_user_id_endpoint_key" ON "push_subscriptions"("user_id", "endpoint");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voucher_packages" ADD CONSTRAINT "voucher_packages_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "voucher_packages" ADD CONSTRAINT "voucher_packages_matcha_powder_id_fkey" FOREIGN KEY ("matcha_powder_id") REFERENCES "matcha_powder"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "voucher_packages" ADD CONSTRAINT "voucher_packages_milk_type_id_fkey" FOREIGN KEY ("milk_type_id") REFERENCES "milk_type"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "voucher_packages" ADD CONSTRAINT "voucher_packages_addon_option_id_fkey" FOREIGN KEY ("addon_option_id") REFERENCES "addon_options"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_matcha_powder_id_fkey" FOREIGN KEY ("matcha_powder_id") REFERENCES "matcha_powder"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_milk_type_id_fkey" FOREIGN KEY ("milk_type_id") REFERENCES "milk_type"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_addon_option_id_fkey" FOREIGN KEY ("addon_option_id") REFERENCES "addon_options"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "voucher_packages"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_redeemed_by_fkey" FOREIGN KEY ("redeemed_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "points_log" ADD CONSTRAINT "points_log_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "points_log" ADD CONSTRAINT "points_log_performed_by_fkey" FOREIGN KEY ("performed_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "points_log" ADD CONSTRAINT "points_log_reversed_log_id_fkey" FOREIGN KEY ("reversed_log_id") REFERENCES "points_log"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "points_log" ADD CONSTRAINT "points_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "points_log" ADD CONSTRAINT "points_log_voucher_id_fkey" FOREIGN KEY ("voucher_id") REFERENCES "vouchers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_default_powder_id_fkey" FOREIGN KEY ("default_powder_id") REFERENCES "matcha_powder"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_matcha_powder_id_fkey" FOREIGN KEY ("matcha_powder_id") REFERENCES "matcha_powder"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "addon_options" ADD CONSTRAINT "addon_options_addon_group_id_fkey" FOREIGN KEY ("addon_group_id") REFERENCES "addon_groups"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "menu_item_sizes" ADD CONSTRAINT "menu_item_sizes_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_handled_by_fkey" FOREIGN KEY ("handled_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_payment_confirmed_by_fkey" FOREIGN KEY ("payment_confirmed_by") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_address_id_fkey" FOREIGN KEY ("address_id") REFERENCES "addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_voucher_id_fkey" FOREIGN KEY ("product_voucher_id") REFERENCES "vouchers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_selected_milk_type_id_fkey" FOREIGN KEY ("selected_milk_type_id") REFERENCES "milk_type"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_selected_powder_id_fkey" FOREIGN KEY ("selected_powder_id") REFERENCES "matcha_powder"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "order_item_addons" ADD CONSTRAINT "order_item_addons_addon_option_id_fkey" FOREIGN KEY ("addon_option_id") REFERENCES "addon_options"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "order_item_addons" ADD CONSTRAINT "order_item_addons_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "order_discount_vouchers" ADD CONSTRAINT "order_discount_vouchers_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "order_discount_vouchers" ADD CONSTRAINT "order_discount_vouchers_voucher_id_fkey" FOREIGN KEY ("voucher_id") REFERENCES "vouchers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "order_item_addon_vouchers" ADD CONSTRAINT "order_item_addon_vouchers_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "order_item_addon_vouchers" ADD CONSTRAINT "order_item_addon_vouchers_voucher_id_fkey" FOREIGN KEY ("voucher_id") REFERENCES "vouchers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "order_item_addon_vouchers" ADD CONSTRAINT "order_item_addon_vouchers_addon_option_id_fkey" FOREIGN KEY ("addon_option_id") REFERENCES "addon_options"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "matcha_powder" ADD CONSTRAINT "matcha_powder_reference_latte_item_id_fkey" FOREIGN KEY ("reference_latte_item_id") REFERENCES "menu_items"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "powder_size_config" ADD CONSTRAINT "powder_size_config_powder_id_fkey" FOREIGN KEY ("powder_id") REFERENCES "matcha_powder"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "fusion_allowed_powder" ADD CONSTRAINT "fusion_allowed_powder_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "fusion_allowed_powder" ADD CONSTRAINT "fusion_allowed_powder_powder_id_fkey" FOREIGN KEY ("powder_id") REFERENCES "matcha_powder"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

