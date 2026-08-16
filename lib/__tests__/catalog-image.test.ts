import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUploadMenuImage = vi.fn();
const mockCopyMenuImage = vi.fn();

vi.mock("@/lib/storage", () => ({
  buildMenuImagePath: ({ category, requestedName }: { category: string; requestedName?: string }) =>
    `products/${category}/${requestedName || "auto"}-12345678.webp`,
  contentTypeForMenuImagePath: () => "image/webp",
  copyMenuImage: (...args: unknown[]) => mockCopyMenuImage(...args),
  parseMenuImagePath: (url: string) => url.split("/menu-images/")[1] ?? null,
  uploadMenuImage: (...args: unknown[]) => mockUploadMenuImage(...args),
}));

import { prepareCatalogImage } from "@/lib/catalogImage";

describe("Ảnh addon và bột matcha", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUploadMenuImage.mockResolvedValue("https://cdn/menu-images/products/powders/meyumi-12345678.webp");
    mockCopyMenuImage.mockResolvedValue("https://cdn/menu-images/products/addons/kem-moi-12345678.webp");
  });

  it("upload ảnh mới vào đúng thư mục và trả đường dẫn rollback", async () => {
    const image = new File(["image"], "meyumi.png", { type: "image/png" });

    const result = await prepareCatalogImage({
      kind: "powders",
      entityName: "Meyumi",
      requestedName: "meyumi",
      imageFile: image,
      currentImageUrl: null,
    });

    expect(mockUploadMenuImage).toHaveBeenCalledWith(
      "products/powders/meyumi-12345678.webp",
      expect.any(Buffer),
      "image/png",
    );
    expect(result).toEqual({
      imageUrl: "https://cdn/menu-images/products/powders/meyumi-12345678.webp",
      newPath: "products/powders/meyumi-12345678.webp",
      oldPath: null,
    });
  });

  it("đổi tên ảnh hiện tại bằng copy và đánh dấu ảnh cũ để dọn sau commit", async () => {
    const result = await prepareCatalogImage({
      kind: "addons",
      entityName: "Kem",
      requestedName: "kem-moi",
      imageFile: null,
      currentImageUrl: "https://cdn/menu-images/products/addons/kem-cu.webp",
    });

    expect(mockCopyMenuImage).toHaveBeenCalledWith(
      "products/addons/kem-cu.webp",
      "products/addons/kem-moi-12345678.webp",
    );
    expect(result.oldPath).toBe("products/addons/kem-cu.webp");
  });

  it("từ chối file không phải JPEG, PNG hoặc WebP", async () => {
    const image = new File(["image"], "addon.gif", { type: "image/gif" });

    await expect(prepareCatalogImage({
      kind: "addons",
      entityName: "Kem",
      imageFile: image,
      currentImageUrl: null,
    })).rejects.toThrow("INVALID_IMAGE_CONTENT_TYPE");

    expect(mockUploadMenuImage).not.toHaveBeenCalled();
  });

  it("không cho đặt tên file khi chưa có ảnh", async () => {
    await expect(prepareCatalogImage({
      kind: "powders",
      entityName: "Hana",
      requestedName: "hana",
      imageFile: null,
      currentImageUrl: null,
    })).rejects.toThrow("NO_CURRENT_IMAGE");
  });
});
