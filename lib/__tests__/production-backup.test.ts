import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

interface CommandRequest {
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
}

interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

interface BackupResult {
  filePath: string;
  byteLength: number;
  sha256: string;
}

interface ProductionBackupModule {
  runProductionBackup: (
    options: { projectRoot: string; now: Date },
    dependencies: { runCommand: (request: CommandRequest) => Promise<CommandResult> },
  ) => Promise<BackupResult>;
}

const scriptPath = path.resolve(process.cwd(), "scripts/backup-production-db.mjs");
const temporaryDirectories: string[] = [];

async function createProjectRoot(): Promise<string> {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "matcha-production-backup-"));
  temporaryDirectories.push(projectRoot);
  await writeFile(
    path.join(projectRoot, ".env.prod"),
    [
      "NEXT_PUBLIC_APP_ENV=production",
      "DATABASE_URL=postgresql://prod_user:prod_database_password@db.prod-ref.supabase.co:5432/postgres?sslmode=require",
      "DIRECT_URL=postgresql://prod_user:prod_direct_password@db.prod-ref.supabase.co:5432/postgres?sslmode=require",
    ].join("\n"),
  );
  await writeFile(
    path.join(projectRoot, ".env.staging"),
    [
      "NEXT_PUBLIC_APP_ENV=staging",
      "DATABASE_URL=postgresql://staging_user:staging_password@db.staging-ref.supabase.co:5432/postgres?sslmode=require",
      "DIRECT_URL=postgresql://staging_user:staging_password@db.staging-ref.supabase.co:5432/postgres?sslmode=require",
    ].join("\n"),
  );
  return projectRoot;
}

