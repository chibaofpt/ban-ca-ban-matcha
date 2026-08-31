import { loginActor, logoutActor } from "../actors.mjs";
import { fingerprint } from "../database.mjs";
import { invariant, prerequisite } from "../errors.mjs";
import { mutateOnce } from "../operations.mjs";
import { buildPickupCase } from "./common.mjs";
import { selectVoucherCase } from "./full-cases.mjs";

const requiredActors = [["customerB", "CUSTOMER"], ["staff", "STAFF"], ["admin", "ADMIN"]];
const lifecycle = { login: loginActor, logout: logoutActor };

function terminalSnapshot(order) {
  return fingerprint({ user_id: order.user_id, order_type: order.order_type, payment_method: order.payment_method,
    subtotal_vnd: order.subtotal_vnd, total_voucher_discount_vnd: order.total_voucher_discount_vnd,
    total_vnd: order.total_vnd, grand_total_vnd: order.grand_total_vnd,
    items: order.items.map(item => ({ menu_item_id: item.menu_item_id, size: item.size, quantity: item.quantity,
      unit_price_vnd: item.unit_price_vnd, addons_price_vnd: item.addons_price_vnd, note: item.note,
      selected_powder_id: item.selected_powder_id, selected_milk_type_id: item.selected_milk_type_id,
      base_liquid_ml: item.base_liquid_ml, addons: item.addons })),
  });
}

