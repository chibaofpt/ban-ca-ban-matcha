import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationDirectories = [
  "20260912150000_private_voucher_visibility",
  "20260912150100_private_voucher_validate_constraints",
  "20260912150200_private_voucher_manual_request_index",
  "20260912150300_private_voucher_admin_index",
  "20260912150400_private_voucher_package_source_index",
] as const;
const migrationPaths = migrationDirectories.map((directory) =>
  join(process.cwd(), "prisma/migrations", directory, "migration.sql"),
);
const oldMigrationPath = join(
  process.cwd(),
  "prisma/migrations/20260912_private_voucher_visibility/migration.sql",
);

function readMigration(index: number): string {
  const path = migrationPaths[index];
  if (!path) throw new Error(`Missing private voucher migration at index ${index}`);
  return readFileSync(path, "utf8");
}

function readAllMigrations(): string {
  return migrationPaths.map((path) => readFileSync(path, "utf8")).join("\n");
}

function executableStatements(sql: string): string[] {
  return sql
    .replace(/^\s*--.*$/gm, "")
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

function normalizeStatement(statement: string): string {
  return statement.replace(/\s+/g, " ").trim();
}

describe("static SQL contract — private voucher migration layout", () => {
  it("uses the exact ordered migration directories and removes the old path", () => {
    expect(migrationDirectories).toEqual([
      "20260912150000_private_voucher_visibility",
      "20260912150100_private_voucher_validate_constraints",
      "20260912150200_private_voucher_manual_request_index",
      "20260912150300_private_voucher_admin_index",
      "20260912150400_private_voucher_package_source_index",
    ]);
    for (const path of migrationPaths) expect(existsSync(path)).toBe(true);
    expect(existsSync(oldMigrationPath)).toBe(false);
  });

  it("keeps the base migration additive and defers validation and indexes", () => {
    const sql = readMigration(0);

    expect(sql).toContain('CREATE TYPE "VoucherPackageVisibility" AS ENUM (\'PUBLIC\', \'PRIVATE\')');
    expect(sql).toContain('ADD COLUMN "visibility" "VoucherPackageVisibility" NOT NULL DEFAULT \'PUBLIC\'');
    expect(sql).toContain("ALTER TYPE \"VoucherAcquisitionMode\" ADD VALUE 'NONE'");
    expect(sql).toContain("ALTER TYPE \"VoucherAcquisitionMode\" ADD VALUE 'ADMIN'");
    expect(sql).toContain('ADD CONSTRAINT "voucher_packages_visibility_acquisition_mode_check"\n  CHECK (\n    ("visibility"::text = \'PRIVATE\' AND "acquisition_mode"::text = \'NONE\')\n    OR ("visibility"::text = \'PUBLIC\' AND "acquisition_mode"::text IN (\'POINTS_EXCHANGE\', \'FREE_CLAIM\', \'AUTO_GRANT\'))\n  ) NOT VALID;');
    const packageConstraint = sql.match(/ADD CONSTRAINT "voucher_packages_visibility_acquisition_mode_check"[\s\S]*?\n  \) NOT VALID;/);
    expect(packageConstraint).not.toBeNull();
    expect(packageConstraint?.[0]).not.toContain("'ADMIN'");
    expect(sql).toContain('ADD COLUMN "issuing_admin_id" UUID');
    expect(sql).toContain('ADD COLUMN "manual_request_id" UUID');
    expect(sql).toContain('ADD CONSTRAINT "vouchers_issued_via_not_none_check"\n  CHECK ("issued_via"::text <> \'NONE\') NOT VALID;');
    expect(sql).toContain('ADD CONSTRAINT "vouchers_admin_audit_fields_check"');
    expect(sql).toContain('"issued_via"::text = \'ADMIN\'');
    expect(sql).toContain('"issued_via"::text <> \'ADMIN\'');
    expect(sql).toContain('"issuing_admin_id" IS NOT NULL');
    expect(sql).toContain('"manual_request_id" IS NOT NULL');
    expect(sql).toContain('"issuing_admin_id" IS NULL');
    expect(sql).toContain('"manual_request_id" IS NULL');
    expect(sql).toMatch(/ADD CONSTRAINT "vouchers_admin_audit_fields_check"[\s\S]*?NOT VALID;/);
    expect(sql).toMatch(/ADD CONSTRAINT "vouchers_issuing_admin_id_fkey"[\s\S]*?ON DELETE NO ACTION ON UPDATE NO ACTION\s+NOT VALID;/);
    expect(sql).not.toMatch(/\bVALIDATE CONSTRAINT\b/);
    expect(sql).not.toMatch(/\bCREATE\s+(?:UNIQUE\s+)?INDEX\b/i);
    const allSql = readAllMigrations();
    expect(allSql).not.toMatch(/CREATE TYPE\s+"VoucherIssuedVia"/);
    expect(allSql).not.toMatch(/ALTER COLUMN\s+"issued_via"\s+TYPE/);
    expect(allSql).not.toMatch(/ALTER COLUMN\s+"issued_via"\s+(?:DROP|SET)\s+DEFAULT/);
    expect(allSql).not.toContain('USING ("issued_via"::text::"VoucherIssuedVia")');
  });

  it("validates exactly the four base constraints in a separate migration", () => {
    const sql = readMigration(1);
    const statements = executableStatements(sql).map(normalizeStatement);

    expect(statements).toEqual([
      'ALTER TABLE "voucher_packages" VALIDATE CONSTRAINT "voucher_packages_visibility_acquisition_mode_check"',
      'ALTER TABLE "vouchers" VALIDATE CONSTRAINT "vouchers_issued_via_not_none_check"',
      'ALTER TABLE "vouchers" VALIDATE CONSTRAINT "vouchers_admin_audit_fields_check"',
      'ALTER TABLE "vouchers" VALIDATE CONSTRAINT "vouchers_issuing_admin_id_fkey"',
    ]);
    expect(sql).not.toMatch(/\bADD CONSTRAINT\b/);
    expect(sql).not.toMatch(/\bCREATE\s+(?:UNIQUE\s+)?INDEX\b/i);
  });

  it("builds each new index as one concurrent statement", () => {
    const expectedStatements = [
      'CREATE UNIQUE INDEX CONCURRENTLY "vouchers_manual_request_id_key" ON "vouchers"("manual_request_id")',
      'CREATE INDEX CONCURRENTLY "vouchers_issuing_admin_id_idx" ON "vouchers"("issuing_admin_id")',
      'CREATE INDEX CONCURRENTLY "idx_vouchers_package_issued_via" ON "vouchers"("package_id", "issued_via")',
    ];

    for (const [offset, expected] of expectedStatements.entries()) {
      const sql = readMigration(offset + 2);
      const statements = executableStatements(sql);
      expect(statements).toHaveLength(1);
      expect(normalizeStatement(statements[0]!)).toBe(expected);
      expect(sql).not.toMatch(/\b(?:BEGIN|COMMIT|SET)\b/i);
    }
  });
});
