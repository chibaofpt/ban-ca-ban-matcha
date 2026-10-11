import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";

type Row = Record<string, unknown>;
type Query = { where?: Row; data?: Row; create?: Row; update?: Row };
const boundary = vi.hoisted(() => ({ transaction: vi.fn(), userFind: vi.fn(), attemptFind: vi.fn(), claimFind: vi.fn(), cookies: vi.fn(), session: vi.fn(), identity: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: boundary.userFind }, googleAuthAttempt: { findUnique: boundary.attemptFind }, accountClaimLink: { findUnique: boundary.claimFind }, $transaction: boundary.transaction } }));
vi.mock("@/lib/auth", () => ({ getSession: boundary.session, signJwt: vi.fn(), setAuthCookies: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: boundary.cookies }));
vi.mock("@/lib/redis", () => ({ cacheDelete: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/auth/googleIdentity", () => ({ verifyGoogleIdentity: boundary.identity }));
import { authenticateGoogle } from "@/lib/auth/googleAuth";
import { createGoogleChallenge } from "@/lib/auth/googleChallenge";
import { changePassword } from "@/lib/auth/changePassword";
import { establishClaimContext, issueClaimLink, claimWithPassword } from "@/lib/auth/accountClaim";
import { publishAccountSession } from "@/lib/auth/accountSession";
import { GoogleChallengeSchema, GoogleCredentialSchema } from "@/lib/validations/account";
import { AccountError } from "@/lib/auth/accountError";

const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const rawBrowser = "a".repeat(64);
const now = new Date("2026-10-09T12:00:00Z");
const request = () => new Request("https://matcha.example/api/auth/google");
function customer(id: string, overrides: Row = {}): Row {
  return { id, name: "Khách", phone_number: null, email: null, insta_name: null, password_hash: null, google_sub: null, account_origin: "GOOGLE_EMAIL", role: "CUSTOMER", is_blocked: false, is_verified: false, points_balance: 0, qr_token: id + "-qr", ...overrides };
}
function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, value]) => {
    const actual = row[key];
    if (value !== null && typeof value === "object" && !(value instanceof Date)) {
      const filter = value as Row;
      if ("in" in filter) return (filter.in as unknown[]).includes(actual);
      if ("gt" in filter) return Number(actual) > Number(filter.gt);
      if ("is" in filter) return actual === filter.is;
      if ("not" in filter) return actual !== filter.not;
    }
    return actual === value;
  });
}
function apply(row: Row, data: Row): void {
  for (const [key, value] of Object.entries(data)) {
    row[key] = value !== null && typeof value === "object" && "increment" in value
      ? Number(row[key]) + Number((value as Row).increment) : value;
  }
}

