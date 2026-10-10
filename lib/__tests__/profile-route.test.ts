import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
const boundary = vi.hoisted(() => ({
  session: vi.fn(), find: vi.fn(), update: vi.fn(), claim: vi.fn(), transaction: vi.fn(),
  compare: vi.fn(), sessionFind: vi.fn(), proof: vi.fn(), cookies: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ getSession: boundary.session }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: boundary.find, update: boundary.update }, $transaction: boundary.transaction } }));
vi.mock("bcryptjs", () => ({ default: { compare: boundary.compare } }));
vi.mock("next/headers", () => ({ cookies: boundary.cookies }));
vi.mock("@/lib/redis", () => ({ cacheDelete: vi.fn() }));
import { GET, PATCH } from "@/app/api/profile/route";
const PROFILE = {
  id: "customer-id", name: "Bạn Cá", phone_number: "+84912345678", email: null, insta_name: "ban.ca",
  points_balance: 25, qr_token: "public-qr", password_hash: "$2a$12$validhash",
  google_sub: null, account_origin: "LEGACY_PHONE", role: "CUSTOMER", is_blocked: false,
  sourceMerge: null, pointsLogs: [], vouchers: [],
};
const proofId = "550e8400-e29b-41d4-a716-446655440001";
const proofRaw = "a".repeat(64);
function request(body: unknown) {
  return new Request("http://localhost/api/profile", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}
describe("Hồ sơ tài khoản khách hàng", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    boundary.session.mockResolvedValue({ id: PROFILE.id, role: "CUSTOMER", phone_number: PROFILE.phone_number, session_id: "session-id" });
    boundary.find.mockResolvedValue(PROFILE);
    boundary.update.mockImplementation(async ({ data }: { data: Partial<typeof PROFILE> }) => ({ ...PROFILE, ...data }));
    boundary.claim.mockResolvedValue({ count: 1 });
    boundary.compare.mockResolvedValue(true);
    boundary.sessionFind.mockResolvedValue({ id: "session-id" });
    boundary.proof.mockResolvedValue({ count: 1 });
    boundary.cookies.mockResolvedValue({ get: () => ({ value: "b".repeat(64) }) });
    boundary.transaction.mockImplementation(async (work: (tx: unknown) => Promise<unknown>) => work({
      user: { findUnique: boundary.find, updateMany: boundary.claim, update: boundary.update },
      session: { findFirst: boundary.sessionFind },
      googleAuthAttempt: { updateMany: boundary.proof },
    }));
  });
  it("trả capability và email mà không lộ thông tin xác thực hay id", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({
      name: "Bạn Cá", phone_number: "+84912345678", email: null, insta_name: "ban.ca",
      points_balance: 25, qr_token: "public-qr", google_connected: false, has_password: true, can_set_password: false,
    });
  });
  it("không cho nhân viên xem hồ sơ khách", async () => {
    boundary.session.mockResolvedValue({ id: PROFILE.id, role: "STAFF" });
    expect((await GET()).status).toBe(403);
  });
  it("cho sửa tên không cần xác thực lại", async () => {
    expect((await PATCH(request({ name: " Tên mới " }))).status).toBe(200);
    expect(boundary.update).toHaveBeenCalledWith(expect.objectContaining({ data: { name: "Tên mới" } }));
    expect(boundary.compare).not.toHaveBeenCalled();
  });
  it("yêu cầu mật khẩu hiện tại khi tài khoản legacy sửa Instagram", async () => {
    expect((await PATCH(request({ insta_name: "ten.moi" }))).status).toBe(400);
    expect(boundary.update).not.toHaveBeenCalled();
  });
  it("từ chối mật khẩu sai", async () => {
    boundary.compare.mockResolvedValue(false);
    expect((await PATCH(request({ insta_name: null, current_password: "wrong12" }))).status).toBe(400);
    expect(boundary.update).not.toHaveBeenCalled();
  });
  it("cho tài khoản Google sửa Instagram bằng proof mới cùng browser và session", async () => {
    const google = { ...PROFILE, password_hash: null, google_sub: "google-sub", account_origin: "GOOGLE_EMAIL", phone_number: null, email: "ca@gmail.com" };
    boundary.find.mockResolvedValue(google);
    boundary.update.mockResolvedValue({ ...google, insta_name: "ten.moi" });
    const response = await PATCH(request({ insta_name: "ten.moi", reauth_proof: proofId + "." + proofRaw }));
    expect(response.status).toBe(200);
    expect(boundary.proof).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      id: proofId, actor_user_id: PROFILE.id, actor_session_id: "session-id", verified_google_sub: "google-sub",
      nonce_hash: createHash("sha256").update(proofRaw).digest("hex"), consumed_at: null,
    }) }));
    expect(boundary.compare).not.toHaveBeenCalled();
  });
  it("proof đã dùng hoặc sai không thay đổi Instagram", async () => {
    boundary.find.mockResolvedValue({ ...PROFILE, password_hash: null, google_sub: "google-sub" });
    boundary.proof.mockResolvedValue({ count: 0 });
    const response = await PATCH(request({ insta_name: "ten.moi", reauth_proof: proofId + "." + proofRaw }));
    expect(response.status).toBe(400);
    expect(boundary.update).not.toHaveBeenCalled();
  });
  it("trả xung đột công khai khi Instagram trùng", async () => {
    boundary.update.mockRejectedValue({ code: "P2002" });
    expect((await PATCH(request({ insta_name: "trung.ten", current_password: "secret12" }))).status).toBe(409);
  });
});
