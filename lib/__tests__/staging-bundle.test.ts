// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import { createJournal } from "../../scripts/staging-tests/journal.mjs";
import { AmbiguousMutation } from "../../scripts/staging-tests/http.mjs";
import { runBundleJourney } from "../../scripts/staging-tests/journeys/bundle.mjs";

const USER_ID = "10000000-0000-4000-8000-000000000001";
const VOUCHER_ID = "20000000-0000-4000-8000-000000000001";
const VOUCHER_TOKEN = "30000000-0000-4000-8000-000000000001";
const PACKAGE_ID = "40000000-0000-4000-8000-000000000001";
const ITEM_ID = "50000000-0000-4000-8000-000000000001";
const POWDER_ID = "60000000-0000-4000-8000-000000000001";
const LIQUID_ID = "70000000-0000-4000-8000-000000000001";

type Row = Record<string, unknown>;

function bundleBoundary(mode: "normal" | "missing-rule" | "collision" | "ambiguous" | "recovered" | "paid" = "normal") {
  const rule = mode === "missing-rule" ? null : {
    buy_quantity: 1,
    reward_quantity: 1,
    reward_kind: "PRODUCT",
    reward_mode: "SAME_CONFIG",
    benefit_scaling: "PER_BUNDLE",
    max_applications_order: 1,
    max_reward_units_order: 1,
    productScopes: [{
      role: "QUALIFIER",
      menu_item_id: ITEM_ID,
      default_powder_id: POWDER_ID,
      default_base_liquid_id: LIQUID_ID,
      sizes: [{ size: "SMALL" }],
    }],
    addonRewards: [],
  };
  const voucher = {
    id: VOUCHER_ID,
    qr_token: VOUCHER_TOKEN,
    user_id: USER_ID,
    voucher_type: "BUNDLE",
    status: "ACTIVE",
    expires_at: null as string | null,
    min_order_vnd: 0,
    package_id: PACKAGE_ID,
    package: { id: PACKAGE_ID, ends_at: null as string | null, min_order_vnd: mode === "paid" ? 35_000 : 0, bundleRule: rule },
  };
  const sessions = [{ id: "old-customer" }];
  const orders = new Map<string, Row>();
  if (mode === "collision") {
    orders.set("preexisting", {
      id: "preexisting",
      user_id: USER_ID,
      status: "PENDING",
      note: "[STAGING:run_12345678:bundle-first]",
      items: [],
      bundleApplications: [],
    });
  }
  const writes: Array<{ path: string; body: Row | undefined }> = [];
  const entries: Row[] = [];
  const logouts: string[] = [];
  let dispatchedAmbiguous = false;
  let sequence = 0;

  const api = {
    async request(path: string, options: { method?: string; body?: Row } = {}) {
      if (!options.method) {
        const id = path.split("/").at(-1)!;
        return { ok: true, status: 200, body: { data: structuredClone(orders.get(id)) } };
      }
      writes.push({ path, body: options.body });
      expect(entries.filter(entry => entry.state === "INTENT").length).toBeGreaterThanOrEqual(writes.length);
      if (path === "/api/orders") {
        sequence += 1;
        const payload = options.body!;
        const orderItems = (payload.items as Row[]).map((item, index) => ({
          id: `item-${sequence}-${index + 1}`,
          menu_item_id: item.menu_item_id,
          size: item.size ?? null,
          quantity: item.quantity,
          unit_price_vnd: 17_000,
          addons_price_vnd: 0,
          total_discount_vnd: index === 1 ? 17_000 : 0,
          product_voucher_discount_vnd: 0,
          product_voucher_id: null,
          item_voucher_id: null,
          sweetness: item.sweetness,
          ice_option: item.ice_option,
          coldwhisk: item.coldwhisk,
          note: item.note,
          selected_powder_id: POWDER_ID,
          selected_milk_type_id: LIQUID_ID,
          base_liquid_ml: 100,
          addons: [],
          addonVouchers: [],
        }));
        const application = (payload.bundle_applications as Row[])[0];
        const qualifier = (application.qualifier_allocations as Row[])[0];
        const reward = (application.reward_allocations as Row[])[0];
        const lineIds = (payload.items as Row[]).map(item => item.client_line_id);
        const order = {
          id: `order-${sequence}`,
          user_id: USER_ID,
          status: "PENDING",
          order_type: "PICKUP",
          note: payload.note,
          subtotal_vnd: mode === "paid" ? 68_000 : 34_000,
          total_voucher_discount_vnd: 0,
          total_vnd: mode === "paid" ? 51_000 : 17_000,
          shipping_fee_vnd: 0,
          freeship_discount_vnd: 0,
          grand_total_vnd: mode === "paid" ? 51_000 : 17_000,
          items: orderItems,
          discountVouchers: [],
          freeship_voucher_id: null,
          bundleApplications: [{
            id: `application-${sequence}`,
            voucher_id: VOUCHER_ID,
            application_count: 1,
            status: "RESERVED",
            qualifiers: [{ order_item_id: orderItems[lineIds.indexOf(qualifier.client_line_id)]?.id, quantity: 1 }],
            rewards: [{ order_item_id: orderItems[lineIds.indexOf(reward.client_line_id)]?.id, order_item_addon_id: null,
              quantity: 1, discount_vnd: 17_000 }],
          }],
        };
        orders.set(order.id, order);
        voucher.status = "RESERVED";
        if (mode === "ambiguous") {
          dispatchedAmbiguous = true;
          throw new AmbiguousMutation();
        }
        if (mode === "recovered" && sequence === 1) throw new AmbiguousMutation();
        return { ok: true, status: 201, body: { data: structuredClone(order), skipped_vouchers: [] } };
      }
      const id = path.split("/").filter(Boolean).at(-1)!;
      const order = orders.get(id)!;
      order.status = "CANCELLED";
      (order.bundleApplications as Row[])[0].status = "CANCELLED";
      voucher.status = "ACTIVE";
      return { ok: true, status: 200, body: { data: structuredClone(order) } };
    },
  };

  const actorState = () => ({
    user: { id: USER_ID, role: "CUSTOMER", points_balance: 100 },
    vouchers: [structuredClone(voucher)],
    ledger: [{ id: "old-ledger", delta: 100 }],
    sessions: structuredClone(sessions),
    grants: [{ id: "old-grant" }],
  });
  const catalog = {
    fingerprint: "catalog-fingerprint",
    items: [{ id: ITEM_ID, category: "latte", is_available: true, matcha_powder_id: POWDER_ID,
      sizes: [{ size: "SMALL", base_price_vnd: 10_000 }] }],
    powders: [{ id: POWDER_ID, price_per_gram: 2_000, powderSizeConfigs: [] }],
    liquids: [{ id: LIQUID_ID, is_default: true, price_per_ml: 10 }],
    defaults: [{ size: "SMALL", powder_gram: 3, milk_ml: 100 }],
    addonGroups: [],
  };
  const ctx = {
    runId: "run_12345678",
    runDir: "D:/journal-double",
    origin: "https://test.invalid",
    now: () => 0,
    deadline: 3_600_000,
    catalog,
    actorStates: { customerB: actorState() },
    credentials: { customerB: { phone: "+84900000000", password: "synthetic" } },
    pacer: { reserve: vi.fn(async () => {}) },
    runState: { addMarker: vi.fn(), addVoucher: vi.fn(), addSession: vi.fn() },
    journal: createJournal({
      rootDir: "D:/journal-double",
      runId: "run_12345678",
      now: () => new Date(0),
      fs: { mkdirSync() {}, appendFileSync(_path: string, content: string) { entries.push(JSON.parse(content)); } },
    }),
    actorLifecycle: {
      async login() {
        sessions.push({ id: "run-customer" });
        return { name: "customerB", api, sessionId: "run-customer" };
      },
      async logout() {
        logouts.push("customerB");
        sessions.splice(0, sessions.length, { id: "old-customer" });
      },
    },
    db: {
      async actorState() { return structuredClone(actorState()); },
      async order(id: string) { return structuredClone(orders.get(id)); },
      async ordersByMarkers(markers: string[]) {
        if (dispatchedAmbiguous) throw new Error("database read unavailable");
        return structuredClone([...orders.values()].filter(order => markers.includes(String(order.note))));
      },
      async vouchers() { return [structuredClone(voucher)]; },
      async activeUses() {
        return structuredClone([...orders.values()].filter(order => order.status === "PENDING"));
      },
      async catalog() { return { fingerprint: catalog.fingerprint }; },
    },
  };
  return { ctx, api, voucher, orders, writes, entries, logouts };
}

