import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockGetSession = vi.fn();
const mockUserFindUnique = vi.fn();
const mockVoucherFindUnique = vi.fn();
const mockMenuItemFindMany = vi.fn();
const mockPowderFindMany = vi.fn();
const mockMilkTypeFindMany = vi.fn();
const mockAddonFindMany = vi.fn();

vi.mock("@/lib/auth", () => ({ getSession: () => mockGetSession() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...args: unknown[]) => mockUserFindUnique(...args) },
    voucher: { findUnique: (...args: unknown[]) => mockVoucherFindUnique(...args) },
    menuItem: { findMany: (...args: unknown[]) => mockMenuItemFindMany(...args) },
    matchaPowder: { findMany: (...args: unknown[]) => mockPowderFindMany(...args) },
    milkType: { findMany: (...args: unknown[]) => mockMilkTypeFindMany(...args) },
    addonOption: { findMany: (...args: unknown[]) => mockAddonFindMany(...args) },
  },
}));

import { GET } from "@/app/api/staff/scan/route";

const item = (id: string, name: string) => ({
  id,
  name,
  category: "latte",
  is_available: true,
  is_seasonal: false,
  unit_price_vnd: null,
  matcha_powder_id: "powder",
  default_powder_id: null,
  default_base_liquid_id: null,
  allowedBaseLiquids: [],
  sizes: [{ size: "SMALL", base_price_vnd: 40_000 }],
});

describe("GET /api/staff/scan multi-choice PRODUCT", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({ id: "staff", role: "STAFF" });
    mockUserFindUnique.mockResolvedValue(null);
    mockMenuItemFindMany.mockResolvedValue([item("drink-a", "A"), item("drink-b", "B")]);
    mockPowderFindMany.mockResolvedValue([{ id: "powder", name: "Hana", price_per_gram: 300, is_available: true }]);
    mockMilkTypeFindMany.mockResolvedValue([{ id: "milk", is_active: true, is_default: true, display_order: 1 }]);
    mockAddonFindMany.mockResolvedValue([]);
  });

  it("returns every usable target with its independent config and credit", async () => {
    mockVoucherFindUnique.mockResolvedValue({
      id: "internal-voucher",
      qr_token: "public-token",
      voucher_type: "PRODUCT",
      discount_type: null,
      discount_value: null,
      product_discount_mode: null,
      menu_item_id: "drink-a",
      eligible_sizes: [],
      reference_size: null,
      size: "SMALL",
      matcha_powder_id: null,
      milk_type_id: "milk",
      addon_option_id: null,
      covered_price_vnd: 40_000,
      status: "ACTIVE",
      expires_at: null,
      menuItemScopes: [
        { menu_item_id: "drink-a", size: "SMALL", matcha_powder_id: null, milk_type_id: "milk", covered_price_vnd: 40_000, menuItem: { name: "A", category: "latte", is_available: true, is_seasonal: false } },
        { menu_item_id: "drink-b", size: "SMALL", matcha_powder_id: null, milk_type_id: "milk", covered_price_vnd: 45_000, menuItem: { name: "B", category: "latte", is_available: true, is_seasonal: false } },
      ],
    });

    const response = await GET(new NextRequest("http://localhost/api/staff/scan?token=public-token"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.data.eligible_menu_items).toEqual([
      expect.objectContaining({ menu_item_id: "drink-a", size: "SMALL", milk_type_id: "milk", covered_price_vnd: 40_000 }),
      expect.objectContaining({ menu_item_id: "drink-b", size: "SMALL", milk_type_id: "milk", covered_price_vnd: 45_000 }),
    ]);
    expect(mockVoucherFindUnique).toHaveBeenCalledWith(expect.objectContaining({
      include: expect.objectContaining({ menuItemScopes: expect.any(Object) }),
    }));
  });
});
