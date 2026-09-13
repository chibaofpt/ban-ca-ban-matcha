-- Add durable welcome-reward configuration, campaign visuals, entitlement, and outcome audit.
CREATE TYPE "WelcomeRewardMode" AS ENUM ('POINTS', 'FIXED_VOUCHER', 'GACHA');
CREATE TYPE "RewardCampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ENDED');
CREATE TYPE "RewardOutcomeKind" AS ENUM ('VOUCHER', 'POINTS');
CREATE TYPE "RewardOrigin" AS ENUM ('WELCOME');

ALTER TYPE "VoucherAcquisitionMode" ADD VALUE 'WELCOME_GIFT';
ALTER TYPE "VoucherAcquisitionMode" ADD VALUE 'GACHA_REWARD';

CREATE TABLE "reward_campaigns" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL,
  "status" "RewardCampaignStatus" NOT NULL DEFAULT 'DRAFT',
  "revision" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "reward_campaigns_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "reward_pool_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "campaign_id" UUID NOT NULL,
  "voucher_package_id" UUID NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unlock_after_draws" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "reward_pool_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "reward_pool_items_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "reward_pool_items_unlock_after_draws_check" CHECK ("unlock_after_draws" >= 0)
);

CREATE TABLE "reward_boxes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "campaign_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "closed_image_url" TEXT NOT NULL,
  "open_image_url" TEXT NOT NULL,
  "mouth_anchor_x" DECIMAL(5,4) NOT NULL,
  "mouth_anchor_y" DECIMAL(5,4) NOT NULL,
  "sort_order" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "reward_boxes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "reward_boxes_mouth_anchor_check" CHECK (
    "mouth_anchor_x" BETWEEN 0 AND 1
    AND "mouth_anchor_y" BETWEEN 0 AND 1
  ),
  CONSTRAINT "reward_boxes_sort_order_check" CHECK ("sort_order" >= 0)
);

CREATE TABLE "welcome_rewards" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "mode" "WelcomeRewardMode" NOT NULL,
  "campaign_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "welcome_rewards_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "welcome_rewards_mode_campaign_check" CHECK (
    ("mode" = 'GACHA' AND "campaign_id" IS NOT NULL)
    OR ("mode" <> 'GACHA' AND "campaign_id" IS NULL)
  )
);

CREATE TABLE "reward_outcomes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "welcome_reward_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "origin" "RewardOrigin" NOT NULL DEFAULT 'WELCOME',
  "kind" "RewardOutcomeKind" NOT NULL,
  "campaign_id" UUID,
  "pool_item_id" UUID,
  "box_id" UUID,
  "voucher_id" UUID,
  "points_log_id" UUID,
  "draw_number" INTEGER,
  "request_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "reward_outcomes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "reward_outcomes_kind_target_check" CHECK (
    ("kind" = 'VOUCHER' AND "voucher_id" IS NOT NULL AND "points_log_id" IS NULL)
    OR ("kind" = 'POINTS' AND "voucher_id" IS NULL AND "points_log_id" IS NOT NULL)
  ),
  CONSTRAINT "reward_outcomes_campaign_details_check" CHECK (
    ("kind" = 'VOUCHER' AND (
      ("campaign_id" IS NULL AND "pool_item_id" IS NULL AND "box_id" IS NULL AND "draw_number" IS NULL)
      OR ("campaign_id" IS NOT NULL AND "pool_item_id" IS NOT NULL AND "box_id" IS NOT NULL AND "draw_number" IS NOT NULL)
    ))
    OR ("kind" = 'POINTS' AND "pool_item_id" IS NULL AND "draw_number" IS NULL AND (
      ("campaign_id" IS NULL AND "box_id" IS NULL)
      OR ("campaign_id" IS NOT NULL AND "box_id" IS NOT NULL)
    ))
  )
);

