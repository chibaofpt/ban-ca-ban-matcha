import path from "node:path";
import { validateRunId } from "./core.mjs";

export const MUTATION_TYPES = Object.freeze(["login", "refresh", "logout", "exchange", "create", "confirm", "status", "cancel"]);
const OPERATION_ID = /^op_[a-z0-9][a-z0-9_-]{7,63}$/;

function validateOperationId(operationId) {
  if (!OPERATION_ID.test(operationId)) throw new Error("Invalid operation id");
  return operationId;
}

/** Create an exact-run journal whose intents are durable before mutation dispatch. */
export function createJournal({ fs, rootDir, runId, now }) {
  const safeRunId = validateRunId(runId);
  const runDir = path.resolve(rootDir, safeRunId);
  if (path.dirname(runDir) !== path.resolve(rootDir)) throw new Error("Run id escaped journal root");
  fs.mkdirSync(runDir, { recursive: false });
  const journalPath = path.join(runDir, "journal.ndjson");
  return journalWriter({ fs, runDir, journalPath, now });
}

function journalWriter({ fs, runDir, journalPath, now }) {
  const record = (entry) => {
    fs.appendFileSync(journalPath, `${JSON.stringify(entry)}\n`, { encoding: "utf8", flush: true });
    return entry;
  };
  return {
    runDir,
    recordIntent(type, operationId, recovery) {
      if (!MUTATION_TYPES.includes(type)) throw new Error("Unsupported mutation type");
      return record({ state: "INTENT", type, operationId: validateOperationId(operationId), at: now().toISOString(), recovery });
    },
    recordOutcome(type, operationId, outcome, evidence = {}) {
      if (!MUTATION_TYPES.includes(type)) throw new Error("Unsupported mutation type");
      if (!["APPLIED", "NOT_APPLIED", "AMBIGUOUS", "RECOVERED"].includes(outcome)) throw new Error("Unsupported mutation outcome");
      return record({ state: outcome, type, operationId: validateOperationId(operationId), at: now().toISOString(), evidence });
    },
  };
}

/** Open one existing exact-run journal for append-only recovery outcomes. */
export function openJournal({ fs, rootDir, runId, now }) {
  const safeRunId = validateRunId(runId);
  const runDir = path.resolve(rootDir, safeRunId);
  if (path.dirname(runDir) !== path.resolve(rootDir)) throw new Error("Run id escaped journal root");
  const journalPath = path.join(runDir, "journal.ndjson");
  const stat = fs.lstatSync(journalPath);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Invalid exact-run journal file");
  return journalWriter({ fs, runDir, journalPath, now });
}

/** Decide whether a journal requires exact-run recovery before more mutations. */
export function journalNeedsRecovery(entries) {
  const latest = new Map();
  for (const entry of entries) {
    const operationId = validateOperationId(entry.operationId);
    latest.set(operationId, entry.state);
  }
  return [...latest.values()].some((state) => state === "INTENT" || state === "AMBIGUOUS");
}
