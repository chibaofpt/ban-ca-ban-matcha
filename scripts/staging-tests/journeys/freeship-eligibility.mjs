import { loginActor, logoutActor } from "../actors.mjs";
import { fingerprint } from "../database.mjs";
import { invariant, prerequisite, PrerequisiteMissing } from "../errors.mjs";
import { AmbiguousMutation } from "../http.mjs";
import { mutateOnce } from "../operations.mjs";
import { quoteLine } from "../oracle.mjs";
import { buildPickupCase } from "./common.mjs";

const CASE_ID = "freeship-min-order-rejection";
const assets = state => fingerprint({ user: state.user, vouchers: state.vouchers, ledger: state.ledger, grants: state.grants });
const ambiguous = error => error instanceof AmbiguousMutation || /AMBIGUOUS/.test(error?.code ?? "");
const validAddress = (address, userId) => address?.id && address.user_id === userId
  && Number.isFinite(address.distance_km) && address.distance_km > 0 && address.distance_km <= 15
  && Number.isFinite(address.lat) && Number.isFinite(address.lng) && address.receiver_name && address.receiver_phone;
const usable = (voucher, userId, now) => voucher?.id && voucher.qr_token && voucher.user_id === userId
  && voucher.voucher_type === "FREESHIP" && voucher.status === "ACTIVE"
  && Number.isSafeInteger(voucher.min_order_vnd) && voucher.min_order_vnd > 0
  && Number.isSafeInteger(voucher.covered_delivery_fee_vnd) && voucher.covered_delivery_fee_vnd > 0
  && (voucher.expires_at == null || Date.parse(voucher.expires_at) > now);

function selectBasket(catalog, runId, vouchers) {
  for (const item of catalog.items ?? []) {
    if (!item.is_available) continue;
    const sizes = item.category === "extras" ? [null] : (item.sizes ?? []).map(row => row.size);
    for (const size of sizes) {
      const lineInput = { menu_item_id: item.id, quantity: 1, addon_option_ids: [], ...(size ? { size } : {}) };
      let price;
      try { const quote = quoteLine(catalog, lineInput); price = quote.drink + quote.addons; }
      catch { continue; }
      if (!Number.isSafeInteger(price) || price <= 0) continue;
      const voucher = vouchers.find(candidate => price < candidate.min_order_vnd);
      if (voucher) return { ...buildPickupCase({ catalog, runId, caseId: "elig-freeship", lineInput }), voucher };
    }
  }
  prerequisite(false, "FREESHIP_ELIGIBILITY_BASKET_MISSING");
}

