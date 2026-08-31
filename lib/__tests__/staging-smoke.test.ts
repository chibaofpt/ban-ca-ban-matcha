// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import { buildPickupCase } from "../../scripts/staging-tests/journeys/common.mjs";
import { runSmokeJourney } from "../../scripts/staging-tests/journeys/smoke.mjs";
import { acquireSmokeDiscount } from "../../scripts/staging-tests/journeys/voucher.mjs";
import { CookieJar } from "../../scripts/staging-tests/http.mjs";

const catalog = {
  items: [
    { id: "latte-cheap", category: "latte", is_available: true, matcha_powder_id: "powder-a", custom_powder_grams: null,
      sizes: [{ size: "SMALL", base_price_vnd: 8_000, base_liquid_ml: 100 }] },
    { id: "latte-pricey", category: "latte", is_available: true, matcha_powder_id: "powder-b", custom_powder_grams: null,
      sizes: [{ size: "MEDIUM", base_price_vnd: 20_000, base_liquid_ml: 100 }] },
  ],
  powders: [
    { id: "powder-a", price_per_gram: 2_000, powderSizeConfigs: [] },
    { id: "powder-b", price_per_gram: 3_000, powderSizeConfigs: [] },
  ],
  liquids: [{ id: "milk", is_default: true, price_per_ml: 10 }],
  defaults: [
    { size: "SMALL", powder_gram: "3.5", milk_ml: 100 },
    { size: "MEDIUM", powder_gram: "4", milk_ml: 100 },
  ],
  addonGroups: [],
};

describe("Smoke staging — payload pickup động", () => {
  it("chọn cấu hình Latte có giá cao nhất và đủ ngưỡng để voucher giảm thật", () => {
    const result = buildPickupCase({
      catalog,
      runId: "run_12345678",
      caseId: "discount-first",
      voucher: {
        id: "voucher-internal",
        qr_token: "10000000-0000-4000-8000-000000000001",
        voucher_type: "DISCOUNT",
        discount_type: "PERCENT",
        discount_value: 10,
        min_order_vnd: 50_000,
      },
    });

    expect(result.marker).toBe("[STAGING:run_12345678:discount-first]");
    expect(result.payload.items).toHaveLength(1);
    expect(result.payload.items[0]).toMatchObject({
      menu_item_id: "latte-pricey",
      size: "MEDIUM",
      quantity: 2,
      client_price_vnd: 33_000,
      note: result.marker,
    });
    expect(result.payload.discount_voucher_ids).toEqual([
      "10000000-0000-4000-8000-000000000001",
    ]);
    expect(result.expected).toMatchObject({
      subtotal_vnd: 66_000,
      total_voucher_discount_vnd: 6_000,
      total_vnd: 60_000,
      grand_total_vnd: 60_000,
    });
  });
});

