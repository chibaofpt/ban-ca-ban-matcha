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
const groupedMigrationPath = join(
  process.cwd(), "prisma", "migrations",
  "20260817213000_group_bundle_products_and_multi_applications", "migration.sql",
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

describe("migration BUNDLE grouped scope và nhiều voucher mỗi order", () => {
  it("gộp product, tách allowed sizes và loại reference price", () => {
    const migration = readFileSync(groupedMigrationPath, "utf8");
    expect(migration).toContain('"default_powder_id" UUID');
    expect(migration).toContain('"default_base_liquid_id" UUID');
    expect(migration).toContain('CREATE TABLE public."voucher_bundle_product_scope_sizes_v2"');
    expect(migration).toContain('DROP TABLE public."voucher_bundle_product_scopes"');
    expect(migration).not.toContain('"reference_price_vnd" INTEGER');
  });

  it("dừng và báo package ID khi cấu hình cũ mâu thuẫn", () => {
    const migration = readFileSync(groupedMigrationPath, "utf8");
    expect(migration).toContain("BUNDLE migration requires admin review for package IDs");
    expect(migration).toContain("COUNT(DISTINCT COALESCE(default_powder_id::text");
  });

  it("cho một order có nhiều application và lưu qualifier allocations", () => {
    const migration = readFileSync(groupedMigrationPath, "utf8");
    expect(migration).toContain('DROP INDEX public."order_bundle_applications_order_id_key"');
    expect(migration).toContain('CREATE TABLE public."order_bundle_qualifier_allocations"');
    expect(migration).toContain('UNIQUE ("application_id", "order_item_id")');
    expect(migration).toContain('DROP INDEX IF EXISTS public."idx_order_items_item_voucher_id"');
    expect(migration).toContain('CREATE INDEX IF NOT EXISTS "idx_order_items_selected_milk_type_id"');
  });

  it("bật RLS, revoke và index mọi FK của bảng mới", () => {
    const migration = readFileSync(groupedMigrationPath, "utf8");
    for (const table of ["voucher_bundle_product_scope_sizes", "order_bundle_qualifier_allocations"]) {
      expect(migration).toContain(`ALTER TABLE public."${table}" ENABLE ROW LEVEL SECURITY;`);
      expect(migration).toContain(`REVOKE ALL PRIVILEGES ON TABLE public."${table}"`);
    }
    expect(migration).toContain('CREATE INDEX "order_bundle_qualifier_allocations_order_item_id_idx"');
  });
});
