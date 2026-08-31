// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import { CookieJar, createApi, AmbiguousMutation } from "../../scripts/staging-tests/http.mjs";
import { loginActor, logoutActor } from "../../scripts/staging-tests/actors.mjs";
import { prepareLongRunningActor } from "../../scripts/staging-tests/session-renewal.mjs";
import { mutateOnce } from "../../scripts/staging-tests/operations.mjs";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createJournal } from "../../scripts/staging-tests/journal.mjs";
import { PrerequisiteMissing } from "../../scripts/staging-tests/errors.mjs";
import { createAuthPacer } from "../../scripts/staging-tests/pacing.mjs";

describe("HTTP staging — admission trước raw dispatch", () => {
  it("deadline từ hook trước dispatch ghi NOT_APPLIED thay vì gọi HTTP", async () => {
    const entries: Array<{ state?: string }> = [];
    const journal = createJournal({ rootDir: "D:/journal-double", runId: "run_12345678", now: () => new Date(0),
      fs: { mkdirSync() {}, appendFileSync(_path: string, content: string) { entries.push(JSON.parse(content)); } } });
    const fetchImpl = vi.fn(async () => Response.json({ data: true }));
    const api = createApi({ origin: "https://verified.vercel.app", fetchImpl,
      beforeDispatch: async () => { throw new PrerequisiteMissing("AUTH_TIME_BUDGET_INSUFFICIENT"); } });
    await expect(mutateOnce({ journal, type: "refresh", recovery: {}, reconcile: undefined,
      send: () => api.request("/api/auth/refresh", { method: "POST", body: {}, mutation: true }) }))
      .rejects.toMatchObject({ code: "AUTH_TIME_BUDGET_INSUFFICIENT" });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(entries.map(entry => entry.state)).toEqual(["INTENT", "NOT_APPLIED"]);
  });

  it("gate đóng trong lúc login chờ auth slot thì NOT_APPLIED và raw fetch bằng không", async () => {
    const runDir = mkdtempSync(path.join(tmpdir(), "staging-auth-pacer-gate-"));
    let clock = 0;
    let fatal = false;
    let releaseWait = () => {};
    const pacer = createAuthPacer({ now: () => clock, deadline: 300_000,
      sleep: (ms: number) => new Promise<void>(resolve => { releaseWait = () => { clock += ms; resolve(); }; }) });
    const fillApi = createApi({ origin: "https://verified.vercel.app", beforeDispatch: () => pacer.reserve(),
      fetchImpl: async () => Response.json({ data: true }) });
    for (let index = 0; index < 10; index++) await fillApi.request("/api/auth/login", { method: "POST", body: {}, mutation: true });
    const journal = createJournal({ rootDir: runDir, runId: "run_12345678", now: () => new Date(clock),
      fs: { mkdirSync() {}, appendFileSync(_path: string, content: string) { entries.push(JSON.parse(content)); } } });
    const entries: Array<{ state?: string }> = [];
    const fetchImpl = vi.fn(async () => Response.json({ data: { role: "CUSTOMER" } }, {
      headers: { "set-cookie": "refresh_token=synthetic; Path=/; HttpOnly" } }));
    try {
      const pending = loginActor({ origin: "https://verified.vercel.app", name: "customerB", expectedUserId: "b", runDir,
        credential: { phone: "phone", password: "synthetic", role: "CUSTOMER" }, fetchImpl, journal,
        db: { actorState: async () => ({ sessions: [] }), session: async () => ({ id: "session-b", user_id: "b" }) },
        beforeDispatch: ({ pathname }: { pathname: string }) => pathname === "/api/auth/login" ? pacer.reserve() : undefined,
        assertWriteAllowed: () => { if (fatal) throw new AmbiguousMutation(); } });
      const outcome = pending.then(value => ({ value }), error => ({ error }));
      for (let turn = 0; turn < 100; turn++) await Promise.resolve();
      expect(fetchImpl).not.toHaveBeenCalled();
      fatal = true;
      releaseWait();
      for (let turn = 0; turn < 100; turn++) await Promise.resolve();
      releaseWait();
      expect(await outcome).toMatchObject({ error: { name: "WriteGateClosed", code: "MUTATION_OUTCOME_AMBIGUOUS" } });
      expect(fetchImpl).not.toHaveBeenCalled();
      expect(entries.map(entry => entry.state)).toEqual(["INTENT", "NOT_APPLIED"]);
      expect(existsSync(path.join(runDir, "sessions", "customerB.json"))).toBe(false);
    } finally { rmSync(runDir, { recursive: true, force: true }); }
  });

  it("timeout và cookie header chỉ được chụp sau thời gian chờ admission", async () => {
    const jar = new CookieJar({ refresh_token: "old" });
    const api = createApi({ origin: "https://verified.vercel.app", jar, timeoutMs: 5,
      beforeDispatch: async () => {
        await new Promise(resolve => setTimeout(resolve, 25));
        jar.absorb(["refresh_token=new; Path=/; HttpOnly"]);
      },
      fetchImpl: async (_url, init) => {
        expect(init.signal?.aborted).toBe(false);
        expect(new Headers(init.headers).get("cookie")).toBe("refresh_token=new");
        return Response.json({ data: true });
      } });
    await expect(api.request("/api/auth/refresh", { method: "POST", mutation: true })).resolves.toMatchObject({ status: 200 });
  });

  it("refresh của actor đã login kế thừa auth pacing và lưu cookie mới đúng session", async () => {
    const runDir = mkdtempSync(path.join(tmpdir(), "staging-auth-refresh-pacer-"));
    let clock = 0;
    let token = "initial";
    const raw: Array<{ route: string; at: number }> = [];
    const entries: Array<{ state?: string }> = [];
    const journal = createJournal({ rootDir: runDir, runId: "run_12345678", now: () => new Date(clock),
      fs: { mkdirSync() {}, appendFileSync(_path: string, content: string) { entries.push(JSON.parse(content)); } } });
    const pacer = createAuthPacer({ now: () => clock, deadline: 300_000, sleep: async ms => { clock += ms; } });
    const beforeDispatch = ({ pathname, method }: { pathname: string; method: string }) =>
      method === "POST" && ["/api/auth/login", "/api/auth/refresh"].includes(pathname) ? pacer.reserve() : undefined;
    const db = { actorState: async () => ({ sessions: [] }), session: async (candidate: string) =>
      candidate === token ? { id: "session-b", user_id: "b" } : null };
    const fetchImpl = async (url: URL) => {
      raw.push({ route: url.pathname, at: clock });
      if (url.pathname === "/api/auth/refresh") token = "rotated";
      return Response.json({ data: { role: "CUSTOMER" } }, {
        headers: url.pathname === "/api/auth/me" ? {} : { "set-cookie": `refresh_token=${token}; Path=/; HttpOnly` } });
    };
    try {
      const actor = await loginActor({ origin: "https://verified.vercel.app", name: "customerB", expectedUserId: "b", runDir,
        credential: { phone: "phone", password: "synthetic", role: "CUSTOMER" }, fetchImpl, journal, db, beforeDispatch });
      const other = createApi({ origin: "https://verified.vercel.app", beforeDispatch,
        fetchImpl: async () => Response.json({ data: true }) });
      for (let index = 0; index < 9; index++) await other.request("/api/auth/login", { method: "POST", mutation: true });
      const prepared = prepareLongRunningActor({ actor, userId: "b", db, journal, renewImmediately: true,
        now: () => clock, dispatchPacer: undefined });
      await prepared.api.request("/api/catalog");
      expect(raw.find(request => request.route === "/api/auth/refresh")).toEqual({ route: "/api/auth/refresh", at: 61_000 });
      expect(raw.filter(request => request.route === "/api/auth/login")).toHaveLength(1);
      expect(JSON.parse(readFileSync(path.join(runDir, "sessions", "customerB.json"), "utf8")))
        .toEqual({ refresh_token: "rotated" });
      expect(prepared.sessionId).toBe("session-b");
      expect(entries.map(entry => entry.state)).toEqual(["INTENT", "APPLIED", "INTENT", "APPLIED"]);
    } finally { rmSync(runDir, { recursive: true, force: true }); }
  });

  it("429 chưa biết counter bên ngoài được báo lỗi một lần, không retry login", async () => {
    const runDir = mkdtempSync(path.join(tmpdir(), "staging-auth-429-"));
    const entries: Array<{ state?: string; httpStatus?: number }> = [];
    const journal = createJournal({ rootDir: runDir, runId: "run_12345678", now: () => new Date(0),
      fs: { mkdirSync() {}, appendFileSync(_path: string, content: string) { entries.push(JSON.parse(content)); } } });
    const pacer = createAuthPacer({ now: () => 0, deadline: 300_000 });
    const fetchImpl = vi.fn(async () => Response.json({ code: "RATE_LIMITED" }, { status: 429 }));
    try {
      await expect(loginActor({ origin: "https://verified.vercel.app", name: "customerB", expectedUserId: "b", runDir,
        credential: { phone: "phone", password: "synthetic", role: "CUSTOMER" }, fetchImpl, journal,
        db: { actorState: async () => ({ sessions: [] }) }, beforeDispatch: () => pacer.reserve() }))
        .rejects.toMatchObject({ code: "LOGIN_FAILED_CUSTOMERB" });
      expect(fetchImpl).toHaveBeenCalledOnce();
      expect(entries.map(entry => entry.state)).toEqual(["INTENT", "NOT_APPLIED"]);
    } finally { rmSync(runDir, { recursive: true, force: true }); }
  });
});

