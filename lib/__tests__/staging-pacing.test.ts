// @vitest-environment node

import { describe, expect, it } from "vitest";
import { createAuthPacer, createOrderPacer, createStaffOrderPacer,
  createVoucherExchangePacer } from "../../scripts/staging-tests/pacing.mjs";
import { FULL_PROFILE_CREATE_ATTEMPTS } from "../../scripts/staging-tests/runner.mjs";
import { createApi } from "../../scripts/staging-tests/http.mjs";
import { mutateOnce } from "../../scripts/staging-tests/operations.mjs";

describe("Auth staging pacing dùng chung nhiều actor", () => {
  it("login và refresh thứ mười một chờ hết 61 giây dù thuộc actor khác", async () => {
    let clock = 0;
    const timers: Array<{ at: number; resolve: () => void }> = [];
    const sleeps: number[] = [];
    const waits: Array<{ code: string; remainingMs: number }> = [];
    const pacer = createAuthPacer({ now: () => clock, deadline: 300_000,
      sleep: (ms: number) => new Promise<void>(resolve => { sleeps.push(ms); timers.push({ at: clock + ms, resolve }); }),
      onWait: (event: { code: string; remainingMs: number }) => waits.push(event) });
    const raw: Array<{ actor: string; pathname: string; at: number }> = [];
    const apis = ["customerA", "customerB"].map(actor => createApi({ origin: "https://verified.vercel.app",
      beforeDispatch: () => pacer.reserve(),
      fetchImpl: async url => { raw.push({ actor, pathname: url.pathname, at: clock }); return Response.json({ data: true }); } }));
    const pending = Promise.all(Array.from({ length: 11 }, (_, index) => apis[index % 2].request(
      index % 2 ? "/api/auth/refresh" : "/api/auth/login", { method: "POST", body: {}, mutation: true })));
    for (let turn = 0; turn < 100; turn++) await Promise.resolve();
    expect(raw).toHaveLength(10);
    expect(new Set(raw.map(request => request.actor)).size).toBe(2);
    for (let step = 0; step < 3 && raw.length < 11; step++) {
      clock = Math.min(...timers.map(timer => timer.at));
      timers.splice(0).forEach(timer => timer.resolve());
      for (let turn = 0; turn < 100; turn++) await Promise.resolve();
    }
    await pending;
    expect(raw.map(request => request.at)).toEqual([...Array(10).fill(0), 61_000]);
    expect(sleeps).toEqual([45_000, 16_000]);
    expect(waits).toEqual([{ code: "AUTH_RATE_WINDOW_WAIT", remainingMs: 61_000 },
      { code: "AUTH_RATE_WINDOW_WAIT", remainingMs: 16_000 }]);
  });

  it("không chờ hoặc dispatch request thứ 11 khi deadline không đủ cửa sổ kế tiếp", async () => {
    let clock = 0;
    const sleeps: number[] = [];
    const pacer = createAuthPacer({ now: () => clock, deadline: 90_000,
      sleep: async (ms: number) => { sleeps.push(ms); clock += ms; } });
    let rawCalls = 0;
    const api = createApi({ origin: "https://verified.vercel.app", beforeDispatch: () => pacer.reserve(),
      fetchImpl: async () => { rawCalls++; return Response.json({ data: true }); } });
    for (let index = 0; index < 10; index++) await api.request("/api/auth/login", { method: "POST", mutation: true });
    await expect(api.request("/api/auth/refresh", { method: "POST", mutation: true }))
      .rejects.toMatchObject({ status: "PARTIAL", code: "AUTH_TIME_BUDGET_INSUFFICIENT" });
    expect(rawCalls).toBe(10);
    expect(sleeps).toEqual([]);
  });

  it("chỉ xếp hàng admission, không giữ hàng đợi đến lúc HTTP trước hoàn tất", async () => {
    const pacer = createAuthPacer({ now: () => 0, deadline: 300_000 });
    let releaseFirst = () => {};
    const raw: string[] = [];
    const api = createApi({ origin: "https://verified.vercel.app", beforeDispatch: () => pacer.reserve(),
      fetchImpl: async url => {
        raw.push(url.pathname);
        if (url.pathname === "/api/auth/login") await new Promise<void>(resolve => { releaseFirst = resolve; });
        return Response.json({ data: true });
      } });
    const login = api.request("/api/auth/login", { method: "POST", mutation: true });
    const refresh = api.request("/api/auth/refresh", { method: "POST", mutation: true });
    for (let turn = 0; turn < 100; turn++) await Promise.resolve();
    expect(raw).toEqual(["/api/auth/login", "/api/auth/refresh"]);
    await refresh;
    releaseFirst();
    await login;
  });
});

