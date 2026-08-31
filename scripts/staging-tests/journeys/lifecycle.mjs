import { loginActor, logoutActor } from "../actors.mjs";
import { fingerprint } from "../database.mjs";
import { invariant, prerequisite } from "../errors.mjs";
import { mutateOnce } from "../operations.mjs";
import { quoteLine } from "../oracle.mjs";
import { buildPickupCase } from "./common.mjs";
import { createVerifiedPickup } from "./order.mjs";

const actorRoles = [["customerB", "CUSTOMER"], ["staff", "STAFF"], ["admin", "ADMIN"]];
const totalFields = ["subtotal_vnd", "total_voucher_discount_vnd", "total_vnd", "shipping_fee_vnd", "freeship_discount_vnd", "grand_total_vnd"];
const isAmbiguous = error => /AMBIGUOUS/.test(error?.code ?? "");

function financialSnapshot(order) {
  return { totals: totalFields.map(field => order[field]), items: order.items.map(item => ({
    menu_item_id: item.menu_item_id, size: item.size, quantity: item.quantity, unit_price_vnd: item.unit_price_vnd,
    addons_price_vnd: item.addons_price_vnd, selected_powder_id: item.selected_powder_id,
    selected_milk_type_id: item.selected_milk_type_id, base_liquid_ml: item.base_liquid_ml,
    note: item.note, addons: item.addons.map(addon => ({ addon_option_id: addon.addon_option_id,
      quantity: addon.quantity, unit_price_vnd: addon.unit_price_vnd })),
  })) };
}