describe("Cầu dao ghi cho session staging", () => {
  it("kiểm tra lại sau DB read trước khi gửi login", async () => {
    const runDir = mkdtempSync(path.join(tmpdir(), "staging-login-gate-"));
    let releaseRead = () => {};
    let fatal = false;
    const fetchImpl = vi.fn();
    const journal = { recordIntent: vi.fn(), recordOutcome: vi.fn() };
    try {
      const pending = loginActor({ origin: "https://verified.vercel.app", name: "customerA",
        credential: { phone: "phone", password: "pw", role: "CUSTOMER" }, expectedUserId: "u", runDir,
        fetchImpl, journal, beforeDispatch: undefined,
        db: { actorState: () => new Promise(resolve => { releaseRead = () => resolve({ sessions: [] }); }) },
        assertWriteAllowed: () => { if (fatal) throw new AmbiguousMutation(); },
      });
      await Promise.resolve();
      fatal = true;
      releaseRead();
      await expect(pending).rejects.toMatchObject({ code: "MUTATION_OUTCOME_AMBIGUOUS" });
      expect(fetchImpl).not.toHaveBeenCalled();
      expect(journal.recordOutcome).toHaveBeenCalledWith("login", expect.any(String), "NOT_APPLIED");
    } finally { rmSync(runDir, { recursive: true, force: true }); }
  });
  it("logout chưa dispatch vì gate đóng thì ghi NOT_APPLIED và không đối soát lại", async () => {
    let releaseRead = () => {};
    let fatal = false;
    const sessionById = vi.fn().mockResolvedValue({ id: "session-b", user_id: "b" })
      .mockImplementationOnce(() => new Promise(resolve => {
      releaseRead = () => resolve({ id: "session-b", user_id: "b" });
      }));
    const request = vi.fn();
    const journal = { recordIntent: vi.fn(), recordOutcome: vi.fn() };
    const db = { sessionById };
    const actor = prepareLongRunningActor({ actor: { name: "customerB", sessionId: "session-b",
      api: { jar: new CookieJar(), request } }, userId: "b", db, journal, dispatchPacer: undefined,
      assertWriteAllowed: () => { if (fatal) throw new AmbiguousMutation(); } });
    const pending = logoutActor(actor, db, "unused", journal);
    await Promise.resolve();
    fatal = true;
    releaseRead();
    await expect(pending).rejects.toMatchObject({ name: "WriteGateClosed", code: "MUTATION_OUTCOME_AMBIGUOUS" });
    expect(request).not.toHaveBeenCalled();
    expect(sessionById).toHaveBeenCalledOnce();
    expect(journal.recordOutcome).toHaveBeenCalledWith("logout", expect.any(String), "NOT_APPLIED");
  });
});

