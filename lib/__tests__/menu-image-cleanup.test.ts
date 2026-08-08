import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockMenuItemFindMany = vi.fn();
const mockListMenuImages = vi.fn();
const mockRemoveMenuImages = vi.fn();
const mockCaptureServerException = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    menuItem: { findMany: (...args: unknown[]) => mockMenuItemFindMany(...args) },
  },
}));

vi.mock("@/lib/storage", () => ({
  listMenuImages: (...args: unknown[]) => mockListMenuImages(...args),
  parseMenuImagePath: (url: string) => {
    const marker = "/storage/v1/object/public/menu-images/";
    return url.includes(marker) ? url.split(marker)[1] : null;
  },
  removeMenuImages: (...args: unknown[]) => mockRemoveMenuImages(...args),
}));

vi.mock("@/lib/observability", () => ({
  captureServerException: (...args: unknown[]) => mockCaptureServerException(...args),
}));

import { runMenuImageCleanup } from "@/lib/menuImageCleanup";
import { GET } from "@/app/api/cron/cleanup-menu-images/route";

const baseUrl = "https://project.supabase.co/storage/v1/object/public/menu-images/";
const now = new Date("2026-08-03T00:00:00.000Z");

describe("Cron dọn orphan image", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CRON_SECRET", "cron-secret");
    vi.stubEnv("IMAGE_CLEANUP_DRY_RUN", "true");
    mockMenuItemFindMany.mockResolvedValue([]);
    mockListMenuImages.mockResolvedValue([]);
    mockRemoveMenuImages.mockResolvedValue(undefined);
  });

  it("giữ ảnh của cả sản phẩm active và soft-delete", async () => {
    mockMenuItemFindMany.mockResolvedValue([
      { image_url: `${baseUrl}active.webp` },
      { image_url: `${baseUrl}soft-deleted.webp` },
    ]);
    mockListMenuImages.mockResolvedValue([
      { path: "active.webp", createdAt: "2026-07-01T00:00:00.000Z" },
      { path: "soft-deleted.webp", createdAt: "2026-07-01T00:00:00.000Z" },
      { path: "orphan.webp", createdAt: "2026-07-01T00:00:00.000Z" },
    ]);

    const result = await runMenuImageCleanup({ now, dryRun: false });

    expect(mockMenuItemFindMany).toHaveBeenCalledWith({
      where: { image_url: { not: null } },
      select: { image_url: true },
    });
    expect(mockRemoveMenuImages).toHaveBeenCalledWith(["orphan.webp"]);
    expect(result.deleted).toBe(1);
  });

  it("không xóa orphan mới hơn 48 giờ", async () => {
    mockListMenuImages.mockResolvedValue([
      { path: "recent.webp", createdAt: "2026-08-02T12:00:00.000Z" },
    ]);

    const result = await runMenuImageCleanup({ now, dryRun: false });

    expect(mockRemoveMenuImages).not.toHaveBeenCalled();
    expect(result.skipped_recent).toBe(1);
  });

  it("dry-run chỉ báo cáo candidate mà không xóa", async () => {
    mockListMenuImages.mockResolvedValue([
      { path: "old-orphan.webp", createdAt: "2026-07-01T00:00:00.000Z" },
    ]);

    const result = await runMenuImageCleanup({ now, dryRun: true });

    expect(mockRemoveMenuImages).not.toHaveBeenCalled();
    expect(result).toMatchObject({ dry_run: true, eligible: 1, deleted: 0 });
  });

  it("bỏ qua object thiếu timestamp thay vì đoán và xóa", async () => {
    mockListMenuImages.mockResolvedValue([{ path: "unknown.webp", createdAt: null }]);

    const result = await runMenuImageCleanup({ now, dryRun: false });

    expect(mockRemoveMenuImages).not.toHaveBeenCalled();
    expect(result.skipped_unknown_age).toBe(1);
  });

  it("route từ chối request sai CRON_SECRET", async () => {
    const response = await GET(new NextRequest("http://localhost/api/cron/cleanup-menu-images"));

    expect(response.status).toBe(401);
    expect((await response.json()).code).toBe("UNAUTHORIZED");
  });

  it("route đọc dry-run từ environment", async () => {
    const response = await GET(new NextRequest("http://localhost/api/cron/cleanup-menu-images", {
      headers: { authorization: "Bearer cron-secret" },
    }));

    expect(response.status).toBe(200);
    expect((await response.json()).data.dry_run).toBe(true);
  });
});
