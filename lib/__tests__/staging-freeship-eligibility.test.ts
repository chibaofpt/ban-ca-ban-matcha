// @vitest-environment node

import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runFreeshipEligibilityJourney } from "../../scripts/staging-tests/journeys/freeship-eligibility.mjs";
import { createJournal } from "../../scripts/staging-tests/journal.mjs";
import { createOrderPacer } from "../../scripts/staging-tests/pacing.mjs";
import { loginActor, logoutActor } from "../../scripts/staging-tests/actors.mjs";
import { prepareLongRunningActor } from "../../scripts/staging-tests/session-renewal.mjs";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

function harness() {
  let time = Date.now();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "freeship-eligibility-"));
  roots.push(root);
  const runId = "freeship1234";
  const journal = createJournal({ fs, rootDir: root, runId, now: () => new Date(time) });
  const user = { id: "customer-b", role: "CUSTOMER", points_balance: 12 };
  const address = { id: "own-address", user_id: user.id, distance_km: 3, lat: 10.8, lng: 106.7,
    receiver_name: "Customer B", receiver_phone: "+84900000000", full_address: "Saved address" };
  const voucher = { id: "ship", qr_token: "qr-ship", user_id: user.id, voucher_type: "FREESHIP",
    status: "ACTIVE", min_order_vnd: 60_000, covered_delivery_fee_vnd: 20_000,
    expires_at: "2099-01-01T00:00:00.000Z" };
  const baseline = { user, ledger: [], grants: [], vouchers: [voucher],
    sessions: [] as Array<{ id: string; user_id: string; expires_at: string }>, addresses: [address] };
  const stored = structuredClone(baseline);
  const sessions: Array<{ id: string; user_id: string; expires_at: string }> = [];
  const orders: Array<Record<string, unknown>> = [];
  const uses: Array<Record<string, unknown>> = [];
  const catalog = { fingerprint: "catalog-1", items: [{ id: "extra", category: "extras", is_available: true,
    unit_price_vnd: 40_000, sizes: [] }], powders: [], liquids: [], defaults: [], addonGroups: [] };
  const calls: Array<{ path: string; body: Record<string, unknown> }> = [];
  const controls = { code: "MIN_ORDER_NOT_MET", status: 400, lost: false, loginFailure: false, logoutFailure: false,
    afterCreate: () => {}, afterPace: () => {} };
  const fetchImpl = async (url: URL, init: RequestInit) => {
    const body = init.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
    calls.push({ path: url.pathname, body });
    if (url.pathname === "/api/auth/login") {
      if (controls.loginFailure) return Response.json({ code: "UNAUTHORIZED" }, { status: 401 });
      sessions.push({ id: "run-session", user_id: user.id, expires_at: "2099-01-01T00:00:00.000Z" });
      return Response.json({ data: { role: "CUSTOMER" } }, { headers: { "set-cookie": "refresh_token=run-token; Path=/" } });
    }
    if (url.pathname === "/api/auth/me") return Response.json({ data: { role: "CUSTOMER" } }, {
      status: sessions.some(session => session.id === "run-session") ? 200 : 401 });
    if (url.pathname === "/api/auth/logout") {
      if (controls.logoutFailure) throw new Error("network lost");
      sessions.splice(sessions.findIndex(session => session.id === "run-session"), 1);
      return Response.json({ data: null });
    }
    if (url.pathname === "/api/orders") {
      expect(entries().some(entry => entry.type === "create" && entry.state === "INTENT")).toBe(true);
      controls.afterCreate();
      if (controls.lost) throw new Error("network lost");
      return Response.json({ code: controls.code }, { status: controls.status });
    }
    throw new Error("Unexpected HTTP route");
  };
  const db = {
    actorState: async () => structuredClone({ ...stored, sessions }),
    actor: async () => structuredClone({ ...stored.user, addresses: stored.addresses }),
    catalog: async () => structuredClone(catalog), vouchers: async () => structuredClone(stored.vouchers),
    ordersByMarkers: async () => structuredClone(orders), activeUses: async () => structuredClone(uses),
    session: async () => sessions.find(session => session.id === "run-session") ?? null,
    sessionById: async (id: string) => sessions.find(session => session.id === id) ?? null,
  };
  const entries = () => fs.readFileSync(path.join(journal.runDir, "journal.ndjson"), "utf8").trim().split("\n")
    .map(line => JSON.parse(line) as { state: string; type: string; evidence?: Record<string, unknown> });
  const markers: string[] = [];
  const pacer = createOrderPacer({ now: () => time, deadline: time + 900_000,
    initialAttempts: { [user.id]: Array.from({ length: 5 }, () => time) },
    sleep: async (ms: number) => { time += ms; controls.afterPace(); } });
  return { ctx: { runId, runDir: journal.runDir, origin: "https://staging.example.test", journal, db, fetchImpl,
    actorStates: { customerB: baseline }, credentials: { customerB: { phone: "+84900000000", password: "password", role: "CUSTOMER" } },
    catalog: structuredClone(catalog), now: () => time, pacer,
    runState: { addMarker: (marker: string) => markers.push(marker), addVoucher: () => {}, addSession: () => {} } },
    calls, controls, stored, catalog, orders, uses, sessions, markers, entries };
}