/** Run the bounded no-voucher online lifecycle through separately authenticated actors. */
export async function runOnlineLifecycle(ctx) {
  for (const [name, role] of actorRoles) {
    const state = ctx.actorStates?.[name];
    if (!state?.user?.id || state.user.role !== role || !ctx.credentials?.[name]?.phone || !ctx.credentials[name].password) {
      return { status: "PARTIAL", code: "LIFECYCLE_ACTOR_UNAVAILABLE", cases: [] };
    }
  }
  const { db, catalog, runId, runDir, journal, runState } = ctx;
  const cases = [];
  const actors = {};
  const baselines = {};
  const lifecycle = ctx.actorLifecycle ?? { login: loginActor, logout: logoutActor };
  const customerId = ctx.actorStates.customerB.user.id;
  const staffId = ctx.actorStates.staff.user.id;
  let pickupCase;
  let orderId;
  let savedSnapshot;
  let failure;
  let expectedCustomerAssets;
  let completed = false;
  let markerOwned = false;
  let recoveryRequired = false;
  try {
    prerequisite(new Set(actorRoles.map(([name]) => ctx.actorStates[name].user.id)).size === 3, "LIFECYCLE_ACTORS_NOT_DISTINCT");
    prerequisite(typeof ctx.pacer?.reserve === "function", "LIFECYCLE_PACER_MISSING");
    for (const [name] of actorRoles) {
      prerequisite(!(ctx.actorStates[name].orders ?? []).length, "LIFECYCLE_PREEXISTING_ORDER");
      baselines[name] = structuredClone(await db.actorState(ctx.actorStates[name].user.id));
    }
    pickupCase = buildPickupCase({ catalog, runId, caseId: "online-lifecycle" });
    prerequisite(pickupCase.expected.orderPoints > 0, "LIFECYCLE_POSITIVE_POINTS_QUOTE_MISSING");
    await ctx.pacer.reserve(customerId, 1, 240_000);
    for (const [name] of actorRoles) {
      actors[name] = await lifecycle.login({ origin: ctx.origin, name, credential: ctx.credentials[name],
        expectedUserId: ctx.actorStates[name].user.id, runDir, fetchImpl: ctx.fetchImpl, journal, db,
        baselineSessionIds: baselines[name].sessions.map(session => session.id) });
      if (actors[name].sessionId) runState?.addSession(name, actors[name].sessionId);
    }
    const created = await createVerifiedPickup({ actor: actors.customerB, actorName: "customerB", userId: customerId,
      db, journal, runState: { addMarker: marker => { runState?.addMarker(marker); markerOwned = true; } },
      pickupCase, onOrderIdentified: id => { orderId = id; } });
    orderId = created.orderId;
    const initial = await db.order(orderId);
    invariant(initial.items.every(item => !item.product_voucher_id && !item.item_voucher_id && !(item.addonVouchers ?? []).length)
      && !(initial.discountVouchers ?? []).length && !(initial.bundleApplications ?? []).length && !initial.freeship_voucher_id,
    "LIFECYCLE_UNEXPECTED_VOUCHER");
    for (const input of pickupCase.payload.items) {
      const quote = quoteLine(catalog, input);
      const line = initial.items.find(item => item.menu_item_id === input.menu_item_id && item.size === input.size);
      invariant(line?.unit_price_vnd === quote.drink && line.addons_price_vnd === quote.addons
        && line.selected_powder_id === quote.powderId && line.selected_milk_type_id === quote.liquidId
        && line.base_liquid_ml === quote.baseLiquidMl, "LIFECYCLE_INITIAL_SNAPSHOT_INVALID");
    }
    savedSnapshot = fingerprint(financialSnapshot(initial));
    const verifyPoints = async points => {
      const state = await db.actorState(customerId);
      const baseline = baselines.customerB;
      for (const old of baseline.ledger) invariant(fingerprint(state.ledger.find(log => log.id === old.id)) === fingerprint(old), "LIFECYCLE_OLD_LEDGER_CHANGED");
      const newLogs = state.ledger.filter(log => !baseline.ledger.some(old => old.id === log.id));
      invariant(points === 0 ? newLogs.length === 0 : newLogs.length === 1 && newLogs[0].reason === "order_complete"
        && newLogs[0].order_id === orderId && newLogs[0].performed_by === staffId && Number(newLogs[0].delta) === points,
      "LIFECYCLE_POINTS_LEDGER_INVALID");
      invariant(state.user.points_balance === baseline.user.points_balance + points, "LIFECYCLE_POINTS_BALANCE_INVALID");
      invariant(fingerprint(state.vouchers) === fingerprint(baseline.vouchers)
        && fingerprint(state.grants) === fingerprint(baseline.grants), "LIFECYCLE_CUSTOMER_ASSETS_CHANGED");
    };
    const verifyOrder = async status => {
      const stored = await db.order(orderId);
      const response = await actors.customerB.api.request(`/api/orders/${orderId}`);
      invariant(response.status === 200 && response.body?.data?.status === status && stored?.status === status,
        "LIFECYCLE_ORDER_STATUS_INVALID");
      invariant(stored.user_id === customerId && stored.note === pickupCase.marker
        && fingerprint(financialSnapshot(stored)) === savedSnapshot
        && fingerprint(financialSnapshot(response.body.data)) === savedSnapshot, "LIFECYCLE_SNAPSHOT_CHANGED");
      if (status !== "PENDING") invariant(stored.payment_confirmed_by === ctx.actorStates.admin.user.id, "LIFECYCLE_PAYMENT_ACTOR_INVALID");
      if (["STAFF_DONE", "COMPLETED"].includes(status)) invariant(stored.handled_by === staffId, "LIFECYCLE_HANDLER_INVALID");
      await verifyPoints(status === "COMPLETED" ? pickupCase.expected.orderPoints : 0);
      if (status === "COMPLETED") invariant(stored.points_earned === pickupCase.expected.orderPoints, "LIFECYCLE_POINTS_SNAPSHOT_INVALID");
    };
    const patch = async (id, name, path, target, refusal = null) => {
      const before = await db.order(orderId);
      const beforeActor = await db.actorState(customerId);
      const type = path.endsWith("/confirm-payment") ? "confirm" : target === "CANCELLED" ? "cancel" : "status";
      const response = await mutateOnce({ journal, type, recovery: {
        actor: name, userId: customerId, marker: pickupCase.marker, orderId, sourceStatuses: [before.status],
        targetStatus: target, expectedRejection: Boolean(refusal), baselineLedgerIds: beforeActor.ledger.map(log => log.id),
        baselinePoints: beforeActor.user.points_balance,
      }, send: () => actors[name].api.request(path, { method: "PATCH", body: { status: target }, mutation: true, timeoutMs: 30_000 }),
      reconcile: async failed => {
        const current = await db.order(orderId);
        if (!refusal && current?.status === target && current.user_id === customerId && current.note === pickupCase.marker) return "APPLIED";
        if (failed && fingerprint(current) === fingerprint(before)) return "NOT_APPLIED";
        return "AMBIGUOUS";
      } });
      if (refusal) {
        invariant(response.status === refusal.status && response.body?.code === refusal.code, "LIFECYCLE_REFUSAL_INVALID");
        invariant(fingerprint(await db.order(orderId)) === fingerprint(before)
          && fingerprint(await db.actorState(customerId)) === fingerprint(beforeActor), "LIFECYCLE_REJECTED_MUTATION_CHANGED_STATE");
      } else {
        invariant(response.ok && (response.recovered || response.body?.data?.status === target), "LIFECYCLE_TRANSITION_REJECTED");
        await verifyOrder(target);
      }
      cases.push({ id, status: "PASS" });
    };
    await verifyOrder("PENDING");
    const staffPath = `/api/staff/orders/${orderId}`;
    const customerPath = `/api/orders/${orderId}`;
    const confirmPath = `/api/admin/orders/${orderId}/confirm-payment`;
    await patch("customer-cannot-confirm", "customerB", confirmPath, "ADMIN_CONFIRMED", { status: 401, code: "UNAUTHORIZED" });
    await patch("staff-cannot-confirm", "staff", confirmPath, "ADMIN_CONFIRMED", { status: 401, code: "UNAUTHORIZED" });
    await patch("customer-cannot-use-staff-route", "customerB", staffPath, "STAFF_DONE", { status: 401, code: "UNAUTHORIZED" });
    await patch("admin-cannot-use-customer-route", "admin", customerPath, "CANCELLED", { status: 403, code: "FORBIDDEN" });
    await patch("online-payment-confirmed", "admin", confirmPath, "ADMIN_CONFIRMED");
    await patch("customer-cannot-cancel-confirmed", "customerB", customerPath, "CANCELLED", { status: 422, code: "INVALID_STATUS" });
    await patch("online-staff-done", "staff", staffPath, "STAFF_DONE");
    await patch("online-completed", "staff", staffPath, "COMPLETED");
    completed = true;
    await patch("completion-replay-rejected", "staff", staffPath, "COMPLETED", { status: 400, code: "INVALID_TRANSITION" });
    const profile = await actors.customerB.api.request("/api/profile");
    invariant(profile.status === 200 && profile.body?.data?.points_balance === baselines.customerB.user.points_balance + pickupCase.expected.orderPoints,
      "LIFECYCLE_PUBLIC_POINTS_INVALID");
    expectedCustomerAssets = structuredClone(await db.actorState(customerId));
  } catch (error) { failure = error; }
  if (failure && isAmbiguous(failure)) throw failure;
  try {
    if (markerOwned && actors.admin) {
      const matches = await db.ordersByMarkers([pickupCase.marker]);
      invariant(matches.length <= 1, "LIFECYCLE_CLEANUP_MARKER_COLLISION");
      const current = matches[0];
      if (current && !["COMPLETED", "CANCELLED"].includes(current.status)) {
        invariant(current.user_id === customerId && current.note === pickupCase.marker, "LIFECYCLE_CLEANUP_SCOPE_INVALID");
        const response = await mutateOnce({ journal, type: "cancel", recovery: { actor: "admin", userId: customerId,
          marker: pickupCase.marker, orderId: current.id, sourceStatuses: [current.status], targetStatus: "CANCELLED" },
        send: () => actors.admin.api.request(`/api/staff/orders/${current.id}`, { method: "PATCH", body: { status: "CANCELLED" }, mutation: true }),
        reconcile: async failed => {
          const order = await db.order(current.id);
          if (order?.status === "CANCELLED") return "APPLIED";
          return failed && order?.status === current.status ? "NOT_APPLIED" : "AMBIGUOUS";
        } });
        invariant(response.ok && (await db.order(current.id))?.status === "CANCELLED", "LIFECYCLE_CLEANUP_FAILED");
      }
    }
    for (const name of Object.keys(actors).reverse()) await lifecycle.logout(actors[name], db, runDir, journal);
    if (orderId) {
      const retained = await db.ordersByMarkers([pickupCase.marker]);
      invariant(retained.length === 1 && retained[0].id === orderId && retained[0].user_id === customerId
        && retained[0].note === pickupCase.marker && ["CANCELLED", "COMPLETED"].includes(retained[0].status),
      "LIFECYCLE_TERMINAL_AUDIT_MISSING");
      if (completed) invariant(retained[0].status === "COMPLETED", "LIFECYCLE_COMPLETED_AUDIT_CHANGED");
    }
    for (const [name] of actorRoles) {
      if (!baselines[name]) continue;
      const final = await db.actorState(ctx.actorStates[name].user.id);
      invariant(fingerprint(final.sessions) === fingerprint(baselines[name].sessions), "LIFECYCLE_SESSIONS_CHANGED");
      if (name !== "customerB") invariant(fingerprint(final) === fingerprint(baselines[name]), "LIFECYCLE_OTHER_ACTOR_CHANGED");
      if (name === "customerB" && expectedCustomerAssets) {
        for (const field of ["user", "vouchers", "ledger", "grants"]) invariant(fingerprint(final[field])
          === fingerprint(expectedCustomerAssets[field]), "LIFECYCLE_FINAL_CUSTOMER_ASSETS_CHANGED");
      }
    }
    if (catalog) invariant((await db.catalog()).fingerprint === catalog.fingerprint, "CATALOG_CHANGED");
  } catch (error) { if (isAmbiguous(error)) throw error; failure = error; recoveryRequired = true; }
  if (failure) return { status: failure.status === "PARTIAL" && !orderId ? "PARTIAL" : "FAIL",
    code: failure.code ?? "LIFECYCLE_FAILED", cases, recoveryRequired };
  return { status: "PASS", cases, summary: { ordersCompleted: 1, pointsAwarded: pickupCase.expected.orderPoints } };
}
