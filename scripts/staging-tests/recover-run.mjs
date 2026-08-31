import fs from "node:fs";
import path from "node:path";
import { validateRunId } from "./core.mjs";
import { preflight } from "./preflight.mjs";
import { loadRunState } from "./run-state.mjs";
import { openJournal } from "./journal.mjs";
import { classifyUnresolvedOperation, unresolvedOperations } from "./recovery.mjs";
import { restoreActor, logoutActor } from "./actors.mjs";
import { mutateOnce } from "./operations.mjs";
import { reconcileRun } from "./reconciliation.mjs";
import { invariant } from "./errors.mjs";
import { prepareLongRunningActor } from "./session-renewal.mjs";

/** Recover only an exact run through existing authenticated APIs; never manufacture credentials. */
export async function executeRecovery({ runRoot, runId, env, attestation, fetchImpl, preflightFn = preflight }) {
  validateRunId(runId);
  const runDir = path.resolve(runRoot, runId);
  invariant(path.dirname(runDir) === path.resolve(runRoot), "RECOVERY_PATH_INVALID");
  const state = loadRunState({ fs, runDir });
  invariant(state.target?.origin === env.TEST_BASE_URL
    && state.target?.supabaseRef === env.TEST_STAGING_SUPABASE_REF
    && state.target?.deploymentId === env.TEST_DEPLOYMENT_ID, "RECOVERY_TARGET_MISMATCH");
  const journal = openJournal({ fs, rootDir: runRoot, runId, now: () => new Date() });
  const entries = fs.readFileSync(path.join(runDir, "journal.ndjson"), "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line));
  const context = await preflightFn({ env, attestation, profile: "recover", requirePushSandbox: true, fetchImpl });
  const { db } = context;
  try {
    const sessionIds = Object.fromEntries(Object.entries(state.runSessionIds).map(([name, ids]) => [name, new Set(ids)]));
    const voucherIds = new Set(state.voucherIds);
    const markers = new Set(state.markers);
    const reasons = [];
    for (const entry of entries) {
      if (entry.state === "INTENT" && entry.recovery?.marker) markers.add(entry.recovery.marker);
      if (entry.type === "login" && entry.evidence?.sessionId) {
        const intent = entries.find(row => row.operationId === entry.operationId && row.state === "INTENT");
        const name = intent?.recovery?.actor;
        if (name) { sessionIds[name] ??= new Set(); sessionIds[name].add(entry.evidence.sessionId); }
      }
      if (entry.type === "exchange" && entry.evidence?.voucherId) voucherIds.add(entry.evidence.voucherId);
    }
    const latest = new Map(entries.map(entry => [entry.operationId, entry.state]));
    for (const entry of entries.filter(entry => entry.type === "exchange" && entry.state === "INTENT"
      && ["APPLIED", "RECOVERED"].includes(latest.get(entry.operationId)))) {
      const result = await classifyUnresolvedOperation(entry, db);
      if (result.voucherId) voucherIds.add(result.voucherId);
      else reasons.push("RECOVERY_EXCHANGE_AUDIT_MISSING");
    }
    for (const entry of unresolvedOperations(entries)) {
      let capturedRefreshToken;
      if (entry.type === "refresh" && Object.hasOwn(state.actorIds, entry.recovery?.actor ?? "")) {
        const name = entry.recovery.actor;
        if (fs.existsSync(path.join(runDir, "sessions", `${name}.json`))) {
          capturedRefreshToken = restoreActor({ origin: state.target.origin, name, runDir, fetchImpl }).refreshToken;
        }
      }
      const result = await classifyUnresolvedOperation(entry, db, { capturedRefreshToken });
      if (result.state === "AMBIGUOUS") { reasons.push(result.code ?? "RECOVERY_AMBIGUOUS"); continue; }
      if (result.voucherId) voucherIds.add(result.voucherId);
      if (result.sessionId && entry.recovery?.actor) {
        sessionIds[entry.recovery.actor] ??= new Set(); sessionIds[entry.recovery.actor].add(result.sessionId);
      }
      journal.recordOutcome(entry.type, entry.operationId, "RECOVERED", result);
      latest.set(entry.operationId, "RECOVERED");
    }
    if (reasons.length) return { status: "FAIL", reasons, summary: { recoveryRequired: true } };

    const actors = {};
    for (const name of Object.keys(state.actorIds)) {
      const file = path.join(runDir, "sessions", `${name}.json`);
      if (!fs.existsSync(file)) continue;
      const actor = restoreActor({ origin: state.target.origin, name, runDir, fetchImpl });
      const session = actor.refreshToken ? await db.session(actor.refreshToken) : null;
      if (session) {
        invariant(session.user_id === state.actorIds[name], "RECOVERY_SESSION_OWNER_MISMATCH");
        invariant(!state.baselines[name].sessionIds.includes(session.id), "RECOVERY_BASELINE_SESSION_FORBIDDEN");
        sessionIds[name] ??= new Set(); sessionIds[name].add(session.id);
        actor.sessionId = session.id;
        prepareLongRunningActor({ actor, userId: session.user_id, db, journal, renewImmediately: true });
      }
      actors[name] = actor;
    }
    const orders = markers.size ? await db.ordersByMarkers([...markers]) : [];
    const appliedMarkers = new Set(entries.filter(entry => entry.type === "create" && entry.state === "INTENT"
      && ["APPLIED", "RECOVERED"].includes(latest.get(entry.operationId))).map(entry => entry.recovery?.marker));
    for (const marker of markers) {
      invariant(marker.startsWith(`[STAGING:${runId}:`) && marker.endsWith("]"), "RECOVERY_MARKER_OUT_OF_SCOPE");
      invariant(orders.filter(order => order.note === marker || order.items?.some(item => item.note === marker)).length <= 1, "RECOVERY_DUPLICATE_MARKER");
      if (appliedMarkers.has(marker)) invariant(orders.some(order => order.note === marker
        || order.items?.some(item => item.note === marker)), "RECOVERY_ORDER_AUDIT_MISSING");
    }
    for (const order of orders) {
      invariant(Object.values(state.actorIds).includes(order.user_id) || order.user_id === null && order.order_type === "COUNTER", "RECOVERY_ORDER_OWNER_MISMATCH");
      if (["CANCELLED", "COMPLETED"].includes(order.status)) continue;
      const marker = order.note ?? order.items?.map(item => item.note).find(note => markers.has(note));
      const createIntent = entries.find(entry => entry.type === "create" && entry.state === "INTENT"
        && entry.recovery?.marker === marker);
      const customerName = Object.keys(state.actorIds).find(key => state.actorIds[key] === order.user_id);
      const name = order.order_type === "COUNTER" ? createIntent?.recovery?.actor
        : order.status === "PENDING" ? customerName : "admin";
      const customerRoute = order.status === "PENDING" && ["PICKUP", "DELIVERY"].includes(order.order_type);
      invariant(name && actors[name]?.sessionId && (customerRoute || ["COUNTER", "PICKUP", "DELIVERY"].includes(order.order_type)),
        "RECOVERY_ORDER_REQUIRES_MANUAL_ACTION");
      const actor = actors[name];
      const response = await mutateOnce({
        journal, type: "cancel",
        recovery: { actor: name, userId: order.user_id, orderId: order.id, marker,
          sourceStatuses: [order.status], targetStatus: "CANCELLED" },
        send: () => actor.api.request(customerRoute ? `/api/orders/${order.id}` : `/api/staff/orders/${order.id}`,
          { method: "PATCH", body: { status: "CANCELLED" }, mutation: true }),
        reconcile: async response => {
          const current = await db.order(order.id);
          if (current?.status === "CANCELLED") return "APPLIED";
          return response && current?.status === order.status ? "NOT_APPLIED" : "AMBIGUOUS";
        },
      });
      invariant(response.ok, "RECOVERY_CANCEL_FAILED");
    }
    for (const actor of Object.values(actors)) await logoutActor(actor, db, runDir, journal);
    const reconciliation = await reconcileRun({ db, baselines: state.baselines, actorIds: state.actorIds,
      runSessionIds: Object.fromEntries(Object.entries(sessionIds).map(([name, ids]) => [name, [...ids]])),
      markers: [...markers], voucherIds: [...voucherIds], initialCatalogFingerprint: state.catalogFingerprint,
      recovery: true,
    });
    invariant(reconciliation.ok, "RECOVERY_FINAL_RECONCILIATION_FAILED");
    return { status: "PASS", reasons: [], summary: { ordersReconciled: orders.length, auditRetained: true } };
  } finally { await db.close(); }
}
