import { randomUUID } from "node:crypto";
import { loginActor, logoutActor } from "../actors.mjs";
import { fingerprint } from "../database.mjs";
import { invariant, prerequisite } from "../errors.mjs";
import { mutateOnce } from "../operations.mjs";
import { quoteLine } from "../oracle.mjs";
import { orderMarker } from "./common.mjs";
import { cancelVerifiedPickup } from "./order.mjs";

const lifecycle = { login: loginActor, logout: logoutActor };
const TOTAL_FIELDS = ["subtotal_vnd", "total_voucher_discount_vnd", "total_vnd",
  "shipping_fee_vnd", "freeship_discount_vnd", "grand_total_vnd"];

function assertTotals(actual, expected, code) {
  for (const field of TOTAL_FIELDS) invariant(actual?.[field] === expected[field], `${code}_${field.toUpperCase()}`);
}

function assertLines(actual, bundleCase, code) {
  invariant(Array.isArray(actual?.items) && actual.items.length === bundleCase.lines.length, code);
  const remaining = [...actual.items];
  for (const expected of bundleCase.lines) {
    const matches = remaining.filter(item => item.note === expected.note);
    invariant(matches.length === 1, code);
    const item = matches[0];
    remaining.splice(remaining.indexOf(item), 1);
    const snapshot = Object.fromEntries(Object.keys(expected).map(key => [key, item[key] ?? null]));
    invariant(fingerprint(snapshot) === fingerprint(expected) && Array.isArray(item.addons) && item.addons.length === 0
      && item.product_voucher_id == null && item.item_voucher_id == null
      && (item.addonVouchers ?? []).length === 0, code);
  }
  invariant((actual.discountVouchers ?? []).length === 0 && actual.freeship_voucher_id == null, code);
}

function nowMs(ctx) {
  const value = ctx.now?.() ?? Date.now();
  return value instanceof Date ? value.getTime() : Number(value);
}

function isUsableBundle(voucher, ctx) {
  const horizon = nowMs(ctx) + 240_000;
  return voucher?.voucher_type === "BUNDLE" && voucher.status === "ACTIVE"
    && (!voucher.expires_at || new Date(voucher.expires_at).getTime() > horizon)
    && (!voucher.package?.ends_at || new Date(voucher.package.ends_at).getTime() > horizon);
}

async function assertFreshVoucher(ctx, voucher, userId) {
  const current = (await ctx.db.vouchers([voucher.id])).find(row => row.id === voucher.id);
  prerequisite(isUsableBundle(current, ctx), "BUNDLE_VOUCHER_HORIZON_INSUFFICIENT");
  invariant(current.user_id === userId && current.qr_token === voucher.qr_token, "BUNDLE_VOUCHER_OWNERSHIP_CHANGED");
  invariant(fingerprint(current.package) === fingerprint(voucher.package), "CATALOG_CHANGED");
}

function lineFor(catalog, item, size, marker, clientLineId, quantity) {
  const input = { menu_item_id: item.id, ...(size ? { size } : {}), quantity, addon_option_ids: [] };
  const quote = quoteLine(catalog, input);
  const line = { ...input, client_line_id: clientLineId, sweetness: "FULL", ice_option: "NORMAL",
    coldwhisk: false, note: marker, client_price_vnd: quote.drink + quote.addons };
  if (quote.liquidId) line.selected_base_liquid_id = quote.liquidId;
  if (item.category === "fusion") line.selected_powder_id = quote.powderId;
  return { line, unitPrice: quote.drink + quote.addons, drinkPrice: quote.drink };
}

