import path from "node:path";

const STATE_NAME = "state.ndjson";
const FORBIDDEN_KEY = /(password|cookie|authorization|refresh_token|access_token|secret)/i;

function assertNoCredentials(value, key = "") {
  if (FORBIDDEN_KEY.test(key)) throw new Error("Credential fields are forbidden in run state");
  if (Array.isArray(value)) value.forEach(item => assertNoCredentials(item));
  else if (value && typeof value === "object") {
    for (const [childKey, child] of Object.entries(value)) assertNoCredentials(child, childKey);
  }
}

function statePath(runDir) {
  const root = path.resolve(runDir);
  const file = path.resolve(root, STATE_NAME);
  if (path.dirname(file) !== root) throw new Error("Run state escaped its directory");
  return file;
}

function append(fs, file, entry) {
  assertNoCredentials(entry);
  fs.appendFileSync(file, `${JSON.stringify(entry)}\n`, { encoding: "utf8", flush: true });
}

/** Create an append-only, credential-free manifest used by exact-run recovery. */
export function createRunState({ fs, runDir, initial }) {
  const file = statePath(runDir);
  assertNoCredentials(initial);
  fs.writeFileSync(file, `${JSON.stringify({ event: "INITIAL", ...initial })}\n`, { encoding: "utf8", flag: "wx", mode: 0o600, flush: true });
  return {
    addMarker(marker) { append(fs, file, { event: "MARKER", marker }); },
    addVoucher(voucherId) { append(fs, file, { event: "VOUCHER", voucherId }); },
    addSession(actor, sessionId) { append(fs, file, { event: "SESSION", actor, sessionId }); },
  };
}

/** Restore the latest append-only recovery scope without loading any credential. */
export function loadRunState({ fs, runDir }) {
  const file = statePath(runDir);
  const rows = fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line));
  if (rows[0]?.event !== "INITIAL") throw new Error("Run state initial record is missing");
  const initial = Object.fromEntries(Object.entries(rows[0]).filter(([key]) => key !== "event"));
  const markers = new Set();
  const voucherIds = new Set();
  const sessions = new Map();
  for (const row of rows.slice(1)) {
    if (row.event === "MARKER") markers.add(row.marker);
    if (row.event === "VOUCHER") voucherIds.add(row.voucherId);
    if (row.event === "SESSION") {
      if (!sessions.has(row.actor)) sessions.set(row.actor, new Set());
      sessions.get(row.actor).add(row.sessionId);
    }
  }
  return {
    ...initial,
    markers: [...markers],
    voucherIds: [...voucherIds],
    runSessionIds: Object.fromEntries([...sessions].map(([actor, ids]) => [actor, [...ids]])),
  };
}
