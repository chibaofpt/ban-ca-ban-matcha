import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RegistrationOtpSettings } from "@/contracts/registrationOtp";
import type { Prisma } from "@prisma/client";
import { OtpRedisFake, otpEnvironment, otpRequest } from "./registration-otp.fixtures";
import { registrationOtpDay, registrationOtpKey, registrationOtpNamespace } from "@/lib/auth/registrationOtpCrypto";
import { POST as sendPOST, GET as configGET } from "@/app/api/auth/register/otp/route";
import { POST as registerPOST } from "@/app/api/auth/register/route";
import { GET as settingsGET, PUT as settingsPUT } from "@/app/api/admin/users/registration-settings/route";
import { POST as balancePOST } from "@/app/api/admin/users/registration-settings/balance/route";

interface Row { id: string; phone_number: string; binding_hash: string | null; code_hash: string; expires_at: Date; verified: boolean; attempts: number }
interface User { id: string; phone_number: string; name: string; password_hash: string; role: "CUSTOMER" | "STAFF" | "ADMIN"; is_blocked: boolean; is_verified: boolean; insta_name: string | null; points_balance: number }
type Query = { where: Record<string, unknown>; data?: Record<string, unknown> };
const m = vi.hoisted(() => {
  process.env.JWT_SECRET = "registration-jwt-test-secret-at-least-32-chars";
  return {
    settingsRead: vi.fn(), settingsUpdate: vi.fn(), userFind: vi.fn(), otpFind: vi.fn(),
    transaction: vi.fn(), provider: vi.fn(), balance: vi.fn(), welcome: vi.fn(), authCookies: vi.fn(),
    session: null as null | { id: string; role: string }, cookie: "a".repeat(64), cookieSet: vi.fn(),
    redis: null as OtpRedisFake | null,
  };
});
vi.mock("@/lib/prisma", () => ({ prisma: {
  registrationOtpSettings: { findUnique: (...args: unknown[]) => m.settingsRead(...args), updateMany: (...args: unknown[]) => m.settingsUpdate(...args) },
  user: { findUnique: (...args: unknown[]) => m.userFind(...args) },
  otpAttempt: { findUnique: (...args: unknown[]) => m.otpFind(...args) },
  $transaction: (fn: (tx: Prisma.TransactionClient) => Promise<unknown>) => m.transaction(fn),
} }));
vi.mock("@/lib/redis", () => ({ getRegistrationOtpRedisClient: () => m.redis, cacheDelete: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({
  get: () => m.cookie ? { value: m.cookie } : undefined,
  set: (...args: unknown[]) => { m.cookieSet(...args); if (args[0] === "registration_otp_flow") m.cookie = String(args[1]); },
}) }));
vi.mock("@/lib/auth", async (original) => ({
  ...await original<typeof import("@/lib/auth")>(),
  signJwt: vi.fn().mockResolvedValue("signed-token"), setAuthCookies: (...args: unknown[]) => m.authCookies(...args),
  getSession: async () => m.session,
}));
vi.mock("bcryptjs", () => ({ default: { hash: vi.fn().mockResolvedValue("hashed-password"), compare: vi.fn().mockResolvedValue(false) } }));
vi.mock("@/lib/sms/abenla", async (original) => ({
  ...await original<typeof import("@/lib/sms/abenla")>(),
  sendAbenlaOtp: (...args: unknown[]) => m.provider(...args), getAbenlaBalance: () => m.balance(),
}));
vi.mock("@/lib/rewards/welcomeReward", () => ({ createWelcomeRewardInTransaction: (...args: unknown[]) => m.welcome(...args) }));
vi.mock("@/lib/vouchers/autoGrantVouchers", () => ({ ensureAutoGrantedVouchers: vi.fn() }));

const input = { phone_number: "0912345678", name: "Bạn Cá", password: "secret12", insta_name: "ban.ca" };
let sequence = 1;
function sendInput(fields: Record<string, unknown> = {}) {
  return { ...input, request_id: "550e8400-e29b-41d4-a716-" + String(sequence++).padStart(12, "0"), turnstile_token: "token", ...fields };
}

