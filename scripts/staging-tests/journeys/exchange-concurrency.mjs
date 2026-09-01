import { loginActor, logoutActor } from "../actors.mjs";
import { fingerprint } from "../database.mjs";
import { invariant, prerequisite } from "../errors.mjs";
import { mutateOnce } from "../operations.mjs";

const lifecycle = { login: loginActor, logout: logoutActor };
const ambiguous = error => /AMBIGUOUS/.test(error?.code ?? "");

/** Compete two exchanges for one finite per-customer package before other voucher acquisitions. */
export async function runExchangeConcurrency(ctx) {
  const userId = ctx.customerState?.user?.id;
  prerequisite(userId && ctx.customerState.user.role === "CUSTOMER", "EXCHANGE_RACE_CUSTOMER_INVALID");
  const now = ctx.now ?? Date.now;
  const baseline = structuredClone(await ctx.db.actorState(userId));
  const candidates = (ctx.plan?.internal?.coverage?.selected ?? []).filter(candidate => candidate.source === "exchange");
  const choice = candidates.find(candidate => {
    const pkg = candidate.package;
    const issued = baseline.vouchers.filter(voucher => voucher.package_id === pkg?.id).length;
    return pkg?.id && Number.isSafeInteger(pkg.points_cost) && pkg.points_cost >= 0
      && Number.isInteger(pkg.max_per_user) && pkg.max_per_user - issued === 1
      && (!pkg.ends_at || new Date(pkg.ends_at).getTime() > now() + 180_000)
      && baseline.user.points_balance >= 2 * pkg.points_cost;
  });
  if (!choice) return { status: "PARTIAL", code: candidates.length
    ? "EXCHANGE_RACE_SINGLE_SLOT_PACKAGE_UNAVAILABLE" : "EXCHANGE_RACE_PACKAGE_UNAVAILABLE", cases: [] };
  const pkg = choice.package;
  const baselineVoucherIds = new Set(baseline.vouchers.map(voucher => voucher.id));
  const baselineLedgerIds = new Set(baseline.ledger.map(log => log.id));
  const actorLifecycle = ctx.actorLifecycle ?? lifecycle;
  let actor;
  let failure;
  const attempt = () => mutateOnce({ journal: ctx.journal, type: "exchange",
    recovery: { actor: "customerB", userId, packageId: pkg.id, voucherType: choice.type,
      baselineVoucherIds: [...baselineVoucherIds], baselineLedgerIds: [...baselineLedgerIds],
      baselinePoints: baseline.user.points_balance },
    send: () => actor.api.request("/api/profile/vouchers/exchange", {
      method: "POST", body: { package_id: pkg.id }, mutation: true, timeoutMs: 30_000,
    }),
    isKnownNotApplied: response => response.status === 409 && response.body?.code === "CONFLICT"
      || response.status === 422 && response.body?.code === "VOUCHER_LIMIT_REACHED",
    reconcile: async response => {
      const state = await ctx.db.actorState(userId);
      const newVouchers = state.vouchers.filter(voucher => !baselineVoucherIds.has(voucher.id));
      const newLogs = state.ledger.filter(log => !baselineLedgerIds.has(log.id));
      if (!newVouchers.length && !newLogs.length && state.user.points_balance === baseline.user.points_balance && response) {
        return "NOT_APPLIED";
      }
      return "AMBIGUOUS";
    },
  });
  try {
    actor = await actorLifecycle.login({ origin: ctx.origin, name: "customerB", credential: ctx.credential,
      expectedUserId: userId, runDir: ctx.runDir, fetchImpl: ctx.fetchImpl, journal: ctx.journal, db: ctx.db,
      baselineSessionIds: baseline.sessions.map(session => session.id) });
    if (actor.sessionId) ctx.runState?.addSession("customerB", actor.sessionId);
    const settled = await Promise.allSettled([attempt(), attempt()]);
    const rejected = settled.find(result => result.status === "rejected");
    if (rejected) throw rejected.reason;
    const responses = settled.map(result => result.value);
    prerequisite(!responses.some(response => response.status === 429), "EXCHANGE_RACE_RATE_LIMITED");
    invariant(responses.filter(response => response.status === 201 && response.ok).length === 1,
      "EXCHANGE_RACE_WINNER_COUNT_INVALID");
    invariant(responses.filter(response => response.status === 409 && response.body?.code === "CONFLICT"
      || response.status === 422 && response.body?.code === "VOUCHER_LIMIT_REACHED").length === 1,
      "EXCHANGE_RACE_LOSER_CONTRACT_INVALID");
  } catch (error) { failure = error; }
  if (ambiguous(failure)) throw failure;
  try {
    if (actor) {
      await actorLifecycle.logout(actor, ctx.db, ctx.runDir, ctx.journal);
      actor = undefined;
    }
    const final = await ctx.db.actorState(userId);
    for (const original of baseline.vouchers) invariant(fingerprint(final.vouchers.find(row => row.id === original.id))
      === fingerprint(original), "EXCHANGE_RACE_BASELINE_VOUCHER_CHANGED");
    for (const original of baseline.ledger) invariant(fingerprint(final.ledger.find(row => row.id === original.id))
      === fingerprint(original), "EXCHANGE_RACE_BASELINE_LEDGER_CHANGED");
    invariant(fingerprint(final.grants) === fingerprint(baseline.grants)
      && fingerprint(final.sessions) === fingerprint(baseline.sessions), "EXCHANGE_RACE_ACTOR_CHANGED");
    const newVouchers = final.vouchers.filter(voucher => !baselineVoucherIds.has(voucher.id));
    const newLogs = final.ledger.filter(log => !baselineLedgerIds.has(log.id));
    if (failure?.status === "PARTIAL" && newVouchers.length === 0 && newLogs.length === 0) {
      invariant(fingerprint(final) === fingerprint(baseline), "EXCHANGE_RACE_UNAPPLIED_STATE_CHANGED");
      invariant((await ctx.db.catalog()).fingerprint === ctx.catalog.fingerprint, "CATALOG_CHANGED");
      return { status: "PARTIAL", code: failure.code, cases: [], recoveryRequired: false };
    }
    invariant(newVouchers.length === 1 && newVouchers[0].package_id === pkg.id
      && newVouchers[0].voucher_type === choice.type && newVouchers[0].status === "ACTIVE",
    "EXCHANGE_RACE_VOUCHER_INVALID");
    invariant(newLogs.length === 1 && newLogs[0].reason === "voucher_purchase"
      && newLogs[0].voucher_id === newVouchers[0].id && Number(newLogs[0].delta) === -pkg.points_cost
      && newLogs[0].user_id === userId && newLogs[0].order_id == null && newLogs[0].reversed_log_id == null,
    "EXCHANGE_RACE_LEDGER_INVALID");
    invariant(final.user.points_balance === baseline.user.points_balance - pkg.points_cost,
      "EXCHANGE_RACE_POINTS_INVALID");
    ctx.runState?.addVoucher(newVouchers[0].id);
    invariant((await ctx.db.catalog()).fingerprint === ctx.catalog.fingerprint, "CATALOG_CHANGED");
  } catch (error) { failure = error; }
  if (failure) return { status: failure.status === "PARTIAL" ? "PARTIAL" : "FAIL",
    code: failure.code ?? "EXCHANGE_RACE_FAILED", cases: [], recoveryRequired: Boolean(actor) };
  return { status: "PASS", cases: [{ id: "concurrent-exchange", status: "PASS" }],
    summary: { contenders: 2, vouchersIssued: 1, pointsSpent: pkg.points_cost } };
}
