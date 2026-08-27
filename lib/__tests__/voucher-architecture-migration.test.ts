import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "prisma/migrations/20260812000000_merge_promotions_into_vouchers/migration.sql",
);

function readMigration(): string {
  return readFileSync(migrationPath, "utf8");
}

describe("Migration hợp nhất Promotion vào Voucher", () => {
  it("chuyển ngày kết thúc và rule BUNDLE sang voucher package", () => {
    const sql = readMigration();

    expect(sql).toContain('ADD COLUMN "ends_at" TIMESTAMPTZ(6)');
    expect(sql).toContain('CREATE TABLE "voucher_bundle_rules"');
    expect(sql).toContain('CREATE TABLE "voucher_bundle_product_scopes"');
    expect(sql).toContain('CREATE TABLE "voucher_bundle_addon_rewards"');
    expect(sql).not.toContain('INSERT INTO "voucher_bundle_rules"');
    expect(sql).not.toContain('"max_redemptions"');
  });

  it("chuyển lịch sử áp dụng BUNDLE mà không còn promotion_id", () => {
    const sql = readMigration();

    expect(sql).toContain('CREATE TABLE "order_bundle_applications"');
    expect(sql).toContain('CREATE TABLE "order_bundle_rewards"');
    expect(sql).not.toContain('INSERT INTO "order_bundle_applications"');
    expect(sql).not.toMatch(/"order_bundle_applications"[\s\S]*?"promotion_id" UUID/);
  });

  it("không backfill hay chặn migration vì hệ thống chưa có Promotion", () => {
    const sql = readMigration();

    expect(sql).not.toContain("RAISE EXCEPTION");
    expect(sql).not.toMatch(/UPDATE\s+"voucher_packages"[\s\S]+FROM\s+"promotions"/);
  });

  it("bật RLS, thu hồi quyền và tạo index cho mọi foreign key mới", () => {
    const sql = readMigration();

    for (const table of [
      "voucher_bundle_rules",
      "voucher_bundle_product_scopes",
      "voucher_bundle_addon_rewards",
      "order_bundle_applications",
      "order_bundle_rewards",
    ]) {
      expect(sql).toContain(`ALTER TABLE public."${table}" ENABLE ROW LEVEL SECURITY`);
      expect(sql).toContain(`REVOKE ALL PRIVILEGES ON TABLE public."${table}"`);
    }
    expect(sql).toContain('voucher_bundle_product_scopes_menu_item_id_idx');
    expect(sql).toContain('voucher_bundle_product_scopes_matcha_powder_id_idx');
    expect(sql).toContain('voucher_bundle_product_scopes_milk_type_id_idx');
    expect(sql).toContain('voucher_bundle_addon_rewards_addon_option_id_idx');
  });

  it("xóa thẳng toàn bộ bảng Promotion cũ", () => {
    const sql = readMigration();

    expect(sql).toContain('DROP TABLE "order_promotion_rewards"');
    expect(sql).toContain('DROP TABLE "order_promotion_applications"');
    expect(sql).toContain('DROP TABLE "promotion_addon_rewards"');
    expect(sql).toContain('DROP TABLE "promotion_product_scopes"');
    expect(sql).toContain('DROP TABLE "promotion_bundle_rules"');
    expect(sql).toContain('DROP TABLE "promotions"');
  });
});
