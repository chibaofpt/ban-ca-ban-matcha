import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "prisma",
    "migrations",
    "20260811233000_addon_opt_in_phase1",
    "migration.sql",
  ),
  "utf8",
);

describe("migration addon opt-in phase 1", () => {
  it("thêm lifecycle cho option và vô hiệu hóa hai sentinel cũ", () => {
    expect(migration).toContain(
      'ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true',
    );
    expect(migration).toContain("ag.\"name\" = 'Kem'");
    expect(migration).toContain("ag.\"name\" = 'Extra Matcha'");
    expect(migration).toContain('SET "is_required" = false');
    expect(migration).toContain('SET "is_default" = false');
  });

  it("chỉ dọn lịch sử zero-value khi không có voucher addon liên kết", () => {
    expect(migration).toContain('DELETE FROM "order_item_addons"');
    expect(migration).toContain('oia."unit_price_vnd" = 0');
    expect(migration).toContain(
      'NOT EXISTS (\n    SELECT 1\n    FROM "order_item_addon_vouchers"',
    );
  });

  it("chỉ xóa package 0g bất hoạt chưa từng phát hành", () => {
    expect(migration).toContain('DELETE FROM "voucher_packages"');
    expect(migration).toContain('vp."is_active" = false');
    expect(migration).toContain(
      'NOT EXISTS (\n    SELECT 1 FROM "vouchers" AS v WHERE v."package_id" = vp."id"',
    );
  });
});
