import { loginActor, logoutActor } from "../actors.mjs";
import { fingerprint } from "../database.mjs";
import { invariant, prerequisite } from "../errors.mjs";
import { mutateOnce } from "../operations.mjs";
import { quoteLine, quoteOrder } from "../oracle.mjs";
import { buildPickupCase } from "./common.mjs";
import { createVerifiedPickup } from "./order.mjs";

const ACTORS = [["customerB", "CUSTOMER"], ["admin", "ADMIN"], ["staff", "STAFF"]];
const isAmbiguous = error => /AMBIGUOUS/.test(error?.code ?? "");
const ceil1000 = value => Math.ceil(value / 1_000) * 1_000;

function usable(voucher, now) {
  const horizon = now + 300_000;
  return voucher.voucher_type === "FREESHIP" && voucher.status === "ACTIVE" && voucher.qr_token
    && Number.isSafeInteger(voucher.covered_delivery_fee_vnd) && voucher.covered_delivery_fee_vnd > 0
    && (!voucher.expires_at || new Date(voucher.expires_at).getTime() > horizon)
    && (!voucher.package?.ends_at || new Date(voucher.package.ends_at).getTime() > horizon);
}

function validAddress(address) {
  return address?.id && Number.isFinite(address.distance_km) && address.distance_km > 0 && address.distance_km <= 15;
}

function buildCase(catalog, runId, address, voucher) {
  const candidates = [];
  for (const item of catalog.items.filter(item => item.is_available)) {
    const inputs = item.category === "extras" ? [{ menu_item_id: item.id, quantity: 1, addon_option_ids: [] }]
      : (item.sizes ?? []).filter(size => size.base_price_vnd != null).map(size => ({
        menu_item_id: item.id, size: size.size, quantity: 1, addon_option_ids: [],
      }));
    for (const input of inputs) {
      try {
        const quote = quoteLine(catalog, input);
        if (quote.drink + quote.addons > 0) candidates.push({ input, unit: quote.drink + quote.addons });
      } catch { /* One fully configured line is sufficient. */ }
    }
  }
  candidates.sort((left, right) => right.unit - left.unit
    || String(left.input.menu_item_id).localeCompare(String(right.input.menu_item_id)));
  const shipping = ceil1000((15_000 + Math.max(0, address.distance_km - 2) * 5_700) * 0.85);
  const required = Math.max(10_000, voucher.min_order_vnd ?? 0);
  for (const candidate of candidates) {
    const quantity = Math.max(1, Math.ceil(required / candidate.unit));
    if (quantity > 20) continue;
    const base = buildPickupCase({ catalog, runId, caseId: "final-freeship", lineInput: candidate.input });
    const items = [];
    for (let remaining = quantity; remaining > 0; remaining -= 10) {
      items.push({ ...structuredClone(base.payload.items[0]), quantity: Math.min(remaining, 10), client_price_vnd: candidate.unit });
    }
    const payload = { ...base.payload, order_type: "DELIVERY", address_id: address.id,
      client_shipping_fee_vnd: shipping, freeship_voucher_id: voucher.qr_token, items };
    const expected = quoteOrder(catalog, { ...payload, shipping_fee_vnd: shipping }, [voucher]);
    if (expected.total_vnd >= (voucher.min_order_vnd ?? 0) && expected.orderPoints > 0
      && expected.freeship_discount_vnd > 0) {
      return { ...base, payload, expected, address: structuredClone(address), voucher,
        catalogFingerprint: catalog.fingerprint };
    }
  }
  prerequisite(false, "FINAL_FREESHIP_BASKET_INFEASIBLE");
}

