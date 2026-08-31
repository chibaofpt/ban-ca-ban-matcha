import { loginActor, logoutActor } from "../actors.mjs";
import { fingerprint } from "../database.mjs";
import { invariant } from "../errors.mjs";
import { AmbiguousMutation } from "../http.mjs";
import { mutateOnce } from "../operations.mjs";
import { quoteLine } from "../oracle.mjs";
import { orderMarker } from "./common.mjs";

const MIN_REMAINING_MS = 45_000;
const assets = state => fingerprint({ user: state.user, ledger: state.ledger, vouchers: state.vouchers, grants: state.grants });
const voucherFingerprint = voucher => fingerprint(voucher);
const scopes = voucher => {
  const mapped = voucher.menuItemScopes?.map(scope => scope.menu_item_id).filter(Boolean) ?? [];
  return mapped.length ? mapped : (voucher.menu_item_id ? [voucher.menu_item_id] : []);
};
const isExpired = (voucher, now) => voucher.status === "EXPIRED"
  || (voucher.status === "ACTIVE" && Date.parse(voucher.expires_at) <= now);

function lineFor(catalog, item, size) {
  const base = { menu_item_id: item.id, quantity: 1, addon_option_ids: [] };
  if (item.category === "extras") return { ...base, client_price_vnd: item.unit_price_vnd };
  const input = { ...base, size: size?.size };
  try {
    const quote = quoteLine(catalog, input);
    return { ...input, client_price_vnd: quote.drink + quote.addons,
      ...(quote.liquidId ? { selected_base_liquid_id: quote.liquidId } : {}),
      ...(item.category === "fusion" ? { selected_powder_id: quote.powderId } : {}) };
  } catch { return null; }
}

function availableLines(catalog) {
  const lines = [];
  for (const item of catalog.items ?? []) {
    if (!item.is_available) continue;
    if (item.category === "extras") {
      const line = lineFor(catalog, item);
      if (Number.isSafeInteger(line?.client_price_vnd) && line.client_price_vnd > 0) lines.push({ item, line });
      continue;
    }
    for (const size of item.sizes ?? []) {
      const line = lineFor(catalog, item, size);
      if (Number.isSafeInteger(line?.client_price_vnd) && line.client_price_vnd > 0) lines.push({ item, size: size.size, line });
    }
  }
  return lines.sort((a, b) => a.line.client_price_vnd - b.line.client_price_vnd || a.item.id.localeCompare(b.item.id));
}

function payloadFor(line, marker, voucher) {
  const item = { ...line, sweetness: "FULL", ice_option: "NORMAL", coldwhisk: false, note: marker };
  const payload = { order_type: "PICKUP", items: [item], discount_voucher_ids: [], note: marker };
  if (voucher.voucher_type === "DISCOUNT") payload.discount_voucher_ids = [voucher.qr_token];
  else item[voucher.voucher_type === "ITEM" ? "item_voucher_id" : "product_voucher_id"] = voucher.qr_token;
  return payload;
}

