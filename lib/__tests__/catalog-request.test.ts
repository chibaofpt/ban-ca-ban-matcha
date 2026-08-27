import { describe, expect, it } from "vitest";
import { parseCatalogRequest } from "@/lib/catalogRequest";

describe("Parser multipart cho addon và bột", () => {
  it("giữ tương thích với request JSON cũ", async () => {
    const request = new Request("http://localhost/api/admin/powders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Meyumi" }),
    });

    const result = await parseCatalogRequest(request);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.raw).toEqual({ name: "Meyumi" });
      expect(result.imageFile).toBeNull();
    }
  });

  it("đọc payload, image và image_filename từ multipart", async () => {
    const formData = new FormData();
    const image = new File(["image"], "kem.webp", { type: "image/webp" });
    formData.set("payload", JSON.stringify({ name: "Kem" }));
    formData.set("image", image);
    formData.set("image_filename", "kem-matcha");
    const request = new Request("http://localhost/api/admin/addon-groups", {
      method: "POST",
      body: formData,
    });

    const result = await parseCatalogRequest(request);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.raw).toEqual({ name: "Kem", image_filename: "kem-matcha" });
      expect(result.imageFile?.name).toBe("kem.webp");
    }
  });

  it("ghép nhiều ảnh option theo image_key trong cùng multipart", async () => {
    const formData = new FormData();
    const creamImage = new File(["cream"], "kem-sua.webp", { type: "image/webp" });
    const matchaImage = new File(["matcha"], "extra-2g.webp", { type: "image/webp" });
    formData.set("payload", JSON.stringify({
      name: "Topping",
      options: [
        { image_key: "cream", label: "Kem sữa" },
        { image_key: "matcha-2g", label: "+2g" },
      ],
    }));
    formData.set("option_image_cream", creamImage);
    formData.set("option_image_filename_cream", "kem-sua");
    formData.set("option_image_matcha-2g", matchaImage);
    const request = new Request("http://localhost/api/admin/addon-groups", {
      method: "POST",
      body: formData,
    });

    const result = await parseCatalogRequest(request);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.optionImages).toHaveLength(2);
      expect(result.optionImages).toEqual(expect.arrayContaining([
        expect.objectContaining({
          imageKey: "cream",
          requestedName: "kem-sua",
          imageFile: expect.objectContaining({ name: "kem-sua.webp" }),
        }),
        expect.objectContaining({
          imageKey: "matcha-2g",
          imageFile: expect.objectContaining({ name: "extra-2g.webp" }),
        }),
      ]));
    }
  });

  it("trả validation error khi payload multipart không phải JSON", async () => {
    const formData = new FormData();
    formData.set("payload", "{");
    const request = new Request("http://localhost/api/admin/powders", {
      method: "POST",
      body: formData,
    });

    const result = await parseCatalogRequest(request);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(400);
  });
});
