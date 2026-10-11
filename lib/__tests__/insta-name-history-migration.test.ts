import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const history = new URL("../../prisma/migrations/", import.meta.url);
const prerequisite = "20260628100459_restore_insta_name_precondition";
const historicalDrop = "20260628100500_remove_insta_name";
const historicalAdd = "20260628154731_add_insta_name";

describe("Lịch sử Instagram — STATIC_ARTIFACT, không thực thi database", () => {
  it("bổ sung điều kiện trước DROP cũ và giữ các bước lịch sử", () => {
    const migrations = readdirSync(history).sort();
    expect(migrations).toContain(prerequisite);
    expect(migrations.indexOf(prerequisite)).toBeGreaterThan(migrations.indexOf("0_init"));
    expect(migrations.indexOf(prerequisite)).toBeLessThan(migrations.indexOf(historicalDrop));
    expect(migrations.indexOf(historicalDrop)).toBeLessThan(migrations.indexOf(historicalAdd));

    const file = new URL(`${prerequisite}/migration.sql`, history);
    const sql = existsSync(file) ? readFileSync(file, "utf8") : "";
    const statements = sql.replace(/--[^\r\n]*/g, "").trim();
    expect(statements).toBe('ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "insta_name" TEXT;');
  });
});
