import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSession = vi.fn();
const mockUserFindUnique = vi.fn();
const mockSystemLogCreate = vi.fn();
const mockLogSystemEvent = vi.fn();

vi.mock("@/lib/auth", () => ({
  getSession: () => mockGetSession(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...args: unknown[]) => mockUserFindUnique(...args) },
    systemLog: { create: (...args: unknown[]) => mockSystemLogCreate(...args) },
  },
}));

vi.mock("@/lib/logger", () => ({
  logSystemEvent: (...args: unknown[]) => mockLogSystemEvent(...args),
}));

import { POST } from "@/app/api/staff/scan-fallback/route";

describe("POST /api/staff/scan-fallback — privacy logging", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ id: "staff-private-id", role: "STAFF" });
    mockUserFindUnique.mockResolvedValue({
      id: "customer-private-id", role: "CUSTOMER", sourceMerge: null,
      name: "Khách",
      phone_number: "+84901234567",
      points_balance: 10,
      qr_token: "public-token-ABC123",
    });
    mockLogSystemEvent.mockResolvedValue(undefined);
  });

  it("không ghi staff, customer, phone hoặc short code vào audit log", async () => {
    const request = new Request("http://localhost/api/staff/scan-fallback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone_number: "+84901234567", code: "ABC123" }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mockSystemLogCreate).not.toHaveBeenCalled();
    expect(mockLogSystemEvent).toHaveBeenCalledWith({
      level: "info",
      source: "qr_fallback",
      message: "Staff manually verified a QR short code",
    });
    const serializedLog = JSON.stringify(mockLogSystemEvent.mock.calls);
    expect(serializedLog).not.toContain("staff-private-id");
    expect(serializedLog).not.toContain("customer-private-id");
    expect(serializedLog).not.toContain("+84901234567");
    expect(serializedLog).not.toContain("ABC123");
  });
});

describe("Nhập điện thoại nội địa khi xác nhận QR — APPLICATION_LOGIC", () => {
  it.each(["0901234567", "090 123 4567", "84901234567"])("lookup canonical cho %s và vẫn yêu cầu đúng mã", async (phone_number) => {
    mockGetSession.mockResolvedValue({ role: "STAFF" });
    mockUserFindUnique.mockImplementation(async ({ where }: { where: { phone_number: string } }) =>
      where.phone_number === "+84901234567" ? { role: "CUSTOMER", sourceMerge: null, name: "Khách", phone_number: "+84901234567", points_balance: 10, qr_token: "public-token-ABC123" } : null);
    const request = (code: string) => new Request("http://localhost", { method: "POST", body: JSON.stringify({ phone_number, code }) });
    const success = await POST(request("ABC123"));
    expect(success.status).toBe(200);
    expect((await success.json()).data.data.phone_number).toBe("+84901234567");
    expect((await POST(request("WRONG"))).status).toBe(400);
  });
});

describe("nhập tay email — APPLICATION_LOGIC", () => {
  it("lookup email đã tồn tại có dấu cộng và vẫn yêu cầu mã cá nhân", async () => {
    mockGetSession.mockResolvedValue({ role: "STAFF" });
    mockUserFindUnique.mockImplementation(async ({ where }: { where: { email: string } }) =>
      where.email === "ca+ke@example.com" ? { role: "CUSTOMER", sourceMerge: null, email: where.email,
        name: "Cá", phone_number: null, qr_token: "token-ABC123", points_balance: 0 } : null);
    const request = (code: string) => new Request("http://localhost", { method: "POST",
      body: JSON.stringify({ email: " Ca+Ke@EXAMPLE.COM ", code }) });
    expect((await POST(request("ABC123"))).status).toBe(200);
    expect((await POST(request("WRONG1"))).status).toBe(400);
  });

  it("email đúng cùng mã cá nhân trả khách chỉ có email", async () => {
    mockGetSession.mockResolvedValue({ role: "STAFF" });
    mockUserFindUnique.mockResolvedValue({ role: "CUSTOMER", sourceMerge: null, email: "customer@example.com", name: "Email", phone_number: null, qr_token: "token-ABC123", points_balance: 10 });
    const response = await POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ email: "Customer@example.com", code: "abc123" }) }));
    expect(response.status).toBe(200);
    expect((await response.json()).data.data).toMatchObject({ email: "customer@example.com", phone_number: null });
  });
});