function selectCandidate(catalog, rule, marker, uuid) {
  prerequisite(Number.isSafeInteger(rule.buy_quantity) && rule.buy_quantity >= 1
    && Number.isSafeInteger(rule.reward_quantity) && rule.reward_quantity >= 1,
  "BUNDLE_RULE_QUANTITY_INVALID");
  prerequisite(rule.max_applications_order >= 1
    && (rule.max_reward_units_order == null || rule.max_reward_units_order >= rule.reward_quantity),
  "BUNDLE_RULE_LIMIT_INVALID");
  prerequisite(rule.buy_quantity <= 10 && rule.reward_quantity <= 10, "BUNDLE_RULE_EXCEEDS_LINE_LIMIT");
  const candidates = [];
  for (const scope of rule.productScopes?.filter(row => row.role === "QUALIFIER") ?? []) {
    const item = catalog.items.find(row => row.id === scope.menu_item_id && row.is_available);
    if (!item) continue;
    const sizes = item.category === "extras" ? [null] : (scope.sizes ?? []).map(row => row.size);
    for (const size of sizes) {
      try {
        const preview = lineFor(catalog, item, size, marker, uuid(), 1);
        if (preview.unitPrice > 0) candidates.push({ item, size, unitPrice: preview.unitPrice, drinkPrice: preview.drinkPrice });
      } catch {
        // Another live scope may still have a complete current configuration.
      }
    }
  }
  candidates.sort((left, right) => right.unitPrice - left.unitPrice
    || String(left.item.id).localeCompare(String(right.item.id)) || String(left.size).localeCompare(String(right.size)));
  prerequisite(candidates.length > 0, "BUNDLE_QUALIFIER_CONFIGURATION_MISSING");
  return candidates[0];
}

function buildCase({ catalog, voucher, runId, caseId, uuid }) {
  const marker = orderMarker(runId, caseId);
  const rule = voucher.package?.bundleRule;
  prerequisite(rule, "BUNDLE_RULE_MISSING");
  prerequisite(rule.reward_kind === "PRODUCT" && rule.reward_mode === "SAME_CONFIG",
    `BUNDLE_COVERAGE_UNSUPPORTED_${rule.reward_kind}_${rule.reward_mode}`);
  const selected = selectCandidate(catalog, rule, marker, uuid);
  const minOrder = Math.max(0, voucher.package?.min_order_vnd ?? voucher.min_order_vnd ?? 0);
  const paidBase = rule.buy_quantity * selected.unitPrice;
  const extraPaid = Math.max(0, Math.ceil((minOrder - paidBase) / selected.unitPrice));
  const totalQuantity = rule.buy_quantity + rule.reward_quantity + extraPaid;
  prerequisite(totalQuantity <= 20, "BUNDLE_MIN_ORDER_EXCEEDS_ORDER_LIMIT");
  const qualifier = lineFor(catalog, selected.item, selected.size, `${marker}:qualifier`, uuid(), rule.buy_quantity);
  const reward = lineFor(catalog, selected.item, selected.size, `${marker}:reward`, uuid(), rule.reward_quantity);
  const items = [qualifier.line, reward.line];
  for (let remaining = extraPaid, index = 1; remaining > 0; index += 1) {
    const quantity = Math.min(10, remaining);
    items.push(lineFor(catalog, selected.item, selected.size, `${marker}:paid-${index}`, uuid(), quantity).line);
    remaining -= quantity;
  }
  const benefit = Math.min(qualifier.drinkPrice, reward.drinkPrice) * rule.reward_quantity;
  prerequisite(benefit > 0, "BUNDLE_HAS_NO_BENEFIT");
  const subtotal = totalQuantity * selected.unitPrice;
  const expected = { subtotal_vnd: subtotal, total_voucher_discount_vnd: 0,
    total_vnd: subtotal - benefit, shipping_fee_vnd: 0, freeship_discount_vnd: 0,
    grand_total_vnd: subtotal - benefit, benefit };
  const lines = items.map(item => {
    const quote = quoteLine(catalog, item);
    return { menu_item_id: item.menu_item_id, size: item.size ?? null, quantity: item.quantity, note: item.note,
      unit_price_vnd: quote.drink, addons_price_vnd: quote.addons, selected_powder_id: quote.powderId ?? null,
      selected_milk_type_id: quote.liquidId ?? null, base_liquid_ml: quote.baseLiquidMl ?? null,
      sweetness: item.sweetness, ice_option: item.ice_option, coldwhisk: item.coldwhisk,
      product_voucher_discount_vnd: 0, total_discount_vnd: item.client_line_id === reward.line.client_line_id ? benefit : 0 };
  });
  return { marker, catalogFingerprint: catalog.fingerprint, expected, lines,
    buyQuantity: rule.buy_quantity, rewardQuantity: rule.reward_quantity,
    payload: { order_type: "PICKUP", items, discount_voucher_ids: [], note: marker,
      bundle_applications: [{ voucher_qr_token: voucher.qr_token,
        qualifier_allocations: [{ client_line_id: qualifier.line.client_line_id, quantity: rule.buy_quantity }],
        reward_allocations: [{ client_line_id: reward.line.client_line_id, quantity: rule.reward_quantity }] }] } };
}