describe("Voucher exchange staging pacing dung chung theo tai khoan", () => {
  it("request thu sau cung tai khoan cho du 61 giay nhung tai khoan khac di ngay", async () => {
    let clock = 0;
    const waits: Array<{ code: string; remainingMs: number }> = [];
    const timers: Array<{ at: number; resolve: () => void }> = [];
    const pacer = createVoucherExchangePacer({ now: () => clock, deadline: 300_000,
      sleep: (ms: number) => new Promise<void>(resolve => timers.push({ at: clock + ms, resolve })),
      onWait: (event: { code: string; remainingMs: number }) => waits.push(event) });
    await Promise.all(Array.from({ length: 5 }, () => pacer.reserve("account-a")));
    let sixthResolved = false;
    let otherResolved = false;
    const sixth = pacer.reserve("account-a").then(() => { sixthResolved = true; });
    for (let turn = 0; turn < 100; turn++) await Promise.resolve();
    expect(timers).toHaveLength(1);
    const other = pacer.reserve("account-b").then(() => { otherResolved = true; });
    for (let turn = 0; turn < 100; turn++) await Promise.resolve();
    expect(otherResolved).toBe(true);
    expect(sixthResolved).toBe(false);
    expect(clock).toBe(0);
    await other;
    for (let step = 0; step < 2; step++) {
      clock = Math.min(...timers.map(timer => timer.at));
      timers.splice(0).forEach(timer => timer.resolve());
      for (let turn = 0; turn < 100; turn++) await Promise.resolve();
    }
    await sixth;
    expect(clock).toBe(61_000);
    expect(waits).toEqual([{ code: "VOUCHER_EXCHANGE_RATE_WINDOW_WAIT", remainingMs: 61_000 },
      { code: "VOUCHER_EXCHANGE_RATE_WINDOW_WAIT", remainingMs: 16_000 }]);
  });

  it("fail closed truoc raw HTTP khi deadline khong du cua so ke tiep", async () => {
    const pacer = createVoucherExchangePacer({ now: () => 0, deadline: 90_000 });
    let rawCalls = 0;
    const api = createApi({ origin: "https://verified.vercel.app", beforeDispatch: request =>
      request.method === "POST" && request.pathname === "/api/profile/vouchers/exchange"
        ? pacer.reserve("account-a") : undefined,
    fetchImpl: async () => { rawCalls++; return Response.json({ data: true }); } });
    for (let index = 0; index < 5; index++) {
      await api.request("/api/profile/vouchers/exchange", { method: "POST", body: {}, mutation: true });
    }
    await expect(api.request("/api/profile/vouchers/exchange", { method: "POST", body: {}, mutation: true }))
      .rejects.toMatchObject({ status: "PARTIAL", code: "VOUCHER_EXCHANGE_TIME_BUDGET_INSUFFICIENT" });
    expect(rawCalls).toBe(5);
  });

  it("nam admission 5 request dau ma khong giu den khi HTTP hoan tat", async () => {
    const pacer = createVoucherExchangePacer({ now: () => 0, deadline: 300_000 });
    let releaseFirst = () => {};
    let rawCalls = 0;
    const api = createApi({ origin: "https://verified.vercel.app", beforeDispatch: () => pacer.reserve("account-a"),
      fetchImpl: async () => {
        rawCalls++;
        if (rawCalls === 1) await new Promise<void>(resolve => { releaseFirst = resolve; });
        return Response.json({ data: true });
      } });
    const requests = Array.from({ length: 5 }, () => api.request("/api/profile/vouchers/exchange",
      { method: "POST", body: {}, mutation: true }));
    for (let turn = 0; turn < 100; turn++) await Promise.resolve();
    expect(rawCalls).toBe(5);
    releaseFirst();
    await Promise.all(requests);
  });

  it("cau dao fatal dong trong luc cho thi journal NOT_APPLIED va khong raw HTTP", async () => {
    let clock = 0;
    let writeAllowed = true;
    const pacer = createVoucherExchangePacer({ now: () => clock, deadline: 300_000,
      sleep: async ms => { clock += ms; writeAllowed = false; } });
    let rawCalls = 0;
    const api = createApi({ origin: "https://verified.vercel.app", beforeDispatch: async request => {
      if (request.method === "POST" && request.pathname === "/api/profile/vouchers/exchange") {
        await pacer.reserve("account-a");
      }
      if (!writeAllowed) throw Object.assign(new Error("WRITE_GATE_CLOSED"), { code: "WRITE_GATE_CLOSED" });
    }, fetchImpl: async () => { rawCalls++; return Response.json({ data: true }); } });
    for (let index = 0; index < 5; index++) {
      await api.request("/api/profile/vouchers/exchange", { method: "POST", body: {}, mutation: true });
    }
    const outcomes: string[] = [];
    const journal = { recordIntent() {}, recordOutcome(_type: string, _id: string, state: string) { outcomes.push(state); } };
    await expect(mutateOnce({ journal, type: "exchange", recovery: { actor: "customer" }, reconcile: undefined,
      send: () => api.request("/api/profile/vouchers/exchange", { method: "POST", body: {}, mutation: true }) }))
      .rejects.toMatchObject({ code: "WRITE_GATE_CLOSED" });
    expect(rawCalls).toBe(5);
    expect(outcomes).toEqual(["NOT_APPLIED"]);
  });
});

