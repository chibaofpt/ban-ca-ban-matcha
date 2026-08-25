import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUserFindUnique = vi.fn();
const mockVoucherFindUnique = vi.fn();
const mockRecordFallback = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...args: unknown[]) => mockUserFindUnique(...args) },
    voucher: { findUnique: (...args: unknown[]) => mockVoucherFindUnique(...args) },
  },
}));

vi.mock("@/lib/observability", () => ({
  recordLegacyIdentifierFallback: (...args: unknown[]) => mockRecordFallback(...args),
}));

import {
  resolveCustomerIdentifier,
  resolveOwnedVoucherIdentifier,
  resolveStaffVoucherIdentifier,
} from "@/lib/publicIdentifiers";

const PUBLIC_TOKEN = "public-token";
const LEGACY_ID = "550e8400-e29b-41d4-a716-446655440011";
const OWNER_ID = "550e8400-e29b-41d4-a716-446655440022";

describe("Public identifier resolver", () => {
  beforeEach(() => vi.clearAllMocks());

  it("không diễn giải lại qr_token của voucher khác thành legacy UUID", async () => {
    mockVoucherFindUnique.mockResolvedValueOnce({
      id: LEGACY_ID,
      qr_token: PUBLIC_TOKEN,
      user_id: "different-owner",
    });

    const voucher = await resolveOwnedVoucherIdentifier(PUBLIC_TOKEN, OWNER_ID);

    expect(voucher).toBeNull();
    expect(mockVoucherFindUnique).toHaveBeenCalledTimes(1);
    expect(mockRecordFallback).not.toHaveBeenCalled();
  });

  it("không diễn giải lại qr_token ngoài CUSTOMER scope thành legacy UUID", async () => {
    mockUserFindUnique.mockResolvedValueOnce({
      id: LEGACY_ID,
      qr_token: PUBLIC_TOKEN,
      role: "STAFF",
    });

    const user = await resolveCustomerIdentifier(PUBLIC_TOKEN);

    expect(user).toBeNull();
    expect(mockUserFindUnique).toHaveBeenCalledTimes(1);
    expect(mockRecordFallback).not.toHaveBeenCalled();
  });

  it("ưu tiên qr_token và không phát telemetry fallback", async () => {
    mockVoucherFindUnique.mockResolvedValueOnce({ id: LEGACY_ID, qr_token: PUBLIC_TOKEN, user_id: OWNER_ID });

    const voucher = await resolveOwnedVoucherIdentifier(PUBLIC_TOKEN, OWNER_ID);

    expect(voucher?.qr_token).toBe(PUBLIC_TOKEN);
    expect(mockVoucherFindUnique).toHaveBeenCalledTimes(1);
    expect(mockVoucherFindUnique).toHaveBeenCalledWith({
      where: { qr_token: PUBLIC_TOKEN },
      include: { menuItemScopes: { select: { menu_item_id: true } } },
    });
    expect(mockRecordFallback).not.toHaveBeenCalled();
  });

  it("chỉ fallback voucher UUID trong đúng ownership scope", async () => {
    mockVoucherFindUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: LEGACY_ID, qr_token: PUBLIC_TOKEN, user_id: OWNER_ID });

    const voucher = await resolveOwnedVoucherIdentifier(LEGACY_ID, OWNER_ID);

    expect(voucher?.id).toBe(LEGACY_ID);
    expect(mockVoucherFindUnique).toHaveBeenNthCalledWith(2, {
      where: { id: LEGACY_ID },
      include: { menuItemScopes: { select: { menu_item_id: true } } },
    });
    expect(mockRecordFallback).toHaveBeenCalledWith("voucher", "owner");
    expect(JSON.stringify(mockRecordFallback.mock.calls)).not.toContain(LEGACY_ID);
  });

  it("fallback user UUID chỉ được phép cho CUSTOMER", async () => {
    mockUserFindUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: LEGACY_ID, qr_token: PUBLIC_TOKEN, role: "CUSTOMER" });

    await resolveCustomerIdentifier(LEGACY_ID);

    expect(mockUserFindUnique).toHaveBeenNthCalledWith(2, {
      where: { id: LEGACY_ID },
      select: { id: true, qr_token: true, role: true },
    });
    expect(mockRecordFallback).toHaveBeenCalledWith("user", "customer");
  });

  it("staff voucher resolver dùng global staff scope nhưng vẫn thử token trước", async () => {
    mockVoucherFindUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

    await resolveStaffVoucherIdentifier(LEGACY_ID);

    expect(mockVoucherFindUnique).toHaveBeenNthCalledWith(1, {
      where: { qr_token: LEGACY_ID },
    });
    expect(mockVoucherFindUnique).toHaveBeenNthCalledWith(2, {
      where: { id: LEGACY_ID },
    });
    expect(mockRecordFallback).not.toHaveBeenCalled();
  });
});
