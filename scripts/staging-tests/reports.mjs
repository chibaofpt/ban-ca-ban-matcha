import fs from "node:fs";
import path from "node:path";
import { redact, statusExitCode, validateRunId } from "./core.mjs";

/** Persist one report inside its exact ignored run directory. */
export function persistReport({ runRoot, report }) {
  const runId = validateRunId(report.runId);
  const root = path.resolve(runRoot);
  const runDir = path.resolve(root, runId);
  if (path.dirname(runDir) !== root) throw new Error("Report path escaped run root");
  fs.mkdirSync(runDir, { recursive: true });
  const file = path.join(runDir, "report.json");
  fs.writeFileSync(file, `${JSON.stringify(redact(report), null, 2)}\n`, {
    encoding: "utf8", flag: fs.existsSync(file) ? "w" : "wx", mode: 0o600,
  });
  return file;
}

/** Print only the report-safe execution summary consumed by people and CI. */
export function printReport(report) {
  console.log(JSON.stringify(redact({
    runId: report.runId, profile: report.profile, status: report.status,
    reasons: report.reasons ?? [], summary: report.summary ?? {},
  })));
  return statusExitCode(report.status);
}

/** Map operational errors to documented FAIL/PARTIAL without exposing payloads. */
export function reportFromError({ runId, profile, error, createdAt = new Date().toISOString() }) {
  return {
    runId, profile, createdAt,
    status: error?.status === "PARTIAL" ? "PARTIAL" : "FAIL",
    reasons: [typeof error?.code === "string" ? error.code : "UNEXPECTED_RUNNER_ERROR"],
  };
}
