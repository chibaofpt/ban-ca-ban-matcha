import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RegistrationOtpSettings } from "@/contracts/registrationOtp";
import type { AuthSession } from "@/lib/auth";
import type { Prisma } from "@prisma/client";
import { OtpRedisFake, otpEnvironment, otpRequest } from "./registration-otp.fixtures";
import { registrationOtpDay, registrationOtpKey, registrationOtpNamespace } from "@/lib/auth/registrationOtpCrypto";
import { POST as sendPOST } from "@/app/api/profile/phone/otp/route";
import { phoneClaimContext, confirmPhoneClaimOtp } from "@/lib/auth/accountPhone";
import { preparePhoneOtpProof } from "@/lib/auth/phoneOtpProof";
import { GET as settingsGET, PUT as settingsPUT } from "@/app/api/admin/users/registration-settings/route";
import { POST as balancePOST } from "@/app/api/admin/users/registration-settings/balance/route";

interface Row { id: string; phone_number: string; binding_hash: string | null; code_hash: string; expires_at: Date; verified: boolean; attempts: number; purpose: string; actor_user_id: string; actor_session_id: string; target_user_id: string }
type Query = { where: Record<string, unknown>; data?: Record<string, unknown> };
const m = vi.hoisted(() => {
  process.env.JWT_SECRET = "registration-jwt-test-secret-at-least-32-chars";
  return { settingsRead: vi.fn(), settingsUpdate: vi.fn(), userFind: vi.fn(), otpFind: vi.fn(), otpUpdate: vi.fn(), transaction: vi.fn(), provider: vi.fn(), balance: vi.fn(),
    session: null as AuthSession | null, cookie: "a".repeat(64), redis: null as OtpRedisFake | null };
});
vi.mock("@/lib/prisma", () => ({ prisma: {
  registrationOtpSettings: { findUnique: m.settingsRead, updateMany: m.settingsUpdate },
  user: { findUnique: m.userFind }, otpAttempt: { findUnique: m.otpFind, updateMany: m.otpUpdate },
  $transaction: (fn: (tx: Prisma.TransactionClient) => Promise<unknown>) => m.transaction(fn),
} }));
vi.mock("@/lib/redis", () => ({ getRegistrationOtpRedisClient: () => m.redis, cacheDelete: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => m.cookie ? { value: m.cookie } : undefined, set: vi.fn() }) }));
vi.mock("@/lib/auth", async original => ({ ...await original<typeof import("@/lib/auth")>(), getSession: async () => m.session }));
vi.mock("@/lib/rateLimit", () => ({ getClientIp: () => "203.0.113.1", checkRateLimits: vi.fn().mockResolvedValue({ allowed: true }) }));
vi.mock("@/lib/sms/abenla", async original => ({ ...await original<typeof import("@/lib/sms/abenla")>(), sendAbenlaOtp: m.provider, getAbenlaBalance: m.balance }));

