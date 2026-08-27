import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPost = vi.fn();
const mockPut = vi.fn();

vi.mock("@/src/lib/api/client", () => ({
  apiClient: {
    post: (...args: unknown[]) => mockPost(...args),
    put: (...args: unknown[]) => mockPut(...args),
  },
}));

import { createPowder } from "@/src/services/adminPowderService";
import { updateAddonGroup } from "@/src/services/adminAddonService";

describe("Service upload ảnh catalog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPost.mockResolvedValue({ data: { data: { id: "powder-1" } } });
    mockPut.mockResolvedValue({ data: { data: { id: "addon-1" } } });
  });

  it("gửi powder bằng multipart cùng ảnh và tên file SEO", async () => {
    const image = new File(["image"], "powder.webp", { type: "image/webp" });
    const payload = {
      name: "Meyumi",
      manufacturer: "Uji",
      price_per_gram: 6000,
      type: "NONE" as const,
      is_available: true,
    };

    await createPowder(payload, image, "meyumi-uji");

    const [, body] = mockPost.mock.calls[0] as [string, FormData];
    expect(mockPost.mock.calls[0][0]).toBe("/api/admin/powders");
    expect(body).toBeInstanceOf(FormData);
    expect(JSON.parse(String(body.get("payload")))).toEqual(payload);
    expect(body.get("image")).toBe(image);
    expect(body.get("image_filename")).toBe("meyumi-uji");
  });

  it("gửi addon update bằng multipart nhưng vẫn giữ payload JSON cũ", async () => {
    const image = new File(["image"], "addon.png", { type: "image/png" });
    const payload = {
      name: "Kem",
      type: "TOGGLE" as const,
      is_active: true,
      options: [{ label: "Kem", price_vnd: 10000, is_active: true, sort_order: 0 }],
    };

    await updateAddonGroup("addon-1", payload, image, "kem-matcha");

    const [, body] = mockPut.mock.calls[0] as [string, FormData];
    expect(mockPut.mock.calls[0][0]).toBe("/api/admin/addon-groups/addon-1");
    expect(JSON.parse(String(body.get("payload")))).toEqual(payload);
    expect(body.get("image")).toBe(image);
  });

  it("gửi đúng ảnh riêng của từng addon option theo image_key", async () => {
    const creamImage = new File(["cream"], "cream.webp", { type: "image/webp" });
    const matchaImage = new File(["matcha"], "matcha.webp", { type: "image/webp" });
    const payload = {
      name: "Topping",
      type: "SELECTOR" as const,
      is_active: true,
      options: [
        { image_key: "cream", label: "Kem", price_vnd: 10000, is_active: true, sort_order: 0 },
        { image_key: "matcha-2g", label: "+2g", price_vnd: 0, gram_value: 2, is_active: true, sort_order: 1 },
      ],
    };

    await updateAddonGroup("addon-1", payload, null, "", [
      { imageKey: "cream", imageFile: creamImage, imageFilename: "kem-sua" },
      { imageKey: "matcha-2g", imageFile: matchaImage, imageFilename: "" },
    ]);

    const [, body] = mockPut.mock.calls[0] as [string, FormData];
    expect(body.get("option_image_cream")).toBe(creamImage);
    expect(body.get("option_image_filename_cream")).toBe("kem-sua");
    expect(body.get("option_image_matcha-2g")).toBe(matchaImage);
  });
});
