import { vi } from "vitest";
import { readDatabaseDouble } from "./staging-fixtures";

type Session = { id: string; user_id: string; expires_at: Date; created_at: Date };
type Payload = { note: string; items: Array<{ quantity: number; note: string }>; discount_voucher_ids: string[] };

/** Literal HTTP/DB fixture; owned preflight, journeys, pricing and reconciliation stay real. */
export function runnerBoundary({ usableMenu = true, discount = true, corruptBalanceOnLogout = false,
  exchangeFail = false, expiryAmbiguous = false, mainOrderAmbiguous = false,
  eligibilityAfterExchange = false, eligibilityWrongCode = false,
  clockRef = { value: Date.now() } } = {}) {
  const env = {
    NEXT_PUBLIC_APP_ENV: "staging", VERCEL_ENV: "preview",
    TEST_BASE_URL: "https://verified.vercel.app", PRODUCTION_BASE_URL: "https://production.example.com",
    TEST_STAGING_SUPABASE_REF: "unit-staging", NEXT_PUBLIC_SUPABASE_URL: "https://unit-staging.supabase.co",
    DATABASE_URL: "postgresql://postgres:fixture@db.unit-staging.supabase.co/postgres",
    TEST_DEPLOYMENT_ID: "dpl_fixture", TEST_DEPLOYMENT_SHA: "fixture-sha",
    TEST_CUSTOMER_A_PHONE: "0900000001", TEST_CUSTOMER_A_PASSWORD: "fixture-only",
    TEST_CUSTOMER_B_PHONE: "0900000002", TEST_CUSTOMER_B_PASSWORD: "fixture-only",
    ...(expiryAmbiguous ? { TEST_ADMIN_PHONE: "0900000003", TEST_ADMIN_PASSWORD: "fixture-only" } : {}),
  };
  const attestation = {
    source: "vercel-mcp", environment: "preview", appEnvironment: "staging", immutableDeployment: true,
    deploymentOrigin: env.TEST_BASE_URL, supabaseRef: env.TEST_STAGING_SUPABASE_REF,
    deploymentId: env.TEST_DEPLOYMENT_ID, deploymentSha: env.TEST_DEPLOYMENT_SHA,
    verifiedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    databaseBinding: { verified: true, source: "deployment-environment", supabaseRef: env.TEST_STAGING_SUPABASE_REF,
      deploymentId: env.TEST_DEPLOYMENT_ID, deploymentSha: env.TEST_DEPLOYMENT_SHA },
    pushMode: "log_only", pushGuardVerified: true,
  };
  const sizes = usableMenu ? [{ size: "SMALL", base_price_vnd: 8_000, base_liquid_ml: 100 }] : [];
  const item = { id: "latte", name: "Fixture latte", category: "latte", is_available: true,
    matcha_powder_id: "powder", unit_price_vnd: null, sizes };
  const powder = { id: "powder", name: "Fixture powder", is_available: true, price_per_gram: 2_000,
    reference_latte_item_id: "latte", powderSizeConfigs: [] };
  const liquid = { id: "milk", name: "Fixture milk", price_per_ml: 10, is_default: true, is_active: true };
  const exchangePackage = { id: "20000000-0000-4000-8000-000000000001", name: "Fixture exchange",
    voucher_type: "DISCOUNT", discount_type: "FIXED", discount_value: 1_000, min_order_vnd: eligibilityAfterExchange ? 999_999 : 0,
    acquisition_mode: "POINTS_EXCHANGE", points_cost: 10, max_per_user: 1, quantity: null,
    is_active: true, starts_at: null, ends_at: null, menuItemScopes: [], bundleRule: null, _count: { vouchers: 0 } };
  const catalog = { items: [item], powders: [powder], liquids: [liquid],
    defaults: [{ size: "SMALL", powder_gram: 3.5, milk_ml: 100 }], addonGroups: [],
    packages: exchangeFail || eligibilityAfterExchange ? [exchangePackage] : [], fingerprint: "fixture-catalog" };
  const menu = { data: { latte: [{ ...item, default_base_liquid_id: "milk" }], fusion: [], extras: [], base_liquids: [liquid], addon_groups: [] } };
  const powders = { data: [{ ...powder, size_config: [] }], default_powder_gram: [{ size: "SMALL", grams: 3.5 }] };
  const voucher = { id: "voucher", qr_token: "10000000-0000-4000-8000-000000000001", package_id: "package",
    voucher_type: "DISCOUNT", discount_type: "FIXED", discount_value: 1_000, min_order_vnd: 0,
    status: "ACTIVE", expires_at: null };
  const users = [{ id: "a", role: "CUSTOMER" as const, points_balance: 10, phone_number: "+84900000001", qr_token: "qr-a", addresses: [] },
    { id: "b", role: "CUSTOMER" as const, points_balance: exchangeFail || eligibilityAfterExchange ? 100 : 10, phone_number: "+84900000002", qr_token: "qr-b", addresses: [] },
    ...(expiryAmbiguous ? [{ id: "admin", role: "ADMIN" as const, points_balance: 0,
      phone_number: "+84900000003", qr_token: "qr-admin", addresses: [] }] : [])];
  const wallets: Record<string, Array<Record<string, unknown>>> = { a: discount ? [voucher] : [], b: [] };
  const ledgers: Record<string, Array<Record<string, unknown>>> = { a: [], b: [] };
  const sessions = new Map<string, Session>();
  const orders = new Map<string, Record<string, unknown>>();
  const requests: { route: string; method: string }[] = [];
  let sequence = 0;
  const state = (id: string) => structuredClone({ user: users.find(user => user.id === id),
    vouchers: wallets[id] ?? [], ledger: ledgers[id] ?? [], grants: [],
    sessions: [...sessions.values()].filter(session => session.user_id === id) });
  const db = readDatabaseDouble({
    catalog: vi.fn(async () => structuredClone(catalog)),
    actor: vi.fn(async phone => users.find(user => user.phone_number === phone) ?? null),
    actorState: vi.fn(async id => state(id)),
    pendingForUsers: vi.fn(async () => []), recentOrders: vi.fn(async () => []),
    session: vi.fn(async token => structuredClone(sessions.get(token) ?? null)),
    sessionById: vi.fn(async id => structuredClone([...sessions.values()].find(session => session.id === id) ?? null)),
    order: vi.fn(async id => structuredClone(orders.get(id) ?? null)),
    ordersByMarkers: vi.fn(async markers => structuredClone([...orders.values()].filter(order => markers.includes(String(order.note))))),
    vouchers: vi.fn(async ids => structuredClone(Object.values(wallets).flat().filter(candidate => ids.includes(String(candidate.id))))),
    activeUses: vi.fn(async () => [...orders.values()].filter(order => order.status === "PENDING"
      && (order.discountVouchers as unknown[]).length > 0).map(order => ({ id: String(order.id) }))),
  });
  const json = (body: unknown, status = 200, headers: HeadersInit = {}) => Response.json(body, { status, headers });
  const fetchImpl: typeof fetch = vi.fn(async (input, init) => {
    const url = new URL(String(input));
    if (url.origin !== env.TEST_BASE_URL) throw new Error("Unexpected HTTP origin");
    const route = url.pathname + url.search;
    const method = init?.method ?? "GET";
    requests.push({ route, method });
    if (method === "GET" && route === "/api/menu") return json(menu);
    if (method === "GET" && route === "/api/powders") return json(powders);
    if (method === "GET" && route === "/api/voucher-packages") return json({ data: exchangeFail || eligibilityAfterExchange ? [exchangePackage] : [] });
    if (method === "GET" && route === "/api/store-status") return json({ data: { is_open: true } });
    if (method === "POST" && route === "/api/auth/login") {
      const body = JSON.parse(String(init?.body)) as { phone_number: string };
      const user = users.find(user => user.phone_number === body.phone_number);
      if (!user) return json({ code: "UNAUTHORIZED" }, 401);
      const token = `refresh-${++sequence}`;
      sessions.set(token, { id: `session-${sequence}`, user_id: user.id, created_at: new Date(), expires_at: new Date(Date.now() + 86_400_000) });
      return json({ data: { role: user.role } }, 200, { "set-cookie": `refresh_token=${token}; HttpOnly; Path=/` });
    }
    const token = new Headers(init?.headers).get("cookie")?.match(/refresh_token=([^;]+)/)?.[1];
    const session = token ? sessions.get(token) : undefined;
    if (method === "GET" && route === "/api/auth/me") return session
      ? json({ data: { role: users.find(user => user.id === session.user_id)?.role } }) : json({ code: "UNAUTHORIZED" }, 401);
    if (!session) return json({ code: "UNAUTHORIZED" }, 401);
    if (method === "POST" && route === "/api/auth/logout") {
      sessions.delete(token!);
      if (corruptBalanceOnLogout) users.find(user => user.id === session.user_id)!.points_balance += 1;
      return json({ data: {} }, 200, { "set-cookie": "refresh_token=; Max-Age=0; Path=/" });
    }
    if (method === "GET" && route === "/api/profile/vouchers?limit=50&status=ACTIVE") {
      return json({ data: (wallets[session.user_id] ?? []).filter(candidate => candidate.status === "ACTIVE"), meta: { has_more: false } });
    }
    if ((exchangeFail || eligibilityAfterExchange) && method === "POST" && route === "/api/profile/vouchers/exchange") {
      if (eligibilityAfterExchange && wallets.b.length) return json({ error: "quota", code: "CONFLICT" }, 409);
      if (!wallets.b.length) {
        wallets.b.push({ id: "exchange-voucher", qr_token: "exchange-token", package_id: exchangePackage.id,
          voucher_type: "DISCOUNT", status: "ACTIVE", expires_at: null });
        if (eligibilityAfterExchange) Object.assign(wallets.b[0], { discount_type: "FIXED", discount_value: 1_000,
          min_order_vnd: 999_999, qr_token: "30000000-0000-4000-8000-000000000001", user_id: "b" });
        ledgers.b.push({ id: "exchange-log", user_id: "b", voucher_id: "exchange-voucher", order_id: null,
          reversed_log_id: null, reason: "voucher_purchase", delta: -10 });
        users.find(user => user.id === "b")!.points_balance -= 10;
      }
      return json({ data: { qr_token: "exchange-token", voucher_type: "DISCOUNT", status: "ACTIVE" } }, 201);
    }
    if (method === "POST" && route === "/api/orders") {
      if (mainOrderAmbiguous && session.user_id === "b") throw new TypeError("simulated lost main response");
      const payload = JSON.parse(String(init?.body)) as Payload;
      if (eligibilityAfterExchange) {
        const line = payload.items[0] as typeof payload.items[number] & { client_price_vnd: number; menu_item_id: string };
        if (line.client_price_vnd !== 16_000) return json({ error: "price", code: "PRICE_CHANGED", details: {
          conflicts: [{ menu_item_id: line.menu_item_id, client_price_vnd: line.client_price_vnd, server_price_vnd: 16_000 }],
        } }, 409);
        if (payload.discount_voucher_ids.length) return json({ error: "minimum",
          code: eligibilityWrongCode ? "VALIDATION_ERROR" : "MIN_ORDER_NOT_MET" }, 400);
      }
      const gross = payload.items.reduce((sum, line) => sum + 16_000 * line.quantity, 0);
      const applied = payload.discount_voucher_ids.length > 0;
      const total = gross - (applied ? 1_000 : 0);
      const id = `order-${orders.size + 1}`;
      const order = { id, order_code: `CODE${orders.size + 1}`, user_id: session.user_id, note: payload.note,
        order_type: "PICKUP", payment_method: "BANK_TRANSFER", status: "PENDING", items: payload.items,
        created_at: new Date(clockRef.value).toISOString(),
        auto_cancel_at: new Date(clockRef.value + 1_200_000).toISOString(),
        payment_confirmed_by: null, payment_confirmed_at: null, points_earned: null, pointsLogs: [],
        subtotal_vnd: gross, total_voucher_discount_vnd: applied ? 1_000 : 0, total_vnd: total,
        shipping_fee_vnd: 0, freeship_discount_vnd: 0, grand_total_vnd: total, skipped_vouchers: [],
        discountVouchers: applied ? [{ voucher_id: voucher.id }] : [] };
      if (eligibilityAfterExchange) order.items = payload.items.map(line => ({ ...line, unit_price_vnd: 16_000,
        addons_price_vnd: 0, selected_powder_id: "powder", selected_milk_type_id: "milk", base_liquid_ml: 100, addons: [] }));
      orders.set(id, order);
      if (applied) voucher.status = "RESERVED";
      return json({ data: order }, 201);
    }
    if (expiryAmbiguous && method === "PATCH" && route.startsWith("/api/admin/orders/")
      && route.endsWith("/confirm-payment")) throw new TypeError("simulated lost expiry response");
    const order = route.startsWith("/api/orders/") ? orders.get(route.slice("/api/orders/".length)) : null;
    if (order && method === "GET") return json({ data: order });
    if (order && method === "PATCH") {
      order.status = "CANCELLED";
      if ((order.discountVouchers as unknown[]).length) voucher.status = "ACTIVE";
      return json({ data: { id: order.id, status: order.status } });
    }
    throw new Error(`Unexpected HTTP ${method} ${route}`);
  });
  return { env, attestation, fetchImpl, openDatabase: vi.fn(() => db), db, orders, sessions, requests };
}
