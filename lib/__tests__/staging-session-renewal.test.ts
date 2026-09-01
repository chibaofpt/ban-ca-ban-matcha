// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import { AmbiguousMutation, CookieJar } from "../../scripts/staging-tests/http.mjs";
import { mutateOnce } from "../../scripts/staging-tests/operations.mjs";
import { prepareLongRunningActor } from "../../scripts/staging-tests/session-renewal.mjs";

describe("Long staging fatal write gate", () => {
  it("rechecks after dispatch pacing before sending an order", async () => {
    let releasePacing = () => {};
    let fatal = false;
    const request = vi.fn(async () => ({ ok: true, status: 201, body: { data: {} } }));
    const journal = { recordIntent: vi.fn(), recordOutcome: vi.fn() };
    const reconcile = vi.fn();
    const actor = prepareLongRunningActor({
      actor: { name: "customerB", sessionId: "s", api: { jar: new CookieJar(), request } },
      userId: "u",
      db: {},
      journal,
      dispatchPacer: { reserve: () => new Promise<void>(resolve => { releasePacing = resolve; }) },
      assertWriteAllowed: () => { if (fatal) throw new AmbiguousMutation(); },
    });
    const pending = mutateOnce({ journal, type: "create", recovery: {}, reconcile,
      send: () => actor.api.request("/api/orders", { method: "POST", mutation: true }) });
    await Promise.resolve();
    fatal = true;
    releasePacing();
    await expect(pending).rejects.toMatchObject({ code: "MUTATION_OUTCOME_AMBIGUOUS" });
    expect(request).not.toHaveBeenCalled();
    expect(reconcile).not.toHaveBeenCalled();
    expect(journal.recordOutcome).toHaveBeenCalledWith("create", expect.any(String), "NOT_APPLIED",
      { code: "CLIENT_REJECTED" });
  });

  it("rechecks immediately before a scheduled refresh dispatch", async () => {
    let fatal = false;
    const request = vi.fn(async () => ({ ok: true, status: 200, body: { data: {} } }));
    const journal = { recordIntent: vi.fn(), recordOutcome: vi.fn() };
    const session = vi.fn();
    const actor = prepareLongRunningActor({
      actor: { name: "customerB", sessionId: "s", api: { jar: new CookieJar(), request } },
      userId: "u",
      db: { session },
      journal,
      dispatchPacer: undefined,
      now: () => 601_000,
      renewImmediately: true,
      assertWriteAllowed: () => { if (fatal) throw new AmbiguousMutation(); },
    });
    fatal = true;
    await expect(actor.api.request("/api/orders", { method: "POST", mutation: true }))
      .rejects.toMatchObject({ code: "MUTATION_OUTCOME_AMBIGUOUS" });
    expect(request).not.toHaveBeenCalled();
    expect(journal.recordOutcome).toHaveBeenCalledWith("refresh", expect.any(String), "NOT_APPLIED",
      { code: "CLIENT_REJECTED" });
    expect(session).not.toHaveBeenCalled();
  });
});

describe("Long staging journeys — refresh and actual dispatch", () => {
  it("đợi rate window trước, renew session rồi mới gửi order; không ghi token vào journal", async () => {
    let time = 0;
    const calls: string[] = [];
    const jar = new CookieJar({ refresh_token: "old-secret" });
    const journal = { recordIntent: vi.fn(), recordOutcome: vi.fn() };
    const api = { jar, request: vi.fn(async (route: string) => {
      calls.push(route);
      if (route === "/api/auth/refresh") jar.absorb(["refresh_token=new-secret"]);
      return { ok: true, status: 200, body: { data: { success: true } } };
    }) };
    const onSessionRotated = vi.fn();
    const actor = prepareLongRunningActor({ actor: { name: "customerB", sessionId: "s", api }, userId: "u", journal,
      db: { session: vi.fn(async () => ({ id: "s-new", user_id: "u" })) }, now: () => time, onSessionRotated,
      dispatchPacer: { reserve: async () => { calls.push("pace"); time += 601_000; } },
    });
    await actor.api.request("/api/orders", { method: "POST", mutation: true });
    expect(calls).toEqual(["pace", "/api/auth/refresh", "/api/orders"]);
    expect(journal.recordIntent.mock.calls[0][0]).toBe("refresh");
    expect(actor.sessionId).toBe("s-new");
    expect(onSessionRotated).toHaveBeenCalledWith("s-new");
    expect(JSON.stringify(journal.recordIntent.mock.calls)).not.toContain("secret");
  });

  it("không gửi order nếu renew session thất bại", async () => {
    let time = 0;
    const request = vi.fn(async () => ({ ok: false, status: 401, body: { code: "UNAUTHORIZED" } }));
    const actor = prepareLongRunningActor({ actor: { name: "customerB", sessionId: "s", api: { jar: new CookieJar(), request } },
      userId: "u", db: {}, journal: { recordIntent: vi.fn(), recordOutcome: vi.fn() }, now: () => time, dispatchPacer: undefined,
    });
    time = 601_000;
    await expect(actor.api.request("/api/orders", { method: "POST", mutation: true })).rejects.toThrow();
    expect(request.mock.calls).toHaveLength(1);
    expect(request).toHaveBeenCalledWith("/api/auth/refresh", expect.anything());
  });

  it("từ chối refresh giữ nguyên token dù DB ánh xạ sang session id mới", async () => {
    let time = 0;
    const jar = new CookieJar({ refresh_token: "unchanged" });
    const request = vi.fn(async () => ({ ok: true, status: 200, body: { data: {} } }));
    const actor = prepareLongRunningActor({ actor: { name: "customerB", sessionId: "old", api: { jar, request } },
      userId: "u", db: { session: vi.fn(async () => ({ id: "new", user_id: "u" })) },
      journal: { recordIntent: vi.fn(), recordOutcome: vi.fn() }, now: () => time, dispatchPacer: undefined });
    time = 601_000;
    await expect(actor.api.request("/api/orders", { method: "POST", mutation: true }))
      .rejects.toThrow("SESSION_REFRESH_TOKEN_UNCHANGED");
  });
});
