import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Static SQL contract — Base Liquid (không thực thi migration)", () => {
  it("có bảng allowed, volume override và index", () => {
    const migrationRoot = join(process.cwd(), "prisma", "migrations");
    const entries = readFileSync(join(migrationRoot, "migration_lock.toml"), "utf8");
    expect(entries).toContain("postgresql");

    const schema = readFileSync(join(process.cwd(), "prisma", "schema.prisma"), "utf8");
    expect(schema).toContain("model MenuItemAllowedBaseLiquid");
    expect(schema).toContain("base_liquid_ml");
    expect(schema).toMatch(/model OrderItem[\s\S]*base_liquid_ml\s+Int\?/);

    const migration = readFileSync(
      join(migrationRoot, "20260815121000_add_menu_base_liquids", "migration.sql"),
      "utf8",
    );
    expect(migration).toContain('ALTER TABLE public."order_items"');
    expect(migration).toContain('ADD COLUMN "base_liquid_ml" INTEGER');
    expect(migration).toContain('uniq_milk_type_single_default');
  });
});