const actor: AuthSession = { id: "google-user", role: "CUSTOMER", phone_number: null, session_id: "actor-session" };
const input = { phone_number: "0912345678" };
let sequence = 1;
function sendInput(fields: Record<string, unknown> = {}) {
  return { ...input, request_id: "550e8400-e29b-41d4-a716-" + String(sequence++).padStart(12, "0"), turnstile_token: "token", ...fields };
}
describe("OTP claim phone collision — APPLICATION_LOGIC / RATE_LIMIT_POLICY / kết quả DB kiểm soát", () => {
  let settings: RegistrationOtpSettings;
  let rows: Map<string, Row>;
  let users: Map<string, Record<string, unknown>>;
  let redis: OtpRedisFake;
  let failAdmissionCommit: boolean;
  let settingsUnavailable: boolean;
  let sessions: { id: string; user_id: string; refresh_token: string; expires_at: Date }[];
  const fetchMock = vi.fn();
  const dayKey = () => registrationOtpNamespace() + ":day:" + registrationOtpDay().date;
  beforeEach(() => {
    vi.clearAllMocks(); otpEnvironment(); vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-03T10:00:00Z")); vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset().mockImplementation(async () => new Response(JSON.stringify({ success: true, hostname: "matcha.example", action: "phone_claim" })));
    settings = { otp_enabled: true, daily_send_limit: 100, revision: 0 }; rows = new Map(); users = new Map(); redis = new OtpRedisFake(); m.redis = redis;
    const base = { name: "Khách", role: "CUSTOMER", is_blocked: false, is_verified: false, sourceMerge: null, password_hash: null, insta_name: null, email: null, pointsLogs: [], vouchers: [], points_balance: 0 };
    users.set(actor.id, { ...base, id: actor.id, account_origin: "GOOGLE_EMAIL", google_sub: "google-sub", phone_number: null, email: "ca@gmail.com", points_balance: 5 });
    for (const [id, phone] of [["ghost", "+84912345678"], ["second-ghost", "+84987654321"]]) users.set(id, { ...base, id, account_origin: "LEGACY_PHONE", google_sub: null, phone_number: phone, pointsLogs: [{ id: id + "-earned" }], points_balance: 7 });
    sessions = [{ id: "actor-session", user_id: actor.id, refresh_token: "old-actor", expires_at: new Date("2099-01-01") }];
    m.cookie = "a".repeat(64); m.session = actor; failAdmissionCommit = false; settingsUnavailable = false;
    m.settingsRead.mockImplementation(async () => { if (settingsUnavailable) throw new Error("Settings unavailable"); return { id: 1, ...settings }; });
    m.settingsUpdate.mockImplementation(async ({ where, data = {} }: Query) => {
      if (where.revision !== settings.revision) return { count: 0 };
      if ("otp_enabled" in data) settings.otp_enabled = Boolean(data.otp_enabled);
      if ("daily_send_limit" in data) settings.daily_send_limit = Number(data.daily_send_limit);
      if (typeof data.revision === "object") settings.revision++;
      return { count: 1 };
    });
    m.userFind.mockImplementation(async ({ where }: Query) => structuredClone([...users.values()].find(user => Object.entries(where).every(([key, value]) => user[key] === value)) ?? null));
    m.otpFind.mockImplementation(async ({ where }: Query) => rows.get(String(where.id)) ?? null);
    m.otpUpdate.mockImplementation(async ({ where, data = {} }: Query) => {
      let count = 0;
      for (const row of rows.values()) {
        if (where.id && where.id !== row.id || where.phone_number && where.phone_number !== row.phone_number ||
          typeof where.binding_hash === "string" && where.binding_hash !== row.binding_hash ||
          typeof where.binding_hash === "object" && !row.binding_hash || where.code_hash && where.code_hash !== row.code_hash ||
          where.purpose && where.purpose !== row.purpose || where.actor_user_id && where.actor_user_id !== row.actor_user_id ||
          where.actor_session_id && where.actor_session_id !== row.actor_session_id || where.target_user_id && where.target_user_id !== row.target_user_id ||
          where.verified !== undefined && where.verified !== row.verified || where.attempts && row.attempts >= Number((where.attempts as { lt: number }).lt) ||
          where.expires_at && row.expires_at <= (where.expires_at as { gt: Date }).gt) continue;
        if (typeof data.verified === "boolean") row.verified = data.verified;
        if (data.expires_at) row.expires_at = data.expires_at as Date;
        if (data.attempts) row.attempts++;
        count++;
      }
      return { count };
    });
    m.provider.mockResolvedValue({ deliveryStatus: "accepted", providerCode: 106, smsPerMessage: 1 }); m.balance.mockResolvedValue(0);
    const emptyMove = { findMany: async () => [], updateMany: async () => ({ count: 0 }), update: async () => ({}) };
    const tx = {
      registrationOtpSettings: { findUnique: m.settingsRead, updateMany: m.settingsUpdate },
      otpAttempt: { findUnique: m.otpFind, updateMany: m.otpUpdate, create: async ({ data }: { data: Row }) => { const row = { ...data, attempts: 0, verified: false }; rows.set(row.id, row); return row; } },
      user: { findUnique: m.userFind,
        updateMany: async ({ where, data = {} }: Query) => { const user = users.get(String(where.id)); if (!user || user.role !== where.role || user.is_blocked || user.sourceMerge) return { count: 0 }; Object.assign(user, data); return { count: 1 }; },
        update: async ({ where, data = {} }: Query) => { const user = users.get(String(where.id))!; Object.assign(user, data); return user; } },
      session: { findFirst: async ({ where }: Query) => sessions.find(session => session.id === where.id && session.user_id === where.user_id) ?? null,
        findMany: async ({ where }: Query) => typeof where.user_id === "string" ? sessions.filter(session => session.user_id === where.user_id) : sessions,
        deleteMany: async () => { sessions = []; return { count: 1 }; },
        create: async ({ data }: { data: { user_id: string; expires_at: Date } }) => { const row = { id: "canonical-session", refresh_token: "canonical-refresh", ...data }; sessions.push(row); return row; } },
      accountMerge: { create: async ({ data }: { data: { source_user_id: string; target_user_id: string } }) => { users.get(data.source_user_id)!.sourceMerge = { target_user_id: data.target_user_id }; return data; } },
      welcomeReward: emptyMove, rewardOutcome: emptyMove, order: emptyMove, pointsLog: emptyMove, voucher: emptyMove, voucherGrant: emptyMove, address: emptyMove, pushSubscription: emptyMove,
    };
    m.transaction.mockImplementation(async (fn: (client: unknown) => Promise<unknown>) => {
      const snapshot = structuredClone({ rows, users, sessions });
      try { const result = await fn(tx); if (failAdmissionCommit) { failAdmissionCommit = false; throw Object.assign(new Error("Controlled commit conflict"), { code: "P2034" }); } return result; }
      catch (error) { rows = snapshot.rows; users = snapshot.users; sessions = snapshot.sessions; throw error; }
    });
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  async function send(fields: Record<string, unknown> = {}) {
    const payload = sendInput(fields), response = await sendPOST(otpRequest(payload));
    return { response, payload, body: await response.json() };
  }
  it("gửi đúng sáu chữ số, replay giữ deadline và trả server_now mới", async () => {
    const sent = await send(); expect(sent.response.status).toBe(200);
    const [phone, code, id, template] = m.provider.mock.calls[0];
    expect(phone).toBe("+84912345678"); expect(code).toMatch(/^\d{6}$/); expect(template).toBe("{otp}"); expect(id).toBe(sent.body.data.challenge_id);
    expect(sent.body.data.server_now).toBe("2026-10-03T10:00:00.000Z");
    vi.setSystemTime(new Date("2026-10-03T10:01:00Z"));
    const replay = await sendPOST(otpRequest(sent.payload)); const repeated = (await replay.json()).data;
    expect(repeated).toMatchObject({ challenge_id: id, expires_at: "2026-10-03T10:05:00.000Z", resend_at: "2026-10-03T10:02:00.000Z", server_now: "2026-10-03T10:01:00.000Z" });
    expect(m.provider).toHaveBeenCalledOnce(); expect(users.get(actor.id)?.phone_number).toBeNull();
  });
  it("OTP hợp lệ merge vào legacy canonical và không thể dùng lại", async () => {
    const sent = await send(); const otp = String(m.provider.mock.calls[0][1]);
    const payload = { phone_number: "+84912345678", challenge_id: sent.body.data.challenge_id, otp };
    expect(await confirmPhoneClaimOtp(otpRequest({}), actor, payload)).toMatchObject({ user: { id: "ghost", points_balance: 12, google_sub: "google-sub", phone_number: "+84912345678" }, welcome: null, evicted: ["old-actor"] });
    expect(rows.get(payload.challenge_id)?.verified).toBe(true);
    expect(users.get(actor.id)).toMatchObject({ phone_number: null, google_sub: null, email: null, points_balance: 0, sourceMerge: { target_user_id: "ghost" } });
    expect(sessions).toMatchObject([{ user_id: "ghost" }]); expect(sessions).toHaveLength(1);
    await expect(confirmPhoneClaimOtp(otpRequest({}), actor, payload)).rejects.toMatchObject({ reason: "ACCOUNT_NOT_ACTIVE" });
    expect(sessions).toHaveLength(1);
  });
  it.each(["actor", "session", "target"])("OTP từ chối %s khác trước khi đếm mã sai", async kind => {
    const sent = await send(); const id = sent.body.data.challenge_id;
    const context = await phoneClaimContext(otpRequest({}), actor, "+84912345678");
    const changed = { ...context, ...(kind === "actor" ? { actorUserId: "other-actor" } : kind === "session" ? { actorSessionId: "other-session" } : { targetUserId: "second-ghost" }) };
    await expect(preparePhoneOtpProof({ phone_number: "+84912345678", challenge_id: id, otp: "999999" }, changed)).rejects.toMatchObject({ reason: "OTP_INVALID" });
    expect(rows.get(id)?.attempts).toBe(0); expect(redis.get(registrationOtpKey("wrong", "+84912345678"))).toBeNull();
  });
  it("năm mã sai qua resend khóa phone và không trả phí gửi tiếp", async () => {
    const first = await send();
    const context = await phoneClaimContext(otpRequest({}), actor, "+84912345678");
    for (let n = 0; n < 2; n++) {
      const wrong = String(m.provider.mock.calls.at(-1)?.[1]) === "999999" ? "000000" : "999999";
      await expect(preparePhoneOtpProof({ phone_number: "+84912345678", challenge_id: first.body.data.challenge_id, otp: wrong }, context)).rejects.toMatchObject({ reason: "OTP_INVALID" });
    }
    vi.setSystemTime(Date.now() + 120000); const second = await send();
    for (let n = 0; n < 3; n++) {
      const wrong = String(m.provider.mock.calls.at(-1)?.[1]) === "999999" ? "000000" : "999999";
      await expect(preparePhoneOtpProof({ phone_number: "+84912345678", challenge_id: second.body.data.challenge_id, otp: wrong }, context)).rejects.toMatchObject({ reason: n === 2 ? "OTP_LOCKED" : "OTP_INVALID" });
    }
    expect(rows.get(first.body.data.challenge_id)?.attempts).toBe(2); expect(rows.get(second.body.data.challenge_id)?.attempts).toBe(3);
    expect((await send()).response.status).toBe(429); expect(m.provider).toHaveBeenCalledTimes(2); expect(redis.get(dayKey())).toBe(2);
  });
  it("OTP tắt, provider unknown và store lỗi không attach hoặc merge", async () => {
    settings.otp_enabled = false;
    expect((await send()).response.status).toBe(409);
    settings.otp_enabled = true; m.provider.mockResolvedValue({ deliveryStatus: "unknown", providerCode: null, smsPerMessage: null });
    const sent = await send(); const context = await phoneClaimContext(otpRequest({}), actor, "+84912345678");
    await expect(preparePhoneOtpProof({ phone_number: "+84912345678", challenge_id: sent.body.data.challenge_id, otp: String(m.provider.mock.calls[0][1]) }, context)).rejects.toMatchObject({ reason: "OTP_INVALID" });
    redis.unavailable = true; expect((await send()).response.status).toBe(503);
    expect(users.get(actor.id)).toMatchObject({ phone_number: null, sourceMerge: null }); expect(users.get("ghost")?.google_sub).toBeNull();
  });
  it("settings hoặc cấu hình thiếu thất bại rõ ràng", async () => {
    settingsUnavailable = true; expect((await send()).response.status).toBe(503);
    settingsUnavailable = false; vi.stubEnv("REGISTRATION_OTP_SECRET", "short"); expect((await send()).response.status).toBe(503);
    expect(users.get(actor.id)?.phone_number).toBeNull(); expect(m.provider).not.toHaveBeenCalled();
  });
  it("từ chối CAPTCHA không tăng phone/IP/day trả phí và replay lỗi đã lưu", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ success: false, "error-codes": ["invalid-input-response"] })));
    const rejected = await send();
    expect(rejected.response.status).toBe(403); expect(m.provider).not.toHaveBeenCalled();
    expect(redis.get(registrationOtpKey("cycle", "+84912345678"))).toBeNull(); expect(redis.get(dayKey())).toBeNull();
    expect((await sendPOST(otpRequest(rejected.payload))).status).toBe(403);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("outage Siteverify giữ hạn mức với CAPTCHA token hợp lệ theo adapter policy", async () => {
    fetchMock.mockRejectedValue(new TypeError("network"));
    const sent = await send();
    expect(sent.response.status).toBe(200); expect(m.provider).toHaveBeenCalledOnce(); expect(redis.get(dayKey())).toBe(1);
  });
  it("giữ reservation khi provider unknown và replay không gọi lại provider/CAPTCHA", async () => {
    m.provider.mockResolvedValue({ deliveryStatus: "unknown", providerCode: null, smsPerMessage: null });
    const sent = await send(); expect(sent.body.data.delivery_status).toBe("unknown");
    expect((await sendPOST(otpRequest(sent.payload))).status).toBe(200);
    expect(m.provider).toHaveBeenCalledOnce(); expect(fetchMock).toHaveBeenCalledOnce(); expect(redis.get(dayKey())).toBe(1);
    const conflict = await sendPOST(otpRequest({ ...sent.payload, phone_number: "0987654321" }));
    expect(conflict.status).toBe(409); expect((await conflict.json()).details.reason).toBe("REQUEST_ID_CONFLICT");
  });
  it("replay in-flight trả unknown, chỉ owner được gọi provider — SIMULATED_RACE_OUTCOME", async () => {
    let resolveProvider!: (data: unknown) => void;
    m.provider.mockImplementation(() => new Promise((resolve) => { resolveProvider = resolve; }));
    const payload = sendInput();
    const pending = sendPOST(otpRequest(payload));
    for (let n = 0; n < 20 && !resolveProvider; n++) await new Promise((resolve) => setTimeout(resolve, 0));
    expect(resolveProvider).toBeTypeOf("function");
    const replay = await sendPOST(otpRequest(payload));
    expect((await replay.json()).data.delivery_status).toBe("unknown");
    resolveProvider({ deliveryStatus: "accepted", providerCode: 106, smsPerMessage: 1 });
    expect((await pending).status).toBe(200); expect(m.provider).toHaveBeenCalledOnce(); expect(redis.get(dayKey())).toBe(1);
  });
  it("chỉ thử lại xung đột DB trước admission Redis, gửi provider một lần — SIMULATED_RACE_OUTCOME", async () => {
    m.transaction.mockRejectedValueOnce(Object.assign(new Error("Controlled pre-admission conflict"), { code: "P2034" }));
    const sent = await send();
    expect(sent.response.status).toBe(200);
    expect(m.transaction).toHaveBeenCalledTimes(2);
    expect(m.provider).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(redis.get(dayKey())).toBe(1);
    expect(rows.size).toBe(1);
  });
  it("không thử lại sau Redis reservation khi DB commit xung đột, không gửi provider — SIMULATED_RACE_OUTCOME", async () => {
    failAdmissionCommit = true;
    const sent = await send();
    expect(sent.response.status).toBe(503);
    expect(m.transaction).toHaveBeenCalledOnce();
    expect(m.provider).not.toHaveBeenCalled();
    expect(redis.get(dayKey())).toBe(1);
    expect(rows.size).toBe(0);
    expect((await sendPOST(otpRequest(sent.payload))).status).toBe(503);
    expect(m.transaction).toHaveBeenCalledOnce();
  });
  it("revision guard thua admin tắt OTP trước Redis không giữ chỗ trả phí — SIMULATED_RACE_OUTCOME", async () => {
    m.settingsUpdate.mockImplementationOnce(async () => {
      settings.revision++; settings.otp_enabled = false; return { count: 0 };
    });
    expect((await send()).response.status).toBe(409);
    expect(redis.get(dayKey())).toBeNull();
    expect(m.provider).not.toHaveBeenCalled();
  });
  it("áp dụng hạn mức giảm trong lúc CAPTCHA chờ bằng lần đọc settings mới", async () => {
    await send();
    let resolveCaptcha!: (value: Response) => void;
    fetchMock.mockImplementation(() => new Promise((resolve) => { resolveCaptcha = resolve; }));
    const pending = sendPOST(otpRequest(sendInput({ phone_number: "0987654321" })));
    for (let n = 0; n < 20 && !resolveCaptcha; n++) await new Promise((resolve) => setTimeout(resolve, 0));
    settings.daily_send_limit = 1; settings.revision++;
    resolveCaptcha(new Response(JSON.stringify({ success: true, hostname: "matcha.example", action: "phone_claim" })));
    const response = await pending;
    expect(response.status).toBe(429);
    expect((await response.json()).details.reason).toBe("DAILY_LIMIT");
    expect(redis.get(dayKey())).toBe(1);
    expect(redis.get(registrationOtpKey("cycle", "+84987654321"))).toBeNull();
    expect(m.provider).toHaveBeenCalledOnce();
  });
  it("settings mới chặn admission khi admin tắt trong lúc CAPTCHA chờ", async () => {
    let resolveCaptcha!: (value: Response) => void;
    fetchMock.mockImplementation(() => new Promise((resolve) => { resolveCaptcha = resolve; }));
    const pending = sendPOST(otpRequest(sendInput()));
    for (let n = 0; n < 20 && !resolveCaptcha; n++) await new Promise((resolve) => setTimeout(resolve, 0));
    settings.otp_enabled = false;
    resolveCaptcha(new Response(JSON.stringify({ success: true, hostname: "matcha.example", action: "phone_claim" })));
    const response = await pending; expect(response.status).toBe(409);
    expect(redis.get(dayKey())).toBeNull(); expect(m.provider).not.toHaveBeenCalled();
  });
  it("admin kiểm tra 401/403 và revision, cho số dư không, giữ settings khi stats lỗi", async () => {
    m.session = null; expect((await settingsGET()).status).toBe(401);
    m.session = { id: "staff", role: "STAFF", phone_number: null }; expect((await balancePOST()).status).toBe(403);
    m.session = { id: "admin", role: "ADMIN", phone_number: null };
    expect((await settingsPUT(otpRequest({ otp_enabled: false, daily_send_limit: 200, revision: 1 }))).status).toBe(409);
    const saved = await settingsPUT(otpRequest({ otp_enabled: false, daily_send_limit: 200, revision: 0 }));
    expect((await saved.json()).data).toEqual({ otp_enabled: false, daily_send_limit: 200, revision: 1 });
    expect((await (await balancePOST()).json()).data.balance).toBe(0);
    redis.unavailable = true;
    const response = await settingsGET();
    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({ otp_enabled: false, today_reserved_count: null, estimated_cost_vnd: null, stats_unavailable: true });
  });
});
