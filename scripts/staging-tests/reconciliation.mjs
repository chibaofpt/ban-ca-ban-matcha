import { fingerprint } from "./database.mjs";

const TERMINAL = new Set(["CANCELLED", "COMPLETED"]);

const rowMap = rows => new Map(rows.map(row => [row.id, row]));

/** Capture only immutable audit identifiers and balances needed after a live run. */
export function actorBaseline(state) {
  return {
    pointsBalance: state.user.points_balance,
    ledger: state.ledger,
    sessionIds: state.sessions.map(session => session.id),
  };
}

/** Evaluate final live state without deleting retained orders or immutable ledger rows. */
export function evaluateFinalState({
  baseline, current, runSessionIds = /** @type {string[]} */ ([]), orders, activeUses,
  initialCatalogFingerprint, finalCatalogFingerprint, now = Date.now,
}) {
  const failures = [];
  const currentLedger = rowMap(current.ledger);
  const baselineIds = new Set(baseline.ledger.map(row => row.id));

  if (baseline.ledger.some(row => !currentLedger.has(row.id)
    || fingerprint(currentLedger.get(row.id)) !== fingerprint(row))) {
    failures.push("BASELINE_LEDGER_CHANGED");
  }

  const newLedgerDelta = current.ledger
    .filter(row => !baselineIds.has(row.id))
    .reduce((sum, row) => sum + row.delta, 0);
  if (current.pointsBalance !== baseline.pointsBalance + newLedgerDelta) {
    failures.push("POINTS_BALANCE_LEDGER_MISMATCH");
  }

  const sessions = current.sessions ?? current.sessionIds.map(id => ({ id, expires_at: null }));
  const currentSessions = new Set(sessions.map(session => session.id));
  if (baseline.sessionIds.some(id => !currentSessions.has(id))) failures.push("BASELINE_SESSION_REMOVED");
  if (runSessionIds.some(id => sessions.some(session => session.id === id
    && (!session.expires_at || new Date(session.expires_at).getTime() > now())))) failures.push("RUN_SESSION_REMAINS");
  if (orders.some(order => !TERMINAL.has(order.status))) failures.push("RUN_ORDER_NONTERMINAL");
  if (activeUses.length > 0) failures.push("RUN_VOUCHER_RESERVATION_REMAINS");
  if (initialCatalogFingerprint !== finalCatalogFingerprint) failures.push("CATALOG_CHANGED");

  return { ok: failures.length === 0, failures, newLedgerDelta };
}

/** Read and reconcile exact run-owned records while preserving business audit history. */
export async function reconcileRun({ db, baselines, actorIds, runSessionIds = {}, markers, voucherIds, initialCatalogFingerprint,
  recovery = false, now = Date.now, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), deadline = Infinity }) {
  const [orders, activeUses, finalCatalog, vouchers] = await Promise.all([
    markers.length ? db.ordersByMarkers(markers) : [],
    voucherIds.length ? db.activeUses(voucherIds) : [],
    db.catalog(),
    voucherIds.length ? db.vouchers(voucherIds) : [],
  ]);
  const ownedOrderIds = new Set(orders.map(order => order.id));
  const relevantUses = recovery ? activeUses.filter(order => ownedOrderIds.has(order.id)) : activeUses;
  const failures = [];
  if (voucherIds.some(id => !vouchers.some(voucher => voucher.id === id))) failures.push("RUN_VOUCHER_AUDIT_MISSING");
  for (const voucher of vouchers.filter(voucher => voucher.status === "RESERVED")) {
    // Query each voucher: another voucher's active order is not proof this reservation is valid.
    const uses = await db.activeUses([voucher.id]);
    const laterUse = recovery && uses.length === 1 && !ownedOrderIds.has(uses[0].id);
    if (!laterUse) failures.push(uses.length ? "RUN_VOUCHER_RESERVATION_REMAINS" : "ORPHAN_VOUCHER_RESERVATION");
  }
  const actors = {};
  for (const [name, userId] of Object.entries(actorIds)) {
    let state = await db.actorState(userId);
    const tracked = new Set(runSessionIds[name] ?? []);
    const graceExpiries = state.sessions.filter(session => tracked.has(session.id) && session.expires_at)
      .map(session => new Date(session.expires_at).getTime())
      .filter(expiry => expiry > now() && expiry - now() <= 30_000);
    if (graceExpiries.length) {
      const settleAt = Math.max(...graceExpiries) + 1;
      if (settleAt <= deadline) { await sleep(Math.max(0, settleAt - now())); state = await db.actorState(userId); }
      else failures.push("RUN_SESSION_GRACE_DEADLINE_EXCEEDED");
    }
    actors[name] = evaluateFinalState({
      baseline: baselines[name],
      current: {
        pointsBalance: state.user.points_balance,
        ledger: state.ledger,
        sessionIds: state.sessions.map(session => session.id), sessions: state.sessions,
      },
      runSessionIds: runSessionIds[name] ?? [],
      orders,
      activeUses: relevantUses,
      initialCatalogFingerprint,
      finalCatalogFingerprint: finalCatalog.fingerprint,
      now,
    });
  }
  return { ok: !failures.length && Object.values(actors).every(result => result.ok), failures, actors, orderCount: orders.length, activeUseCount: relevantUses.length };
}
