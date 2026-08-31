// @vitest-environment node

import { describe, expect, it } from "vitest";
import { buildExecutionPlan } from "../../scripts/staging-tests/planner.mjs";

const actor = { user: { role: "CUSTOMER", points_balance: 20 }, vouchers: [], sessions: [], grants: [], orders: [], recentOrderCount: 0, addresses: [] };
const catalog = { items: [{ category: "latte", is_available: true }], packages: [
  { id: "cheap", name: "10%", voucher_type: "DISCOUNT", acquisition_mode: "POINTS_EXCHANGE", points_cost: 10, is_active: true, ends_at: null, quantity: 1, max_per_user: 1, _count: { vouchers: 0 } },
  { id: "costly", name: "20%", voucher_type: "DISCOUNT", acquisition_mode: "POINTS_EXCHANGE", points_cost: 15, is_active: true, ends_at: null, quantity: null, max_per_user: 1, _count: { vouchers: 0 } },
] };

describe("Planner staging — dữ liệu động", () => {
  it("đóng cửa là blocker trước login hoặc mua voucher", () => {
    const plan = buildExecutionPlan({ profile: "smoke", catalog: { ...catalog, storeStatus: { is_open: false } }, actors: { customerA: actor } });
    expect(plan.blockers).toContain("STORE_CLOSED");
  });
  it("smoke chọn gói đủ điều kiện ít cá nhất, không hardcode giá", () => {
    const plan = buildExecutionPlan({ profile: "smoke", catalog, actors: { customerA: actor } });
    expect(plan.status).toBe("PASS");
    expect(plan.summary).toMatchObject({ pointsNeeded: 10, voucherTypes: ["DISCOUNT"], runnableCases: ["plain-pickup-cancel", "discount-cancel-reuse-cancel"] });
  });

  it("full báo PARTIAL rõ từng loại voucher và địa chỉ còn thiếu", () => {
    const plan = buildExecutionPlan({ profile: "full", catalog, actors: { customerB: actor } });
    expect(plan.status).toBe("PARTIAL");
    expect(plan.gaps).toContain("VOUCHER_TYPE_MISSING_ITEM");
    expect(plan.gaps).toContain("DELIVERY_ADDRESS_MISSING");
    expect(plan.cases.find(item => item.id === "price-changed")?.runnable).toBe(true);
    expect(plan.cases.find(item => item.id === "voucher-matrix")?.runnable).toBe(false);
  });

  it("smoke fail closed trước khi ghi nếu không còn đủ 3 lượt tạo order trong rate window", () => {
    const plan = buildExecutionPlan({ profile: "smoke", catalog, actors: {
      customerA: { ...actor, recentOrderCount: 3 },
    } });
    expect(plan.blockers).toContain("CUSTOMER_ORDER_RATE_CAPACITY_INSUFFICIENT");
    expect(plan.cases.every(item => !item.runnable)).toBe(true);
  });
});
