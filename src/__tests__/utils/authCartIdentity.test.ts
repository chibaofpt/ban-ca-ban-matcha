import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/src/lib/api/client", () => ({ resetForceLogout: vi.fn() }));
const stored = new Map<string, string>();
beforeEach(() => {
  vi.resetModules();
  stored.clear();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => { stored.set(key, value); },
    removeItem: (key: string) => { stored.delete(key); },
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("Định danh public QR của phiên khách hàng", () => {
  it("xóa UI auth phone-only v0 mà không khôi phục user chưa biết QR", async () => {
    stored.set("bcbm-auth", JSON.stringify({ state: { user: { phone: null, name: "Old Google" } }, version: 0 }));
    const { useAuthStore } = await import("@/src/lib/store/authStore");
    await useAuthStore.persist.rehydrate();
    expect(useAuthStore.getState().user).toBeNull();
    expect(JSON.parse(stored.get("bcbm-auth") ?? "{}")).toMatchObject({ version: 1, state: { user: null } });
  });
  it("cùng QR giữ bundle khi phone đổi; Google A sang B không phone và logout tháo reward", async () => {
    const { useAuthStore } = await import("@/src/lib/store/authStore");
    const { useCartStore } = await import("@/src/lib/store/cartStore");
    useAuthStore.getState().login(null, "Google A", "google-a-qr");
    const items = ["paid", "reward"].map((cartId) => ({ cartId, menuItemId: "drink", quantity: 1, configuration: { size: "MEDIUM" as const, sweetness: "FULL" as const, iceOption: "NORMAL" as const, coldwhisk: false, note: "", addonOptionIds: [] }, addonVouchers: [] }));
    const bundle = { voucher_qr_token: "bundle", owner_key: "customer:google-a-qr", qualifier_allocations: [{ client_line_id: "paid", quantity: 1 }], reward_allocations: [{ client_line_id: "reward", quantity: 1 }], created_reward_effects: [{ kind: "LINE" as const, client_line_id: "reward" }] };
    useCartStore.setState({ items, bundleApplications: [bundle], selectedOrderVoucherTokens: ["discount"] });
    useAuthStore.getState().login("+84912345678", "Google A", "google-a-qr");
    expect(useCartStore.getState().bundleApplications).toEqual([bundle]);
    useAuthStore.getState().login(null, "Google A", "google-a-qr");
    useAuthStore.getState().login(null, "Google B", "google-b-qr");
    expect(useCartStore.getState()).toMatchObject({ voucherOwnerKey: "google-b-qr", items: [items[0]], bundleApplications: [], selectedOrderVoucherTokens: [] });
    useCartStore.setState({ items, bundleApplications: [{ ...bundle, owner_key: "customer:google-b-qr" }] });
    useAuthStore.getState().logout();
    expect(useAuthStore.getState().user).toBeNull();
    expect(useCartStore.getState()).toMatchObject({ voucherOwnerKey: null, items: [items[0]], bundleApplications: [] });
  });
  it("giữ QR cho Google không phone qua reload", async () => {
    const { useAuthStore } = await import("@/src/lib/store/authStore");
    useAuthStore.getState().login(null, "Google A", "google-a-qr");
    expect(useAuthStore.getState().user).toEqual({ phone: null, name: "Google A", qr_token: "google-a-qr" });
    const persisted = stored.get("bcbm-auth");
    expect(persisted).toBeDefined();
    useAuthStore.setState({ user: null });
    stored.set("bcbm-auth", persisted!);
    await useAuthStore.persist.rehydrate();
    expect(useAuthStore.getState().user?.qr_token).toBe("google-a-qr");
  });
});
