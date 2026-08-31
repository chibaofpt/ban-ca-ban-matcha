import { loginActor, logoutActor } from "../actors.mjs";
import { fingerprint } from "../database.mjs";
import { invariant } from "../errors.mjs";
import { mutateOnce } from "../operations.mjs";
import { selectVoucherCase } from "./full-cases.mjs";
import { createVerifiedPickup, cancelVerifiedPickup } from "./order.mjs";

const lifecycle = { login: loginActor, logout: logoutActor };

function usable(voucher) {
  const horizon = Date.now() + 180_000;
  return voucher.status === "ACTIVE"
    && (!voucher.expires_at || new Date(voucher.expires_at).getTime() > horizon)
    && (!voucher.package?.ends_at || new Date(voucher.package.ends_at).getTime() > horizon);
}

/** Prove ADMIN cancellation releases a pending voucher for a fresh order. */
export async function runAdminCancelVoucherReuse(ctx) {
  const customerState = ctx.actorStates?.customerB;
  const adminState = ctx.actorStates?.admin;
  if (!customerState?.user?.id || customerState.user.role !== "CUSTOMER" || !adminState?.user?.id || adminState.user.role !== "ADMIN"
    || !ctx.credentials?.customerB?.phone || !ctx.credentials.customerB.password
    || !ctx.credentials?.admin?.phone || !ctx.credentials.admin.password) {
    return { status: "PARTIAL", code: "ADMIN_CANCEL_ACTOR_UNAVAILABLE", cases: [] };
  }
  const customerId = customerState.user.id;
  const baselineCustomer = structuredClone(await ctx.db.actorState(customerId));
  const baselineAdmin = structuredClone(await ctx.db.actorState(adminState.user.id));
  let voucher;
  for (const candidate of baselineCustomer.vouchers.filter(item => usable(item)
    && ["DISCOUNT", "PRODUCT", "PRODUCT_DISCOUNT", "ADDON", "ITEM"].includes(item.voucher_type))) {
    try {
      selectVoucherCase({ catalog: ctx.catalog, runId: ctx.runId, caseId: "admin-cancel-first", voucher: candidate });
      voucher = candidate; break;
    } catch (error) { if (error.status !== "PARTIAL") throw error; }
  }
  if (!voucher) return { status: "PARTIAL", code: "ADMIN_CANCEL_ELIGIBLE_VOUCHER_MISSING",
    cases: [{ id: "admin-cancel-pending-voucher-reuse", status: "PARTIAL", code: "ADMIN_CANCEL_ELIGIBLE_VOUCHER_MISSING" }] };

  const first = selectVoucherCase({ catalog: ctx.catalog, runId: ctx.runId, caseId: "admin-cancel-first", voucher });
  const second = selectVoucherCase({ catalog: ctx.catalog, runId: ctx.runId, caseId: "admin-cancel-reuse", voucher });
  const actors = ctx.actorLifecycle ?? lifecycle;
  const activeActors = {};
  const known = [];
  const common = { actorName: "customerB", userId: customerId, db: ctx.db, journal: ctx.journal, runState: ctx.runState, voucher };
  let failure;
  let recoveryRequired = false;
  ctx.runState?.addVoucher(voucher.id);
  try {
    await ctx.pacer.reserve(customerId, 2, 240_000);
    for (const name of ["customerB", "admin"]) {
      const baseline = name === "customerB" ? baselineCustomer : baselineAdmin;
      activeActors[name] = await actors.login({ origin: ctx.origin, name, credential: ctx.credentials[name],
        expectedUserId: ctx.actorStates[name].user.id, runDir: ctx.runDir, fetchImpl: ctx.fetchImpl,
        journal: ctx.journal, db: ctx.db, baselineSessionIds: baseline.sessions.map(session => session.id) });
      if (activeActors[name].sessionId) ctx.runState?.addSession(name, activeActors[name].sessionId);
    }
    const createdFirst = await createVerifiedPickup({ ...common, actor: activeActors.customerB, pickupCase: first,
      onOrderIdentified: id => known.push({ id, marker: first.marker }) });
    if (!known.some(item => item.id === createdFirst.orderId)) known.push({ id: createdFirst.orderId, marker: first.marker });
    const cancelResponse = await mutateOnce({ journal: ctx.journal, type: "cancel", recovery: { actor: "admin",
      userId: customerId, marker: first.marker, orderId: createdFirst.orderId, sourceStatuses: ["PENDING"], targetStatus: "CANCELLED" },
    send: () => activeActors.admin.api.request(`/api/staff/orders/${createdFirst.orderId}`, {
      method: "PATCH", body: { status: "CANCELLED" }, mutation: true, timeoutMs: 30_000 }),
    reconcile: async failed => {
      const stored = await ctx.db.order(createdFirst.orderId);
      if (stored?.status === "CANCELLED") return "APPLIED";
      return failed && stored?.status === "PENDING" ? "NOT_APPLIED" : "AMBIGUOUS";
    } });
    invariant(cancelResponse.ok && (await ctx.db.order(createdFirst.orderId))?.status === "CANCELLED", "ADMIN_CANCEL_PENDING_FAILED");
    invariant((await ctx.db.vouchers([voucher.id]))[0]?.status === "ACTIVE"
      && (await ctx.db.activeUses([voucher.id])).length === 0, "ADMIN_CANCEL_VOUCHER_NOT_RELEASED");

    const createdSecond = await createVerifiedPickup({ ...common, actor: activeActors.customerB, pickupCase: second,
      onOrderIdentified: id => known.push({ id, marker: second.marker }) });
    if (!known.some(item => item.id === createdSecond.orderId)) known.push({ id: createdSecond.orderId, marker: second.marker });
    await cancelVerifiedPickup({ ...common, actor: activeActors.customerB, marker: second.marker, orderId: createdSecond.orderId });
  } catch (error) { failure = error; }
  if (failure && /AMBIGUOUS/.test(failure.code ?? "")) throw failure;
  try {
    for (const entry of known) {
      const stored = await ctx.db.order(entry.id);
      if (stored && !["CANCELLED", "COMPLETED"].includes(stored.status)) {
        invariant(activeActors.admin && stored.user_id === customerId && stored.note === entry.marker,
          "ADMIN_CANCEL_RECOVERY_SCOPE_INVALID");
        const response = await mutateOnce({ journal: ctx.journal, type: "cancel", recovery: { actor: "admin", userId: customerId,
          marker: entry.marker, orderId: entry.id, sourceStatuses: [stored.status], targetStatus: "CANCELLED" },
        send: () => activeActors.admin.api.request(`/api/staff/orders/${entry.id}`, { method: "PATCH",
          body: { status: "CANCELLED" }, mutation: true }),
        reconcile: async () => (await ctx.db.order(entry.id))?.status === "CANCELLED" ? "APPLIED" : "AMBIGUOUS" });
        invariant(response.ok && (await ctx.db.order(entry.id))?.status === "CANCELLED", "ADMIN_CANCEL_RECOVERY_FAILED");
      }
    }
    for (const name of Object.keys(activeActors).reverse()) await actors.logout(activeActors[name], ctx.db, ctx.runDir, ctx.journal);
    for (const entry of known) {
      const matches = await ctx.db.ordersByMarkers([entry.marker]);
      invariant(matches.length === 1 && matches[0].id === entry.id && matches[0].status === "CANCELLED",
        "ADMIN_CANCEL_TERMINAL_AUDIT_MISSING");
    }
    invariant(fingerprint(await ctx.db.actorState(customerId)) === fingerprint(baselineCustomer), "ADMIN_CANCEL_CUSTOMER_NOT_RESTORED");
    invariant(fingerprint(await ctx.db.actorState(adminState.user.id)) === fingerprint(baselineAdmin), "ADMIN_CANCEL_ADMIN_CHANGED");
    invariant((await ctx.db.catalog()).fingerprint === ctx.catalog.fingerprint, "CATALOG_CHANGED");
  } catch (error) { failure = error; recoveryRequired = true; }
  if (failure) return { status: "FAIL", code: failure.code ?? "ADMIN_CANCEL_VOUCHER_FAILED", cases: [], recoveryRequired };
  return { status: "PASS", cases: [{ id: "admin-cancel-pending-voucher-reuse", status: "PASS" }],
    summary: { ordersCreated: 2, adminCancellations: 1 } };
}
