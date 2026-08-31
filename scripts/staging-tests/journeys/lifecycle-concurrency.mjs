import { loginActor, logoutActor } from "../actors.mjs";
import { fingerprint } from "../database.mjs";
import { invariant, prerequisite } from "../errors.mjs";
import { mutateOnce } from "../operations.mjs";
import { quoteLine } from "../oracle.mjs";
import { buildPickupCase } from "./common.mjs";
import { createVerifiedPickup } from "./order.mjs";

const roles = [["customerB", "CUSTOMER"], ["staff", "STAFF"], ["admin", "ADMIN"]];
const totals = ["subtotal_vnd", "total_voucher_discount_vnd", "total_vnd", "shipping_fee_vnd", "freeship_discount_vnd", "grand_total_vnd"];
const ambiguous = error => /AMBIGUOUS/.test(error?.code ?? "");
const refused = (response, name, target) => target === "COMPLETED"
  ? response.status === 400 && response.body?.code === "INVALID_TRANSITION"
    || response.status === 409 && ["STATUS_CONFLICT", "CONFLICT"].includes(response.body?.code)
  : response.status === 422 && response.body?.code === "INVALID_STATUS"
    || response.status === 409 && response.body?.code === (name === "admin" ? "STATUS_CONFLICT" : "CONFLICT");

