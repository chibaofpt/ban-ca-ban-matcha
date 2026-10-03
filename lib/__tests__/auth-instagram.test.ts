import { beforeEach, describe, expect, it, vi } from "vitest";
import { jwtVerify } from "jose";

const mockUserFindUnique = vi.fn();
const mockUserUpdateMany = vi.fn();
const mockSessionFindMany = vi.fn();
const mockSessionCreate = vi.fn();
const mockSessionDeleteMany = vi.fn();
const mockTransaction = vi.fn();
const mockBcryptCompare = vi.fn();
const mockCheckLoginFailLimit = vi.fn();
const mockCheckIdentifierFloodGuard = vi.fn();
const mockRecordLoginFail = vi.fn();
const mockRecordIdentifierFloodAttempt = vi.fn();
const mockResetLoginFail = vi.fn();
const mockResetIdentifierFlood = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
      updateMany: (...args: unknown[]) => mockUserUpdateMany(...args),
    },
    session: {
      create: (...args: unknown[]) => mockSessionCreate(...args),
      findMany: (...args: unknown[]) => mockSessionFindMany(...args),
      deleteMany: (...args: unknown[]) => mockSessionDeleteMany(...args),
    },
    $transaction: (fn: (tx: unknown) => Promise<unknown>) => mockTransaction(fn),
  },
}));

vi.hoisted(() => { process.env.JWT_SECRET = "auth-route-cookie-test-secret-at-least-32-bytes"; });
const mockCookieSet = vi.fn();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: mockCookieSet, delete: vi.fn() }),
  headers: async () => new Headers(),
}));
vi.mock("@/lib/auth", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/auth")>(),

}));

vi.mock("@/lib/rateLimit", () => ({
  getClientIp: () => "203.0.113.10",
  checkLoginFailLimit: (...args: unknown[]) => mockCheckLoginFailLimit(...args),
  checkIdentifierFloodGuard: (...args: unknown[]) =>
    mockCheckIdentifierFloodGuard(...args),
  recordLoginFail: (...args: unknown[]) => mockRecordLoginFail(...args),
  recordIdentifierFloodAttempt: (...args: unknown[]) =>
    mockRecordIdentifierFloodAttempt(...args),
  resetLoginFail: (...args: unknown[]) => mockResetLoginFail(...args),
  resetIdentifierFlood: (...args: unknown[]) =>
    mockResetIdentifierFlood(...args),
}));

vi.mock("bcryptjs", () => ({
  default: {
    compare: (...args: unknown[]) => mockBcryptCompare(...args),
  },
}));

import { POST as loginPOST } from "@/app/api/auth/login/route";
import {
  LoginSchema,
  RegisterSchemaWithInstagram,
  RefreshTokenSchema,
  normalizeInstagramUsername,
} from "@/lib/validations/auth";

describe("giới hạn mật khẩu bcrypt", () => {
  it("login vẫn chấp nhận mật khẩu legacy 72 ký tự", () => {
    expect(LoginSchema.safeParse({ phone_number: "0912345678", password: "a".repeat(72) }).success).toBe(true);
  });

  it("đăng ký từ chối mật khẩu đa byte vượt 72 byte mà không cắt chuỗi", () => {
    const password = "á".repeat(37);
    const result = RegisterSchemaWithInstagram.safeParse({
      name: "Nguyễn A", phone_number: "0912345678", password,
    });
    expect(new TextEncoder().encode(password)).toHaveLength(74);
    expect(result.success).toBe(false);
  });
});

describe("refresh token UUID", () => {
  it("chỉ chấp nhận UUID canonical", () => {
    expect(RefreshTokenSchema.safeParse("550e8400-e29b-41d4-a716-446655440000").success).toBe(true);
    expect(RefreshTokenSchema.safeParse("x),user_id.not.is.null").success).toBe(false);
    expect(RefreshTokenSchema.safeParse("a".repeat(10_000)).success).toBe(false);
  });
});

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/auth/login", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "203.0.113.10",
    },
    body: JSON.stringify(body),
  });
}

const CUSTOMER = {
  id: "customer-id",
  name: "Bạn Cá",
  phone_number: "+84912345678",
  insta_name: "ban.ca",
  password_hash: "$2a$12$validhash",
  role: "CUSTOMER",
  is_blocked: false,
};

describe("Chuẩn hoá Instagram username", () => {
  it("bỏ @, khoảng trắng và chuyển thành chữ thường", () => {
    expect(normalizeInstagramUsername("  @Ban.Ca_01  ")).toBe("ban.ca_01");
  });

  it("schema chấp nhận payload Instagram và từ chối hai định danh cùng lúc", () => {
    expect(
      LoginSchema.safeParse({ insta_name: "@ban.ca", password: "secret12" })
        .success,
    ).toBe(true);
    expect(
      LoginSchema.safeParse({
        phone_number: "0912345678",
        insta_name: "ban.ca",
        password: "secret12",
      }).success,
    ).toBe(false);
  });
});

