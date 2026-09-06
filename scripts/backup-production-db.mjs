import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  access,
  chmod,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { parse } from "dotenv";
const MAX_COMMAND_OUTPUT_BYTES = 5 * 1024 * 1024;

function resolveFromRoot(projectRoot, value) {
  return path.isAbsolute(value) ? value : path.resolve(projectRoot, value);
}

async function loadEnvironment(filePath, label) {
  let source;
  try {
    source = await readFile(filePath);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      throw new Error(`${label}_ENV_FILE_MISSING: ${filePath}`);
    }
    throw error;
  }
  return parse(source);
}
function requireEnvironmentValue(environment, name, label) {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${label}_ENV_MISSING_${name}`);
  return value;
}

function parseDatabaseUrl(rawValue, label) {
  let connection;
  try {
    connection = new URL(rawValue);
  } catch {
    throw new Error(`${label}_DATABASE_URL_INVALID`);
  }
  if (connection.protocol !== "postgres:" && connection.protocol !== "postgresql:") {
    throw new Error(`${label}_DATABASE_URL_INVALID_PROTOCOL`);
  }
  const database = decodeURIComponent(connection.pathname.replace(/^\//, ""));
  const username = decodeURIComponent(connection.username);
  const password = decodeURIComponent(connection.password);
  if (!connection.hostname || !database || !username || !password) {
    throw new Error(`${label}_DATABASE_URL_INCOMPLETE`);
  }
  return { connection, database, username, password };
}

function targetIdentity(rawValue, label) {
  const { connection, database, username } = parseDatabaseUrl(rawValue, label);
  const hostname = connection.hostname.toLowerCase();
  const directSupabaseMatch = hostname.match(/^db\.([^.]+)\.supabase\.co$/i);
  let projectRef = directSupabaseMatch?.[1];
  if (hostname.endsWith(".pooler.supabase.com")) {
    const separator = username.lastIndexOf(".");
    if (separator <= 0 || separator === username.length - 1) {
      throw new Error(`${label}_SUPABASE_POOLER_USERNAME_INVALID`);
    }
    projectRef = username.slice(separator + 1);
  }
  if (projectRef) return ["supabase", projectRef.toLowerCase(), database].join("|");
  return ["postgresql", hostname, connection.port || "5432", database].join("|");
}

function assertProductionTarget(prodEnvironment, stagingEnvironment) {
  if (requireEnvironmentValue(prodEnvironment, "NEXT_PUBLIC_APP_ENV", "PRODUCTION") !== "production") {
    throw new Error("PRODUCTION_ENV_MARKER_REQUIRED");
  }
  const prodDatabaseUrl = requireEnvironmentValue(prodEnvironment, "DATABASE_URL", "PRODUCTION");
  const prodDirectUrl = requireEnvironmentValue(prodEnvironment, "DIRECT_URL", "PRODUCTION");
  const stagingDatabaseUrl = requireEnvironmentValue(stagingEnvironment, "DATABASE_URL", "STAGING");
  const stagingDirectUrl = requireEnvironmentValue(stagingEnvironment, "DIRECT_URL", "STAGING");
  const prodTargets = new Set([
    targetIdentity(prodDatabaseUrl, "PRODUCTION_DATABASE_URL"),
    targetIdentity(prodDirectUrl, "PRODUCTION_DIRECT_URL"),
  ]);
  const stagingTargets = [
    targetIdentity(stagingDatabaseUrl, "STAGING_DATABASE_URL"),
    targetIdentity(stagingDirectUrl, "STAGING_DIRECT_URL"),
  ];
  if (stagingTargets.some((target) => prodTargets.has(target))) {
    throw new Error("PRODUCTION_TARGET_MATCHES_STAGING");
  }
  return { prodDatabaseUrl, prodDirectUrl };
}
function createPgEnvironment(rawDirectUrl) {
  const { connection, database, username, password } = parseDatabaseUrl(
    rawDirectUrl,
    "PRODUCTION_DIRECT_URL",
  );
  const environment = {
    ...process.env,
    PGHOST: connection.hostname,
    PGPORT: connection.port || "5432",
    PGDATABASE: database,
    PGUSER: username,
    PGPASSWORD: password,
    PGSSLMODE: connection.searchParams.get("sslmode") || "require",
    PGCONNECT_TIMEOUT: "15",
  };
  delete environment.DATABASE_URL;
  delete environment.DIRECT_URL;
  return { environment, password };
}
function appendBounded(chunks, currentBytes, chunk) {
  if (currentBytes >= MAX_COMMAND_OUTPUT_BYTES) return currentBytes;
  const buffer = Buffer.from(chunk);
  const remaining = MAX_COMMAND_OUTPUT_BYTES - currentBytes;
  chunks.push(buffer.subarray(0, remaining));
  return currentBytes + Math.min(buffer.byteLength, remaining);
}

async function runCommandWithSpawn({ command, args, env }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    child.stdout.on("data", (chunk) => {
      stdoutBytes = appendBounded(stdout, stdoutBytes, chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderrBytes = appendBounded(stderr, stderrBytes, chunk);
    });
    child.once("error", reject);
    child.once("close", (exitCode) => resolve({
      exitCode: exitCode ?? 1,
      stdout: Buffer.concat(stdout).toString("utf8"),
      stderr: Buffer.concat(stderr).toString("utf8"),
    }));
  });
}

function redact(value, secrets) {
  return secrets.reduce(
    (result, secret) => secret ? result.replaceAll(secret, "[REDACTED]") : result,
    value,
  );
}

async function assertFileDoesNotExist(filePath) {
  try {
    await access(filePath);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
    throw error;
  }
  throw new Error(`BACKUP_FILE_ALREADY_EXISTS: ${filePath}`);
}

async function hashFile(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

function restorePathForDumpPath(pgDumpPath) {
  if (pgDumpPath === "pg_dump") return "pg_restore";
  const extension = path.extname(pgDumpPath);
  return path.join(path.dirname(pgDumpPath), `pg_restore${extension}`);
}

/** Create and validate an atomic local archive of the production public schema. */
export async function runProductionBackup(
  options = {},
  dependencies = {},
) {
  const projectRoot = path.resolve(options.projectRoot ?? process.cwd());
  const envFile = resolveFromRoot(projectRoot, options.envFile ?? ".env.prod");
  const stagingEnvFile = resolveFromRoot(projectRoot, options.stagingEnvFile ?? ".env.staging");
  const outputDirectory = resolveFromRoot(
    projectRoot,
    options.outputDir ?? path.join("backups", "production"),
  );
  const pgDumpPath = options.pgDumpPath ?? "pg_dump";
  const pgRestorePath = options.pgRestorePath ?? restorePathForDumpPath(pgDumpPath);
  const now = options.now ?? new Date();
  const runCommand = dependencies.runCommand ?? runCommandWithSpawn;
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new Error("BACKUP_TIME_INVALID");

  const [prodEnvironment, stagingEnvironment] = await Promise.all([
    loadEnvironment(envFile, "PRODUCTION"),
    loadEnvironment(stagingEnvFile, "STAGING"),
  ]);
  const { prodDatabaseUrl, prodDirectUrl } = assertProductionTarget(prodEnvironment, stagingEnvironment);
  const { environment: pgEnvironment, password } = createPgEnvironment(prodDirectUrl);
  const timestamp = now.toISOString().replaceAll(":", "-").replace(".", "-");
  const filePath = path.join(outputDirectory, `production-public-${timestamp}.dump`);
  const partialPath = `${filePath}.partial`;
  await mkdir(outputDirectory, { recursive: true });
  await Promise.all([assertFileDoesNotExist(filePath), assertFileDoesNotExist(partialPath)]);

  const secrets = [prodDatabaseUrl, prodDirectUrl, password];
  try {
    const dumpResult = await runCommand({
      command: pgDumpPath,
      args: [
        "--format=custom",
        "--schema=public",
        "--strict-names",
        "--no-owner",
        "--no-privileges",
        "--no-subscriptions",
        "--no-password",
        "--lock-wait-timeout=5000",
        `--file=${partialPath}`,
      ],
      env: pgEnvironment,
    });
    if (dumpResult.exitCode !== 0) {
      const detail = redact(dumpResult.stderr || dumpResult.stdout || "unknown pg_dump error", secrets);
      throw new Error(`PG_DUMP_FAILED: ${detail.trim()}`);
    }

    const archiveStats = await stat(partialPath);
    if (!archiveStats.isFile() || archiveStats.size === 0) throw new Error("BACKUP_ARCHIVE_EMPTY");
    const restoreResult = await runCommand({
      command: pgRestorePath,
      args: ["--list", partialPath],
      env: { ...process.env },
    });
    if (restoreResult.exitCode !== 0) {
      const detail = redact(restoreResult.stderr || restoreResult.stdout || "unknown pg_restore error", secrets);
      throw new Error(`BACKUP_ARCHIVE_VALIDATION_FAILED: ${detail.trim()}`);
    }
    if (!/\bTABLE DATA public \S+/m.test(restoreResult.stdout)) {
      throw new Error("BACKUP_ARCHIVE_MISSING_PUBLIC_TABLE_DATA");
    }

    const sha256 = await hashFile(partialPath);
    await rename(partialPath, filePath);
    await chmod(filePath, 0o600);
    return { filePath, byteLength: archiveStats.size, sha256 };
  } catch (error) {
    await rm(partialPath, { force: true });
    if (error instanceof Error) {
      throw new Error(redact(error.message, secrets));
    }
    throw new Error("PRODUCTION_BACKUP_FAILED");
  }
}

function parseArguments(args) {
  const options = {};
  const supported = new Map([
    ["--env-file", "envFile"],
    ["--staging-env-file", "stagingEnvFile"],
    ["--output-dir", "outputDir"],
    ["--pg-dump", "pgDumpPath"],
    ["--pg-restore", "pgRestorePath"],
  ]);
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help") return { help: true };
    const key = supported.get(argument);
    const value = args[index + 1];
    if (!key || !value || value.startsWith("--")) throw new Error(`INVALID_ARGUMENT: ${argument}`);
    options[key] = value;
    index += 1;
  }
  return { options };
}

async function main() {
  const parsed = parseArguments(process.argv.slice(2));
  if (parsed.help) {
    console.log("Usage: npm run backup:prod -- [--output-dir PATH] [--pg-dump PATH] [--pg-restore PATH]");
    return;
  }
  const result = await runProductionBackup(parsed.options);
  console.log("PRODUCTION_BACKUP_OK");
  console.log(`File: ${result.filePath}`);
  console.log(`Bytes: ${result.byteLength}`);
  console.log(`SHA256: ${result.sha256}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "PRODUCTION_BACKUP_FAILED");
    process.exitCode = 1;
  });
}
