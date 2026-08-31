import { loginActor, logoutActor } from "../actors.mjs";
import { fingerprint } from "../database.mjs";
import { invariant, prerequisite } from "../errors.mjs";
import { mutateOnce } from "../operations.mjs";
import { selectVoucherCase } from "./full-cases.mjs";
import { cancelVerifiedPickup } from "./order.mjs";

const supported = new Set(["DISCOUNT", "PRODUCT", "PRODUCT_DISCOUNT", "ADDON", "ITEM"]);
const lifecycle = { login: loginActor, logout: logoutActor };

/** Compete exactly two customer requests for one real ACTIVE voucher. */
export async function runVoucherConcurrency(ctx) {
  const userId = ctx.customerState?.user?.id;
  prerequisite(userId && ctx.customerState.user.role === "CUSTOMER", "CONCURRENCY_CUSTOMER_INVALID");
  prerequisite(!(ctx.customerState.orders ?? []).length, "CONCURRENCY_PREEXISTING_ORDER");
  prerequisite(typeof ctx.pacer?.reserve === "function", "CONCURRENCY_PACER_MISSING");
  const baseline = structuredClone(await ctx.db.actorState(userId));
  const voucher = baseline.vouchers.find(item => supported.has(item.voucher_type) && item.status === "ACTIVE"
    && (!item.expires_at || new Date(item.expires_at).getTime() > Date.now() + 180_000)
    && (!item.package?.ends_at || new Date(item.package.ends_at).getTime() > Date.now() + 180_000));
  if (!voucher) return { status: "PARTIAL", code: "CONCURRENCY_ACTIVE_VOUCHER_MISSING", cases: [] };
  let cases;
  try {
    cases = ["voucher-race-a", "voucher-race-b"].map(caseId =>
      selectVoucherCase({ catalog: ctx.catalog, runId: ctx.runId, caseId, voucher }));
  } catch (error) {
    if (error.status === "PARTIAL") return { status: "PARTIAL", code: error.code, cases: [] };
    throw error;
  }
  const actorLifecycle = ctx.actorLifecycle ?? lifecycle;
  let actor;
  let failure;
  let winner;
  let ownershipEstablished = false;
  const attempt = selected => mutateOnce({ journal: ctx.journal, type: "create",
    recovery: { actor: "customerB", userId, marker: selected.marker, baselineOrderIds: [],
      sourceStatuses: ["ABSENT"], targetStatus: "PENDING", voucherId: voucher.id },
    send: () => actor.api.request("/api/orders", { method: "POST", body: selected.payload, mutation: true, timeoutMs: 30_000 }),
    isKnownNotApplied: response => response.status === 422 && response.body?.code === "CONFLICT",
    reconcile: async response => {
      const matches = await ctx.db.ordersByMarkers([selected.marker]);
      if (matches.length === 1 && matches[0].user_id === userId) return { state: "APPLIED", data: { id: matches[0].id } };
      if (matches.length === 0 && response?.status === 422 && response.body?.code === "CONFLICT") return "NOT_APPLIED";
      return "AMBIGUOUS";
    },
  });
  try {
    actor = await actorLifecycle.login({ origin: ctx.origin, name: "customerB", credential: ctx.credential,
      expectedUserId: userId, runDir: ctx.runDir, fetchImpl: ctx.fetchImpl, journal: ctx.journal, db: ctx.db,
      baselineSessionIds: baseline.sessions.map(session => session.id) });
    if (actor.sessionId) ctx.runState?.addSession("customerB", actor.sessionId);
    await ctx.pacer.reserve(userId, 2, 180_000);
    const markerBaselines = await ctx.db.ordersByMarkers(cases.map(item => item.marker));
    invariant(markerBaselines.length === 0, "CONCURRENCY_MARKER_COLLISION");
    ctx.runState?.addVoucher(voucher.id);
    for (const selected of cases) ctx.runState?.addMarker(selected.marker);
    ownershipEstablished = true;
    const settled = await Promise.allSettled(cases.map(attempt));
    const rejected = settled.find(result => result.status === "rejected");
    if (rejected) throw rejected.reason;
    const responses = settled.map(result => result.value);
    invariant(responses.filter(response => response.ok && (response.status === 201 || response.recovered)).length === 1,
      "CONCURRENCY_WINNER_COUNT_INVALID");
    invariant(responses.filter(response => response.status === 422 && response.body?.code === "CONFLICT").length === 1,
      "CONCURRENCY_LOSER_CONTRACT_INVALID");
    const orders = await ctx.db.ordersByMarkers(cases.map(item => item.marker));
    invariant(orders.length === 1 && orders[0].user_id === userId && orders[0].status === "PENDING",
      "CONCURRENCY_ORDER_COUNT_INVALID");
    winner = orders[0];
    const [storedVoucher] = await ctx.db.vouchers([voucher.id]);
    const uses = await ctx.db.activeUses([voucher.id]);
    invariant(storedVoucher?.status === "RESERVED" && uses.length === 1 && uses[0].id === winner.id,
      "CONCURRENCY_RESERVATION_INVALID");
    await cancelVerifiedPickup({ actor, actorName: "customerB", userId, db: ctx.db, journal: ctx.journal,
      marker: winner.note, orderId: winner.id, voucher });
  } catch (error) { failure = error; }
  if (failure && /AMBIGUOUS/.test(failure.code ?? "")) throw failure;
  try {
    if (actor && ownershipEstablished && !winner) {
      const candidates = await ctx.db.ordersByMarkers(cases.map(item => item.marker));
      invariant(candidates.length <= 1, "CONCURRENCY_CLEANUP_SCOPE_INVALID");
      if (candidates.length === 1) {
        invariant(candidates[0].user_id === userId && cases.some(item => item.marker === candidates[0].note),
          "CONCURRENCY_CLEANUP_SCOPE_INVALID");
        winner = candidates[0];
      }
    }
    if (actor && winner && (await ctx.db.order(winner.id))?.status === "PENDING") {
      await cancelVerifiedPickup({ actor, actorName: "customerB", userId, db: ctx.db, journal: ctx.journal,
        marker: winner.note, orderId: winner.id, voucher });
    }
    if (actor) await actorLifecycle.logout(actor, ctx.db, ctx.runDir, ctx.journal);
    const final = await ctx.db.actorState(userId);
    invariant(fingerprint(final.sessions) === fingerprint(baseline.sessions), "CONCURRENCY_SESSION_CHANGED");
    invariant(final.user.points_balance === baseline.user.points_balance
      && fingerprint(final.ledger) === fingerprint(baseline.ledger), "CONCURRENCY_POINTS_CHANGED");
    invariant(fingerprint(final.vouchers) === fingerprint(baseline.vouchers), "CONCURRENCY_VOUCHER_NOT_RESTORED");
    if (ownershipEstablished) {
      const retained = await ctx.db.ordersByMarkers(cases.map(item => item.marker));
      invariant(winner ? retained.length === 1 && retained[0].id === winner.id && retained[0].status === "CANCELLED"
        : retained.length === 0, "CONCURRENCY_TERMINAL_AUDIT_INVALID");
    }
    invariant((await ctx.db.catalog()).fingerprint === ctx.catalog.fingerprint, "CATALOG_CHANGED");
  } catch (error) { failure = error; }
  if (failure) return { status: failure.status === "PARTIAL" ? "PARTIAL" : "FAIL",
    code: failure.code ?? "CONCURRENCY_FAILED", cases: [], recoveryRequired: Boolean(winner) };
  return { status: "PASS", cases: [{ id: "concurrent-voucher-orders", status: "PASS" }],
    summary: { contenders: 2, winners: 1 } };
}
