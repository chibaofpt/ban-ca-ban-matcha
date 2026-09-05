import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "prisma/migrations/20260905170000_add_addon_group_sort_order/migration.sql",
);

describe("Migration thứ tự hiển thị add-on", () => {
  it("thêm sort_order cho nhóm và chuẩn hóa thứ tự hiện có", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain('ADD COLUMN "sort_order" INTEGER NOT NULL DEFAULT 0');
    expect(sql).toContain('ROW_NUMBER() OVER (ORDER BY "created_at" DESC, "id" ASC) - 1');
    expect(sql).toContain('PARTITION BY "addon_group_id" ORDER BY "sort_order" ASC, "id" ASC');
  });

  it("bảo vệ thứ tự không âm và tạo index theo truy vấn hiển thị", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain('CHECK ("sort_order" >= 0)');
    expect(sql).toContain('CREATE INDEX "idx_addon_groups_sort_order_id"');
    expect(sql).toContain('CREATE INDEX "idx_addon_options_group_sort_order_id"');
  });
});
