import { randomUUID } from "node:crypto";
import { loginActor, logoutActor } from "../actors.mjs";
import { fingerprint } from "../database.mjs";
import { invariant, prerequisite } from "../errors.mjs";
import { mutateOnce } from "../operations.mjs";
import { createVerifiedBundle, selectBundleCase } from "./bundle.mjs";

const equal = (left, right) => fingerprint(left) === fingerprint(right);
const asset = state => ({ user: state.user, vouchers: state.vouchers, ledger: state.ledger, grants: state.grants });
const ambiguous = error => /AMBIGUOUS/.test(error?.code ?? "");
const ACTORS = [["customerB", "CUSTOMER"], ["admin", "ADMIN"], ["staff", "STAFF"]];
const TOTALS = ["subtotal_vnd", "total_voucher_discount_vnd", "total_vnd", "shipping_fee_vnd", "freeship_discount_vnd", "grand_total_vnd"];
const voucherBusiness = voucher => Object.fromEntries(Object.entries(voucher).filter(([key]) =>
  !["status", "used_channel", "redeemed_at", "redeemed_by"].includes(key)));
function assertOrderSnapshot(order, bundleCase, paymentMethod, code) {
  invariant(order?.order_type === "PICKUP" && order.payment_method === paymentMethod, `${code}_HEADER`);
  for (const field of TOTALS) invariant(order[field] === bundleCase.expected[field], `${code}_${field.toUpperCase()}`);
  invariant(order.items?.length === bundleCase.lines.length, `${code}_LINES`);
  const remaining = [...order.items];
  for (const expected of bundleCase.lines) {
    const index = remaining.findIndex(item => item.note === expected.note);
    const item = remaining.splice(index, 1)[0];
    invariant(index >= 0 && equal(Object.fromEntries(Object.keys(expected).map(key => [key, item[key] ?? null])), expected), `${code}_LINE`);
  }
  invariant(!remaining.length, `${code}_EXTRA_LINE`);
}

