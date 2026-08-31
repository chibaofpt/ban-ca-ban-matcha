import { loginActor, logoutActor } from "../actors.mjs";
import { fingerprint } from "../database.mjs";
import { invariant, prerequisite } from "../errors.mjs";
import { mutateOnce } from "../operations.mjs";
import { buildPickupCase } from "./common.mjs";
import { createVerifiedPickup } from "./order.mjs";

const expiryWindowMs = 1_200_000;
const cleanupBudgetMs = 180_000;
const isAmbiguous = error => /AMBIGUOUS/.test(error?.code ?? "");
const assets = state => fingerprint({ user: state.user, ledger: state.ledger, vouchers: state.vouchers, grants: state.grants });
const snapshot = order => fingerprint({ items: order.items, subtotal_vnd: order.subtotal_vnd,
  total_voucher_discount_vnd: order.total_voucher_discount_vnd, total_vnd: order.total_vnd,
  shipping_fee_vnd: order.shipping_fee_vnd, freeship_discount_vnd: order.freeship_discount_vnd,
  grand_total_vnd: order.grand_total_vnd, auto_cancel_at: order.auto_cancel_at, created_at: order.created_at });

/** Exercise payment expiry using the actual server deadline, without changing database time. */
export async function runPaymentExpiry(ctx) {
  const customerName = ctx.customerName ?? "customerB";
  const roles = [[customerName, "CUSTOMER"], ["admin", "ADMIN"]];
  for (const [name, role] of roles) {
    if (ctx.actorStates?.[name]?.user?.role !== role || !ctx.credentials?.[name]?.phone || !ctx.credentials[name].password) {
      return { status: "PARTIAL", code: "EXPIRY_ACTOR_UNAVAILABLE", cases: [] };
    }
  }
  const { db, journal, runState } = ctx;
  const now = ctx.now ?? Date.now;
  const sleep = ctx.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const lifecycle = ctx.actorLifecycle ?? { login: loginActor, logout: logoutActor };
  const customerId = ctx.actorStates[customerName].user.id;
  const actors = {};
  const baselines = {};
  const cases = [];
  let selected;
  let markerOwned = false;
  let orderId;
  let originalSnapshot;
  let failure;
  let recoveryRequired = false;
  const login = async name => {
    if (actors[name]) return actors[name];
    actors[name] = await lifecycle.login({ origin: ctx.origin, name, credential: ctx.credentials[name],
      expectedUserId: ctx.actorStates[name].user.id, runDir: ctx.runDir, fetchImpl: ctx.fetchImpl, journal, db,
      baselineSessionIds: baselines[name].sessions.map(session => session.id) });
    if (actors[name].sessionId) runState?.addSession(name, actors[name].sessionId);
    return actors[name];
  };
  try {
    prerequisite(Number.isFinite(ctx.deadline) && now() + expiryWindowMs + cleanupBudgetMs + 2_000 < ctx.deadline,
      "EXPIRY_TIME_BUDGET_INSUFFICIENT");
    prerequisite(typeof ctx.pacer?.reserve === "function", "EXPIRY_PACER_MISSING");
    for (const [name] of roles) {
      prerequisite(!(ctx.actorStates[name].orders ?? []).length, "EXPIRY_PREEXISTING_ORDER");
      baselines[name] = structuredClone(await db.actorState(ctx.actorStates[name].user.id));
    }
    selected = buildPickupCase({ catalog: ctx.catalog, runId: ctx.runId, caseId: "payment-expiry" });
    await ctx.pacer.reserve(customerId, 1, expiryWindowMs + cleanupBudgetMs + 2_000);
    await login(customerName);
    await createVerifiedPickup({ actor: actors[customerName], actorName: customerName, userId: customerId,
      db, journal, pickupCase: selected,
      runState: { addMarker(marker) { runState?.addMarker(marker); markerOwned = true; } },
      onOrderIdentified(id) { orderId = id; } });
    const initial = await db.order(orderId);
    const expiresAt = Date.parse(initial.auto_cancel_at);
    invariant(Number.isFinite(expiresAt) && Math.abs(expiresAt - Date.parse(initial.created_at) - expiryWindowMs) < 1_000,
      "EXPIRY_SERVER_DEADLINE_INVALID");
    originalSnapshot = snapshot(initial);
    prerequisite(expiresAt + cleanupBudgetMs + 2_000 < ctx.deadline, "EXPIRY_TIME_BUDGET_INSUFFICIENT");
    invariant(assets(await db.actorState(customerId)) === assets(baselines[customerName]), "EXPIRY_EARLY_ASSET_CHANGE");
    while (now() < expiresAt + 2_000) {
      prerequisite(now() + cleanupBudgetMs < ctx.deadline, "EXPIRY_TIME_BUDGET_INSUFFICIENT");
      const pause = Math.min(45_000, expiresAt + 2_000 - now());
      ctx.onWait?.({ code: "PAYMENT_EXPIRY_WAIT", remainingMs: expiresAt + 2_000 - now() });
      await sleep(pause);
    }
    invariant((await db.catalog()).fingerprint === ctx.catalog.fingerprint, "CATALOG_CHANGED");
    const before = await db.order(orderId);
    invariant(["PENDING", "CANCELLED"].includes(before?.status) && !before.payment_confirmed_by
      && !before.payment_confirmed_at && snapshot(before) === originalSnapshot, "EXPIRY_ORDER_CHANGED_WHILE_WAITING");
    await login("admin");
    const response = await mutateOnce({ journal, type: "confirm", recovery: { actor: "admin", userId: customerId,
      orderId, marker: selected.marker, sourceStatuses: [before.status], targetStatus: "CANCELLED" },
    send: () => actors.admin.api.request(`/api/admin/orders/${orderId}/confirm-payment`, { method: "PATCH", mutation: true }),
    isKnownNotApplied: reply => reply.status === 422 && reply.body?.code === "INVALID_STATUS",
    reconcile: async reply => {
      const current = await db.order(orderId);
      if (current?.user_id === customerId && current.note === selected.marker && current.status === "CANCELLED"
        && !current.payment_confirmed_by && !current.payment_confirmed_at) return "APPLIED";
      return reply && fingerprint(current) === fingerprint(before) ? "NOT_APPLIED" : "AMBIGUOUS";
    } });
    if (response.recovered) cases.push({ id: "payment-expiry-refusal", status: "PARTIAL", code: "EXPIRY_RESPONSE_NOT_OBSERVED" });
    else {
      invariant(response.status === 422 && ["INVALID_STATUS", "ORDER_EXPIRED"].includes(response.body?.code),
        "EXPIRY_CONFIRMATION_NOT_REJECTED");
      cases.push({ id: "payment-expiry-refusal", status: "PASS" });
    }
    const current = await db.order(orderId);
    const detail = await actors[customerName].api.request(`/api/orders/${orderId}`);
    invariant(current?.id === orderId && current.user_id === customerId && current.note === selected.marker
      && current.status === "CANCELLED" && detail.ok && detail.body?.data?.status === "CANCELLED"
      && !current.payment_confirmed_by && !current.payment_confirmed_at
      && (current.points_earned == null || current.points_earned === 0) && !(current.pointsLogs ?? []).length,
    "EXPIRY_PAYMENT_OR_POINTS_PERSISTED");
    invariant(snapshot(current) === originalSnapshot, "EXPIRY_FINANCIAL_SNAPSHOT_CHANGED");
    cases.push({ id: "payment-expiry-no-award", status: "PASS" });
  } catch (error) { failure = error; }
  if (isAmbiguous(failure)) throw failure;
  try {
    if (markerOwned) {
      const matches = await db.ordersByMarkers([selected.marker]);
      invariant(matches.length <= 1, "EXPIRY_CLEANUP_MARKER_COLLISION");
      const current = matches[0];
      if (current && current.status !== "CANCELLED") {
        await login("admin");
        invariant(current.user_id === customerId && current.note === selected.marker
          && ["PENDING", "ADMIN_CONFIRMED", "STAFF_DONE"].includes(current.status), "EXPIRY_CLEANUP_SCOPE_INVALID");
        const response = await mutateOnce({ journal, type: "cancel", recovery: { actor: "admin", userId: customerId,
          orderId: current.id, marker: selected.marker, sourceStatuses: [current.status], targetStatus: "CANCELLED" },
        send: () => actors.admin.api.request(`/api/staff/orders/${current.id}`, { method: "PATCH", body: { status: "CANCELLED" }, mutation: true }),
        reconcile: async () => (await db.order(current.id))?.status === "CANCELLED" ? "APPLIED" : "AMBIGUOUS" });
        invariant(response.ok && (await db.order(current.id))?.status === "CANCELLED", "EXPIRY_CLEANUP_FAILED");
      }
    }
    for (const actor of Object.values(actors).reverse()) await lifecycle.logout(actor, db, ctx.runDir, journal);
    if (orderId) {
      const retained = await db.ordersByMarkers([selected.marker]);
      invariant(retained.length === 1 && retained[0].id === orderId && retained[0].status === "CANCELLED"
        && retained[0].user_id === customerId && retained[0].note === selected.marker, "EXPIRY_AUDIT_MISSING");
      if (originalSnapshot) invariant(snapshot(retained[0]) === originalSnapshot, "EXPIRY_FINANCIAL_SNAPSHOT_CHANGED");
    }
    for (const [name] of roles) {
      if (!baselines[name]) continue;
      const final = await db.actorState(ctx.actorStates[name].user.id);
      invariant(assets(final) === assets(baselines[name]), "EXPIRY_FINAL_ASSETS_CHANGED");
      invariant(fingerprint(final.sessions) === fingerprint(baselines[name].sessions), "EXPIRY_SESSION_CHANGED");
    }
    if (selected) invariant((await db.catalog()).fingerprint === ctx.catalog.fingerprint, "CATALOG_CHANGED");
  } catch (error) { if (isAmbiguous(error)) throw error; failure = error; recoveryRequired = true; }
  if (failure) return { status: failure.status === "PARTIAL" && !recoveryRequired ? "PARTIAL" : "FAIL",
    code: failure.code ?? "EXPIRY_FAILED", cases, recoveryRequired };
  return { status: cases.some(item => item.status === "PARTIAL") ? "PARTIAL" : "PASS", cases,
    summary: { ordersExpired: 1, pointsAwarded: 0 } };
}