describe("HTTP staging — cookie và mutation", () => {
  it.each(["admin", "staff", "customerB"])("không login %s nếu sẽ đẩy session có trước ra ngoài", async name => {
    const runDir = mkdtempSync(path.join(tmpdir(), "staging-login-"));
    const fetchImpl = vi.fn();
    try {
      await expect(loginActor({ origin: "https://verified.vercel.app", name,
        credential: { phone: "phone", password: "pw", role: name === "admin" ? "ADMIN" : name === "staff" ? "STAFF" : "CUSTOMER" },
        expectedUserId: "u", runDir, fetchImpl, beforeDispatch: undefined, journal: { recordIntent: vi.fn(), recordOutcome: vi.fn() },
        db: { actorState: vi.fn(async () => ({ sessions: Array.from({ length: 5 }, (_, i) => ({ id: String(i), expires_at: "2099-01-01" })) })) },
      })).rejects.toMatchObject({ code: "SESSION_LIMIT_WOULD_EVICT_EXISTING" });
      expect(fetchImpl).not.toHaveBeenCalled();
    } finally { rmSync(runDir, { recursive: true, force: true }); }
  });
  it.each(["body", "cookie"])("đối soát thay vì NOT_APPLIED khi lỗi %s sau dispatch", async failure => {
    const response = new Response('{"data":true}', { status: 200 });
    if (failure === "body") vi.spyOn(response, "text").mockRejectedValue(new TypeError("stream reset"));
    const journal = { recordIntent: vi.fn(), recordOutcome: vi.fn() };
    const reconcile = vi.fn(async () => "AMBIGUOUS");
    const fetchImpl = vi.fn(async () => response);
    const api = createApi({ origin: "https://verified.vercel.app", fetchImpl,
      onCookies: failure === "cookie" ? () => { throw new Error("disk full"); } : undefined,
    });
    await expect(mutateOnce({ journal, type: "create", recovery: {}, reconcile,
      send: () => api.request("/api/orders", { method: "POST", body: {}, mutation: true }),
    })).rejects.toThrow();
    expect(reconcile).toHaveBeenCalledTimes(1);
    expect(journal.recordOutcome.mock.calls.map(call => call[2])).toEqual(["AMBIGUOUS"]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it("xác minh actor bằng role API và session DB, không đòi API lộ users.id", async () => {
    const runDir = mkdtempSync(path.join(tmpdir(), "staging-login-"));
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response('{"data":{"role":"CUSTOMER"}}', { status: 200, headers: { "set-cookie": "refresh_token=secret; Path=/; HttpOnly" } }))
      .mockResolvedValueOnce(new Response('{"data":{"role":"CUSTOMER"}}', { status: 200 }));
    try {
      await expect(loginActor({ origin: "https://verified.vercel.app", name: "customerA", credential: { phone: "phone", password: "pw", role: "CUSTOMER" },
        expectedUserId: "u", runDir, fetchImpl: fetcher, beforeDispatch: undefined, journal: { recordIntent: vi.fn(), recordOutcome: vi.fn() },
        db: { actorState: vi.fn(async () => ({ sessions: [] })), session: vi.fn().mockResolvedValue({ id: "session", user_id: "u" }) },
      })).resolves.toMatchObject({ name: "customerA", sessionId: "session" });
    } finally { rmSync(runDir, { recursive: true, force: true }); }
  });
  it("ghi cookie recovery ngay khi nhận login, kể cả auth/me thất bại sau đó", async () => {
    const runDir = mkdtempSync(path.join(tmpdir(), "staging-login-"));
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response('{"data":{"role":"CUSTOMER"}}', { status: 200, headers: { "set-cookie": "refresh_token=secret; Path=/; HttpOnly" } }))
      .mockRejectedValueOnce(new TypeError("network"));
    try {
      await expect(loginActor({ origin: "https://verified.vercel.app", name: "customerA", credential: { phone: "phone", password: "pw", role: "CUSTOMER" },
        expectedUserId: "u", runDir, fetchImpl: fetcher, beforeDispatch: undefined, journal: { recordIntent: vi.fn(), recordOutcome: vi.fn() },
        db: { actorState: vi.fn(async () => ({ sessions: [] })), session: vi.fn().mockResolvedValue({ id: "session", user_id: "u" }) },
      })).rejects.toThrow();
      expect(existsSync(path.join(runDir, "sessions", "customerA.json"))).toBe(true);
    } finally { rmSync(runDir, { recursive: true, force: true }); }
  });
  it("giữ cookie theo tên, không lộ thuộc tính Set-Cookie vào request", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response('{"data":true}', { status: 200, headers: { "set-cookie": "access_token=abc; Path=/; HttpOnly" } }))
      .mockImplementationOnce((_url: string, init: RequestInit) => {
        expect(new Headers(init.headers).get("cookie")).toBe("access_token=abc");
        return Promise.resolve(new Response('{"data":true}', { status: 200 }));
      });
    const api = createApi({ origin: "https://release.vercel.app", fetchImpl: fetcher });
    await api.request("/login", { method: "POST", body: {} });
    await api.request("/me");
    expect(api.jar.names()).toEqual(["access_token"]);
  });

  it("không retry mutation khi response bị mất", async () => {
    const fetcher = vi.fn().mockRejectedValue(new TypeError("network"));
    const api = createApi({ origin: "https://release.vercel.app", fetchImpl: fetcher });
    await expect(api.request("/api/orders", { method: "POST", body: {}, mutation: true }))
      .rejects.toBeInstanceOf(AmbiguousMutation);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("serialize cookie jar cho recovery mà không chứa password", () => {
    const jar = new CookieJar();
    jar.absorb(["refresh_token=secret; Path=/; HttpOnly", "has_session=1; Path=/"]);
    expect(jar.serialize()).toEqual({ refresh_token: "secret", has_session: "1" });
  });
});
