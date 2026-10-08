import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Cấu trúc lưu bột thay thế Fusion, không thực thi migration", () => {
  it("lưu riêng bột thay thế và giữ FK bột gốc cùng index tra cứu", () => {
    const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
    expect(schema).toMatch(/replacement_powder_id\s+String\?/);
    expect(schema).toContain('"MenuItem_replacementPowder"');
    expect(schema).toContain("@@index([default_powder_id]");
    expect(schema).toContain("@@index([replacement_powder_id]");
    const migration = readFileSync(join(process.cwd(),
      "prisma/migrations/20261007000000_add_fusion_powder_replacement/migration.sql"), "utf8");
    expect(migration).toMatch(/ADD COLUMN\s+"replacement_powder_id"\s+UUID/);
    expect(migration).toContain("ON DELETE NO ACTION");
    expect(migration).not.toMatch(/\b(?:UPDATE|INSERT INTO|DELETE FROM)\s+"?menu_items/i);
  });
});
