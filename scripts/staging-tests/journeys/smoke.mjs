import { loginActor, logoutActor } from "../actors.mjs";
import { fingerprint } from "../database.mjs";
import { TestFailure, invariant, prerequisite } from "../errors.mjs";
import { buildPickupCase } from "./common.mjs";
import { cancelVerifiedPickup, createVerifiedPickup } from "./order.mjs";
import { acquireSmokeDiscount, assertDiscountActiveInWallet } from "./voucher.mjs";

const defaultActorLifecycle = { login: loginActor, logout: logoutActor };

function mutationIsAmbiguous(error) {
  return error?.code === "MUTATION_OUTCOME_AMBIGUOUS"
    || error?.code === "MUTATION_SERVER_ERROR_AMBIGUOUS"
    || error?.code === "MUTATION_INVALID_RESPONSE_AMBIGUOUS";
}

async function cleanupKnownMarkers({ actor, actorName, userId, db, journal, knownCases }) {
  for (const known of [...knownCases].reverse()) {
    const matches = await db.ordersByMarkers([known.marker]);
    invariant(matches.length <= 1, "SMOKE_CLEANUP_MARKER_NOT_UNIQUE");
    const order = matches[0];
    if (!order || order.status === "CANCELLED") continue;
    invariant(order.status === "PENDING", "SMOKE_CLEANUP_ORDER_NOT_CANCELLABLE");
    invariant(known.cancelDispatched !== true, "SMOKE_CANCEL_RECOVERY_REQUIRED");
    await cancelVerifiedPickup({
      actor,
      actorName,
      userId,
      db,
      journal,
      marker: known.marker,
      orderId: order.id,
      voucher: known.voucher,
    });
  }
}

async function verifyFinalState({ db, catalog, baseline, userId, markers, orderIds, voucher, exchanged }) {
  const orders = await db.ordersByMarkers(markers);
  invariant(orders.length === markers.length, "SMOKE_FINAL_ORDER_COUNT_MISMATCH");
  invariant(orders.every(order => order.status === "CANCELLED" && order.user_id === userId
    && orderIds.includes(order.id)), "SMOKE_FINAL_ORDER_SCOPE_INVALID");
  invariant((await db.activeUses([voucher.id])).length === 0, "SMOKE_FINAL_RESERVATION_REMAINED");
  const [finalVoucher] = await db.vouchers([voucher.id]);
  invariant(finalVoucher?.status === "ACTIVE", "SMOKE_FINAL_DISCOUNT_NOT_ACTIVE");

  const finalState = await db.actorState(userId);
  const finalVoucherById = new Map(finalState.vouchers.map(item => [item.id, item]));
  for (const originalVoucher of baseline.vouchers) {
    invariant(fingerprint(finalVoucherById.get(originalVoucher.id)) === fingerprint(originalVoucher),
      "SMOKE_BASELINE_VOUCHER_CHANGED");
  }
  invariant(finalState.vouchers.length === baseline.vouchers.length + (exchanged ? 1 : 0),
    "SMOKE_UNEXPECTED_VOUCHER_MUTATION");
  const baselineLedgerIds = new Set(baseline.ledger.map(log => log.id));
  const finalLedgerById = new Map(finalState.ledger.map(log => [log.id, log]));
  for (const log of baseline.ledger) {
    invariant(fingerprint(finalLedgerById.get(log.id)) === fingerprint(log), "SMOKE_BASELINE_LEDGER_CHANGED");
  }
  const newLogs = finalState.ledger.filter(log => !baselineLedgerIds.has(log.id));
  invariant(exchanged
    ? newLogs.length === 1 && newLogs[0].reason === "voucher_purchase" && newLogs[0].voucher_id === voucher.id
    : newLogs.length === 0, "SMOKE_UNEXPECTED_LEDGER_MUTATION");
  const ledgerDelta = newLogs.reduce((sum, log) => sum + Number(log.delta), 0);
  invariant(finalState.user?.points_balance - baseline.user.points_balance === ledgerDelta,
    "SMOKE_POINTS_LEDGER_MISMATCH");
  invariant(fingerprint(finalState.sessions) === fingerprint(baseline.sessions), "SMOKE_SESSION_RECONCILIATION_FAILED");
  const finalCatalog = await db.catalog();
  invariant(finalCatalog.fingerprint === catalog.fingerprint, "CATALOG_CHANGED");
}