/** Select one existing usable PRODUCT/SAME_CONFIG BUNDLE and its verified order case. */
export function selectBundleCase(ctx, vouchers, caseId, uuid) {
  const usable = vouchers.filter(voucher => isUsableBundle(voucher, ctx));
  prerequisite(usable.length > 0, "BUNDLE_ACTIVE_VOUCHER_MISSING");
  let lastPartial;
  for (const voucher of usable) {
    try { return { voucher, bundleCase: buildCase({ catalog: ctx.catalog, voucher, runId: ctx.runId, caseId, uuid }) }; }
    catch (error) { if (error.status !== "PARTIAL") throw error; lastPartial = error; }
  }
  throw lastPartial;
}

/** Create one BUNDLE order and verify its API, allocation, and database reservation snapshots. */
export async function createVerifiedBundle({ ctx, actor, userId, voucher, bundleCase, onOrderIdentified }) {
  await assertFreshVoucher(ctx, voucher, userId);
  const markers = [bundleCase.marker, ...bundleCase.payload.items.map(item => item.note)];
  invariant((await ctx.db.ordersByMarkers(markers)).length === 0, "BUNDLE_MARKER_COLLISION");
  ctx.runState?.addMarker(bundleCase.marker);
  ctx.runState?.addVoucher(voucher.id);
  const response = await mutateOnce({ journal: ctx.journal, type: "create", recovery: { actor: "customerB",
    marker: bundleCase.marker, userId, baselineOrderIds: [], baselineVoucherIds: [voucher.id], orderId: null,
    sourceStatuses: ["ABSENT"], targetStatus: "PENDING" },
  send: () => actor.api.request("/api/orders", { method: "POST", body: bundleCase.payload, mutation: true, timeoutMs: 30_000 }),
  reconcile: async failed => {
    const matches = await ctx.db.ordersByMarkers([bundleCase.marker]);
    if (matches.length === 1 && matches[0].user_id === userId) return { state: "APPLIED", data: { id: matches[0].id } };
    if (matches.length === 0 && failed) return "NOT_APPLIED";
    return "AMBIGUOUS";
  } });
  if (!response.ok) {
    if (response.status === 429) prerequisite(false, "BUNDLE_ORDER_RATE_LIMITED");
    if (response.status === 503 && response.body?.code === "STORE_CLOSED") prerequisite(false, "BUNDLE_STORE_CLOSED");
    if (response.status === 409 && response.body?.code === "PRICE_CHANGED") {
      invariant((await ctx.db.catalog()).fingerprint !== bundleCase.catalogFingerprint, "UNEXPECTED_PRICE_CHANGED");
      invariant(false, "CATALOG_CHANGED");
    }
    invariant(false, "BUNDLE_ORDER_CREATE_REJECTED");
  }
  invariant(response.status === 201 || response.recovered === true, "BUNDLE_ORDER_CREATE_STATUS_INVALID");
  const orderId = response.body?.data?.id;
  invariant(typeof orderId === "string" && orderId.length > 0, "BUNDLE_ORDER_ID_MISSING");
  onOrderIdentified(orderId);
  const detailResponse = await actor.api.request(`/api/orders/${orderId}`);
  const detail = detailResponse.body?.data;
  const stored = await ctx.db.order(orderId);
  invariant(detailResponse.status === 200 && detail?.id === orderId && stored?.id === orderId, "BUNDLE_ORDER_READ_FAILED");
  invariant(detail.status === "PENDING" && stored.status === "PENDING" && stored.user_id === userId
    && stored.note === bundleCase.marker, "BUNDLE_ORDER_OWNERSHIP_INVALID");
  if (response.recovered !== true) assertTotals(response.body?.data, bundleCase.expected, "BUNDLE_CREATE_TOTAL");
  assertTotals(detail, bundleCase.expected, "BUNDLE_READ_TOTAL");
  assertTotals(stored, bundleCase.expected, "BUNDLE_DATABASE_TOTAL");
  invariant(detail.order_type === "PICKUP" && stored.order_type === "PICKUP", "BUNDLE_ORDER_TYPE_INVALID");
  assertLines(detail, bundleCase, "BUNDLE_API_LINE_SNAPSHOT_INVALID");
  assertLines(stored, bundleCase, "BUNDLE_DATABASE_LINE_SNAPSHOT_INVALID");
  invariant(response.body?.data?.skipped_vouchers?.includes(voucher.qr_token) !== true, "BUNDLE_VOUCHER_SKIPPED");
  const application = stored.bundleApplications?.find(row => row.voucher_id === voucher.id);
  invariant(stored.bundleApplications?.length === 1 && application?.status === "RESERVED"
    && application.application_count === 1, "BUNDLE_APPLICATION_NOT_RESERVED");
  const qualifierItem = stored.items.find(item => item.note === `${bundleCase.marker}:qualifier`);
  const rewardItem = stored.items.find(item => item.note === `${bundleCase.marker}:reward`);
  invariant(application.qualifiers?.length === 1 && application.qualifiers[0].order_item_id === qualifierItem?.id
    && application.qualifiers[0].quantity === bundleCase.buyQuantity, "BUNDLE_QUALIFIER_PERSISTENCE_INVALID");
  invariant(application.rewards?.length === 1 && application.rewards[0].order_item_id === rewardItem?.id
    && application.rewards[0].order_item_addon_id == null && application.rewards[0].quantity === bundleCase.rewardQuantity
    && application.rewards[0].discount_vnd === bundleCase.expected.benefit, "BUNDLE_REWARD_PERSISTENCE_INVALID");
  invariant(stored.items.reduce((sum, item) => sum + (item.total_discount_vnd ?? 0), 0) === bundleCase.expected.benefit,
    "BUNDLE_LINE_DISCOUNT_INVALID");
  invariant((await ctx.db.vouchers([voucher.id]))[0]?.status === "RESERVED", "BUNDLE_VOUCHER_NOT_RESERVED");
  const uses = await ctx.db.activeUses([voucher.id]);
  invariant(uses.length === 1 && uses[0].id === orderId, "BUNDLE_RESERVATION_SCOPE_INVALID");
  return orderId;
}

