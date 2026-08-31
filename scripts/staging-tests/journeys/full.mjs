import { loginActor, logoutActor } from "../actors.mjs";
import { fingerprint } from "../database.mjs";
import { invariant, prerequisite } from "../errors.mjs";
import { mutateOnce } from "../operations.mjs";
import { quoteLine, quoteOrder } from "../oracle.mjs";
import { buildPickupCase, orderMarker } from "./common.mjs";
import { selectPriceCases, selectVoucherCase } from "./full-cases.mjs";
import { createVerifiedPickup, cancelVerifiedPickup } from "./order.mjs";
import { acquireSmokeDiscount } from "./voucher.mjs";

const lifecycle = { login: loginActor, logout: logoutActor };
const ambiguous = error => /AMBIGUOUS/.test(error?.code ?? "");

function buildPriceMatrixCase(catalog, runId, selections) {
  const marker = orderMarker(runId, "price-matrix");
  const items = selections.map(selected => {
    const single = buildPickupCase({ catalog, runId, caseId: selected.id, lineInput: selected.lineInput });
    invariant(single.payload.items.length === 1, "FULL_PRICE_MATRIX_LINE_SPLIT");
    return { ...single.payload.items[0], note: orderMarker(runId, selected.id) };
  });
  const payload = { order_type: "PICKUP", items, discount_voucher_ids: [], note: marker };
  return { marker, payload, expected: quoteOrder(catalog, payload), catalogFingerprint: catalog.fingerprint };
}

async function rejectWrongPrice(ctx, actor, userId, pickupCase, onMarkerOwned) {
  const baseline = await ctx.db.actorState(userId);
  invariant((await ctx.db.ordersByMarkers([pickupCase.marker])).length === 0, "FULL_MARKER_COLLISION");
  onMarkerOwned();
  ctx.runState?.addMarker(pickupCase.marker);
  const payload = structuredClone(pickupCase.payload);
  payload.items[0].client_price_vnd += 1_000;
  const response = await mutateOnce({ journal: ctx.journal, type: "create",
    recovery: { actor: "customerB", userId, marker: pickupCase.marker, orderId: null,
      baselineOrderIds: [], sourceStatuses: ["ABSENT"], targetStatus: "REJECTED" },
    send: () => actor.api.request("/api/orders", { method: "POST", body: payload, mutation: true, timeoutMs: 30_000 }),
    reconcile: async response => response && (await ctx.db.ordersByMarkers([pickupCase.marker])).length === 0
      ? "NOT_APPLIED" : "AMBIGUOUS",
  });
  prerequisite(response.status !== 429, "FULL_ORDER_RATE_LIMITED");
  prerequisite(!(response.status === 503 && response.body?.code === "STORE_CLOSED"), "FULL_STORE_CLOSED");
  invariant(response.status === 409 && response.body?.code === "PRICE_CHANGED", "FULL_WRONG_PRICE_ACCEPTED");
  const conflict = response.body?.details?.conflicts?.find(item => item.menu_item_id === payload.items[0].menu_item_id);
  invariant(conflict?.client_price_vnd === payload.items[0].client_price_vnd
    && conflict?.server_price_vnd === pickupCase.payload.items[0].client_price_vnd, "FULL_PRICE_CONFLICT_INVALID");
  invariant((await ctx.db.ordersByMarkers([pickupCase.marker])).length === 0, "FULL_REJECTED_ORDER_PERSISTED");
  invariant(fingerprint(await ctx.db.actorState(userId)) === fingerprint(baseline), "FULL_REJECTION_CHANGED_ACTOR");
}

