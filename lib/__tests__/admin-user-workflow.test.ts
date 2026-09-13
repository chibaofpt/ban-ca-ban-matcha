import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userFindFirst: vi.fn(), userUpdate: vi.fn(), userUpdateMany: vi.fn(), userFindUniqueOrThrow: vi.fn(),
  sessionDeleteMany: vi.fn(), pointsLogCreate: vi.fn(), hash: vi.fn(), randomBytes: vi.fn(), transaction: vi.fn(),
}));

const tx = {
  user: { findFirst: mocks.userFindFirst, update: mocks.userUpdate, updateMany: mocks.userUpdateMany, findUniqueOrThrow: mocks.userFindUniqueOrThrow },
  session: { deleteMany: mocks.sessionDeleteMany }, pointsLog: { create: mocks.pointsLogCreate },
};

vi.mock("@/lib/prisma", () => ({ prisma: {
  user: { findFirst: mocks.userFindFirst, update: mocks.userUpdate, updateMany: mocks.userUpdateMany, findUniqueOrThrow: mocks.userFindUniqueOrThrow },
  session: { deleteMany: mocks.sessionDeleteMany }, pointsLog: { create: mocks.pointsLogCreate },
  $transaction: mocks.transaction,
} }));
vi.mock("bcryptjs", () => ({ default: { hash: mocks.hash } }));
vi.mock("node:crypto", () => ({ randomBytes: mocks.randomBytes }));

import { giftAdminUserPoints, resetAdminUserPassword, setAdminUserBlocked } from "@/lib/adminUserWorkflow";

describe("Admin customer mutation workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation((callback) => callback(tx));
    mocks.userFindFirst.mockResolvedValue({ id: "customer-id" });
    mocks.userUpdate.mockResolvedValue({});
    mocks.sessionDeleteMany.mockResolvedValue({ count: 2 });
  });

  it("revokes sessions in the same transaction only when blocking", async () => {
    await setAdminUserBlocked("550e8400-e29b-41d4-a716-446655440000", true);
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.userFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { qr_token: "550e8400-e29b-41d4-a716-446655440000", role: "CUSTOMER" },
    }));
    expect(mocks.sessionDeleteMany).toHaveBeenCalledWith({ where: { user_id: "customer-id" } });

    vi.clearAllMocks();
    mocks.transaction.mockImplementation((callback) => callback(tx));
    mocks.userFindFirst.mockResolvedValue({ id: "customer-id" });
    await setAdminUserBlocked("550e8400-e29b-41d4-a716-446655440000", false);
    expect(mocks.sessionDeleteMany).not.toHaveBeenCalled();
  });

  it("creates a one-time random password, hashes at cost 12 and revokes sessions without logging it", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    mocks.randomBytes.mockReturnValue(Buffer.from("abcdefghijkl"));
    mocks.hash.mockResolvedValue("bcrypt-hash");

    const password = await resetAdminUserPassword("550e8400-e29b-41d4-a716-446655440000");

    expect(password).toHaveLength(16);
    expect(mocks.hash).toHaveBeenCalledWith(password, 12);
    expect(mocks.userUpdate).toHaveBeenCalledWith({ where: { id: "customer-id" }, data: { password_hash: "bcrypt-hash" } });
    expect(mocks.sessionDeleteMany).toHaveBeenCalledWith({ where: { user_id: "customer-id" } });
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it("uses an atomic guarded increment and appends the immutable audit row transactionally", async () => {
    mocks.userUpdateMany.mockResolvedValue({ count: 1 });
    mocks.pointsLogCreate.mockResolvedValue({});
    mocks.userFindUniqueOrThrow.mockResolvedValue({ points_balance: 51 });

    await expect(giftAdminUserPoints("550e8400-e29b-41d4-a716-446655440000", 20, "admin-id")).resolves.toBe(51);
    expect(mocks.userUpdateMany).toHaveBeenCalledWith({
      where: { id: "customer-id", role: "CUSTOMER", points_balance: { lte: 2_147_483_627 } },
      data: { points_balance: { increment: 20 } },
    });
    expect(mocks.pointsLogCreate).toHaveBeenCalledWith({ data: {
      user_id: "customer-id", delta: 20, reason: "manual_admin_adjustment", performed_by: "admin-id",
    } });
  });

  it("rejects Int overflow before writing an audit row", async () => {
    mocks.userUpdateMany.mockResolvedValue({ count: 0 });
    await expect(giftAdminUserPoints("550e8400-e29b-41d4-a716-446655440000", 1, "admin-id"))
      .rejects.toMatchObject({ reason: "BUSINESS_RULE_VIOLATION" });
    expect(mocks.pointsLogCreate).not.toHaveBeenCalled();
  });
});