describe("Luồng OTP đăng ký — APPLICATION_LOGIC / kết quả giao dịch kiểm soát", () => {
  let settings: RegistrationOtpSettings;
  let rows: Map<string, Row>;
  let users: Map<string, User>;
  let sessions: string[];
  let redis: OtpRedisFake;
  let failSession: boolean;
  let failAdmissionCommit: boolean;
  let settingsUnavailable: boolean;
  const fetchMock = vi.fn();
  const dayKey = () => registrationOtpNamespace() + ":day:" + registrationOtpDay().date;

  beforeEach(() => {
    vi.clearAllMocks(); otpEnvironment(); vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-03T10:00:00Z")); vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset().mockImplementation(async () => new Response(JSON.stringify({ success: true, hostname: "matcha.example", action: "registration_otp" })));
    settings = { otp_enabled: true, daily_send_limit: 100, revision: 0 };
    rows = new Map(); users = new Map(); sessions = []; redis = new OtpRedisFake(); m.redis = redis;
    m.cookie = "a".repeat(64); m.session = { id: "admin", role: "ADMIN" }; failSession = false; failAdmissionCommit = false; settingsUnavailable = false;
    m.settingsRead.mockImplementation(async () => {
      if (settingsUnavailable) throw new Error("Settings unavailable");
      return { id: 1, ...settings };
    });
    m.settingsUpdate.mockImplementation(async (query: Query) => {
      if (query.where.revision !== settings.revision) return { count: 0 };
      const data = query.data!;
      if ("otp_enabled" in data) settings.otp_enabled = Boolean(data.otp_enabled);
      if ("daily_send_limit" in data) settings.daily_send_limit = Number(data.daily_send_limit);
      if (typeof data.revision === "object") settings.revision++;
      return { count: 1 };
    });
    m.userFind.mockImplementation(async ({ where }: Query) => Array.from(users.values()).find((u) =>
      where.phone_number ? u.phone_number === where.phone_number : where.insta_name ? u.insta_name === where.insta_name : u.id === where.id) ?? null);
    m.otpFind.mockImplementation(async ({ where }: Query) => rows.get(String(where.id)) ?? null);
    m.provider.mockResolvedValue({ deliveryStatus: "accepted", providerCode: 106, smsPerMessage: 1 });
    m.balance.mockResolvedValue(0);
    m.welcome.mockResolvedValue({ id: "welcome-id", mode: "POINTS", status: "COMPLETED", outcome_kind: "POINTS" });
    const updateOtp = vi.fn(async ({ where, data = {} }: Query) => {
      let count = 0;
      for (const row of rows.values()) {
        if (where.id && where.id !== row.id || where.phone_number && where.phone_number !== row.phone_number ||
          typeof where.binding_hash === "string" && where.binding_hash !== row.binding_hash ||
          typeof where.binding_hash === "object" && !row.binding_hash ||
          where.code_hash && where.code_hash !== row.code_hash ||
          where.verified !== undefined && where.verified !== row.verified ||
          where.attempts && row.attempts >= Number((where.attempts as { lt: number }).lt) ||
          where.expires_at && row.expires_at <= (where.expires_at as { gt: Date }).gt) continue;
        if (typeof data.verified === "boolean") row.verified = data.verified;
        if (data.expires_at) row.expires_at = data.expires_at as Date;
        if (data.attempts) row.attempts++;
        count++;
      }
      return { count };
    });
    const tx = {
      registrationOtpSettings: { findUnique: m.settingsRead, updateMany: m.settingsUpdate },
      otpAttempt: {
        updateMany: updateOtp,
        create: vi.fn(async ({ data }: { data: Row }) => { const row = { ...data, attempts: 0, verified: false }; rows.set(row.id, row); return row; }),
      },
      user: {
        create: vi.fn(async ({ data }: { data: User }) => {
          const user = { ...data, id: data.id ?? "customer", role: data.role ?? "CUSTOMER", is_blocked: data.is_blocked ?? false, insta_name: data.insta_name ?? null };
          users.set(user.id, user); return user;
        }),
        updateMany: vi.fn(async ({ where, data }: Query) => {
          const user = users.get(String(where.id));
          if (!user || user.role !== where.role || user.is_blocked || user.password_hash !== where.password_hash) return { count: 0 };
          Object.assign(user, data); return { count: 1 };
        }),
        findUnique: m.userFind,
      },
      session: {
        findMany: vi.fn().mockResolvedValue([]), deleteMany: vi.fn(),
        create: vi.fn(async () => { if (failSession) { failSession = false; throw new Error("Controlled session failure"); }
          sessions.push("session"); return { id: "session", refresh_token: "refresh" }; }),
      },
    };
    m.transaction.mockImplementation(async (fn: (client: unknown) => Promise<unknown>) => {
      const snapshot = structuredClone({ rows, users, sessions });
      try {
        const result = await fn(tx);
        if (failAdmissionCommit) { failAdmissionCommit = false; throw Object.assign(new Error("Controlled commit conflict"), { code: "P2034" }); }
        return result;
      }
      catch (error) { rows = snapshot.rows; users = snapshot.users; sessions = snapshot.sessions; throw error; }
    });
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  async function send(fields: Record<string, unknown> = {}) {
    const payload = sendInput(fields), response = await sendPOST(otpRequest(payload));
    return { response, payload, body: await response.json() };
  }
  async function finalize(id: string, code?: string, fields: Record<string, unknown> = {}) {
    const otp = code ?? String(m.provider.mock.calls.at(-1)?.[1]);
    return registerPOST(otpRequest({ ...input, ...fields, challenge_id: id, otp }, "/api/auth/register"));
  }

  it("chỉ gửi sáu chữ số qua {otp}, resume trạng thái accepted, chưa tạo tài khoản trước xác nhận", async () => {
    const sent = await send();
    expect(sent.response.status).toBe(200);
    const [phone, code, id, template] = m.provider.mock.calls[0];
    expect(phone).toBe("+84912345678"); expect(code).toMatch(/^\d{6}$/); expect(template).toBe("{otp}");
    expect(id).toBe(sent.body.data.challenge_id);
    expect(users.size).toBe(0); expect(sessions).toHaveLength(0); expect(m.welcome).not.toHaveBeenCalled();
    const resumed = await configGET(new Request("https://matcha.example/api/auth/register/otp"));
    expect(resumed.headers.get("Cache-Control")).toBe("no-store");
    expect((await resumed.json()).data.challenge).toMatchObject({ challenge_id: id, delivery_status: "accepted", provider_code: 106 });
  });
  it("consume OTP trong nhánh tạo tài khoản verified cùng welcome/session đúng một lần", async () => {
    const { body } = await send();
    const response = await finalize(body.data.challenge_id);
    expect(response.status).toBe(201); expect(users.get("customer")?.is_verified).toBe(true);
    expect(rows.get(body.data.challenge_id)?.verified).toBe(true);
    expect(sessions).toHaveLength(1); expect(m.welcome).toHaveBeenCalledOnce(); expect(m.authCookies).toHaveBeenCalledOnce();
    const retry = await finalize(body.data.challenge_id);
    expect(retry.status).toBe(409); expect((await retry.json()).details.reason).toBe("OTP_USED");
    expect(sessions).toHaveLength(1); expect(m.welcome).toHaveBeenCalledOnce();
  });
  function wrongCode() { return String(m.provider.mock.calls.at(-1)?.[1]) === "999999" ? "000000" : "999999"; }
  it("commit lần nhập sai trước lỗi, giới hạn năm lần qua resend và chặn gửi tiếp", async () => {
    const first = await send();
    for (let n = 0; n < 2; n++) {
      const response = await finalize(first.body.data.challenge_id, wrongCode());
      expect(response.status).toBe(422);
    }
    expect(rows.get(first.body.data.challenge_id)?.attempts).toBe(2);
    vi.setSystemTime(Date.now() + 120000);
    const second = await send();
    for (let n = 0; n < 3; n++) await finalize(second.body.data.challenge_id, wrongCode());
    expect(rows.get(second.body.data.challenge_id)?.attempts).toBe(3);
    const count = await import("@/lib/auth/registrationOtpStore").then((s) => s.registrationOtpCount(dayKey()));
    expect((await send()).response.status).toBe(429); expect(m.provider).toHaveBeenCalledTimes(2);
    expect(await import("@/lib/auth/registrationOtpStore").then((s) => s.registrationOtpCount(dayKey()))).toBe(count);
  });
  it("giao dịch tài khoản/session thất bại giữ OTP dùng được và giải phóng lease", async () => {
    const { body } = await send(); failSession = true;
    expect((await finalize(body.data.challenge_id)).status).toBe(500);
    expect(rows.get(body.data.challenge_id)?.verified).toBe(false);
    expect(users.size).toBe(0); expect(sessions).toHaveLength(0);
    expect(redis.get(registrationOtpKey("lease", "+84912345678"))).toBeNull();
    expect((await finalize(body.data.challenge_id)).status).toBe(201);
    expect(sessions).toHaveLength(1);
  });
  it.each(["name", "phone", "flow", "legacy"])("từ chối thông tin %s bị đổi mà không trừ bộ đếm sai của phone khác", async (kind) => {
    const { body } = await send(); const id = body.data.challenge_id;
    if (kind === "flow") m.cookie = "b".repeat(64);
    if (kind === "legacy") rows.get(id)!.binding_hash = null;
    const response = await finalize(id, undefined, kind === "name" ? { name: "Changed" } : kind === "phone" ? { phone_number: "0987654321" } : {});
    expect(response.status).toBe(422);
    expect(rows.get(id)?.attempts).toBe(0); expect(redis.get(registrationOtpKey("wrong", "+84912345678"))).toBeNull();
  });
  it("chấp nhận phone tương đương +84 và từ chối challenge/mã cũ sau resend", async () => {
    const first = await send(); const oldCode = String(m.provider.mock.calls[0][1]);
    vi.setSystemTime(Date.now() + 120000); const second = await send();
    expect((await finalize(first.body.data.challenge_id, oldCode)).status).toBe(422);
    expect((await finalize(second.body.data.challenge_id, undefined, { phone_number: "+84912345678" })).status).toBe(201);
  });
  it("giữ lịch sử/số dư ghost và từ chối ghost bị khóa hoặc có quyền khác CUSTOMER", async () => {
    const ghost: User = { id: "ghost", ...input, phone_number: "+84912345678", insta_name: "ban.ca", password_hash: "GHOST_USER_NO_PASSWORD", role: "CUSTOMER", is_blocked: false, is_verified: false, points_balance: 42 };
    users.set("ghost", ghost);
    const sent = await send();
    expect((await finalize(sent.body.data.challenge_id)).status).toBe(201);
    expect(users.get("ghost")).toMatchObject({ id: "ghost", points_balance: 42, is_verified: true });
    users.clear(); users.set("ghost", { ...ghost, password_hash: "GHOST_USER_NO_PASSWORD", is_blocked: true });
    expect((await send()).response.status).toBe(403);
    users.set("ghost", { ...ghost, role: "STAFF", is_blocked: false });
    expect((await send()).response.status).toBe(409);
  });
  it("từ chối CAPTCHA không tăng phone/IP/day trả phí và replay lỗi đã lưu", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ success: false, "error-codes": ["invalid-input-response"] })));
    const rejected = await send();
    expect(rejected.response.status).toBe(403); expect(m.provider).not.toHaveBeenCalled();
    expect(redis.get(registrationOtpKey("cycle", "+84912345678"))).toBeNull(); expect(redis.get(dayKey())).toBeNull();
    expect((await sendPOST(otpRequest(rejected.payload))).status).toBe(403);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("outage Siteverify thật vẫn giữ hạn mức, kể cả token trống được backend kiểm tra", async () => {
    fetchMock.mockRejectedValue(new TypeError("network"));
    const sent = await send({ turnstile_token: "" });
    expect(sent.response.status).toBe(200); expect(m.provider).toHaveBeenCalledOnce(); expect(redis.get(dayKey())).toBe(1);
  });
  it("giữ reservation khi provider unknown và replay không gọi lại provider/CAPTCHA", async () => {
    m.provider.mockResolvedValue({ deliveryStatus: "unknown", providerCode: null, smsPerMessage: null });
    const sent = await send(); expect(sent.body.data.delivery_status).toBe("unknown");
    expect((await sendPOST(otpRequest(sent.payload))).status).toBe(200);
    expect(m.provider).toHaveBeenCalledOnce(); expect(fetchMock).toHaveBeenCalledOnce(); expect(redis.get(dayKey())).toBe(1);
    const conflict = await sendPOST(otpRequest({ ...sent.payload, name: "Another" }));
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
    resolveCaptcha(new Response(JSON.stringify({ success: true, hostname: "matcha.example", action: "registration_otp" })));
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
    resolveCaptcha(new Response(JSON.stringify({ success: true, hostname: "matcha.example", action: "registration_otp" })));
    const response = await pending; expect(response.status).toBe(409);
    expect(redis.get(dayKey())).toBeNull(); expect(m.provider).not.toHaveBeenCalled();
  });
  it("tắt OTP bỏ qua proof và tạo unverified; bật trước transaction yêu cầu proof mới", async () => {
    settings.otp_enabled = false; vi.stubEnv("REGISTRATION_OTP_SECRET", ""); redis.unavailable = true;
    const offConfig = await configGET(new Request("https://matcha.example/api/auth/register/otp"));
    expect((await offConfig.json()).data).toEqual({ enabled: false, turnstile: null, challenge: null });
    const off = await registerPOST(otpRequest(input, "/api/auth/register"));
    expect(off.status).toBe(201); expect(users.get("customer")?.is_verified).toBe(false);
    users.clear(); sessions = [];
    m.settingsRead.mockResolvedValueOnce({ id: 1, ...settings }).mockImplementation(async () => ({ id: 1, ...settings, otp_enabled: true }));
    const toggled = await registerPOST(otpRequest(input, "/api/auth/register"));
    expect(toggled.status).toBe(422); expect(users.size).toBe(0); expect(sessions).toHaveLength(0);
  });
  it("settings, Redis hoặc cấu hình thiếu bị từ chối thay vì tắt OTP ngầm", async () => {
    settingsUnavailable = true; expect((await configGET(new Request("https://matcha.example/api/auth/register/otp"))).status).toBe(503);
    settingsUnavailable = false; redis.unavailable = true; expect((await send()).response.status).toBe(503);
    redis.unavailable = false; vi.stubEnv("REGISTRATION_OTP_SECRET", "short"); expect((await send()).response.status).toBe(503);
  });
  it("GET tạo cookie pre-auth secure/httpOnly/strict, không lưu mật khẩu", async () => {
    m.cookie = "";
    expect((await configGET(new Request("https://matcha.example/api/auth/register/otp"))).status).toBe(200);
    expect(m.cookieSet).toHaveBeenCalledWith("registration_otp_flow", expect.stringMatching(/^[a-f0-9]{64}$/), expect.objectContaining({ httpOnly: true, secure: true, sameSite: "strict", path: "/api/auth/register" }));
    expect(JSON.stringify(Array.from(redis.entries.entries()))).not.toContain(input.password);
  });
  it("admin kiểm tra 401/403 và revision, cho số dư không, giữ settings khi stats lỗi", async () => {
    m.session = null; expect((await settingsGET()).status).toBe(401);
    m.session = { id: "staff", role: "STAFF" }; expect((await balancePOST()).status).toBe(403);
    m.session = { id: "admin", role: "ADMIN" };
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
