import { loginActor, logoutActor } from "../actors.mjs";
import { fingerprint } from "../database.mjs";
import { invariant } from "../errors.mjs";
import { mutateOnce } from "../operations.mjs";
import { selectVoucherCase } from "./full-cases.mjs";

const lifecycle = { login: loginActor, logout: logoutActor };

function active(voucher) {
  const now = Date.now() + 120_000;
  return voucher.status === "ACTIVE"
    && (!voucher.expires_at || new Date(voucher.expires_at).getTime() > now)
    && (!voucher.package?.ends_at || new Date(voucher.package.ends_at).getTime() > now);
}

/** Run cross-customer voucher ownership checks without consuming a voucher. */
export async function runVoucherAuthorization(ctx) {
  const stateA = ctx.actorStates?.customerA;
  const stateB = ctx.actorStates?.customerB;
  if (!stateA?.user?.id || stateA.user.role !== "CUSTOMER" || !stateB?.user?.id || stateB.user.role !== "CUSTOMER"
    || stateA.user.id === stateB.user.id || !ctx.credentials?.customerA?.phone || !ctx.credentials.customerA.password) {
    return { status: "PARTIAL", code: "AUTHORIZATION_ACTOR_UNAVAILABLE", cases: [] };
  }
  const baselineA = structuredClone(await ctx.db.actorState(stateA.user.id));
  const baselineB = structuredClone(await ctx.db.actorState(stateB.user.id));
  let selected;
  for (const voucher of baselineB.vouchers.filter(item => active(item)
    && ["DISCOUNT", "PRODUCT", "PRODUCT_DISCOUNT", "ADDON", "ITEM"].includes(item.voucher_type))) {
    try {
      selected = { voucher, pickupCase: selectVoucherCase({ catalog: ctx.catalog, runId: ctx.runId,
        caseId: "cross-customer-voucher", voucher }) };
      break;
    } catch (error) {
      if (error.status !== "PARTIAL") throw error;
    }
  }
  if (!selected) return { status: "PARTIAL", code: "AUTHORIZATION_ELIGIBLE_VOUCHER_MISSING",
    cases: [{ id: "authorization-cross-customer-voucher", status: "PARTIAL", code: "AUTHORIZATION_ELIGIBLE_VOUCHER_MISSING" }] };

  const actors = ctx.actorLifecycle ?? lifecycle;
  const { marker, payload } = selected.pickupCase;
  let actor;
  let failure;
  let recoveryRequired = false;
  let markerOwned = false;
  try {
    await ctx.pacer.reserve(stateA.user.id, 1, 120_000);
    actor = await actors.login({ origin: ctx.origin, name: "customerA", credential: ctx.credentials.customerA,
      expectedUserId: stateA.user.id, runDir: ctx.runDir, fetchImpl: ctx.fetchImpl, journal: ctx.journal, db: ctx.db,
      baselineSessionIds: baselineA.sessions.map(session => session.id) });
    if (actor.sessionId) ctx.runState?.addSession("customerA", actor.sessionId);
    invariant((await ctx.db.ordersByMarkers([marker])).length === 0, "CROSS_CUSTOMER_MARKER_COLLISION");
    ctx.runState?.addMarker(marker);
    ctx.runState?.addVoucher(selected.voucher.id);
    markerOwned = true;
    const beforeA = await ctx.db.actorState(stateA.user.id);
    const beforeB = await ctx.db.actorState(stateB.user.id);
    const response = await mutateOnce({ journal: ctx.journal, type: "create", recovery: { actor: "customerA",
      userId: stateA.user.id, marker, orderId: null, voucherId: selected.voucher.id,
      sourceStatuses: ["ABSENT"], targetStatus: "REJECTED", expectedRejection: true },
    send: () => actor.api.request("/api/orders", { method: "POST", body: payload, mutation: true, timeoutMs: 30_000 }),
    isKnownNotApplied: current => current.status === 404 && current.body?.code === "NOT_FOUND",
    reconcile: async current => current && (await ctx.db.ordersByMarkers([marker])).length === 0
      && fingerprint(await ctx.db.actorState(stateA.user.id)) === fingerprint(beforeA)
      && fingerprint(await ctx.db.actorState(stateB.user.id)) === fingerprint(beforeB) ? "NOT_APPLIED" : "AMBIGUOUS",
    });
    invariant(response.status === 404 && response.body?.code === "NOT_FOUND", "CROSS_CUSTOMER_VOUCHER_NOT_REJECTED");
    invariant((await ctx.db.ordersByMarkers([marker])).length === 0, "CROSS_CUSTOMER_ORDER_PERSISTED");
    invariant(fingerprint(await ctx.db.actorState(stateA.user.id)) === fingerprint(beforeA)
      && fingerprint(await ctx.db.actorState(stateB.user.id)) === fingerprint(beforeB), "CROSS_CUSTOMER_STATE_CHANGED");
  } catch (error) { failure = error; }
  if (failure && /AMBIGUOUS/.test(failure.code ?? "")) throw failure;
  try {
    const matches = markerOwned ? await ctx.db.ordersByMarkers([marker]) : [];
    invariant(matches.length <= 1, "CROSS_CUSTOMER_MARKER_COLLISION");
    if (markerOwned && matches[0] && !["CANCELLED", "COMPLETED"].includes(matches[0].status)) {
      invariant(actor && matches[0].user_id === stateA.user.id, "CROSS_CUSTOMER_RECOVERY_SCOPE_INVALID");
      const response = await mutateOnce({ journal: ctx.journal, type: "cancel", recovery: { actor: "customerA",
        userId: stateA.user.id, marker, orderId: matches[0].id, sourceStatuses: [matches[0].status], targetStatus: "CANCELLED" },
      send: () => actor.api.request(`/api/orders/${matches[0].id}`, { method: "PATCH", body: { status: "CANCELLED" }, mutation: true }),
      reconcile: async () => (await ctx.db.ordersByMarkers([marker]))[0]?.status === "CANCELLED" ? "APPLIED" : "AMBIGUOUS" });
      invariant(response.ok && (await ctx.db.ordersByMarkers([marker]))[0]?.status === "CANCELLED", "CROSS_CUSTOMER_RECOVERY_FAILED");
    }
    if (actor) await actors.logout(actor, ctx.db, ctx.runDir, ctx.journal);
    invariant(fingerprint(await ctx.db.actorState(stateA.user.id)) === fingerprint(baselineA), "CROSS_CUSTOMER_A_NOT_RESTORED");
    invariant(fingerprint(await ctx.db.actorState(stateB.user.id)) === fingerprint(baselineB), "CROSS_CUSTOMER_B_NOT_RESTORED");
    invariant((await ctx.db.catalog()).fingerprint === ctx.catalog.fingerprint, "CATALOG_CHANGED");
  } catch (error) { failure = error; recoveryRequired = true; }
  if (failure) return { status: "FAIL", code: failure.code ?? "AUTHORIZATION_FAILED", cases: [], recoveryRequired };
  return { status: "PASS", cases: [{ id: "authorization-cross-customer-voucher", status: "PASS" }],
    summary: { rejectedAttempts: 1 } };
}