describe("Runner live BUNDLE — boundary doubles, không phải bằng chứng DB", () => {
  it("reserve, huỷ rồi dùng lại cùng voucher PRODUCT SAME_CONFIG", async () => {
    const { ctx, voucher, orders, writes, logouts } = bundleBoundary();

    await expect(runBundleJourney(ctx)).resolves.toMatchObject({
      status: "PASS",
      summary: { ordersCreated: 2, bundleReservations: 2 },
    });

    const creates = writes.filter(write => write.path === "/api/orders");
    expect(creates).toHaveLength(2);
    for (const create of creates) {
      const payload = create.body!;
      const items = payload.items as Row[];
      const application = (payload.bundle_applications as Row[])[0];
      expect(new Set(items.map(item => item.client_line_id)).size).toBe(items.length);
      expect(items.every(item => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        .test(String(item.client_line_id)))).toBe(true);
      expect(application).toMatchObject({
        voucher_qr_token: VOUCHER_TOKEN,
        qualifier_allocations: [{ quantity: 1 }],
        reward_allocations: [{ quantity: 1 }],
      });
    }
    expect([...orders.values()].map(order => order.status)).toEqual(["CANCELLED", "CANCELLED"]);
    expect([...orders.values()].flatMap(order => order.bundleApplications as Row[])
      .map(application => application.status)).toEqual(["CANCELLED", "CANCELLED"]);
    expect(voucher.status).toBe("ACTIVE");
    expect(logouts).toEqual(["customerB"]);
  });

  it("thiếu rule thật thì PARTIAL và không tạo session hay order", async () => {
    const { ctx, writes, logouts } = bundleBoundary("missing-rule");

    await expect(runBundleJourney(ctx)).resolves.toMatchObject({
      status: "PARTIAL",
      code: "BUNDLE_RULE_MISSING",
    });
    expect(writes).toEqual([]);
    expect(logouts).toEqual([]);
    expect(ctx.runState.addMarker).not.toHaveBeenCalled();
  });

  it("pacer chờ sáu phút làm voucher hết hạn thì PARTIAL trước lần tạo đầu", async () => {
    const { ctx, voucher, writes } = bundleBoundary();
    voucher.expires_at = new Date(300_000).toISOString();
    let now = 0;
    ctx.now = () => now;
    ctx.pacer.reserve = vi.fn(async () => { now = 360_000; });
    await expect(runBundleJourney(ctx)).resolves.toMatchObject({ status: "PARTIAL", code: "BUNDLE_VOUCHER_HORIZON_INSUFFICIENT" });
    expect(writes).toEqual([]);
    expect(ctx.runState.addMarker).not.toHaveBeenCalled();
    expect(ctx.runState.addVoucher).not.toHaveBeenCalled();
  });

  it("reward giữ nguyên giá nhưng lưu sai powder thì FAIL", async () => {
    const { ctx } = bundleBoundary();
    const readOrder = ctx.db.order;
    ctx.db.order = async id => {
      const order = await readOrder(id);
      if (order) (order.items as Row[])[1].selected_powder_id = "different-powder";
      return order;
    };
    await expect(runBundleJourney(ctx)).resolves.toMatchObject({ status: "FAIL", code: "BUNDLE_DATABASE_LINE_SNAPSHOT_INVALID" });
  });

  it.each([
    ["selected_milk_type_id", "wrong-liquid"], ["base_liquid_ml", 999], ["sweetness", "NONE"],
    ["ice_option", "NO_ICE"], ["coldwhisk", true], ["addons", [{ unit_price_vnd: 0 }]],
    ["product_voucher_id", "unexpected"], ["item_voucher_id", "unexpected"],
    ["addonVouchers", [{ voucher_id: "unexpected" }]],
  ])("mọi dòng reward phải giữ snapshot %s kể cả giá không đổi", async (field, value) => {
    const { ctx } = bundleBoundary();
    const readOrder = ctx.db.order;
    ctx.db.order = async id => {
      const order = await readOrder(id);
      if (order) (order.items as Row[])[1][String(field)] = value;
      return order;
    };
    await expect(runBundleJourney(ctx)).resolves.toMatchObject({ status: "FAIL", code: "BUNDLE_DATABASE_LINE_SNAPSHOT_INVALID" });
  });

  it("cấu hình API detail sai vẫn FAIL dù DB đúng", async () => {
    const { ctx, api } = bundleBoundary();
    const request = api.request;
    api.request = async (path, options = {}) => {
      const response = await request(path, options);
      if (!options.method && response.body.data) ((response.body.data as Row).items as Row[])[1].sweetness = "NONE";
      return response;
    };
    await expect(runBundleJourney(ctx)).resolves.toMatchObject({ status: "FAIL", code: "BUNDLE_API_LINE_SNAPSHOT_INVALID" });
  });

  it("kiểm chứng cả dòng trả tiền thêm để đạt min order", async () => {
    const { ctx, writes } = bundleBoundary("paid");
    await expect(runBundleJourney(ctx)).resolves.toMatchObject({ status: "PASS" });
    expect((writes[0].body?.items as Row[]).map(item => item.quantity)).toEqual([1, 1, 2]);
    const broken = bundleBoundary("paid");
    const readOrder = broken.ctx.db.order;
    broken.ctx.db.order = async id => {
      const order = await readOrder(id);
      if (order) (order.items as Row[])[2].selected_milk_type_id = "wrong-liquid";
      return order;
    };
    await expect(runBundleJourney(broken.ctx)).resolves.toMatchObject({ status: "FAIL", code: "BUNDLE_DATABASE_LINE_SNAPSHOT_INVALID" });
  });

  it("giảm đúng tổng nhưng đặt discount vào qualifier thay reward thì FAIL", async () => {
    const { ctx } = bundleBoundary();
    const readOrder = ctx.db.order;
    ctx.db.order = async id => {
      const order = await readOrder(id);
      if (order) { (order.items as Row[])[0].total_discount_vnd = 17_000; (order.items as Row[])[1].total_discount_vnd = 0; }
      return order;
    };
    await expect(runBundleJourney(ctx)).resolves.toMatchObject({ status: "FAIL", code: "BUNDLE_DATABASE_LINE_SNAPSHOT_INVALID" });
  });

  it.each(["discountVouchers", "freeship_voucher_id"])("không được có voucher ngoài BUNDLE tại %s", async field => {
    const { ctx } = bundleBoundary();
    const readOrder = ctx.db.order;
    ctx.db.order = async id => {
      const order = await readOrder(id);
      if (order) order[field] = field === "discountVouchers" ? [{ voucher_id: "unexpected" }] : "unexpected";
      return order;
    };
    await expect(runBundleJourney(ctx)).resolves.toMatchObject({ status: "FAIL", code: "BUNDLE_DATABASE_LINE_SNAPSHOT_INVALID" });
  });

  it("mất response nhưng tìm đúng đơn thì recover response, không tạo trùng", async () => {
    const { ctx, writes, entries } = bundleBoundary("recovered");
    await expect(runBundleJourney(ctx)).resolves.toMatchObject({ status: "PASS" });
    expect(writes.filter(write => write.path === "/api/orders")).toHaveLength(2);
    expect(entries.filter(entry => entry.state === "APPLIED")).toHaveLength(4);
    expect(entries.filter(entry => entry.state === "AMBIGUOUS")).toEqual([]);
  });

  it("trước lần dùng lại phải đọc lại package horizon", async () => {
    const { ctx, voucher, orders, writes } = bundleBoundary();
    voucher.package.ends_at = new Date(300_000).toISOString();
    ctx.now = () => orders.get("order-1")?.status === "CANCELLED" ? 120_000 : 0;
    await expect(runBundleJourney(ctx)).resolves.toMatchObject({ status: "PARTIAL", code: "BUNDLE_VOUCHER_HORIZON_INSUFFICIENT" });
    expect(writes.filter(write => write.path === "/api/orders")).toHaveLength(1);
    expect(orders.get("order-1")?.status).toBe("CANCELLED");
  });

  it("marker đã tồn tại thì FAIL trước khi nhận ownership hoặc mutation", async () => {
    const { ctx, writes, orders, logouts } = bundleBoundary("collision");

    await expect(runBundleJourney(ctx)).resolves.toMatchObject({
      status: "FAIL",
      code: "BUNDLE_MARKER_COLLISION",
    });
    expect(ctx.runState.addMarker).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
    expect(logouts).toEqual([]);
    expect(orders.get("preexisting")?.status).toBe("PENDING");
  });

  it("marker xuất hiện trong lúc pacing thì không nhận ownership hoặc huỷ đơn khác", async () => {
    const { ctx, orders, writes } = bundleBoundary();
    ctx.pacer.reserve = vi.fn(async () => {
      orders.set("outside", { id: "outside", user_id: USER_ID, status: "PENDING",
        note: "[STAGING:run_12345678:bundle-first]", items: [], bundleApplications: [] });
    });
    await expect(runBundleJourney(ctx)).resolves.toMatchObject({ status: "FAIL", code: "BUNDLE_MARKER_COLLISION" });
    expect(writes).toEqual([]);
    expect(orders.get("outside")?.status).toBe("PENDING");
    expect(ctx.runState.addMarker).not.toHaveBeenCalled();
    expect(ctx.runState.addVoucher).not.toHaveBeenCalled();
  });

  it("outcome mơ hồ giữ session và đơn để recovery, không tự huỷ hay logout", async () => {
    const { ctx, writes, orders, logouts } = bundleBoundary("ambiguous");

    await expect(runBundleJourney(ctx)).rejects.toMatchObject({ code: "MUTATION_OUTCOME_AMBIGUOUS" });
    expect(writes).toHaveLength(1);
    expect([...orders.values()].map(order => order.status)).toEqual(["PENDING"]);
    expect(logouts).toEqual([]);
    expect((await ctx.db.actorState()).sessions).toEqual([
      { id: "old-customer" },
      { id: "run-customer" },
    ]);
  });

  it("cleanup bị mơ hồ cũng phải đóng luồng mutation và giữ session", async () => {
    const { ctx, api, logouts } = bundleBoundary();
    const request = api.request;
    api.request = async (path, options = {}) => {
      if (options.method === "PATCH") throw new AmbiguousMutation();
      const response = await request(path, options);
      if (!options.method && response.body.data) ((response.body.data as Row).items as Row[])[0].sweetness = "NONE";
      return response;
    };
    await expect(runBundleJourney(ctx)).rejects.toMatchObject({ code: "MUTATION_OUTCOME_AMBIGUOUS" });
    expect(logouts).toEqual([]);
  });
});