function snapshot(order) {
  return { order_type: order.order_type, address_id: order.address_id,
    delivery_distance_km: order.delivery_distance_km, subtotal_vnd: order.subtotal_vnd,
    total_voucher_discount_vnd: order.total_voucher_discount_vnd, total_vnd: order.total_vnd,
    shipping_fee_vnd: order.shipping_fee_vnd, freeship_discount_vnd: order.freeship_discount_vnd,
    grand_total_vnd: order.grand_total_vnd, items: order.items.map(item => ({
      menu_item_id: item.menu_item_id, size: item.size, quantity: item.quantity,
      unit_price_vnd: item.unit_price_vnd, addons_price_vnd: item.addons_price_vnd,
      selected_powder_id: item.selected_powder_id, selected_milk_type_id: item.selected_milk_type_id,
      base_liquid_ml: item.base_liquid_ml, sweetness: item.sweetness, ice_option: item.ice_option,
      coldwhisk: item.coldwhisk, product_voucher_discount_vnd: item.product_voucher_discount_vnd,
      total_discount_vnd: item.total_discount_vnd, note: item.note,
      addons: (item.addons ?? []).map(addon => ({ addon_option_id: addon.addon_option_id,
        quantity: addon.quantity, unit_price_vnd: addon.unit_price_vnd })) })) };
}

function voucherBusiness(voucher) {
  return Object.fromEntries(Object.entries(voucher).filter(([key]) =>
    !["status", "used_channel", "redeemed_at", "redeemed_by"].includes(key)));
}

function voucherLinks(order) {
  return { freeship: order.freeship_voucher_id ?? null,
    discounts: order.discountVouchers ?? [], bundles: order.bundleApplications ?? [],
    items: order.items.map(item => ({ product: item.product_voucher_id ?? null,
      item: item.item_voucher_id ?? null, addons: item.addonVouchers ?? [] })) };
}

