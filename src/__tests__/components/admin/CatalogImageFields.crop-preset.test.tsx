import { createElement } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/src/components/admin/MenuImageCropField", () => ({
  default: ({ outputSize, outputQuality }: { outputSize?: number; outputQuality?: number }) => createElement("div", {
    "data-testid": "crop-field",
    "data-output-size": String(outputSize ?? ""),
    "data-output-quality": String(outputQuality ?? ""),
  }),
}));

vi.mock("@/src/components/admin/MenuImageSeoField", () => ({
  default: () => null,
}));

import CatalogImageFields from "@/src/components/admin/CatalogImageFields";

describe("CatalogImageFields — preset crop ảnh", () => {
  it("dùng output 320px quality 0.7 cho ảnh compact", () => {
    const props = {
      currentImageUrl: null,
      label: "Ảnh loại sữa",
      imageFilename: "",
      disabled: false,
      onFileChange: vi.fn(),
      onFilenameChange: vi.fn(),
      onError: vi.fn(),
      cropPreset: "compact" as const,
    };

    render(createElement(CatalogImageFields, props));

    const cropField = screen.getByTestId("crop-field");
    expect(cropField.getAttribute("data-output-size")).toBe("320");
    expect(cropField.getAttribute("data-output-quality")).toBe("0.7");
  });
});