/** Execute bounded counter cash/transfer and reversal journeys against verified staging. */
export async function runCounterJourneys(ctx) {
  for (const [name, role] of requiredActors) {
    if (!ctx.actorStates?.[name]?.user?.id || ctx.actorStates[name].user.role !== role
      || !ctx.credentials?.[name]?.phone || !ctx.credentials[name].password) {
      return { status: "PARTIAL", code: "COUNTER_ACTOR_UNAVAILABLE", cases: [] };
    }
  }
  const { db, journal, runState } = ctx;
  const actors = {};
  const baselines = {};
  const cases = [];
  const retained = [];
  const knownMarkers = new Set();
  const expiredRestorations = new Set();
  const customerId = ctx.actorStates.customerB.user.id;
  const actorLifecycle = ctx.actorLifecycle ?? lifecycle;
  let failure;
  let recoveryRequired = false;
  const now = ctx.now ?? Date.now;
  const checkTime = () => prerequisite(Number.isFinite(ctx.deadline) && ctx.deadline - now() >= 180_000,
    "COUNTER_TIME_BUDGET_INSUFFICIENT");
  const validThrough = (voucher, horizon) => (!voucher.expires_at || Date.parse(voucher.expires_at) > now() + horizon)
    && (!voucher.package?.ends_at || Date.parse(voucher.package.ends_at) > now() + horizon);
  const checkVoucher = async (voucher, status) => {
    const [current] = await db.vouchers([voucher.id]);
    prerequisite(current?.status === status && validThrough(current, 180_000), "COUNTER_VOUCHER_VALIDITY_INSUFFICIENT");
  };
  const restoredVoucher = voucher => ({ ...voucher, ...(expiredRestorations.has(voucher.id) ? { status: "EXPIRED" } : {}) });
  const noteExpiredRestorations = order => {
    for (const voucher of baselines.customerB?.vouchers ?? []) {
      if (voucher.expires_at && Date.parse(voucher.expires_at) <= now()
        && (order.discountVouchers?.some(link => link.voucher_id === voucher.id)
          || order.items.some(item => item.product_voucher_id === voucher.id || item.item_voucher_id === voucher.id
            || item.addonVouchers?.some(link => link.voucher_id === voucher.id)))) expiredRestorations.add(voucher.id);
    }
  };
  const plausibleTime = (value, order) => Number.isFinite(Date.parse(value))
    && Date.parse(value) >= Date.parse(order.created_at) - 5_000 && Date.parse(value) <= now() + 5_000;
  const verifyRedemption = (voucher, order, actorName) => invariant(voucher.status === "REDEEMED"
    && voucher.redeemed_by === ctx.actorStates[actorName].user.id && voucher.used_channel === "OFFLINE"
    && plausibleTime(voucher.redeemed_at, order), "COUNTER_REDEMPTION_AUDIT_INVALID");

  const verifyAward = async (order, expected, performedBy, before) => {
    invariant(order.payment_method === "BANK_TRANSFER"
      ? order.payment_confirmed_by === performedBy && plausibleTime(order.payment_confirmed_at, order)
      : order.payment_confirmed_by == null && order.payment_confirmed_at == null, "COUNTER_PAYMENT_AUDIT_INVALID");
    const state = await db.actorState(customerId);
    const logs = state.ledger.filter(log => log.order_id === order.id);
    const awards = order.user_id ? [
      { reason: "order_complete", delta: expected.orderPoints },
      { reason: "voucher_surplus", delta: expected.surplusPoints },
    ].filter(item => item.delta > 0) : [];
    invariant(logs.length === awards.length && awards.every(award => logs.filter(log => log.reason === award.reason
      && Number(log.delta) === award.delta && log.user_id === customerId && log.performed_by === performedBy
      && log.voucher_id == null && log.reversed_log_id == null).length === 1), "COUNTER_AWARD_LEDGER_INVALID");
    invariant(fingerprint(order.pointsLogs ?? []) === fingerprint(logs), "COUNTER_ORDER_LEDGER_MISMATCH");
    invariant(order.points_earned === (order.user_id ? expected.orderPoints : 0), "COUNTER_POINTS_SNAPSHOT_INVALID");
    invariant(state.user.points_balance === before.user.points_balance + awards.reduce((sum, award) => sum + award.delta, 0),
      "COUNTER_AWARD_BALANCE_INVALID");
    invariant(before.ledger.every(old => fingerprint(state.ledger.find(log => log.id === old.id)) === fingerprint(old)),
      "COUNTER_OLD_LEDGER_CHANGED");
    invariant(fingerprint(state.ledger.filter(log => !before.ledger.some(old => old.id === log.id))) === fingerprint(logs),
      "COUNTER_UNEXPECTED_AWARD_LEDGER");
  };

  const counterCase = (caseId, paymentMethod, identified = true) => {
    const pickup = buildPickupCase({ catalog: ctx.catalog, runId: ctx.runId, caseId });
    return { marker: pickup.marker, expected: pickup.expected, payload: {
      ...(identified ? { phone_number: ctx.actorStates.customerB.actor.phone_number,
        customer_qr_token: ctx.actorStates.customerB.actor.qr_token } : {}),
      payment_method: paymentMethod, items: pickup.payload.items, discount_voucher_ids: [], bundle_applications: [],
    } };
  };
  const voucherCounterCase = (caseId, voucher, customerQrToken, paymentMethod = "CASH") => {
    const pickup = selectVoucherCase({ catalog: ctx.catalog, runId: ctx.runId, caseId, voucher });
    return { marker: pickup.marker, expected: pickup.expected, voucher, payload: {
      phone_number: ctx.actorStates.customerB.actor.phone_number,
      ...(customerQrToken ? { customer_qr_token: customerQrToken } : {}),
      payment_method: paymentMethod, items: pickup.payload.items,
      discount_voucher_ids: pickup.payload.discount_voucher_ids ?? [],
      bundle_applications: pickup.payload.bundle_applications ?? [],
    } };
  };
  const create = async (id, actorName, selected, expectedStatus, refusal = null) => {
    checkTime();
    if (selected.voucher) await checkVoucher(selected.voucher, "ACTIVE");
    invariant((await db.ordersByMarkers([selected.marker])).length === 0, "COUNTER_PREEXISTING_MARKER");
    knownMarkers.add(selected.marker);
    runState?.addMarker(selected.marker);
    const beforeCustomer = await db.actorState(customerId);
    const expectedCustomerId = selected.payload.phone_number ? customerId : null;
    const response = await mutateOnce({ journal, type: "create", recovery: { actor: actorName,
      userId: expectedCustomerId, marker: selected.marker,
      sourceStatuses: ["ABSENT"], targetStatus: refusal ? "REJECTED" : expectedStatus },
    send: () => actors[actorName].api.request("/api/staff/orders", { method: "POST", body: selected.payload, mutation: true, timeoutMs: 30_000 }),
    isKnownNotApplied: current => Boolean(refusal && current.status === refusal.status && current.body?.code === refusal.code),
    reconcile: async current => {
      const matches = await db.ordersByMarkers([selected.marker]);
      if (matches.length === 1 && !refusal && matches[0].status === expectedStatus
        && matches[0].order_type === "COUNTER" && matches[0].user_id === expectedCustomerId
        && matches[0].payment_method === selected.payload.payment_method
        && matches[0].handled_by === ctx.actorStates[actorName].user.id) {
        return { state: "APPLIED", data: { id: matches[0].id } };
      }
      if (matches.length === 0 && current && refusal) return "NOT_APPLIED";
      return "AMBIGUOUS";
    } });
    if (refusal) {
      invariant(response.status === refusal.status && response.body?.code === refusal.code, "COUNTER_ROLE_REFUSAL_INVALID");
      invariant((await db.ordersByMarkers([selected.marker])).length === 0, "COUNTER_REJECTED_ORDER_PERSISTED");
      invariant(fingerprint(await db.actorState(customerId)) === fingerprint(beforeCustomer), "COUNTER_REJECTION_CHANGED_CUSTOMER");
      cases.push({ id, status: "PASS" });
      return null;
    }
    invariant((response.status === 201 || response.recovered) && response.body?.data?.id, "COUNTER_CREATE_REJECTED");
    const order = await db.order(response.body.data.id);
    invariant(order?.status === expectedStatus && order.order_type === "COUNTER"
      && order.payment_method === selected.payload.payment_method, "COUNTER_CREATE_STATE_INVALID");
    invariant(order.items.some(item => item.note === selected.marker), "COUNTER_MARKER_NOT_RETAINED");
    invariant(order.user_id === (selected.payload.phone_number ? customerId : null), "COUNTER_CUSTOMER_LINK_INVALID");
    const apiRead = response.recovered
      ? await actors[actorName].api.request(`/api/staff/orders/${order.id}`) : response;
    invariant(apiRead.ok && apiRead.body?.data?.id === order.id, "COUNTER_PAYMENT_READ_FAILED");
    const payment = apiRead.body.data;
    for (const field of ["subtotal_vnd", "total_voucher_discount_vnd", "total_vnd", "grand_total_vnd"]) {
      invariant(order[field] === selected.expected[field], `COUNTER_TOTAL_INVALID_${field.toUpperCase()}`);
      invariant(payment[field] === selected.expected[field], `COUNTER_API_TOTAL_INVALID_${field.toUpperCase()}`);
    }
    if (expectedStatus === "PENDING") {
      invariant(order.order_code && order.auto_cancel_at && order.points_earned == null
        && payment.order_code === order.order_code && typeof payment.payment_qr_url === "string",
      "COUNTER_TRANSFER_PAYMENT_INVALID");
      let qr;
      try { qr = new URL(payment.payment_qr_url); } catch { /* Invalid DTO is reported without logging the QR. */ }
      invariant(qr?.origin === "https://img.vietqr.io"
        && qr.searchParams.get("amount") === String(selected.expected.grand_total_vnd)
        && qr.searchParams.get("addInfo") === order.order_code, "COUNTER_TRANSFER_PAYMENT_INVALID");
    }
    if (selected.voucher) {
      const linked = order.discountVouchers?.some(link => link.voucher_id === selected.voucher.id)
        || order.items.some(item => item.product_voucher_id === selected.voucher.id || item.item_voucher_id === selected.voucher.id
          || item.addonVouchers?.some(link => link.voucher_id === selected.voucher.id));
      invariant(linked, "COUNTER_VOUCHER_LINK_MISSING");
      const [storedVoucher] = await db.vouchers([selected.voucher.id]);
      invariant(storedVoucher?.status === (expectedStatus === "COMPLETED" ? "REDEEMED" : "RESERVED"),
        "COUNTER_VOUCHER_STATUS_INVALID");
      if (expectedStatus === "COMPLETED") verifyRedemption(storedVoucher, order, actorName);
    }
    retained.push({ id: order.id, marker: selected.marker, snapshot: terminalSnapshot(order),
      expected: selected.expected, identified: Boolean(selected.payload.phone_number) });
    if (expectedStatus === "COMPLETED") await verifyAward(order, selected.expected, null, beforeCustomer);
    cases.push({ id, status: "PASS" });
    return order;
  };
  const transition = async (id, actorName, order, target, voucher = null) => {
    if (target !== "CANCELLED") checkTime();
    if (voucher && target === "COMPLETED") await checkVoucher(voucher, "RESERVED");
    const before = structuredClone(await db.actorState(customerId));
    const response = await mutateOnce({ journal, type: target === "CANCELLED" ? "cancel" : "status",
      recovery: { actor: actorName, userId: order.user_id, orderId: order.id,
        marker: order.items.find(item => item.note)?.note, sourceStatuses: [order.status], targetStatus: target },
      send: () => actors[actorName].api.request(`/api/staff/orders/${order.id}`, { method: "PATCH", body: { status: target }, mutation: true, timeoutMs: 30_000 }),
      reconcile: async () => (await db.order(order.id))?.status === target ? "APPLIED" : "AMBIGUOUS",
    });
    invariant(response.ok && (await db.order(order.id))?.status === target, "COUNTER_TRANSITION_FAILED");
    if (target === "COMPLETED") await verifyAward(await db.order(order.id),
      retained.find(entry => entry.id === order.id).expected, ctx.actorStates[actorName].user.id, before);
    if (target === "CANCELLED") {
      noteExpiredRestorations(order);
      const after = await db.actorState(customerId);
      const awards = before.ledger.filter(log => log.order_id === order.id
        && ["order_complete", "voucher_surplus"].includes(log.reason));
      const added = after.ledger.filter(log => !before.ledger.some(old => old.id === log.id));
      invariant(before.ledger.every(old => fingerprint(after.ledger.find(log => log.id === old.id)) === fingerprint(old)),
        "COUNTER_OLD_LEDGER_CHANGED");
      invariant(added.length === awards.length && awards.every(award => added.filter(log =>
        log.reversed_log_id === award.id && Number(log.delta) === -Number(award.delta)
        && log.reason === `${award.reason}_reversed` && log.order_id === order.id && log.user_id === customerId
        && log.performed_by === ctx.actorStates[actorName].user.id && (log.voucher_id ?? null) === (award.voucher_id ?? null)
      ).length === 1), "COUNTER_REVERSAL_LEDGER_INVALID");
      invariant(after.user.points_balance === before.user.points_balance - awards.reduce((sum, log) => sum + Number(log.delta), 0),
        "COUNTER_REVERSAL_BALANCE_INVALID");
    }
    if (voucher) {
      const [storedVoucher] = await db.vouchers([voucher.id]);
      const expectedVoucherStatus = target === "CANCELLED" ? restoredVoucher(voucher).status : target === "COMPLETED" ? "REDEEMED" : "RESERVED";
      invariant(storedVoucher?.status === expectedVoucherStatus, "COUNTER_TRANSITION_VOUCHER_STATUS_INVALID");
      if (target === "COMPLETED") verifyRedemption(storedVoucher, await db.order(order.id), actorName);
      if (target === "CANCELLED") {
        invariant((await db.activeUses([voucher.id])).length === 0, "COUNTER_CANCEL_VOUCHER_RESERVATION_REMAINED");
        invariant(fingerprint(storedVoucher) === fingerprint(restoredVoucher(voucher)), "COUNTER_VOUCHER_SNAPSHOT_CHANGED");
      }
    }
    cases.push({ id, status: "PASS" });
    return db.order(order.id);
  };

  try {
    checkTime();
    for (const [name] of requiredActors) {
      baselines[name] = structuredClone(await db.actorState(ctx.actorStates[name].user.id));
      prerequisite(!(ctx.actorStates[name].orders ?? []).length, "COUNTER_PREEXISTING_ORDER");
      actors[name] = await actorLifecycle.login({ origin: ctx.origin, name, credential: ctx.credentials[name],
        expectedUserId: ctx.actorStates[name].user.id, runDir: ctx.runDir, fetchImpl: ctx.fetchImpl,
        journal, db, baselineSessionIds: baselines[name].sessions.map(session => session.id) });
      if (actors[name].sessionId) runState?.addSession(name, actors[name].sessionId);
    }
    const denied = counterCase("counter-role-denied", "CASH");
    await create("customer-counter-route-denied", "customerB", denied, "REJECTED", { status: 403, code: "FORBIDDEN" });

    let voucherGuardCovered = false;
    let counterVoucher;
    const wallet = (await db.actorState(customerId)).vouchers;
    for (const voucher of wallet.filter(item => item.status === "ACTIVE" && validThrough(item, 540_000)
      && ["DISCOUNT", "PRODUCT", "PRODUCT_DISCOUNT", "ADDON", "ITEM"].includes(item.voucher_type))) {
      try {
        const missingQr = voucherCounterCase("counter-voucher-no-qr", voucher, null);
        await create("counter-voucher-missing-customer-qr", "staff", missingQr, "REJECTED",
          { status: 400, code: "VALIDATION_ERROR" });
        const wrongQr = voucherCounterCase("counter-voucher-wrong-qr", voucher, ctx.actorStates.staff.actor.qr_token);
        await create("counter-voucher-mismatched-customer-qr", "staff", wrongQr, "REJECTED",
          { status: 400, code: "VALIDATION_ERROR" });
        voucherGuardCovered = true;
        counterVoucher = voucher;
        break;
      } catch (error) {
        if (error.status !== "PARTIAL") throw error;
      }
    }
    if (!voucherGuardCovered) cases.push({ id: "counter-voucher-qr-guards", status: "PARTIAL",
      code: "COUNTER_ELIGIBLE_ACTIVE_VOUCHER_MISSING" });

    const cashCase = counterCase("counter-cash", "CASH");
    let cash = await create("counter-cash-completes", "staff", cashCase, "COMPLETED");
    invariant(cash.points_earned === cashCase.expected.orderPoints, "COUNTER_CASH_POINTS_INVALID");
    cash = await transition("counter-cash-admin-reversal", "admin", cash, "CANCELLED");

    const transferCase = counterCase("counter-transfer", "BANK_TRANSFER");
    let transfer = await create("counter-transfer-pending", "staff", transferCase, "PENDING");
    transfer = await transition("counter-transfer-completes", "staff", transfer, "COMPLETED");
    invariant(transfer.points_earned === transferCase.expected.orderPoints, "COUNTER_TRANSFER_POINTS_INVALID");
    await transition("counter-transfer-admin-reversal", "admin", transfer, "CANCELLED");

    if (counterVoucher) {
      runState?.addVoucher(counterVoucher.id);
      const voucherCash = voucherCounterCase("counter-voucher-cash", counterVoucher,
        ctx.actorStates.customerB.actor.qr_token);
      const voucherOrder = await create("counter-voucher-cash-completes", "staff", voucherCash, "COMPLETED");
      await transition("counter-voucher-admin-reversal", "admin", voucherOrder, "CANCELLED", counterVoucher);
      const voucherReuse = voucherCounterCase("counter-voucher-reuse", counterVoucher,
        ctx.actorStates.customerB.actor.qr_token, "BANK_TRANSFER");
      if (voucherReuse.expected.grand_total_vnd <= 0) {
        cases.push({ id: "counter-voucher-transfer-reversal", status: "PARTIAL",
          code: "COUNTER_POSITIVE_TRANSFER_TOTAL_UNAVAILABLE" });
        const cashReuse = voucherCounterCase("counter-voucher-cash-reuse", counterVoucher,
          ctx.actorStates.customerB.actor.qr_token);
        const reused = await create("counter-zero-voucher-cash-reuse", "staff", cashReuse, "COMPLETED");
        await transition("counter-voucher-reuse-cancel", "admin", reused, "CANCELLED", counterVoucher);
      } else {
        let reused = await create("counter-voucher-reuse-pending", "staff", voucherReuse, "PENDING");
        reused = await transition("counter-voucher-transfer-completes", "staff", reused, "COMPLETED", counterVoucher);
        await transition("counter-voucher-transfer-reversal", "admin", reused, "CANCELLED", counterVoucher);
        const secondReuse = voucherCounterCase("counter-voucher-second-reuse", counterVoucher,
          ctx.actorStates.customerB.actor.qr_token, "BANK_TRANSFER");
        const finalReuse = await create("counter-voucher-second-reuse-pending", "staff", secondReuse, "PENDING");
        await transition("counter-voucher-reuse-cancel", "admin", finalReuse, "CANCELLED", counterVoucher);
      }
    }

    const anonymousCase = counterCase("counter-anonymous", "CASH", false);
    let anonymous = await create("counter-anonymous-completes", "staff", anonymousCase, "COMPLETED");
    invariant(anonymous.points_earned === 0 && !(anonymous.pointsLogs ?? []).length, "COUNTER_ANONYMOUS_POINTS_INVALID");
    await transition("counter-anonymous-cancel", "admin", anonymous, "CANCELLED");
  } catch (error) { failure = error; }
  if (failure && /AMBIGUOUS/.test(failure.code ?? "")) throw failure;
  try {
    for (const marker of [...knownMarkers].reverse()) {
      const matches = await db.ordersByMarkers([marker]);
      invariant(matches.length <= 1, "COUNTER_CLEANUP_MARKER_COLLISION");
      const current = matches[0];
      if (!current || current.status === "CANCELLED") continue;
      invariant(actors.admin && current.order_type === "COUNTER"
        && (current.user_id === customerId || current.user_id == null), "COUNTER_CLEANUP_SCOPE_INVALID");
      const response = await mutateOnce({ journal, type: "cancel", recovery: { actor: "admin",
        userId: current.user_id, marker, orderId: current.id, sourceStatuses: [current.status], targetStatus: "CANCELLED" },
      send: () => actors.admin.api.request(`/api/staff/orders/${current.id}`, {
        method: "PATCH", body: { status: "CANCELLED" }, mutation: true, timeoutMs: 30_000 }),
      reconcile: async failed => {
        const order = await db.order(current.id);
        if (order?.status === "CANCELLED") return "APPLIED";
        return failed && order?.status === current.status ? "NOT_APPLIED" : "AMBIGUOUS";
      } });
      invariant(response.ok && (await db.order(current.id))?.status === "CANCELLED", "COUNTER_CLEANUP_CANCEL_FAILED");
      noteExpiredRestorations(current);
    }
    for (const name of Object.keys(actors).reverse()) await actorLifecycle.logout(actors[name], db, ctx.runDir, journal);
    if (baselines.customerB) {
    const customer = await db.actorState(customerId);
    for (const old of baselines.customerB.ledger) invariant(fingerprint(customer.ledger.find(row => row.id === old.id)) === fingerprint(old), "COUNTER_OLD_LEDGER_CHANGED");
    const newLogs = customer.ledger.filter(row => !baselines.customerB.ledger.some(old => old.id === row.id));
    invariant(newLogs.reduce((sum, row) => sum + Number(row.delta), 0) === 0
      && customer.user.points_balance === baselines.customerB.user.points_balance, "COUNTER_POINTS_NOT_REVERSED");
    invariant(fingerprint(customer.vouchers) === fingerprint(baselines.customerB.vouchers.map(restoredVoucher)), "COUNTER_VOUCHER_SNAPSHOT_CHANGED");
    invariant(fingerprint(customer.grants) === fingerprint(baselines.customerB.grants), "COUNTER_GRANTS_CHANGED");
    }
    for (const audit of retained) {
      const matches = await db.ordersByMarkers([audit.marker]);
      invariant(matches.length === 1 && matches[0].id === audit.id && matches[0].status === "CANCELLED",
        "COUNTER_TERMINAL_AUDIT_MISSING");
      invariant(terminalSnapshot(matches[0]) === audit.snapshot, "COUNTER_FINANCIAL_SNAPSHOT_CHANGED");
      if (!audit.identified) invariant(!(matches[0].pointsLogs ?? []).length, "COUNTER_ANONYMOUS_LEDGER_CREATED");
    }
    for (const [name] of requiredActors) {
      if (!baselines[name]) continue;
      const final = await db.actorState(ctx.actorStates[name].user.id);
      invariant(fingerprint(final.sessions) === fingerprint(baselines[name].sessions), "COUNTER_SESSION_CHANGED");
      if (name !== "customerB") invariant(fingerprint(final) === fingerprint(baselines[name]), "COUNTER_OPERATOR_STATE_CHANGED");
    }
    invariant((await db.catalog()).fingerprint === ctx.catalog.fingerprint, "CATALOG_CHANGED");
  } catch (error) { if (/AMBIGUOUS/.test(error.code ?? "")) throw error; failure = error; recoveryRequired = true; }
  if (failure) return { status: failure.status === "PARTIAL" && !recoveryRequired ? "PARTIAL" : "FAIL",
    code: failure.code ?? "COUNTER_FAILED", cases, recoveryRequired };
  const gaps = cases.filter(item => item.status === "PARTIAL");
  if (!cases.some(item => item.id === "counter-voucher-reuse-cancel" && item.status === "PASS")) {
    gaps.push({ id: "counter-voucher-reversal-reuse", status: "PARTIAL", code: "COUNTER_ELIGIBLE_ACTIVE_VOUCHER_MISSING" });
  }
  return { status: gaps.length ? "PARTIAL" : "PASS", cases: [...cases.filter(item => item.status !== "PARTIAL"), ...gaps], gaps,
    summary: { ordersCreated: retained.length, netPoints: 0 } };
}