/** Prove one live PRODUCT/SAME_CONFIG BUNDLE reserves, cancels, and is reusable. */
export async function runBundleJourney(ctx) {
  const state = ctx.actorStates?.customerB;
  if (!state?.user?.id || state.user.role !== "CUSTOMER" || !ctx.credentials?.customerB?.phone
    || !ctx.credentials.customerB.password) return { status: "PARTIAL", code: "BUNDLE_CUSTOMER_UNAVAILABLE", cases: [] };
  const userId = state.user.id;
  const baseline = structuredClone(await ctx.db.actorState(userId));
  const uuid = ctx.uuid ?? randomUUID;
  let selected;
  try { selected = selectBundleCase(ctx, baseline.vouchers, "bundle-first", uuid); }
  catch (error) { if (error.status === "PARTIAL") return { status: "PARTIAL", code: error.code, cases: [] }; throw error; }
  const second = buildCase({ catalog: ctx.catalog, voucher: selected.voucher, runId: ctx.runId, caseId: "bundle-reuse", uuid });
  const markers = [selected.bundleCase.marker, second.marker];
  const collisions = await ctx.db.ordersByMarkers(markers);
  if (collisions.length !== 0) return { status: "FAIL", code: "BUNDLE_MARKER_COLLISION", cases: [] };
  const actors = ctx.actorLifecycle ?? lifecycle;
  let actor;
  const known = [];
  let failure;
  let recoveryRequired = false;
  try {
    await ctx.pacer.reserve(userId, 2, 240_000);
    await assertFreshVoucher(ctx, selected.voucher, userId);
    actor = await actors.login({ origin: ctx.origin, name: "customerB", credential: ctx.credentials.customerB,
      expectedUserId: userId, runDir: ctx.runDir, fetchImpl: ctx.fetchImpl, journal: ctx.journal, db: ctx.db,
      baselineSessionIds: baseline.sessions.map(session => session.id) });
    if (actor.sessionId) ctx.runState?.addSession("customerB", actor.sessionId);
    for (const bundleCase of [selected.bundleCase, second]) {
      const orderId = await createVerifiedBundle({ ctx, actor, userId, voucher: selected.voucher, bundleCase,
        onOrderIdentified: id => known.push({ id, marker: bundleCase.marker }) });
      await cancelVerifiedPickup({ actor, actorName: "customerB", userId, db: ctx.db, journal: ctx.journal,
        marker: bundleCase.marker, orderId, voucher: selected.voucher });
      const cancelled = await ctx.db.order(orderId);
      invariant(cancelled?.bundleApplications?.length === 1
        && cancelled.bundleApplications[0].status === "CANCELLED", "BUNDLE_APPLICATION_NOT_CANCELLED");
    }
  } catch (error) { failure = error; }
  if (failure && /AMBIGUOUS/.test(failure.code ?? "")) throw failure;
  try {
    if (actor) for (const entry of known) {
      const stored = await ctx.db.order(entry.id);
      if (stored && !["CANCELLED", "COMPLETED"].includes(stored.status)) {
        invariant(stored.user_id === userId && stored.note === entry.marker, "BUNDLE_RECOVERY_SCOPE_INVALID");
        await cancelVerifiedPickup({ actor, actorName: "customerB", userId, db: ctx.db, journal: ctx.journal,
          marker: entry.marker, orderId: entry.id, voucher: selected.voucher });
      }
    }
    if (actor) await actors.logout(actor, ctx.db, ctx.runDir, ctx.journal);
    for (const entry of known) {
      const matches = await ctx.db.ordersByMarkers([entry.marker]);
      invariant(matches.length === 1 && matches[0].id === entry.id && matches[0].status === "CANCELLED"
        && matches[0].bundleApplications?.[0]?.status === "CANCELLED", "BUNDLE_TERMINAL_AUDIT_MISSING");
    }
    invariant(fingerprint(await ctx.db.actorState(userId)) === fingerprint(baseline), "BUNDLE_CUSTOMER_NOT_RESTORED");
    invariant((await ctx.db.catalog()).fingerprint === ctx.catalog.fingerprint, "CATALOG_CHANGED");
  } catch (error) {
    if (/AMBIGUOUS/.test(error.code ?? "")) throw error;
    failure = error; recoveryRequired = true;
  }
  if (failure) return { status: failure.status === "PARTIAL" ? "PARTIAL" : "FAIL",
    code: failure.code ?? "BUNDLE_JOURNEY_FAILED", cases: [], recoveryRequired };
  return { status: "PASS", cases: [{ id: "bundle-product-same-config-reuse", status: "PASS" }],
    summary: { ordersCreated: 2, bundleReservations: 2 } };
}
