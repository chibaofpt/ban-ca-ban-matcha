import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "prisma/migrations/20260815150000_add_extras_items_and_item_vouchers/migration.sql",
);

function migrationSql(): string {
  return readFileSync(migrationPath, "utf8");
}

describe("migration extras + ITEM voucher", () => {
  it("giữ fixed unit price là số nguyên VND dương, bội số 1.000 và bắt buộc cho extras", () => {
    const sql = migrationSql();

    expect(sql).toContain('ADD COLUMN "unit_price_vnd" INTEGER');
    expect(sql).toContain('"unit_price_vnd" >= 1000');
    expect(sql).toContain('MOD("unit_price_vnd", 1000) = 0');
    expect(sql).toContain('"category" <> \'extras\' OR "unit_price_vnd" IS NOT NULL');
  });

  it("enforce mỗi ITEM voucher chỉ gắn tối đa một order item", () => {
    const sql = migrationSql();

    expect(sql).toContain('ADD COLUMN "item_voucher_id" UUID');
    expect(sql).toContain('"order_items_item_voucher_id_fkey"');
    expect(sql).toContain('CREATE UNIQUE INDEX "order_items_item_voucher_id_key"');
  });
});
