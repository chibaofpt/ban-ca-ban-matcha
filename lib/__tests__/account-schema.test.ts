import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const schema = readFileSync(new URL("../../prisma/schema.prisma", import.meta.url), "utf8");

describe("Schema tai khoan Google — STATIC_ARTIFACT", () => {
  it("cho phep khach Google chua co so dien thoai hoac mat khau", () => {
    const user = schema.match(/model User \{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(user).toMatch(/phone_number\s+String\?\s+@unique/);
    expect(user).toMatch(/password_hash\s+String\?/);
    expect(user).toMatch(/email\s+String\?\s+@unique/);
    expect(user).toMatch(/google_sub\s+String\?\s+@unique/);
    expect(user).toMatch(/account_origin\s+AccountOrigin/);
  });
  it("luu rieng claim mot lan, challenge Google va anh xa gop", () => {
    expect(schema).toMatch(/model AccountClaimLink \{/);
    expect(schema).toMatch(/model GoogleAuthAttempt \{/);
    expect(schema).toMatch(/model AccountMerge \{/);
    const claim = schema.match(/model AccountClaimLink \{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(claim).toMatch(/token_hash\s+String\s+@unique/);
    expect(claim).toMatch(/consumed_at\s+DateTime\?/);
    expect(claim).not.toMatch(/\btoken\s+String/);
  });
});

describe("Account migration — STATIC_ARTIFACT, not database execution", () => {
  const migration = readFileSync(new URL("../../prisma/migrations/20261009000000_google_account_claims/migration.sql", import.meta.url), "utf8");
  it("preserves legacy identity and denies exposed API access to proof tables", () => {
    expect(migration).toContain("DEFAULT 'LEGACY_PHONE'");
    expect(migration).toContain('ALTER COLUMN "phone_number" DROP NOT NULL');
    for (const table of ["account_claim_links", "google_auth_attempts", "account_merges"]) {
      expect(migration).toContain('ALTER TABLE public."' + table + '" ENABLE ROW LEVEL SECURITY');
    }
    expect(migration).toContain("FROM PUBLIC, anon, authenticated, service_role");
    expect(migration).toContain('GRANT SELECT (source_user_id, target_user_id) ON TABLE public."account_merges" TO service_role');
    expect(migration).not.toMatch(/GRANT SELECT ON|GRANT ALL/);
    expect(migration).not.toMatch(/DROP TABLE|DELETE FROM|UPDATE "users"/);
  });
});