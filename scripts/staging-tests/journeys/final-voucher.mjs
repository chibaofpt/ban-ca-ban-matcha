import { loginActor, logoutActor } from "../actors.mjs";
import { fingerprint } from "../database.mjs";
import { invariant, prerequisite } from "../errors.mjs";
import { mutateOnce } from "../operations.mjs";
import { quoteLine, quoteOrder } from "../oracle.mjs";
import { buildPickupCase } from "./common.mjs";
import { createVerifiedPickup } from "./order.mjs";

const ACTOR_ROLES = [["customerB", "CUSTOMER"], ["staff", "STAFF"], ["admin", "ADMIN"]];
const TOTAL_FIELDS = ["subtotal_vnd", "total_voucher_discount_vnd", "total_vnd",
  "shipping_fee_vnd", "freeship_discount_vnd", "grand_total_vnd"];
const MAX_ORDER_QUANTITY = 20;
const MAX_LINE_QUANTITY = 10;
// Allow at most five seconds of staging-server/local-clock skew around dispatch/receipt.
const CONFIRM_CLOCK_TOLERANCE_MS = 5_000;
const isAmbiguous = error => /AMBIGUOUS/.test(error?.code ?? "");

function usable(voucher, now) {
  const horizon = now + 240_000;
  return voucher.status === "ACTIVE" && voucher.qr_token
    && (!voucher.expires_at || new Date(voucher.expires_at).getTime() > horizon)
    && (!voucher.package?.ends_at || new Date(voucher.package.ends_at).getTime() > horizon);
}

function productLines(catalog, voucher) {
  const item = catalog.items.find(candidate => candidate.id === voucher.menu_item_id && candidate.is_available);
  if (!item) return [];
  if (!["latte", "fusion"].includes(item.category)) return [];
  return (item.sizes ?? []).filter(size => size.base_price_vnd != null).map(size => ({
    menu_item_id: item.id, size: size.size, quantity: 1, addon_option_ids: [],
  }));
}

function productSelection(catalog, runId, product, lineInput) {
  const base = buildPickupCase({ catalog, runId, caseId: "final-voucher", voucher: product, lineInput });
  return { product, line: structuredClone(base.payload.items[0]), marker: base.marker };
}

function requestOrderDiscount(discounts, merchandise) {
  let remaining = merchandise;
  let benefit = 0;
  for (const discount of discounts) {
    const value = discount.discount_type === "FIXED" ? Math.min(remaining, discount.discount_value)
      : Math.min(remaining, Math.floor(remaining * discount.discount_value / 100 / 1_000) * 1_000);
    remaining -= value; benefit += value;
  }
  return benefit;
}

function canonicalDiscountBenefits(discounts, merchandise) {
  const fixed = discounts.filter(discount => discount.discount_type === "FIXED");
  const percent = discounts.filter(discount => discount.discount_type === "PERCENT");
  let remaining = merchandise;
  const benefits = [];
  for (const discount of [...fixed, ...percent]) {
    const value = discount.discount_type === "FIXED" ? Math.min(remaining, discount.discount_value)
      : Math.min(remaining, Math.floor(remaining * discount.discount_value / 100 / 1_000) * 1_000);
    benefits.push({ id: discount.id, value }); remaining -= value;
  }
  return benefits;
}

