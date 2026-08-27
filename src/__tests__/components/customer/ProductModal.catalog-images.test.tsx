import { createElement } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ImageProps } from "next/image";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/image", () => ({
  default: ({ alt, width, sizes, quality, loading }: ImageProps) => createElement("img", {
    alt,
    "data-width": String(width ?? ""),
    "data-sizes": sizes,
    "data-quality": String(quality ?? ""),
    loading,
  }),
}));

vi.mock("framer-motion", () => ({
  motion: {
    button: ({ children, whileTap, ...props }: React.ComponentProps<"button"> & { whileTap?: object }) => {
      void whileTap;
      return <button {...props}>{children}</button>;
    },
  },
}));

vi.mock("vaul", () => ({
  Drawer: {
    Root: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    Portal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    Overlay: (props: React.ComponentProps<"div">) => <div {...props} />,
    Content: ({ children, ...props }: React.ComponentProps<"div">) => <div {...props}>{children}</div>,
    Title: ({ children, ...props }: React.ComponentProps<"h2">) => <h2 {...props}>{children}</h2>,
    Description: ({ children, ...props }: React.ComponentProps<"p">) => <p {...props}>{children}</p>,
  },
}));

import OptionCard from "@/src/components/shared/product-modal/OptionCard";
import { resolveAddonOptionImage } from "@/src/components/shared/ProductModal";
import { PowderSelector } from "@/src/components/shared/product-modal/PowderSelector";
import type { Powder } from "@/src/lib/types/powder";

const powder: Powder = {
  id: "powder-1",
  name: "Hana",
  manufacturer: null,
  description: null,
  image_url: "https://mnklsbzkefuefpqvghrr.supabase.co/storage/v1/object/public/menu-images/products/powders/hana.webp",
  price_per_gram: 10_000,
  type: "NONE",
  fragrance: null,
  body: null,
  bitterness: null,
  umami: null,
  color: null,
  is_available: true,
  reference_latte_item_id: null,
  size_config: [],
};

describe("Product Modal — ảnh catalog theo ngữ cảnh", () => {
  it("ưu tiên ảnh option và fallback ảnh nhóm cho dữ liệu cũ", () => {
    expect(resolveAddonOptionImage("https://cdn/option.webp", "https://cdn/group.webp"))
      .toBe("https://cdn/option.webp");
    expect(resolveAddonOptionImage(null, "https://cdn/group.webp"))
      .toBe("https://cdn/group.webp");
    expect(resolveAddonOptionImage(null, null)).toBeNull();
  });

  it("ảnh sữa/addon dùng thumbnail nhỏ và lazy-load", () => {
    render(
      <OptionCard
        label="Sữa yến mạch"
        imageUrl="https://mnklsbzkefuefpqvghrr.supabase.co/storage/v1/object/public/menu-images/products/milk-types/oat.webp"
        imageAlt="Ảnh sữa yến mạch"
        isActive={false}
        onClick={vi.fn()}
        layout="stacked"
      />,
    );

    const image = screen.getByRole("img", { name: "Ảnh sữa yến mạch" });
    expect(image.getAttribute("data-width")).toBe("32");
    expect(image.getAttribute("data-sizes")).toBe("32px");
    expect(image.getAttribute("data-quality")).toBe("60");
    expect(image.getAttribute("loading")).toBe("lazy");
  });

  it("powder chỉ tải ảnh lớn sau khi người dùng mở chi tiết", () => {
    render(
      <PowderSelector
        powderList={[powder.id]}
        powders={[powder]}
        selectedPowderId={powder.id}
        defaultPowderId={powder.id}
        onChange={vi.fn()}
        getPriceForContext={() => ({ unitPrice: 50_000 })}
        defaultPowderPriceCtx={{ unitPrice: 50_000 }}
        selectedSize="MEDIUM"
      />,
    );

    let images = screen.getAllByRole("img", { name: "Ảnh bột Hana" });
    expect(images).toHaveLength(1);
    expect(images[0]?.getAttribute("data-width")).toBe("48");
    expect(images[0]?.getAttribute("data-quality")).toBe("60");
    expect(images[0]?.getAttribute("loading")).toBe("lazy");

    fireEvent.click(screen.getByRole("button", { name: "Xem thông tin Hana" }));

    images = screen.getAllByRole("img", { name: "Ảnh bột Hana" });
    expect(images).toHaveLength(2);
    expect(images[1]?.getAttribute("data-width")).toBe("300");
    expect(images[1]?.getAttribute("data-sizes")).toBe("(max-width: 339px) calc(100vw - 40px), 300px");
    expect(images[1]?.getAttribute("data-quality")).toBe("75");
    expect(images[1]?.getAttribute("loading")).toBe("eager");
  });
});
