import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "prisma",
  "migrations",
  "20260811221000_add_bundle_promotions",
  "migration.sql",
);

describe("migration chương trình mua X tặng Y", () => {
  it("tạo đủ bảng nguồn-sự-thật và khóa chống cấp voucher trùng", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain('CREATE TABLE "promotion_bundle_rules"');
    expect(migration).toContain('CREATE TABLE "voucher_grants"');
    expect(migration).toContain('CREATE TABLE "order_promotion_applications"');
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "voucher_grants_user_id_package_id_key"',
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "order_promotion_applications_voucher_id_key"',
    );
  });

  it("ràng buộc mỗi reward chỉ trỏ tới sản phẩm hoặc addon", () => {
    const migration = readFileSync(migrationPath, "utf8");

    expect(migration).toContain("order_promotion_rewards_exactly_one_target");
    expect(migration).toContain(
      'CHECK (num_nonnulls("order_item_id", "order_item_addon_id") = 1)',
    );
    expect(migration).toContain('CHECK ("quantity" > 0)');
    expect(migration).toContain('CHECK ("discount_vnd" >= 0)');
  });

  it("bật RLS và không mở Data API cho toàn bộ bảng mới", () => {
    const migration = readFileSync(migrationPath, "utf8");
    const tables = [
      "promotion_bundle_rules",
      "promotion_product_scopes",
      "promotion_addon_rewards",
      "voucher_grants",
      "order_promotion_applications",
      "order_promotion_rewards",
    ];

    for (const table of tables) {
      expect(migration).toContain(
        `ALTER TABLE public."${table}" ENABLE ROW LEVEL SECURITY;`,
      );
      expect(migration).toContain(
        `REVOKE ALL PRIVILEGES ON TABLE public."${table}" FROM PUBLIC, anon, authenticated, service_role;`,
      );
    }
    expect(migration).not.toMatch(/CREATE\s+POLICY/i);
    expect(migration).not.toMatch(/GRANT\s+ALL/i);
  });
});