function selectCases({ catalog, vouchers, now, runId }) {
  const lines = availableLines(catalog);
  const selected = [];
  const minVoucher = vouchers.find(voucher => voucher.voucher_type === "DISCOUNT"
    && voucher.status === "ACTIVE" && !isExpired(voucher, now) && voucher.min_order_vnd > 0
    && lines.some(candidate => candidate.line.client_price_vnd < voucher.min_order_vnd));
  const unsupportedFreeship = vouchers.some(voucher => voucher.voucher_type === "FREESHIP"
    && voucher.status === "ACTIVE" && !isExpired(voucher, now) && voucher.min_order_vnd > 0);
  const below = minVoucher && lines.find(candidate => candidate.line.client_price_vnd < minVoucher.min_order_vnd);
  selected.push(minVoucher && below
    ? { name: "min-order", voucher: minVoucher, line: below.line, expectedStatus: 400, expectedCode: "MIN_ORDER_NOT_MET" }
    : { name: "min-order", gap: unsupportedFreeship
      ? "ELIGIBILITY_FREESHIP_DELIVERY_CONTEXT_UNSUPPORTED" : "ELIGIBILITY_MIN_ORDER_DATA_MISSING" });

  const scoped = vouchers.find(voucher => ["PRODUCT", "ITEM", "PRODUCT_DISCOUNT"].includes(voucher.voucher_type)
    && voucher.status === "ACTIVE" && !isExpired(voucher, now) && scopes(voucher).length > 0
    && lines.some(candidate => !scopes(voucher).includes(candidate.item.id)
      && (voucher.voucher_type === "ITEM" ? candidate.item.category === "extras" : candidate.item.category !== "extras")));
  const wrong = scoped && lines.find(candidate => !scopes(scoped).includes(candidate.item.id)
    && (scoped.voucher_type === "ITEM" ? candidate.item.category === "extras" : candidate.item.category !== "extras"));
  selected.push(scoped && wrong
    ? { name: "wrong-item", voucher: scoped, line: wrong.line, expectedStatus: 400, expectedCode: "VALIDATION_ERROR" }
    : { name: "wrong-item", gap: "ELIGIBILITY_WRONG_ITEM_DATA_MISSING" });

  const sized = vouchers.find(voucher => voucher.voucher_type === "PRODUCT_DISCOUNT" && voucher.status === "ACTIVE"
    && !isExpired(voucher, now) && Array.isArray(voucher.eligible_sizes) && voucher.eligible_sizes.length > 0
    && lines.some(candidate => scopes(voucher).includes(candidate.item.id)
      && candidate.size && !voucher.eligible_sizes.includes(candidate.size)));
  const wrongSize = sized && lines.find(candidate => scopes(sized).includes(candidate.item.id)
    && candidate.size && !sized.eligible_sizes.includes(candidate.size));
  selected.push(sized && wrongSize
    ? { name: "wrong-size", voucher: sized, line: wrongSize.line, expectedStatus: 400, expectedCode: "VALIDATION_ERROR" }
    : { name: "wrong-size", gap: "ELIGIBILITY_WRONG_SIZE_DATA_MISSING" });

  const expired = vouchers.find(voucher => isExpired(voucher, now) && ["DISCOUNT", "PRODUCT", "ITEM", "PRODUCT_DISCOUNT"].includes(voucher.voucher_type)
    && lines.some(candidate => voucher.voucher_type === "DISCOUNT" || (scopes(voucher).includes(candidate.item.id)
      && (voucher.voucher_type !== "PRODUCT_DISCOUNT" || voucher.eligible_sizes?.includes(candidate.size)))));
  const expiredLine = expired && (expired.voucher_type === "DISCOUNT" ? lines[0]
    : lines.find(candidate => scopes(expired).includes(candidate.item.id)
      && (expired.voucher_type !== "PRODUCT_DISCOUNT" || expired.eligible_sizes?.includes(candidate.size))));
  selected.push(expired && expiredLine
    ? { name: "expired", voucher: expired, line: expiredLine.line, expectedStatus: 422, expectedCode: "VOUCHER_EXPIRED" }
    : { name: "expired", gap: "ELIGIBILITY_EXPIRED_DATA_MISSING" });
  return selected.map(item => ({ ...item, marker: orderMarker(runId, `elig-${item.name}`) }));
}

async function exactEvidence(db, userId, voucher, marker) {
  const [state, orders, stored, uses] = await Promise.all([
    db.actorState(userId), db.ordersByMarkers([marker]), db.vouchers([voucher.id]), db.activeUses([voucher.id]),
  ]);
  return { state, orders, voucher: stored[0], uses };
}

function stillValidAfterPacing(selected, voucher, currentTime) {
  if (selected.name === "expired") return isExpired(voucher, currentTime);
  if (voucher.status !== "ACTIVE" || isExpired(voucher, currentTime)) return false;
  if (selected.name === "min-order") return voucher.voucher_type === "DISCOUNT"
    && voucher.min_order_vnd > selected.line.client_price_vnd;
  if (selected.name === "wrong-item") return scopes(voucher).length > 0
    && !scopes(voucher).includes(selected.line.menu_item_id);
  if (selected.name === "wrong-size") return voucher.voucher_type === "PRODUCT_DISCOUNT"
    && scopes(voucher).includes(selected.line.menu_item_id)
    && Array.isArray(voucher.eligible_sizes) && !voucher.eligible_sizes.includes(selected.line.size);
  return false;
}

