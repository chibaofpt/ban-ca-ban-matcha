import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
describe("Migration điểm chào mừng — STATIC_ARTIFACT", () => {
  it("chỉ thêm hai cột default 5, không sửa lịch sử điểm và quyền lợi", () => {
    const sql = readFileSync("prisma/migrations/20261008000000_configurable_welcome_points/migration.sql", "utf8");
    expect(sql.match(/ALTER TABLE/g)).toHaveLength(2);
    expect(sql).toContain('ALTER TABLE "welcome_reward_settings"');
    expect(sql).toContain('ALTER TABLE "welcome_rewards"');
    expect(sql.match(/INTEGER NOT NULL DEFAULT 5/g)).toHaveLength(2);
    expect(sql).not.toMatch(/\b(UPDATE|DELETE|DROP|TRUNCATE)\b/i);
    expect(sql).not.toContain('"points_log"');
    expect(sql).not.toContain('"users"');
  });
});
