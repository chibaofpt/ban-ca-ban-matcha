// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import { runVoucherEligibilityJourney } from "../../scripts/staging-tests/journeys/eligibility.mjs";
import { AmbiguousMutation, createApi } from "../../scripts/staging-tests/http.mjs";
import { createJournal } from "../../scripts/staging-tests/journal.mjs";

function memoryJournal() {
  const lines: Array<Record<string, unknown>> = [];
  const fs = { mkdirSync: vi.fn(), appendFileSync: vi.fn((_path: string, value: string) => {
    lines.push(JSON.parse(value.trim()) as Record<string, unknown>);
  }) };
  return { journal: createJournal({ fs, rootDir: "C:/journal", runId: "run12345",
    now: () => new Date("2026-08-31T00:00:00.000Z") }), lines };
}

describe("Staging eligibility — từ chối voucher không tạo đơn", () => {
  it("từ chối DISCOUNT dưới ngưỡng và giữ nguyên toàn bộ tài sản khách", async () => {
    const user = { id: "customer-b", role: "CUSTOMER", points_balance: 12 };
    const voucher = { id: "voucher-min", qr_token: "qr-min", voucher_type: "DISCOUNT", status: "ACTIVE",
      min_order_vnd: 80_000, discount_type: "FIXED", discount_value: 10_000, expires_at: "2099-01-01T00:00:00.000Z" };
    const actorState = { user, ledger: [], vouchers: [voucher], grants: [], sessions: [] };
    const catalog = { fingerprint: "catalog-1", items: [{ id: "extra-1", category: "extras", is_available: true,
      unit_price_vnd: 50_000, sizes: [] }], powders: [], liquids: [], defaults: [], addonGroups: [] };
    const request = vi.fn().mockResolvedValue({ ok: false, status: 400,
      body: { error: "Minimum order not met", code: "MIN_ORDER_NOT_MET" } });
    const actor = { name: "customerB", api: { request }, sessionId: "session-run" };
    const db = {
      actorState: vi.fn().mockResolvedValue(structuredClone(actorState)),
      catalog: vi.fn().mockResolvedValue(structuredClone(catalog)),
      ordersByMarkers: vi.fn().mockResolvedValue([]),
      vouchers: vi.fn().mockResolvedValue([structuredClone(voucher)]),
      activeUses: vi.fn().mockResolvedValue([]),
    };
    const { journal, lines } = memoryJournal();
    const result = await runVoucherEligibilityJourney({ runId: "run12345", catalog, db, journal,
      actorStates: { customerB: actorState }, credentials: { customerB: { phone: "+84900000000", password: "secret" } },
      pacer: { reserve: vi.fn().mockResolvedValue({ markDispatched: vi.fn() }) }, runState: { addMarker: vi.fn(), addVoucher: vi.fn() },
      actorLifecycle: { login: vi.fn().mockResolvedValue(actor), logout: vi.fn().mockResolvedValue(undefined) },
      now: () => Date.parse("2026-08-31T00:00:00.000Z"), deadline: Date.parse("2026-08-31T01:00:00.000Z") });

    expect(result).toMatchObject({ status: "PARTIAL", summary: { attempted: 1, rejected: 1 } });
    expect(result.cases).toContainEqual(expect.objectContaining({ name: "min-order", status: "PASS", code: "MIN_ORDER_NOT_MET" }));
    expect(request).toHaveBeenCalledWith("/api/orders", expect.objectContaining({ method: "POST", mutation: true }));
    expect(lines.map(entry => entry.state)).toEqual(["INTENT", "NOT_APPLIED"]);
  });
});

