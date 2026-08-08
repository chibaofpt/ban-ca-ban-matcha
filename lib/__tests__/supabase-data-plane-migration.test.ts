import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const schema = readFileSync(join(process.cwd(), "prisma", "schema.prisma"), "utf8");
const migration = readFileSync(
  join(
    process.cwd(),
    "prisma",
    "migrations",
    "20260804000000_harden_supabase_data_plane",
    "migration.sql",
  ),
  "utf8",
);

function prismaTableNames(): string[] {
  return [...schema.matchAll(/@@map\("([^"]+)"\)/g)]
    .map((match) => match[1])
    .sort();
}

describe("migration hardening Supabase Data API", () => {
  it("bật RLS, không FORCE, cho mọi bảng Prisma quản lý", () => {
    const enabledTables = [...migration.matchAll(
      /ALTER TABLE IF EXISTS public\."([^"]+)" ENABLE ROW LEVEL SECURITY;/g,
    )].map((match) => match[1]).sort();

    expect(enabledTables).toEqual(prismaTableNames());
    expect(migration).not.toMatch(/FORCE ROW LEVEL SECURITY/i);
    expect(migration).not.toMatch(/CREATE\s+POLICY/i);
    expect(migration).not.toMatch(/auth\.uid\s*\(/i);
  });

  it("thu hồi quyền Data API rộng và chỉ cấp đúng refresh-session surface", () => {
    expect(migration).toMatch(
      /REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated, service_role;/,
    );
    expect(migration).toMatch(
      /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\.sessions TO service_role;/,
    );
    expect(migration).toMatch(
      /GRANT SELECT \(id, role, phone_number\) ON TABLE public\.users TO service_role;/,
    );
    expect(migration).toMatch(/GRANT USAGE ON SCHEMA public TO service_role;/);
    expect(migration).not.toMatch(/GRANT\s+ALL/i);
  });

  it("khóa function và default privileges trong public nhưng không đụng storage", () => {
    expect(migration).toMatch(
      /REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated, service_role;/,
    );
    expect(migration).toMatch(/ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public/);
    expect(migration).not.toMatch(/\bstorage\./i);
    expect(migration).not.toMatch(/SCHEMA storage/i);
  });
});
