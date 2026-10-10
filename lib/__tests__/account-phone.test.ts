import { beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ userFind: vi.fn(), transaction: vi.fn(), userUpdateMany: vi.fn(), userUpdate: vi.fn(), sessionFind: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: db.userFind }, $transaction: db.transaction } }));
vi.mock("@/lib/auth", () => ({ normalizePhone: (value: string) => value }));
vi.mock("@/lib/redis", () => ({ cacheDelete: vi.fn(), getRegistrationOtpRedisClient: () => null }));
import { updateAccountPhone } from "@/lib/auth/accountPhone";
const actor = { id: "google-user", account_origin: "GOOGLE_EMAIL", google_sub: "sub", password_hash: null, role: "CUSTOMER", is_blocked: false, sourceMerge: null, phone_number: null, email: "ca@gmail.com", pointsLogs: [], vouchers: [] };
const ghost = { ...actor, id: "phone-ghost", google_sub: null, email: null, account_origin: "LEGACY_PHONE", phone_number: "+84912345678", pointsLogs: [{ id: "earned-before" }] };
describe("Gắn số điện thoại khách hàng", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.userFind.mockImplementation(async (arg: { where: { id?: string; phone_number?: string } }) => arg.where.phone_number ? ghost : actor);
    db.userUpdateMany.mockResolvedValue({ count: 1 }); db.userUpdate.mockResolvedValue(actor); db.sessionFind.mockResolvedValue({ id: "session" });
    db.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback({ user: { findUnique: db.userFind, updateMany: db.userUpdateMany, update: db.userUpdate }, session: { findFirst: db.sessionFind } }));
  });
  it("yêu cầu xác minh ghost có lịch sử nhận điểm thay vì gắn ngay", async () => {
    expect(await updateAccountPhone({ id: "google-user", role: "CUSTOMER", phone_number: null, session_id: "session" }, "+84912345678")).toEqual({ status: "verification_required" });
    expect(db.userUpdate).not.toHaveBeenCalled();
  });
});