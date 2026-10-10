import bcrypt from "bcryptjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
const boundary = vi.hoisted(() => ({ find: vi.fn(), update: vi.fn(), tx: vi.fn(), proof: vi.fn(), sessionFind: vi.fn(), sessionMany: vi.fn(), sessionDelete: vi.fn(), sessionRotate: vi.fn(), cookies: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: boundary.find }, $transaction: boundary.tx } }));
vi.mock("@/lib/auth", () => ({ getSession: vi.fn() }));
vi.mock("@/lib/redis", () => ({ cacheDelete: vi.fn().mockResolvedValue(undefined) }));
vi.mock("next/headers", () => ({ cookies: boundary.cookies }));
import { changePassword } from "@/lib/auth/changePassword";
const user = { id: "legacy-id", role: "CUSTOMER", is_blocked: false, sourceMerge: null, password_hash: null,
  account_origin: "LEGACY_PHONE", phone_number: "+84912345678", google_sub: "google-sub" };
const proof = "550e8400-e29b-41d4-a716-446655440001." + "a".repeat(64);
describe("Tạo mật khẩu đầu tiên sau claim bằng Google", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    boundary.find.mockResolvedValue(user);
    boundary.update.mockResolvedValue({ count: 1 });
    boundary.proof.mockResolvedValue({ count: 1 });
    boundary.cookies.mockResolvedValue({ get: () => ({ value: "b".repeat(64) }) });
    boundary.sessionFind.mockResolvedValue({ id: "session-id", user_id: user.id, refresh_token: "old-token", previous_refresh_token: null, expires_at: new Date("2099-01-01") });
    boundary.sessionMany.mockResolvedValue([]);
    boundary.sessionDelete.mockResolvedValue({ count: 0 });
    boundary.sessionRotate.mockResolvedValue({ count: 1 });
    boundary.tx.mockImplementation(async (work: (tx: unknown) => Promise<unknown>) => work({
      user: { findUnique: boundary.find, updateMany: boundary.update },
      session: { findUnique: boundary.sessionFind, findFirst: boundary.sessionFind, findMany: boundary.sessionMany, deleteMany: boundary.sessionDelete, updateMany: boundary.sessionRotate },
      googleAuthAttempt: { updateMany: boundary.proof },
    }));
  });
  it("cho tài khoản legacy đã claim tạo mật khẩu bằng Google proof mới", async () => {
    const result = await changePassword({ userId: user.id, sessionId: "session-id", newPassword: "newpass1",
      request: new Request("https://matcha.example/api/profile/password"), reauthProof: proof });
    expect(result.refreshToken).not.toBe("old-token");
    const updates = boundary.update.mock.calls.map(([arg]) => arg as { data: { password_hash?: string } });
    const saved = updates.find(arg => arg.data.password_hash);
    expect(await bcrypt.compare("newpass1", saved!.data.password_hash!)).toBe(true);
  });
  it("không biến tài khoản Google email thành đăng nhập phone/password", async () => {
    boundary.find.mockResolvedValue({ ...user, account_origin: "GOOGLE_EMAIL" });
    await expect(changePassword({ userId: user.id, sessionId: "session-id", newPassword: "newpass1",
      request: new Request("https://matcha.example/api/profile/password"), reauthProof: proof })).rejects.toMatchObject({ reason: "PASSWORD_SETUP_NOT_ALLOWED" });
    expect(boundary.sessionRotate).not.toHaveBeenCalled();
  });
  it("proof thiếu hoặc đã dùng không tạo mật khẩu", async () => {
    boundary.proof.mockResolvedValue({ count: 0 });
    await expect(changePassword({ userId: user.id, sessionId: "session-id", newPassword: "newpass1",
      request: new Request("https://matcha.example/api/profile/password"), reauthProof: proof })).rejects.toMatchObject({ reason: "GOOGLE_REAUTH_REQUIRED" });
    expect(boundary.sessionRotate).not.toHaveBeenCalled();
  });
});
