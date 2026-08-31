import { fingerprint } from "./database.mjs";

/** Return the original intents whose latest outcome still requires reconciliation. */
export function unresolvedOperations(entries) {
  const intents = new Map();
  const latest = new Map();
  for (const entry of entries) {
    if (entry.state === "INTENT") intents.set(entry.operationId, entry);
    latest.set(entry.operationId, entry.state);
  }
  return [...intents.values()].filter(entry => ["INTENT", "AMBIGUOUS"].includes(latest.get(entry.operationId)));
}

/** Classify one lost-response mutation from exact read-only evidence; never retries it. */
export async function classifyUnresolvedOperation(entry, db, { capturedRefreshToken } = {}) {
  const recovery = entry.recovery ?? {};
  if (entry.type === "refresh") {
    if (!capturedRefreshToken || fingerprint(capturedRefreshToken) === recovery.baselineRefreshFingerprint) {
      return { state: "AMBIGUOUS", code: "REFRESH_COOKIE_NOT_OBSERVED" };
    }
    const session = await db.session(capturedRefreshToken);
    return session?.id === recovery.sessionId && session.user_id === recovery.userId
      ? { state: "APPLIED", sessionId: session.id }
      : { state: "AMBIGUOUS", code: "REFRESH_SESSION_NOT_PROVEN" };
  }
  if (entry.type === "create") {
    if (!recovery.marker) return { state: "AMBIGUOUS", code: "CREATE_MARKER_MISSING" };
    const orders = await db.ordersByMarkers([recovery.marker]);
    if (orders.length === 0) return { state: "AMBIGUOUS", code: "CREATE_NOT_YET_OBSERVED" };
    if (orders.length === 1 && orders[0].user_id === recovery.userId) return { state: "APPLIED", orderId: orders[0].id, orderStatus: orders[0].status };
    return { state: "AMBIGUOUS", code: "MULTIPLE_MARKER_ORDERS" };
  }

  if (entry.type === "exchange") {
    if (!recovery.userId || !recovery.packageId) return { state: "AMBIGUOUS", code: "EXCHANGE_SCOPE_MISSING" };
    const state = await db.actorState(recovery.userId);
    const oldVouchers = new Set(recovery.baselineVoucherIds ?? []);
    const oldLedger = new Set(recovery.baselineLedgerIds ?? []);
    const issued = state.vouchers.filter(voucher => !oldVouchers.has(voucher.id) && voucher.package_id === recovery.packageId);
    const newLedger = state.ledger.filter(row => !oldLedger.has(row.id));
    const newDelta = newLedger.reduce((sum, row) => sum + row.delta, 0);
    const balanceMatches = Number.isSafeInteger(recovery.baselinePoints)
      && state.user.points_balance === recovery.baselinePoints + newDelta;
    if (issued.length === 1 && balanceMatches
      && newLedger.some(row => row.voucher_id === issued[0].id && row.delta < 0)) {
      return { state: "APPLIED", voucherId: issued[0].id };
    }
    if (issued.length === 0 && newLedger.length === 0 && state.user.points_balance === recovery.baselinePoints) {
      return { state: "AMBIGUOUS", code: "EXCHANGE_NOT_YET_OBSERVED" };
    }
    return { state: "AMBIGUOUS", code: "EXCHANGE_STATE_INCONSISTENT" };
  }

  if (["cancel", "confirm", "status"].includes(entry.type)) {
    if (!recovery.orderId || !recovery.targetStatus) return { state: "AMBIGUOUS", code: "ORDER_TRANSITION_SCOPE_MISSING" };
    const order = await db.order(recovery.orderId);
    if (!order) return { state: "AMBIGUOUS", code: "ORDER_NOT_FOUND" };
    if (order.status === recovery.targetStatus) return { state: "APPLIED", orderId: order.id, orderStatus: order.status };
    if ((recovery.sourceStatuses ?? []).includes(order.status)) return { state: "AMBIGUOUS", code: "TRANSITION_NOT_YET_OBSERVED" };
    return { state: "AMBIGUOUS", code: "ORDER_TRANSITION_DIVERGED" };
  }

  if (entry.type === "login") {
    if (!recovery.userId) return { state: "AMBIGUOUS", code: "SESSION_SCOPE_MISSING" };
    const state = await db.actorState(recovery.userId);
    const baseline = new Set(recovery.baselineSessionIds ?? []);
    const created = state.sessions.filter(session => !baseline.has(session.id));
    if (created.length === 0) return { state: "AMBIGUOUS", code: "LOGIN_NOT_YET_OBSERVED" };
    if (created.length === 1) return { state: "APPLIED", sessionId: created[0].id };
    return { state: "AMBIGUOUS", code: "MULTIPLE_NEW_SESSIONS" };
  }

  if (entry.type === "logout") {
    if (!recovery.sessionId) return { state: "AMBIGUOUS", code: "SESSION_SCOPE_MISSING" };
    const session = await db.sessionById(recovery.sessionId);
    return { state: session ? "AMBIGUOUS" : "APPLIED", sessionId: recovery.sessionId };
  }

  return { state: "AMBIGUOUS", code: "RECOVERY_TYPE_UNSUPPORTED" };
}