/** Verify one FREESHIP minimum-order rejection without consuming existing assets. */
export async function runFreeshipEligibilityJourney(ctx) {
  const name = "customerB";
  const baseline = structuredClone(ctx.actorStates?.[name]);
  const credential = ctx.credentials?.[name];
  const userId = baseline?.user?.id;
  const now = ctx.now ?? Date.now;
  let attempted = 0;
  let rejected = 0;
  const result = (status, code, recoveryRequired = false) => ({ status, code, recoveryRequired,
    cases: [{ id: CASE_ID, status, code }], summary: { attempted, rejected } });
  let address;
  let selected;
  try {
    prerequisite(userId && baseline.user.role === "CUSTOMER" && credential?.phone && credential.password,
      "FREESHIP_ELIGIBILITY_ACTOR_MISSING");
    prerequisite(typeof ctx.pacer?.reserve === "function", "FREESHIP_ELIGIBILITY_PACER_MISSING");
    address = baseline.addresses?.find(row => validAddress(row, userId));
    prerequisite(address, "FREESHIP_ELIGIBILITY_ADDRESS_MISSING");
    const vouchers = (baseline.vouchers ?? []).filter(voucher => usable(voucher, userId, now()));
    prerequisite(vouchers.length, "FREESHIP_ELIGIBILITY_VOUCHER_MISSING");
    selected = selectBasket(ctx.catalog, ctx.runId, vouchers);
  } catch (error) { return result(error.status === "PARTIAL" ? "PARTIAL" : "FAIL", error.code ?? "FREESHIP_ELIGIBILITY_FAILED"); }

  const { db, journal, runState } = ctx;
  const lifecycle = ctx.actorLifecycle ?? { login: loginActor, logout: logoutActor };
  const shipping = Math.ceil(((15_000 + Math.max(0, address.distance_km - 2) * 5_700) * 0.85) / 1_000) * 1_000;
  const payload = { ...selected.payload, order_type: "DELIVERY", address_id: address.id,
    client_shipping_fee_vnd: shipping, freeship_voucher_id: selected.voucher.qr_token };
  const evidence = async () => {
    const [state, orders, vouchers, uses, currentActor, catalog] = await Promise.all([
      db.actorState(userId), db.ordersByMarkers([selected.marker]), db.vouchers([selected.voucher.id]),
      db.activeUses([selected.voucher.id]), db.actor(credential.phone), db.catalog(),
    ]);
    return { state, orders, voucher: vouchers[0], uses, currentActor, catalog };
  };
  const unchanged = (current, beforeDispatch = false) => {
    invariant(current.orders.length === 0, beforeDispatch ? "FREESHIP_ELIGIBILITY_MARKER_COLLISION" : "FREESHIP_ELIGIBILITY_UNEXPECTED_ORDER");
    invariant(assets(current.state) === assets(baseline), "FREESHIP_ELIGIBILITY_ASSETS_CHANGED");
    invariant(fingerprint(current.voucher) === fingerprint(selected.voucher), "FREESHIP_ELIGIBILITY_VOUCHER_CHANGED");
    invariant(current.uses.length === 0, "FREESHIP_ELIGIBILITY_ACTIVE_USE");
    invariant(current.currentActor?.id === userId && fingerprint(current.currentActor.addresses?.find(row => row.id === address.id))
      === fingerprint(address), "FREESHIP_ELIGIBILITY_ADDRESS_CHANGED");
    invariant(current.catalog.fingerprint === ctx.catalog.fingerprint, "CATALOG_CHANGED");
  };
  const premise = async () => {
    const current = await evidence();
    unchanged(current, true);
    prerequisite(usable(current.voucher, userId, now()), "FREESHIP_ELIGIBILITY_VOUCHER_EXPIRED_DURING_PACING");
    invariant(selected.expected.total_vnd > 0 && selected.expected.total_vnd < current.voucher.min_order_vnd,
      "FREESHIP_ELIGIBILITY_MINIMUM_PREMISE_CHANGED");
  };
  let actor;
  let failure;
  let recoveryRequired = false;
  let unsettled = false;
  let unobserved = false;
  let notDispatched = false;
  try {
    await premise();
    const reservation = await ctx.pacer.reserve(userId, 1, 45_000);
    await premise();
    actor = await lifecycle.login({ origin: ctx.origin, name, credential, expectedUserId: userId, runDir: ctx.runDir,
      fetchImpl: ctx.fetchImpl, journal, db, baselineSessionIds: baseline.sessions.map(session => session.id) });
    if (actor.sessionId) runState?.addSession?.(name, actor.sessionId);
    await premise();
    runState?.addMarker?.(selected.marker);
    runState?.addVoucher?.(selected.voucher.id);
    const response = await mutateOnce({ journal, type: "create",
      recovery: { actor: name, userId, marker: selected.marker, baselineOrderIds: [],
        baselineVoucherIds: [selected.voucher.id], orderId: null, sourceStatuses: ["ABSENT"], targetStatus: "REJECTED" },
      send: async () => {
        reservation?.markDispatched?.();
        attempted += 1;
        unsettled = true;
        try {
          return await actor.api.request("/api/orders", { method: "POST", body: payload, mutation: true, timeoutMs: 30_000 });
        } catch (error) {
          if (error instanceof PrerequisiteMissing) { notDispatched = true; attempted -= 1; }
          throw error;
        }
      },
      isKnownNotApplied: reply => reply.status === 400 && reply.body?.code === "MIN_ORDER_NOT_MET",
      reconcile: async reply => {
        unchanged(await evidence());
        unobserved = !reply;
        unsettled = false;
        return "NOT_APPLIED";
      },
    }).catch(error => {
      if (!unobserved || error.code !== "MUTATION_OUTCOME_AMBIGUOUS") throw error;
      return null;
    });
    if (!unobserved) {
      invariant(response.status === 400 && response.body?.code === "MIN_ORDER_NOT_MET", "FREESHIP_ELIGIBILITY_REJECTION_MISMATCH");
      rejected += 1;
    }
    unchanged(await evidence());
    unsettled = false;
  } catch (error) {
    failure = error;
    if (notDispatched && error instanceof PrerequisiteMissing) {
      try { unchanged(await evidence()); unsettled = false; }
      catch (proofError) { failure = proofError; }
    }
    recoveryRequired = unsettled || ambiguous(failure);
  }
  if (ambiguous(failure)) throw failure;
  if (actor && !recoveryRequired) {
    try { await lifecycle.logout(actor, db, ctx.runDir, journal); }
    catch (error) { failure ??= error; recoveryRequired = true; }
  }
  try {
    unchanged(await evidence());
    const final = await db.actorState(userId);
    invariant(fingerprint(final.sessions) === fingerprint(baseline.sessions), "FREESHIP_ELIGIBILITY_SESSIONS_CHANGED");
  } catch (error) { failure ??= error; recoveryRequired = true; }
  if (failure) return result(failure.status === "PARTIAL" && !recoveryRequired ? "PARTIAL" : "FAIL",
    failure.code ?? "FREESHIP_ELIGIBILITY_FAILED", recoveryRequired);
  return result(unobserved ? "PARTIAL" : "PASS", unobserved ? "FREESHIP_ELIGIBILITY_REJECTION_RESPONSE_UNOBSERVED" : "MIN_ORDER_NOT_MET");
}