function withQuantity(selections, catalog, discounts, quantity) {
  const first = structuredClone(selections[0].line);
  const lineInput = { menu_item_id: first.menu_item_id, size: first.size, quantity: 1,
    addon_option_ids: first.addon_option_ids ?? [], selected_powder_id: first.selected_powder_id,
    selected_base_liquid_id: first.selected_base_liquid_id };
  const quote = quoteLine(catalog, lineInput);
  const items = selections.map(selection => ({ ...structuredClone(selection.line), quantity: 1 }));
  for (let remaining = quantity - selections.length; remaining > 0; remaining -= MAX_LINE_QUANTITY) {
    const lineQuantity = Math.min(remaining, MAX_LINE_QUANTITY);
    const plain = structuredClone(first);
    delete plain.product_voucher_id;
    delete plain.item_voucher_id;
    plain.quantity = lineQuantity;
    plain.client_price_vnd = quote.drink + quote.addons;
    items.push(plain);
  }
  const payload = { order_type: "PICKUP", items, note: selections[0].marker,
    discount_voucher_ids: discounts.map(discount => discount.qr_token) };
  const products = selections.map(selection => selection.product);
  const wallet = [...products, ...discounts];
  const expected = quoteOrder(catalog, payload, wallet);
  const individualSurplusPoints = selections.reduce((sum, selection) => {
    const itemQuote = quoteLine(catalog, selection.line);
    return sum + Math.floor(Math.max(0, selection.product.covered_price_vnd - itemQuote.drink) / 10_000);
  }, 0);
  const merchandiseBeforeDiscount = quoteOrder(catalog, { ...payload, discount_voucher_ids: [] }, products).total_vnd;
  const discountBenefits = canonicalDiscountBenefits(discounts, merchandiseBeforeDiscount);
  return { marker: selections[0].marker, payload, expected, productVouchers: products,
    discountVouchers: discounts, productVoucher: products[0], discountVoucher: discounts[0] ?? null,
    aggregateBoundary: products.length >= 2 && expected.surplusPoints > individualSurplusPoints,
    fixedPercentBoundary: discounts.length === 2,
    discountBenefits,
    requestOrderDiscountVnd: requestOrderDiscount(discounts, merchandiseBeforeDiscount),
    catalogFingerprint: catalog.fingerprint };
}

function discountCanApply(discount, merchandise) {
  if (discount.voucher_type !== "DISCOUNT") return false;
  if (merchandise < Math.max(0, discount.min_order_vnd ?? 0)) return false;
  if (discount.discount_type === "FIXED") return Number.isSafeInteger(discount.discount_value) && discount.discount_value > 0;
  return discount.discount_type === "PERCENT" && Number.isFinite(discount.discount_value)
    && discount.discount_value > 0 && discount.discount_value < 100;
}

/** Select one real PRODUCT redemption case and add one stackable DISCOUNT when current data supports it. */
export function selectFinalVoucherCase({ catalog, runId, wallet, now = Date.now() }) {
  const products = wallet.filter(voucher => voucher.voucher_type === "PRODUCT" && usable(voucher, now));
  prerequisite(products.length > 0, "FINAL_ACTIVE_PRODUCT_MISSING");
  const discounts = wallet.filter(voucher => voucher.voucher_type === "DISCOUNT" && usable(voucher, now)
    && (voucher.discount_type === "FIXED" ? Number.isSafeInteger(voucher.discount_value) && voucher.discount_value > 0
      : voucher.discount_type === "PERCENT" && Number.isFinite(voucher.discount_value)
        && voucher.discount_value > 0 && voucher.discount_value < 100));
  const fixed = discounts.filter(voucher => voucher.discount_type === "FIXED");
  const percent = discounts.filter(voucher => voucher.discount_type === "PERCENT");
  const selections = [];
  for (const product of products) {
    for (const lineInput of productLines(catalog, product)) {
      try { selections.push(productSelection(catalog, runId, product, lineInput)); }
      catch (error) { if (error.status !== "PARTIAL") throw error; }
    }
  }
  const candidates = [];
  const productSets = selections.map(selection => [selection]);
  for (let left = 0; left < selections.length; left += 1) {
    for (let right = left + 1; right < selections.length; right += 1) {
      if (selections[left].product.id === selections[right].product.id
        || selections[left].product.qr_token === selections[right].product.qr_token) continue;
      const pair = [selections[left], selections[right]];
      const preview = withQuantity(pair, catalog, [], 2);
      if (preview.aggregateBoundary) productSets.push(pair);
    }
  }
  for (const selectedProducts of productSets) {
    const discountSets = [[], ...discounts.map(discount => [discount])];
    for (const fixedVoucher of fixed) for (const percentVoucher of percent) {
      if (fixedVoucher.id !== percentVoucher.id && fixedVoucher.qr_token !== percentVoucher.qr_token) {
        discountSets.push([percentVoucher, fixedVoucher]);
      }
    }
    for (const selectedDiscounts of discountSets) {
      for (let quantity = selectedProducts.length; quantity <= MAX_ORDER_QUANTITY; quantity += 1) {
        const candidate = withQuantity(selectedProducts, catalog, selectedDiscounts, quantity);
        if (candidate.payload.items.length > 20) continue;
        if (candidate.expected.orderPoints <= 0) continue;
        const merchandise = quoteOrder(catalog, { ...candidate.payload, discount_voucher_ids: [] }, candidate.productVouchers).total_vnd;
        if (!selectedDiscounts.every(discount => discountCanApply(discount, merchandise))) continue;
        if (selectedDiscounts.length && (candidate.expected.total_voucher_discount_vnd <= 0
          || candidate.discountBenefits.some(benefit => benefit.value <= 0))) continue;
        if (selectedDiscounts.length === 2
          && candidate.expected.total_voucher_discount_vnd === candidate.requestOrderDiscountVnd) continue;
        candidates.push(candidate);
      }
    }
  }
  prerequisite(candidates.length > 0, "FINAL_PRODUCT_CONFIGURATION_MISSING");
  candidates.sort((left, right) => Number(right.aggregateBoundary) - Number(left.aggregateBoundary)
    || Number(right.fixedPercentBoundary) - Number(left.fixedPercentBoundary)
    || Number(Boolean(right.discountVouchers.length)) - Number(Boolean(left.discountVouchers.length))
    || Number(right.expected.surplusPoints > 0) - Number(left.expected.surplusPoints > 0)
    || left.payload.items.reduce((sum, item) => sum + item.quantity, 0)
      - right.payload.items.reduce((sum, item) => sum + item.quantity, 0)
    || String(left.productVoucher.id).localeCompare(String(right.productVoucher.id)));
  return candidates[0];
}