describe("Account claim và Google workflow — APPLICATION_LOGIC / kết quả DB kiểm soát", () => {
  let tables: Record<string, Row[]>;
  let jar: Map<string, string>;
  let sequence: number;
  let claimLoser: boolean;
  let attemptInsertConflict: boolean;
  let cookieSet: ReturnType<typeof vi.fn>;
  const rows = (name: string) => tables[name];
  function hydrateUser(row: Row): Row {
    return { ...row, sourceMerge: rows("accountMerge").find(alias => alias.source_user_id === row.id) ?? null,
      pointsLogs: rows("pointsLog").filter(log => log.user_id === row.id && Number(log.delta) > 0),
      vouchers: rows("voucher").filter(voucher => voucher.user_id === row.id) };
  }
  function read(name: string, where: Row): Row | null {
    const row = rows(name).find(candidate => matches(name === "user" ? hydrateUser(candidate) : candidate, where));
    if (!row) return null;
    if (name === "user") return hydrateUser(row);
    if (name === "welcomeReward") {
      const outcome = rows("rewardOutcome").find(candidate => candidate.welcome_reward_id === row.id);
      return { ...row, campaign: null, outcome: outcome ? { ...outcome, pointsLog: rows("pointsLog").find(log => log.id === outcome.points_log_id) ?? null, voucher: rows("voucher").find(voucher => voucher.id === outcome.voucher_id) ?? null } : null };
    }
    return { ...row };
  }
  beforeEach(() => {
    vi.clearAllMocks(); vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now);
    tables = Object.fromEntries(["user", "googleAuthAttempt", "accountClaimLink", "session", "accountMerge", "welcomeReward", "welcomeRewardSettings", "rewardOutcome", "pointsLog", "order", "voucher", "voucherGrant", "address", "pushSubscription"].map(name => [name, []]));
    sequence = 0; claimLoser = false; attemptInsertConflict = false; jar = new Map([["account_auth_browser", rawBrowser]]);
    cookieSet = vi.fn((name: string, value: string) => { if (value) jar.set(name, value); else jar.delete(name); });
    boundary.cookies.mockResolvedValue({ get: (name: string) => jar.has(name) ? { value: jar.get(name) } : undefined, set: cookieSet });
    boundary.session.mockResolvedValue(null);
    boundary.identity.mockResolvedValue({ sub: "verified-sub", email: "customer@gmail.com", name: "Google Customer" });
    const tx: Record<string, object> = {};
    for (const name of Object.keys(tables)) {
      tx[name] = {
        findUnique: async ({ where = {} }: Query) => read(name, where),
        findFirst: async ({ where = {} }: Query) => read(name, where),
        findMany: async ({ where = {} }: Query) => rows(name).filter(row => matches(row, where)).map(row => ({ ...row })),
        groupBy: async ({ where = {} }: Query) => {
          const counts = new Map<unknown, number>();
          for (const row of rows(name).filter(row => matches(row, where))) counts.set(row.pool_item_id, (counts.get(row.pool_item_id) ?? 0) + 1);
          return [...counts].map(([pool_item_id, count]) => ({ pool_item_id, _count: { _all: count } }));
        },
        update: async ({ where = {}, data = {} }: Query) => {
          const row = rows(name).find(candidate => matches(candidate, where)); if (!row) throw new Error("Missing " + name);
          apply(row, data); return name === "user" ? hydrateUser(row) : { ...row };
        },
        updateMany: async ({ where = {}, data = {} }: Query) => {
          if (name === "accountClaimLink" && claimLoser) return { count: 0 };
          const found = rows(name).filter(row => matches(name === "user" ? hydrateUser(row) : row, where));
          found.forEach(row => apply(row, data)); return { count: found.length };
        },
        create: async ({ data = {} }: Query) => {
          if (name === "googleAuthAttempt" && attemptInsertConflict) throw Object.assign(new Error("Controlled unique loser"), { code: "P2002" });
          const id = name + "-" + (++sequence);
          const defaults = name === "user" ? customer(id) : name === "session" ? { refresh_token: id + "-refresh", previous_refresh_token: null } : name === "rewardOutcome" ? { campaign_id: null, pool_item_id: null, box_id: null, draw_number: null, voucher_id: null } : {};
          const row = { id, ...defaults, ...data }; rows(name).push(row); return name === "user" ? hydrateUser(row) : { ...row };
        },
        delete: async ({ where = {} }: Query) => { tables[name] = rows(name).filter(row => !matches(row, where)); },
        deleteMany: async ({ where = {} }: Query) => { const previous = rows(name).length; tables[name] = rows(name).filter(row => !matches(row, where)); return { count: previous - rows(name).length }; },
        upsert: async ({ where = {}, create = {}, update = {} }: Query) => {
          let row = rows(name).find(candidate => matches(candidate, where));
          if (row) apply(row, update); else { row = { id: name + "-" + (++sequence), ...create }; rows(name).push(row); }
          return { ...row };
        },
      };
    }
    boundary.userFind.mockImplementation(async ({ where = {} }: Query) => read("user", where));
    boundary.attemptFind.mockImplementation(async ({ where = {} }: Query) => read("googleAuthAttempt", where));
    boundary.claimFind.mockImplementation(async ({ where = {} }: Query) => read("accountClaimLink", where));
    boundary.transaction.mockImplementation(async (work: (tx: Prisma.TransactionClient) => Promise<unknown>) => work(tx as unknown as Prisma.TransactionClient));
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ success: true, hostname: "matcha.example", action: "account_claim" }))));
    vi.stubEnv("TURNSTILE_SECRET_KEY", "test-only-turnstile");
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "test-only-site-key");
    vi.stubEnv("GOOGLE_CLIENT_ID", undefined);
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_CLIENT_ID", "google-client");
    vi.stubEnv("JWT_SECRET", "google-preparation-test-secret-at-least-32-bytes");
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  function attempt(purpose = "LOGIN", overrides: Row = {}): void {
    rows("googleAuthAttempt").push({ id: "attempt", purpose, binding_hash: digest(rawBrowser), nonce_hash: "nonce-hash", expires_at: new Date(now.getTime() + 300000), consumed_at: null, verified_at: null, actor_user_id: null, actor_session_id: null, ...overrides });
  }
  const authenticate = () => authenticateGoogle(request(), { challenge_id: "attempt", credential: "provider-credential" });
  async function legacyLink(): Promise<{ url: string; expires_at: string; server_now: string }> {
    rows("user").push(customer("admin", { role: "ADMIN" }), customer("legacy", { name: "Legacy Customer", account_origin: "LEGACY_PHONE", phone_number: "+84912345678", points_balance: 7 }));
    rows("pointsLog").push({ id: "earned-before", user_id: "legacy", delta: 10, reason: "order_completed" });
    return issueClaimLink(request(), "legacy-qr", "admin");
  }
  it("tạo challenge khi chỉ cấu hình Client ID dùng chung với frontend", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ success: true, hostname: "matcha.example", action: "google_auth" }))));
    const result = await createGoogleChallenge(request(), { purpose: "LOGIN", turnstile_token: "test-captcha" }, "203.0.113.1");
    expect(result).toMatchObject({ challenge_id: expect.any(String), expires_at: "2026-10-09T12:05:00.000Z" });
    expect(rows("googleAuthAttempt")).toMatchObject([{ purpose: "LOGIN", actor_user_id: null }]);
  });
  it("chuẩn bị nút Google không cần CAPTCHA và chưa tạo account, session hoặc DB challenge", async () => {
    const parsed = GoogleChallengeSchema.safeParse({ purpose: "LOGIN" });
    expect(parsed.success).toBe(true);
    if (!parsed.success) throw new Error("Expected deferred LOGIN payload");
    const result = await createGoogleChallenge(request(), parsed.data, "203.0.113.1");
    expect(result).toMatchObject({ challenge_id: expect.any(String), nonce: expect.stringMatching(/^[a-f0-9]{64}$/), expires_at: "2026-10-09T12:05:00.000Z" });
    expect(rows("googleAuthAttempt")).toEqual([]);
    expect(rows("user")).toEqual([]);
    expect(rows("session")).toEqual([]);
  });
  it("đổi phiên chuẩn bị lấy account và session chỉ sau cả Google và CAPTCHA hợp lệ, từ chối replay", async () => {
    const parsed = GoogleChallengeSchema.parse({ purpose: "LOGIN" });
    const prepared = await createGoogleChallenge(request(), parsed, "203.0.113.1");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ success: true, hostname: "matcha.example", action: "google_auth" }))));
    const payload = GoogleCredentialSchema.parse({ challenge_id: prepared.challenge_id, credential: "provider-credential", turnstile_token: "test-captcha" });
    const result = await authenticateGoogle(request(), payload);
    expect(result).toMatchObject({ user: { google_sub: "verified-sub", account_origin: "GOOGLE_EMAIL", points_balance: 5 } });
    expect(rows("googleAuthAttempt")).toMatchObject([{ purpose: "LOGIN", nonce_hash: digest(prepared.nonce), consumed_at: now }]);
    expect(rows("session")).toHaveLength(1);
    expect(rows("welcomeReward")).toHaveLength(1);
    await expect(authenticateGoogle(request(), payload)).rejects.toMatchObject({ reason: "GOOGLE_CHALLENGE_INVALID" });
    expect(rows("session")).toHaveLength(1);
    expect(rows("welcomeReward")).toHaveLength(1);
  });
  it("LOGIN/CLAIM chuẩn bị không CAPTCHA; LINK/REAUTH và payload UUID giữ tương thích", () => {
    expect(GoogleChallengeSchema.safeParse({ purpose: "CLAIM" }).success).toBe(true);
    for (const purpose of ["LINK", "REAUTH"]) {
      expect(GoogleChallengeSchema.safeParse({ purpose }).success).toBe(false);
      expect(GoogleChallengeSchema.safeParse({ purpose, turnstile_token: "captcha" }).success).toBe(true);
    }
    expect(GoogleChallengeSchema.safeParse({ purpose: "LOGIN", turnstile_token: "" }).success).toBe(false);
    expect(GoogleCredentialSchema.safeParse({ challenge_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", credential: "google-jwt" }).success).toBe(true);
  });
  it.each(["missing", "rejected", "wrong-action", "empty-hostname", "outage"])("không cấp phiên đăng nhập khi CAPTCHA %s", async kind => {
    const prepared = await createGoogleChallenge(request(), GoogleChallengeSchema.parse({ purpose: "LOGIN" }), "203.0.113.1");
    const payload = { challenge_id: prepared.challenge_id, credential: "provider-credential", ...(kind === "missing" ? {} : { turnstile_token: "captcha" }) };
    if (kind === "missing") expect(GoogleCredentialSchema.safeParse(payload).success).toBe(false);
    vi.stubGlobal("fetch", vi.fn(async () => kind === "outage" ? new Response(null, { status: 503 })
      : new Response(JSON.stringify({ success: kind !== "rejected", hostname: kind === "empty-hostname" ? "" : "matcha.example", action: kind === "wrong-action" ? "account_claim" : "google_auth" }))));
    await expect(authenticateGoogle(request(), payload)).rejects.toMatchObject({ reason: kind === "missing" ? "TURNSTILE_REQUIRED" : kind === "outage" ? "TURNSTILE_UNAVAILABLE" : "TURNSTILE_REJECTED" });
    expect(rows("googleAuthAttempt")).toEqual([]);
    expect(rows("user")).toEqual([]);
    expect(rows("session")).toEqual([]);
  });
  it.each(["tampered", "expired", "browser", "client", "uuid-downgrade", "invalid-google"])("từ chối phiên Google chuẩn bị %s trước mọi ghi account", async kind => {
    const prepared = await createGoogleChallenge(request(), GoogleChallengeSchema.parse({ purpose: "LOGIN" }), "203.0.113.1");
    let challengeId = prepared.challenge_id;
    if (kind === "tampered") {
      const parts = challengeId.split(".");
      const claims = JSON.parse(Buffer.from(parts[2], "base64url").toString()) as Row;
      parts[2] = Buffer.from(JSON.stringify({ ...claims, purpose: "CLAIM" })).toString("base64url");
      challengeId = parts.join(".");
    }
    if (kind === "uuid-downgrade") challengeId = (JSON.parse(Buffer.from(challengeId.split(".")[2], "base64url").toString()) as { jti: string }).jti;
    if (kind === "expired") vi.setSystemTime(new Date(now.getTime() + 300000));
    if (kind === "browser") jar.set("account_auth_browser", "b".repeat(64));
    if (kind === "client") vi.stubEnv("NEXT_PUBLIC_GOOGLE_CLIENT_ID", "other-google-client");
    if (kind === "invalid-google") boundary.identity.mockRejectedValue(new AccountError("GOOGLE_ASSERTION_INVALID", 401, "UNAUTHORIZED"));
    await expect(authenticateGoogle(request(), { challenge_id: challengeId, credential: "provider-credential", turnstile_token: "captcha" }))
      .rejects.toMatchObject({ reason: kind === "invalid-google" ? "GOOGLE_ASSERTION_INVALID" : "GOOGLE_CHALLENGE_INVALID" });
    expect(rows("googleAuthAttempt")).toEqual([]);
    expect(rows("user")).toEqual([]);
    expect(rows("session")).toEqual([]);
  });
  it("kiểm tra lại thời hạn sau khi provider trả về", async () => {
    const prepared = await createGoogleChallenge(request(), GoogleChallengeSchema.parse({ purpose: "LOGIN" }), "203.0.113.1");
    vi.stubGlobal("fetch", vi.fn(async () => {
      vi.setSystemTime(new Date(now.getTime() + 300000));
      return new Response(JSON.stringify({ success: true, hostname: "matcha.example", action: "google_auth" }));
    }));
    await expect(authenticateGoogle(request(), { challenge_id: prepared.challenge_id, credential: "provider-credential", turnstile_token: "captcha" }))
      .rejects.toMatchObject({ reason: "GOOGLE_CHALLENGE_INVALID" });
    expect(rows("session")).toEqual([]);
    expect(rows("googleAuthAttempt")).toEqual([]);
  });
  it("trả lỗi replay khi DB báo unique loser — SIMULATED_RACE_OUTCOME", async () => {
    const prepared = await createGoogleChallenge(request(), GoogleChallengeSchema.parse({ purpose: "LOGIN" }), "203.0.113.1");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ success: true, hostname: "matcha.example", action: "google_auth" }))));
    attemptInsertConflict = true;
    await expect(authenticateGoogle(request(), { challenge_id: prepared.challenge_id, credential: "provider-credential", turnstile_token: "captcha" }))
      .rejects.toMatchObject({ reason: "GOOGLE_CHALLENGE_INVALID", status: 401 });
    expect(rows("session")).toEqual([]);
  });
  it("ghost có 7 điểm không có lịch sử/voucher tạo link và nhận bằng Google", async () => {
    rows("user").push(customer("admin", { role: "ADMIN" }), customer("legacy", {
      account_origin: "LEGACY_PHONE", phone_number: "+84912345678", points_balance: 7,
    }));
    const link = await issueClaimLink(request(), "legacy-qr", "admin");
    const raw = new URL(link.url).hash.slice(1);
    expect(link.expires_at).toBe("2026-10-09T12:05:00.000Z");
    expect(rows("pointsLog")).toEqual([]);
    expect(rows("voucher")).toEqual([]);
    await establishClaimContext(request(), raw);
    attempt("CLAIM", {
      claim_link_id: rows("accountClaimLink")[0].id, claim_token_hash: digest(raw),
    });
    const result = await authenticate();
    expect(result).toMatchObject({ user: { id: "legacy", points_balance: 12, is_verified: true } });
    expect(rows("accountClaimLink")[0].consumed_at).toEqual(now);
    expect(rows("welcomeReward")).toHaveLength(1);
    expect(rows("session")).toHaveLength(1);
    await expect(establishClaimContext(request(), raw)).rejects.toMatchObject({ reason: "CLAIM_LINK_INVALID" });
  });
  it("không tạo challenge khi Client ID dùng chung chưa được cấu hình", async () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_CLIENT_ID", undefined);
    await expect(createGoogleChallenge(request(), { purpose: "LOGIN", turnstile_token: "test-captcha" }, "203.0.113.1"))
      .rejects.toMatchObject({ reason: "GOOGLE_CONFIG", status: 503, code: "SERVICE_UNAVAILABLE" });
    expect(rows("googleAuthAttempt")).toEqual([]);
  });
  it("kích hoạt cùng email ghost dù chưa có điểm hoặc voucher", async () => {
    rows("user").push(customer("email-ghost", { email: "customer@gmail.com" })); attempt();
    const result = await authenticate();
    expect(result).toMatchObject({ user: { id: "email-ghost", google_sub: "verified-sub", account_origin: "GOOGLE_EMAIL", phone_number: null, password_hash: null, points_balance: 5 } });
    if ("reauth_proof" in result) throw new Error("Expected account session");
    const payload = await publishAccountSession(result);
    expect(payload).toMatchObject({ qr_token: "email-ghost-qr", phone_number: null });
    expect(payload).not.toHaveProperty("id");
    expect(rows("user").map(user => user.id)).toEqual(["email-ghost"]);
    expect(rows("welcomeReward")).toHaveLength(1);
    expect(rows("pointsLog")).toMatchObject([{ user_id: "email-ghost", delta: 5, reason: "welcome_bonus" }]);
  });
  it.each(["browser", "expired", "purpose"])("Google challenge từ chối %s không khớp và không tạo account", async kind => {
    rows("user").push(customer("email-ghost", { email: "customer@gmail.com" })); attempt();
    if (kind === "browser") jar.set("account_auth_browser", "b".repeat(64));
    if (kind === "expired") rows("googleAuthAttempt")[0].expires_at = now;
    if (kind === "purpose") {
      boundary.identity.mockImplementationOnce(async () => {
        rows("googleAuthAttempt")[0].purpose = "CLAIM";
        return { sub: "verified-sub", email: "customer@gmail.com", name: "Google Customer" };
      });
    }
    await expect(authenticate()).rejects.toMatchObject({ reason: "GOOGLE_CHALLENGE_INVALID", status: 401 });
    expect(rows("user").find(user => user.id === "email-ghost")?.google_sub).toBeNull();
    expect(rows("session")).toEqual([]); expect(rows("welcomeReward")).toEqual([]);
  });
  it("CLAIM challenge không chấp nhận context cookie khác", async () => {
    const link = await legacyLink(); const raw = new URL(link.url).hash.slice(1);
    await establishClaimContext(request(), raw); attempt("CLAIM", { claim_link_id: rows("accountClaimLink")[0].id, claim_token_hash: digest(raw) });
    jar.set("account_claim_context", "b".repeat(64));
    await expect(authenticate()).rejects.toMatchObject({ reason: "CLAIM_LINK_INVALID" });
    expect(rows("session")).toEqual([]); expect(rows("accountClaimLink")[0].consumed_at).toBeNull();
  });
  it("LINK challenge yêu cầu đúng actor và phiên ban đầu", async () => {
    attempt("LINK", { actor_user_id: "legacy", actor_session_id: "original-session" });
    boundary.session.mockResolvedValue({ id: "legacy", role: "CUSTOMER", session_id: "other-session" });
    await expect(authenticate()).rejects.toMatchObject({ reason: "ACCOUNT_SESSION_EXPIRED", status: 401 });
    expect(rows("session")).toEqual([]);
  });
  it("đổi mật khẩu làm proof LINK và REAUTH cũ vô hiệu dù session ID còn giữ", async () => {
    const passwordHash = await bcrypt.hash("current1", 4);
    rows("user").push(customer("legacy", { account_origin: "LEGACY_PHONE", phone_number: "+84912345678", password_hash: passwordHash }));
    rows("session").push({ id: "actor-session", user_id: "legacy", refresh_token: "old-actor", previous_refresh_token: null, expires_at: new Date(now.getTime() + 600000) });
    boundary.session.mockResolvedValue({ id: "legacy", role: "CUSTOMER", session_id: "actor-session" });
    attempt("LINK", { actor_user_id: "legacy", actor_session_id: "actor-session" });
    rows("googleAuthAttempt").push({ id: "reauth-attempt", purpose: "REAUTH", actor_user_id: "legacy", consumed_at: null, verified_at: now });
    await changePassword({ userId: "legacy", sessionId: "actor-session", currentPassword: "current1", newPassword: "newpass1" });
    expect(rows("session")).toHaveLength(1); expect(rows("session")[0].id).toBe("actor-session");
    await expect(authenticate()).rejects.toMatchObject({ reason: "GOOGLE_CHALLENGE_INVALID" });
    expect(rows("googleAuthAttempt")).toMatchObject([{ consumed_at: now }, { consumed_at: now }]);
    expect(rows("user")[0].google_sub).toBeNull();
  });
  it("không kích hoạt email của tài khoản legacy đã có mật khẩu", async () => {
    rows("user").push(customer("legacy", { email: "customer@gmail.com", account_origin: "LEGACY_PHONE", phone_number: "+84912345678", password_hash: "real-hash" })); attempt();
    await expect(authenticate()).rejects.toMatchObject({ reason: "ACCOUNT_NOT_CLAIMABLE" });
    expect(rows("session")).toEqual([]);
  });
  it("link chỉ lưu hash; context hợp lệ chỉ trả SĐT và thời hạn gốc", async () => {
    const link = await legacyLink(); const raw = new URL(link.url).hash.slice(1);
    expect(raw).toMatch(/^[a-f0-9]{64}$/);
    expect(link.expires_at).toBe("2026-10-09T12:05:00.000Z");
    expect(JSON.stringify(rows("accountClaimLink"))).not.toContain(raw);
    expect(rows("accountClaimLink")[0].token_hash).toBe(digest(raw));
    vi.setSystemTime(new Date(now.getTime() + 60000));
    expect(await establishClaimContext(request(), raw)).toEqual({ phone_number: "+84912345678", expires_at: link.expires_at, server_now: "2026-10-09T12:01:00.000Z" });
    expect(cookieSet).toHaveBeenCalledWith("account_claim_context", raw, expect.objectContaining({ httpOnly: true, secure: true, sameSite: "strict", maxAge: 240 }));
    expect(await establishClaimContext(request())).toEqual({ phone_number: "+84912345678", expires_at: link.expires_at, server_now: "2026-10-09T12:01:00.000Z" });
    expect(rows("accountClaimLink")[0].consumed_at).toBeNull();
    vi.setSystemTime(new Date(now.getTime() + 300000));
    await expect(establishClaimContext(request())).rejects.toMatchObject({ reason: "CLAIM_LINK_INVALID" });
  });
  it("regenerate loại link cũ và Google challenge phụ thuộc nó", async () => {
    const first = await legacyLink(); const oldRaw = new URL(first.url).hash.slice(1);
    await establishClaimContext(request(), oldRaw);
    attempt("CLAIM", { claim_link_id: rows("accountClaimLink")[0].id, claim_token_hash: digest(oldRaw) });
    const replacement = await issueClaimLink(request(), "legacy-qr", "admin");
    expect(replacement.url).not.toBe(first.url);
    await expect(establishClaimContext(request(), oldRaw)).rejects.toMatchObject({ reason: "CLAIM_LINK_INVALID" });
    await expect(authenticate()).rejects.toMatchObject({ reason: "CLAIM_LINK_INVALID" });
    expect(rows("session")).toEqual([]);
  });
  it("nhận bằng mật khẩu bị ngừng, không consume link hoặc tạo credential/reward/session", async () => {
    const link = await legacyLink(); await establishClaimContext(request(), new URL(link.url).hash.slice(1));
    const input = { password: "secret12", password_confirmation: "secret12", turnstile_token: "test-captcha" };
    await expect(claimWithPassword(request(), input, "203.0.113.1")).rejects.toMatchObject({ reason: "GOOGLE_CLAIM_REQUIRED", status: 410 });
    expect(rows("welcomeReward")).toEqual([]); expect(rows("session")).toEqual([]);
    expect(rows("accountClaimLink")[0].consumed_at).toBeNull();
    expect(rows("user").find(user => user.id === "legacy")?.password_hash).toBeNull();
  });
  it("CLAIM chuẩn bị ngay không CAPTCHA/DB write, thời hạn không vượt link, rồi đăng nhập nhận điểm admin", async () => {
    const link = await legacyLink(); await establishClaimContext(request(), new URL(link.url).hash.slice(1));
    vi.setSystemTime(new Date(now.getTime() + 60000));
    rows("welcomeRewardSettings").push({ id: 1, mode: "POINTS", points_amount: 17 });
    boundary.transaction.mockClear();
    const prepared = await createGoogleChallenge(request(), GoogleChallengeSchema.parse({ purpose: "CLAIM" }), "203.0.113.1");
    expect(prepared.challenge_id).toMatch(/^claim\./);
    expect(prepared.expires_at).toBe(link.expires_at);
    expect(boundary.transaction).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(rows("googleAuthAttempt")).toEqual([]);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ success: true, hostname: "matcha.example", action: "google_auth" }))));
    const input = GoogleCredentialSchema.parse({ challenge_id: prepared.challenge_id, credential: "provider-credential", turnstile_token: "captcha" });
    const result = await authenticateGoogle(request(), input);
    expect(result).toMatchObject({ user: { id: "legacy", google_sub: "verified-sub", points_balance: 24, password_hash: null }, welcome: { mode: "POINTS", status: "COMPLETED", points: 17 } });
    if ("reauth_proof" in result) throw new Error("Expected account session");
    expect(await publishAccountSession(result)).toMatchObject({ qr_token: "legacy-qr", welcome_reward: { points: 17 } });
    expect(rows("session")).toHaveLength(1); expect(rows("welcomeReward")).toHaveLength(1);
    expect(jar.has("account_claim_context")).toBe(false);
    await expect(authenticateGoogle(request(), input)).rejects.toMatchObject({ reason: "GOOGLE_CHALLENGE_INVALID" });
    expect(rows("session")).toHaveLength(1); expect(rows("welcomeReward")).toHaveLength(1);
  });
  it("CLAIM nhận GACHA pending theo config admin và đăng nhập mà chưa mở quà", async () => {
    const link = await legacyLink(); await establishClaimContext(request(), new URL(link.url).hash.slice(1));
    rows("welcomeRewardSettings").push({ id: 1, mode: "GACHA", points_amount: 11,
      activeCampaign: { id: "campaign", status: "ACTIVE", poolItems: [{ id: "pool", quantity: 2 }] } });
    const prepared = await createGoogleChallenge(request(), { purpose: "CLAIM" }, "203.0.113.1");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ success: true, hostname: "matcha.example", action: "google_auth" }))));
    const result = await authenticateGoogle(request(), { challenge_id: prepared.challenge_id, credential: "provider-credential", turnstile_token: "captcha" });
    expect(result).toMatchObject({ user: { id: "legacy", points_balance: 7 }, welcome: { mode: "GACHA", status: "PENDING", points: null } });
    expect(rows("welcomeReward")).toMatchObject([{ user_id: "legacy", campaign_id: "campaign", points_amount: 11 }]);
    expect(rows("rewardOutcome")).toEqual([]); expect(rows("session")).toHaveLength(1);
  });
  it.each(["cookie", "regenerated", "expired", "purpose", "actor", "actor-password", "revoked-session", "captcha"])("CLAIM chuẩn bị từ chối %s mà không nhận tài khoản/quà", async kind => {
    const link = await legacyLink(); const raw = new URL(link.url).hash.slice(1);
    if (["actor", "actor-password", "revoked-session"].includes(kind)) {
      rows("user").push(customer("google-source", { google_sub: "verified-sub", email: "customer@gmail.com", password_hash: "old-hash" }));
      rows("session").push({ id: "actor-session", user_id: "google-source", expires_at: new Date(now.getTime() + 600000) });
      boundary.session.mockResolvedValue({ id: "google-source", role: "CUSTOMER", session_id: "actor-session" });
    }
    await establishClaimContext(request(), raw);
    const prepared = await createGoogleChallenge(request(), { purpose: "CLAIM" }, "203.0.113.1");
    const claims = JSON.parse(Buffer.from(prepared.challenge_id.split(".")[2], "base64url").toString()) as Row;
    expect(Object.values(claims)).not.toContain("google-source");
    expect(Object.values(claims)).not.toContain(rows("accountClaimLink")[0].id);
    if (kind === "cookie") jar.set("account_claim_context", "b".repeat(64));
    if (kind === "regenerated") await issueClaimLink(request(), "legacy-qr", "admin");
    if (kind === "expired") vi.setSystemTime(new Date(now.getTime() + 300000));
    if (kind === "actor") boundary.session.mockResolvedValue(null);
    if (kind === "actor-password") rows("user").find(user => user.id === "google-source")!.password_hash = "new-hash";
    if (kind === "revoked-session") tables.session = [];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ success: kind !== "captcha", hostname: "matcha.example", action: "google_auth" }))));
    const challengeId = kind === "purpose" ? prepared.challenge_id.replace(/^claim\./, "login.") : prepared.challenge_id;
    const error = ["cookie", "regenerated"].includes(kind) ? "CLAIM_LINK_INVALID" : ["actor", "actor-password", "revoked-session"].includes(kind) ? "ACCOUNT_SESSION_EXPIRED" : kind === "captcha" ? "TURNSTILE_REJECTED" : "GOOGLE_CHALLENGE_INVALID";
    await expect(authenticateGoogle(request(), { challenge_id: challengeId, credential: "provider-credential", turnstile_token: "captcha" })).rejects.toMatchObject({ reason: error });
    expect(rows("accountClaimLink")[0].consumed_at).toBeNull();
    expect(rows("user").find(user => user.id === "legacy")?.google_sub).toBeNull();
    expect(rows("welcomeReward")).toEqual([]); expect(rows("accountMerge")).toEqual([]);
    expect(rows("session").filter(session => session.user_id === "legacy")).toEqual([]);
  });
  it("Google claim merge giữ legacy canonical, mọi voucher/history và không cấp welcome lần hai", async () => {
    const link = await legacyLink(); const raw = new URL(link.url).hash.slice(1);
    rows("user").push(customer("google-source", { name: "Google Customer", email: "customer@gmail.com", google_sub: "verified-sub", insta_name: "google.insta", phone_number: "+84987654321", points_balance: 23 }));
    rows("pointsLog").push({ id: "source-earned", user_id: "google-source", delta: 23, reason: "welcome_bonus" });
    rows("voucher").push({ id: "target-voucher", user_id: "legacy", status: "REDEEMED", redeemed_order_id: "old-order" }, { id: "source-voucher", user_id: "google-source", status: "ACTIVE", issued_via: "WELCOME_GIFT" });
    rows("order").push({ id: "source-order", user_id: "google-source", total: 72000, items: [{ price: 72000 }] });
    rows("welcomeReward").push({ id: "source-welcome", user_id: "google-source", mode: "FIXED_VOUCHER", campaign_id: null, points_amount: 23 });
    rows("rewardOutcome").push({ id: "source-outcome", welcome_reward_id: "source-welcome", user_id: "google-source", kind: "VOUCHER", voucher_id: "source-voucher", campaign_id: null, pool_item_id: null, box_id: null, draw_number: null });
    rows("session").push({ id: "source-session", user_id: "google-source", refresh_token: "old-source", previous_refresh_token: "older-source", expires_at: new Date(now.getTime() + 600000) });
    await establishClaimContext(request(), raw); attempt("CLAIM", { claim_link_id: rows("accountClaimLink")[0].id, claim_token_hash: digest(raw) });
    const result = await authenticate();
    expect(result).toMatchObject({ user: { id: "legacy", points_balance: 30, name: "Google Customer", insta_name: "google.insta", phone_number: "+84912345678", google_sub: "verified-sub", email: "customer@gmail.com" }, welcome: { id: "source-welcome", mode: "FIXED_VOUCHER", status: "COMPLETED", outcome_kind: "VOUCHER" } });
    if ("reauth_proof" in result) throw new Error("Expected account session");
    expect(await publishAccountSession(result)).toMatchObject({ qr_token: "legacy-qr" });
    expect(rows("user").find(user => user.id === "google-source")).toMatchObject({ points_balance: 0, email: null, phone_number: null, password_hash: null, google_sub: null, insta_name: null });
    expect(rows("accountMerge")).toMatchObject([{ source_user_id: "google-source", target_user_id: "legacy", proof_kind: "GOOGLE_CLAIM", audit: { source_points: 23, target_points: 7, merged_points: 30 } }]);
    expect(rows("voucher")).toEqual([{ id: "target-voucher", user_id: "legacy", status: "REDEEMED", redeemed_order_id: "old-order" }, { id: "source-voucher", user_id: "legacy", status: "ACTIVE", issued_via: "WELCOME_GIFT" }]);
    expect(rows("order")).toEqual([{ id: "source-order", user_id: "legacy", total: 72000, items: [{ price: 72000 }] }]);
    expect(rows("pointsLog")).toEqual([{ id: "earned-before", user_id: "legacy", delta: 10, reason: "order_completed" }, { id: "source-earned", user_id: "legacy", delta: 23, reason: "welcome_bonus" }]);
    expect(rows("welcomeReward")).toMatchObject([{ id: "source-welcome", user_id: "legacy" }]); expect(rows("welcomeReward")).toHaveLength(1);
    expect(rows("rewardOutcome")).toMatchObject([{ id: "source-outcome", user_id: "legacy", voucher_id: "source-voucher" }]);
    expect(rows("session")).toMatchObject([{ user_id: "legacy" }]); expect(rows("session")).toHaveLength(1);
    expect(result).toMatchObject({ evicted: expect.arrayContaining(["old-source", "older-source"]) });
    await expect(authenticate()).rejects.toMatchObject({ reason: "GOOGLE_CHALLENGE_INVALID" });
  });
  it("merge hai welcome giữ entitlement target, history source và tất cả voucher kể cả package trùng", async () => {
    const link = await legacyLink(); const raw = new URL(link.url).hash.slice(1);
    rows("user").push(customer("google-source", { name: "Google Customer", email: "customer@gmail.com", google_sub: "verified-sub", points_balance: 23 }));
    rows("welcomeReward").push({ id: "target-welcome", user_id: "legacy", mode: "GACHA", campaign_id: "campaign" }, { id: "source-welcome", user_id: "google-source", mode: "GACHA", campaign_id: "campaign" });
    rows("rewardOutcome").push({ id: "source-outcome", welcome_reward_id: "source-welcome", user_id: "google-source", kind: "VOUCHER", voucher_id: "source-voucher" });
    rows("voucherGrant").push({ id: "target-grant", user_id: "legacy", package_id: "same-package" }, { id: "source-duplicate-grant", user_id: "google-source", package_id: "same-package" }, { id: "source-unique-grant", user_id: "google-source", package_id: "other-package" });
    rows("voucher").push({ id: "target-voucher", user_id: "legacy", grant_id: "target-grant", status: "ACTIVE" }, { id: "source-voucher", user_id: "google-source", grant_id: "source-duplicate-grant", status: "REDEEMED" });
    await establishClaimContext(request(), raw); attempt("CLAIM", { claim_link_id: rows("accountClaimLink")[0].id, claim_token_hash: digest(raw) });
    expect(await authenticate()).toMatchObject({ user: { id: "legacy", points_balance: 30 }, welcome: { id: "target-welcome", mode: "GACHA", status: "PENDING" } });
    expect(rows("welcomeReward")).toEqual([{ id: "target-welcome", user_id: "legacy", mode: "GACHA", campaign_id: "campaign" }, { id: "source-welcome", user_id: "google-source", mode: "GACHA", campaign_id: "campaign" }]);
    expect(rows("rewardOutcome")).toEqual([{ id: "source-outcome", welcome_reward_id: "source-welcome", user_id: "google-source", kind: "VOUCHER", voucher_id: "source-voucher" }]);
    expect(rows("voucherGrant")).toEqual([{ id: "target-grant", user_id: "legacy", package_id: "same-package" }, { id: "source-duplicate-grant", user_id: "google-source", package_id: "same-package" }, { id: "source-unique-grant", user_id: "legacy", package_id: "other-package" }]);
    expect(rows("voucher")).toEqual([{ id: "target-voucher", user_id: "legacy", grant_id: "target-grant", status: "ACTIVE" }, { id: "source-voucher", user_id: "legacy", grant_id: "source-duplicate-grant", status: "REDEEMED" }]);
    expect(rows("accountMerge")).toMatchObject([{ source_user_id: "google-source", target_user_id: "legacy", audit: { retained_grant_ids: ["source-duplicate-grant"], source_welcome_reward_id: "source-welcome", target_welcome_reward_id: "target-welcome", welcome_reward_action: "RETAIN_SOURCE_AUDIT" } }]);
  });
  it("conditional claim loser không chuyển credential hoặc tạo session — SIMULATED_RACE_OUTCOME", async () => {
    const link = await legacyLink(); const raw = new URL(link.url).hash.slice(1);
    await establishClaimContext(request(), raw); attempt("CLAIM", { claim_link_id: rows("accountClaimLink")[0].id, claim_token_hash: digest(raw) }); claimLoser = true;
    await expect(authenticate()).rejects.toMatchObject({ reason: "CLAIM_LINK_INVALID" });
    expect(rows("user").find(user => user.id === "legacy")?.google_sub).toBeNull();
    expect(rows("accountMerge")).toEqual([]); expect(rows("welcomeReward")).toEqual([]); expect(rows("session")).toEqual([]);
  });
  it("LINK hợp nhất email ghost vào tài khoản legacy đã đăng nhập, giữ password và điểm", async () => {
    rows("user").push(customer("email-ghost", { email: "customer@gmail.com", points_balance: 11 }), customer("legacy", { name: "Legacy Full", insta_name: "legacy.insta", account_origin: "LEGACY_PHONE", phone_number: "+84912345678", password_hash: "legacy-hash", points_balance: 7 }));
    rows("pointsLog").push({ id: "ghost-earned", user_id: "email-ghost", delta: 11, reason: "order_completed" });
    rows("session").push({ id: "actor-session", user_id: "legacy", refresh_token: "old-actor", expires_at: new Date(now.getTime() + 600000) });
    boundary.session.mockResolvedValue({ id: "legacy", role: "CUSTOMER", session_id: "actor-session" });
    attempt("LINK", { actor_user_id: "legacy", actor_session_id: "actor-session" });
    expect(await authenticate()).toMatchObject({ user: { id: "legacy", points_balance: 18, name: "Legacy Full", insta_name: "legacy.insta", password_hash: "legacy-hash", email: "customer@gmail.com", google_sub: "verified-sub" }, welcome: null });
    expect(rows("pointsLog")).toEqual([{ id: "ghost-earned", user_id: "legacy", delta: 11, reason: "order_completed" }]);
    expect(rows("accountMerge")).toMatchObject([{ source_user_id: "email-ghost", target_user_id: "legacy" }]);
  });
});
