import bcrypt from "bcryptjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const boundary = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  txUserUpdateMany: vi.fn(),
  txSessionFindUnique: vi.fn(),
  txSessionFindMany: vi.fn(),
  txSessionDeleteMany: vi.fn(),
  txSessionUpdateMany: vi.fn(),
  transaction: vi.fn(),
  cacheDelete: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: boundary.userFindUnique },
    $transaction: boundary.transaction,
  },
}));
vi.mock("@/lib/redis", () => ({ cacheDelete: boundary.cacheDelete }));

import {
  changePassword,
  ChangePasswordConflictError,
  CurrentPasswordMismatchError,
  PasswordReuseError,
} from "@/lib/changePassword";

const OLD_HASH = "$2b$04$vIExhIg4xG56Su0Y/lWyduQ1hXETCqaKrjnlufmE2BQoxddv4Sn4u";
const CURRENT_SESSION = {
  id: "session-1",
  user_id: "user-1",
  refresh_token: "550e8400-e29b-41d4-a716-446655440001",
  previous_refresh_token: null,
  expires_at: new Date("2099-01-01T00:00:00Z"),
};
const CONTROLLED_NOW = new Date("2026-01-02T03:04:05.000Z");
const EXPECTED_EXPIRY = new Date(CONTROLLED_NOW.getTime() + 7 * 24 * 60 * 60 * 1000);

function installTransactionBoundary(): void {
  boundary.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback({
    user: { updateMany: boundary.txUserUpdateMany },
    session: {
      findUnique: boundary.txSessionFindUnique,
      findMany: boundary.txSessionFindMany,
      deleteMany: boundary.txSessionDeleteMany,
      updateMany: boundary.txSessionUpdateMany,
    },
  }));
}

describe("changePassword workflow", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(CONTROLLED_NOW);
    vi.clearAllMocks();
    installTransactionBoundary();
    boundary.userFindUnique.mockResolvedValue({ password_hash: OLD_HASH });
    boundary.txUserUpdateMany.mockResolvedValue({ count: 1 });
    boundary.txSessionFindUnique.mockResolvedValue(CURRENT_SESSION);
    boundary.txSessionFindMany.mockResolvedValue([
      {
        refresh_token: "550e8400-e29b-41d4-a716-446655440002",
        previous_refresh_token: "550e8400-e29b-41d4-a716-446655440003",
      },
    ]);
    boundary.txSessionDeleteMany.mockResolvedValue({ count: 1 });
    boundary.txSessionUpdateMany.mockResolvedValue({ count: 1 });
    boundary.cacheDelete.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("verifies, hashes at cost 12, updates the user and rotates only the current session", async () => {
    const result = await changePassword({
      userId: "user-1",
      sessionId: "session-1",
      currentPassword: "current1",
      newPassword: "newpass1",
    });

    const userUpdate = boundary.txUserUpdateMany.mock.calls[0][0];
    expect(await bcrypt.compare("newpass1", userUpdate.data.password_hash)).toBe(true);
    expect(bcrypt.getRounds(userUpdate.data.password_hash)).toBe(12);
    expect(userUpdate.where).toMatchObject({
      id: "user-1",
      password_hash: OLD_HASH,
    });
    expect(boundary.txSessionDeleteMany).toHaveBeenCalledWith({
      where: { user_id: "user-1", id: { not: "session-1" } },
    });
    const sessionUpdate = boundary.txSessionUpdateMany.mock.calls[0][0];
    expect(sessionUpdate.where).toMatchObject({
      id: "session-1",
      user_id: "user-1",
      refresh_token: CURRENT_SESSION.refresh_token,
    });
    expect(sessionUpdate.data).toMatchObject({
      previous_refresh_token: CURRENT_SESSION.refresh_token,
      rotating_at: CONTROLLED_NOW,
      expires_at: EXPECTED_EXPIRY,
    });
    expect(result.refreshToken).not.toBe(CURRENT_SESSION.refresh_token);
    expect(result.revokedRefreshTokens).toEqual(expect.arrayContaining([
      CURRENT_SESSION.refresh_token,
      "550e8400-e29b-41d4-a716-446655440002",
      "550e8400-e29b-41d4-a716-446655440003",
    ]));
    expect(boundary.transaction).toHaveBeenCalledTimes(1);
  });

  it("rejects a wrong current password before opening a transaction", async () => {
    const hash = await bcrypt.hash("different1", 4);
    boundary.userFindUnique.mockResolvedValue({ password_hash: hash });

    await expect(changePassword({
      userId: "user-1",
      sessionId: "session-1",
      currentPassword: "current1",
      newPassword: "newpass1",
    })).rejects.toBeInstanceOf(CurrentPasswordMismatchError);
    expect(boundary.transaction).not.toHaveBeenCalled();
  });

  it("rejects reusing the current password before opening a transaction", async () => {
    const hash = await bcrypt.hash("current1", 4);
    boundary.userFindUnique.mockResolvedValue({ password_hash: hash });

    await expect(changePassword({
      userId: "user-1",
      sessionId: "session-1",
      currentPassword: "current1",
      newPassword: "current1",
    })).rejects.toBeInstanceOf(PasswordReuseError);
    expect(boundary.transaction).not.toHaveBeenCalled();
  });

  it("maps a conditional old-hash loser to conflict and does not delete sessions", async () => {
    boundary.txUserUpdateMany.mockResolvedValue({ count: 0 });

    await expect(changePassword({
      userId: "user-1",
      sessionId: "session-1",
      currentPassword: "current1",
      newPassword: "newpass1",
    })).rejects.toBeInstanceOf(ChangePasswordConflictError);
    expect(boundary.txSessionDeleteMany).not.toHaveBeenCalled();
    expect(boundary.txSessionUpdateMany).not.toHaveBeenCalled();
  });

  it("keeps the committed password change successful when legacy Redis eviction fails", async () => {
    boundary.cacheDelete.mockRejectedValue(new Error("controlled redis failure"));

    await expect(changePassword({
      userId: "user-1",
      sessionId: "session-1",
      currentPassword: "current1",
      newPassword: "newpass1",
    })).resolves.toMatchObject({ refreshToken: expect.any(String) });
    expect(boundary.transaction).toHaveBeenCalledTimes(1);
  });

  it.each(["acquisition", "callback"])("propagates transaction %s failures without evicting Redis", async (phase) => {
    if (phase === "acquisition") {
      boundary.transaction.mockRejectedValueOnce(new Error("controlled transaction acquisition failure"));
    } else {
      boundary.txUserUpdateMany.mockRejectedValueOnce(new Error("controlled transaction callback failure"));
    }

    await expect(changePassword({
      userId: "user-1",
      sessionId: "session-1",
      currentPassword: "current1",
      newPassword: "newpass1",
    })).rejects.toThrow(/controlled transaction/);
    expect(boundary.cacheDelete).not.toHaveBeenCalled();
  });
});