async function loadSubject(): Promise<ProductionBackupModule> {
  expect(existsSync(scriptPath)).toBe(true);
  return import(`${pathToFileURL(scriptPath).href}?test=${Date.now()}`) as Promise<ProductionBackupModule>;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("Backup database production", () => {
  it("tạo archive public atomic mà không đưa credential vào command line", async () => {
    const { runProductionBackup } = await loadSubject();
    const projectRoot = await createProjectRoot();
    const calls: CommandRequest[] = [];
    const archive = Buffer.from("valid-production-dump");

    const result = await runProductionBackup(
      { projectRoot, now: new Date("2026-09-06T04:05:06.789Z") },
      {
        runCommand: async (request) => {
          calls.push(request);
          if (request.command === "pg_dump") {
            const fileArgument = request.args.find((argument) => argument.startsWith("--file="));
            expect(fileArgument).toBeDefined();
            await writeFile(fileArgument!.slice("--file=".length), archive);
            return { exitCode: 0, stdout: "", stderr: "" };
          }
          return {
            exitCode: 0,
            stdout: "; Archive created at 2026-09-06\n1234; 0 5678 TABLE DATA public orders postgres\n",
            stderr: "",
          };
        },
      },
    );

    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({
      command: "pg_dump",
      args: expect.arrayContaining([
        "--format=custom",
        "--schema=public",
        "--no-owner",
        "--no-privileges",
        "--no-subscriptions",
        "--lock-wait-timeout=5000",
      ]),
    });
    expect(calls[0]!.args.join(" ")).not.toContain("prod_direct_password");
    expect(calls[0]!.args.join(" ")).not.toContain("postgresql://");
    expect(calls[0]!.env).toMatchObject({
      PGHOST: "db.prod-ref.supabase.co",
      PGPORT: "5432",
      PGDATABASE: "postgres",
      PGUSER: "prod_user",
      PGPASSWORD: "prod_direct_password",
      PGSSLMODE: "require",
    });
    expect(calls[1]).toMatchObject({
      command: "pg_restore",
      args: ["--list", expect.stringMatching(/\.partial$/)],
    });
    expect(result.filePath).toBe(path.join(
      projectRoot,
      "backups",
      "production",
      "production-public-2026-09-06T04-05-06-789Z.dump",
    ));
    expect(await readFile(result.filePath)).toEqual(archive);
    expect(result.byteLength).toBe(archive.byteLength);
    expect(result.sha256).toBe(createHash("sha256").update(archive).digest("hex"));
    expect(existsSync(`${result.filePath}.partial`)).toBe(false);
  });

  it("từ chối chạy nếu prod và staging trỏ tới cùng database", async () => {
    const { runProductionBackup } = await loadSubject();
    const projectRoot = await createProjectRoot();
    await writeFile(
      path.join(projectRoot, ".env.staging"),
      [
        "NEXT_PUBLIC_APP_ENV=staging",
        "DATABASE_URL=postgresql://prod_user:other_password@db.prod-ref.supabase.co:5432/postgres?sslmode=require",
        "DIRECT_URL=postgresql://prod_user:other_password@db.prod-ref.supabase.co:5432/postgres?sslmode=require",
      ].join("\n"),
    );
    const runCommand = vi.fn<(request: CommandRequest) => Promise<CommandResult>>(async () => {
      throw new Error("UNEXPECTED_COMMAND_EXECUTION");
    });

    await expect(runProductionBackup(
      { projectRoot, now: new Date("2026-09-06T04:05:06.789Z") },
      { runCommand },
    )).rejects.toThrow("PRODUCTION_TARGET_MATCHES_STAGING");
    expect(runCommand).not.toHaveBeenCalled();
  });

  it("từ chối cùng direct database dù username khác nhau", async () => {
    const { runProductionBackup } = await loadSubject();
    const projectRoot = await createProjectRoot();
    await writeFile(
      path.join(projectRoot, ".env.staging"),
      [
        "NEXT_PUBLIC_APP_ENV=staging",
        "DATABASE_URL=postgresql://alternate_role:other_password@db.prod-ref.supabase.co:5432/postgres?sslmode=require",
        "DIRECT_URL=postgresql://alternate_role:other_password@db.prod-ref.supabase.co:5432/postgres?sslmode=require",
      ].join("\n"),
    );
    const runCommand = vi.fn<(request: CommandRequest) => Promise<CommandResult>>(async () => {
      throw new Error("UNEXPECTED_COMMAND_EXECUTION");
    });

    await expect(runProductionBackup(
      { projectRoot, now: new Date("2026-09-06T04:05:06.789Z") },
      { runCommand },
    )).rejects.toThrow("PRODUCTION_TARGET_MATCHES_STAGING");
    expect(runCommand).not.toHaveBeenCalled();
  });

  it("cho phép hai Supabase project khác nhau dùng chung shared pooler", async () => {
    const { runProductionBackup } = await loadSubject();
    const projectRoot = await createProjectRoot();
    await writeFile(
      path.join(projectRoot, ".env.prod"),
      [
        "NEXT_PUBLIC_APP_ENV=production",
        "DATABASE_URL=postgresql://reporting.readonly.prod-ref:prod_database_password@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=require",
        "DIRECT_URL=postgresql://reporting.readonly.prod-ref:prod_direct_password@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=require",
      ].join("\n"),
    );
    await writeFile(
      path.join(projectRoot, ".env.staging"),
      [
        "NEXT_PUBLIC_APP_ENV=staging",
        "DATABASE_URL=postgresql://analytics.readonly.staging-ref:staging_password@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=require",
        "DIRECT_URL=postgresql://analytics.readonly.staging-ref:staging_password@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=require",
      ].join("\n"),
    );
    const archive = Buffer.from("valid-production-dump");
    const runCommand = vi.fn(async (request: CommandRequest): Promise<CommandResult> => {
      if (request.command === "pg_dump") {
        const fileArgument = request.args.find((argument) => argument.startsWith("--file="));
        await writeFile(fileArgument!.slice("--file=".length), archive);
        return { exitCode: 0, stdout: "", stderr: "" };
      }
      return {
        exitCode: 0,
        stdout: "1234; 0 5678 TABLE DATA public orders postgres\n",
        stderr: "",
      };
    });

    await expect(runProductionBackup(
      { projectRoot, now: new Date("2026-09-06T04:05:06.789Z") },
      { runCommand },
    )).resolves.toMatchObject({ byteLength: archive.byteLength });
    expect(runCommand).toHaveBeenCalled();
  });

  it("từ chối cùng shared pooler project ref khi role thường thay đổi", async () => {
    const { runProductionBackup } = await loadSubject();
    const projectRoot = await createProjectRoot();
    await writeFile(path.join(projectRoot, ".env.prod"), [
      "NEXT_PUBLIC_APP_ENV=production",
      "DATABASE_URL=postgresql://postgres.prod-ref:prod_password@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres",
      "DIRECT_URL=postgresql://postgres.prod-ref:prod_password@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres",
    ].join("\n"));
    await writeFile(path.join(projectRoot, ".env.staging"), [
      "NEXT_PUBLIC_APP_ENV=staging",
      "DATABASE_URL=postgresql://readonly.prod-ref:staging_password@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres",
      "DIRECT_URL=postgresql://readonly.prod-ref:staging_password@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres",
    ].join("\n"));
    const runCommand = vi.fn<(request: CommandRequest) => Promise<CommandResult>>(async () => {
      throw new Error("UNEXPECTED_COMMAND_EXECUTION");
    });

    await expect(runProductionBackup(
      { projectRoot, now: new Date("2026-09-06T04:05:06.789Z") },
      { runCommand },
    )).rejects.toThrow("PRODUCTION_TARGET_MATCHES_STAGING");
    expect(runCommand).not.toHaveBeenCalled();
  });

  it("từ chối cùng shared pooler project ref khi role chứa dấu chấm", async () => {
    const { runProductionBackup } = await loadSubject();
    const projectRoot = await createProjectRoot();
    await writeFile(path.join(projectRoot, ".env.prod"), [
      "NEXT_PUBLIC_APP_ENV=production",
      "DATABASE_URL=postgresql://reporting.readonly.prod-ref:prod_password@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres",
      "DIRECT_URL=postgresql://reporting.readonly.prod-ref:prod_password@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres",
    ].join("\n"));
    await writeFile(path.join(projectRoot, ".env.staging"), [
      "NEXT_PUBLIC_APP_ENV=staging",
      "DATABASE_URL=postgresql://audit.viewer.prod-ref:staging_password@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres",
      "DIRECT_URL=postgresql://audit.viewer.prod-ref:staging_password@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres",
    ].join("\n"));
    const runCommand = vi.fn<(request: CommandRequest) => Promise<CommandResult>>(async () => {
      throw new Error("UNEXPECTED_COMMAND_EXECUTION");
    });

    await expect(runProductionBackup(
      { projectRoot, now: new Date("2026-09-06T04:05:06.789Z") },
      { runCommand },
    )).rejects.toThrow("PRODUCTION_TARGET_MATCHES_STAGING");
    expect(runCommand).not.toHaveBeenCalled();
  });

  it("fail closed khi shared pooler username không có project ref", async () => {
    const { runProductionBackup } = await loadSubject();
    const projectRoot = await createProjectRoot();
    await writeFile(path.join(projectRoot, ".env.staging"), [
      "NEXT_PUBLIC_APP_ENV=staging",
      "DATABASE_URL=postgresql://postgres:staging_password@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres",
      "DIRECT_URL=postgresql://postgres:staging_password@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres",
    ].join("\n"));
    const runCommand = vi.fn<(request: CommandRequest) => Promise<CommandResult>>(async () => {
      throw new Error("UNEXPECTED_COMMAND_EXECUTION");
    });

    await expect(runProductionBackup(
      { projectRoot, now: new Date("2026-09-06T04:05:06.789Z") },
      { runCommand },
    )).rejects.toThrow("STAGING_DATABASE_URL_SUPABASE_POOLER_USERNAME_INVALID");
    expect(runCommand).not.toHaveBeenCalled();
  });

  it("từ chối direct và shared pooler của cùng Supabase project", async () => {
    const { runProductionBackup } = await loadSubject();
    const projectRoot = await createProjectRoot();
    await writeFile(
      path.join(projectRoot, ".env.staging"),
      [
        "NEXT_PUBLIC_APP_ENV=staging",
        "DATABASE_URL=postgresql://postgres.prod-ref:staging_password@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=require",
        "DIRECT_URL=postgresql://postgres.prod-ref:staging_password@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=require",
      ].join("\n"),
    );
    const runCommand = vi.fn<(request: CommandRequest) => Promise<CommandResult>>(async () => {
      throw new Error("UNEXPECTED_COMMAND_EXECUTION");
    });

    await expect(runProductionBackup(
      { projectRoot, now: new Date("2026-09-06T04:05:06.789Z") },
      { runCommand },
    )).rejects.toThrow("PRODUCTION_TARGET_MATCHES_STAGING");
    expect(runCommand).not.toHaveBeenCalled();
  });

  it("xóa file partial và che credential khi pg_dump thất bại", async () => {
    const { runProductionBackup } = await loadSubject();
    const projectRoot = await createProjectRoot();
    const secret = "prod_direct_password";

    const run = runProductionBackup(
      { projectRoot, now: new Date("2026-09-06T04:05:06.789Z") },
      {
        runCommand: async (request) => {
          const fileArgument = request.args.find((argument) => argument.startsWith("--file="));
          await writeFile(fileArgument!.slice("--file=".length), "partial");
          return { exitCode: 1, stdout: "", stderr: `connection failed for ${secret}` };
        },
      },
    );

    await expect(run).rejects.not.toThrow(secret);
    expect(await readdir(path.join(projectRoot, "backups", "production"))).toEqual([]);
  });

  it("không công nhận archive nếu pg_restore không đọc được table data", async () => {
    const { runProductionBackup } = await loadSubject();
    const projectRoot = await createProjectRoot();

    const run = runProductionBackup(
      { projectRoot, now: new Date("2026-09-06T04:05:06.789Z") },
      {
        runCommand: async (request) => {
          if (request.command === "pg_dump") {
            const fileArgument = request.args.find((argument) => argument.startsWith("--file="));
            await writeFile(fileArgument!.slice("--file=".length), "invalid-dump");
          }
          return { exitCode: 0, stdout: "; archive without application table data", stderr: "" };
        },
      },
    );

    await expect(run).rejects.toThrow("BACKUP_ARCHIVE_MISSING_PUBLIC_TABLE_DATA");
    expect(await readdir(path.join(projectRoot, "backups", "production"))).toEqual([]);
  });
});
