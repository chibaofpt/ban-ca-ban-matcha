import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(process.cwd(), "prisma/migrations/20260825000000_add_product_discount_scopes/migration.sql");

describe("static SQL contract — scope PRODUCT_DISCOUNT (không thực thi migration)", () => {
  it("tạo hai bảng scope, index và foreign key đúng chính sách", () => {
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toContain('CREATE TABLE "voucher_package_menu_item_scopes"');
    expect(sql).toContain('CREATE TABLE "voucher_menu_item_scopes"');
    expect(sql).toContain('ON DELETE CASCADE ON UPDATE NO ACTION');
    expect(sql).toContain('ON DELETE NO ACTION ON UPDATE NO ACTION');
    expect(sql).toContain('voucher_package_menu_item_scopes_menu_item_id_idx');
    expect(sql).toContain('voucher_menu_item_scopes_menu_item_id_idx');
  });

  it("backfill anchor legacy cho package và voucher PRODUCT_DISCOUNT", () => {
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toMatch(/INSERT INTO "voucher_package_menu_item_scopes"[\s\S]+['"]PRODUCT_DISCOUNT['"]/);
    expect(sql).toMatch(/INSERT INTO "voucher_menu_item_scopes"[\s\S]+['"]PRODUCT_DISCOUNT['"]/);
  });
});
