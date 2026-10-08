-- AlterTable
ALTER TABLE "welcome_reward_settings" ADD COLUMN "points_amount" INTEGER NOT NULL DEFAULT 5;

-- AlterTable
ALTER TABLE "welcome_rewards" ADD COLUMN "points_amount" INTEGER NOT NULL DEFAULT 5;
