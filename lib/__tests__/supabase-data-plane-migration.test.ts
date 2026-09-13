import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const schema = readFileSync(join(process.cwd(), "prisma", "schema.prisma"), "utf8");
const migration = readFileSync(
  join(
    process.cwd(),
    "prisma",
    "migrations",
    "20260804000000_harden_supabase_data_plane",
    "migration.sql",
  ),
  "utf8",
);
const bundleMigration = readFileSync(
  join(
    process.cwd(),
    "prisma",
    "migrations",
    "20260811221000_add_bundle_promotions",
    "migration.sql",
  ),
  "utf8",
);
const unifiedVoucherMigration = readFileSync(
  join(
    process.cwd(),
    "prisma",
    "migrations",
    "20260812000000_merge_promotions_into_vouchers",
    "migration.sql",
  ),
  "utf8",
);
const baseLiquidMigration = readFileSync(
  join(
    process.cwd(),
    "prisma",
    "migrations",
    "20260815121000_add_menu_base_liquids",
    "migration.sql",
  ),
  "utf8",
);
const groupedBundleMigration = readFileSync(
  join(
    process.cwd(),
    "prisma",
    "migrations",
    "20260817213000_group_bundle_products_and_multi_applications",
    "migration.sql",
  ),
  "utf8",
);
const productDiscountScopeMigration = readFileSync(
  join(process.cwd(), "prisma", "migrations", "20260825000000_add_product_discount_scopes", "migration.sql"),
  "utf8",
);
const multiChoiceVoucherScopeMigration = readFileSync(
  join(process.cwd(), "prisma", "migrations", "20260908120000_add_multi_choice_voucher_scopes", "migration.sql"),
  "utf8",
);
const securityPaginationMigration = readFileSync(
  join(process.cwd(), "prisma", "migrations", "20260827094000_harden_function_and_pagination_indexes", "migration.sql"),
  "utf8",
);
const welcomeRewardsMigration = readFileSync(
  join(process.cwd(), "prisma", "migrations", "20260912160000_welcome_rewards", "migration.sql"),
  "utf8",
);

function prismaTableNames(): string[] {
  return [...schema.matchAll(/@@map\("([^"]+)"\)/g)]
    .map((match) => match[1])
    .sort();
}

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, " ").trim();
}

describe("static SQL contract — Supabase Data API (không thực thi migration)", () => {
  it("bật RLS, không FORCE, cho mọi bảng Prisma quản lý", () => {
    const hardenedMigrations = `${migration}\n${bundleMigration}\n${unifiedVoucherMigration}\n${baseLiquidMigration}\n${groupedBundleMigration}\n${productDiscountScopeMigration}\n${multiChoiceVoucherScopeMigration}\n${welcomeRewardsMigration}`;
    const currentTables = new Set(prismaTableNames());
    const enabledTables = [...new Set([...hardenedMigrations.matchAll(
      /ALTER TABLE (?:IF EXISTS )?public\."([^"]+)" ENABLE ROW LEVEL SECURITY;/g,
    )].map((match) => match[1]).filter((table) => currentTables.has(table)))].sort();

    expect(enabledTables).toEqual(prismaTableNames());
    expect(hardenedMigrations).not.toMatch(/FORCE ROW LEVEL SECURITY/i);
    expect(hardenedMigrations).not.toMatch(/CREATE\s+POLICY/i);
    expect(hardenedMigrations).not.toMatch(/auth\.uid\s*\(/i);
  });

  it("thu hồi quyền Data API rộng và chỉ cấp đúng refresh-session surface", () => {
    expect(migration).toMatch(
      /REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated, service_role;/,
    );
    expect(migration).toMatch(
      /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\.sessions TO service_role;/,
    );
    expect(migration).toMatch(
      /GRANT SELECT \(id, role, phone_number\) ON TABLE public\.users TO service_role;/,
    );
    expect(migration).toMatch(/GRANT USAGE ON SCHEMA public TO service_role;/);
    expect(migration).not.toMatch(/GRANT\s+ALL/i);
  });

  it("khóa function và default privileges trong public nhưng không đụng storage", () => {
    expect(migration).toMatch(
      /REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated, service_role;/,
    );
    expect(migration).toMatch(/ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public/);
    expect(migration).not.toMatch(/\bstorage\./i);
    expect(migration).not.toMatch(/SCHEMA storage/i);
  });

  it("pins update_updated_at search_path và thêm index cho các cursor query", () => {
    expect(securityPaginationMigration).toMatch(/SET search_path = pg_catalog/);
    expect(securityPaginationMigration).toMatch(/NEW\.updated_at = pg_catalog\.now\(\)/);
    expect(securityPaginationMigration).toMatch(
      /REVOKE ALL ON FUNCTION public\.update_updated_at\(\) FROM PUBLIC, anon, authenticated/,
    );
    expect(securityPaginationMigration).toContain("idx_points_log_user_created_cursor");
    expect(securityPaginationMigration).toContain("idx_vouchers_user_created_cursor");
    expect(securityPaginationMigration).toMatch(
      /idx_push_subscriptions_active_cursor[\s\S]*WHERE is_active = true/,
    );
  });
});