describe("FREESHIP eligibility — DELIVERY dưới ngưỡng", () => {
  it("quan sát đúng 400 MIN_ORDER_NOT_MET và giữ nguyên tài sản, session", async () => {
    const h = harness();
    const result = await runFreeshipEligibilityJourney(h.ctx);
    expect(result).toMatchObject({ status: "PASS", summary: { attempted: 1, rejected: 1 },
      cases: [{ id: "freeship-min-order-rejection", status: "PASS", code: "MIN_ORDER_NOT_MET" }] });
    expect(h.calls.filter(call => call.path === "/api/orders")).toEqual([{ path: "/api/orders", body: expect.objectContaining({
      order_type: "DELIVERY", address_id: "own-address", client_shipping_fee_vnd: 18_000,
      freeship_voucher_id: "qr-ship", items: [expect.objectContaining({ menu_item_id: "extra", quantity: 1, client_price_vnd: 40_000 })],
    }) }]);
    expect(h.sessions).toEqual([]);
    expect(h.entries().filter(entry => entry.type === "create").map(entry => entry.state)).toEqual(["INTENT", "NOT_APPLIED"]);
  });

  it("sai code không được PASS dù không có order", async () => {
    const h = harness(); h.controls.code = "VALIDATION_ERROR";
    expect(await runFreeshipEligibilityJourney(h.ctx)).toMatchObject({ status: "FAIL",
      code: "FREESHIP_ELIGIBILITY_REJECTION_MISMATCH", summary: { attempted: 1, rejected: 0 } });
    expect(h.sessions).toEqual([]);
  });

  it.each(["order", "use", "assets"])("giữ session khi rejection tạo thay đổi %s", async mode => {
    const h = harness();
    h.controls.afterCreate = () => {
      if (mode === "order") h.orders.push({ id: "unexpected", status: "PENDING" });
      if (mode === "use") h.uses.push({ id: "unexpected" });
      if (mode === "assets") h.stored.user.points_balance = 13;
    };
    expect(await runFreeshipEligibilityJourney(h.ctx)).toMatchObject({ status: "FAIL", recoveryRequired: true });
    expect(h.sessions).toHaveLength(1);
    expect(h.calls.some(call => call.path === "/api/auth/logout")).toBe(false);
    expect(h.calls.filter(call => call.path === "/api/orders")).toHaveLength(1);
  });

  it("mất response đối soát sạch chỉ PARTIAL, không bịa HTTP/code", async () => {
    const h = harness(); h.controls.lost = true;
    expect(await runFreeshipEligibilityJourney(h.ctx)).toMatchObject({ status: "PARTIAL",
      code: "FREESHIP_ELIGIBILITY_REJECTION_RESPONSE_UNOBSERVED", summary: { attempted: 1, rejected: 0 } });
    expect(h.entries().filter(entry => entry.type === "create")).toEqual([
      expect.objectContaining({ state: "INTENT" }),
      expect.objectContaining({ state: "NOT_APPLIED", evidence: { httpStatus: null, code: null } }),
    ]);
    expect(h.sessions).toEqual([]);
    expect(h.calls.filter(call => call.path === "/api/orders")).toHaveLength(1);
  });

  it("mất response có order chưa rõ dừng và giữ cookie phục hồi", async () => {
    const h = harness(); h.controls.lost = true;
    h.controls.afterCreate = () => h.orders.push({ id: "unexpected" });
    await expect(runFreeshipEligibilityJourney(h.ctx)).rejects.toMatchObject({ code: "MUTATION_OUTCOME_AMBIGUOUS" });
    expect(h.sessions).toHaveLength(1);
    expect(fs.existsSync(path.join(h.ctx.runDir, "sessions", "customerB.json"))).toBe(true);
    expect(h.calls.some(call => call.path === "/api/auth/logout")).toBe(false);
    expect(h.calls.filter(call => call.path === "/api/orders")).toHaveLength(1);
  });

  it.each(["address", "distance", "voucher", "basket", "pacer"])("thiếu %s là PARTIAL trước mọi HTTP", async missing => {
    const h = harness();
    if (missing === "address") h.ctx.actorStates.customerB.addresses = [];
    if (missing === "distance") h.ctx.actorStates.customerB.addresses[0].distance_km = Number.NaN;
    if (missing === "voucher") h.ctx.actorStates.customerB.vouchers = [];
    if (missing === "basket") h.ctx.catalog.items[0].unit_price_vnd = 60_000;
    const ctx = missing === "pacer" ? { ...h.ctx, pacer: undefined } : h.ctx;
    expect(await runFreeshipEligibilityJourney(ctx)).toMatchObject({ status: "PARTIAL", summary: { attempted: 0, rejected: 0 } });
    expect(h.calls).toEqual([]);
    expect(h.markers).toEqual([]);
  });

  it("không dùng địa chỉ khách khác dù nó có distance hợp lệ", async () => {
    const h = harness(); h.ctx.actorStates.customerB.addresses[0].user_id = "other-customer";
    expect(await runFreeshipEligibilityJourney(h.ctx)).toMatchObject({ status: "PARTIAL", code: "FREESHIP_ELIGIBILITY_ADDRESS_MISSING" });
    expect(h.calls).toEqual([]);
  });

  it.each(["REDEEMED", "RESERVED", "EXPIRED"])("không gửi voucher FREESHIP %s", async status => {
    const h = harness(); h.ctx.actorStates.customerB.vouchers[0].status = status;
    expect(await runFreeshipEligibilityJourney(h.ctx)).toMatchObject({ status: "PARTIAL", code: "FREESHIP_ELIGIBILITY_VOUCHER_MISSING" });
    expect(h.calls).toEqual([]);
  });

  it("expiry tự nhiên trong pacing là PARTIAL, không login/create/nhận marker", async () => {
    const h = harness();
    const expiry = new Date(h.ctx.now() + 60_000).toISOString();
    h.ctx.actorStates.customerB.vouchers[0].expires_at = expiry;
    h.stored.vouchers[0].expires_at = expiry;
    expect(await runFreeshipEligibilityJourney(h.ctx)).toMatchObject({ status: "PARTIAL",
      code: "FREESHIP_ELIGIBILITY_VOUCHER_EXPIRED_DURING_PACING" });
    expect(h.calls).toEqual([]); expect(h.markers).toEqual([]);
  });

  it.each(["catalog", "address", "threshold"])("%s đổi sau pacing dừng trước dispatch", async mode => {
    const h = harness();
    h.controls.afterPace = () => {
      if (mode === "catalog") h.catalog.fingerprint = "catalog-2";
      if (mode === "address") h.stored.addresses[0].distance_km = 4;
      if (mode === "threshold") h.stored.vouchers[0].min_order_vnd = 30_000;
    };
    expect(await runFreeshipEligibilityJourney(h.ctx)).toMatchObject({ status: "FAIL", summary: { attempted: 0, rejected: 0 } });
    expect(h.calls).toEqual([]); expect(h.markers).toEqual([]);
  });

  it("hết quota thời gian là PARTIAL trước login và không nhận marker", async () => {
    const h = harness();
    h.ctx.pacer = createOrderPacer({ now: h.ctx.now, deadline: h.ctx.now() + 1_000 });
    expect(await runFreeshipEligibilityJourney(h.ctx)).toMatchObject({ status: "PARTIAL", code: "RUN_TIME_BUDGET_INSUFFICIENT" });
    expect(h.calls).toEqual([]); expect(h.markers).toEqual([]);
  });

  it("quota tại raw dispatch sau login đối soát sạch rồi logout và PARTIAL", async () => {
    const h = harness();
    const actorLifecycle = {
      async login(options: Parameters<typeof loginActor>[0]) {
        const actor = await loginActor(options);
        const dispatchPacer = createOrderPacer({ now: h.ctx.now, deadline: h.ctx.now() + 1_000 });
        return prepareLongRunningActor({ actor, userId: "customer-b", db: h.ctx.db, journal: h.ctx.journal,
          now: h.ctx.now, dispatchPacer });
      },
      logout: logoutActor,
    };
    expect(await runFreeshipEligibilityJourney({ ...h.ctx, actorLifecycle })).toMatchObject({ status: "PARTIAL",
      code: "RUN_TIME_BUDGET_INSUFFICIENT", recoveryRequired: false, summary: { attempted: 0, rejected: 0 } });
    expect(h.calls.map(call => call.path)).toEqual(["/api/auth/login", "/api/auth/me", "/api/auth/logout", "/api/auth/me"]);
    expect(h.entries().filter(entry => entry.type === "create").map(entry => entry.state)).toEqual(["INTENT", "NOT_APPLIED"]);
    expect(h.sessions).toEqual([]);
    expect(fs.existsSync(path.join(h.ctx.runDir, "sessions", "customerB.json"))).toBe(false);
  });

  it("login bị từ chối không tạo order", async () => {
    const h = harness(); h.controls.loginFailure = true;
    expect(await runFreeshipEligibilityJourney(h.ctx)).toMatchObject({ status: "FAIL", code: "LOGIN_FAILED_CUSTOMERB" });
    expect(h.calls.map(call => call.path)).toEqual(["/api/auth/login"]);
  });

  it("logout không rõ kết quả giữ cookie và báo recovery", async () => {
    const h = harness(); h.controls.logoutFailure = true;
    expect(await runFreeshipEligibilityJourney(h.ctx)).toMatchObject({ status: "FAIL", recoveryRequired: true });
    expect(h.sessions).toHaveLength(1);
    expect(fs.existsSync(path.join(h.ctx.runDir, "sessions", "customerB.json"))).toBe(true);
  });

  it("chỉ thu hồi session của run và giữ nguyên session có trước", async () => {
    const h = harness();
    const old = { id: "old-session", user_id: "customer-b", expires_at: "2099-01-01T00:00:00.000Z" };
    h.sessions.push(old); h.ctx.actorStates.customerB.sessions.push(structuredClone(old));
    expect(await runFreeshipEligibilityJourney(h.ctx)).toMatchObject({ status: "PASS" });
    expect(h.sessions).toEqual([old]);
  });
});