describe("Full staging pacing schedule", () => {
  it("staff create thứ 31 chờ cửa sổ riêng nhưng 30 admission đầu không giữ HTTP completion", async () => {
    let clock = 0;
    const timers: Array<{ at: number; resolve: () => void }> = [];
    const waits: Array<{ code: string; remainingMs: number }> = [];
    const pacer = createStaffOrderPacer({ now: () => clock, deadline: 300_000,
      sleep: (ms: number) => new Promise<void>(resolve => timers.push({ at: clock + ms, resolve })),
      onWait: (event: { code: string; remainingMs: number }) => waits.push(event) });
    let releaseFirst = () => {};
    const raw: number[] = [];
    const api = createApi({ origin: "https://verified.vercel.app", beforeDispatch: request =>
      request.method === "POST" && request.pathname === "/api/staff/orders" ? pacer.reserve() : undefined,
    fetchImpl: async () => {
      raw.push(clock);
      if (raw.length === 1) await new Promise<void>(resolve => { releaseFirst = resolve; });
      return Response.json({ data: true });
    } });
    const requests = Array.from({ length: 31 }, () => api.request("/api/staff/orders",
      { method: "POST", body: {}, mutation: true }));
    for (let turn = 0; turn < 200; turn++) await Promise.resolve();
    expect(raw).toHaveLength(30);
    clock = 45_000; timers.splice(0).forEach(timer => timer.resolve());
    for (let turn = 0; turn < 100; turn++) await Promise.resolve();
    clock = 61_000; timers.splice(0).forEach(timer => timer.resolve());
    releaseFirst();
    await Promise.all(requests);
    expect(raw).toEqual([...Array(30).fill(0), 61_000]);
    expect(waits).toEqual([{ code: "STAFF_ORDER_RATE_WINDOW_WAIT", remainingMs: 61_000 },
      { code: "STAFF_ORDER_RATE_WINDOW_WAIT", remainingMs: 16_000 }]);
  });

  it("staff create thứ 31 fail closed trước raw HTTP khi deadline không đủ", async () => {
    const pacer = createStaffOrderPacer({ now: () => 0, deadline: 90_000 });
    let rawCalls = 0;
    const api = createApi({ origin: "https://verified.vercel.app", beforeDispatch: request =>
      request.method === "POST" && request.pathname === "/api/staff/orders" ? pacer.reserve() : undefined,
    fetchImpl: async () => { rawCalls++; return Response.json({ data: true }); } });
    for (let index = 0; index < 30; index++) {
      await api.request("/api/staff/orders", { method: "POST", body: {}, mutation: true });
    }
    await expect(api.request("/api/staff/orders", { method: "POST", body: {}, mutation: true }))
      .rejects.toMatchObject({ status: "PARTIAL", code: "STAFF_ORDER_TIME_BUDGET_INSUFFICIENT" });
    expect(rawCalls).toBe(30);
  });

  it("cầu dao fatal đóng trong lúc staff chờ thì request bị chặn sau admission và trước raw HTTP", async () => {
    let clock = 0;
    let writeAllowed = true;
    const pacer = createStaffOrderPacer({ now: () => clock, deadline: 300_000,
      sleep: async ms => { clock += ms; writeAllowed = false; } });
    let rawCalls = 0;
    const api = createApi({ origin: "https://verified.vercel.app", beforeDispatch: async request => {
      if (request.method === "POST" && request.pathname === "/api/staff/orders") await pacer.reserve();
      if (!writeAllowed) throw Object.assign(new Error("WRITE_GATE_CLOSED"), { code: "WRITE_GATE_CLOSED" });
    }, fetchImpl: async () => { rawCalls++; return Response.json({ data: true }); } });
    for (let index = 0; index < 30; index++) {
      await api.request("/api/staff/orders", { method: "POST", body: {}, mutation: true });
    }
    const outcomes: string[] = [];
    const journal = { recordIntent() {}, recordOutcome(_type: string, _id: string, state: string) { outcomes.push(state); } };
    await expect(mutateOnce({ journal, type: "create", recovery: { actor: "staff" }, reconcile: undefined,
      send: () => api.request("/api/staff/orders", { method: "POST", body: {}, mutation: true }) }))
      .rejects.toMatchObject({ code: "WRITE_GATE_CLOSED" });
    expect(rawCalls).toBe(30);
    expect(outcomes).toEqual(["NOT_APPLIED"]);
  });

  it("expiry chạy song song; profile đủ mọi dữ liệu dừng PARTIAL trước khi vượt trần 60 phút", async () => {
    let clock = 0;
    const deadline = 60 * 60_000;
    const timers: Array<{ at: number; resolve: () => void }> = [];
    const sleep = (ms: number) => new Promise<void>(resolve => timers.push({ at: clock + ms, resolve }));
    const pacer = createOrderPacer({ now: () => clock, sleep, deadline });
    const customerBCount = Object.values(FULL_PROFILE_CREATE_ATTEMPTS.customerB)
      .reduce<number>((sum, count) => sum + count, 0);
    expect(customerBCount).toBe(39);

    let expiryDone = false;
    let mainDone = false;
    let admitted = 0;
    let timeFailure: unknown;
    const expiry = (async () => {
      const slot = await pacer.reserve("customer-a", FULL_PROFILE_CREATE_ATTEMPTS.customerAExpiry, 1_382_000);
      slot.markDispatched();
      await sleep(1_202_000);
      expiryDone = true;
    })();
    const main = (async () => {
      try {
        for (let index = 0; index < customerBCount; index += 1) {
          const slot = await pacer.reserve("customer-b", 1, 60_000);
          slot.markDispatched();
          admitted++;
        }
      } catch (error) { timeFailure = error; }
      mainDone = true;
    })();

    for (let turns = 0; !(expiryDone && mainDone) && turns < 500; turns += 1) {
      for (let microtasks = 0; microtasks < 100; microtasks += 1) await Promise.resolve();
      if (!timers.length) continue;
      clock = Math.min(...timers.map(timer => timer.at));
      const due = timers.filter(timer => timer.at <= clock);
      for (const timer of due) timers.splice(timers.indexOf(timer), 1);
      for (const timer of due) timer.resolve();
    }
    await Promise.all([expiry, main]);
    expect(expiryDone).toBe(true);
    expect(mainDone).toBe(true);
    expect(admitted).toBe(30);
    expect(timeFailure).toMatchObject({ status: "PARTIAL", code: "RUN_TIME_BUDGET_INSUFFICIENT" });
    expect(clock).toBeLessThan(51 * 60_000);
    expect(clock + 1_382_000).toBeGreaterThan(deadline);
  });
});
