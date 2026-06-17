/**
 * Unit tests for auth API routes:
 *  - POST /api/auth/check-phone — ghost user exclusion (BUG-6)
 *  - POST /api/auth/login — ghost user guard (EDGE-3), session limit (EDGE-4)
 *  - POST /api/auth/register — session limit (EDGE-4)
 *  - GET  /api/auth/me — new route (BUG-2)
 *
 * Strategy: mock lib/prisma, lib/auth, bcryptjs — test all business rule branches.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks (khai báo TRƯỚC import) ──────────────────────────────────────────────

const mockGetSession = vi.fn();
const mockSetAuthCookies = vi.fn();
const mockClearAuthCookies = vi.fn();
const mockSignJwt = vi.fn();
const mockCreateSession = vi.fn();
const mockNormalizePhone = vi.fn();

const mockUserFindUnique = vi.fn();
const mockUserCreate = vi.fn();
const mockUserUpdate = vi.fn();
const mockSessionFindUnique = vi.fn();
const mockSessionFindMany = vi.fn();
const mockSessionCreate = vi.fn();
const mockSessionDelete = vi.fn();
const mockSessionDeleteMany = vi.fn();
const mockPointsLogCreate = vi.fn();
const mockTransaction = vi.fn();

const mockBcryptCompare = vi.fn();
const mockBcryptHash = vi.fn();

vi.mock("@/lib/auth", () => ({
  getSession: () => mockGetSession(),
  setAuthCookies: (...args: unknown[]) => mockSetAuthCookies(...args),
  clearAuthCookies: () => mockClearAuthCookies(),
  signJwt: (...args: unknown[]) => mockSignJwt(...args),
  createSession: (...args: unknown[]) => mockCreateSession(...args),
  normalizePhone: (phone: string) => mockNormalizePhone(phone),
  getRefreshTokenCookie: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
      create: (...args: unknown[]) => mockUserCreate(...args),
      update: (...args: unknown[]) => mockUserUpdate(...args),
    },
    session: {
      findUnique: (...args: unknown[]) => mockSessionFindUnique(...args),
      findMany: (...args: unknown[]) => mockSessionFindMany(...args),
      create: (...args: unknown[]) => mockSessionCreate(...args),
      delete: (...args: unknown[]) => mockSessionDelete(...args),
      deleteMany: (...args: unknown[]) => mockSessionDeleteMany(...args),
    },
    pointsLog: {
      create: (...args: unknown[]) => mockPointsLogCreate(...args),
    },
    $transaction: (fn: (tx: unknown) => Promise<unknown>) => mockTransaction(fn),
  },
}));

vi.mock("bcryptjs", () => ({
  default: {
    compare: (...args: unknown[]) => mockBcryptCompare(...args),
    hash: (...args: unknown[]) => mockBcryptHash(...args),
  },
}));

// ── Import SAU mock ───────────────────────────────────────────────────────────

import { POST as checkPhonePOST } from "@/app/api/auth/check-phone/route";
import { POST as loginPOST } from "@/app/api/auth/login/route";
import { POST as registerPOST } from "@/app/api/auth/register/route";
import { GET as meGET } from "@/app/api/auth/me/route";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRequest(body: unknown, method = "POST") {
  return new Request("http://localhost/api/auth/test", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const REAL_USER = {
  id: "user-real-uuid",
  name: "Nguyen Van A",
  phone_number: "+84912345678",
  password_hash: "$2a$12$validhash",
  role: "CUSTOMER",
  failed_login_attempts: 0,
  locked_until: null,
};

const GHOST_USER = {
  id: "user-ghost-uuid",
  name: "Ghost",
  phone_number: "+84912345678",
  password_hash: "GHOST_USER_NO_PASSWORD",
  role: "CUSTOMER",
  failed_login_attempts: 0,
  locked_until: null,
};

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/auth/check-phone
// ══════════════════════════════════════════════════════════════════════════════

describe("POST /api/auth/check-phone — ghost user exclusion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNormalizePhone.mockImplementation((p: string) =>
      p.startsWith("0") ? `+84${p.slice(1)}` : p
    );
  });

  it("trả về exists: true khi số điện thoại đã có tài khoản thật", async () => {
    mockUserFindUnique.mockResolvedValueOnce({
      id: "real-id",
      password_hash: "$2a$12$validhash",
    });

    const res = await checkPhonePOST(makeRequest({ phone_number: "0912345678" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.exists).toBe(true);
  });

  it("trả về exists: false khi số điện thoại là ghost user (chưa đăng ký thật)", async () => {
    mockUserFindUnique.mockResolvedValueOnce({
      id: "ghost-id",
      password_hash: "GHOST_USER_NO_PASSWORD",
    });

    const res = await checkPhonePOST(makeRequest({ phone_number: "0912345678" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.exists).toBe(false);
  });

  it("trả về exists: false khi số điện thoại chưa tồn tại trong DB", async () => {
    mockUserFindUnique.mockResolvedValueOnce(null);

    const res = await checkPhonePOST(makeRequest({ phone_number: "0912345678" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.exists).toBe(false);
  });

  it("trả về 400 khi số điện thoại không hợp lệ", async () => {
    const res = await checkPhonePOST(makeRequest({ phone_number: "invalid" }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe("INVALID_INPUT");
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/auth/login
// ══════════════════════════════════════════════════════════════════════════════

describe("POST /api/auth/login — ghost user guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNormalizePhone.mockImplementation((p: string) =>
      p.startsWith("0") ? `+84${p.slice(1)}` : p
    );
    mockSignJwt.mockResolvedValue("access-token-xyz");
    mockCreateSession.mockResolvedValue("refresh-token-xyz");
    mockSetAuthCookies.mockResolvedValue(undefined);
  });

  it("trả về 401 NOT_REGISTERED khi đăng nhập với số điện thoại của ghost user", async () => {
    mockUserFindUnique.mockResolvedValueOnce(GHOST_USER);
    mockBcryptCompare.mockResolvedValueOnce(false); // timing-safe still runs

    const res = await loginPOST(makeRequest({ phone_number: "0912345678", password: "password123" }));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.code).toBe("NOT_REGISTERED");
    // Phải chạy bcrypt compare dù là ghost user (timing-safe)
    expect(mockBcryptCompare).toHaveBeenCalledOnce();
  });

  it("không increment failed_login_attempts cho ghost user", async () => {
    mockUserFindUnique.mockResolvedValueOnce(GHOST_USER);
    mockBcryptCompare.mockResolvedValueOnce(false);

    await loginPOST(makeRequest({ phone_number: "0912345678", password: "anypass" }));

    expect(mockUserUpdate).not.toHaveBeenCalled();
  });

  it("đăng nhập thành công với user thật → trả 200 và set cookies", async () => {
    mockUserFindUnique.mockResolvedValueOnce(REAL_USER);
    mockBcryptCompare.mockResolvedValueOnce(true);
    mockSessionFindMany.mockResolvedValueOnce([]); // no active sessions

    const res = await loginPOST(makeRequest({ phone_number: "0912345678", password: "password123" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.name).toBe("Nguyen Van A");
    expect(mockSetAuthCookies).toHaveBeenCalledOnce();
  });

  it("trả về 401 ACCOUNT_LOCKED khi tài khoản đang bị khóa", async () => {
    const lockedUser = { ...REAL_USER, locked_until: new Date(Date.now() + 10 * 60 * 1000) };
    mockUserFindUnique.mockResolvedValueOnce(lockedUser);

    const res = await loginPOST(makeRequest({ phone_number: "0912345678", password: "password123" }));
    const body = await res.json();

    expect(res.status).toBe(429);
    expect(body.code).toBe("ACCOUNT_LOCKED");
  });

  it("trả về 401 INVALID_CREDENTIALS khi sai mật khẩu", async () => {
    mockUserFindUnique.mockResolvedValueOnce(REAL_USER);
    mockBcryptCompare.mockResolvedValueOnce(false);

    const res = await loginPOST(makeRequest({ phone_number: "0912345678", password: "wrongpass" }));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.code).toBe("INVALID_CREDENTIALS");
  });

  it("chạy bcrypt compare với DUMMY_HASH khi user không tồn tại (timing-safe)", async () => {
    mockUserFindUnique.mockResolvedValueOnce(null);
    mockBcryptCompare.mockResolvedValueOnce(false);

    await loginPOST(makeRequest({ phone_number: "0999999999", password: "anypass" }));

    expect(mockBcryptCompare).toHaveBeenCalledOnce();
    // Phải dùng DUMMY_HASH khi user null
    const [, hashArg] = mockBcryptCompare.mock.calls[0] as [string, string];
    expect(hashArg).toMatch(/^\$2a\$/); // valid bcrypt hash format
  });
});

describe("POST /api/auth/login — session limit (max 5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNormalizePhone.mockImplementation((p: string) =>
      p.startsWith("0") ? `+84${p.slice(1)}` : p
    );
    mockBcryptCompare.mockResolvedValue(true);
    mockSignJwt.mockResolvedValue("access-token");
    mockCreateSession.mockResolvedValue("refresh-token");
    mockSetAuthCookies.mockResolvedValue(undefined);
    mockSessionDeleteMany.mockResolvedValue({ count: 0 });
  });

  it("không xóa session cũ khi số lượng session < 5", async () => {
    mockUserFindUnique.mockResolvedValueOnce(REAL_USER);
    mockSessionFindMany.mockResolvedValueOnce([
      { id: "s1" }, { id: "s2" }, { id: "s3" },
    ]);

    await loginPOST(makeRequest({ phone_number: "0912345678", password: "pass123" }));

    expect(mockSessionDeleteMany).not.toHaveBeenCalled();
  });

  it("xóa session cũ nhất khi đã có đúng 5 session active", async () => {
    mockUserFindUnique.mockResolvedValueOnce(REAL_USER);
    const fiveSessions = [
      { id: "s1" }, { id: "s2" }, { id: "s3" }, { id: "s4" }, { id: "s5" },
    ];
    mockSessionFindMany.mockResolvedValueOnce(fiveSessions);

    await loginPOST(makeRequest({ phone_number: "0912345678", password: "pass123" }));

    expect(mockSessionDeleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: ["s1"] } }),
      })
    );
  });

  it("xóa nhiều session cũ khi có > 5 session active (giữ 4 mới nhất)", async () => {
    mockUserFindUnique.mockResolvedValueOnce(REAL_USER);
    const sevenSessions = [
      { id: "s1" }, { id: "s2" }, { id: "s3" }, { id: "s4" },
      { id: "s5" }, { id: "s6" }, { id: "s7" },
    ];
    mockSessionFindMany.mockResolvedValueOnce(sevenSessions);

    await loginPOST(makeRequest({ phone_number: "0912345678", password: "pass123" }));

    expect(mockSessionDeleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: ["s1", "s2", "s3"] } }),
      })
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/auth/register — session limit
// ══════════════════════════════════════════════════════════════════════════════

describe("POST /api/auth/register — session limit và ghost user conversion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNormalizePhone.mockImplementation((p: string) =>
      p.startsWith("0") ? `+84${p.slice(1)}` : p
    );
    mockBcryptHash.mockResolvedValue("$2a$12$hashed");
    mockBcryptCompare.mockResolvedValue(false);
    mockSignJwt.mockResolvedValue("access-token");
    mockSetAuthCookies.mockResolvedValue(undefined);
  });

  it("đăng ký user mới thành công → trả 201 và set cookies", async () => {
    mockUserFindUnique.mockResolvedValueOnce(null);
    mockTransaction.mockImplementationOnce(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          user: {
            create: vi.fn().mockResolvedValue({ ...REAL_USER, id: "new-user-id" }),
            update: vi.fn(),
          },
          session: {
            findMany: vi.fn().mockResolvedValue([]),
            create: vi.fn().mockResolvedValue({ refresh_token: "new-refresh-token" }),
            deleteMany: vi.fn(),
          },
          pointsLog: { create: vi.fn() },
        };
        return fn(tx);
      }
    );

    const res = await registerPOST(
      makeRequest({ name: "Nguyen Van A", phone_number: "0912345678", password: "password123" })
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.data.role).toBe("CUSTOMER");
    expect(mockSetAuthCookies).toHaveBeenCalledOnce();
  });

  it("trả 409 CONFLICT khi số điện thoại đã đăng ký (không phải ghost)", async () => {
    mockUserFindUnique.mockResolvedValueOnce(REAL_USER);
    mockBcryptCompare.mockResolvedValueOnce(false); // timing-safe

    const res = await registerPOST(
      makeRequest({ name: "Test", phone_number: "0912345678", password: "password123" })
    );
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.code).toBe("CONFLICT");
  });

  it("convert ghost user thành real user khi đăng ký với số điện thoại ghost", async () => {
    mockUserFindUnique.mockResolvedValueOnce(GHOST_USER);
    const mockTxUserUpdate = vi.fn().mockResolvedValue({ ...GHOST_USER, password_hash: "$2a$12$hashed", name: "Real Name" });
    const mockTxSessionCreate = vi.fn().mockResolvedValue({ refresh_token: "new-refresh-token" });
    const mockTxSessionFindMany = vi.fn().mockResolvedValue([]);
    const mockTxSessionDeleteMany = vi.fn();
    const mockTxPointsLogCreate = vi.fn();

    mockTransaction.mockImplementationOnce(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          user: { update: mockTxUserUpdate, create: vi.fn() },
          session: {
            findMany: mockTxSessionFindMany,
            create: mockTxSessionCreate,
            deleteMany: mockTxSessionDeleteMany,
          },
          pointsLog: { create: mockTxPointsLogCreate },
        };
        return fn(tx);
      }
    );

    const res = await registerPOST(
      makeRequest({ name: "Real Name", phone_number: "0912345678", password: "newpassword" })
    );

    expect(res.status).toBe(201);
    expect(mockTxUserUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: GHOST_USER.id },
        data: expect.objectContaining({ name: "Real Name", password_hash: "$2a$12$hashed" }),
      })
    );
  });

  it("xóa session cũ nhất khi ghost user đã có 5 session active (edge case đặc biệt)", async () => {
    mockUserFindUnique.mockResolvedValueOnce(GHOST_USER);
    const mockTxUserUpdate = vi.fn().mockResolvedValue({ ...GHOST_USER, password_hash: "$2a$12$hashed" });
    const mockTxSessionCreate = vi.fn().mockResolvedValue({ refresh_token: "new-token" });
    const mockTxSessionFindMany = vi.fn().mockResolvedValue([
      { id: "s1" }, { id: "s2" }, { id: "s3" }, { id: "s4" }, { id: "s5" },
    ]);
    const mockTxSessionDeleteMany = vi.fn();

    mockTransaction.mockImplementationOnce(
      async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          user: { update: mockTxUserUpdate, create: vi.fn() },
          session: {
            findMany: mockTxSessionFindMany,
            create: mockTxSessionCreate,
            deleteMany: mockTxSessionDeleteMany,
          },
          pointsLog: { create: vi.fn() },
        };
        return fn(tx);
      }
    );

    await registerPOST(
      makeRequest({ name: "Real Name", phone_number: "0912345678", password: "newpassword" })
    );

    expect(mockTxSessionDeleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: ["s1"] } }),
      })
    );
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// GET /api/auth/me
// ══════════════════════════════════════════════════════════════════════════════

describe("GET /api/auth/me — trả thông tin session hiện tại", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("trả về id và role khi có session hợp lệ", async () => {
    mockGetSession.mockResolvedValueOnce({ id: "user-abc", role: "CUSTOMER", phone_number: "+84912345678" });

    const res = await meGET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.id).toBe("user-abc");
    expect(body.data.role).toBe("CUSTOMER");
  });

  it("trả về id và role cho ADMIN session", async () => {
    mockGetSession.mockResolvedValueOnce({ id: "admin-xyz", role: "ADMIN", phone_number: "+84900000001" });

    const res = await meGET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.role).toBe("ADMIN");
  });

  it("trả về 401 khi không có session (chưa đăng nhập)", async () => {
    mockGetSession.mockResolvedValueOnce(null);

    const res = await meGET();
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.code).toBe("UNAUTHORIZED");
  });

  it("không expose phone_number trong response", async () => {
    mockGetSession.mockResolvedValueOnce({ id: "user-abc", role: "CUSTOMER", phone_number: "+84912345678" });

    const res = await meGET();
    const body = await res.json();

    expect(body.data.phone_number).toBeUndefined();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// normalizePhone — tested separately in lib/__tests__/auth-normalize-phone.test.ts
// ══════════════════════════════════════════════════════════════════════════════
// NOTE: normalizePhone tests are in their own file to avoid mock hoisting
// conflicts (lib/auth imports next/headers which requires a separate mock context).

