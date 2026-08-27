import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/src/components/admin/CatalogImageFields", () => ({
  default: ({
    currentImageUrl,
    inputId,
    imageFilename,
    onFileChange,
    onFilenameChange,
  }: {
    currentImageUrl?: string | null;
    inputId?: string;
    imageFilename: string;
    onFileChange: (file: File | null) => void;
    onFilenameChange: (value: string) => void;
  }) => (
    <div data-testid={`image-field-${inputId}`} data-current-image={currentImageUrl ?? ""}>
      <button
        type="button"
        onClick={() => onFileChange(new File([inputId ?? "image"], `${inputId}.webp`, { type: "image/webp" }))}
      >
        Chọn {inputId}
      </button>
      <input
        aria-label={`Tên file ${inputId}`}
        value={imageFilename}
        onChange={(event) => onFilenameChange(event.target.value)}
      />
    </div>
  ),
}));

import AddonGroupForm from "@/src/components/admin/AddonGroupForm";
import { buildAddonGroupDefaultValues } from "@/src/components/admin/addonGroupFormModel";
import type { AdminAddonGroup } from "@/src/lib/types/addonGroup";

const group: AdminAddonGroup = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Kem",
  description: null,
  image_url: "https://cdn/group.webp",
  type: "SELECTOR",
  max_quantity: null,
  is_active: true,
  created_at: "2026-08-27T00:00:00.000Z",
  options: [
    {
      id: "22222222-2222-4222-8222-222222222222",
      addon_group_id: "11111111-1111-4111-8111-111111111111",
      label: "Kem sữa",
      image_url: "https://cdn/cream.webp",
      price_vnd: 10_000,
      is_active: true,
      sort_order: 0,
      gram_value: null,
    },
    {
      id: "33333333-3333-4333-8333-333333333333",
      addon_group_id: "11111111-1111-4111-8111-111111111111",
      label: "Kem matcha",
      image_url: "https://cdn/matcha.webp",
      price_vnd: 12_000,
      is_active: true,
      sort_order: 1,
      gram_value: null,
    },
  ],
};

describe("AddonGroupForm — upload ảnh riêng cho option", () => {
  it("hiển thị ảnh hiện tại và gửi file theo đúng image_key", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <AddonGroupForm
        mode="edit"
        defaultValues={buildAddonGroupDefaultValues(group)}
        onSubmit={onSubmit}
        isSubmitting={false}
      />,
    );

    const firstKey = group.options[0].id;
    const secondKey = group.options[1].id;
    expect(screen.getByTestId(`image-field-addon-option-image-${firstKey}`).getAttribute("data-current-image"))
      .toBe("https://cdn/cream.webp");
    expect(screen.getByTestId(`image-field-addon-option-image-${secondKey}`).getAttribute("data-current-image"))
      .toBe("https://cdn/matcha.webp");

    fireEvent.click(screen.getByRole("button", { name: `Chọn addon-option-image-${firstKey}` }));
    fireEvent.change(screen.getByRole("textbox", { name: `Tên file addon-option-image-${firstKey}` }), {
      target: { value: "kem-sua-moi" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Lưu thay đổi" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      payload: expect.objectContaining({
        options: expect.arrayContaining([
          expect.objectContaining({ image_key: firstKey, label: "Kem sữa" }),
          expect.objectContaining({ image_key: secondKey, label: "Kem matcha" }),
        ]),
      }),
      optionImages: expect.arrayContaining([
        expect.objectContaining({ imageKey: firstKey, imageFilename: "kem-sua-moi", imageFile: expect.any(File) }),
        expect.objectContaining({ imageKey: secondKey, imageFilename: "", imageFile: null }),
      ]),
    }));
  });
});
