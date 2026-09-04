import { describe, expect, it, vi } from "vitest";
// JavaScript CLI is imported as the real repair entry point.
import { repairCounterBundles } from "../../scripts/repair-counter-bundles.mjs";

describe("Repair BUNDLE counter transfer", () => {
  it("apply không có danh sách ID chính xác bị từ chối trước mọi truy vấn", async () => {
    const db = { order: { findMany: vi.fn() }, $transaction: vi.fn() };
    await expect(repairCounterBundles(db, { apply: true })).rejects.toThrow("APPLY_REQUIRES_EXACT_ORDER_IDS_MAX_1000");
    expect(db.order.findMany).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });
  it("mặc định dry-run báo candidate thiếu payment audit và không ghi", async () => {
    const db = { order: { findMany: vi.fn().mockResolvedValueOnce([{ id: "order-1", payment_confirmed_at: null,
      payment_confirmed_by: null, user_id: "owner", order_type: "COUNTER", payment_method: "BANK_TRANSFER", status: "COMPLETED",
      bundleApplications: [{ id: "app-1", status: "RESERVED", voucher: { user_id: "owner", voucher_type: "BUNDLE", status: "RESERVED" } }],
    }]) }, $transaction: vi.fn() };
    const result = await repairCounterBundles(db);
    expect(result).toEqual({ mode: "dry-run", results: [{ orderId: "order-1", reason: "MISSING_PAYMENT_AUDIT" }] });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("apply cập nhật application và voucher hợp lệ rồi trả APPLIED", async () => {
    const order = {
      id: "550e8400-e29b-41d4-a716-446655440001", payment_confirmed_at: new Date("2026-09-01T10:00:00Z"), payment_confirmed_by: "staff-1",
      user_id: "owner", order_type: "COUNTER", payment_method: "BANK_TRANSFER", status: "COMPLETED",
      bundleApplications: [{ id: "app-1", order_id: "550e8400-e29b-41d4-a716-446655440001", voucher_id: "voucher-1", status: "RESERVED", voucher: { user_id: "owner", voucher_type: "BUNDLE", status: "RESERVED", redeemed_at: null, redeemed_by: null, used_channel: null } }],
    };
    const applicationUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const voucherUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const db = {
      order: { findMany: vi.fn().mockResolvedValue([order]) },
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback({
        order: { findUnique: vi.fn().mockResolvedValue(order) }, orderBundleApplication: { updateMany: applicationUpdateMany }, voucher: { updateMany: voucherUpdateMany },
      })),
    };

    await expect(repairCounterBundles(db, { apply: true, orderIds: [order.id] })).resolves.toEqual({ mode: "apply", results: [{ orderId: order.id, reason: "APPLIED" }] });
    expect(applicationUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { status: "REDEEMED" } }));
    expect(voucherUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      status: "REDEEMED", used_channel: "OFFLINE", redeemed_at: order.payment_confirmed_at, redeemed_by: order.payment_confirmed_by,
    }) }));
  });

  it("apply trả ALREADY_SETTLED khi đọc lại thấy reservation đã được xử lý", async () => {
    const orderId = "550e8400-e29b-41d4-a716-446655440002";
    const candidate = {
      id: orderId, payment_confirmed_at: new Date(), payment_confirmed_by: "staff-1", user_id: "owner", order_type: "COUNTER", payment_method: "BANK_TRANSFER", status: "COMPLETED",
      bundleApplications: [{ id: "app-1", voucher_id: "voucher-1", status: "RESERVED", voucher: { user_id: "owner", voucher_type: "BUNDLE", status: "RESERVED", redeemed_at: null, redeemed_by: null, used_channel: null } }],
    };
    const current = { ...candidate, bundleApplications: [{ ...candidate.bundleApplications[0], status: "REDEEMED" }] };
    const db = { order: { findMany: vi.fn().mockResolvedValue([candidate]) }, $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback({ order: { findUnique: vi.fn().mockResolvedValue(current) } })) };

    await expect(repairCounterBundles(db, { apply: true, orderIds: [orderId] })).resolves.toEqual({ mode: "apply", results: [{ orderId, reason: "ALREADY_SETTLED" }] });
  });

  it("lỗi conditional update hoặc transaction trả TRANSACTION_ABORTED", async () => {
    const orderId = "550e8400-e29b-41d4-a716-446655440003";
    const order = {
      id: orderId, payment_confirmed_at: new Date(), payment_confirmed_by: "staff-1", user_id: "owner", order_type: "COUNTER", payment_method: "BANK_TRANSFER", status: "COMPLETED",
      bundleApplications: [{ id: "app-1", order_id: orderId, voucher_id: "voucher-1", status: "RESERVED", voucher: { user_id: "owner", voucher_type: "BUNDLE", status: "RESERVED", redeemed_at: null, redeemed_by: null, used_channel: null } }],
    };
    const db = { order: { findMany: vi.fn().mockResolvedValue([order]) }, $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback({ order: { findUnique: vi.fn().mockResolvedValue(order) }, orderBundleApplication: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) }, voucher: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) } })) };

    await expect(repairCounterBundles(db, { apply: true, orderIds: [orderId] })).resolves.toEqual({ mode: "apply", results: [{ orderId, reason: "TRANSACTION_ABORTED" }] });
  });

  it("transaction ném lỗi cũng được báo TRANSACTION_ABORTED", async () => {
    const orderId = "550e8400-e29b-41d4-a716-446655440004";
    const order = {
      id: orderId, payment_confirmed_at: new Date(), payment_confirmed_by: "staff-1", user_id: "owner", order_type: "COUNTER", payment_method: "BANK_TRANSFER", status: "COMPLETED",
      bundleApplications: [{ id: "app-1", voucher_id: "voucher-1", status: "RESERVED", voucher: { user_id: "owner", voucher_type: "BUNDLE", status: "RESERVED", redeemed_at: null, redeemed_by: null, used_channel: null } }],
    };
    const db = { order: { findMany: vi.fn().mockResolvedValue([order]) }, $transaction: vi.fn().mockRejectedValue(new Error("database unavailable")) };

    await expect(repairCounterBundles(db, { apply: true, orderIds: [orderId] })).resolves.toEqual({ mode: "apply", results: [{ orderId, reason: "TRANSACTION_ABORTED" }] });
  });
});