describe("Smoke staging — hành trình order và voucher", () => {
  it.each([null, "plain", "discount-first", "discount-reuse"])("smoke giữ ownership chính xác khi marker có sẵn: %s", async collision => {
    const token = "10000000-0000-4000-8000-000000000001";
    const voucher = {
      id: "voucher-internal",
      qr_token: token,
      package_id: "package-discount",
      voucher_type: "DISCOUNT",
      discount_type: "PERCENT",
      discount_value: 10,
      min_order_vnd: 50_000,
      status: "ACTIVE",
      expires_at: null,
    };
    const orders = new Map<string, Record<string, unknown>>();
    const oldMarker = `[STAGING:run_12345678:${collision}]`;
    if (collision) orders.set("preexisting", { id: "preexisting", user_id: "user-a", note: oldMarker, status: "PENDING", discountVouchers: [] });
    const requests: Array<{ path: string; method: string; body?: Record<string, unknown> }> = [];
    let sequence = 0;
    const api = {
      request: vi.fn(async (path: string, options: { method?: string; body?: Record<string, unknown> } = {}) => {
        const method = options.method ?? "GET";
        requests.push({ path, method, body: options.body });
        if (path === "/api/profile/vouchers?limit=50&status=ACTIVE") {
          return { ok: true, status: 200, body: { data: voucher.status === "ACTIVE" ? [voucher] : [], meta: { has_more: false, next_cursor: null } } };
        }
        if (path === "/api/orders" && method === "POST") {
          sequence += 1;
          const payload = options.body as { note: string; items: unknown[]; discount_voucher_ids: string[] };
          const discounted = payload.discount_voucher_ids.length === 1;
          const data = {
            id: `order-${sequence}`,
            order_code: `ORDER${sequence}`,
            status: "PENDING",
            order_type: "PICKUP",
            payment_method: "BANK_TRANSFER",
            subtotal_vnd: discounted ? 66_000 : 33_000,
            total_voucher_discount_vnd: discounted ? 6_000 : 0,
            total_vnd: discounted ? 60_000 : 33_000,
            shipping_fee_vnd: 0,
            freeship_discount_vnd: 0,
            grand_total_vnd: discounted ? 60_000 : 33_000,
            skipped_vouchers: [],
            items: payload.items,
          };
          orders.set(data.id, { ...data, user_id: "user-a", note: payload.note,
            discountVouchers: discounted ? [{ voucher_id: voucher.id }] : [] });
          if (discounted) voucher.status = "RESERVED";
          return { ok: true, status: 201, body: { data } };
        }
        const orderId = path.startsWith("/api/orders/") ? path.slice("/api/orders/".length) : null;
        const stored = orderId ? orders.get(orderId) : null;
        if (stored && method === "GET") return { ok: true, status: 200, body: { data: stored } };
        if (stored && method === "PATCH") {
          stored.status = "CANCELLED";
          if ((stored.discountVouchers as unknown[]).length) voucher.status = "ACTIVE";
          return { ok: true, status: 200, body: { data: { id: orderId, status: "CANCELLED" } } };
        }
        throw new Error(`Unexpected request ${method} ${path}`);
      }),
    };
    const baselineState = {
      actor: { id: "user-a" },
      user: { id: "user-a", role: "CUSTOMER", points_balance: 100 },
      vouchers: [voucher],
      ledger: [],
      sessions: [],
      orders: [],
      recentOrderCount: 0,
    };
    const db = {
      ordersByMarkers: vi.fn(async (markers: string[]) => [...orders.values()].filter(order => markers.includes(order.note as string))),
      order: vi.fn(async (id: string) => orders.get(id) ?? null),
      vouchers: vi.fn(async () => [voucher]),
      activeUses: vi.fn(async () => [...orders.values()].filter(order => order.status === "PENDING"
        && (order.discountVouchers as Array<{ voucher_id: string }>).some(link => link.voucher_id === voucher.id))),
      actorState: vi.fn(async () => ({ user: baselineState.user, vouchers: [voucher], ledger: [], sessions: [], grants: [] })),
      catalog: vi.fn(async () => ({ fingerprint: "catalog-fingerprint" })),
    };
    const journalEntries: Array<{ state: string; type: string; recovery?: Record<string, unknown> }> = [];
    const journal = {
      recordIntent: (type: string, _operationId: string, recovery: Record<string, unknown>) =>
        journalEntries.push({ state: "INTENT", type, recovery }),
      recordOutcome: (type: string, _operationId: string, state: string) => journalEntries.push({ state, type }),
    };
    const login = vi.fn(async () => ({ name: "customerA", api: {
      jar: new CookieJar(),
      async request(path: string, options: { method?: string; body?: Record<string, unknown> } = {}) {
        return { ...await api.request(path, options), headers: new Headers() };
      },
    }, refreshToken: "run-refresh", sessionId: "session-run" }));
    const logout = vi.fn(async () => undefined);
    const runState = { addMarker: vi.fn(), addVoucher: vi.fn(), addSession: vi.fn() };

    const running = runSmokeJourney({
      runId: "run_12345678",
      runDir: "ignored-by-session-double",
      journal,
      runState,
      db,
      catalog: { ...catalog, fingerprint: "catalog-fingerprint" },
      customerState: baselineState,
      credential: { phone: "+84949129939", password: "secret", role: "CUSTOMER" },
      origin: "https://verified-preview.vercel.app",
      fetchImpl: async () => { throw new Error("Unexpected network access in boundary test"); },
      plan: { status: "PASS", gaps: [], internal: { coverage: { selected: [{ type: "DISCOUNT", source: "existing", voucher }] } } },
      actorLifecycle: { login, logout },
    });

    if (collision) {
      await expect(running).rejects.toMatchObject({ code: "SMOKE_MARKER_COLLISION" });
      expect(orders.get("preexisting")?.status).toBe("PENDING");
      expect(requests.some(request => request.path === "/api/orders/preexisting" && request.method === "PATCH")).toBe(false);
      expect(requests.some(request => request.method === "POST" && request.body?.note === oldMarker)).toBe(false);
      expect(runState.addMarker).not.toHaveBeenCalledWith(oldMarker);
      expect([...orders.values()].filter(order => order.id !== "preexisting").every(order => order.status === "CANCELLED")).toBe(true);
      return;
    }
    const result = await running;

    expect(result).toMatchObject({ status: "PASS", summary: { ordersCreated: 3, discountBenefitsVerified: 2, exchanged: false } });
    const createRequests = requests.filter(request => request.path === "/api/orders" && request.method === "POST");
    expect(createRequests).toHaveLength(3);
    expect(createRequests[0]?.body?.discount_voucher_ids).toEqual([]);
    expect(createRequests[1]?.body?.discount_voucher_ids).toEqual([token]);
    expect(createRequests[2]?.body?.discount_voucher_ids).toEqual([token]);
    expect([...orders.values()].map(order => order.status)).toEqual(["CANCELLED", "CANCELLED", "CANCELLED"]);
    expect(voucher.status).toBe("ACTIVE");
    expect(journalEntries.filter(entry => entry.state === "INTENT").map(entry => entry.type)).toEqual([
      "create", "cancel", "create", "cancel", "create", "cancel",
    ]);
    expect(journalEntries.find(entry => entry.state === "INTENT" && entry.type === "create")?.recovery)
      .toMatchObject({ actor: "customerA", userId: "user-a", sourceStatuses: ["ABSENT"], targetStatus: "PENDING" });
    expect(journalEntries.find(entry => entry.state === "INTENT" && entry.type === "cancel")?.recovery)
      .toMatchObject({ actor: "customerA", userId: "user-a", sourceStatuses: ["PENDING"], targetStatus: "CANCELLED" });
    expect(runState.addMarker).toHaveBeenCalledTimes(3);
    expect(runState.addVoucher).toHaveBeenCalledWith(voucher.id);
    expect(runState.addSession).toHaveBeenCalledWith("customerA", "session-run");
    expect(login).toHaveBeenCalledTimes(1);
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it("đổi voucher đúng một lần khi ví chưa có DISCOUNT và đối soát ledger", async () => {
    const packageId = "20000000-0000-4000-8000-000000000001";
    const token = "30000000-0000-4000-8000-000000000001";
    const state = {
      user: { id: "user-a", role: "CUSTOMER", points_balance: 100 },
      vouchers: [] as Array<Record<string, unknown>>,
      ledger: [] as Array<Record<string, unknown>>,
      sessions: [],
      grants: [],
    };
    const exchange = vi.fn(async () => {
      state.user.points_balance = 90;
      state.vouchers.push({ id: "voucher-new", qr_token: token, package_id: packageId,
        voucher_type: "DISCOUNT", discount_type: "FIXED", discount_value: 10_000,
        min_order_vnd: 0, status: "ACTIVE", expires_at: null });
      state.ledger.push({ id: "ledger-new", voucher_id: "voucher-new", reason: "voucher_purchase", delta: -10 });
      return { ok: true, status: 201, body: { data: { qr_token: token, voucher_type: "DISCOUNT", status: "ACTIVE", expires_at: null } } };
    });
    const actor = { api: { request: vi.fn(async (path: string, options?: { method?: string }) => {
      if (path === "/api/profile/vouchers/exchange" && options?.method === "POST") return exchange();
      if (path === "/api/profile/vouchers?limit=50&status=ACTIVE") {
        return { ok: true, status: 200, body: { data: state.vouchers, meta: { has_more: false } } };
      }
      throw new Error(`Unexpected path ${path}`);
    }) } };
    const intents: Array<Record<string, unknown>> = [];
    const journal = {
      recordIntent: (type: string, operationId: string, recovery: Record<string, unknown>) => intents.push({ type, operationId, recovery }),
      recordOutcome: vi.fn(),
    };
    const addVoucher = vi.fn();

    const result = await acquireSmokeDiscount({
      actor,
      actorName: "customerA",
      userId: "user-a",
      db: { actorState: vi.fn(async () => structuredClone(state)) },
      journal,
      runState: { addVoucher },
      plan: { internal: { coverage: { selected: [{
        type: "DISCOUNT",
        source: "exchange",
        package: { id: packageId, points_cost: 10 },
      }] } } },
    });

    expect(result).toMatchObject({ exchanged: true, voucher: { id: "voucher-new", status: "ACTIVE" } });
    expect(exchange).toHaveBeenCalledTimes(1);
    expect(state.user.points_balance).toBe(90);
    expect(state.ledger).toEqual([{ id: "ledger-new", voucher_id: "voucher-new", reason: "voucher_purchase", delta: -10 }]);
    expect(intents[0]).toMatchObject({ type: "exchange", recovery: {
      actor: "customerA",
      userId: "user-a",
      packageId,
      baselineVoucherIds: [],
      baselineLedgerIds: [],
      baselinePoints: 100,
      sourceStatuses: ["ABSENT"],
      targetStatus: "ACTIVE",
    } });
    expect(addVoucher).toHaveBeenCalledWith("voucher-new");
  });
});
