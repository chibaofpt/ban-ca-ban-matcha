import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(process.cwd(), "prisma/migrations/20260908120000_add_multi_choice_voucher_scopes/migration.sql");

describe("static SQL contract — scope voucher nhiều lựa chọn", () => {
  it("thêm snapshot cấu hình PRODUCT và hai bảng scope ADDON", () => {
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toContain('ALTER TABLE "voucher_package_menu_item_scopes"');
    expect(sql).toContain('ADD COLUMN "covered_price_vnd" INTEGER');
    expect(sql).toContain('CREATE TABLE "voucher_package_addon_option_scopes"');
    expect(sql).toContain('CREATE TABLE "voucher_addon_option_scopes"');
    expect(sql).toContain('ALTER TABLE public."voucher_package_addon_option_scopes" ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('ALTER TABLE public."voucher_addon_option_scopes" ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('REVOKE ALL PRIVILEGES ON TABLE public."voucher_package_addon_option_scopes"\n  FROM PUBLIC, anon, authenticated, service_role;');
    expect(sql).toContain('REVOKE ALL PRIVILEGES ON TABLE public."voucher_addon_option_scopes"\n  FROM PUBLIC, anon, authenticated, service_role;');
    expect(sql).toContain('ON DELETE CASCADE ON UPDATE NO ACTION');
    expect(sql).toContain('ON DELETE NO ACTION ON UPDATE NO ACTION');
  });

  it("chỉ backfill singleton từ các legacy anchor đã lưu", () => {
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toMatch(/SELECT "id", "menu_item_id"[\s\S]+WHERE "voucher_type" IN \('PRODUCT', 'ITEM', 'PRODUCT_DISCOUNT'\)[\s\S]+"menu_item_id" IS NOT NULL/);
    expect(sql).toMatch(/SELECT "id", "addon_option_id" FROM "voucher_packages"[\s\S]+"voucher_type" = 'ADDON' AND "addon_option_id" IS NOT NULL/);
    expect(sql).toMatch(/SELECT "id", "addon_option_id" FROM "vouchers"[\s\S]+"voucher_type" = 'ADDON' AND "addon_option_id" IS NOT NULL/);
    expect(sql).not.toMatch(/CROSS JOIN|generate_series/i);
  });
});
