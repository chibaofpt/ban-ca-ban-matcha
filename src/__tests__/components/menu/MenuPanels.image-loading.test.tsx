import { createElement, createRef } from "react";
import { render, screen } from "@testing-library/react";
import type { ImageProps } from "next/image";
import { describe, expect, it, vi } from "vitest";

import type { MenuItem } from "@/src/lib/types/menu";

vi.mock("next/image", () => ({
  default: ({ alt, loading, priority }: ImageProps) => createElement("img", {
    alt,
    loading,
    "data-priority": String(Boolean(priority)),
  }),
}));

vi.mock("@/src/lib/store/powderStore", () => ({
  usePowderStore: (selector: (state: { data: []; defaultPowderGram: object }) => unknown) =>
    selector({ data: [], defaultPowderGram: {} }),
}));

vi.mock("@/src/lib/store/cartStore", () => ({
  useCartStore: {
    getState: () => ({ items: [], updateQuantity: vi.fn(), removeItem: vi.fn() }),
  },
}));

import { MenuPanels } from "@/src/components/menu/MenuPanels";

function menuItem(id: string, category: MenuItem["category"]): MenuItem {
  return {
    id,
    name: id,
    description: null,
    category,
    is_seasonal: false,
    image_url: `https://mnklsbzkefuefpqvghrr.supabase.co/storage/v1/object/public/menu-images/${id}.webp`,
    sort_order: 0,
    base_liquid_note: null,
    custom_powder_grams: null,
    powder: null,
    resolved_default_powder_id: null,
    allowed_powder_ids: [],
    sizes: [],
  };
}

describe("MenuPanels — lazy-load ảnh menu", () => {
  it("chỉ tải sớm hai ảnh Latte đầu và lazy-load toàn bộ ảnh còn lại", () => {
    render(
      <MenuPanels
        loading={false}
        latteItems={[
          menuItem("latte-1", "latte"),
          menuItem("latte-2", "latte"),
          menuItem("latte-3", "latte"),
        ]}
        fusionItems={[menuItem("fusion-1", "fusion")]}
        extrasItems={[menuItem("extra-1", "extras")]}
        seasonalItems={[menuItem("seasonal-1", "latte")]}
        milkTypes={[]}
        cartItems={[]}
        latteSectionRef={createRef<HTMLDivElement>()}
        fusionSectionRef={createRef<HTMLDivElement>()}
        extrasSectionRef={createRef<HTMLDivElement>()}
        seasonalSectionRef={createRef<HTMLDivElement>()}
        onItemClick={vi.fn()}
      />,
    );

    expect(screen.getByRole("img", { name: "latte-1" }).getAttribute("loading")).toBe("eager");
    expect(screen.getByRole("img", { name: "latte-2" }).getAttribute("loading")).toBe("eager");
    for (const name of ["latte-3", "fusion-1", "extra-1", "seasonal-1"]) {
      expect(screen.getByRole("img", { name }).getAttribute("loading")).toBe("lazy");
      expect(screen.getByRole("img", { name }).getAttribute("data-priority")).toBe("false");
    }
  });
});