/** Run the final online FREESHIP lifecycle against existing staging assets. */
export async function runFinalFreeshipLifecycle(ctx) {
  for (const [name, role] of ACTORS) {
    const state = ctx.actorStates?.[name];
    if (!state?.user?.id || state.user.role !== role || !ctx.credentials?.[name]?.phone || !ctx.credentials[name].password) {
      return { status: "PARTIAL", code: "FINAL_FREESHIP_ACTOR_UNAVAILABLE", cases: [] };
    }
  }
  if (new Set(ACTORS.map(([name]) => ctx.actorStates[name].user.id)).size !== 3) {
    return { status: "PARTIAL", code: "FINAL_FREESHIP_ACTORS_NOT_DISTINCT", cases: [] };
  }
  if (typeof ctx.pacer?.reserve !== "function") return { status: "PARTIAL", code: "FINAL_FREESHIP_PACER_MISSING", cases: [] };
  const customer = ctx.actorStates.customerB;
  if ((customer.orders ?? []).length) return { status: "PARTIAL", code: "FINAL_FREESHIP_PREEXISTING_ORDER", cases: [] };
  const now = ctx.now?.() ?? Date.now();
  const address = (customer.addresses ?? []).filter(validAddress)
    .sort((a, b) => a.distance_km - b.distance_km || String(a.id).localeCompare(String(b.id)))[0];
  if (!address) return { status: "PARTIAL", code: "FINAL_FREESHIP_ADDRESS_MISSING", cases: [] };
  const voucher = (customer.vouchers ?? []).filter(item => usable(item, now))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))[0];
  if (!voucher) return { status: "PARTIAL", code: "FINAL_FREESHIP_ACTIVE_VOUCHER_MISSING", cases: [] };
  let selected;
  try { selected = buildCase(ctx.catalog, ctx.runId, address, voucher); }
  catch (error) {
    if (error.status === "PARTIAL") return { status: "PARTIAL", code: error.code, cases: [] };
    throw error;
  }

  const { db, journal, runState } = ctx;
  const customerId = customer.user.id;
  const lifecycle = ctx.actorLifecycle ?? { login: loginActor, logout: logoutActor };
  const baselines = {};
  const actors = {};
  let orderId;
  let markerOwned = false;
  let completed = false;
  let expectedFinal;
  let failure;
  let recoveryRequired = false;
  let recoveryCode;
  let cancelled = false;
  let frozenLinks;
  let frozen;
  const verifyCancelled = async () => {
    const state = await db.actorState(customerId);
    for (const field of ["user", "vouchers", "ledger", "grants"]) invariant(fingerprint(state[field])
      === fingerprint(baselines.customerB[field]), "FINAL_FREESHIP_CANCELLED_ASSETS_NOT_RESTORED");
    invariant((await db.activeUses([selected.voucher.id])).length === 0,
      "FINAL_FREESHIP_CANCELLED_RESERVATION_REMAINED");
  };
  try {
    for (const [name] of ACTORS) baselines[name] = structuredClone(await db.actorState(ctx.actorStates[name].user.id));
    await ctx.pacer.reserve(customerId, 1, 300_000);
    const refreshedActor = await db.actor(ctx.credentials.customerB.phone);
    const refreshedAddress = refreshedActor?.addresses?.find(item => item.id === selected.address.id);
    prerequisite(refreshedActor?.id === customerId && refreshedAddress && validAddress(refreshedAddress),
      "FINAL_FREESHIP_ADDRESS_CHANGED_AFTER_PACING");
    invariant(fingerprint(refreshedAddress) === fingerprint(selected.address), "FINAL_FREESHIP_ADDRESS_CHANGED_AFTER_PACING");
    const [refreshedVoucher] = await db.vouchers([selected.voucher.id]);
    prerequisite(refreshedVoucher && usable(refreshedVoucher, ctx.now?.() ?? Date.now()),
      "FINAL_FREESHIP_VOUCHER_CHANGED_AFTER_PACING");
    invariant(fingerprint(refreshedVoucher) === fingerprint(selected.voucher), "FINAL_FREESHIP_VOUCHER_CHANGED_AFTER_PACING");
    invariant((await db.catalog()).fingerprint === ctx.catalog.fingerprint, "CATALOG_CHANGED");
    for (const [name] of ACTORS) {
      actors[name] = await lifecycle.login({ origin: ctx.origin, name, credential: ctx.credentials[name],
        expectedUserId: ctx.actorStates[name].user.id, runDir: ctx.runDir, fetchImpl: ctx.fetchImpl,
        journal, db, baselineSessionIds: baselines[name].sessions.map(session => session.id) });
      if (actors[name].sessionId) runState?.addSession(name, actors[name].sessionId);
    }
    const created = await createVerifiedPickup({ actor: actors.customerB, actorName: "customerB", userId: customerId,
      db, journal, pickupCase: selected, voucher: selected.voucher,
      runState: { addMarker(marker) { markerOwned = true; runState?.addMarker(marker); runState?.addVoucher(selected.voucher.id); } },
      onOrderIdentified(id) { orderId = id; } });
    orderId = created.orderId;
    const initial = await db.order(orderId);
    const remaining = [...initial.items];
    for (const input of selected.payload.items) {
      const quote = quoteLine(ctx.catalog, input);
      const index = remaining.findIndex(item => item.menu_item_id === input.menu_item_id
        && (item.size ?? null) === (input.size ?? null) && item.quantity === input.quantity);
      const line = remaining.splice(index, 1)[0];
      invariant(index >= 0 && line.unit_price_vnd === quote.drink && line.addons_price_vnd === quote.addons
        && (line.selected_powder_id ?? null) === quote.powderId
        && (line.selected_milk_type_id ?? null) === quote.liquidId
        && (line.base_liquid_ml ?? null) === quote.baseLiquidMl
        && line.product_voucher_discount_vnd === 0 && line.total_discount_vnd === 0
        && line.sweetness === input.sweetness && line.ice_option === input.ice_option
        && line.coldwhisk === input.coldwhisk && !(line.addons ?? []).length,
      "FINAL_FREESHIP_INITIAL_LINE_INVALID");
    }
    invariant(remaining.length === 0 && initial.address_id === selected.address.id
      && initial.delivery_distance_km === selected.address.distance_km
      && initial.freeship_voucher_id === selected.voucher.id
      && !(initial.discountVouchers ?? []).length && !(initial.bundleApplications ?? []).length
      && initial.items.every(item => !item.product_voucher_id && !item.item_voucher_id && !(item.addonVouchers ?? []).length),
    "FINAL_FREESHIP_INITIAL_LINK_INVALID");
    frozen = fingerprint(snapshot(initial));
    frozenLinks = fingerprint(voucherLinks(initial));
    let confirmWindow;
    let paymentSnapshot;
    let redemptionSnapshot;
    const clock = () => ctx.now?.() ?? Date.now();
    const inWindow = value => {
      const timestamp = typeof value === "string" ? Date.parse(value) : Number.NaN;
      return confirmWindow && Number.isFinite(timestamp)
        && timestamp >= confirmWindow.startedAt - 5_000 && timestamp <= confirmWindow.finishedAt + 5_000;
    };
    const verifyAssets = async complete => {
      const state = await db.actorState(customerId);
      const baseline = baselines.customerB;
      for (const old of baseline.ledger) invariant(fingerprint(state.ledger.find(log => log.id === old.id))
        === fingerprint(old), "FINAL_FREESHIP_OLD_LEDGER_CHANGED");
      const fresh = state.ledger.filter(log => !baseline.ledger.some(old => old.id === log.id));
      const points = complete ? selected.expected.orderPoints : 0;
      invariant(points ? fresh.length === 1 && fresh[0].reason === "order_complete"
        && Number(fresh[0].delta) === points && fresh[0].order_id === orderId
        && fresh[0].user_id === customerId && fresh[0].performed_by === ctx.actorStates.staff.user.id
        && fresh[0].voucher_id == null && fresh[0].reversed_log_id == null : fresh.length === 0,
      "FINAL_FREESHIP_LEDGER_INVALID");
      invariant(!fresh.some(log => log.reason === "voucher_surplus")
        && fingerprint(state.user) === fingerprint({ ...baseline.user,
          points_balance: baseline.user.points_balance + points }), "FINAL_FREESHIP_POINTS_INVALID");
      invariant(fingerprint(state.grants) === fingerprint(baseline.grants)
        && state.vouchers.length === baseline.vouchers.length, "FINAL_FREESHIP_UNEXPECTED_ASSET");
      for (const old of baseline.vouchers) {
        const current = state.vouchers.find(item => item.id === old.id);
        invariant(current && (old.id === selected.voucher.id
          ? fingerprint(voucherBusiness(current)) === fingerprint(voucherBusiness(old))
          : fingerprint(current) === fingerprint(old)), "FINAL_FREESHIP_BASELINE_CHANGED");
      }
    };
    const verify = async (status, voucherStatus, complete = false) => {
      const stored = await db.order(orderId);
      const response = await actors.customerB.api.request(`/api/orders/${orderId}`);
      invariant(stored?.status === status && response.status === 200 && response.body?.data?.status === status,
        "FINAL_FREESHIP_STATUS_INVALID");
      invariant(stored.user_id === customerId && stored.note === selected.marker
        && fingerprint(voucherLinks(stored)) === frozenLinks
        && fingerprint(snapshot(stored)) === frozen && fingerprint(snapshot(response.body.data)) === frozen,
      "FINAL_FREESHIP_SNAPSHOT_CHANGED");
      const [currentVoucher] = await db.vouchers([selected.voucher.id]);
      invariant(currentVoucher?.status === voucherStatus, "FINAL_FREESHIP_VOUCHER_STATUS_INVALID");
      if (voucherStatus === "RESERVED") {
        invariant(currentVoucher.used_channel == null && currentVoucher.redeemed_at == null
          && currentVoucher.redeemed_by == null, "FINAL_FREESHIP_RESERVED_METADATA_INVALID");
        const uses = await db.activeUses([selected.voucher.id]);
        invariant(uses.length === 1 && uses[0].id === orderId, "FINAL_FREESHIP_RESERVATION_INVALID");
      } else {
        invariant(currentVoucher.used_channel === "ONLINE"
          && currentVoucher.redeemed_by === ctx.actorStates.admin.user.id
          && inWindow(currentVoucher.redeemed_at), "FINAL_FREESHIP_REDEMPTION_METADATA_INVALID");
        if (redemptionSnapshot) invariant(fingerprint(currentVoucher) === redemptionSnapshot,
          "FINAL_FREESHIP_REDEMPTION_CHANGED");
        else redemptionSnapshot = fingerprint(currentVoucher);
      }
      if (status === "PENDING") invariant(stored.payment_confirmed_by == null
        && stored.payment_confirmed_at == null, "FINAL_FREESHIP_PENDING_PAYMENT_INVALID");
      else {
        invariant(stored.payment_confirmed_by === ctx.actorStates.admin.user.id
          && inWindow(stored.payment_confirmed_at), "FINAL_FREESHIP_PAYMENT_METADATA_INVALID");
        const metadata = fingerprint({ by: stored.payment_confirmed_by, at: stored.payment_confirmed_at,
          method: stored.payment_method });
        if (paymentSnapshot) invariant(metadata === paymentSnapshot, "FINAL_FREESHIP_PAYMENT_CHANGED");
        else paymentSnapshot = metadata;
      }
      if (["STAFF_DONE", "COMPLETED"].includes(status)) invariant(stored.handled_by === ctx.actorStates.staff.user.id,
        "FINAL_FREESHIP_HANDLER_INVALID");
      if (complete) invariant(stored.points_earned === selected.expected.orderPoints
        && (await db.activeUses([selected.voucher.id])).length === 0, "FINAL_FREESHIP_COMPLETION_INVALID");
      await verifyAssets(complete);
    };
    const transition = async (name, path, target) => {
      const before = await db.order(orderId);
      const response = await mutateOnce({ journal, type: path.endsWith("confirm-payment") ? "confirm" : "status",
        recovery: { actor: name, userId: customerId, marker: selected.marker, orderId,
          sourceStatuses: [before.status], targetStatus: target },
        send: async () => {
          const confirming = path.endsWith("confirm-payment");
          if (confirming) confirmWindow = { startedAt: clock(), finishedAt: Number.NaN };
          try { return await actors[name].api.request(path, { method: "PATCH", body: { status: target }, mutation: true, timeoutMs: 30_000 }); }
          finally { if (confirming) confirmWindow.finishedAt = clock(); }
        }, reconcile: async failed => {
          const current = await db.order(orderId);
          if (current?.status === target && current.user_id === customerId && current.note === selected.marker) return "APPLIED";
          return failed && fingerprint(current) === fingerprint(before) ? "NOT_APPLIED" : "AMBIGUOUS";
        } });
      invariant(response.ok && (response.recovered || response.body?.data?.status === target),
        "FINAL_FREESHIP_TRANSITION_REJECTED");
    };
    await verify("PENDING", "RESERVED");
    await transition("admin", `/api/admin/orders/${orderId}/confirm-payment`, "ADMIN_CONFIRMED");
    await verify("ADMIN_CONFIRMED", "REDEEMED");
    await transition("staff", `/api/staff/orders/${orderId}`, "STAFF_DONE");
    await verify("STAFF_DONE", "REDEEMED");
    await transition("staff", `/api/staff/orders/${orderId}`, "COMPLETED");
    completed = true;
    await verify("COMPLETED", "REDEEMED", true);
    const beforeReplayOrder = await db.order(orderId);
    const beforeReplayActor = await db.actorState(customerId);
    const replay = await mutateOnce({ journal, type: "status", recovery: { actor: "staff", userId: customerId,
      marker: selected.marker, orderId, sourceStatuses: ["COMPLETED"], targetStatus: "COMPLETED", expectedRejection: true },
    send: () => actors.staff.api.request(`/api/staff/orders/${orderId}`, { method: "PATCH",
      body: { status: "COMPLETED" }, mutation: true, timeoutMs: 30_000 }),
    reconcile: async failed => failed && fingerprint(await db.order(orderId)) === fingerprint(beforeReplayOrder)
      ? "NOT_APPLIED" : "AMBIGUOUS" });
    invariant(replay.status === 400 && replay.body?.code === "INVALID_TRANSITION",
      "FINAL_FREESHIP_REPLAY_CONTRACT_INVALID");
    invariant(fingerprint(await db.order(orderId)) === fingerprint(beforeReplayOrder)
      && fingerprint(await db.actorState(customerId)) === fingerprint(beforeReplayActor),
    "FINAL_FREESHIP_REPLAY_CHANGED_STATE");
    expectedFinal = structuredClone(beforeReplayActor);
  } catch (error) { failure = error; }
  if (failure && isAmbiguous(failure)) throw failure;
  try {
    if (markerOwned && actors.admin) {
      const matches = await db.ordersByMarkers([selected.marker]);
      invariant(matches.length <= 1, "FINAL_FREESHIP_CLEANUP_MARKER_COLLISION");
      const current = matches[0];
      if (current) invariant(current.user_id === customerId && current.note === selected.marker,
        "FINAL_FREESHIP_CLEANUP_SCOPE_INVALID");
      if (current && !["CANCELLED", "COMPLETED"].includes(current.status)) {
        const response = await mutateOnce({ journal, type: "cancel", recovery: { actor: "admin", userId: customerId,
          marker: selected.marker, orderId: current.id, sourceStatuses: [current.status], targetStatus: "CANCELLED" },
        send: () => actors.admin.api.request(`/api/staff/orders/${current.id}`, { method: "PATCH", body: { status: "CANCELLED" }, mutation: true }),
        reconcile: async failed => {
          const order = await db.order(current.id);
          if (order?.status === "CANCELLED") return "APPLIED";
          return failed && order?.status === current.status ? "NOT_APPLIED" : "AMBIGUOUS";
        } });
        invariant(response.ok && (await db.order(current.id))?.status === "CANCELLED", "FINAL_FREESHIP_CLEANUP_FAILED");
      }
      cancelled = current && (await db.order(current.id))?.status === "CANCELLED";
      if (cancelled) await verifyCancelled();
      else if (current && failure && !expectedFinal) { recoveryRequired = true; recoveryCode = "FINAL_FREESHIP_ASSETS_UNVERIFIED"; }
    }
    for (const name of Object.keys(actors).reverse()) await lifecycle.logout(actors[name], db, ctx.runDir, journal);
    if (orderId) {
      const retained = await db.ordersByMarkers([selected.marker]);
      invariant(retained.length === 1 && retained[0].id === orderId && retained[0].user_id === customerId
        && retained[0].note === selected.marker && ["CANCELLED", "COMPLETED"].includes(retained[0].status),
      "FINAL_FREESHIP_TERMINAL_AUDIT_MISSING");
      if (completed) invariant(retained[0].status === "COMPLETED", "FINAL_FREESHIP_COMPLETED_AUDIT_CHANGED");
      if (completed) {
        const finalOrder = await db.order(orderId);
        invariant(fingerprint(voucherLinks(finalOrder)) === frozenLinks
          && fingerprint(snapshot(finalOrder)) === frozen, "FINAL_FREESHIP_SNAPSHOT_CHANGED");
      }
    }
    for (const [name] of ACTORS) {
      const final = await db.actorState(ctx.actorStates[name].user.id);
      invariant(fingerprint(final.sessions) === fingerprint(baselines[name].sessions), "FINAL_FREESHIP_SESSIONS_CHANGED");
      if (name !== "customerB") invariant(fingerprint(final) === fingerprint(baselines[name]), "FINAL_FREESHIP_OTHER_ACTOR_CHANGED");
      else if (expectedFinal) for (const field of ["user", "vouchers", "ledger", "grants"]) {
        invariant(fingerprint(final[field]) === fingerprint(expectedFinal[field]), "FINAL_FREESHIP_FINAL_ASSETS_CHANGED");
      }
      else if (cancelled) await verifyCancelled();
      else if (!orderId) invariant(fingerprint(final) === fingerprint(baselines[name]),
        "FINAL_FREESHIP_PREDISPATCH_ASSETS_CHANGED");
    }
    invariant((await db.catalog()).fingerprint === ctx.catalog.fingerprint, "CATALOG_CHANGED");
  } catch (error) {
    if (isAmbiguous(error)) throw error;
    failure ??= error; recoveryRequired = true; recoveryCode = error.code ?? "FINAL_FREESHIP_RECOVERY_FAILED";
  }
  if (failure) return { status: failure.status === "PARTIAL" && !orderId && !recoveryRequired ? "PARTIAL" : "FAIL",
    code: failure.code ?? "FINAL_FREESHIP_FAILED", cases: [], recoveryRequired,
    ...(recoveryCode ? { recoveryCode } : {}) };
  return { status: "PASS", cases: [{ id: "freeship-final-redemption", status: "PASS" }],
    summary: { ordersCompleted: 1, shippingFeeVnd: selected.expected.shipping_fee_vnd,
      freeshipDiscountVnd: selected.expected.freeship_discount_vnd, pointsAwarded: selected.expected.orderPoints } };
}
