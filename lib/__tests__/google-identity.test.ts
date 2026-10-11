import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
const boundary = vi.hoisted(() => ({ verify: vi.fn() }));
vi.mock("jose", () => ({ createRemoteJWKSet: () => ({}), jwtVerify: boundary.verify }));
import { verifyGoogleIdentity } from "@/lib/auth/googleIdentity";
describe("Danh tính Google có quyền sở hữu email", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("GOOGLE_CLIENT_ID", undefined);
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_CLIENT_ID", "google-client");
  });
  afterEach(() => { vi.unstubAllEnvs(); });
  it.each([undefined, "   "])("từ chối khi Client ID dùng chung chưa được cấu hình: %s", async (clientId) => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_CLIENT_ID", clientId);
    await expect(verifyGoogleIdentity("assertion", createHash("sha256").update("nonce-1").digest("hex")))
      .rejects.toMatchObject({ reason: "GOOGLE_CONFIG", status: 503, code: "SERVICE_UNAVAILABLE" });
  });
  it("chấp nhận Gmail đã xác minh và chuẩn hóa dấu chấm", async () => {
    boundary.verify.mockResolvedValue({ payload: { sub: "subject-1", email: "Ca.Ban@gmail.com", email_verified: true, nonce: "nonce-1", name: "Bạn Cá" } });
    const result = await verifyGoogleIdentity("assertion", createHash("sha256").update("nonce-1").digest("hex"));
    expect(result).toEqual({ sub: "subject-1", email: "caban@gmail.com", name: "Bạn Cá" });
    expect(boundary.verify).toHaveBeenCalledWith("assertion", expect.anything(), {
      algorithms: ["RS256"], issuer: ["accounts.google.com", "https://accounts.google.com"],
      audience: "google-client", requiredClaims: ["sub", "email", "email_verified", "nonce", "exp", "iat"],
    });
  });
  it("chấp nhận Workspace đã xác minh và giữ dấu chấm", async () => {
    boundary.verify.mockResolvedValue({ payload: { sub: "workspace-sub", email: "Ca.Ban@shop.example", email_verified: true, hd: "shop.example", nonce: "nonce-1", name: "Cá" } });
    await expect(verifyGoogleIdentity("assertion", createHash("sha256").update("nonce-1").digest("hex")))
      .resolves.toEqual({ sub: "workspace-sub", email: "ca.ban@shop.example", name: "Cá" });
  });
  it.each([
    { email_verified: false },
    { email_verified: "true" },
    { email: "customer@external.example" },
    { email: "customer@external.example", hd: "" },
    { nonce: "another-browser-nonce" },
    { sub: "" },
    { email: "invalid" },
  ])("từ chối assertion thiếu bằng chứng sở hữu: %j", async (override) => {
    boundary.verify.mockResolvedValue({ payload: { sub: "subject-1", email: "ca@gmail.com", email_verified: true, nonce: "nonce-1", ...override } });
    await expect(verifyGoogleIdentity("assertion", createHash("sha256").update("nonce-1").digest("hex")))
      .rejects.toMatchObject({ reason: "GOOGLE_ASSERTION_INVALID", status: 401 });
  });
  it.each(["not-a-hash", "a".repeat(64)])("từ chối nonce hash sai hoặc hỏng", async (hash) => {
    boundary.verify.mockResolvedValue({ payload: { sub: "subject-1", email: "ca@gmail.com", email_verified: true, nonce: "nonce-1" } });
    await expect(verifyGoogleIdentity("assertion", hash)).rejects.toMatchObject({ reason: "GOOGLE_ASSERTION_INVALID", status: 401 });
  });
  it("từ chối lỗi xác minh chữ ký/expiry từ jose mà không lộ chi tiết", async () => {
    boundary.verify.mockRejectedValue(new Error("provider signature detail"));
    await expect(verifyGoogleIdentity("assertion", createHash("sha256").update("nonce-1").digest("hex")))
      .rejects.toMatchObject({ message: "GOOGLE_ASSERTION_INVALID", status: 401 });
  });
});