import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "prisma", "migrations", "20260903100000_addon_max_select", "migration.sql"),
  "utf8",
).replace(/\r\n/g, "\n");

describe("static SQL contract — addon max_select migration", () => {
  it("maps legacy quantity capacity to distinct-option max_select", () => {
    expect(migration).toContain("WHEN \"type\" = 'QUANTITY' THEN GREATEST(COALESCE(\"max_quantity\", 1), 1)");
    expect(migration).toContain("ELSE 1");
  });

  it("forces dynamic-gram groups to remain single-select before dropping type", () => {
    expect(migration).toContain('SET "is_dynamic_gram" = true,\n    "max_select" = 1');
    expect(migration.indexOf('"max_select" = 1')).toBeLessThan(migration.indexOf('DROP COLUMN "type"'));
  });
});
