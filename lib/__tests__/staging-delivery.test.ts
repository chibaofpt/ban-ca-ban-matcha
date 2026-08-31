// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import { buildDeliveryCase, runDeliveryJourney } from "../../scripts/staging-tests/journeys/delivery.mjs";

const catalog = {
  fingerprint: "catalog", items: [{ id: "latte", category: "latte", is_available: true, matcha_powder_id: "powder",
    sizes: [{ size: "SMALL", base_price_vnd: 10_000 }] }],
  powders: [{ id: "powder", price_per_gram: 2_000, powderSizeConfigs: [] }],
  liquids: [{ id: "milk", is_default: true, price_per_ml: 10 }], defaults: [{ size: "SMALL", powder_gram: 3, milk_ml: 100 }], addonGroups: [],
};
const voucher = { id: "v", qr_token: "00000000-0000-4000-8000-000000000001", voucher_type: "FREESHIP",
  covered_delivery_fee_vnd: 10_000, min_order_vnd: 0, status: "ACTIVE" };

describe("Staging delivery + FREESHIP", () => {
  it("tính phí từ distance snapshot độc lập và không tin client response", () => {
    const selected = buildDeliveryCase({ catalog, runId: "run_12345678", caseId: "delivery", address: { id: "a", distance_km: 3 }, voucher });
    expect(selected.payload).toMatchObject({ order_type: "DELIVERY", address_id: "a", client_shipping_fee_vnd: 18_000,
      freeship_voucher_id: voucher.qr_token });
    expect(selected.expected).toMatchObject({ shipping_fee_vnd: 18_000, freeship_discount_vnd: 10_000 });
  });

  it("plain rồi FREESHIP huỷ/dùng lại; không đổi thêm voucher lần hai", async () => {
    const calls: string[] = [];
    const state = { user: { id: "u", role: "CUSTOMER", points_balance: 100 }, sessions: [], vouchers: [voucher], ledger: [], grants: [] };
    const createOrder = vi.fn(async ({ pickupCase, voucher: used }) => { calls.push(`create:${used?.voucher_type ?? "plain"}`); return { orderId: calls.length, marker: pickupCase.marker }; });
    const cancelOrder = vi.fn(async ({ voucher: used }) => { calls.push(`cancel:${used?.voucher_type ?? "plain"}`); });
    const acquireVoucher = vi.fn(async () => ({ voucher, exchanged: false }));
    const result = await runDeliveryJourney({ runId: "run_12345678", runDir: "unused", origin: "https://test.invalid", catalog,
      customerState: { ...state, actor: { id: "u" }, addresses: [{ id: "a", distance_km: 3 }], orders: [] }, credential: { phone: "+849", password: "pw", role: "CUSTOMER" },
      plan: {}, journal: {}, runState: { addSession() {} }, pacer: { reserve: vi.fn() }, fetchImpl: vi.fn(),
      db: { actorState: vi.fn(async () => structuredClone(state)), catalog: vi.fn(async () => ({ fingerprint: "catalog" })) },
      actorLifecycle: { login: vi.fn(async () => ({ name: "customerB", api: {}, sessionId: "s" })), logout: vi.fn() },
      orderLifecycle: { create: createOrder, cancel: cancelOrder }, acquireVoucher,
    });
    expect(result.status).toBe("PASS");
    expect(calls).toEqual(["create:plain", "cancel:plain", "create:FREESHIP", "cancel:FREESHIP", "create:FREESHIP", "cancel:FREESHIP"]);
    expect(acquireVoucher).toHaveBeenCalledOnce();
  });
});
