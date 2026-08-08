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
      id: "customer-private-id",
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