/** Complete one existing PRODUCT/SAME_CONFIG BUNDLE through the online order lifecycle. */
export async function runFinalBundleLifecycle(ctx) {
  const id = "online-final-bundle-redemption";
  const { db, journal, runState } = ctx;
  const clock = () => ctx.now?.() ?? Date.now();
  const lifecycle = ctx.actorLifecycle ?? { login: loginActor, logout: logoutActor };
  const baseline = {};
  const actors = {};
  let active;
  let terminal;
  let expectedCustomer;
  let failure;
  let recoveryRequired = false;
  try {
    prerequisite(typeof ctx.pacer?.reserve === "function", "FINAL_BUNDLE_PACER_MISSING");
    for (const [name, role] of ACTORS) {
      prerequisite(ctx.actorStates?.[name]?.user?.role === role && ctx.credentials?.[name]?.phone
        && ctx.credentials[name].password, "FINAL_BUNDLE_ACTOR_MISSING");
      baseline[name] = structuredClone(await db.actorState(ctx.actorStates[name].user.id));
      invariant(baseline[name].user.role === role, "FINAL_BUNDLE_ACTOR_CHANGED");
    }
    prerequisite(new Set(ACTORS.map(([name]) => baseline[name].user.id)).size === 3, "FINAL_BUNDLE_ACTORS_NOT_DISTINCT");
    prerequisite(!(baseline.customerB.orders ?? []).length, "FINAL_BUNDLE_PREEXISTING_ORDER");
    const userId = baseline.customerB.user.id;
    let selected;
    try { selected = selectBundleCase(ctx, baseline.customerB.vouchers, "final-bundle", ctx.uuid ?? randomUUID); }
    catch (error) {
      if (error.status === "PARTIAL") return { status: "PARTIAL", code: error.code, cases: [{ id, status: "PARTIAL", code: error.code }] };
      throw error;
    }
    await ctx.pacer.reserve(userId, 1, 300_000);
    for (const [name] of ACTORS) if (baseline[name]) {
      actors[name] = await lifecycle.login({ origin: ctx.origin, name, credential: ctx.credentials[name],
        expectedUserId: baseline[name].user.id, runDir: ctx.runDir, fetchImpl: ctx.fetchImpl, journal, db,
        baselineSessionIds: baseline[name].sessions.map(session => session.id) });
      if (actors[name].sessionId) runState?.addSession(name, actors[name].sessionId);
    }
    active = { selected, before: structuredClone(baseline.customerB), owned: false };
    const tracking = { ...runState, addMarker(marker) { active.owned = true; runState?.addMarker(marker); } };
    await createVerifiedBundle({ ctx: { ...ctx, runState: tracking }, actor: actors.customerB, userId,
      voucher: selected.voucher, bundleCase: selected.bundleCase, onOrderIdentified(orderId) { active.orderId = orderId; } });
    const frozen = structuredClone(await db.order(active.orderId));
    const paymentMethod = frozen.payment_method;
    prerequisite(paymentMethod === "BANK_TRANSFER", "FINAL_BUNDLE_PAYMENT_METHOD_INVALID");
    let window;
    let redeemed;
    const transition = async (name, target, confirm = false) => {
      const before = await db.order(active.orderId);
      const path = confirm ? `/api/admin/orders/${active.orderId}/confirm-payment` : `/api/staff/orders/${active.orderId}`;
      const response = await mutateOnce({ journal, type: confirm ? "confirm" : "status", recovery: { actor: name, userId,
        marker: selected.bundleCase.marker, orderId: active.orderId, sourceStatuses: [before.status], targetStatus: target },
      send: async () => { if (confirm) window = { start: clock(), end: Number.NaN };
        try { return await actors[name].api.request(path, { method: "PATCH", body: { status: target }, mutation: true, timeoutMs: 30_000 }); }
        finally { if (confirm) window.end = clock(); } },
      reconcile: async failed => { const after = await db.order(active.orderId);
        return after?.status === target && after.user_id === userId && after.note === selected.bundleCase.marker
          ? "APPLIED" : failed && equal(after, before) ? "NOT_APPLIED" : "AMBIGUOUS"; } });
      invariant(response.ok && (response.recovered || response.body?.data?.status === target), "FINAL_BUNDLE_TRANSITION_REJECTED");
    };
    const verify = async (status, complete = false) => {
      const order = await db.order(active.orderId);
      const response = await actors.customerB.api.request(`/api/orders/${active.orderId}`);
      invariant(order?.status === status && response.status === 200 && response.body?.data?.status === status
        && order.user_id === userId && order.note === selected.bundleCase.marker, "FINAL_BUNDLE_STATUS_INVALID");
      assertOrderSnapshot(order, selected.bundleCase, paymentMethod, "FINAL_BUNDLE_DATABASE_SNAPSHOT");
      assertOrderSnapshot(response.body.data, selected.bundleCase, paymentMethod, "FINAL_BUNDLE_PUBLIC_SNAPSHOT");
      const application = order.bundleApplications?.find(row => row.voucher_id === selected.voucher.id);
      invariant(application && equal(application.qualifiers, frozen.bundleApplications[0].qualifiers)
        && equal(application.rewards, frozen.bundleApplications[0].rewards)
        && application.application_count === 1 && application.application_count === frozen.bundleApplications[0].application_count,
      "FINAL_BUNDLE_ALLOCATION_CHANGED");
      invariant(order.bundleApplications.length === 1 && !(order.discountVouchers ?? []).length
        && order.freeship_voucher_id == null && order.items.every(item => item.product_voucher_id == null
          && item.item_voucher_id == null && !(item.addonVouchers ?? []).length), "FINAL_BUNDLE_NONBUNDLE_LINK_CHANGED");
      invariant(application.status === (status === "PENDING" ? "RESERVED" : "REDEEMED"), "FINAL_BUNDLE_LINK_STATUS_INVALID");
      const state = await db.actorState(userId);
      const voucher = state.vouchers.find(row => row.id === selected.voucher.id);
      invariant(equal(voucherBusiness(voucher), voucherBusiness(active.before.vouchers.find(row => row.id === selected.voucher.id))), "FINAL_BUNDLE_VOUCHER_BUSINESS_CHANGED");
      if (status === "PENDING") invariant(voucher.status === "RESERVED" && voucher.used_channel == null
        && voucher.redeemed_at == null && voucher.redeemed_by == null && order.payment_confirmed_by == null
        && order.payment_confirmed_at == null, "FINAL_BUNDLE_RESERVED_METADATA_INVALID");
      else {
        const inWindow = value => window && Date.parse(value) >= window.start - 5_000 && Date.parse(value) <= window.end + 5_000;
        invariant(voucher.status === "REDEEMED" && voucher.used_channel === "ONLINE"
          && voucher.redeemed_by === baseline.admin.user.id && inWindow(voucher.redeemed_at)
          && order.payment_confirmed_by === baseline.admin.user.id && inWindow(order.payment_confirmed_at), "FINAL_BUNDLE_REDEEM_METADATA_INVALID");
        invariant(!redeemed || equal(voucher, redeemed), "FINAL_BUNDLE_REDEMPTION_CHANGED");
        redeemed = structuredClone(voucher);
      }
      const uses = await db.activeUses([selected.voucher.id]);
      invariant(complete ? !uses.length : uses.length === 1 && uses[0].id === active.orderId, "FINAL_BUNDLE_USE_INVALID");
      if (["STAFF_DONE", "COMPLETED"].includes(status)) invariant(order.handled_by === baseline.staff.user.id, "FINAL_BUNDLE_HANDLER_INVALID");
      const points = complete ? Math.floor(selected.bundleCase.expected.total_vnd / 10_000) : 0;
      invariant(complete ? order.points_earned === points : order.points_earned == null, "FINAL_BUNDLE_POINTS_SNAPSHOT_INVALID");
      invariant(state.user.points_balance === active.before.user.points_balance + points && equal(state.grants, active.before.grants), "FINAL_BUNDLE_USER_CHANGED");
      for (const old of active.before.ledger) invariant(equal(state.ledger.find(log => log.id === old.id), old), "FINAL_BUNDLE_OLD_LEDGER_CHANGED");
      const fresh = state.ledger.filter(log => !active.before.ledger.some(old => old.id === log.id));
      invariant(points ? fresh.length === 1 && fresh[0].delta === points && fresh[0].reason === "order_complete"
        && fresh[0].user_id === userId && fresh[0].order_id === active.orderId && fresh[0].performed_by === baseline.staff.user.id
        && fresh[0].voucher_id == null && fresh[0].reversed_log_id == null : !fresh.length, "FINAL_BUNDLE_LEDGER_INVALID");
      invariant(state.vouchers.length === active.before.vouchers.length && state.vouchers.every(row => row.id === selected.voucher.id
        || equal(row, active.before.vouchers.find(old => old.id === row.id))), "FINAL_BUNDLE_OTHER_WALLET_CHANGED");
      return state;
    };
    await verify("PENDING");
    await transition("admin", "ADMIN_CONFIRMED", true); await verify("ADMIN_CONFIRMED");
    await transition("staff", "STAFF_DONE"); await verify("STAFF_DONE");
    await transition("staff", "COMPLETED");
    const finalState = structuredClone(await verify("COMPLETED", true));
    expectedCustomer = finalState;
    terminal = structuredClone(await db.order(active.orderId));
    const replay = await mutateOnce({ journal, type: "status", recovery: { actor: "staff", userId,
      marker: selected.bundleCase.marker, orderId: active.orderId, sourceStatuses: ["COMPLETED"], targetStatus: "COMPLETED", expectedRejection: true },
    send: () => actors.staff.api.request(`/api/staff/orders/${active.orderId}`, { method: "PATCH", body: { status: "COMPLETED" }, mutation: true }),
    reconcile: async failed => failed && equal(await db.order(active.orderId), terminal) ? "NOT_APPLIED" : "AMBIGUOUS" });
    invariant(replay.status === 400 && replay.body?.code === "INVALID_TRANSITION"
      && equal(await db.order(active.orderId), terminal) && equal(await db.actorState(userId), finalState), "FINAL_BUNDLE_REPLAY_CHANGED_STATE");
    active = null;
  } catch (error) { if (ambiguous(error)) throw error; failure = error; }
  try {
    if (active?.owned) {
      const matches = await db.ordersByMarkers([active.selected.bundleCase.marker]);
      invariant(matches.length === 1 && matches[0].id === active.orderId
        && matches[0].user_id === baseline.customerB.user.id && matches[0].note === active.selected.bundleCase.marker,
      "FINAL_BUNDLE_CLEANUP_SCOPE_INVALID");
      const current = matches[0];
      invariant(current.status !== "COMPLETED", "FINAL_BUNDLE_COMPLETED_UNVERIFIED");
      if (current.status !== "CANCELLED") await transitionCleanup(ctx, actors.admin, current, baseline.customerB.user.id);
      const cancelled = await db.order(active.orderId);
      invariant(cancelled?.id === active.orderId && cancelled.user_id === baseline.customerB.user.id
        && cancelled.note === active.selected.bundleCase.marker && cancelled.status === "CANCELLED" && cancelled.bundleApplications?.length === 1
        && cancelled.bundleApplications[0].status === "CANCELLED" && !(await db.activeUses([active.selected.voucher.id])).length
        && equal(asset(await db.actorState(baseline.customerB.user.id)), asset(active.before)), "FINAL_BUNDLE_CANCEL_NOT_RESTORED");
      terminal = structuredClone(cancelled);
    }
    for (const name of Object.keys(actors).reverse()) await lifecycle.logout(actors[name], db, ctx.runDir, journal);
    for (const [name] of ACTORS) if (baseline[name]) {
      const final = await db.actorState(baseline[name].user.id);
      invariant(equal(final.sessions, baseline[name].sessions), "FINAL_BUNDLE_SESSION_RETAINED");
      invariant(equal(asset(final), name === "customerB" && expectedCustomer ? asset(expectedCustomer) : asset(baseline[name])), "FINAL_BUNDLE_FINAL_ASSETS_CHANGED");
    }
    if (terminal) invariant(equal(await db.order(terminal.id), terminal)
      && (await db.ordersByMarkers([terminal.note])).some(row => row.id === terminal.id), "FINAL_BUNDLE_AUDIT_CHANGED");
    invariant((await db.catalog()).fingerprint === ctx.catalog.fingerprint, "CATALOG_CHANGED");
  } catch (error) { if (ambiguous(error)) throw error; failure = error; recoveryRequired = true; }
  const failureStatus = failure?.status === "PARTIAL" && !active?.owned ? "PARTIAL" : "FAIL";
  return failure ? { status: failureStatus, code: failure.code ?? "FINAL_BUNDLE_FAILED", recoveryRequired,
    cases: [{ id, status: failureStatus, code: failure.code ?? "FINAL_BUNDLE_FAILED" }] }
    : { status: "PASS", cases: [{ id, status: "PASS" }], summary: { ordersCompleted: 1 } };
}

async function transitionCleanup(ctx, actor, order, userId) {
  const response = await mutateOnce({ journal: ctx.journal, type: "cancel", recovery: { actor: "admin", userId,
    marker: order.note, orderId: order.id, sourceStatuses: [order.status], targetStatus: "CANCELLED" },
  send: () => actor.api.request(`/api/staff/orders/${order.id}`, { method: "PATCH", body: { status: "CANCELLED" }, mutation: true }),
  reconcile: async failed => { const after = await ctx.db.order(order.id);
    return after?.status === "CANCELLED" ? "APPLIED" : failed && equal(after, order) ? "NOT_APPLIED" : "AMBIGUOUS"; } });
  invariant(response.ok, "FINAL_BUNDLE_CLEANUP_REJECTED");
}
