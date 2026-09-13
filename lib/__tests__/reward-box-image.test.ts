import { describe, expect, it, vi } from "vitest";
import { prepareRewardBoxImages, RewardBoxImageError } from "@/lib/rewardBoxImage";

function image(name: string, size = 10, type = "image/png") {
  return new File([new Uint8Array(size)], name, { type });
}

describe("Điều phối ảnh reward box", () => {
  it("xóa ảnh đầu khi upload ảnh thứ hai thất bại", async () => {
    const upload = vi.fn()
      .mockResolvedValueOnce("https://storage/closed.webp")
      .mockRejectedValueOnce(new Error("upload failed"));
    const remove = vi.fn().mockResolvedValue(undefined);

    await expect(prepareRewardBoxImages({
      name: "Hộp sen", closedImage: image("closed.png"), openImage: image("open.png"),
    }, { uploadMenuImage: upload, removeMenuImages: remove })).rejects.toThrow("upload failed");

    expect(remove).toHaveBeenCalledWith([expect.stringMatching(/^products\/reward-boxes\/.*-closed-[a-z0-9]{8}\.webp$/)]);
  });

  it("từ chối từng ảnh quá 2MB và tổng binary quá 4MB", async () => {
    const adapter = { uploadMenuImage: vi.fn(), removeMenuImages: vi.fn() };
    await expect(prepareRewardBoxImages({
      name: "Hộp", closedImage: image("a.png", 2 * 1024 * 1024 + 1), openImage: image("b.png"),
    }, adapter)).rejects.toSatisfy((error: unknown) =>
      error instanceof RewardBoxImageError && error.reason === "IMAGE_TOO_LARGE");
    await expect(prepareRewardBoxImages({
      name: "Hộp", closedImage: image("a.png", 2 * 1024 * 1024), openImage: image("b.png", 2 * 1024 * 1024),
    }, adapter)).resolves.toBeDefined();
  });

  it("từ chối MIME ngoài JPEG PNG WebP trước upload", async () => {
    const adapter = { uploadMenuImage: vi.fn(), removeMenuImages: vi.fn() };
    await expect(prepareRewardBoxImages({
      name: "Hộp", closedImage: image("a.gif", 10, "image/gif"), openImage: image("b.png"),
    }, adapter)).rejects.toSatisfy((error: unknown) =>
      error instanceof RewardBoxImageError && error.reason === "INVALID_IMAGE_CONTENT_TYPE");
    expect(adapter.uploadMenuImage).not.toHaveBeenCalled();
  });
});
