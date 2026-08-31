#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { loadAttestation } from "./attestation.mjs";
import { validateRunId } from "./core.mjs";
import { executePlan, executeSmoke, executeFull, runnerEnvironment } from "./runner.mjs";
import { persistReport, printReport, reportFromError } from "./reports.mjs";
import { TestFailure } from "./errors.mjs";
import { executeRecovery } from "./recover-run.mjs";

const RUN_ROOT = path.resolve(process.cwd(), ".staging-test-runs");
const PROFILE = process.argv[2];

function newRunId() {
  return `run_${randomUUID().replaceAll("-", "").slice(0, 20)}`;
}

function readJournal(runId) {
  const safeRunId = validateRunId(runId);
  const journalPath = path.join(RUN_ROOT, safeRunId, "journal.ndjson");
  if (!fs.existsSync(journalPath)) throw new TestFailure("EXACT_RUN_JOURNAL_NOT_FOUND");
  return fs.readFileSync(journalPath, "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line));
}

async function execute(profile, runId) {
  const env = runnerEnvironment();
  const attestation = loadAttestation(RUN_ROOT);
  if (profile === "plan") return executePlan({ env, attestation });
  if (profile === "smoke") return executeSmoke({ runRoot: RUN_ROOT, runId, env, attestation });
  if (profile === "full") return executeFull({ runRoot: RUN_ROOT, runId, env, attestation,
    onWait: event => process.stdout.write(`[staging] ${event.code}: ${Math.ceil(event.remainingMs / 1000)}s\n`),
  });
  throw new TestFailure("PROFILE_INVALID");
}

async function main() {
  if (PROFILE === "recover") {
    const index = process.argv.indexOf("--run-id");
    const runId = validateRunId(index >= 0 ? process.argv[index + 1] ?? "" : "");
    let report;
    try {
      readJournal(runId);
      const result = await executeRecovery({ runRoot: RUN_ROOT, runId, env: runnerEnvironment(), attestation: loadAttestation(RUN_ROOT) });
      report = { runId, profile: "recover", ...result };
    } catch (error) { report = reportFromError({ runId, profile: "recover", error }); }
    const directory = path.join(RUN_ROOT, runId);
    if (fs.existsSync(directory)) fs.writeFileSync(path.join(directory, `recovery-${Date.now()}.json`), JSON.stringify(report), { flag: "wx", mode: 0o600 });
    return printReport(report);
  }
  const runId = newRunId();
  const createdAt = new Date().toISOString();
  let report;
  try {
    const result = await execute(PROFILE, runId);
    report = { runId, profile: PROFILE, createdAt, ...result };
  } catch (error) {
    report = reportFromError({ runId, profile: PROFILE ?? "invalid", error, createdAt });
  }
  persistReport({ runRoot: RUN_ROOT, report });
  return printReport(report);
}

try { process.exitCode = await main(); }
catch (error) {
  const report = reportFromError({ runId: "run_invalid_input", profile: PROFILE ?? "invalid", error });
  process.exitCode = printReport(report);
}
