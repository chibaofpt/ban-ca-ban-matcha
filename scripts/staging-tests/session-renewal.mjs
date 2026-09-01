import { mutateOnce } from "./operations.mjs";
import { fingerprint } from "./database.mjs";
import { assertWriteGate, invariant } from "./errors.mjs";

/** Attach scheduled authentication renewal and actual-dispatch pacing to one run actor. */
export function prepareLongRunningActor({ actor, userId, db, journal, dispatchPacer, now = Date.now,
  renewImmediately = false, assertWriteAllowed = () => {}, onSessionRotated = () => {} }) {
  const rawApi = actor.api;
  let renewAt = renewImmediately ? 0 : now() + 600_000;
  let pendingRenewal;
  async function renew() {
    const before = rawApi.jar.serialize().refresh_token;
    const response = await mutateOnce({ journal, type: "refresh",
      recovery: { actor: actor.name, userId, sessionId: actor.sessionId, baselineRefreshFingerprint: fingerprint(before ?? null) },
      send: () => {
        assertWriteGate(assertWriteAllowed);
        return rawApi.request("/api/auth/refresh", { method: "POST", body: {}, mutation: true });
      },
      isKnownNotApplied: response => response.status === 401,
      reconcile: async () => {
        const token = rawApi.jar.serialize().refresh_token;
        if (!token || token === before) return "AMBIGUOUS";
        const session = await db.session(token);
        return session?.id !== actor.sessionId && session?.user_id === userId ? "APPLIED" : "AMBIGUOUS";
      },
    });
    invariant(response.ok, "SESSION_REFRESH_FAILED");
    const token = rawApi.jar.serialize().refresh_token;
    invariant(token && token !== before, "SESSION_REFRESH_TOKEN_UNCHANGED");
    const session = token ? await db.session(token) : null;
    invariant(session?.id && session.id !== actor.sessionId && session.user_id === userId, "SESSION_REFRESH_IDENTITY_MISMATCH");
    actor.sessionId = session.id;
    onSessionRotated(session.id);
    actor.refreshToken = token;
    renewAt = now() + 600_000;
  }
  actor.api = { ...rawApi, async request(route, options = {}) {
    const reservation = route === "/api/orders" && options.method === "POST"
      ? await dispatchPacer?.reserve(userId, 1, 60_000) : null;
    if (!route.startsWith("/api/auth/") && now() >= renewAt) {
      pendingRenewal ??= renew();
      try { await pendingRenewal; } finally { pendingRenewal = undefined; }
    }
    if (options.mutation) assertWriteGate(assertWriteAllowed);
    reservation?.markDispatched();
    return rawApi.request(route, options);
  } };
  return actor;
}
