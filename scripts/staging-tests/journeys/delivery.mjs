import { loginActor, logoutActor } from "../actors.mjs";
import { fingerprint } from "../database.mjs";
import { invariant, prerequisite } from "../errors.mjs";
import { quoteOrder } from "../oracle.mjs";
import { buildPickupCase } from "./common.mjs";
import { createVerifiedPickup, cancelVerifiedPickup } from "./order.mjs";
import { acquireSmokeDiscount } from "./voucher.mjs";

const lifecycle = { login: loginActor, logout: logoutActor };
const orders = { create: createVerifiedPickup, cancel: cancelVerifiedPickup };
const ceil1000 = value => Math.ceil(value / 1_000) * 1_000;

/** Build one delivery case from a saved-address distance snapshot.
 * @param {{catalog: import('./common.mjs').JourneyCatalog, runId: string, caseId: string,
 * address: {id: string, distance_km: number}, voucher?: import('./common.mjs').VoucherSelection|null}} options
 */
export function buildDeliveryCase({ catalog, runId, caseId, address, voucher = null }) {
  prerequisite(address?.id && Number.isFinite(address.distance_km) && address.distance_km > 0 && address.distance_km <= 15,
    "DELIVERY_ADDRESS_DISTANCE_INVALID");
  const shippingFee = ceil1000((15_000 + Math.max(0, address.distance_km - 2) * 5_700) * 0.85);
  const base = buildPickupCase({ catalog, runId, caseId });
  const payload = { ...base.payload, order_type: "DELIVERY", address_id: address.id,
    client_shipping_fee_vnd: shippingFee,
    ...(voucher ? { freeship_voucher_id: voucher.qr_token } : {}),
  };
  const expected = quoteOrder(catalog, { ...payload, shipping_fee_vnd: shippingFee }, voucher ? [voucher] : []);
  return { ...base, payload, expected, addressDistanceKm: address.distance_km, catalogFingerprint: catalog.fingerprint };
}

/** Execute a no-voucher delivery followed by FREESHIP cancellation/reuse. */
export async function runDeliveryJourney(ctx) {
  const userId = ctx.customerState?.user?.id;
  prerequisite(userId && ctx.customerState.user.role === "CUSTOMER", "DELIVERY_CUSTOMER_INVALID");
  prerequisite(!(ctx.customerState.orders ?? []).length, "DELIVERY_PREEXISTING_ORDER");
  const address = (ctx.customerState.addresses ?? []).filter(item => item.distance_km != null && item.distance_km > 0 && item.distance_km <= 15)
    .sort((a, b) => Number(a.distance_km) - Number(b.distance_km))[0];
  prerequisite(address, "DELIVERY_ADDRESS_MISSING");
  prerequisite(typeof ctx.pacer?.reserve === "function", "DELIVERY_PACER_MISSING");
  const actorLifecycle = ctx.actorLifecycle ?? lifecycle;
  const orderLifecycle = ctx.orderLifecycle ?? orders;
  const acquireVoucher = ctx.acquireVoucher ?? acquireSmokeDiscount;
  const baseline = structuredClone(await ctx.db.actorState(userId));
  const known = [];
  const cases = [];
  let actor;
  let acquisition;
  let failure;
  const cycle = async (selected, voucher = null) => {
    const entry = { marker: selected.marker, voucher, orderId: null, cancelDispatched: false };
    known.push(entry);
    const shared = { actor, actorName: "customerB", userId, db: ctx.db, journal: ctx.journal, runState: ctx.runState };
    const created = await orderLifecycle.create({ ...shared, pickupCase: selected, voucher,
      onOrderIdentified: id => { entry.orderId = id; } });
    entry.orderId = created.orderId;
    entry.cancelDispatched = true;
    await orderLifecycle.cancel({ ...shared, marker: selected.marker, orderId: created.orderId, voucher });
  };
  try {
    actor = await actorLifecycle.login({ origin: ctx.origin, name: "customerB", credential: ctx.credential,
      expectedUserId: userId, runDir: ctx.runDir, fetchImpl: ctx.fetchImpl, journal: ctx.journal, db: ctx.db,
      baselineSessionIds: baseline.sessions.map(session => session.id) });
    if (actor.sessionId) ctx.runState?.addSession("customerB", actor.sessionId);
    await ctx.pacer.reserve(userId, 1, 120_000);
    await cycle(buildDeliveryCase({ catalog: ctx.catalog, runId: ctx.runId, caseId: "delivery-plain", address }));
    cases.push({ id: "delivery-no-voucher-cancel", status: "PASS" });
    acquisition = await acquireVoucher({ actor, actorName: "customerB", userId, db: ctx.db, journal: ctx.journal,
      runState: ctx.runState, plan: ctx.plan, voucherType: "FREESHIP" });
    const voucher = acquisition.voucher;
    await ctx.pacer.reserve(userId, 2, 180_000);
    await cycle(buildDeliveryCase({ catalog: ctx.catalog, runId: ctx.runId, caseId: "delivery-freeship", address, voucher }), voucher);
    await cycle(buildDeliveryCase({ catalog: ctx.catalog, runId: ctx.runId, caseId: "delivery-freeship-reuse", address, voucher }), voucher);
    cases.push({ id: "delivery-freeship-cancel-reuse", status: "PASS" });
  } catch (error) { failure = error; }
  if (failure && /AMBIGUOUS/.test(failure.code ?? "")) throw failure;
  try {
    if (actor && failure) {
      for (const entry of [...known].reverse()) {
        if (!entry.orderId || entry.cancelDispatched) continue;
        entry.cancelDispatched = true;
        await orderLifecycle.cancel({ actor, actorName: "customerB", userId, db: ctx.db, journal: ctx.journal,
          runState: ctx.runState, marker: entry.marker, orderId: entry.orderId, voucher: entry.voucher });
      }
    }
    if (actor) await actorLifecycle.logout(actor, ctx.db, ctx.runDir, ctx.journal);
    const final = await ctx.db.actorState(userId);
    invariant(fingerprint(final.sessions) === fingerprint(baseline.sessions), "DELIVERY_SESSION_CHANGED");
    for (const old of baseline.ledger) invariant(fingerprint(final.ledger.find(row => row.id === old.id)) === fingerprint(old), "DELIVERY_OLD_LEDGER_CHANGED");
    if (acquisition?.exchanged) {
      const choice = ctx.plan.internal.coverage.selected.find(item => item.type === "FREESHIP");
      invariant(final.user.points_balance === baseline.user.points_balance - choice.package.points_cost,
        "DELIVERY_EXCHANGE_POINTS_INVALID");
    } else invariant(final.user.points_balance === baseline.user.points_balance, "DELIVERY_POINTS_CHANGED");
    if (acquisition) invariant(final.vouchers.some(item => item.id === acquisition.voucher.id && item.status === "ACTIVE"),
      "DELIVERY_FREESHIP_NOT_RESTORED");
    invariant((await ctx.db.catalog()).fingerprint === ctx.catalog.fingerprint, "CATALOG_CHANGED");
  } catch (error) { failure = error; }
  if (failure) return { status: failure.status === "PARTIAL" && !known.some(item => item.orderId) ? "PARTIAL" : "FAIL",
    code: failure.code ?? "DELIVERY_FAILED", cases, recoveryRequired: known.some(item => item.orderId && !item.cancelDispatched) };
  return { status: "PASS", cases, summary: { ordersCreated: 3, freeshipReused: true } };
}