function financialSnapshot(order) {
  return { totals: Object.fromEntries(TOTAL_FIELDS.map(field => [field, order[field]])),
    items: order.items.map(item => ({ menu_item_id: item.menu_item_id, size: item.size, quantity: item.quantity,
      unit_price_vnd: item.unit_price_vnd, addons_price_vnd: item.addons_price_vnd,
      sweetness: item.sweetness, ice_option: item.ice_option, coldwhisk: item.coldwhisk,
      product_voucher_discount_vnd: item.product_voucher_discount_vnd, total_discount_vnd: item.total_discount_vnd,
      selected_powder_id: item.selected_powder_id, selected_milk_type_id: item.selected_milk_type_id,
      base_liquid_ml: item.base_liquid_ml, note: item.note,
      addons: item.addons.map(addon => ({ addon_option_id: addon.addon_option_id,
        quantity: addon.quantity, unit_price_vnd: addon.unit_price_vnd })) })) };
}

function voucherBusinessSnapshot(voucher) {
  return Object.fromEntries(Object.entries(voucher).filter(([key]) =>
    !["status", "used_channel", "redeemed_at", "redeemed_by"].includes(key)));
}

/** Redeem a final PRODUCT order through the real online lifecycle while retaining its audit rows. */
export async function runFinalVoucherLifecycle(ctx) {
  for (const [name, role] of ACTOR_ROLES) {
    const state = ctx.actorStates?.[name];
    if (!state?.user?.id || state.user.role !== role || !ctx.credentials?.[name]?.phone || !ctx.credentials[name].password) {
      return { status: "PARTIAL", code: "FINAL_VOUCHER_ACTOR_UNAVAILABLE", cases: [] };
    }
  }
  const { db, catalog, runId, runDir, journal, runState } = ctx;
  const customerId = ctx.actorStates.customerB.user.id;
  const lifecycle = ctx.actorLifecycle ?? { login: loginActor, logout: logoutActor };
  const baselines = {};
  const actors = {};
  const cases = [];
  let selected;
  let orderId;
  let markerOwned = false;
  let completed = false;
  let failure;
  let expectedFinal;
  let recoveryRequired = false;
  let recoveryCode;
  let cancelled = false;
  const verifyCancelledAssets = async () => {
    const final = await db.actorState(customerId);
    for (const field of ["user", "vouchers", "grants", "ledger"]) invariant(fingerprint(final[field])
      === fingerprint(baselines.customerB[field]), "FINAL_VOUCHER_CANCELLED_ASSETS_NOT_RESTORED");
    const voucherIds = [...selected.productVouchers, ...selected.discountVouchers].map(voucher => voucher.id);
    invariant((await db.activeUses(voucherIds)).length === 0, "FINAL_VOUCHER_CANCELLED_RESERVATION_REMAINED");
  };
  try {
    prerequisite(new Set(ACTOR_ROLES.map(([name]) => ctx.actorStates[name].user.id)).size === 3,
      "FINAL_VOUCHER_ACTORS_NOT_DISTINCT");
    prerequisite(typeof ctx.pacer?.reserve === "function", "FINAL_VOUCHER_PACER_MISSING");
    for (const [name] of ACTOR_ROLES) {
      prerequisite(!(ctx.actorStates[name].orders ?? []).length, "FINAL_VOUCHER_PREEXISTING_ORDER");
      baselines[name] = structuredClone(await db.actorState(ctx.actorStates[name].user.id));
    }
    selected = selectFinalVoucherCase({ catalog, runId, wallet: baselines.customerB.vouchers, now: ctx.now?.() ?? Date.now() });
    await ctx.pacer.reserve(customerId, 1, 300_000);
    const vouchers = [...selected.productVouchers, ...selected.discountVouchers];
    const currentVouchers = await db.vouchers(vouchers.map(voucher => voucher.id));
    prerequisite(currentVouchers.length === vouchers.length && currentVouchers.every(voucher => usable(voucher, ctx.now?.() ?? Date.now())),
      "FINAL_VOUCHER_EXPIRES_AFTER_PACING");
    invariant(fingerprint(currentVouchers) === fingerprint(vouchers), "FINAL_VOUCHER_CHANGED_AFTER_PACING");
    invariant((await db.catalog()).fingerprint === catalog.fingerprint, "CATALOG_CHANGED");
    for (const [name] of ACTOR_ROLES) {
      actors[name] = await lifecycle.login({ origin: ctx.origin, name, credential: ctx.credentials[name],
        expectedUserId: ctx.actorStates[name].user.id, runDir, fetchImpl: ctx.fetchImpl, journal, db,
        baselineSessionIds: baselines[name].sessions.map(session => session.id) });
      if (actors[name].sessionId) runState?.addSession(name, actors[name].sessionId);
    }
    const created = await createVerifiedPickup({ actor: actors.customerB, actorName: "customerB", userId: customerId,
      db, journal, pickupCase: selected, voucher: selected.productVoucher,
      runState: { addMarker(marker) {
        markerOwned = true; runState?.addMarker(marker);
        for (const voucher of vouchers) runState?.addVoucher(voucher.id);
      } },
      onOrderIdentified(id) { orderId = id; } });
    orderId = created.orderId;
    const initialOrder = await db.order(orderId);
    const remainingLines = [...initialOrder.items];
    let observedSurplusVnd = 0;
    let individuallyRoundedSurplus = 0;
    let observedItemDiscountVnd = 0;
    for (const input of selected.payload.items) {
      const quote = quoteLine(catalog, input);
      const expectedProduct = selected.productVouchers.find(voucher => voucher.qr_token === input.product_voucher_id);
      const expectedVoucherId = expectedProduct?.id ?? null;
      const index = remainingLines.findIndex(line => line.menu_item_id === input.menu_item_id
        && line.size === input.size && line.quantity === input.quantity
        && (line.product_voucher_id ?? null) === expectedVoucherId);
      const line = remainingLines.splice(index, 1)[0];
      const productDiscount = expectedProduct ? Math.min(quote.drink, expectedProduct.covered_price_vnd) : 0;
      const productSurplus = expectedProduct ? Math.max(0, expectedProduct.covered_price_vnd - quote.drink) : 0;
      invariant(index >= 0 && line.unit_price_vnd === quote.drink && line.addons_price_vnd === quote.addons
        && line.sweetness === input.sweetness && line.ice_option === input.ice_option && line.coldwhisk === input.coldwhisk
        && line.product_voucher_discount_vnd === productDiscount && line.total_discount_vnd === productDiscount
        && (line.selected_powder_id ?? null) === quote.powderId
        && (line.selected_milk_type_id ?? null) === quote.liquidId
        && (line.base_liquid_ml ?? null) === quote.baseLiquidMl && line.addons.length === 0,
      "FINAL_VOUCHER_INITIAL_LINE_INVALID");
      observedItemDiscountVnd += productDiscount;
      observedSurplusVnd += productSurplus;
      individuallyRoundedSurplus += Math.floor(productSurplus / 10_000);
    }
    invariant(remainingLines.length === 0 && observedItemDiscountVnd === selected.expected.item_discount_vnd
      && Math.floor(observedSurplusVnd / 10_000) === selected.expected.surplusPoints,
    "FINAL_VOUCHER_INITIAL_AGGREGATE_INVALID");
    if (selected.aggregateBoundary) invariant(selected.productVouchers.length >= 2
      && new Set(selected.productVouchers.map(voucher => voucher.id)).size === selected.productVouchers.length
      && selected.expected.surplusPoints > individuallyRoundedSurplus, "FINAL_MULTI_PRODUCT_BOUNDARY_INVALID");
    const snapshot = fingerprint(financialSnapshot(initialOrder));
    const voucherLinks = order => ({ discount: order.discountVouchers,
      items: order.items.map(line => ({ menu_item_id: line.menu_item_id, size: line.size, quantity: line.quantity,
        product_voucher_id: line.product_voucher_id, item_voucher_id: line.item_voucher_id,
        addonVouchers: line.addonVouchers })), freeship: order.freeship_voucher_id,
      bundles: order.bundleApplications });
    const linkedSnapshot = fingerprint(voucherLinks(initialOrder));
    let redemptionSnapshot;
    let paymentSnapshot;
    let confirmWindow;
    const clock = () => ctx.now?.() ?? Date.now();
    const confirmedInWindow = value => {
      const timestamp = typeof value === "string" ? Date.parse(value) : Number.NaN;
      return confirmWindow && Number.isFinite(timestamp)
        && timestamp >= confirmWindow.startedAt - CONFIRM_CLOCK_TOLERANCE_MS
        && timestamp <= confirmWindow.finishedAt + CONFIRM_CLOCK_TOLERANCE_MS;
    };

    const verifyLedger = async complete => {
      const state = await db.actorState(customerId);
      const baseline = baselines.customerB;
      for (const old of baseline.ledger) invariant(fingerprint(state.ledger.find(log => log.id === old.id))
        === fingerprint(old), "FINAL_VOUCHER_OLD_LEDGER_CHANGED");
      const fresh = state.ledger.filter(log => !baseline.ledger.some(old => old.id === log.id));
      const expectedLogs = complete ? [
        ...(selected.expected.orderPoints > 0 ? [{ reason: "order_complete", delta: selected.expected.orderPoints }] : []),
        ...(selected.expected.surplusPoints > 0 ? [{ reason: "voucher_surplus", delta: selected.expected.surplusPoints }] : []),
      ] : [];
      invariant(fresh.length === expectedLogs.length && expectedLogs.every(expected => fresh.some(log =>
        log.reason === expected.reason && Number(log.delta) === expected.delta && log.order_id === orderId
        && log.user_id === customerId && log.performed_by === ctx.actorStates.staff.user.id
        && log.voucher_id == null && log.reversed_log_id == null)), "FINAL_VOUCHER_LEDGER_INVALID");
      if (complete && selected.aggregateBoundary) {
        const surplusLogs = fresh.filter(log => log.reason === "voucher_surplus");
        invariant(surplusLogs.length === 1 && Number(surplusLogs[0].delta) === selected.expected.surplusPoints
          && surplusLogs[0].voucher_id == null, "FINAL_VOUCHER_AGGREGATE_LEDGER_INVALID");
      }
      const points = complete ? selected.expected.orderPoints + selected.expected.surplusPoints : 0;
      invariant(state.user.points_balance === baseline.user.points_balance + points, "FINAL_VOUCHER_POINTS_INVALID");
      invariant(fingerprint(state.grants) === fingerprint(baseline.grants)
        && state.vouchers.length === baseline.vouchers.length, "FINAL_VOUCHER_UNEXPECTED_ASSET");
      for (const old of baseline.vouchers) {
        const current = state.vouchers.find(voucher => voucher.id === old.id);
        invariant(current && (vouchers.some(voucher => voucher.id === old.id)
          ? fingerprint(voucherBusinessSnapshot(current)) === fingerprint(voucherBusinessSnapshot(old))
          : fingerprint(current) === fingerprint(old)), "FINAL_VOUCHER_BASELINE_CHANGED");
      }
    };
    const verifyVouchers = async status => {
      const rows = await db.vouchers(vouchers.map(voucher => voucher.id));
      invariant(rows.length === vouchers.length && rows.every(voucher => voucher.status === status),
        "FINAL_VOUCHER_STATUS_INVALID");
      if (status === "REDEEMED") {
        invariant(rows.every(voucher => voucher.used_channel === "ONLINE"
          && voucher.redeemed_by === ctx.actorStates.admin.user.id
          && confirmedInWindow(voucher.redeemed_at)), "FINAL_VOUCHER_REDEMPTION_METADATA_INVALID");
        if (redemptionSnapshot) invariant(fingerprint(rows) === redemptionSnapshot, "FINAL_VOUCHER_REDEEMED_TWICE");
        else redemptionSnapshot = fingerprint(rows);
      } else {
        invariant(rows.every(voucher => voucher.used_channel == null && voucher.redeemed_by == null
          && voucher.redeemed_at == null), "FINAL_VOUCHER_RESERVED_METADATA_INVALID");
      }
      const uses = await db.activeUses(vouchers.map(voucher => voucher.id));
      invariant(status === "RESERVED" ? uses.length === 1 && uses[0].id === orderId : true,
        "FINAL_VOUCHER_RESERVATION_INVALID");
    };
    const verifyOrder = async (status, voucherStatus, complete = false) => {
      const stored = await db.order(orderId);
      const response = await actors.customerB.api.request(`/api/orders/${orderId}`);
      invariant(stored?.status === status && response.status === 200 && response.body?.data?.status === status,
        "FINAL_VOUCHER_ORDER_STATUS_INVALID");
      invariant(stored.user_id === customerId && stored.note === selected.marker
        && fingerprint(financialSnapshot(stored)) === snapshot
        && fingerprint(financialSnapshot(response.body.data)) === snapshot, "FINAL_VOUCHER_SNAPSHOT_CHANGED");
      invariant(fingerprint(voucherLinks(stored)) === linkedSnapshot, "FINAL_VOUCHER_LINKS_CHANGED");
      if (status !== "PENDING") invariant(stored.payment_confirmed_by === ctx.actorStates.admin.user.id,
        "FINAL_VOUCHER_PAYMENT_ACTOR_INVALID");
      invariant(status === "PENDING" ? stored.payment_confirmed_at == null && stored.payment_confirmed_by == null
        : confirmedInWindow(stored.payment_confirmed_at), "FINAL_VOUCHER_PAYMENT_TIMESTAMP_INVALID");
      if (status !== "PENDING") {
        const metadata = fingerprint({ at: stored.payment_confirmed_at, by: stored.payment_confirmed_by,
          method: stored.payment_method });
        if (paymentSnapshot) invariant(metadata === paymentSnapshot, "FINAL_VOUCHER_PAYMENT_METADATA_CHANGED");
        else paymentSnapshot = metadata;
      }
      if (["STAFF_DONE", "COMPLETED"].includes(status)) invariant(stored.handled_by === ctx.actorStates.staff.user.id,
        "FINAL_VOUCHER_HANDLER_INVALID");
      if (status === "COMPLETED") invariant(stored.points_earned === selected.expected.orderPoints,
        "FINAL_VOUCHER_POINTS_SNAPSHOT_INVALID");
      await verifyVouchers(voucherStatus);
      await verifyLedger(complete);
      if (complete) invariant((await db.activeUses(vouchers.map(voucher => voucher.id))).length === 0,
        "FINAL_VOUCHER_ACTIVE_RESERVATION_REMAINED");
    };
    const mutateStatus = async (name, path, target) => {
      const before = await db.order(orderId);
      const response = await mutateOnce({ journal,
        type: path.endsWith("/confirm-payment") ? "confirm" : "status",
        recovery: { actor: name, userId: customerId, marker: selected.marker, orderId,
          sourceStatuses: [before.status], targetStatus: target,
          baselineLedgerIds: baselines.customerB.ledger.map(log => log.id),
          baselinePoints: baselines.customerB.user.points_balance },
        send: async () => {
          const confirming = path.endsWith("/confirm-payment");
          if (confirming) confirmWindow = { startedAt: clock(), finishedAt: Number.NaN };
          try {
            return await actors[name].api.request(path, { method: "PATCH", body: { status: target },
              mutation: true, timeoutMs: 30_000 });
          } finally { if (confirming) confirmWindow.finishedAt = clock(); }
        },
        reconcile: async failed => {
          const current = await db.order(orderId);
          if (current?.status === target && current.user_id === customerId && current.note === selected.marker) return "APPLIED";
          if (failed && fingerprint(current) === fingerprint(before)) return "NOT_APPLIED";
          return "AMBIGUOUS";
        } });
      invariant(response.ok && (response.recovered || response.body?.data?.status === target),
        "FINAL_VOUCHER_TRANSITION_REJECTED");
    };

    const stored = await db.order(orderId);
    invariant(selected.productVouchers.every(voucher => stored.items.some(item => item.product_voucher_id === voucher.id))
      && selected.discountVouchers.every(voucher => stored.discountVouchers.some(link => link.voucher_id === voucher.id)),
    "FINAL_VOUCHER_LINK_MISSING");
    invariant(stored.items.filter(item => item.product_voucher_id).length === selected.productVouchers.length
      && stored.items.every(item => !item.item_voucher_id && !(item.addonVouchers ?? []).length)
      && stored.discountVouchers.length === selected.discountVouchers.length
      && !(stored.bundleApplications ?? []).length && !stored.freeship_voucher_id,
    "FINAL_VOUCHER_UNEXPECTED_LINK");
    await verifyOrder("PENDING", "RESERVED");
    await mutateStatus("admin", `/api/admin/orders/${orderId}/confirm-payment`, "ADMIN_CONFIRMED");
    await verifyOrder("ADMIN_CONFIRMED", "REDEEMED");
    await mutateStatus("staff", `/api/staff/orders/${orderId}`, "STAFF_DONE");
    await verifyOrder("STAFF_DONE", "REDEEMED");
    await mutateStatus("staff", `/api/staff/orders/${orderId}`, "COMPLETED");
    completed = true;
    await verifyOrder("COMPLETED", "REDEEMED", true);
    const beforeReplayOrder = await db.order(orderId);
    const beforeReplayActor = await db.actorState(customerId);
    const replay = await mutateOnce({ journal, type: "status",
      recovery: { actor: "staff", userId: customerId, marker: selected.marker, orderId,
        sourceStatuses: ["COMPLETED"], targetStatus: "COMPLETED", expectedRejection: true },
      send: () => actors.staff.api.request(`/api/staff/orders/${orderId}`, { method: "PATCH",
        body: { status: "COMPLETED" }, mutation: true, timeoutMs: 30_000 }),
      reconcile: async failed => failed && fingerprint(await db.order(orderId)) === fingerprint(beforeReplayOrder)
        ? "NOT_APPLIED" : "AMBIGUOUS" });
    invariant(replay.status === 400 && replay.body?.code === "INVALID_TRANSITION",
      "FINAL_VOUCHER_REPLAY_CONTRACT_INVALID");
    invariant(fingerprint(await db.order(orderId)) === fingerprint(beforeReplayOrder)
      && fingerprint(await db.actorState(customerId)) === fingerprint(beforeReplayActor),
    "FINAL_VOUCHER_REPLAY_CHANGED_STATE");
    const profile = await actors.customerB.api.request("/api/profile");
    const totalAwarded = selected.expected.orderPoints + selected.expected.surplusPoints;
    invariant(profile.status === 200 && profile.body?.data?.points_balance
      === baselines.customerB.user.points_balance + totalAwarded, "FINAL_VOUCHER_PUBLIC_POINTS_INVALID");
    expectedFinal = structuredClone(await db.actorState(customerId));
    cases.unshift({ id: "online-final-voucher-redemption", status: "PASS" });
    cases.push(selected.discountVouchers.length
      ? { id: "voucher-stacking-after-product", status: "PASS" }
      : { id: "voucher-stacking-after-product", status: "PARTIAL", code: "FINAL_DISCOUNT_STACK_DATA_MISSING" });
    cases.push(selected.fixedPercentBoundary
      ? { id: "voucher-stacking-fixed-percent", status: "PASS" }
      : { id: "voucher-stacking-fixed-percent", status: "PARTIAL", code: "FINAL_FIXED_PERCENT_STACK_DATA_MISSING" });
    cases.push(selected.expected.surplusPoints > 0
      ? { id: "product-surplus-award", status: "PASS" }
      : { id: "product-surplus-award", status: "PARTIAL", code: "FINAL_PRODUCT_SURPLUS_DATA_MISSING" });
    cases.push(selected.aggregateBoundary
      ? { id: "product-surplus-aggregation", status: "PASS" }
      : { id: "product-surplus-aggregation", status: "PARTIAL", code: "FINAL_MULTI_PRODUCT_BOUNDARY_MISSING" });
  } catch (error) { failure = error; }
  if (failure && isAmbiguous(failure)) throw failure;
  try {
    if (markerOwned && actors.admin) {
      const matches = await db.ordersByMarkers([selected.marker]);
      invariant(matches.length <= 1, "FINAL_VOUCHER_CLEANUP_MARKER_COLLISION");
      const current = matches[0];
      if (current) {
        invariant(current.user_id === customerId && current.note === selected.marker,
          "FINAL_VOUCHER_CLEANUP_SCOPE_INVALID");
        orderId ??= current.id;
      }
      if (current && !["CANCELLED", "COMPLETED"].includes(current.status)) {
        invariant(current.user_id === customerId && current.note === selected.marker,
          "FINAL_VOUCHER_CLEANUP_SCOPE_INVALID");
        const response = await mutateOnce({ journal, type: "cancel",
          recovery: { actor: "admin", userId: customerId, marker: selected.marker, orderId: current.id,
            sourceStatuses: [current.status], targetStatus: "CANCELLED" },
          send: () => actors.admin.api.request(`/api/staff/orders/${current.id}`, { method: "PATCH",
            body: { status: "CANCELLED" }, mutation: true }),
          reconcile: async failed => {
            const order = await db.order(current.id);
            if (order?.status === "CANCELLED") return "APPLIED";
            return failed && order?.status === current.status ? "NOT_APPLIED" : "AMBIGUOUS";
          } });
        invariant(response.ok && (await db.order(current.id))?.status === "CANCELLED",
          "FINAL_VOUCHER_CLEANUP_FAILED");
      }
      if (current) {
        cancelled = (await db.order(current.id))?.status === "CANCELLED";
        if (cancelled) await verifyCancelledAssets();
        else if (failure && !expectedFinal) {
          recoveryRequired = true;
          recoveryCode = "FINAL_VOUCHER_COMPLETED_ASSETS_UNVERIFIED";
        }
      }
    }
    for (const name of Object.keys(actors).reverse()) await lifecycle.logout(actors[name], db, runDir, journal);
    if (orderId) {
      const retained = await db.ordersByMarkers([selected.marker]);
      invariant(retained.length === 1 && retained[0].id === orderId && retained[0].user_id === customerId
        && retained[0].note === selected.marker && ["CANCELLED", "COMPLETED"].includes(retained[0].status),
      "FINAL_VOUCHER_TERMINAL_AUDIT_MISSING");
      if (completed) invariant(retained[0].status === "COMPLETED", "FINAL_VOUCHER_COMPLETED_AUDIT_CHANGED");
    }
    for (const [name] of ACTOR_ROLES) {
      if (!baselines[name]) continue;
      const final = await db.actorState(ctx.actorStates[name].user.id);
      invariant(fingerprint(final.sessions) === fingerprint(baselines[name].sessions), "FINAL_VOUCHER_SESSIONS_CHANGED");
      if (name !== "customerB") invariant(fingerprint(final) === fingerprint(baselines[name]),
        "FINAL_VOUCHER_OTHER_ACTOR_CHANGED");
      if (name === "customerB" && expectedFinal) {
        for (const field of ["user", "vouchers", "ledger", "grants"]) invariant(fingerprint(final[field])
          === fingerprint(expectedFinal[field]), "FINAL_VOUCHER_FINAL_ASSETS_CHANGED");
      }
      if (name === "customerB" && cancelled) await verifyCancelledAssets();
      if (name === "customerB" && !orderId && failure?.status === "PARTIAL") {
        invariant(fingerprint(final) === fingerprint(baselines[name]), "FINAL_VOUCHER_PARTIAL_ASSETS_CHANGED");
      }
    }
    invariant((await db.catalog()).fingerprint === catalog.fingerprint, "CATALOG_CHANGED");
  } catch (error) {
    if (isAmbiguous(error)) throw error;
    recoveryCode = error.code ?? "FINAL_VOUCHER_RECOVERY_FAILED";
    failure ??= error;
    recoveryRequired = true;
  }
  if (failure) return { status: failure.status === "PARTIAL" && !orderId && !recoveryRequired ? "PARTIAL" : "FAIL",
    code: failure.code ?? "FINAL_VOUCHER_FAILED", cases, recoveryRequired,
    ...(recoveryCode ? { recoveryCode } : {}) };
  const gaps = cases.filter(item => item.status === "PARTIAL");
  return { status: gaps.length ? "PARTIAL" : "PASS", cases, gaps,
    summary: { ordersCompleted: 1, pointsAwarded: selected.expected.orderPoints,
      surplusPointsAwarded: selected.expected.surplusPoints, stackedDiscount: selected.discountVouchers.length > 0 } };
}
