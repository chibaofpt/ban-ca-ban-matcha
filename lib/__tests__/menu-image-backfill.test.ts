import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  runMenuImageBackfill,
  type MenuImageBackfillDependencies,
} from "@/lib/menuImageBackfill";

const STAGING_URL = "https://mnklsbzkefuefpqvghrr.supabase.co";
const oldUrl = `${STAGING_URL}/storage/v1/object/public/menu-images/products/latte/old.png`;

function createDependencies(): MenuImageBackfillDependencies {
  return {
    listReferences: vi.fn().mockResolvedValue([{
      source: "menuItem",
      id: "menu-1",
      name: "Matcha",
      category: "latte",
      imageUrl: oldUrl,
    }]),
    listObjects: vi.fn().mockResolvedValue([{
      path: "products/latte/old.png",
      createdAt: "2026-08-01T00:00:00.000Z",
      cacheControl: "3600",
      size: 1_000_000,
    }]),
    downloadImage: vi.fn().mockResolvedValue({ buffer: Buffer.from("image"), contentType: "image/png" }),
    uploadImage: vi.fn().mockResolvedValue(
      `${STAGING_URL}/storage/v1/object/public/menu-images/products/latte/matcha-12345678.webp`,
    ),
    updateReference: vi.fn().mockResolvedValue(true),
    removeImages: vi.fn().mockResolvedValue(undefined),
    buildOutputPath: vi.fn().mockReturnValue("products/latte/matcha-12345678.webp"),
  };
}

describe("Backfill ảnh menu staging", () => {
  beforeEach(() => vi.clearAllMocks());

  it("chặn project ref không phải staging trước khi đọc dữ liệu", async () => {
    const dependencies = createDependencies();
    await expect(runMenuImageBackfill({
      apply: false,
      supabaseUrl: "https://nqwfbmghziubdhvtgyao.supabase.co",
      dependencies,
    })).rejects.toThrow("STAGING_PROJECT_REF_REQUIRED");
    expect(dependencies.listReferences).not.toHaveBeenCalled();
  });

  it("dry-run chỉ kiểm kê và không mutate", async () => {
    const dependencies = createDependencies();
    const result = await runMenuImageBackfill({ apply: false, supabaseUrl: STAGING_URL, dependencies });

    expect(result).toEqual({ scanned: 1, eligible: 1, optimized: 0, skipped: 0, failed: 0 });
    expect(dependencies.downloadImage).not.toHaveBeenCalled();
    expect(dependencies.uploadImage).not.toHaveBeenCalled();
    expect(dependencies.updateReference).not.toHaveBeenCalled();
    expect(dependencies.removeImages).not.toHaveBeenCalled();
  });

  it("bỏ qua WebP đã có cache TTL một năm", async () => {
    const dependencies = createDependencies();
    vi.mocked(dependencies.listReferences).mockResolvedValueOnce([{
      source: "menuItem", id: "menu-1", name: "Matcha", category: "latte",
      imageUrl: oldUrl.replace("old.png", "ready.webp"),
    }]);
    vi.mocked(dependencies.listObjects).mockResolvedValueOnce([{
      path: "products/latte/ready.webp", createdAt: null,
      cacheControl: "max-age=31536000", size: 50_000,
    }]);

    const result = await runMenuImageBackfill({ apply: true, supabaseUrl: STAGING_URL, dependencies });

    expect(result).toEqual({ scanned: 1, eligible: 0, optimized: 0, skipped: 1, failed: 0 });
    expect(dependencies.uploadImage).not.toHaveBeenCalled();
  });

  it("apply cập nhật image_url bằng compare-and-swap và giữ ảnh cũ", async () => {
    const dependencies = createDependencies();
    const result = await runMenuImageBackfill({ apply: true, supabaseUrl: STAGING_URL, dependencies });

    expect(dependencies.updateReference).toHaveBeenCalledWith(
      expect.objectContaining({ id: "menu-1" }), oldUrl,
      expect.stringContaining("matcha-12345678.webp"),
    );
    expect(dependencies.removeImages).not.toHaveBeenCalled();
    expect(result.optimized).toBe(1);
  });

  it("xóa ảnh mới khi compare-and-swap không cập nhật được DB", async () => {
    const dependencies = createDependencies();
    vi.mocked(dependencies.updateReference).mockResolvedValueOnce(false);
    const result = await runMenuImageBackfill({ apply: true, supabaseUrl: STAGING_URL, dependencies });

    expect(dependencies.removeImages).toHaveBeenCalledWith(["products/latte/matcha-12345678.webp"]);
    expect(result.failed).toBe(1);
    expect(result.optimized).toBe(0);
  });

  it("xóa ảnh mới khi DB ném lỗi, nhưng không xóa gì nếu upload thất bại", async () => {
    const dependencies = createDependencies();
    vi.mocked(dependencies.updateReference).mockRejectedValueOnce(new Error("database unavailable"));
    const dbFailure = await runMenuImageBackfill({ apply: true, supabaseUrl: STAGING_URL, dependencies });

    expect(dependencies.removeImages).toHaveBeenCalledWith(["products/latte/matcha-12345678.webp"]);
    expect(dbFailure.failed).toBe(1);

    const uploadFailureDependencies = createDependencies();
    vi.mocked(uploadFailureDependencies.uploadImage).mockRejectedValueOnce(new Error("upload failed"));
    const uploadFailure = await runMenuImageBackfill({
      apply: true, supabaseUrl: STAGING_URL, dependencies: uploadFailureDependencies,
    });

    expect(uploadFailureDependencies.removeImages).not.toHaveBeenCalled();
    expect(uploadFailure.failed).toBe(1);
  });
});
