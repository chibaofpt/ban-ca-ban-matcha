import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSession = vi.fn();
const mockUserFindUnique = vi.fn();
const mockUserUpdate = vi.fn();
const mockBcryptCompare = vi.fn();

vi.mock("@/lib/auth", () => ({
  getSession: () => mockGetSession(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
      update: (...args: unknown[]) => mockUserUpdate(...args),
    },
  },
}));

vi.mock("bcryptjs", () => ({
  default: {
    compare: (...args: unknown[]) => mockBcryptCompare(...args),
  },
}));

import { GET, PATCH } from "@/app/api/profile/route";

function makePatch(body: unknown): Request {
  return new Request("http://localhost/api/profile", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const PROFILE = {
  id: "customer-id",
  name: "Bạn Cá",
  phone_number: "+84912345678",
  insta_name: "ban.ca",
  points_balance: 25,
  qr_token: "qr-token",
  password_hash: "$2a$12$validhash",
};

describe("GET /api/profile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({
      id: "customer-id",
      role: "CUSTOMER",
      phone_number: "+84912345678",
    });
  });

  it("trả hồ sơ hiện tại mà không expose id và password", async () => {
    mockUserFindUnique.mockResolvedValue(PROFILE);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual({
      name: "Bạn Cá",
      phone_number: "+84912345678",
      insta_name: "ban.ca",
      points_balance: 25,
      qr_token: "qr-token",
    });
    expect(body.data.id).toBeUndefined();
    expect(body.data.password_hash).toBeUndefined();
  });

  it("trả 403 nếu session không phải CUSTOMER", async () => {
    mockGetSession.mockResolvedValue({
      id: "staff-id",
      role: "STAFF",
      phone_number: "+84911111111",
    });

    const response = await GET();

    expect(response.status).toBe(403);
  });
});

describe("PATCH /api/profile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({
      id: "customer-id",
      role: "CUSTOMER",
      phone_number: "+84912345678",
    });
    mockUserFindUnique.mockResolvedValue(PROFILE);
    mockUserUpdate.mockResolvedValue({
      ...PROFILE,
      name: "Tên mới",
    });
    mockBcryptCompare.mockResolvedValue(true);
  });

  it("cho phép sửa riêng tên mà không cần mật khẩu", async () => {
    const response = await PATCH(makePatch({ name: "  Tên mới  " }));

    expect(response.status).toBe(200);
    expect(mockBcryptCompare).not.toHaveBeenCalled();
    expect(mockUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { name: "Tên mới" } }),
    );
  });

  it("yêu cầu mật khẩu khi Instagram thay đổi", async () => {
    const response = await PATCH(makePatch({ insta_name: "ten.moi" }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it("trả validation error và không update khi mật khẩu hiện tại sai", async () => {
    mockBcryptCompare.mockResolvedValue(false);

    const response = await PATCH(
      makePatch({ insta_name: "ten.moi", current_password: "wrong12" }),
    );

    expect(response.status).toBe(400);
    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it("cho phép xoá Instagram khi mật khẩu đúng", async () => {
    mockUserUpdate.mockResolvedValue({ ...PROFILE, insta_name: null });

    const response = await PATCH(
      makePatch({ insta_name: null, current_password: "secret12" }),
    );

    expect(response.status).toBe(200);
    expect(mockUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { insta_name: null } }),
    );
  });

  it("trả 409 khi unique constraint phát hiện Instagram trùng", async () => {
    mockUserUpdate.mockRejectedValue({ code: "P2002" });

    const response = await PATCH(
      makePatch({ insta_name: "da.co.nguoi", current_password: "secret12" }),
    );

    expect(response.status).toBe(409);
  });
});
