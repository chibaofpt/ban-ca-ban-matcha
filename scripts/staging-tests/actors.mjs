import fs from "node:fs";
import path from "node:path";
import { CookieJar, createApi } from "./http.mjs";
import { AmbiguousMutation } from "./http.mjs";
import { operationId } from "./operations.mjs";
import { assertWriteGate, invariant, prerequisite } from "./errors.mjs";

export function normalizePhone(phone) {
  const clean = String(phone ?? "").replace(/[\s().-]/g, "");
  if (/^0\d{9}$/.test(clean)) return `+84${clean.slice(1)}`;
  if (/^84\d{9}$/.test(clean)) return `+${clean}`;
  return clean;
}

export function credentials(env) {
  return {
    customerA: { phone: normalizePhone(env.TEST_CUSTOMER_A_PHONE), password: env.TEST_CUSTOMER_A_PASSWORD, role: "CUSTOMER" },
    customerB: { phone: normalizePhone(env.TEST_CUSTOMER_B_PHONE), password: env.TEST_CUSTOMER_B_PASSWORD, role: "CUSTOMER" },
    admin: { phone: normalizePhone(env.TEST_ADMIN_PHONE), password: env.TEST_ADMIN_PASSWORD, role: "ADMIN" },
    staff: { phone: normalizePhone(env.TEST_STAFF_PHONE), password: env.TEST_STAFF_PASSWORD, role: "STAFF" },
  };
}

function sessionPath(runDir, name) { return path.join(runDir, "sessions", `${name}.json`); }

function cookiePersistence(runDir, name) {
  invariant(["customerA", "customerB", "admin", "staff"].includes(name), "SESSION_ACTOR_NAME_INVALID");
  const file = sessionPath(runDir, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  return data => {
    if (fs.existsSync(file)) invariant(fs.lstatSync(file).isFile() && !fs.lstatSync(file).isSymbolicLink(), "SESSION_FILE_INVALID");
    fs.writeFileSync(file, `${JSON.stringify(data)}\n`, { encoding: "utf8", mode: 0o600, flush: true });
  };
}

/** Log in one dedicated actor and persist only its recovery cookie jar. */
export async function loginActor({ origin, name, credential, expectedUserId, runDir, fetchImpl, journal, db,
  baselineSessionIds = [], assertWriteAllowed = () => {}, beforeDispatch }) {
  prerequisite(credential.phone && credential.password, `CREDENTIAL_MISSING_${name.toUpperCase()}`);
  invariant(!fs.existsSync(sessionPath(runDir, name)), "RUN_ACTOR_ALREADY_HAS_COOKIE_JAR");
  const beforeLogin = await db.actorState(expectedUserId);
  prerequisite(beforeLogin.sessions.filter(session => new Date(session.expires_at) > new Date()).length < 5,
    "SESSION_LIMIT_WOULD_EVICT_EXISTING");
  const currentSessionIds = beforeLogin.sessions.map(session => session.id);
  invariant(baselineSessionIds.every(id => currentSessionIds.includes(id)), "BASELINE_SESSION_CHANGED_BEFORE_LOGIN");
  const api = createApi({ origin, fetchImpl, onCookies: cookiePersistence(runDir, name),
    beforeDispatch: async request => {
      if (beforeDispatch) await beforeDispatch(request);
      if (request.mutation) assertWriteGate(assertWriteAllowed);
    } });
  const op = operationId();
  journal?.recordIntent("login", op, { actor: name, userId: expectedUserId, baselineSessionIds: currentSessionIds });
  let login;
  try {
    assertWriteGate(assertWriteAllowed);
    login = await api.request("/api/auth/login", { method: "POST", body: { phone_number: credential.phone, password: credential.password }, mutation: true, timeoutMs: 30_000 });
  } catch (error) {
    if (!(error instanceof AmbiguousMutation)) {
      journal?.recordOutcome("login", op, "NOT_APPLIED"); throw error;
    }
    const refreshToken = api.jar.serialize().refresh_token;
    const recovered = refreshToken && db ? await db.session(refreshToken) : null;
    if (!recovered) {
      journal?.recordOutcome("login", op, "AMBIGUOUS");
      throw error;
    }
    login = { status: 200, ok: true, body: { data: { role: credential.role } }, recovered: true };
  }
  if (login.status !== 200) journal?.recordOutcome("login", op, "NOT_APPLIED", { httpStatus: login.status, code: login.body?.code });
  invariant(login.status === 200 && login.body?.data?.role === credential.role, `LOGIN_FAILED_${name.toUpperCase()}`);
  const me = await api.request("/api/auth/me");
  invariant(me.status === 200 && me.body?.data?.role === credential.role, `SESSION_MISMATCH_${name.toUpperCase()}`);
  const refreshToken = api.jar.serialize().refresh_token;
  const session = refreshToken && db ? await db.session(refreshToken) : null;
  invariant(session?.user_id === expectedUserId, `SESSION_DATABASE_MISMATCH_${name.toUpperCase()}`);
  journal?.recordOutcome("login", op, "APPLIED", { recovered: login.recovered === true, sessionId: session.id });
  return { name, api, refreshToken, sessionId: session.id };
}

/** Restore one exact-run cookie jar for recovery; never stores or reloads a password. */
export function restoreActor({ origin, name, runDir, fetchImpl }) {
  const persist = cookiePersistence(runDir, name);
  const file = sessionPath(runDir, name);
  invariant(fs.lstatSync(file).isFile() && !fs.lstatSync(file).isSymbolicLink(), "SESSION_FILE_INVALID");
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  return { name, api: createApi({ origin, fetchImpl, jar: new CookieJar(data), onCookies: persist }), refreshToken: data.refresh_token };
}

/** Revoke and prove removal of the run-created session before deleting its local jar. */
export async function logoutActor(actor, db, runDir, journal) {
  const session = actor.sessionId ? await db.sessionById(actor.sessionId) : actor.refreshToken ? await db.session(actor.refreshToken) : null;
  const op = operationId();
  journal?.recordIntent("logout", op, { actor: actor.name, sessionId: session?.id ?? null });
  let response;
  try { response = await actor.api.request("/api/auth/logout", { method: "POST", body: {}, mutation: true }); }
  catch (error) {
    if (error?.name === "WriteGateClosed") {
      journal?.recordOutcome("logout", op, "NOT_APPLIED");
      throw error;
    }
    const remaining = session ? await db.sessionById(session.id) : null;
    if (remaining) { journal?.recordOutcome("logout", op, "AMBIGUOUS"); throw error; }
    response = { ok: true, recovered: true };
  }
  invariant(response.ok, "LOGOUT_FAILED");
  const me = await actor.api.request("/api/auth/me");
  invariant(me.status === 401, "LOGOUT_COOKIE_STILL_AUTHENTICATED");
  if (session) invariant(await db.sessionById(session.id) === null, "LOGOUT_SESSION_STILL_PRESENT");
  journal?.recordOutcome("logout", op, "APPLIED", { recovered: response.recovered === true });
  fs.rmSync(sessionPath(runDir, actor.name), { force: true });
}
