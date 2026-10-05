import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { OTP_RESERVE, OTP_VERIFY, OTP_FINALIZE } from "@/lib/auth/registrationOtpScripts";

const migration = readFileSync("prisma/migrations/20261004000000_registration_otp/migration.sql", "utf8");
const schema = readFileSync("prisma/schema.prisma", "utf8");
describe("Migration và Lua OTP đăng ký — chỉ STATIC_ARTIFACT", () => {
  it("chỉ thêm binding nullable và singleton seed tắt OTP, không backfill users", () => {
    expect(migration).toMatch(/ALTER TABLE "otp_attempts" ADD COLUMN "binding_hash" TEXT;/);
    expect(migration).toContain('CREATE TABLE "registration_otp_settings"');
    expect(migration).toContain("VALUES (1, false, 100, 0)");
    expect(migration).toContain('CHECK ("id" = 1)');
    expect(migration).toContain('CHECK ("daily_send_limit" > 0)');
    expect(migration).not.toMatch(/UPDATE\s+"?users"?/i);
    expect(migration).not.toMatch(/DROP\s|ALTER TABLE\s+"users"/i);
    expect(schema).toMatch(/binding_hash\s+String\?/);
    expect(schema).toMatch(/model RegistrationOtpSettings[\s\S]*?@@map\("registration_otp_settings"\)/);
  });
  it("giữ ranh giới Data API chỉ dành direct owner", () => {
    expect(migration).toContain('ALTER TABLE public."registration_otp_settings" ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain('REVOKE ALL PRIVILEGES ON TABLE public."registration_otp_settings" FROM PUBLIC, anon, authenticated, service_role');
    expect(migration).not.toMatch(/CREATE POLICY|GRANT\s/);
  });
  it("đặt guard preflight trước ghi hạn mức và bộ đếm sai", () => {
    expect(OTP_RESERVE).toContain("record.dispatch_state ~= 'checking'");
    expect(OTP_RESERVE).toContain("record.challenge_id ~= ARGV[4]");
    expect(OTP_RESERVE.indexOf("record.dispatch_state ~= 'checking'")).toBeLessThan(OTP_RESERVE.indexOf("redis.call('SETEX', KEYS[2]"));
    expect(OTP_RESERVE.indexOf("type(record.outcome.data)")).toBeLessThan(OTP_RESERVE.indexOf("redis.call('INCR'"));
    expect(OTP_RESERVE).toContain("120000,3600000,18000000,86400000,604800000");
    expect(OTP_RESERVE.indexOf("DAILY_LIMIT")).toBeLessThan(OTP_RESERVE.indexOf("redis.call('INCR'"));
    expect(OTP_RESERVE.indexOf("PHONE_LIMIT")).toBeLessThan(OTP_RESERVE.indexOf("redis.call('SETEX', KEYS[2]"));
    expect(OTP_VERIFY.indexOf("active.payload ~= ARGV[3]")).toBeLessThan(OTP_VERIFY.indexOf("redis.call('INCR'"));
    expect(OTP_FINALIZE).toContain("active.id == ARGV[1] and active_ttl > 0");
    expect(OTP_FINALIZE).toContain("PSETEX");
  });
});
