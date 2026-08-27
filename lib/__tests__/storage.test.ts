import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

const mockUpload = vi.fn();
const mockCopy = vi.fn();
const mockRemove = vi.fn();
const mockList = vi.fn();
const mockDownload = vi.fn();
const mockGetPublicUrl = vi.fn();
const { mockCreateClient } = vi.hoisted(() => ({ mockCreateClient: vi.fn() }));

const bucket = {
  upload: (...args: unknown[]) => mockUpload(...args),
  copy: (...args: unknown[]) => mockCopy(...args),
  remove: (...args: unknown[]) => mockRemove(...args),
  list: (...args: unknown[]) => mockList(...args),
  download: (...args: unknown[]) => mockDownload(...args),
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
  downloadMenuImage,
  listMenuImages,
  parseMenuImagePath,
  removeMenuImages,
  uploadMenuImage,
} from "@/lib/storage";

async function makeImage(
  width = 10,
  height = 10,
  format: "jpeg" | "png" | "webp" = "png",
): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: "green" } })[format]().toBuffer();
}

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

    await storage.uploadMenuImage("products/latte/secret.webp", await makeImage(), "image/png");

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

    await storage.uploadMenuImage("products/latte/legacy.webp", await makeImage(), "image/png");

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

  it("chuẩn hóa ảnh thành WebP tối đa 800px với cache một năm và upsert false", async () => {
    await uploadMenuImage("products/latte/a.webp", await makeImage(1200, 1000), "image/png");

    const uploadedBuffer = mockUpload.mock.calls[0]?.[1] as Buffer;
    const metadata = await sharp(uploadedBuffer).metadata();
    expect(mockUpload).toHaveBeenCalledWith(
      "products/latte/a.webp",
      expect.any(Buffer),
      { contentType: "image/webp", cacheControl: "31536000", upsert: false },
    );
    expect(metadata.format).toBe("webp");
    expect(metadata.width).toBe(800);
    expect(metadata.height).toBe(667);
  });

  it("không phóng lớn ảnh nhỏ hơn 800px", async () => {
    await uploadMenuImage("products/latte/small.webp", await makeImage(320, 240, "jpeg"), "image/jpeg");

    const metadata = await sharp(mockUpload.mock.calls[0]?.[1] as Buffer).metadata();
    expect(metadata.width).toBe(320);
    expect(metadata.height).toBe(240);
  });

  it("preset compact giới hạn ảnh sữa/addon ở 320px", async () => {
    await uploadMenuImage(
      "products/milk-types/oat.webp",
      await makeImage(1200, 900),
      "image/png",
      "compact",
    );

    const metadata = await sharp(mockUpload.mock.calls[0]?.[1] as Buffer).metadata();
    expect(metadata.format).toBe("webp");
    expect(metadata.width).toBe(320);
    expect(metadata.height).toBe(240);
  });

  it("không gọi Storage khi buffer ảnh bị hỏng", async () => {
    await expect(uploadMenuImage(
      "products/latte/broken.webp",
      Buffer.from("not-an-image"),
      "image/png",
    )).rejects.toThrow();

    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("giữ nguyên thông tin lỗi từ Supabase Storage", async () => {
    mockUpload.mockResolvedValueOnce({ error: { message: "bucket unavailable" } });

    await expect(uploadMenuImage(
      "products/latte/error.webp",
      await makeImage(10, 10, "webp"),
      "image/webp",
    )).rejects.toThrow("Upload failed: bucket unavailable");
  });

  it("download trả buffer và content type của object", async () => {
    mockDownload.mockResolvedValueOnce({
      data: new Blob(["image-bytes"], { type: "image/png" }),
      error: null,
    });

    const result = await downloadMenuImage("products/latte/a.png");

    expect(result.contentType).toBe("image/png");
    expect(result.buffer.length).toBeGreaterThan(0);
  });

  it("copy và remove chỉ đi qua Storage SDK wrapper", async () => {
    await copyMenuImage("old.webp", "new.webp");
    await removeMenuImages(["old.webp"]);

    expect(mockCopy).toHaveBeenCalledWith("old.webp", "new.webp");
    expect(mockRemove).toHaveBeenCalledWith(["old.webp"]);
  });

  it("quét đệ quy folder và giữ nguyên path đầy đủ cùng metadata", async () => {
    mockList
      .mockResolvedValueOnce({
        data: [
          { id: null, name: "products", created_at: null, updated_at: null },
          {
            id: "root-id",
            name: "legacy.webp",
            created_at: "2026-07-01T00:00:00Z",
            updated_at: null,
            metadata: { size: 1234, cacheControl: "max-age=31536000" },
          },
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

    expect(await listMenuImages()).toEqual([
      {
        path: "legacy.webp",
        createdAt: "2026-07-01T00:00:00Z",
        cacheControl: "max-age=31536000",
        size: 1234,
      },
      {
        path: "products/latte/matcha.webp",
        createdAt: "2026-07-02T00:00:00Z",
        cacheControl: null,
        size: null,
      },
    ]);
  });
});