/** Run rejected voucher eligibility cases against one existing staging customer. */
export async function runVoucherEligibilityJourney(ctx) {
  const customerName = ctx.customerName ?? "customerB";
  const baseline = structuredClone(ctx.actorStates?.[customerName]);
  if (baseline?.user?.role !== "CUSTOMER") return { status: "PARTIAL", code: "ELIGIBILITY_ACTOR_UNAVAILABLE", cases: [] };
  const userId = baseline.user.id;
  const now = ctx.now ?? Date.now;
  const planned = selectCases({ catalog: ctx.catalog, vouchers: baseline.vouchers ?? [], now: now(), runId: ctx.runId });
  const cases = planned.filter(item => item.gap).map(item => ({ id: `voucher-eligibility-${item.name}`, name: item.name, status: "PARTIAL", code: item.gap }));
  const runnable = planned.filter(item => !item.gap);
  if (!runnable.length) return { status: "PARTIAL", cases, summary: { attempted: 0, rejected: 0 } };
  const lifecycle = ctx.actorLifecycle ?? { login: loginActor, logout: logoutActor };
  let actor;
  let ambiguous = false;
  let recoveryRequired = false;
  let mutationUnsettled = false;
  let failure;
  let attempted = 0;
  let rejected = 0;
  try {
    const currentBaseline = await ctx.db.actorState(userId);
    invariant(assets(currentBaseline) === assets(baseline), "ELIGIBILITY_BASELINE_CHANGED");
    invariant((await ctx.db.catalog()).fingerprint === ctx.catalog.fingerprint, "CATALOG_CHANGED");
    actor = await lifecycle.login({ origin: ctx.origin, name: customerName, credential: ctx.credentials[customerName],
      expectedUserId: userId, runDir: ctx.runDir, fetchImpl: ctx.fetchImpl, journal: ctx.journal, db: ctx.db,
      baselineSessionIds: baseline.sessions.map(session => session.id) });
    if (actor.sessionId) ctx.runState?.addSession?.(customerName, actor.sessionId);
    for (const selected of runnable) {
      const reservation = await ctx.pacer.reserve(userId, 1, MIN_REMAINING_MS);
      const before = await exactEvidence(ctx.db, userId, selected.voucher, selected.marker);
      invariant(before.orders.length === 0, "ELIGIBILITY_MARKER_COLLISION");
      invariant(voucherFingerprint(before.voucher) === voucherFingerprint(selected.voucher), "ELIGIBILITY_VOUCHER_CHANGED");
      invariant(assets(before.state) === assets(baseline), "ELIGIBILITY_ACTOR_CHANGED_BEFORE_REQUEST");
      invariant(before.uses.length === 0, "ELIGIBILITY_VOUCHER_ALREADY_IN_USE");
      invariant((await ctx.db.catalog()).fingerprint === ctx.catalog.fingerprint, "CATALOG_CHANGED");
      const currentTime = now();
      if (!stillValidAfterPacing(selected, before.voucher, currentTime)) {
        cases.push({ id: `voucher-eligibility-${selected.name}`, name: selected.name, status: "PARTIAL", code: isExpired(before.voucher, currentTime)
          ? "ELIGIBILITY_VOUCHER_EXPIRED_DURING_PACING" : "ELIGIBILITY_CASE_CHANGED_DURING_PACING" });
        continue;
      }
      ctx.runState?.addMarker?.(selected.marker);
      ctx.runState?.addVoucher?.(selected.voucher.id);
      reservation?.markDispatched?.();
      const payload = payloadFor(selected.line, selected.marker, selected.voucher, selected.name);
      let unobservedNotApplied = false;
      const response = await mutateOnce({ journal: ctx.journal, type: "create",
        recovery: { actor: customerName, marker: selected.marker, userId, baselineOrderIds: [],
          baselineVoucherIds: [selected.voucher.id], orderId: null, sourceStatuses: ["ABSENT"], targetStatus: "REJECTED" },
        send: async () => {
          attempted += 1;
          mutationUnsettled = true;
          return actor.api.request("/api/orders", { method: "POST", body: payload, mutation: true, timeoutMs: 30_000 });
        },
        isKnownNotApplied: reply => reply.status === selected.expectedStatus && reply.body?.code === selected.expectedCode,
        reconcile: async reply => {
          const after = await exactEvidence(ctx.db, userId, selected.voucher, selected.marker);
          if (after.orders.length > 0) return "AMBIGUOUS";
          if (assets(after.state) === assets(baseline) && voucherFingerprint(after.voucher) === voucherFingerprint(selected.voucher)
            && after.uses.length === 0) {
            unobservedNotApplied = !reply;
            mutationUnsettled = false;
            return "NOT_APPLIED";
          }
          return "AMBIGUOUS";
        } }).catch(error => {
          if (!unobservedNotApplied || error.code !== "MUTATION_OUTCOME_AMBIGUOUS") throw error;
          return null;
        });
      if (unobservedNotApplied) {
        cases.push({ id: `voucher-eligibility-${selected.name}`, name: selected.name, status: "PARTIAL", code: "ELIGIBILITY_REJECTION_RESPONSE_UNOBSERVED" });
        continue;
      }
      invariant(response.status === selected.expectedStatus && response.body?.code === selected.expectedCode,
        `ELIGIBILITY_${selected.name.toUpperCase().replaceAll("-", "_")}_REJECTION_MISMATCH`);
      rejected += 1;
      const after = await exactEvidence(ctx.db, userId, selected.voucher, selected.marker);
      invariant(after.orders.length === 0, "ELIGIBILITY_UNEXPECTED_ORDER");
      invariant(assets(after.state) === assets(baseline), "ELIGIBILITY_ACTOR_ASSETS_CHANGED");
      invariant(voucherFingerprint(after.voucher) === voucherFingerprint(selected.voucher), "ELIGIBILITY_VOUCHER_MUTATED");
      invariant(after.uses.length === 0, "ELIGIBILITY_ACTIVE_USE_CREATED");
      mutationUnsettled = false;
      cases.push({ id: `voucher-eligibility-${selected.name}`, name: selected.name, status: "PASS", code: selected.expectedCode });
    }
  } catch (error) {
    ambiguous = error instanceof AmbiguousMutation || /AMBIGUOUS/.test(error?.code ?? "");
    recoveryRequired = ambiguous || mutationUnsettled || /UNEXPECTED_ORDER|ASSETS_CHANGED|VOUCHER_MUTATED|ACTIVE_USE_CREATED/.test(error?.code ?? "");
    if (ambiguous) throw error;
    failure = error;
  } finally {
    if (actor && !recoveryRequired) {
      try { await lifecycle.logout(actor, ctx.db, ctx.runDir, ctx.journal); }
      catch (error) { failure ??= error; recoveryRequired = true; }
    }
  }
  try {
    const finalState = await ctx.db.actorState(userId);
    invariant(fingerprint(finalState.sessions) === fingerprint(baseline.sessions), "ELIGIBILITY_FINAL_SESSIONS_CHANGED");
    invariant(assets(finalState) === assets(baseline), "ELIGIBILITY_FINAL_ASSETS_CHANGED");
    invariant((await ctx.db.catalog()).fingerprint === ctx.catalog.fingerprint, "CATALOG_CHANGED");
  } catch (error) { failure ??= error; recoveryRequired = true; }
  if (failure) return { status: "FAIL", code: failure.code ?? "ELIGIBILITY_FAILED", cases,
    summary: { attempted, rejected },
    recoveryRequired };
  return { status: cases.some(item => item.status === "PARTIAL") ? "PARTIAL" : "PASS", cases,
    summary: { attempted, rejected } };
}
