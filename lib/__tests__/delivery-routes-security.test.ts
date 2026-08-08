import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockGetSession = vi.fn();
const mockCheckRateLimits = vi.fn();
const mockAutocomplete = vi.fn();
const mockGeocode = vi.fn();
const mockDistance = vi.fn();
const mockReverse = vi.fn();

vi.mock("@/lib/auth", () => ({ getSession: () => mockGetSession() }));
vi.mock("@/lib/rateLimit", () => ({
  checkRateLimits: (...args: unknown[]) => mockCheckRateLimits(...args),
  getClientIp: () => "203.0.113.9",
}));
vi.mock("@/lib/goong", () => ({
  goongAutocomplete: (...args: unknown[]) => mockAutocomplete(...args),
  goongGeocode: (...args: unknown[]) => mockGeocode(...args),
  goongDistanceMatrix: (...args: unknown[]) => mockDistance(...args),
  goongReverseGeocode: (...args: unknown[]) => mockReverse(...args),
  getStoreLocation: () => ({ lat: 10.7, lng: 106.7 }),
}));

import { GET as autocompleteGET } from "@/app/api/delivery/autocomplete/route";
import { GET as estimateGET } from "@/app/api/delivery/estimate/route";
import { GET as geocodeGET } from "@/app/api/delivery/geocode/route";
import { GET as reverseGET } from "@/app/api/delivery/reverse-geocode/route";

function request(path: string): NextRequest {
  return new NextRequest(`http://localhost${path}`);
}

describe("Bảo vệ proxy giao hàng", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ id: "user-1", role: "CUSTOMER" });
    mockCheckRateLimits.mockResolvedValue({ allowed: true, remaining: 59, retryAfterSeconds: 0 });
    mockAutocomplete.mockResolvedValue([]);
    mockGeocode.mockResolvedValue({ lat: 10.7, lng: 106.7 });
    mockDistance.mockResolvedValue({ distanceKm: 1, durationMinutes: 5 });
    mockReverse.mockResolvedValue({ address: "123 Test Street" });
  });

  it("mọi request hợp lệ dùng đồng thời quota tài khoản và IP dùng chung", async () => {
    const res = await autocompleteGET(request("/api/delivery/autocomplete?q=matcha"));

    expect(res.status).toBe(200);
    expect(mockCheckRateLimits).toHaveBeenCalledWith([
      { ruleName: "deliveryAccount", identifier: "user-1" },
      { ruleName: "deliveryIp", identifier: "203.0.113.9" },
    ]);
  });

  it("không gọi upstream hoặc auth khi autocomplete query sai", async () => {
    const res = await autocompleteGET(request("/api/delivery/autocomplete?q=x"));

    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("VALIDATION_ERROR");
    expect(mockGetSession).not.toHaveBeenCalled();
    expect(mockAutocomplete).not.toHaveBeenCalled();
  });

  it("từ chối geocode address ngắn hơn 5 ký tự", async () => {
    const res = await geocodeGET(request("/api/delivery/geocode?address=1234"));
    expect(res.status).toBe(400);
    expect(mockGeocode).not.toHaveBeenCalled();
  });

  it("từ chối estimate có tọa độ ngoài phạm vi", async () => {
    const res = await estimateGET(request("/api/delivery/estimate?lat=91&lng=106"));
    expect(res.status).toBe(400);
    expect(mockDistance).not.toHaveBeenCalled();
  });

  it("trả Retry-After tổng hợp ổn định trước khi reverse geocode", async () => {
    mockCheckRateLimits.mockResolvedValue({ allowed: false, remaining: 0, retryAfterSeconds: 47 });

    const res = await reverseGET(request("/api/delivery/reverse-geocode?lat=10&lng=106"));

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("47");
    expect(mockReverse).not.toHaveBeenCalled();
  });
});