/** Execute the approved customer smoke journey against an already verified staging target. */
export async function runSmokeJourney({
  runId,
  runDir,
  journal,
  runState,
  db,
  catalog,
  customerState,
  credential,
  origin,
  plan,
  fetchImpl,
  actorLifecycle = defaultActorLifecycle,
}) {
  const actorName = "customerA";
  const userId = customerState?.actor?.id ?? customerState?.user?.id;
  prerequisite(plan?.status === "PASS" && (plan.gaps ?? []).length === 0, "SMOKE_PREFLIGHT_NOT_CLEAN");
  prerequisite(userId && customerState?.user?.role === "CUSTOMER", "SMOKE_CUSTOMER_ACCOUNT_INVALID");
  prerequisite((customerState.orders ?? []).length === 0, "SMOKE_PREEXISTING_NONTERMINAL_ORDER");
  prerequisite((customerState.recentOrderCount ?? 0) + 3 <= 5, "SMOKE_ORDER_RATE_WINDOW_INSUFFICIENT");
  const baseline = {
    user: structuredClone(customerState.user),
    vouchers: structuredClone(customerState.vouchers ?? []),
    ledger: structuredClone(customerState.ledger ?? []),
    sessions: structuredClone(customerState.sessions ?? []),
  };
  const knownCases = [];
  const createdOrderIds = [];
  let actor;
  let logoutAttempted = false;
  try {
    actor = await actorLifecycle.login({
      origin,
      name: actorName,
      credential,
      expectedUserId: userId,
      runDir,
      fetchImpl,
      journal,
      db,
      baselineSessionIds: baseline.sessions.map(session => session.id),
    });
    if (actor.sessionId) runState?.addSession(actorName, actor.sessionId);

    const plain = buildPickupCase({ catalog, runId, caseId: "plain" });
    const plainKnown = { marker: plain.marker, voucher: null, cancelDispatched: false };
    const plainOrder = await createVerifiedPickup({
      actor, actorName, userId, db, journal, pickupCase: plain,
      runState: { addMarker(marker) { knownCases.push(plainKnown); runState?.addMarker(marker); } },
      onOrderIdentified: orderId => createdOrderIds.push(orderId),
    });
    plainKnown.cancelDispatched = true;
    await cancelVerifiedPickup({ actor, actorName, userId, db, journal, marker: plain.marker,
      orderId: plainOrder.orderId });

    const { voucher, exchanged } = await acquireSmokeDiscount({
      actor, actorName, userId, db, journal, runState, plan,
    });
    const firstDiscount = buildPickupCase({ catalog, runId, caseId: "discount-first", voucher });
    const firstKnown = { marker: firstDiscount.marker, voucher, cancelDispatched: false };
    const firstOrder = await createVerifiedPickup({
      actor, actorName, userId, db, journal, pickupCase: firstDiscount, voucher,
      runState: { addMarker(marker) { knownCases.push(firstKnown); runState?.addMarker(marker); } },
      onOrderIdentified: orderId => createdOrderIds.push(orderId),
    });
    firstKnown.cancelDispatched = true;
    await cancelVerifiedPickup({ actor, actorName, userId, db, journal, marker: firstDiscount.marker,
      orderId: firstOrder.orderId, voucher });
    await assertDiscountActiveInWallet(actor.api, voucher);

    const reusedDiscount = buildPickupCase({ catalog, runId, caseId: "discount-reuse", voucher });
    const reusedKnown = { marker: reusedDiscount.marker, voucher, cancelDispatched: false };
    const reusedOrder = await createVerifiedPickup({
      actor, actorName, userId, db, journal, pickupCase: reusedDiscount, voucher,
      runState: { addMarker(marker) { knownCases.push(reusedKnown); runState?.addMarker(marker); } },
      onOrderIdentified: orderId => createdOrderIds.push(orderId),
    });
    reusedKnown.cancelDispatched = true;
    await cancelVerifiedPickup({ actor, actorName, userId, db, journal, marker: reusedDiscount.marker,
      orderId: reusedOrder.orderId, voucher });
    await assertDiscountActiveInWallet(actor.api, voucher);

    logoutAttempted = true;
    await actorLifecycle.logout(actor, db, runDir, journal);
    actor = null;
    await verifyFinalState({
      db,
      catalog,
      baseline,
      userId,
      markers: knownCases.map(item => item.marker),
      orderIds: createdOrderIds,
      voucher,
      exchanged,
    });
    return {
      status: "PASS",
      cases: [
        { id: "plain-pickup-cancel", status: "PASS" },
        { id: "discount-cancel-reuse-cancel", status: "PASS" },
      ],
      summary: { ordersCreated: 3, discountBenefitsVerified: 2, exchanged },
    };
  } catch (error) {
    if (!actor || logoutAttempted || mutationIsAmbiguous(error)) throw error;
    try {
      await cleanupKnownMarkers({ actor, actorName, userId, db, journal, knownCases });
    } catch (cleanupError) {
      if (mutationIsAmbiguous(cleanupError)) throw cleanupError;
      throw new TestFailure("SMOKE_CLEANUP_FAILED");
    }
    logoutAttempted = true;
    await actorLifecycle.logout(actor, db, runDir, journal);
    throw error;
  }
}
