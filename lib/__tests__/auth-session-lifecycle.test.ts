import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignJWT, jwtVerify } from "jose";

const boundary = vi.hoisted(() => {
  process.env.JWT_SECRET = "auth-lifecycle-test-secret-at-least-32-bytes";
  return {
    findFirst: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn(), create: vi.fn(),
    cookieValues: new Map<string, string>(), set: vi.fn(), delete: vi.fn(),
  };
});
vi.mock("@/lib/prisma", () => ({ prisma: { session: {
  findFirst: boundary.findFirst, findUnique: boundary.findUnique, updateMany: boundary.updateMany,
  deleteMany: boundary.deleteMany, create: boundary.create,
} } }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => boundary.cookieValues.has(name) ? { value: boundary.cookieValues.get(name) } : undefined,
    set: boundary.set, delete: boundary.delete,
  }),
  headers: async () => new Headers(),
}));
vi.mock("@/lib/redis", () => ({ cacheDelete: vi.fn().mockResolvedValue(undefined) }));

import { POST as refresh } from "@/app/api/auth/refresh/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { getSession, signJwt, verifyJwt } from "@/lib/auth";

const now = new Date("2026-09-04T00:00:00Z");
const oldToken = "550e8400-e29b-41d4-a716-446655440001";
const newToken = "550e8400-e29b-41d4-a716-446655440002";
const secret = new TextEncoder().encode("auth-lifecycle-test-secret-at-least-32-bytes");
const claims = { id: "user-1", sid: "session-1", role: "ADMIN", phone_number: "+84900000000" };
const session = () => ({
  id: "session-1", user_id: "user-1", refresh_token: oldToken, previous_refresh_token: null as string | null,
  rotating_at: null as Date | null, expires_at: new Date("2026-09-05T00:00:00Z"),
  user: { id: "user-1", role: "STAFF", phone_number: "+84912345678" },
});
const winner = () => ({ ...session(), refresh_token: newToken, previous_refresh_token: oldToken, rotating_at: now });

