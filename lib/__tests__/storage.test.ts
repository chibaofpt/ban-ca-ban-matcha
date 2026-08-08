import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUpload = vi.fn();
const mockCopy = vi.fn();
const mockRemove = vi.fn();
const mockList = vi.fn();
const mockGetPublicUrl = vi.fn();
const { mockCreateClient } = vi.hoisted(() => ({
  mockCreateClient: vi.fn(),
}));

const bucket = {
  upload: (...args: unknown[]) => mockUpload(...args),
  copy: (...args: unknown[]) => mockCopy(...args),
  remove: (...args: unknown[]) => mockRemove(...args),
  list: (...args: unknown[]) => mockList(...args),
  getPublicUrl: (...args: unknown[]) => mockGetPublicUrl(...args),
};

vi.mock("@supabase/supabase-js", () => ({
  createClient: (...args: unknown[]) => {
    mockCreateClient(...args);
    return { storage: { from: () => bucket } };
  },
}));

import {
  buildMenuImagePath,
  copyMenuImage,
  listMenuImages,
  parseMenuImagePath,
  removeMenuImages,
  uploadMenuImage,
} from "@/lib/storage";

describe("Supabase Storage wrapper cho ảnh menu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role");
    mockUpload.mockResolvedValue({ error: null });
    mockCopy.mockResolvedValue({ error: null });
    mockRemove.mockResolvedValue({ data: [], error: null });
    mockGetPublicUrl.mockReturnValue({
      data: { publicUrl: "https://project.supabase.co/storage/v1/object/public/menu-images/path.webp" },
    });
  });

  it("ưu tiên Supabase secret key mới cho server storage wrapper", async () => {
    vi.resetModules();
    vi.stubEnv("SUPABASE_SECRET_KEY", "secret-key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "legacy-key");
    const storage = await import("@/lib/storage");

    await storage.uploadMenuImage("products/latte/secret.webp", Buffer.from("image"), "image/webp");

    expect(mockCreateClient).toHaveBeenLastCalledWith(
      "https://project.supabase.co",
      "secret-key",
      { auth: { persistSession: false } },
    );
  });

  it("fallback sang service-role key legacy cho server storage wrapper", async () => {
    vi.resetModules();
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "legacy-key");
    const storage = await import("@/lib/storage");

    await storage.uploadMenuImage("products/latte/legacy.webp", Buffer.from("image"), "image/webp");

    expect(mockCreateClient).toHaveBeenLastCalledWith(
      "https://project.supabase.co",
      "legacy-key",
      { auth: { persistSession: false } },
    );
  });

  it("tạo slug SEO tiếng Việt và thêm suffix chống collision", () => {
    expect(buildMenuImagePath({
      category: "latte",
      productName: "Matcha Đậu Đỏ Đặc Biệt",
      requestedName: "  Matcha Đậu Đỏ!!!.webp ",
      contentType: "image/webp",
      suffix: "a1b2c3d4",
    })).toBe("products/latte/matcha-dau-do-a1b2c3d4.webp");
  });

  it("dùng tên sản phẩm khi filename tùy chọn để trống", () => {
    expect(buildMenuImagePath({
      category: "fusion",
      productName: "Cam Matcha",
      requestedName: "",
      contentType: "image/png",
      suffix: "12345678",
    })).toBe("products/fusion/cam-matcha-12345678.png");
  });

  it("từ chối path traversal trong filename", () => {
    expect(() => buildMenuImagePath({
      category: "latte",
      productName: "Matcha",
      requestedName: "../secret",
      contentType: "image/webp",
      suffix: "12345678",
    })).toThrow("INVALID_IMAGE_FILENAME");
  });

  it("parse object path từ public URL đúng bucket", () => {
    expect(parseMenuImagePath(
      "https://project.supabase.co/storage/v1/object/public/menu-images/products/latte/a.webp",
    )).toBe("products/latte/a.webp");
  });

  it("không parse URL ngoài bucket menu-images", () => {
    expect(parseMenuImagePath("https://cdn.example.com/a.webp")).toBeNull();
  });

  it("upload dùng upsert false", async () => {
    await uploadMenuImage("products/latte/a.webp", Buffer.from("image"), "image/webp");

    expect(mockUpload).toHaveBeenCalledWith(
      "products/latte/a.webp",
      expect.any(Buffer),
      { contentType: "image/webp", upsert: false },
    );
  });

  it("copy và remove chỉ đi qua Storage SDK wrapper", async () => {
    await copyMenuImage("old.webp", "new.webp");
    await removeMenuImages(["old.webp"]);

    expect(mockCopy).toHaveBeenCalledWith("old.webp", "new.webp");
    expect(mockRemove).toHaveBeenCalledWith(["old.webp"]);
  });

  it("quét đệ quy folder và giữ nguyên path đầy đủ", async () => {
    mockList
      .mockResolvedValueOnce({
        data: [
          { id: null, name: "products", created_at: null, updated_at: null },
          { id: "root-id", name: "legacy.webp", created_at: "2026-07-01T00:00:00Z", updated_at: null },
        ],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [{ id: null, name: "latte", created_at: null, updated_at: null }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [{ id: "nested-id", name: "matcha.webp", created_at: "2026-07-02T00:00:00Z", updated_at: null }],
        error: null,
      });

    const result = await listMenuImages();

    expect(result.map((item) => item.path)).toEqual([
      "legacy.webp",
      "products/latte/matcha.webp",
    ]);
  });
});
