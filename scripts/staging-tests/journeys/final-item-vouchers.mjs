import { loginActor, logoutActor } from "../actors.mjs";
import { fingerprint } from "../database.mjs";
import { invariant, prerequisite } from "../errors.mjs";
import { mutateOnce } from "../operations.mjs";
import { quoteLine } from "../oracle.mjs";
import { selectVoucherCase } from "./full-cases.mjs";
import { createVerifiedPickup } from "./order.mjs";

const ACTORS = [["customerB", "CUSTOMER"], ["admin", "ADMIN"], ["staff", "STAFF"]];
const ambiguous = error => /AMBIGUOUS/.test(error?.code ?? "");
const equal = (left, right) => fingerprint(left) === fingerprint(right);
const asset = state => ({ user: state.user, vouchers: state.vouchers, ledger: state.ledger, grants: state.grants });
const business = voucher => Object.fromEntries(Object.entries(voucher).filter(([key]) =>
  !["status", "used_channel", "redeemed_at", "redeemed_by"].includes(key)));
const usable = (voucher, now) => voucher?.status === "ACTIVE" && voucher.qr_token
  && (!voucher.expires_at || Date.parse(voucher.expires_at) > now + 300_000)
  && (!voucher.package?.ends_at || Date.parse(voucher.package.ends_at) > now + 300_000);
function snapshot(order) {
  return { order_type: order.order_type, subtotal_vnd: order.subtotal_vnd, total_vnd: order.total_vnd,
    total_voucher_discount_vnd: order.total_voucher_discount_vnd, shipping_fee_vnd: order.shipping_fee_vnd,
    freeship_discount_vnd: order.freeship_discount_vnd, grand_total_vnd: order.grand_total_vnd,
    items: order.items.map(item => ({ menu_item_id: item.menu_item_id, size: item.size ?? null, quantity: item.quantity,
      unit_price_vnd: item.unit_price_vnd, addons_price_vnd: item.addons_price_vnd,
      selected_powder_id: item.selected_powder_id ?? null, selected_milk_type_id: item.selected_milk_type_id ?? null,
      base_liquid_ml: item.base_liquid_ml ?? null, sweetness: item.sweetness, ice_option: item.ice_option,
      coldwhisk: item.coldwhisk, note: item.note, product_voucher_discount_vnd: item.product_voucher_discount_vnd,
      total_discount_vnd: item.total_discount_vnd, addons: item.addons.map(addon => ({
        addon_option_id: addon.addon_option_id, quantity: addon.quantity, unit_price_vnd: addon.unit_price_vnd })) })) };
}
function links(order) {
  return { freeship: order.freeship_voucher_id ?? null, discount: order.discountVouchers ?? [], bundle: order.bundleApplications ?? [],
    items: order.items.map(item => ({ product: item.product_voucher_id ?? null, item: item.item_voucher_id ?? null,
      addons: item.addonVouchers ?? [] })) };
}