CREATE TABLE "welcome_reward_settings" (
  "id" INTEGER NOT NULL DEFAULT 1,
  "mode" "WelcomeRewardMode" NOT NULL DEFAULT 'POINTS',
  "fixed_package_id" UUID,
  "active_campaign_id" UUID,
  "revision" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "welcome_reward_settings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "welcome_reward_settings_id_check" CHECK ("id" = 1),
  CONSTRAINT "welcome_reward_settings_mode_targets_check" CHECK (
    ("mode" = 'POINTS' AND "fixed_package_id" IS NULL AND "active_campaign_id" IS NULL)
    OR ("mode" = 'FIXED_VOUCHER' AND "fixed_package_id" IS NOT NULL AND "active_campaign_id" IS NULL)
    OR ("mode" = 'GACHA' AND "fixed_package_id" IS NULL AND "active_campaign_id" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "reward_pool_items_campaign_id_voucher_package_id_key"
  ON "reward_pool_items"("campaign_id", "voucher_package_id");
CREATE INDEX "reward_pool_items_campaign_id_idx" ON "reward_pool_items"("campaign_id");
CREATE INDEX "reward_pool_items_voucher_package_id_idx" ON "reward_pool_items"("voucher_package_id");

CREATE UNIQUE INDEX "reward_boxes_campaign_id_sort_order_key"
  ON "reward_boxes"("campaign_id", "sort_order");
CREATE INDEX "reward_boxes_campaign_id_idx" ON "reward_boxes"("campaign_id");

CREATE UNIQUE INDEX "welcome_rewards_user_id_key" ON "welcome_rewards"("user_id");
CREATE INDEX "welcome_rewards_campaign_id_idx" ON "welcome_rewards"("campaign_id");

CREATE UNIQUE INDEX "reward_outcomes_welcome_reward_id_key" ON "reward_outcomes"("welcome_reward_id");
CREATE UNIQUE INDEX "reward_outcomes_voucher_id_key" ON "reward_outcomes"("voucher_id");
CREATE UNIQUE INDEX "reward_outcomes_points_log_id_key" ON "reward_outcomes"("points_log_id");
CREATE UNIQUE INDEX "reward_outcomes_request_id_key" ON "reward_outcomes"("request_id");
CREATE UNIQUE INDEX "reward_outcomes_campaign_id_draw_number_key"
  ON "reward_outcomes"("campaign_id", "draw_number");
CREATE INDEX "idx_reward_outcomes_user_created_cursor"
  ON "reward_outcomes"("user_id", "created_at" DESC, "id" DESC);
CREATE INDEX "reward_outcomes_campaign_id_idx" ON "reward_outcomes"("campaign_id");
CREATE INDEX "reward_outcomes_pool_item_id_idx" ON "reward_outcomes"("pool_item_id");
CREATE INDEX "reward_outcomes_box_id_idx" ON "reward_outcomes"("box_id");

CREATE INDEX "welcome_reward_settings_fixed_package_id_idx"
  ON "welcome_reward_settings"("fixed_package_id");
CREATE INDEX "welcome_reward_settings_active_campaign_id_idx"
  ON "welcome_reward_settings"("active_campaign_id");

ALTER TABLE "reward_pool_items"
  ADD CONSTRAINT "reward_pool_items_campaign_id_fkey"
  FOREIGN KEY ("campaign_id") REFERENCES "reward_campaigns"("id")
  ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "reward_pool_items"
  ADD CONSTRAINT "reward_pool_items_voucher_package_id_fkey"
  FOREIGN KEY ("voucher_package_id") REFERENCES "voucher_packages"("id")
  ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "reward_boxes"
  ADD CONSTRAINT "reward_boxes_campaign_id_fkey"
  FOREIGN KEY ("campaign_id") REFERENCES "reward_campaigns"("id")
  ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "welcome_rewards"
  ADD CONSTRAINT "welcome_rewards_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "welcome_rewards"
  ADD CONSTRAINT "welcome_rewards_campaign_id_fkey"
  FOREIGN KEY ("campaign_id") REFERENCES "reward_campaigns"("id")
  ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "reward_outcomes"
  ADD CONSTRAINT "reward_outcomes_welcome_reward_id_fkey"
  FOREIGN KEY ("welcome_reward_id") REFERENCES "welcome_rewards"("id")
  ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "reward_outcomes"
  ADD CONSTRAINT "reward_outcomes_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "reward_outcomes"
  ADD CONSTRAINT "reward_outcomes_campaign_id_fkey"
  FOREIGN KEY ("campaign_id") REFERENCES "reward_campaigns"("id")
  ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "reward_outcomes"
  ADD CONSTRAINT "reward_outcomes_pool_item_id_fkey"
  FOREIGN KEY ("pool_item_id") REFERENCES "reward_pool_items"("id")
  ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "reward_outcomes"
  ADD CONSTRAINT "reward_outcomes_box_id_fkey"
  FOREIGN KEY ("box_id") REFERENCES "reward_boxes"("id")
  ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "reward_outcomes"
  ADD CONSTRAINT "reward_outcomes_voucher_id_fkey"
  FOREIGN KEY ("voucher_id") REFERENCES "vouchers"("id")
  ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "reward_outcomes"
  ADD CONSTRAINT "reward_outcomes_points_log_id_fkey"
  FOREIGN KEY ("points_log_id") REFERENCES "points_log"("id")
  ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "welcome_reward_settings"
  ADD CONSTRAINT "welcome_reward_settings_fixed_package_id_fkey"
  FOREIGN KEY ("fixed_package_id") REFERENCES "voucher_packages"("id")
  ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "welcome_reward_settings"
  ADD CONSTRAINT "welcome_reward_settings_active_campaign_id_fkey"
  FOREIGN KEY ("active_campaign_id") REFERENCES "reward_campaigns"("id")
  ON DELETE NO ACTION ON UPDATE NO ACTION;

INSERT INTO "welcome_reward_settings" ("id", "mode") VALUES (1, 'POINTS') ON CONFLICT ("id") DO NOTHING;

ALTER TABLE public."welcome_reward_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."reward_campaigns" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."reward_pool_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."reward_boxes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."welcome_rewards" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."reward_outcomes" ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public."welcome_reward_settings" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON TABLE public."reward_campaigns" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON TABLE public."reward_pool_items" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON TABLE public."reward_boxes" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON TABLE public."welcome_rewards" FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON TABLE public."reward_outcomes" FROM PUBLIC, anon, authenticated, service_role;