describe("POST /api/auth/login — Instagram", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUserUpdateMany.mockResolvedValue({ count: 1 });
    mockTransaction.mockImplementation(
      async (fn: (tx: unknown) => Promise<unknown>) => fn({
        user: { updateMany: (...args: unknown[]) => mockUserUpdateMany(...args) },
        session: {
          findMany: (...args: unknown[]) => mockSessionFindMany(...args),
          create: (...args: unknown[]) => mockSessionCreate(...args),
          deleteMany: (...args: unknown[]) => mockSessionDeleteMany(...args),
        },
      }),
    );
    mockCheckLoginFailLimit.mockResolvedValue({ allowed: true, remaining: 5 });
    mockCheckIdentifierFloodGuard.mockResolvedValue({ allowed: true });
    mockSessionFindMany.mockResolvedValue([]);
    mockSessionCreate.mockResolvedValue({ id: "created-session-id", refresh_token: "created-refresh-token" });
    mockBcryptCompare.mockResolvedValue(true);
  });

  it("CUSTOMER đăng nhập thành công bằng Instagram đã chuẩn hoá", async () => {
    mockUserFindUnique.mockResolvedValue(CUSTOMER);

    const response = await loginPOST(
      makeRequest({ insta_name: " @Ban.Ca ", password: "secret12" }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    const token = mockCookieSet.mock.calls.find(([key]) => key === "access_token")?.[1] as string;
    expect((await jwtVerify(token, new TextEncoder().encode("auth-route-cookie-test-secret-at-least-32-bytes"))).payload)
      .toMatchObject({ id: "customer-id", sid: "created-session-id", role: "CUSTOMER" });
    expect(mockCookieSet).toHaveBeenCalledWith("refresh_token", "created-refresh-token", expect.objectContaining({
      httpOnly: true, sameSite: "strict", maxAge: 604800,
    }));
    expect(mockUserFindUnique).toHaveBeenCalledWith({
      where: { insta_name: "ban.ca" },
    });
    expect(mockCheckIdentifierFloodGuard).toHaveBeenCalledWith(
      "instagram",
      "ban.ca",
    );
    expect(mockUserUpdateMany).toHaveBeenCalledWith({
      where: {
        id: CUSTOMER.id,
        password_hash: CUSTOMER.password_hash,
        is_blocked: false,
      },
      data: { password_hash: CUSTOMER.password_hash },
    });
    expect(mockSessionCreate).toHaveBeenCalledWith({
      data: {
        user_id: CUSTOMER.id,
        expires_at: expect.any(Date),
      },
    });
    expect(body.data).toEqual({
      name: "Bạn Cá",
      phone_number: "+84912345678",
      insta_name: "ban.ca",
      role: "CUSTOMER",
    });
  });

  it("không cho STAFF đăng nhập bằng Instagram dù mật khẩu đúng", async () => {
    mockUserFindUnique.mockResolvedValue({ ...CUSTOMER, role: "STAFF" });

    const response = await loginPOST(
      makeRequest({ insta_name: "ban.ca", password: "secret12" }),
    );

    expect(response.status).toBe(401);
    expect(mockBcryptCompare).toHaveBeenCalled();
    expect(mockSessionCreate).not.toHaveBeenCalled();
  });

  it("từ chối CUSTOMER bị chặn bằng Instagram sau khi kiểm tra mật khẩu", async () => {
    mockUserFindUnique.mockResolvedValue({ ...CUSTOMER, is_blocked: true });

    const response = await loginPOST(
      makeRequest({ insta_name: "ban.ca", password: "secret12" }),
    );

    expect(mockBcryptCompare).toHaveBeenCalledOnce();
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên.",
      code: "FORBIDDEN",
    });
    expect(mockSessionCreate).not.toHaveBeenCalled();
  });

  it("ghi nhận flood guard theo Instagram khi sai mật khẩu", async () => {
    mockUserFindUnique.mockResolvedValue(CUSTOMER);
    mockBcryptCompare.mockResolvedValue(false);

    const response = await loginPOST(
      makeRequest({ insta_name: "ban.ca", password: "wrong12" }),
    );

    expect(response.status).toBe(401);
    expect(mockRecordIdentifierFloodAttempt).toHaveBeenCalledWith(
      "instagram",
      "ban.ca",
    );
  });
});