describe("Staging eligibility — khoảng trống dữ liệu và bất biến", () => {
  function harness(options: { vouchers?: Array<Record<string, unknown>>; request?: ReturnType<typeof vi.fn>;
    orders?: Array<Record<string, unknown>>; mutateAssets?: boolean; now?: number } = {}) {
    const now = options.now ?? Date.parse("2026-08-31T00:00:00.000Z");
    const user = { id: "customer-b", role: "CUSTOMER", points_balance: 12 };
    const vouchers = options.vouchers ?? [];
    const baseline = { user, ledger: [], vouchers, grants: [], sessions: [] };
    const catalog = { fingerprint: "catalog-1", items: [
      { id: "extra-a", category: "extras", is_available: true, unit_price_vnd: 40_000, sizes: [] },
      { id: "extra-b", category: "extras", is_available: true, unit_price_vnd: 50_000, sizes: [] },
      { id: "latte-a", category: "latte", is_available: true, matcha_powder_id: "powder-a",
        sizes: [{ size: "SMALL", base_price_vnd: 20_000 }, { size: "LARGE", base_price_vnd: 30_000 }] },
    ], powders: [{ id: "powder-a", price_per_gram: 1_000, powderSizeConfigs: [] }],
    liquids: [{ id: "liquid-a", is_default: true, price_per_ml: 0 }],
    defaults: [{ size: "SMALL", powder_gram: 3, milk_ml: 100 }, { size: "LARGE", powder_gram: 5, milk_ml: 200 }], addonGroups: [] };
    const request = options.request ?? vi.fn().mockResolvedValue({ ok: false, status: 400,
      body: { code: "VALIDATION_ERROR" } });
    let actorReads = 0;
    const db = {
      actorState: vi.fn().mockImplementation(() => {
        actorReads += 1;
        const state = structuredClone(baseline);
        if (options.mutateAssets && actorReads > 2) state.user.points_balance = 11;
        return state;
      }),
      catalog: vi.fn().mockResolvedValue(structuredClone(catalog)),
      ordersByMarkers: vi.fn().mockResolvedValue(options.orders ?? []),
      vouchers: vi.fn().mockImplementation((ids: string[]) => structuredClone(vouchers.filter(voucher => ids.includes(String(voucher.id))))),
      activeUses: vi.fn().mockResolvedValue([]),
    };
    const { journal, lines } = memoryJournal();
    return { ctx: { runId: "run12345", catalog, db, journal, actorStates: { customerB: baseline },
      credentials: { customerB: { phone: "+84900000000", password: "secret" } },
      pacer: { reserve: vi.fn().mockResolvedValue({ markDispatched: vi.fn() }) }, runState: { addMarker: vi.fn(), addVoucher: vi.fn() },
      actorLifecycle: { login: vi.fn().mockResolvedValue({ name: "customerB", api: { request }, sessionId: "run-session" }),
        logout: vi.fn().mockResolvedValue(undefined) }, now: () => now, deadline: now + 3_600_000 }, request, journal, lines };
  }

  it("báo riêng từng data gap và không giữ pacer hay gọi HTTP", async () => {
    const { ctx, request } = harness();
    const result = await runVoucherEligibilityJourney(ctx);
    expect(result.cases).toEqual([
      { id: "voucher-eligibility-min-order", name: "min-order", status: "PARTIAL", code: "ELIGIBILITY_MIN_ORDER_DATA_MISSING" },
      { id: "voucher-eligibility-wrong-item", name: "wrong-item", status: "PARTIAL", code: "ELIGIBILITY_WRONG_ITEM_DATA_MISSING" },
      { id: "voucher-eligibility-wrong-size", name: "wrong-size", status: "PARTIAL", code: "ELIGIBILITY_WRONG_SIZE_DATA_MISSING" },
      { id: "voucher-eligibility-expired", name: "expired", status: "PARTIAL", code: "ELIGIBILITY_EXPIRED_DATA_MISSING" },
    ]);
    expect(ctx.pacer.reserve).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });

  it("từ chối sai code làm profile FAIL thay vì che thành PASS", async () => {
    const voucher = { id: "voucher-wrong", qr_token: "qr-wrong", voucher_type: "ITEM", status: "ACTIVE",
      menu_item_id: "extra-a", expires_at: "2099-01-01T00:00:00.000Z" };
    const request = vi.fn().mockResolvedValue({ ok: false, status: 422, body: { code: "SOME_OTHER_CODE" } });
    const { ctx } = harness({ vouchers: [voucher], request });
    const result = await runVoucherEligibilityJourney(ctx);
    expect(result).toMatchObject({ status: "FAIL", code: "ELIGIBILITY_WRONG_ITEM_REJECTION_MISMATCH",
      summary: { attempted: 1, rejected: 0 } });
  });

  it("timeout đã đối soát không có đơn được ghi NOT_APPLIED và không retry", async () => {
    const voucher = { id: "voucher-wrong", qr_token: "qr-wrong", voucher_type: "ITEM", status: "ACTIVE",
      menu_item_id: "extra-a", expires_at: "2099-01-01T00:00:00.000Z" };
    const request = vi.fn(createApi({ origin: "https://staging.example.test",
      fetchImpl: vi.fn().mockRejectedValue(new Error("connection lost")) }).request);
    const { ctx, lines } = harness({ vouchers: [voucher], request });
    const result = await runVoucherEligibilityJourney(ctx);
    expect(result.cases).toContainEqual(expect.objectContaining({ name: "wrong-item", status: "PARTIAL",
      code: "ELIGIBILITY_REJECTION_RESPONSE_UNOBSERVED" }));
    expect(result.summary).toEqual({ attempted: 1, rejected: 0 });
    expect(request).toHaveBeenCalledTimes(1);
    expect(lines).toContainEqual(expect.objectContaining({ state: "NOT_APPLIED", type: "create",
      evidence: expect.objectContaining({ code: null, httpStatus: null }) }));
  });

  it("phát hiện tài sản bị đổi sau rejection", async () => {
    const voucher = { id: "voucher-wrong", qr_token: "qr-wrong", voucher_type: "ITEM", status: "ACTIVE",
      menu_item_id: "extra-a", expires_at: "2099-01-01T00:00:00.000Z" };
    const { ctx } = harness({ vouchers: [voucher], mutateAssets: true });
    const result = await runVoucherEligibilityJourney(ctx);
    expect(result).toMatchObject({ status: "FAIL", recoveryRequired: true, summary: { attempted: 1, rejected: 1 },
      code: expect.stringMatching(/^ELIGIBILITY_.*ASSETS_CHANGED$/) });
    expect(ctx.actorLifecycle.logout).not.toHaveBeenCalled();
  });

  it.each(["MUTATION_OUTCOME_AMBIGUOUS", "MUTATION_RESPONSE_LOST_AMBIGUOUS",
    "MUTATION_SERVER_ERROR_AMBIGUOUS", "MUTATION_INVALID_RESPONSE_AMBIGUOUS"])(
    "giữ phiên khi %s không đối soát được", async code => {
      const voucher = { id: "voucher-wrong", qr_token: "qr-wrong", voucher_type: "ITEM", status: "ACTIVE",
        menu_item_id: "extra-a", expires_at: "2099-01-01T00:00:00.000Z" };
      const request = vi.fn().mockRejectedValue(new AmbiguousMutation(code));
      const { ctx, lines } = harness({ vouchers: [voucher], request });
      ctx.db.ordersByMarkers.mockResolvedValueOnce([]).mockRejectedValueOnce(new Error("read unavailable"));
      await expect(runVoucherEligibilityJourney(ctx)).rejects.toMatchObject({ code: "MUTATION_OUTCOME_AMBIGUOUS" });
      expect(ctx.actorLifecycle.logout).not.toHaveBeenCalled();
      expect(request).toHaveBeenCalledTimes(1);
      expect(lines).toContainEqual(expect.objectContaining({ state: "AMBIGUOUS", type: "create" }));
    });

  it("logout thất bại không che lỗi rejection ban đầu", async () => {
    const voucher = { id: "voucher-wrong", qr_token: "qr-wrong", voucher_type: "ITEM", status: "ACTIVE",
      menu_item_id: "extra-a", expires_at: "2099-01-01T00:00:00.000Z" };
    const request = vi.fn().mockResolvedValue({ ok: false, status: 422, body: { code: "OTHER" } });
    const { ctx } = harness({ vouchers: [voucher], request });
    ctx.actorLifecycle.logout.mockRejectedValue(new AmbiguousMutation("MUTATION_RESPONSE_LOST_AMBIGUOUS"));
    expect(await runVoucherEligibilityJourney(ctx)).toMatchObject({ status: "FAIL", recoveryRequired: true,
      code: "ELIGIBILITY_WRONG_ITEM_REJECTION_MISMATCH", summary: { attempted: 1, rejected: 0 } });
  });

  it("giữ phiên phục hồi nếu đọc đối soát sau rejection thất bại", async () => {
    const { ctx } = harness({ vouchers: [{ id: "item", qr_token: "qr-item", voucher_type: "ITEM", status: "ACTIVE",
      menu_item_id: "extra-a", expires_at: "2099-01-01T00:00:00.000Z" }] });
    ctx.db.ordersByMarkers.mockResolvedValueOnce([]).mockRejectedValueOnce(new Error("read unavailable"));
    expect(await runVoucherEligibilityJourney(ctx)).toMatchObject({ status: "FAIL", recoveryRequired: true });
    expect(ctx.actorLifecycle.logout).not.toHaveBeenCalled();
  });

  it("từ chối PRODUCT_DISCOUNT khi size hiện tại nằm ngoài eligible_sizes", async () => {
    const voucher = { id: "voucher-size", qr_token: "qr-size", voucher_type: "PRODUCT_DISCOUNT", status: "ACTIVE",
      menu_item_id: "latte-a", menuItemScopes: [{ menu_item_id: "latte-a" }], eligible_sizes: ["SMALL"],
      product_discount_mode: "FIXED_AMOUNT", discount_value: 10_000, expires_at: "2099-01-01T00:00:00.000Z" };
    const request = vi.fn().mockResolvedValue({ ok: false, status: 400, body: { code: "VALIDATION_ERROR" } });
    const { ctx } = harness({ vouchers: [voucher], request });
    const result = await runVoucherEligibilityJourney(ctx);
    expect(result.cases).toContainEqual({ id: "voucher-eligibility-wrong-size", name: "wrong-size", status: "PASS", code: "VALIDATION_ERROR" });
  });

  it("fallback menu_item_id khi menuItemScopes thật là mảng rỗng", async () => {
    const voucher = { id: "voucher-empty-scopes", qr_token: "qr-empty-scopes", voucher_type: "ITEM", status: "ACTIVE",
      menu_item_id: "extra-a", menuItemScopes: [], expires_at: "2099-01-01T00:00:00.000Z" };
    const request = vi.fn().mockResolvedValue({ ok: false, status: 400, body: { code: "VALIDATION_ERROR" } });
    const { ctx } = harness({ vouchers: [voucher], request });
    const result = await runVoucherEligibilityJourney(ctx);
    expect(result.cases).toContainEqual({ id: "voucher-eligibility-wrong-item", name: "wrong-item", status: "PASS", code: "VALIDATION_ERROR" });
    expect(request).toHaveBeenCalledWith("/api/orders", expect.objectContaining({ body: expect.objectContaining({
      items: [expect.objectContaining({ menu_item_id: "extra-b", item_voucher_id: "qr-empty-scopes" })],
    }) }));
  });

  it("DISCOUNT đủ điều kiện không bị FREESHIP đứng trước che mất", async () => {
    const vouchers = [
      { id: "voucher-ship", qr_token: "qr-ship", voucher_type: "FREESHIP", status: "ACTIVE",
        min_order_vnd: 90_000, expires_at: "2099-01-01T00:00:00.000Z" },
      { id: "voucher-discount", qr_token: "qr-discount", voucher_type: "DISCOUNT", status: "ACTIVE",
        min_order_vnd: 80_000, discount_type: "FIXED", discount_value: 10_000, expires_at: "2099-01-01T00:00:00.000Z" },
    ];
    const request = vi.fn().mockResolvedValue({ ok: false, status: 400, body: { code: "MIN_ORDER_NOT_MET" } });
    const { ctx } = harness({ vouchers, request });
    const result = await runVoucherEligibilityJourney(ctx);
    expect(result.cases).toContainEqual({ id: "voucher-eligibility-min-order", name: "min-order", status: "PASS", code: "MIN_ORDER_NOT_MET" });
    expect(request).toHaveBeenCalledWith("/api/orders", expect.objectContaining({
      body: expect.objectContaining({ discount_voucher_ids: ["qr-discount"] }),
    }));
  });

  it("FREESHIP đơn độc báo rõ thiếu delivery context và không dispatch", async () => {
    const voucher = { id: "voucher-ship", qr_token: "qr-ship", voucher_type: "FREESHIP", status: "ACTIVE",
      min_order_vnd: 90_000, expires_at: "2099-01-01T00:00:00.000Z" };
    const { ctx, request } = harness({ vouchers: [voucher] });
    const result = await runVoucherEligibilityJourney(ctx);
    expect(result.cases).toContainEqual({ id: "voucher-eligibility-min-order", name: "min-order", status: "PARTIAL",
      code: "ELIGIBILITY_FREESHIP_DELIVERY_CONTEXT_UNSUPPORTED" });
    expect(ctx.pacer.reserve).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });

  it("bỏ voucher không có cặp âm hợp lệ để chọn DISCOUNT phía sau", async () => {
    const vouchers = [
      { id: "too-low", qr_token: "qr-low", voucher_type: "DISCOUNT", status: "ACTIVE",
        min_order_vnd: 1_000, expires_at: "2099-01-01T00:00:00.000Z" },
      { id: "high", qr_token: "qr-high", voucher_type: "DISCOUNT", status: "ACTIVE",
        min_order_vnd: 80_000, expires_at: "2099-01-01T00:00:00.000Z" },
    ];
    const request = vi.fn().mockResolvedValue({ ok: false, status: 400, body: { code: "MIN_ORDER_NOT_MET" } });
    const { ctx } = harness({ vouchers, request });
    expect((await runVoucherEligibilityJourney(ctx)).cases).toContainEqual(expect.objectContaining({
      id: "voucher-eligibility-min-order", status: "PASS" }));
    expect(request).toHaveBeenCalledWith("/api/orders", expect.objectContaining({
      body: expect.objectContaining({ discount_voucher_ids: ["qr-high"] }),
    }));
  });

  it("chọn ITEM phía sau khi PRODUCT đầu tiên không có drink ngoài scope", async () => {
    const vouchers = [
      { id: "product", qr_token: "qr-product", voucher_type: "PRODUCT", status: "ACTIVE",
        menu_item_id: "latte-a", expires_at: "2099-01-01T00:00:00.000Z" },
      { id: "item", qr_token: "qr-item", voucher_type: "ITEM", status: "ACTIVE",
        menu_item_id: "extra-a", expires_at: "2099-01-01T00:00:00.000Z" },
    ];
    const { ctx, request } = harness({ vouchers });
    expect((await runVoucherEligibilityJourney(ctx)).cases).toContainEqual(expect.objectContaining({
      id: "voucher-eligibility-wrong-item", status: "PASS" }));
    expect(request).toHaveBeenCalledWith("/api/orders", expect.objectContaining({ body: expect.objectContaining({
      items: [expect.objectContaining({ menu_item_id: "extra-b", item_voucher_id: "qr-item" })],
    }) }));
  });

  it("PRODUCT không có drink ngoài scope là PARTIAL, không mượn extras để tạo lỗi", async () => {
    const { ctx, request } = harness({ vouchers: [{ id: "product", qr_token: "qr-product", voucher_type: "PRODUCT",
      status: "ACTIVE", menu_item_id: "latte-a", expires_at: "2099-01-01T00:00:00.000Z" }] });
    expect((await runVoucherEligibilityJourney(ctx)).cases).toContainEqual({ id: "voucher-eligibility-wrong-item",
      name: "wrong-item", status: "PARTIAL", code: "ELIGIBILITY_WRONG_ITEM_DATA_MISSING" });
    expect(request).not.toHaveBeenCalled();
  });

  it("chọn voucher size phía sau khi voucher đầu phủ mọi size hiện tại", async () => {
    const base = { voucher_type: "PRODUCT_DISCOUNT", status: "ACTIVE", menu_item_id: "latte-a",
      expires_at: "2099-01-01T00:00:00.000Z" };
    const { ctx, request } = harness({ vouchers: [
      { ...base, id: "all", qr_token: "qr-all", eligible_sizes: ["SMALL", "LARGE"] },
      { ...base, id: "small", qr_token: "qr-small", eligible_sizes: ["SMALL"] },
    ] });
    expect((await runVoucherEligibilityJourney(ctx)).cases).toContainEqual(expect.objectContaining({
      id: "voucher-eligibility-wrong-size", status: "PASS" }));
    expect(request).toHaveBeenCalledWith("/api/orders", expect.objectContaining({ body: expect.objectContaining({
      items: [expect.objectContaining({ menu_item_id: "latte-a", size: "LARGE", product_voucher_id: "qr-small" })],
    }) }));
  });

  it("chọn voucher hết hạn phía sau khi món đầu không còn trong catalog", async () => {
    const base = { voucher_type: "ITEM", status: "EXPIRED", expires_at: "2026-01-01T00:00:00.000Z" };
    const request = vi.fn().mockResolvedValue({ ok: false, status: 422, body: { code: "VOUCHER_EXPIRED" } });
    const { ctx } = harness({ request, vouchers: [
      { ...base, id: "gone", qr_token: "qr-gone", menu_item_id: "gone" },
      { ...base, id: "present", qr_token: "qr-present", menu_item_id: "extra-a" },
    ] });
    expect((await runVoucherEligibilityJourney(ctx)).cases).toContainEqual(expect.objectContaining({
      id: "voucher-eligibility-expired", status: "PASS" }));
    expect(request).toHaveBeenCalledWith("/api/orders", expect.objectContaining({ body: expect.objectContaining({
      items: [expect.objectContaining({ menu_item_id: "extra-a", item_voucher_id: "qr-present" })],
    }) }));
  });

  it("voucher hết hạn trong lúc pacer chờ thành PARTIAL trước marker và HTTP", async () => {
    let time = Date.parse("2026-08-31T00:00:00.000Z");
    const voucher = { id: "voucher-pacing", qr_token: "qr-pacing", voucher_type: "ITEM", status: "ACTIVE",
      menu_item_id: "extra-a", menuItemScopes: [], expires_at: "2026-08-31T00:00:01.000Z" };
    const request = vi.fn().mockResolvedValue({ ok: false, status: 400, body: { code: "VALIDATION_ERROR" } });
    const { ctx } = harness({ vouchers: [voucher], request, now: time });
    ctx.now = () => time;
    ctx.pacer.reserve.mockImplementation(async () => { time += 2_000; return { markDispatched: vi.fn() }; });
    const result = await runVoucherEligibilityJourney(ctx);
    expect(result.cases).toContainEqual({ id: "voucher-eligibility-wrong-item", name: "wrong-item", status: "PARTIAL",
      code: "ELIGIBILITY_VOUCHER_EXPIRED_DURING_PACING" });
    expect(ctx.runState.addMarker).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });

  it("coi status EXPIRED là hết hạn kể cả expires_at còn tương lai", async () => {
    const voucher = { id: "voucher-expired", qr_token: "qr-expired", voucher_type: "ITEM", status: "EXPIRED",
      menu_item_id: "extra-a", menuItemScopes: [], expires_at: "2099-01-01T00:00:00.000Z" };
    const request = vi.fn().mockResolvedValue({ ok: false, status: 422, body: { code: "VOUCHER_EXPIRED" } });
    const { ctx } = harness({ vouchers: [voucher], request });
    const result = await runVoucherEligibilityJourney(ctx);
    expect(result.cases).toContainEqual({ id: "voucher-eligibility-expired", name: "expired", status: "PASS", code: "VOUCHER_EXPIRED" });
  });

  it.each(["REDEEMED", "RESERVED"])("không chọn %s quá hạn thay voucher EXPIRED hợp lệ", async status => {
    const vouchers = [
      { id: "used", qr_token: "qr-used", voucher_type: "ITEM", status, menu_item_id: "extra-a",
        expires_at: "2026-01-01T00:00:00.000Z" },
      { id: "expired", qr_token: "qr-expired", voucher_type: "ITEM", status: "EXPIRED", menu_item_id: "extra-a",
        expires_at: "2026-01-01T00:00:00.000Z" },
    ];
    const request = vi.fn().mockResolvedValue({ ok: false, status: 422, body: { code: "VOUCHER_EXPIRED" } });
    const { ctx } = harness({ vouchers, request });
    await runVoucherEligibilityJourney(ctx);
    expect(request).toHaveBeenCalledWith("/api/orders", expect.objectContaining({ body: expect.objectContaining({
      items: [expect.objectContaining({ item_voucher_id: "qr-expired" })],
    }) }));
    const missing = harness({ vouchers: [vouchers[0]] });
    expect((await runVoucherEligibilityJourney(missing.ctx)).cases).toContainEqual(expect.objectContaining({
      id: "voucher-eligibility-expired", status: "PARTIAL", code: "ELIGIBILITY_EXPIRED_DATA_MISSING" }));
    expect(missing.request).not.toHaveBeenCalled();
  });

  it("coi expires_at bằng đúng thời điểm hiện tại là hết hạn", async () => {
    const voucher = { id: "voucher-expired", qr_token: "qr-expired", voucher_type: "ITEM", status: "ACTIVE",
      menu_item_id: "extra-a", expires_at: "2026-08-31T00:00:00.000Z" };
    const request = vi.fn().mockResolvedValue({ ok: false, status: 422, body: { code: "VOUCHER_EXPIRED" } });
    const { ctx } = harness({ vouchers: [voucher], request });
    const result = await runVoucherEligibilityJourney(ctx);
    expect(result.cases).toContainEqual({ id: "voucher-eligibility-expired", name: "expired", status: "PASS", code: "VOUCHER_EXPIRED" });
  });

  it("đơn bất ngờ sau rejection làm FAIL và không tự huỷ hay dọn rộng", async () => {
    const voucher = { id: "voucher-wrong", qr_token: "qr-wrong", voucher_type: "ITEM", status: "ACTIVE",
      menu_item_id: "extra-a", expires_at: "2099-01-01T00:00:00.000Z" };
    const { ctx } = harness({ vouchers: [voucher] });
    ctx.db.ordersByMarkers.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: "unexpected-order", status: "PENDING" }]);
    const result = await runVoucherEligibilityJourney(ctx);
    expect(result).toMatchObject({ status: "FAIL", code: "ELIGIBILITY_UNEXPECTED_ORDER", recoveryRequired: true });
    expect(ctx.actorLifecycle.logout).not.toHaveBeenCalled();
    expect(ctx.db.ordersByMarkers).toHaveBeenCalledTimes(2);
  });
});