/** Run two bounded no-voucher races; uncertain contenders settle before all writes stop. */
export async function runLifecycleConcurrency(ctx) {
  if (roles.some(([name, role]) => !ctx.actorStates?.[name]?.user?.id || ctx.actorStates[name].user.role !== role
    || !ctx.credentials?.[name]?.phone || !ctx.credentials[name].password)) {
    return { status: "PARTIAL", code: "LIFECYCLE_RACE_ACTOR_UNAVAILABLE", cases: [] };
  }
  const { db, catalog, journal, runState, runDir } = ctx;
  const userId = ctx.actorStates.customerB.user.id;
  const staffId = ctx.actorStates.staff.user.id;
  const adminId = ctx.actorStates.admin.user.id;
  const lifecycle = ctx.actorLifecycle ?? { login: loginActor, logout: logoutActor };
  const actors = {};
  const baselines = {};
  const owned = [];
  const awards = [];
  const cases = [];
  let failure;
  let recoveryRequired = false;
  const time = () => prerequisite(Number.isFinite(ctx.deadline) && ctx.deadline - (ctx.now?.() ?? Date.now()) >= 240_000,
    "LIFECYCLE_RACE_TIME_BUDGET_INSUFFICIENT");
  const scope = (order, selected) => invariant(order?.id === selected.orderId && order.user_id === userId
    && order.note === selected.marker, "LIFECYCLE_RACE_SCOPE_INVALID");
  const verifyAssets = async () => {
    for (const [name] of roles) {
      if (!baselines[name]) continue;
      const state = await db.actorState(ctx.actorStates[name].user.id);
      const baseline = baselines[name];
      for (const old of baseline.ledger) invariant(fingerprint(state.ledger.find(row => row.id === old.id)) === fingerprint(old),
        "LIFECYCLE_RACE_OLD_LEDGER_CHANGED");
      const logs = state.ledger.filter(row => !baseline.ledger.some(old => old.id === row.id));
      const expected = name === "customerB" ? awards : [];
      invariant(logs.length === expected.length && expected.every(award => logs.filter(row => row.order_id === award.orderId
        && row.user_id === userId && row.performed_by === staffId && row.reason === "order_complete"
        && row.voucher_id == null && row.reversed_log_id == null
        && Number(row.delta) === award.points).length === 1), "LIFECYCLE_RACE_LEDGER_INVALID");
      invariant(state.user.points_balance === baseline.user.points_balance + expected.reduce((sum, award) => sum + award.points, 0),
        "LIFECYCLE_RACE_POINTS_INVALID");
      invariant(fingerprint({ ...state.user, points_balance: baseline.user.points_balance }) === fingerprint(baseline.user)
        && fingerprint(state.vouchers) === fingerprint(baseline.vouchers) && fingerprint(state.grants) === fingerprint(baseline.grants),
      "LIFECYCLE_RACE_ASSETS_CHANGED");
    }
  };
  const verify = async (selected, status) => {
    const stored = await db.order(selected.orderId);
    scope(stored, selected);
    const response = await actors.customerB.api.request(`/api/orders/${selected.orderId}`);
    invariant(response.status === 200 && response.body?.data?.id === selected.orderId, "LIFECYCLE_RACE_READ_INVALID");
    for (const order of [stored, response.body.data]) {
      invariant(order.status === status && order.order_type === "PICKUP", "LIFECYCLE_RACE_STATUS_INVALID");
      for (const field of totals) invariant(order[field] === selected.expected[field], "LIFECYCLE_RACE_TOTAL_INVALID");
      invariant(order.items?.length === selected.payload.items.length, "LIFECYCLE_RACE_ITEMS_INVALID");
      for (const [index, input] of selected.payload.items.entries()) {
        const line = order.items[index];
        const quote = quoteLine(catalog, input);
        invariant(line.menu_item_id === input.menu_item_id && line.size === input.size && line.quantity === input.quantity
          && line.sweetness === input.sweetness && line.ice_option === input.ice_option && line.coldwhisk === input.coldwhisk
          && line.note === selected.marker && line.unit_price_vnd === quote.drink && line.addons_price_vnd === quote.addons
          && line.selected_powder_id === quote.powderId && line.selected_milk_type_id === quote.liquidId
          && line.base_liquid_ml === quote.baseLiquidMl && line.addons?.length === 0,
        "LIFECYCLE_RACE_SNAPSHOT_INVALID");
      }
    }
    invariant(!(stored.discountVouchers ?? []).length && !(stored.bundleApplications ?? []).length && !stored.freeship_voucher_id
      && stored.items.every(item => !item.product_voucher_id && !item.item_voucher_id && !(item.addonVouchers ?? []).length),
    "LIFECYCLE_RACE_UNEXPECTED_VOUCHER");
    invariant(stored.payment_confirmed_by === (selected.confirmed ? adminId : null), "LIFECYCLE_RACE_PAYMENT_ACTOR_INVALID");
    const paymentTime = Date.parse(stored.payment_confirmed_at);
    invariant(selected.confirmed ? Number.isFinite(paymentTime) && paymentTime >= Date.parse(stored.created_at) - 5_000
      && paymentTime <= (ctx.now?.() ?? Date.now()) + 5_000
      && (selected.paymentTime === undefined || selected.paymentTime === stored.payment_confirmed_at)
      : stored.payment_confirmed_at == null, "LIFECYCLE_RACE_PAYMENT_TIME_INVALID");
    if (selected.confirmed) selected.paymentTime = stored.payment_confirmed_at;
    invariant(stored.handled_by === (selected.prepared ? staffId : null), "LIFECYCLE_RACE_HANDLER_INVALID");
    invariant(status === "COMPLETED" ? stored.points_earned === selected.expected.orderPoints : !stored.points_earned,
      "LIFECYCLE_RACE_POINTS_SNAPSHOT_INVALID");
    await verifyAssets();
    invariant((await db.catalog()).fingerprint === catalog.fingerprint, "CATALOG_CHANGED");
  };
  const patch = async (selected, name, target, race = false) => {
    const before = await db.order(selected.orderId);
    scope(before, selected);
    const state = await db.actorState(userId);
    const path = target === "ADMIN_CONFIRMED" ? `/api/admin/orders/${selected.orderId}/confirm-payment`
      : name === "customerB" ? `/api/orders/${selected.orderId}` : `/api/staff/orders/${selected.orderId}`;
    return mutateOnce({ journal, type: target === "ADMIN_CONFIRMED" ? "confirm" : target === "CANCELLED" ? "cancel" : "status",
      recovery: { actor: name, userId, marker: selected.marker, orderId: selected.orderId, sourceStatuses: [before.status],
        targetStatus: target, baselineLedgerIds: state.ledger.map(row => row.id), baselinePoints: state.user.points_balance },
      send: () => actors[name].api.request(path, { method: "PATCH", body: { status: target }, mutation: true, timeoutMs: 30_000 }),
      isKnownNotApplied: response => race && refused(response, name, target),
      reconcile: async response => {
        const current = await db.order(selected.orderId);
        scope(current, selected);
        // A shared target cannot attribute a lost response to one of two contenders.
        if (race) return "AMBIGUOUS";
        if (current.status === target) return "APPLIED";
        return response && fingerprint(current) === fingerprint(before) ? "NOT_APPLIED" : "AMBIGUOUS";
      } });
  };
  const transition = async (selected, name, target) => {
    const response = await patch(selected, name, target);
    invariant(response.ok && (response.recovered || response.body?.data?.status === target), "LIFECYCLE_RACE_TRANSITION_INVALID");
    if (target === "ADMIN_CONFIRMED") selected.confirmed = true;
    if (target === "STAFF_DONE") selected.prepared = true;
    await verify(selected, target);
  };
  const race = async (selected, contenders) => {
    const settled = await Promise.allSettled(contenders.map(([name, target]) => patch(selected, name, target, true)));
    const rejected = settled.filter(result => result.status === "rejected");
    if (rejected.length) throw (rejected.find(result => ambiguous(result.reason)) ?? rejected[0]).reason;
    const responses = settled.map(result => result.value);
    invariant(responses.filter(response => response.ok).length === 1, "LIFECYCLE_RACE_WINNER_COUNT_INVALID");
    const winner = responses.findIndex(response => response.ok);
    invariant(responses[winner].status === 200 && responses[winner].body?.data?.status === contenders[winner][1],
      "LIFECYCLE_RACE_WINNER_CONTRACT_INVALID");
    invariant(refused(responses[1 - winner], ...contenders[1 - winner]), "LIFECYCLE_RACE_LOSER_CONTRACT_INVALID");
    return contenders[winner][1];
  };
  const create = async caseId => {
    time();
    const selected = buildPickupCase({ catalog, runId: ctx.runId, caseId });
    prerequisite(selected.expected.orderPoints > 0, "LIFECYCLE_RACE_POSITIVE_QUOTE_MISSING");
    await ctx.pacer.reserve(userId, 1, 240_000);
    time();
    await createVerifiedPickup({ actor: actors.customerB, actorName: "customerB", userId, db, journal, pickupCase: selected,
      runState: { addMarker(marker) { runState?.addMarker(marker); owned.push(selected); } },
      onOrderIdentified(id) { selected.orderId = id; } });
    await verify(selected, "PENDING");
    return selected;
  };
  try {
    time();
    prerequisite(new Set(roles.map(([name]) => ctx.actorStates[name].user.id)).size === 3, "LIFECYCLE_RACE_ACTORS_NOT_DISTINCT");
    prerequisite(typeof ctx.pacer?.reserve === "function", "LIFECYCLE_RACE_PACER_MISSING");
    const preview = buildPickupCase({ catalog, runId: ctx.runId, caseId: "confirm-cancel-race" });
    prerequisite(preview.expected.orderPoints > 0, "LIFECYCLE_RACE_POSITIVE_QUOTE_MISSING");
    for (const [name] of roles) {
      prerequisite(!(ctx.actorStates[name].orders ?? []).length, "LIFECYCLE_RACE_PREEXISTING_ORDER");
      baselines[name] = structuredClone(await db.actorState(ctx.actorStates[name].user.id));
    }
    for (const [name] of roles) {
      actors[name] = await lifecycle.login({ origin: ctx.origin, name, credential: ctx.credentials[name], expectedUserId: ctx.actorStates[name].user.id,
        runDir, fetchImpl: ctx.fetchImpl, journal, db, baselineSessionIds: baselines[name].sessions.map(session => session.id) });
      if (actors[name].sessionId) runState?.addSession(name, actors[name].sessionId);
    }
    const first = await create("confirm-cancel-race");
    const status = await race(first, [["admin", "ADMIN_CONFIRMED"], ["customerB", "CANCELLED"]]);
    first.confirmed = status === "ADMIN_CONFIRMED";
    await verify(first, status);
    if (status !== "CANCELLED") await transition(first, "admin", "CANCELLED");
    cases.push({ id: "confirm-versus-cancel", status: "PASS" });
    const second = await create("double-completion-race");
    await transition(second, "admin", "ADMIN_CONFIRMED");
    await transition(second, "staff", "STAFF_DONE");
    await race(second, [["staff", "COMPLETED"], ["staff", "COMPLETED"]]);
    awards.push({ orderId: second.orderId, points: second.expected.orderPoints });
    await verify(second, "COMPLETED");
    cases.push({ id: "simultaneous-completion", status: "PASS" });
  } catch (error) { failure = error; }
  if (ambiguous(failure)) throw failure;
  try {
    for (const selected of owned) {
      const matches = await db.ordersByMarkers([selected.marker]);
      invariant(matches.length <= 1, "LIFECYCLE_RACE_CLEANUP_COLLISION");
      if (!matches.length && !selected.orderId) continue;
      const current = matches[0];
      if (!selected.orderId && current?.user_id === userId) selected.orderId = current.id;
      scope(current, selected);
      if (!["CANCELLED", "COMPLETED"].includes(current.status)) {
        const response = await patch(selected, "admin", "CANCELLED");
        invariant(response.ok && (await db.order(selected.orderId))?.status === "CANCELLED", "LIFECYCLE_RACE_CLEANUP_FAILED");
      }
    }
    for (const name of Object.keys(actors).reverse()) await lifecycle.logout(actors[name], db, runDir, journal);
    for (const [name] of roles) if (baselines[name]) invariant(fingerprint((await db.actorState(ctx.actorStates[name].user.id)).sessions)
      === fingerprint(baselines[name].sessions), "LIFECYCLE_RACE_SESSIONS_CHANGED");
    await verifyAssets();
    if (!failure) {
      for (const selected of owned) {
        const matches = await db.ordersByMarkers([selected.marker]);
        invariant(matches.length === 1, "LIFECYCLE_RACE_TERMINAL_AUDIT_MISSING");
        scope(matches[0], selected);
        invariant(matches[0].status === (awards.some(award => award.orderId === selected.orderId) ? "COMPLETED" : "CANCELLED"),
          "LIFECYCLE_RACE_TERMINAL_AUDIT_INVALID");
      }
    }
    if (catalog) invariant((await db.catalog()).fingerprint === catalog.fingerprint, "CATALOG_CHANGED");
  } catch (error) {
    if (ambiguous(error)) throw error;
    if (!failure || failure.status === "PARTIAL") failure = error;
    recoveryRequired = true;
  }
  if (failure) return { status: failure.status === "PARTIAL" ? "PARTIAL" : "FAIL", code: failure.code ?? "LIFECYCLE_RACE_FAILED", cases, recoveryRequired };
  return { status: "PASS", cases, summary: { races: 2, pointsAwarded: awards.reduce((sum, award) => sum + award.points, 0) } };
}