describe("static contract — phần thưởng chào mừng", () => {
  it("khai báo enum, mô hình và quan hệ lưu vết bất biến", () => {
    expect(schema).toContain("enum WelcomeRewardMode {");
    expect(schema).toContain("enum RewardCampaignStatus {");
    expect(schema).toContain("enum RewardOutcomeKind {");
    expect(schema).toContain("enum RewardOrigin {");
    expect(schema).toContain("  WELCOME_GIFT");
    expect(schema).toContain("  GACHA_REWARD");
    for (const model of [
      "WelcomeRewardSettings",
      "RewardCampaign",
      "RewardPoolItem",
      "RewardBox",
      "WelcomeReward",
      "RewardOutcome",
    ]) {
      expect(schema).toContain(`model ${model} {`);
    }
    expect(schema).toContain('@@map("welcome_reward_settings")');
    expect(schema).toContain('@@map("reward_outcomes")');
    expect(schema).toContain("@@index([box_id])");
  });

  it("tạo singleton mặc định và các ràng buộc nghiệp vụ", () => {
    const sql = welcomeRewardsMigration;

    expect(sql).toContain("CREATE TYPE \"WelcomeRewardMode\" AS ENUM ('POINTS', 'FIXED_VOUCHER', 'GACHA')");
    expect(sql).toContain("CREATE TYPE \"RewardCampaignStatus\" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ENDED')");
    expect(sql).toContain("CREATE TYPE \"RewardOutcomeKind\" AS ENUM ('VOUCHER', 'POINTS')");
    expect(sql).toContain("CREATE TYPE \"RewardOrigin\" AS ENUM ('WELCOME')");
    expect(sql).toContain("ALTER TYPE \"VoucherAcquisitionMode\" ADD VALUE 'WELCOME_GIFT'");
    expect(sql).toContain("ALTER TYPE \"VoucherAcquisitionMode\" ADD VALUE 'GACHA_REWARD'");
    for (const table of [
      "welcome_reward_settings",
      "reward_campaigns",
      "reward_pool_items",
      "reward_boxes",
      "welcome_rewards",
      "reward_outcomes",
    ]) {
      expect(sql).toContain(`CREATE TABLE "${table}"`);
    }
    const normalizedSql = normalizeSql(sql);
    const checkConstraints = [
      'CONSTRAINT "reward_pool_items_quantity_check" CHECK ("quantity" > 0)',
      'CONSTRAINT "reward_pool_items_unlock_after_draws_check" CHECK ("unlock_after_draws" >= 0)',
      'CONSTRAINT "reward_boxes_mouth_anchor_check" CHECK ( "mouth_anchor_x" BETWEEN 0 AND 1 AND "mouth_anchor_y" BETWEEN 0 AND 1 )',
      'CONSTRAINT "reward_boxes_sort_order_check" CHECK ("sort_order" >= 0)',
      'CONSTRAINT "welcome_rewards_mode_campaign_check" CHECK ( ("mode" = \'GACHA\' AND "campaign_id" IS NOT NULL) OR ("mode" <> \'GACHA\' AND "campaign_id" IS NULL) )',
      'CONSTRAINT "reward_outcomes_kind_target_check" CHECK ( ("kind" = \'VOUCHER\' AND "voucher_id" IS NOT NULL AND "points_log_id" IS NULL) OR ("kind" = \'POINTS\' AND "voucher_id" IS NULL AND "points_log_id" IS NOT NULL) )',
      'CONSTRAINT "reward_outcomes_campaign_details_check" CHECK ( ("kind" = \'VOUCHER\' AND ( ("campaign_id" IS NULL AND "pool_item_id" IS NULL AND "box_id" IS NULL AND "draw_number" IS NULL) OR ("campaign_id" IS NOT NULL AND "pool_item_id" IS NOT NULL AND "box_id" IS NOT NULL AND "draw_number" IS NOT NULL) )) OR ("kind" = \'POINTS\' AND "pool_item_id" IS NULL AND "draw_number" IS NULL AND ( ("campaign_id" IS NULL AND "box_id" IS NULL) OR ("campaign_id" IS NOT NULL AND "box_id" IS NOT NULL) )) )',
      'CONSTRAINT "welcome_reward_settings_id_check" CHECK ("id" = 1)',
      'CONSTRAINT "welcome_reward_settings_mode_targets_check" CHECK ( ("mode" = \'POINTS\' AND "fixed_package_id" IS NULL AND "active_campaign_id" IS NULL) OR ("mode" = \'FIXED_VOUCHER\' AND "fixed_package_id" IS NOT NULL AND "active_campaign_id" IS NULL) OR ("mode" = \'GACHA\' AND "fixed_package_id" IS NULL AND "active_campaign_id" IS NOT NULL) )',
    ] as const;
    for (const constraint of checkConstraints) expect(normalizedSql).toContain(constraint);
    expect(sql).toContain('CREATE UNIQUE INDEX "welcome_rewards_user_id_key"');
    expect(sql).toContain('CREATE UNIQUE INDEX "reward_outcomes_welcome_reward_id_key"');
    expect(sql).toContain('CREATE UNIQUE INDEX "reward_outcomes_voucher_id_key"');
    expect(sql).toContain('CREATE UNIQUE INDEX "reward_outcomes_points_log_id_key"');
    expect(sql).toContain('CREATE UNIQUE INDEX "reward_outcomes_request_id_key"');
    expect(sql).toContain('CREATE UNIQUE INDEX "reward_outcomes_campaign_id_draw_number_key"');
    expect(sql).toContain('CREATE INDEX "reward_outcomes_box_id_idx" ON "reward_outcomes"("box_id")');
    expect(sql).toContain(
      'INSERT INTO "welcome_reward_settings" ("id", "mode") VALUES (1, \'POINTS\') ON CONFLICT ("id") DO NOTHING',
    );
  });

  it("giữ đầy đủ khóa ngoại lịch sử ở chế độ NO ACTION", () => {
    const normalizedSql = normalizeSql(welcomeRewardsMigration);
    const foreignKeys = [
      ["reward_pool_items", "reward_pool_items_campaign_id_fkey", "campaign_id", "reward_campaigns", "id"],
      ["reward_pool_items", "reward_pool_items_voucher_package_id_fkey", "voucher_package_id", "voucher_packages", "id"],
      ["reward_boxes", "reward_boxes_campaign_id_fkey", "campaign_id", "reward_campaigns", "id"],
      ["welcome_rewards", "welcome_rewards_user_id_fkey", "user_id", "users", "id"],
      ["welcome_rewards", "welcome_rewards_campaign_id_fkey", "campaign_id", "reward_campaigns", "id"],
      ["reward_outcomes", "reward_outcomes_welcome_reward_id_fkey", "welcome_reward_id", "welcome_rewards", "id"],
      ["reward_outcomes", "reward_outcomes_user_id_fkey", "user_id", "users", "id"],
      ["reward_outcomes", "reward_outcomes_campaign_id_fkey", "campaign_id", "reward_campaigns", "id"],
      ["reward_outcomes", "reward_outcomes_pool_item_id_fkey", "pool_item_id", "reward_pool_items", "id"],
      ["reward_outcomes", "reward_outcomes_box_id_fkey", "box_id", "reward_boxes", "id"],
      ["reward_outcomes", "reward_outcomes_voucher_id_fkey", "voucher_id", "vouchers", "id"],
      ["reward_outcomes", "reward_outcomes_points_log_id_fkey", "points_log_id", "points_log", "id"],
      ["welcome_reward_settings", "welcome_reward_settings_fixed_package_id_fkey", "fixed_package_id", "voucher_packages", "id"],
      ["welcome_reward_settings", "welcome_reward_settings_active_campaign_id_fkey", "active_campaign_id", "reward_campaigns", "id"],
    ] as const;

    for (const [sourceTable, constraint, sourceColumn, targetTable, targetColumn] of foreignKeys) {
      expect(normalizedSql).toContain(
        `ALTER TABLE "${sourceTable}" ADD CONSTRAINT "${constraint}" FOREIGN KEY ("${sourceColumn}") REFERENCES "${targetTable}"("${targetColumn}") ON DELETE NO ACTION ON UPDATE NO ACTION;`,
      );
    }
  });

  it("khóa toàn bộ bảng mới khỏi Supabase Data API", () => {
    const sql = welcomeRewardsMigration;

    for (const table of [
      "welcome_reward_settings",
      "reward_campaigns",
      "reward_pool_items",
      "reward_boxes",
      "welcome_rewards",
      "reward_outcomes",
    ]) {
      expect(sql).toContain(`ALTER TABLE public."${table}" ENABLE ROW LEVEL SECURITY`);
      expect(sql).toContain(
        `REVOKE ALL PRIVILEGES ON TABLE public."${table}" FROM PUBLIC, anon, authenticated, service_role`,
      );
    }
    expect(sql).not.toContain("CREATE POLICY");
    expect(sql).not.toContain("supabase_realtime");
  });
});
