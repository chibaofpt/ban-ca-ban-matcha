import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUserFindUnique = vi.fn();
const mockSessionFindMany = vi.fn();
const mockSessionDeleteMany = vi.fn();
const mockCreateSession = vi.fn();
const mockSignJwt = vi.fn();
const mockSetAuthCookies = vi.fn();
const mockBcryptCompare = vi.fn();
const mockCheckLoginFailLimit = vi.fn();
const mockCheckIdentifierFloodGuard = vi.fn();
const mockRecordLoginFail = vi.fn();
const mockRecordIdentifierFloodAttempt = vi.fn();
const mockResetLoginFail = vi.fn();
const mockResetIdentifierFlood = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...args: unknown[]) => mockUserFindUnique(...args) },
    session: {
      findMany: (...args: unknown[]) => mockSessionFindMany(...args),
      deleteMany: (...args: unknown[]) => mockSessionDeleteMany(...args),
    },
  },
}));

vi.mock("@/lib/auth", () => ({
  normalizePhone: (phone: string) =>
    phone.startsWith("0") ? `+84${phone.slice(1)}` : phone,
  createSession: (...args: unknown[]) => mockCreateSession(...args),
  signJwt: (...args: unknown[]) => mockSignJwt(...args),
  setAuthCookies: (...args: unknown[]) => mockSetAuthCookies(...args),
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
  normalizeInstagramUsername,
} from "@/lib/validations/auth";

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
    mockCheckLoginFailLimit.mockResolvedValue({ allowed: true, remaining: 5 });
    mockCheckIdentifierFloodGuard.mockResolvedValue({ allowed: true });
    mockSessionFindMany.mockResolvedValue([]);
    mockCreateSession.mockResolvedValue("refresh-token");
    mockSignJwt.mockResolvedValue("access-token");
    mockBcryptCompare.mockResolvedValue(true);
  });

  it("CUSTOMER đăng nhập thành công bằng Instagram đã chuẩn hoá", async () => {
    mockUserFindUnique.mockResolvedValue(CUSTOMER);

    const response = await loginPOST(
      makeRequest({ insta_name: " @Ban.Ca ", password: "secret12" }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockUserFindUnique).toHaveBeenCalledWith({
      where: { insta_name: "ban.ca" },
    });
    expect(mockCheckIdentifierFloodGuard).toHaveBeenCalledWith(
      "instagram",
      "ban.ca",
    );
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
    expect(mockCreateSession).not.toHaveBeenCalled();
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