// APPLICATION_LOGIC: routes and owned auth/JOSE execute; Prisma, cookies and clock are boundaries.
describe("Auth lifecycle — stable sid và thu hồi phiên", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers(); vi.setSystemTime(now);
    boundary.cookieValues.clear();
    boundary.cookieValues.set("refresh_token", oldToken);
    boundary.findFirst.mockResolvedValue(session());
    boundary.findUnique.mockResolvedValue(winner());
    boundary.updateMany.mockResolvedValue({ count: 1 });
    boundary.deleteMany.mockResolvedValue({ count: 1 });
    boundary.set.mockImplementation((name: string, value: string) => boundary.cookieValues.set(name, value));
    boundary.delete.mockImplementation((name: string) => boundary.cookieValues.delete(name));
  });
  afterEach(() => vi.useRealTimers());

  it("refresh giữ sid, phát JWT quyền hiện hành và cookie strict", async () => {
    const response = await refresh();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { success: true } });
    const token = boundary.cookieValues.get("access_token")!;
    expect((await jwtVerify(token, secret)).payload).toMatchObject({
      id: "user-1", sid: "session-1", role: "STAFF", phone_number: "+84912345678",
    });
    expect(boundary.cookieValues.get("refresh_token")).toBe(newToken);
    expect(boundary.set).toHaveBeenCalledWith("access_token", token, expect.objectContaining({
      httpOnly: true, sameSite: "strict", path: "/", maxAge: 900,
    }));
    expect(boundary.set).toHaveBeenCalledWith("refresh_token", newToken, expect.objectContaining({
      httpOnly: true, sameSite: "strict", maxAge: 604800,
    }));
    expect(boundary.create).not.toHaveBeenCalled();
  });

  it.each(["missing-before", "missing-after"])("refresh không hồi sinh row bị xoá: %s", async (phase) => {
    if (phase === "missing-before") boundary.findFirst.mockResolvedValue(null);
    else boundary.findUnique.mockResolvedValue(null);
    const response = await refresh();
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: "UNAUTHORIZED" });
    expect(boundary.set).not.toHaveBeenCalled();
    expect(boundary.create).not.toHaveBeenCalled();
  });

  it.each([0, 30000])("refresh chấp nhận token trước trong grace %i ms", async (elapsed) => {
    const recent = { ...winner(), rotating_at: new Date(now.getTime() - elapsed) };
    boundary.findFirst.mockResolvedValue(recent);
    boundary.findUnique.mockResolvedValue(recent);
    expect((await refresh()).status).toBe(200);
    expect(boundary.cookieValues.get("refresh_token")).toBe(newToken);
    expect(boundary.updateMany).not.toHaveBeenCalled();
  });

  it("refresh từ chối token trước sau 30 giây", async () => {
    boundary.findFirst.mockResolvedValue({ ...winner(), rotating_at: new Date(now.getTime() - 30001) });
    expect((await refresh()).status).toBe(401);
    expect(boundary.set).not.toHaveBeenCalled();
  });

  it("getSession trả quyền hiện hành thay vì role ADMIN đã ký", async () => {
    boundary.cookieValues.set("access_token", await signJwt(claims));
    expect(await getSession()).toEqual(session().user);
    expect(boundary.findFirst).toHaveBeenCalledWith({
      where: { id: "session-1", user_id: "user-1", expires_at: { gt: now } },
      include: { user: { select: { id: true, role: true, phone_number: true } } },
    });
  });

  it("getSession từ chối lookup rỗng và yêu cầu DB lọc sid chưa hết hạn", async () => {
    boundary.cookieValues.set("access_token", await signJwt(claims));
    boundary.findFirst.mockResolvedValue(null);
    expect(await getSession()).toBeNull();
    expect(boundary.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "session-1", user_id: "user-1", expires_at: { gt: now } },
    }));
  });

  it.each(["before", "after"])("refresh từ chối row hết hạn tại boundary %s", async (phase) => {
    if (phase === "before") boundary.findFirst.mockResolvedValue({ ...session(), expires_at: now });
    else boundary.findUnique.mockResolvedValue({ ...winner(), expires_at: now });
    expect((await refresh()).status).toBe(401);
    expect(boundary.set).not.toHaveBeenCalled();
    expect(boundary.create).not.toHaveBeenCalled();
  });

  it("refresh không ký JWT khi user binding thay đổi ở winner", async () => {
    boundary.findUnique.mockResolvedValue({ ...winner(), user_id: "another-user" });
    expect((await refresh()).status).toBe(401);
    expect(boundary.set).not.toHaveBeenCalled();
  });

  // SIMULATED_RACE_OUTCOME: updateMany count 0 models a loser, authoritative reread supplies winner.
  it("refresh thua conditional update vẫn dùng token của winner cùng sid", async () => {
    boundary.updateMany.mockResolvedValue({ count: 0 });
    expect((await refresh()).status).toBe(200);
    expect(boundary.cookieValues.get("refresh_token")).toBe(newToken);
    const token = boundary.cookieValues.get("access_token")!;
    expect((await jwtVerify(token, secret)).payload.sid).toBe("session-1");
    expect(boundary.create).not.toHaveBeenCalled();
  });

  it("JWT legacy thiếu sid cần refresh trước khi dùng getSession", async () => {
    const legacy = await new SignJWT({ id: "user-1", role: "ADMIN", phone_number: "+84900000000" })
      .setProtectedHeader({ alg: "HS256" }).setExpirationTime("15m").sign(secret);
    boundary.cookieValues.set("access_token", legacy);
    expect(await verifyJwt(legacy)).toBeNull();
    expect(await getSession()).toBeNull();
    expect(boundary.findFirst).not.toHaveBeenCalled();
    expect((await refresh()).status).toBe(200);
    boundary.findFirst.mockResolvedValue(winner());
    expect(await getSession()).toEqual(session().user);
  });

  it("verifyJwt từ chối chữ ký sai, JWT hết hạn và thuật toán không cho phép", async () => {
    const wrongKey = await new SignJWT(claims).setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("15m").sign(new TextEncoder().encode("wrong-test-secret"));
    const expired = await new SignJWT(claims).setProtectedHeader({ alg: "HS256" })
      .setExpirationTime(Math.floor(now.getTime() / 1000) - 1).sign(secret);
    const wrongAlgorithm = await new SignJWT(claims).setProtectedHeader({ alg: "HS384" })
      .setExpirationTime("15m").sign(secret);
    for (const token of [wrongKey, expired, wrongAlgorithm]) expect(await verifyJwt(token)).toBeNull();
  });

  it("logout lỗi DB giữ cookie để người dùng retry", async () => {
    boundary.cookieValues.set("access_token", await signJwt(claims));
    const original = new Map(boundary.cookieValues);
    boundary.deleteMany.mockRejectedValue(new Error("controlled DB unavailable"));
    const response = await logout();
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ code: "INTERNAL_ERROR" });
    expect(boundary.cookieValues).toEqual(original);
    expect(boundary.delete).not.toHaveBeenCalled();
  });

  it("logout hoàn tất xoá stable sid trước khi clear cookie", async () => {
    boundary.cookieValues.set("access_token", await signJwt(claims));
    let completeDelete!: () => void;
    boundary.deleteMany.mockImplementation(async () => {
      await new Promise<void>((resolve) => { completeDelete = resolve; });
      return { count: 1 };
    });
    const pending = logout();
    await vi.waitFor(() => expect(completeDelete).toBeTypeOf("function"));
    expect(boundary.delete).not.toHaveBeenCalled();
    completeDelete();
    expect((await pending).status).toBe(200);
    expect(boundary.deleteMany).toHaveBeenCalledWith({ where: { id: "session-1", user_id: "user-1" } });
    expect([...boundary.cookieValues.keys()]).toEqual([]);
  });
});