/** Execute bounded Phase 3A pricing and reversible voucher journeys with explicit coverage gaps. */
export async function runFullJourney(ctx) {
  const { db, catalog, customerState, runId, runDir, journal, runState, pacer } = ctx;
  const userId = customerState?.actor?.id ?? customerState?.user?.id;
  prerequisite(userId && customerState?.user?.role === "CUSTOMER", "FULL_CUSTOMER_ACCOUNT_INVALID");
  prerequisite((customerState.orders ?? []).length === 0, "FULL_PREEXISTING_NONTERMINAL_ORDER");
  prerequisite(typeof pacer?.reserve === "function", "FULL_PACER_REQUIRED");
  const baseline = structuredClone(await db.actorState(userId));
  const cases = [];
  const known = [];
  const actors = ctx.actorLifecycle ?? lifecycle;
  let actor;
  let failure;
  let logoutAttempted = false;
  let ordersCreated = 0;
  const acquisitions = [];
  const verifiedVariants = new Set();
  const attemptedVariants = new Set();
  let pointsSpent = 0;
  const record = async (id, execute) => {
    try { await execute(); cases.push({ id, status: "PASS" }); }
    catch (error) {
      cases.push({ id, status: error.status === "PARTIAL" ? "PARTIAL" : "FAIL", code: error.code ?? "FULL_CASE_FAILED" });
      if (error.status !== "PARTIAL") throw error;
    }
  };
  const cycle = async (pickupCase, voucher = null, unusedVoucher = null) => {
    const collisionMarkers = [...new Set([pickupCase.marker, ...pickupCase.payload.items.map(item => item.note)])];
    invariant((await db.ordersByMarkers(collisionMarkers)).length === 0, "FULL_MARKER_COLLISION");
    const entry = { marker: pickupCase.marker, voucher, cancelDispatched: false };
    const context = { actor, actorName: "customerB", userId, db, journal, runState };
    const order = await createVerifiedPickup({ ...context, pickupCase, voucher,
      runState: { addMarker(marker) { known.push(entry); runState?.addMarker(marker); } },
      onOrderIdentified: orderId => { entry.orderId = orderId; } });
    ordersCreated += 1;
    const stored = await db.order(order.orderId);
    if (unusedVoucher) {
      invariant(!(stored.discountVouchers ?? []).some(link => link.voucher_id === unusedVoucher.id)
        && fingerprint((await db.vouchers([unusedVoucher.id]))[0]) === fingerprint(unusedVoucher)
        && (await db.activeUses([unusedVoucher.id])).length === 0, "FULL_NO_BENEFIT_VOUCHER_CONSUMED");
    }
    const remaining = [...stored.items];
    for (const input of pickupCase.payload.items) {
      const quote = quoteLine(catalog, input);
      const index = remaining.findIndex(item => item.menu_item_id === input.menu_item_id
        && (item.size ?? null) === (input.size ?? null) && item.quantity === input.quantity
        && (item.note ?? null) === (input.note ?? null));
      const line = remaining.splice(index, 1)[0];
      invariant(index >= 0 && line?.unit_price_vnd === quote.drink && line.addons_price_vnd === quote.addons
        && (line.selected_powder_id ?? null) === (quote.powderId ?? null)
        && (line.selected_milk_type_id ?? null) === (quote.liquidId ?? null)
        && (line.base_liquid_ml ?? null) === (quote.baseLiquidMl ?? null), "FULL_LINE_SNAPSHOT_INVALID");
      invariant(line.addons.length === quote.addonsDetail.length && quote.addonsDetail.every(expected =>
        line.addons.some(actual => actual.addon_option_id === expected.optionId
          && actual.unit_price_vnd === expected.unitPrice && actual.quantity === expected.quantity)), "FULL_ADDON_SNAPSHOT_INVALID");
    }
    entry.cancelDispatched = true;
    await cancelVerifiedPickup({ ...context, marker: entry.marker, orderId: order.orderId, voucher });
  };
  try {
    actor = await actors.login({ origin: ctx.origin, name: "customerB", credential: ctx.credential,
      expectedUserId: userId, runDir, fetchImpl: ctx.fetchImpl, journal, db,
      baselineSessionIds: baseline.sessions.map(session => session.id) });
    if (actor.sessionId) runState?.addSession("customerB", actor.sessionId);
    const selectedPrices = selectPriceCases(catalog);
    const availablePrices = selectedPrices.filter(selected => selected.lineInput);
    for (const selected of selectedPrices.filter(selected => !selected.lineInput)) {
      cases.push({ id: selected.id, status: "PARTIAL", code: "FULL_PRICE_CONFIGURATION_MISSING" });
    }
    await record("price-matrix-batch", async () => {
      prerequisite(availablePrices.length > 0 && availablePrices.length <= 20, "FULL_PRICE_MATRIX_CAPACITY_INVALID");
      const pickupCase = buildPriceMatrixCase(catalog, runId, availablePrices);
      await pacer.reserve(userId, 1, 60_000);
      await cycle(pickupCase);
    });
    if (cases.at(-1)?.id === "price-matrix-batch" && cases.at(-1)?.status === "PASS") {
      for (const selected of availablePrices) cases.push({ id: selected.id, status: "PASS" });
    }
    await record("wrong-client-price", async () => {
      const pickupCase = buildPickupCase({ catalog, runId, caseId: "wrong-client-price" });
      await pacer.reserve(userId, 1, 60_000);
      await rejectWrongPrice(ctx, actor, userId, pickupCase,
        () => known.push({ marker: pickupCase.marker, voucher: null, cancelDispatched: false }));
    });
    for (const type of ["DISCOUNT", "PRODUCT", "PRODUCT_DISCOUNT", "ADDON", "ITEM"]) {
      const typeKey = type.toLowerCase().replaceAll("_", "-");
      await record(`voucher-${typeKey}-reuse`, async () => {
        const choice = ctx.plan?.internal?.coverage?.selected?.find(choice => choice.type === type);
        const wallet = (await db.actorState(userId)).vouchers;
        let selected;
        let lastGap;
        for (const voucher of wallet.filter(voucher => (!choice || choice.source !== "existing" || voucher.id === choice.voucher.id)
          && voucher.voucher_type === type && voucher.status === "ACTIVE"
          && (!voucher.expires_at || new Date(voucher.expires_at).getTime() > Date.now() + 120_000)
          && (!voucher.package?.ends_at || new Date(voucher.package.ends_at).getTime() > Date.now() + 120_000))) {
          try {
            selected = { voucher, pickupCase: selectVoucherCase({ catalog, runId, caseId: `${typeKey}-first`, voucher }) };
            break;
          } catch (error) { if (error.status !== "PARTIAL") throw error; lastGap = error; }
        }
        if (!selected && choice?.source === "exchange") {
          prerequisite(ctx.plan.internal.coverage.budgetOk, "FULL_INITIAL_POINTS_BUDGET_INSUFFICIENT");
          const cost = choice.package.points_cost;
          prerequisite(Number.isSafeInteger(cost) && cost >= 0 && pointsSpent + cost <= baseline.user.points_balance
            && pointsSpent + cost <= ctx.plan.internal.coverage.pointsNeeded, "FULL_INITIAL_POINTS_BUDGET_EXCEEDED");
          // A package preview proves a usable configuration before spending; it is never sent to the API.
          selectVoucherCase({ catalog, runId, caseId: `${typeKey}-first`,
            voucher: { ...choice.package, voucher_type: type, qr_token: "00000000-0000-4000-8000-000000000001" } });
          await pacer.reserve(userId, 2, 120_000);
          prerequisite(!choice.package.ends_at || new Date(choice.package.ends_at).getTime() > Date.now() + 120_000,
            "FULL_PACKAGE_ENDS_BEFORE_PAIR");
          const acquired = await acquireSmokeDiscount({ actor, actorName: "customerB", userId, db, journal,
            runState, plan: ctx.plan, voucherType: type });
          pointsSpent += cost;
          acquisitions.push({ voucher: acquired.voucher, cost });
          selected = { voucher: acquired.voucher, pickupCase: selectVoucherCase({ catalog, runId,
            caseId: `${typeKey}-first`, voucher: acquired.voucher }), reserved: true };
        }
        if (!selected && lastGap) throw lastGap;
        prerequisite(selected, "FULL_ELIGIBLE_EXISTING_VOUCHER_MISSING");
        if (type === "DISCOUNT") attemptedVariants.add(`voucher-discount-${selected.voucher.discount_type?.toLowerCase()}`);
        if (type === "PRODUCT_DISCOUNT") attemptedVariants.add(`voucher-product-discount-${selected.voucher.product_discount_mode?.toLowerCase().replaceAll("_", "-")}`);
        if (!selected.reserved) await pacer.reserve(userId, 2, 120_000);
        const [current] = await db.vouchers([selected.voucher.id]);
        prerequisite(current?.status === "ACTIVE" && (!current.expires_at
          || new Date(current.expires_at).getTime() > Date.now() + 120_000)
          && (!current.package?.ends_at || new Date(current.package.ends_at).getTime() > Date.now() + 120_000),
        "FULL_VOUCHER_EXPIRES_BEFORE_PAIR");
        runState?.addVoucher(selected.voucher.id);
        await cycle(selected.pickupCase, selected.voucher);
        const reuse = selectVoucherCase({ catalog, runId, caseId: `${typeKey}-reuse`, voucher: selected.voucher });
        let unusedVoucher;
        if (type === "PRODUCT" && reuse.expected.total_vnd === 0) {
          unusedVoucher = (await db.actorState(userId)).vouchers.find(candidate => candidate.voucher_type === "DISCOUNT"
            && candidate.status === "ACTIVE" && (candidate.min_order_vnd ?? 0) === 0
            && ["FIXED", "PERCENT"].includes(candidate.discount_type) && candidate.discount_value > 0
            && (!candidate.expires_at || new Date(candidate.expires_at).getTime() > Date.now() + 120_000)
            && (!candidate.package?.ends_at || new Date(candidate.package.ends_at).getTime() > Date.now() + 120_000));
          if (unusedVoucher) {
            reuse.payload.discount_voucher_ids = [unusedVoucher.qr_token];
            reuse.expected = quoteOrder(catalog, reuse.payload, [selected.voucher, unusedVoucher]);
          }
        }
        await cycle(reuse, selected.voucher, unusedVoucher);
        if (unusedVoucher) cases.push({ id: "voucher-no-benefit-not-consumed", status: "PASS" });
        if (type === "DISCOUNT") verifiedVariants.add(`voucher-discount-${selected.voucher.discount_type?.toLowerCase()}`);
        if (type === "PRODUCT_DISCOUNT") verifiedVariants.add(`voucher-product-discount-${selected.voucher.product_discount_mode?.toLowerCase().replaceAll("_", "-")}`);
      });
    }
    if (!cases.some(item => item.id === "voucher-no-benefit-not-consumed")) cases.push({
      id: "voucher-no-benefit-not-consumed", status: "PARTIAL", code: "FULL_NO_BENEFIT_DATA_MISSING" });
    for (const [type, field, variants] of [["DISCOUNT", "discount_type", ["FIXED", "PERCENT"]],
      ["PRODUCT_DISCOUNT", "product_discount_mode", ["FIXED_AMOUNT", "PAY_AS_SIZE"]]]) {
      for (const variant of variants) {
        const key = `${type.toLowerCase().replaceAll("_", "-")}-${variant.toLowerCase().replaceAll("_", "-")}`;
        const id = `voucher-${key}`;
        const markerKey = key.replace("product-discount", "pd");
        if (attemptedVariants.has(id)) continue;
        await record(id, async () => {
          let selected;
          let lastGap;
          // Additional subtypes may use only inventory frozen before this journey, never another acquisition.
          for (const voucher of baseline.vouchers.filter(voucher => voucher.voucher_type === type
            && voucher[field] === variant && voucher.status === "ACTIVE"
            && (!voucher.expires_at || new Date(voucher.expires_at).getTime() > Date.now() + 120_000)
            && (!voucher.package?.ends_at || new Date(voucher.package.ends_at).getTime() > Date.now() + 120_000))) {
            try {
              selected = { voucher, pickupCase: selectVoucherCase({ catalog, runId, caseId: `${markerKey}-first`, voucher }) };
              break;
            } catch (error) { if (error.status !== "PARTIAL") throw error; lastGap = error; }
          }
          if (!selected && lastGap) throw lastGap;
          prerequisite(selected, "FULL_EXISTING_VARIANT_MISSING");
          await pacer.reserve(userId, 2, 120_000);
          const [current] = await db.vouchers([selected.voucher.id]);
          prerequisite(current?.status === "ACTIVE" && (!current.expires_at
            || new Date(current.expires_at).getTime() > Date.now() + 120_000)
            && (!current.package?.ends_at || new Date(current.package.ends_at).getTime() > Date.now() + 120_000),
          "FULL_VOUCHER_EXPIRES_BEFORE_PAIR");
          invariant(fingerprint(current) === fingerprint(selected.voucher), "FULL_VARIANT_ASSET_CHANGED");
          runState?.addVoucher(selected.voucher.id);
          await cycle(selected.pickupCase, selected.voucher);
          await cycle(selectVoucherCase({ catalog, runId, caseId: `${markerKey}-reuse`, voucher: selected.voucher }), selected.voucher);
          verifiedVariants.add(id);
        });
      }
    }
    for (const id of ["voucher-discount-fixed", "voucher-discount-percent",
      "voucher-product-discount-fixed-amount", "voucher-product-discount-pay-as-size"]) {
      if (cases.some(item => item.id === id)) continue;
      cases.push(verifiedVariants.has(id) ? { id, status: "PASS" }
        : { id, status: "PARTIAL", code: "FULL_VARIANT_PAIR_INCOMPLETE" });
    }
  } catch (error) { failure = error; }
  if (failure && ambiguous(failure)) throw failure;
  try {
    if (actor) {
      for (const entry of [...known].reverse()) {
        const matches = await db.ordersByMarkers([entry.marker]);
        invariant(matches.length <= 1, "FULL_CLEANUP_MARKER_NOT_UNIQUE");
        if (entry.orderId) invariant(matches.length === 1 && matches[0].id === entry.orderId
          && matches[0].user_id === userId && matches[0].note === entry.marker, "FULL_TERMINAL_AUDIT_MISSING");
        if (!matches.length || matches[0].status === "CANCELLED") continue;
        invariant(!entry.cancelDispatched, "FULL_CANCEL_RECOVERY_REQUIRED");
        entry.cancelDispatched = true;
        await cancelVerifiedPickup({ actor, actorName: "customerB", userId, db, journal,
          marker: entry.marker, orderId: matches[0].id, voucher: entry.voucher });
      }
      logoutAttempted = true;
      await actors.logout(actor, db, runDir, journal);
    }
    for (const entry of known.filter(entry => entry.orderId)) {
      const retained = await db.ordersByMarkers([entry.marker]);
      invariant(retained.length === 1 && retained[0].id === entry.orderId && retained[0].user_id === userId
        && retained[0].note === entry.marker && retained[0].status === "CANCELLED", "FULL_TERMINAL_AUDIT_MISSING");
    }
    const final = await db.actorState(userId);
    for (const field of ["sessions", "grants"]) {
      invariant(fingerprint(final[field]) === fingerprint(baseline[field]), "FULL_ACTOR_RECONCILIATION_FAILED");
    }
    for (const field of ["vouchers", "ledger"]) {
      for (const original of baseline[field]) invariant(fingerprint(final[field].find(row => row.id === original.id))
        === fingerprint(original), "FULL_BASELINE_CHANGED");
    }
    const newVouchers = final.vouchers.filter(voucher => !baseline.vouchers.some(old => old.id === voucher.id));
    const newLogs = final.ledger.filter(log => !baseline.ledger.some(old => old.id === log.id));
    invariant(newVouchers.length === acquisitions.length && newLogs.length === acquisitions.length, "FULL_UNEXPECTED_ACQUISITION");
    for (const acquired of acquisitions) {
      invariant(newVouchers.some(voucher => voucher.id === acquired.voucher.id && voucher.status === "ACTIVE"), "FULL_ACQUIRED_VOUCHER_NOT_RESTORED");
      invariant(newLogs.filter(log => log.voucher_id === acquired.voucher.id && log.reason === "voucher_purchase"
        && Number(log.delta) === -acquired.cost).length === 1, "FULL_PURCHASE_LEDGER_INVALID");
    }
    invariant(final.user.points_balance === baseline.user.points_balance - pointsSpent, "FULL_POINTS_BALANCE_INVALID");
    invariant((await db.catalog()).fingerprint === catalog.fingerprint, "CATALOG_CHANGED");
  } catch (error) { if (ambiguous(error)) throw error; failure = error; }
  if (failure) return { status: "FAIL", cases, gaps: cases.filter(item => item.status === "PARTIAL"),
    code: failure.code ?? "FULL_FAILED", recoveryRequired: !logoutAttempted };
  const gaps = cases.filter(item => item.status === "PARTIAL");
  return { status: gaps.length ? "PARTIAL" : "PASS", cases, gaps,
    summary: { phase: "3A", ordersCreated, vouchersAcquired: acquisitions.length, pointsSpent } };
}