/** Complete supported existing item-level vouchers through the online order lifecycle. */
export async function runFinalItemVoucherLifecycles(ctx) {
  const cases = [];
  const { db, journal, runState } = ctx;
  const clock = () => ctx.now?.() ?? Date.now();
  const lifecycle = ctx.actorLifecycle ?? { login: loginActor, logout: logoutActor };
  const baseline = {};
  const expected = {};
  const actors = {};
  const audits = [];
  let active;
  let failure;
  let recoveryRequired = false;
  let pointsAwarded = 0;
  try {
    prerequisite(typeof ctx.pacer?.reserve === "function", "FINAL_ITEM_PACER_MISSING");
    for (const [name, role] of ACTORS) {
      prerequisite(ctx.actorStates?.[name]?.user?.role === role && ctx.credentials?.[name]?.phone
        && ctx.credentials[name].password, "FINAL_ITEM_ACTOR_MISSING");
      baseline[name] = structuredClone(await db.actorState(ctx.actorStates[name].user.id));
      invariant(baseline[name].user.role === role, "FINAL_ITEM_ACTOR_CHANGED");
      expected[name] = structuredClone(baseline[name]);
    }
    prerequisite(new Set(ACTORS.map(([name]) => baseline[name].user.id)).size === 3, "FINAL_ITEM_ACTORS_NOT_DISTINCT");
    prerequisite(!(baseline.customerB.orders ?? []).length, "FINAL_ITEM_PREEXISTING_ORDER");
    const userId = baseline.customerB.user.id;
    for (const type of ["PRODUCT_DISCOUNT", "ADDON", "ITEM"]) {
      const key = type.toLowerCase().replaceAll("_", "-");
      const id = `online-final-${key}-redemption`;
      active = null;
      try {
        invariant(equal(asset(await db.actorState(userId)), asset(expected.customerB)), "FINAL_ITEM_BASELINE_CHANGED");
        let selected;
        let gap;
        for (const voucher of expected.customerB.vouchers.filter(voucher => voucher.voucher_type === type && usable(voucher, clock()))) {
          try { selected = { voucher: structuredClone(voucher), pickupCase: selectVoucherCase({ catalog: ctx.catalog,
            runId: ctx.runId, caseId: `final-${key}`, voucher }) }; break; }
          catch (error) { if (error.status !== "PARTIAL") throw error; gap = error; }
        }
        if (!selected && gap) throw gap;
        prerequisite(selected, `FINAL_ITEM_${type}_VOUCHER_MISSING`);
        await ctx.pacer.reserve(userId, 1, 300_000);
        const [fresh] = await db.vouchers([selected.voucher.id]);
        prerequisite(usable(fresh, clock()), "FINAL_ITEM_VOUCHER_EXPIRES_AFTER_PACING");
        invariant(equal(fresh, selected.voucher) && (await db.catalog()).fingerprint === ctx.catalog.fingerprint,
          "FINAL_ITEM_PREREQUISITE_CHANGED");
        for (const [name] of ACTORS) if (!actors[name]) {
          actors[name] = await lifecycle.login({ origin: ctx.origin, name, credential: ctx.credentials[name],
            expectedUserId: baseline[name].user.id, runDir: ctx.runDir, fetchImpl: ctx.fetchImpl,
            journal, db, baselineSessionIds: baseline[name].sessions.map(session => session.id) });
          if (actors[name].sessionId) runState?.addSession(name, actors[name].sessionId);
        }
        active = { ...selected, before: structuredClone(expected.customerB), id, owned: false };
        await createVerifiedPickup({ actor: actors.customerB, actorName: "customerB", userId, db, journal,
          pickupCase: selected.pickupCase, voucher: selected.voucher,
          runState: { addMarker(marker) { active.owned = true; runState?.addMarker(marker); runState?.addVoucher(selected.voucher.id); } },
          onOrderIdentified(orderId) { active.orderId = orderId; } });
        const initial = await db.order(active.orderId);
        const remaining = [...initial.items];
        for (const input of selected.pickupCase.payload.items) {
          const quote = quoteLine(ctx.catalog, input);
          const index = remaining.findIndex(item => item.menu_item_id === input.menu_item_id && (item.size ?? null) === (input.size ?? null)
            && item.quantity === input.quantity && item.note === input.note);
          const item = remaining.splice(index, 1)[0];
          invariant(index >= 0 && item.unit_price_vnd === quote.drink && item.addons_price_vnd === quote.addons
            && (item.selected_powder_id ?? null) === (quote.powderId ?? null) && (item.selected_milk_type_id ?? null) === (quote.liquidId ?? null)
            && (item.base_liquid_ml ?? null) === (quote.baseLiquidMl ?? null)
            && item.sweetness === input.sweetness && item.ice_option === input.ice_option && item.coldwhisk === input.coldwhisk
            && item.addons.length === quote.addonsDetail.length && quote.addonsDetail.every(addon => item.addons.some(actual =>
              actual.addon_option_id === addon.optionId && actual.quantity === addon.quantity && actual.unit_price_vnd === addon.unitPrice)),
          "FINAL_ITEM_LINE_INVALID");
        }
        const initialLinks = links(initial);
        const applied = initial.items.flatMap(item => [item.product_voucher_id, item.item_voucher_id,
          ...(item.addonVouchers ?? []).map(link => link.voucher_id)]).filter(Boolean);
        invariant(!remaining.length && !initialLinks.freeship && !initialLinks.discount.length && !initialLinks.bundle.length
          && equal(applied, [selected.voucher.id]), "FINAL_ITEM_LINK_INVALID");
        const frozen = snapshot(initial);
        let window;
        let redeemed;
        let payment;
        const inWindow = value => Number.isFinite(Date.parse(value)) && window
          && Date.parse(value) >= window.start - 5_000 && Date.parse(value) <= window.end + 5_000;
        const verify = async (status, complete = false) => {
          const stored = await db.order(active.orderId);
          const response = await actors.customerB.api.request(`/api/orders/${active.orderId}`);
          invariant(stored?.status === status && response.status === 200 && response.body?.data?.status === status
            && stored.user_id === userId && stored.note === selected.pickupCase.marker, "FINAL_ITEM_STATUS_INVALID");
          invariant(equal(snapshot(stored), frozen) && equal(snapshot(response.body.data), frozen)
            && equal(links(stored), initialLinks), "FINAL_ITEM_SNAPSHOT_CHANGED");
          const state = await db.actorState(userId);
          const current = state.vouchers.find(voucher => voucher.id === selected.voucher.id);
          const pending = status === "PENDING";
          invariant(current?.status === (pending ? "RESERVED" : "REDEEMED"), "FINAL_ITEM_VOUCHER_STATUS_INVALID");
          if (pending) invariant(current.used_channel == null && current.redeemed_at == null && current.redeemed_by == null
            && stored.payment_confirmed_at == null && stored.payment_confirmed_by == null, "FINAL_ITEM_RESERVED_METADATA_INVALID");
          else {
            invariant(current.used_channel === "ONLINE" && current.redeemed_by === baseline.admin.user.id && inWindow(current.redeemed_at)
              && stored.payment_confirmed_by === baseline.admin.user.id && inWindow(stored.payment_confirmed_at), "FINAL_ITEM_PAYMENT_METADATA_INVALID");
            const metadata = { by: stored.payment_confirmed_by, at: stored.payment_confirmed_at, method: stored.payment_method };
            invariant((!redeemed || equal(current, redeemed)) && (!payment || equal(metadata, payment)), "FINAL_ITEM_REDEMPTION_CHANGED");
            redeemed = structuredClone(current); payment = structuredClone(metadata);
          }
          const uses = await db.activeUses([selected.voucher.id]);
          invariant(complete ? uses.length === 0 : uses.length === 1 && uses[0].id === active.orderId, "FINAL_ITEM_RESERVATION_INVALID");
          if (["STAFF_DONE", "COMPLETED"].includes(status)) invariant(stored.handled_by === baseline.staff.user.id, "FINAL_ITEM_HANDLER_INVALID");
          const points = complete ? selected.pickupCase.expected.orderPoints : 0;
          invariant(equal(state.user, { ...active.before.user, points_balance: active.before.user.points_balance + points })
            && equal(state.grants, active.before.grants), "FINAL_ITEM_USER_CHANGED");
          for (const old of active.before.ledger) invariant(equal(state.ledger.find(log => log.id === old.id), old), "FINAL_ITEM_OLD_LEDGER_CHANGED");
          const freshLogs = state.ledger.filter(log => !active.before.ledger.some(old => old.id === log.id));
          invariant(points ? freshLogs.length === 1 && freshLogs[0].delta === points && freshLogs[0].reason === "order_complete"
            && freshLogs[0].order_id === active.orderId && freshLogs[0].user_id === userId && freshLogs[0].performed_by === baseline.staff.user.id
            && freshLogs[0].voucher_id == null && freshLogs[0].reversed_log_id == null : freshLogs.length === 0, "FINAL_ITEM_LEDGER_INVALID");
          invariant(state.vouchers.length === active.before.vouchers.length && active.before.vouchers.every(old => {
            const next = state.vouchers.find(voucher => voucher.id === old.id);
            return next && (old.id === selected.voucher.id ? equal(business(next), business(old)) : equal(next, old));
          }), "FINAL_ITEM_OTHER_WALLET_CHANGED");
          if (complete) invariant(stored.points_earned === points, "FINAL_ITEM_POINTS_INVALID");
          return state;
        };
        const transition = async (name, target, confirm = false) => {
          const before = await db.order(active.orderId);
          const path = confirm ? `/api/admin/orders/${active.orderId}/confirm-payment` : `/api/staff/orders/${active.orderId}`;
          const response = await mutateOnce({ journal, type: confirm ? "confirm" : "status",
            recovery: { actor: name, userId, marker: selected.pickupCase.marker, orderId: active.orderId, sourceStatuses: [before.status], targetStatus: target },
            send: async () => { if (confirm) window = { start: clock(), end: Number.NaN };
              try { return await actors[name].api.request(path, { method: "PATCH", body: { status: target }, mutation: true, timeoutMs: 30_000 }); }
              finally { if (confirm) window.end = clock(); } },
            reconcile: async failed => { const after = await db.order(active.orderId);
              return after?.status === target && after.user_id === userId && after.note === selected.pickupCase.marker
                ? "APPLIED" : failed && equal(after, before) ? "NOT_APPLIED" : "AMBIGUOUS"; } });
          invariant(response.ok && (response.recovered || response.body?.data?.status === target), "FINAL_ITEM_TRANSITION_REJECTED");
        };
        await verify("PENDING");
        await transition("admin", "ADMIN_CONFIRMED", true); await verify("ADMIN_CONFIRMED");
        await transition("staff", "STAFF_DONE"); await verify("STAFF_DONE");
        await transition("staff", "COMPLETED");
        const finalActor = structuredClone(await verify("COMPLETED", true));
        const finalOrder = structuredClone(await db.order(active.orderId));
        const replay = await mutateOnce({ journal, type: "status", recovery: { actor: "staff", userId, marker: selected.pickupCase.marker,
          orderId: active.orderId, sourceStatuses: ["COMPLETED"], targetStatus: "COMPLETED", expectedRejection: true },
          send: () => actors.staff.api.request(`/api/staff/orders/${active.orderId}`, { method: "PATCH", body: { status: "COMPLETED" }, mutation: true }),
          reconcile: async failed => failed && equal(await db.order(active.orderId), finalOrder) ? "NOT_APPLIED" : "AMBIGUOUS" });
        invariant(replay.status === 400 && replay.body?.code === "INVALID_TRANSITION" && equal(await db.order(active.orderId), finalOrder)
          && equal(await db.actorState(userId), finalActor), "FINAL_ITEM_REPLAY_CHANGED_STATE");
        expected.customerB = finalActor;
        audits.push(finalOrder); pointsAwarded += selected.pickupCase.expected.orderPoints;
        cases.push({ id, status: "PASS" }); active = null;
      } catch (error) {
        if (ambiguous(error)) throw error;
        cases.push({ id, status: error.status === "PARTIAL" ? "PARTIAL" : "FAIL", code: error.code ?? "FINAL_ITEM_FAILED" });
        if (active?.owned || error.status !== "PARTIAL") throw error;
      }
    }
  } catch (error) { if (ambiguous(error)) throw error; failure = error; }
  try {
    if (active?.owned) {
      const matches = await db.ordersByMarkers([active.pickupCase.marker]);
      invariant(matches.length <= 1, "FINAL_ITEM_CLEANUP_COLLISION");
      const current = matches[0];
      if (current) {
        invariant(current.user_id === baseline.customerB.user.id && current.note === active.pickupCase.marker, "FINAL_ITEM_CLEANUP_SCOPE_INVALID");
        invariant(current.status !== "COMPLETED", "FINAL_ITEM_COMPLETED_ASSETS_UNVERIFIED");
        if (current.status !== "CANCELLED") {
          const response = await mutateOnce({ journal, type: "cancel", recovery: { actor: "admin", userId: current.user_id,
            marker: current.note, orderId: current.id, sourceStatuses: [current.status], targetStatus: "CANCELLED" },
            send: () => actors.admin.api.request(`/api/staff/orders/${current.id}`, { method: "PATCH", body: { status: "CANCELLED" }, mutation: true }),
            reconcile: async failed => { const after = await db.order(current.id);
              return after?.status === "CANCELLED" && after.user_id === current.user_id && after.note === current.note
                ? "APPLIED" : failed && equal(after, current) ? "NOT_APPLIED" : "AMBIGUOUS"; } });
          invariant(response.ok, "FINAL_ITEM_CLEANUP_REJECTED");
        }
        const cancelled = await db.order(current.id);
        invariant(cancelled?.status === "CANCELLED" && !(await db.activeUses([active.voucher.id])).length
          && equal(asset(await db.actorState(current.user_id)), asset(active.before)), "FINAL_ITEM_CANCELLED_ASSETS_CHANGED");
        audits.push(structuredClone(cancelled));
      }
    }
    for (const name of Object.keys(actors).reverse()) await lifecycle.logout(actors[name], db, ctx.runDir, journal);
    for (const [name] of ACTORS) if (baseline[name]) {
      const final = await db.actorState(baseline[name].user.id);
      invariant(equal(asset(final), asset(expected[name])) && equal(final.sessions, baseline[name].sessions), "FINAL_ITEM_FINAL_ASSETS_CHANGED");
    }
    for (const audit of audits) invariant(equal(await db.order(audit.id), audit)
      && (await db.ordersByMarkers([audit.note])).some(row => row.id === audit.id), "FINAL_ITEM_TERMINAL_AUDIT_CHANGED");
    invariant((await db.catalog()).fingerprint === ctx.catalog.fingerprint, "CATALOG_CHANGED");
  } catch (error) { if (ambiguous(error)) throw error; failure = error; recoveryRequired = true; }
  const failureStatus = failure?.status === "PARTIAL" && !active?.owned ? "PARTIAL" : "FAIL";
  const reportedCases = failure && !cases.length && failureStatus === "PARTIAL"
    ? ["product-discount", "addon", "item"].map(key => ({ id: `online-final-${key}-redemption`, status: "PARTIAL", code: failure.code })) : cases;
  return { status: failure ? failureStatus : cases.some(row => row.status === "PARTIAL") ? "PARTIAL" : "PASS", cases: reportedCases,
    ...(failure ? { code: failure.code ?? "FINAL_ITEM_FAILED", recoveryRequired } : {}),
    summary: { ordersCompleted: cases.filter(row => row.status === "PASS").length, pointsAwarded } };
}
