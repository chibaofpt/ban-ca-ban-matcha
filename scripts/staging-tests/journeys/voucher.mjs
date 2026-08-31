import { invariant, prerequisite } from "../errors.mjs";
import { mutateOnce } from "../operations.mjs";

function isEffectivelyActive(voucher, now = new Date()) {
  return voucher?.status === "ACTIVE"
    && (!voucher.expires_at || new Date(voucher.expires_at) > now)
    && (!voucher.package?.ends_at || new Date(voucher.package.ends_at) > now);
}

async function activeWallet(api) {
  const vouchers = [];
  let cursor = null;
  for (let page = 0; page < 20; page += 1) {
    const path = `/api/profile/vouchers?limit=50&status=ACTIVE${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    const response = await api.request(path);
    invariant(response.status === 200 && Array.isArray(response.body?.data), "SMOKE_WALLET_READ_FAILED");
    vouchers.push(...response.body.data);
    if (!response.body?.meta?.has_more) return vouchers;
    cursor = response.body?.meta?.next_cursor;
    invariant(typeof cursor === "string" && cursor.length > 0, "SMOKE_WALLET_CURSOR_INVALID");
  }
  invariant(false, "SMOKE_WALLET_PAGE_LIMIT");
}

/** Prove that one selected voucher is currently visible and ACTIVE through the public wallet. */
export async function assertDiscountActiveInWallet(api, voucher) {
  const wallet = await activeWallet(api);
  const publicVoucher = wallet.find(candidate => candidate.qr_token === voucher.qr_token);
  invariant(publicVoucher?.status === "ACTIVE" && publicVoucher.voucher_type === voucher.voucher_type,
    "SMOKE_DISCOUNT_NOT_ACTIVE_IN_WALLET");
}

function exchangeApplied(state, baseline, choice) {
  const voucherIds = new Set(baseline.vouchers.map(voucher => voucher.id));
  const ledgerIds = new Set(baseline.ledger.map(log => log.id));
  const vouchers = state.vouchers.filter(voucher => !voucherIds.has(voucher.id)
    && voucher.package_id === choice.package.id && voucher.voucher_type === choice.type);
  if (vouchers.length !== 1) return null;
  const voucher = vouchers[0];
  const purchaseLogs = state.ledger.filter(log => !ledgerIds.has(log.id)
    && log.reason === "voucher_purchase" && log.voucher_id === voucher.id);
  if (purchaseLogs.length !== 1
    || Number(purchaseLogs[0].delta) !== -choice.package.points_cost
    || state.user?.points_balance !== baseline.user.points_balance - choice.package.points_cost) return null;
  return voucher;
}

async function exchangeDiscount({ actor, actorName, userId, db, journal, runState, choice }) {
  const baseline = await db.actorState(userId);
  const baselineVoucherIds = baseline.vouchers.map(voucher => voucher.id);
  const baselineLedgerIds = baseline.ledger.map(log => log.id);
  const response = await mutateOnce({
    journal,
    type: "exchange",
    recovery: {
      actor: actorName,
      marker: null,
      userId,
      packageId: choice.package.id,
      voucherType: choice.type,
      baselineVoucherIds,
      baselineLedgerIds,
      baselinePoints: baseline.user.points_balance,
      orderId: null,
      sourceStatuses: ["ABSENT"],
      targetStatus: "ACTIVE",
    },
    send: () => actor.api.request("/api/profile/vouchers/exchange", {
      method: "POST",
      body: { package_id: choice.package.id },
      mutation: true,
      timeoutMs: 30_000,
    }),
    reconcile: async (failedResponse) => {
      const state = await db.actorState(userId);
      const voucher = exchangeApplied(state, baseline, choice);
      if (voucher) return { state: "APPLIED", data: {
        qr_token: voucher.qr_token,
        voucher_type: voucher.voucher_type,
        status: voucher.status,
        expires_at: voucher.expires_at,
      } };
      const unchanged = state.user?.points_balance === baseline.user.points_balance
        && state.vouchers.length === baselineVoucherIds.length
        && state.ledger.length === baselineLedgerIds.length
        && state.vouchers.every(voucher => baselineVoucherIds.includes(voucher.id))
        && state.ledger.every(log => baselineLedgerIds.includes(log.id));
      if (failedResponse && unchanged) return "NOT_APPLIED";
      return "AMBIGUOUS";
    },
  });
  if (!response.ok) {
    if ([404, 409, 422, 429].includes(response.status)) prerequisite(false, "SMOKE_DISCOUNT_EXCHANGE_UNAVAILABLE");
    invariant(false, "SMOKE_DISCOUNT_EXCHANGE_REJECTED");
  }
  invariant(response.status === 201 || response.recovered === true, "SMOKE_DISCOUNT_EXCHANGE_STATUS_INVALID");
  const state = await db.actorState(userId);
  const voucher = exchangeApplied(state, baseline, choice);
  invariant(voucher && response.body?.data?.qr_token === voucher.qr_token, "SMOKE_DISCOUNT_EXCHANGE_EVIDENCE_INVALID");
  invariant(isEffectivelyActive(voucher), "SMOKE_EXCHANGED_DISCOUNT_NOT_ACTIVE");
  runState?.addVoucher(voucher.id);
  return voucher;
}

/** Resolve one frozen voucher choice, exchanging points only when necessary (DISCOUNT by default).
 * @param {{actor: import('./common.mjs').JourneyActor, actorName: string, userId: string,
 * db: {actorState: (userId: string) => Promise<{user: {points_balance: number}, vouchers: Array<Record<string, unknown>>, ledger: Array<Record<string, unknown>>}>},
 * journal: import('./common.mjs').JourneyJournal, runState?: {addVoucher: (voucherId: string) => unknown},
 * plan: {internal?: {coverage?: {selected?: Array<{type: string, source: string, package?: Record<string, unknown>, voucher?: Record<string, unknown>}>}}},
 * voucherType?: string}} options
 */
export async function acquireSmokeDiscount({ actor, actorName, userId, db, journal, runState, plan, voucherType = "DISCOUNT" }) {
  const choice = plan?.internal?.coverage?.selected?.find(candidate => candidate.type === voucherType);
  prerequisite(choice, "SMOKE_DISCOUNT_COVERAGE_MISSING");
  let voucher;
  let exchanged = false;
  if (choice.source === "existing") {
    const state = await db.actorState(userId);
    voucher = state.vouchers.find(candidate => candidate.id === choice.voucher.id);
    prerequisite(isEffectivelyActive(voucher) && voucher.voucher_type === voucherType,
      "SMOKE_EXISTING_DISCOUNT_UNAVAILABLE");
    runState?.addVoucher(voucher.id);
  } else {
    prerequisite(choice.source === "exchange" && choice.package, "SMOKE_DISCOUNT_CHOICE_INVALID");
    voucher = await exchangeDiscount({ actor, actorName, userId, db, journal, runState, choice });
    exchanged = true;
  }
  await assertDiscountActiveInWallet(actor.api, voucher);
  return { voucher, exchanged };
}
