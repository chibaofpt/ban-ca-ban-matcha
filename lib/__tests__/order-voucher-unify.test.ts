/**
 * Unit tests for the shared order calculator — calcOrderTotals.
 *
 * Tests the unified pricing pipeline:
 *   PRODUCT → ADDON → DISCOUNT → FREESHIP
 *
 * Pure function, no DB — all inputs are pre-resolved.
 * This file tests the NEW shared calculator that will replace
 * duplicated logic in customer + staff order routes.
 */

import { describe, it, expect } from "vitest";

// ── Import the function under test (will be created in lib/orderCalculator.ts) ──
import {
  calcOrderTotals,
} from "@/lib/orderCalculator";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const PRODUCT_VOUCHER_ID = "pv-001";
const ADDON_VOUCHER_ID = "av-001";
const ADDON_VOUCHER_ID_2 = "av-002";
const DISCOUNT_VOUCHER_ID_FIXED = "dv-fixed-001";
const DISCOUNT_VOUCHER_ID_PERCENT = "dv-pct-001";
const FREESHIP_VOUCHER_ID = "fv-001";
const ADDON_KEM_ID = "addon-kem-111";
const ADDON_EXTRA_MATCHA_ID = "addon-extra-222";
const ADDON_DA_DUA_ID = "addon-dadua-333";
const MENU_ITEM_ID = "item-latte-001";

/** Helper: tạo một processed item đơn giản */
function makeItem(overrides: {
  unit_price_vnd?: number;
  addons_price_vnd?: number;
  quantity?: number;
  menu_item_id?: string;
  product_voucher_id?: string | null;
  product_voucher_covered_vnd?: number;
  addon_vouchers?: Array<{
    voucher_id: string;
    addon_option_id: string;
    covered_price_vnd: number;
    gram_value?: number | null;
  }>;
}) {
  const unit_price = overrides.unit_price_vnd ?? 70000;
  const addons_price = overrides.addons_price_vnd ?? 0;
  const qty = overrides.quantity ?? 1;

  return {
    menu_item_id: overrides.menu_item_id ?? MENU_ITEM_ID,
    unit_price_vnd: unit_price,
    addons_price_vnd: addons_price,
    quantity: qty,
    line_total: (unit_price + addons_price) * qty,
    product_voucher_id: overrides.product_voucher_id ?? null,
    product_voucher_covered_vnd: overrides.product_voucher_covered_vnd ?? 0,
    addon_vouchers: overrides.addon_vouchers ?? [],
  };
}

/** Helper: tạo DISCOUNT voucher config */
function makeDiscountVoucher(overrides: {
  id?: string;
  discount_type: "FIXED" | "PERCENT";
  discount_value: number;
  min_order_vnd?: number | null;
}) {
  return {
    id: overrides.id ?? DISCOUNT_VOUCHER_ID_FIXED,
    discount_type: overrides.discount_type,
    discount_value: overrides.discount_value,
    min_order_vnd: overrides.min_order_vnd ?? null,
  };
}

/** Helper: tạo FREESHIP voucher config */
function makeFreeshipVoucher(overrides?: {
  id?: string;
  covered_delivery_fee_vnd?: number;
  min_order_vnd?: number | null;
}) {
  return {
    id: overrides?.id ?? FREESHIP_VOUCHER_ID,
    covered_delivery_fee_vnd: overrides?.covered_delivery_fee_vnd ?? 15000,
    min_order_vnd: overrides?.min_order_vnd ?? null,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("calcOrderTotals — bộ tính tiền thống nhất", () => {
  // ── PRODUCT credit ──────────────────────────────────────────────────────────

  describe("PRODUCT credit — chỉ giảm giá nước", () => {
    it("PRODUCT 60k áp vào nước 70k + addon 20k → chỉ giảm 60k trên nước, addon vẫn 20k", () => {
      const result = calcOrderTotals({
        items: [
          makeItem({
            unit_price_vnd: 70000,
            addons_price_vnd: 20000,
            product_voucher_id: PRODUCT_VOUCHER_ID,
            product_voucher_covered_vnd: 60000,
          }),
        ],
        discountVouchers: [],
        freeshipVoucher: null,
        shipping_fee_vnd: 0,
      });

      // PRODUCT giảm 60k trên nước, nước trả 10k, addon trả 20k
      expect(result.items_discount_vnd).toBe(60000);
      // Subtotal = 70k + 20k = 90k
      expect(result.subtotal_vnd).toBe(90000);
      // total_vnd = 90k - 60k = 30k (chỉ PRODUCT discount, addon vẫn nguyên)
      expect(result.total_vnd).toBe(30000);
    });

    it("PRODUCT covered > unit_price → giảm tối đa unit_price, không spill vào addon", () => {
      const result = calcOrderTotals({
        items: [
          makeItem({
            unit_price_vnd: 70000,
            addons_price_vnd: 20000,
            product_voucher_id: PRODUCT_VOUCHER_ID,
            product_voucher_covered_vnd: 100000, // 100k > 70k drink
          }),
        ],
        discountVouchers: [],
        freeshipVoucher: null,
        shipping_fee_vnd: 0,
      });

      // PRODUCT chỉ giảm 70k (drink price), không spill 30k vào addon
      expect(result.items_discount_vnd).toBe(70000);
      // total_vnd = 90k - 70k = 20k (chỉ addon)
      expect(result.total_vnd).toBe(20000);
    });

    it("PRODUCT covered < unit_price → giảm đúng covered, khách trả phần chênh", () => {
      const result = calcOrderTotals({
        items: [
          makeItem({
            unit_price_vnd: 70000,
            addons_price_vnd: 0,
            product_voucher_id: PRODUCT_VOUCHER_ID,
            product_voucher_covered_vnd: 45000,
          }),
        ],
        discountVouchers: [],
        freeshipVoucher: null,
        shipping_fee_vnd: 0,
      });

      expect(result.items_discount_vnd).toBe(45000);
      expect(result.total_vnd).toBe(25000);
    });

    it("PRODUCT covered = 0 và không tạo surplus → voucher không có benefit", () => {
      const result = calcOrderTotals({
        items: [
          makeItem({
            unit_price_vnd: 70000,
            product_voucher_id: PRODUCT_VOUCHER_ID,
            product_voucher_covered_vnd: 0,
          }),
        ],
        discountVouchers: [],
        freeshipVoucher: null,
        shipping_fee_vnd: 0,
      });

      expect(result.items_discount_vnd).toBe(0);
      // Voucher with zero benefit should be in skipped list
      expect(result.skippedVoucherIds).toContain(PRODUCT_VOUCHER_ID);
    });
  });

  // ── ADDON voucher ─────────────────────────────────────────────────────────

  describe("ADDON voucher", () => {
    it("Hai ADDON voucher khác addon_option_id → áp được cả hai", () => {
      const result = calcOrderTotals({
        items: [
          makeItem({
            unit_price_vnd: 70000,
            addons_price_vnd: 25000, // kem 15k + đá dừa 10k
            addon_vouchers: [
              { voucher_id: ADDON_VOUCHER_ID, addon_option_id: ADDON_KEM_ID, covered_price_vnd: 15000 },
              { voucher_id: ADDON_VOUCHER_ID_2, addon_option_id: ADDON_DA_DUA_ID, covered_price_vnd: 10000 },
            ],
          }),
        ],
        discountVouchers: [],
        freeshipVoucher: null,
        shipping_fee_vnd: 0,
      });

      // Cả hai addon giảm: 15k + 10k = 25k
      expect(result.items_discount_vnd).toBe(25000);
      expect(result.total_vnd).toBe(70000); // chỉ còn nước
    });

    it("Hai ADDON voucher cùng addon_option_id → chặn trùng lặp", () => {
      // This should be caught at validation layer before calculator,
      // but calculator should handle gracefully
      const result = calcOrderTotals({
        items: [
          makeItem({
            unit_price_vnd: 70000,
            addons_price_vnd: 15000,
            addon_vouchers: [
              { voucher_id: ADDON_VOUCHER_ID, addon_option_id: ADDON_KEM_ID, covered_price_vnd: 15000 },
              { voucher_id: ADDON_VOUCHER_ID_2, addon_option_id: ADDON_KEM_ID, covered_price_vnd: 15000 },
            ],
          }),
        ],
        discountVouchers: [],
        freeshipVoucher: null,
        shipping_fee_vnd: 0,
      });

      // Chỉ áp 1 voucher = 15k, voucher thứ 2 bị skip
      expect(result.items_discount_vnd).toBe(15000);
      expect(result.skippedVoucherIds).toContain(ADDON_VOUCHER_ID_2);
    });

    it("ADDON voucher áp vào Extra Matcha (gram_value > 0) → bị chặn", () => {
      const result = calcOrderTotals({
        items: [
          makeItem({
            unit_price_vnd: 70000,
            addons_price_vnd: 12000,
            addon_vouchers: [
              {
                voucher_id: ADDON_VOUCHER_ID,
                addon_option_id: ADDON_EXTRA_MATCHA_ID,
                covered_price_vnd: 12000,
                gram_value: 2, // Extra Matcha
              },
            ],
          }),
        ],
        discountVouchers: [],
        freeshipVoucher: null,
        shipping_fee_vnd: 0,
      });

      // Extra Matcha bị chặn → không giảm
      expect(result.items_discount_vnd).toBe(0);
      expect(result.skippedVoucherIds).toContain(ADDON_VOUCHER_ID);
    });

    it("ADDON voucher giá 0 → không có benefit, không consume", () => {
      const result = calcOrderTotals({
        items: [
          makeItem({
            unit_price_vnd: 70000,
            addons_price_vnd: 0, // addon miễn phí
            addon_vouchers: [
              { voucher_id: ADDON_VOUCHER_ID, addon_option_id: ADDON_KEM_ID, covered_price_vnd: 0 },
            ],
          }),
        ],
        discountVouchers: [],
        freeshipVoucher: null,
        shipping_fee_vnd: 0,
      });

      expect(result.items_discount_vnd).toBe(0);
      expect(result.skippedVoucherIds).toContain(ADDON_VOUCHER_ID);
    });
  });

  // ── DISCOUNT ──────────────────────────────────────────────────────────────

  describe("DISCOUNT — min_order_vnd trên discountable_subtotal", () => {
    it("Gross subtotal đạt minimum nhưng discountable_subtotal không đạt → MIN_ORDER_NOT_MET", () => {
      // Gross = 150k, PRODUCT giảm 70k → discountable = 80k
      // Voucher minimum = 100k → phải bị reject
      const result = calcOrderTotals({
        items: [
          makeItem({
            unit_price_vnd: 130000,
            addons_price_vnd: 20000,
            product_voucher_id: PRODUCT_VOUCHER_ID,
            product_voucher_covered_vnd: 70000,
          }),
        ],
        discountVouchers: [
          makeDiscountVoucher({
            discount_type: "FIXED",
            discount_value: 20000,
            min_order_vnd: 100000,
          }),
        ],
        freeshipVoucher: null,
        shipping_fee_vnd: 0,
      });

      // DISCOUNT bị skip vì discountable_subtotal (80k) < min_order_vnd (100k)
      expect(result.total_voucher_discount_vnd).toBe(0);
      expect(result.skippedVoucherIds).toContain(DISCOUNT_VOUCHER_ID_FIXED);
    });

    it("Discountable_subtotal đạt minimum → áp DISCOUNT thành công", () => {
      const result = calcOrderTotals({
        items: [
          makeItem({
            unit_price_vnd: 100000,
            addons_price_vnd: 20000,
            product_voucher_id: PRODUCT_VOUCHER_ID,
            product_voucher_covered_vnd: 20000,
          }),
        ],
        discountVouchers: [
          makeDiscountVoucher({
            discount_type: "FIXED",
            discount_value: 10000,
            min_order_vnd: 100000,
          }),
        ],
        freeshipVoucher: null,
        shipping_fee_vnd: 0,
      });

      // discountable = 120k - 20k = 100k ≥ 100k → áp được
      expect(result.total_voucher_discount_vnd).toBe(10000);
    });

    it("FIXED 20k + PERCENT 10% trên discountable 100k → giảm 28k", () => {
      const result = calcOrderTotals({
        items: [makeItem({ unit_price_vnd: 100000 })],
        discountVouchers: [
          makeDiscountVoucher({
            id: DISCOUNT_VOUCHER_ID_FIXED,
            discount_type: "FIXED",
            discount_value: 20000,
          }),
          makeDiscountVoucher({
            id: DISCOUNT_VOUCHER_ID_PERCENT,
            discount_type: "PERCENT",
            discount_value: 10,
          }),
        ],
        freeshipVoucher: null,
        shipping_fee_vnd: 0,
      });

      // FIXED 20k → remaining 80k → PERCENT 10% of 80k = 8k → total 28k
      expect(result.total_voucher_discount_vnd).toBe(28000);
      expect(result.total_vnd).toBe(72000);
    });

    it("PERCENT làm tròn xuống bội 1000: 10% × 80k = 8k → đúng 8k", () => {
      const result = calcOrderTotals({
        items: [makeItem({ unit_price_vnd: 80000 })],
        discountVouchers: [
          makeDiscountVoucher({
            discount_type: "PERCENT",
            discount_value: 10,
          }),
        ],
        freeshipVoucher: null,
        shipping_fee_vnd: 0,
      });

      // 10% × 80k = 8k (already a multiple of 1000, no rounding needed)
      expect(result.total_voucher_discount_vnd).toBe(8000);
    });

    it("DISCOUNT khi subtotal đã = 0 → voucher không có benefit, giữ ACTIVE", () => {
      const result = calcOrderTotals({
        items: [
          makeItem({
            unit_price_vnd: 70000,
            product_voucher_id: PRODUCT_VOUCHER_ID,
            product_voucher_covered_vnd: 70000,
          }),
        ],
        discountVouchers: [
          makeDiscountVoucher({
            discount_type: "FIXED",
            discount_value: 20000,
          }),
        ],
        freeshipVoucher: null,
        shipping_fee_vnd: 0,
      });

      // discountable = 0 → DISCOUNT benefit = 0
      expect(result.total_voucher_discount_vnd).toBe(0);
      expect(result.skippedVoucherIds).toContain(DISCOUNT_VOUCHER_ID_FIXED);
    });

    it("Nhiều FIXED: áp theo thứ tự array, mỗi FIXED giảm trên remaining", () => {
      const result = calcOrderTotals({
        items: [makeItem({ unit_price_vnd: 100000 })],
        discountVouchers: [
          makeDiscountVoucher({ id: "dv-1", discount_type: "FIXED", discount_value: 20000 }),
          makeDiscountVoucher({ id: "dv-2", discount_type: "FIXED", discount_value: 30000 }),
        ],
        freeshipVoucher: null,
        shipping_fee_vnd: 0,
      });

      // 20k + 30k = 50k
      expect(result.total_voucher_discount_vnd).toBe(50000);
      expect(result.total_vnd).toBe(50000);
    });

    it("PERCENT làm tròn còn 0 → voucher không có benefit", () => {
      // 10% of 5000 = 500 → floor to 1000 = 0
      const result = calcOrderTotals({
        items: [makeItem({ unit_price_vnd: 5000 })],
        discountVouchers: [
          makeDiscountVoucher({
            discount_type: "PERCENT",
            discount_value: 10,
          }),
        ],
        freeshipVoucher: null,
        shipping_fee_vnd: 0,
      });

      expect(result.total_voucher_discount_vnd).toBe(0);
      expect(result.skippedVoucherIds).toContain(DISCOUNT_VOUCHER_ID_FIXED);
    });

    it("Defensive calculator: chỉ áp dụng PERCENT đầu tiên, bỏ qua PERCENT thứ hai", () => {
      const result = calcOrderTotals({
        items: [makeItem({ unit_price_vnd: 100000 })],
        discountVouchers: [
          makeDiscountVoucher({
            id: "dv-pct-first",
            discount_type: "PERCENT",
            discount_value: 10,
          }),
          makeDiscountVoucher({
            id: "dv-pct-second",
            discount_type: "PERCENT",
            discount_value: 20,
          }),
        ],
        freeshipVoucher: null,
        shipping_fee_vnd: 0,
      });

      expect(result.total_voucher_discount_vnd).toBe(10000);
      expect(result.appliedVoucherIds).toContain("dv-pct-first");
      expect(result.skippedVoucherIds).toContain("dv-pct-second");
    });
  });

  // ── FREESHIP ──────────────────────────────────────────────────────────────

  describe("FREESHIP — min_order_vnd trên total_vnd", () => {
    it("FREESHIP min_order check trên total_vnd sau tất cả voucher, không trên gross", () => {
      const result = calcOrderTotals({
        items: [
          makeItem({
            unit_price_vnd: 100000,
            product_voucher_id: PRODUCT_VOUCHER_ID,
            product_voucher_covered_vnd: 60000,
          }),
        ],
        discountVouchers: [],
        freeshipVoucher: makeFreeshipVoucher({ min_order_vnd: 50000 }),
        shipping_fee_vnd: 25000,
      });

      // total_vnd = 100k - 60k = 40k < 50k min → FREESHIP bị skip
      expect(result.freeship_discount_vnd).toBe(0);
      expect(result.skippedVoucherIds).toContain(FREESHIP_VOUCHER_ID);
    });

    it("FREESHIP giá ship = 0 → không có benefit, không consume", () => {
      const result = calcOrderTotals({
        items: [makeItem({ unit_price_vnd: 70000 })],
        discountVouchers: [],
        freeshipVoucher: makeFreeshipVoucher(),
        shipping_fee_vnd: 0,
      });

      expect(result.freeship_discount_vnd).toBe(0);
      expect(result.skippedVoucherIds).toContain(FREESHIP_VOUCHER_ID);
    });

    it("FREESHIP covered > ship → chỉ giảm bằng ship", () => {
      const result = calcOrderTotals({
        items: [makeItem({ unit_price_vnd: 70000 })],
        discountVouchers: [],
        freeshipVoucher: makeFreeshipVoucher({ covered_delivery_fee_vnd: 50000 }),
        shipping_fee_vnd: 25000,
      });

      // Giảm 25k (= ship), không phải 50k (= covered)
      expect(result.freeship_discount_vnd).toBe(25000);
      expect(result.grand_total_vnd).toBe(70000); // 70k + 25k - 25k
    });
  });

  // ── Kịch bản tổng hợp ─────────────────────────────────────────────────────

  describe("Kịch bản tổng hợp — end-to-end", () => {
    it("Subtotal 170k, PRODUCT+ADDON 70k, FIXED 20k, PERCENT 10%, ship 25k, FREESHIP 15k → grand_total 82k", () => {
      const result = calcOrderTotals({
        items: [
          makeItem({
            unit_price_vnd: 100000,
            addons_price_vnd: 20000,
            product_voucher_id: PRODUCT_VOUCHER_ID,
            product_voucher_covered_vnd: 50000,
            addon_vouchers: [
              { voucher_id: ADDON_VOUCHER_ID, addon_option_id: ADDON_KEM_ID, covered_price_vnd: 20000 },
            ],
          }),
          makeItem({ unit_price_vnd: 50000 }),
        ],
        discountVouchers: [
          makeDiscountVoucher({ id: DISCOUNT_VOUCHER_ID_FIXED, discount_type: "FIXED", discount_value: 20000 }),
          makeDiscountVoucher({ id: DISCOUNT_VOUCHER_ID_PERCENT, discount_type: "PERCENT", discount_value: 10 }),
        ],
        freeshipVoucher: makeFreeshipVoucher({ covered_delivery_fee_vnd: 15000 }),
        shipping_fee_vnd: 25000,
      });

      expect(result.subtotal_vnd).toBe(170000);
      expect(result.items_discount_vnd).toBe(70000); // PRODUCT 50k + ADDON 20k
      expect(result.discountable_subtotal_vnd).toBe(100000);
      expect(result.total_voucher_discount_vnd).toBe(28000); // FIXED 20k + PERCENT 8k
      expect(result.total_vnd).toBe(72000);
      expect(result.shipping_fee_vnd).toBe(25000);
      expect(result.freeship_discount_vnd).toBe(15000);
      expect(result.grand_total_vnd).toBe(82000);
    });

    it("total_vnd = 72k, points = floor(72k/10k) = 7, không tính ship", () => {
      const result = calcOrderTotals({
        items: [makeItem({ unit_price_vnd: 72000 })],
        discountVouchers: [],
        freeshipVoucher: null,
        shipping_fee_vnd: 25000,
      });

      // Points based on total_vnd, NOT grand_total_vnd
      expect(result.total_vnd).toBe(72000);
      expect(result.grand_total_vnd).toBe(97000);
      // Points helper is separate but calculator should expose total_vnd for it
    });

    it("Voucher thứ hai không tạo incremental benefit → giữ ACTIVE, không link", () => {
      const result = calcOrderTotals({
        items: [
          makeItem({
            unit_price_vnd: 30000,
            product_voucher_id: PRODUCT_VOUCHER_ID,
            product_voucher_covered_vnd: 30000, // covers entirely
          }),
        ],
        discountVouchers: [
          makeDiscountVoucher({ id: "dv-1", discount_type: "FIXED", discount_value: 20000 }),
          makeDiscountVoucher({ id: "dv-2", discount_type: "FIXED", discount_value: 10000 }),
        ],
        freeshipVoucher: null,
        shipping_fee_vnd: 0,
      });

      // discountable = 30k - 30k = 0 → both DISCOUNT have no benefit
      expect(result.total_voucher_discount_vnd).toBe(0);
      expect(result.skippedVoucherIds).toContain("dv-1");
      expect(result.skippedVoucherIds).toContain("dv-2");
    });
  });

  // ── No-benefit rule ───────────────────────────────────────────────────────

  describe("No-benefit rule — tất cả voucher types", () => {
    it("PRODUCT voucher có benefit khi tạo discount hoặc surplus dương", () => {
      const result = calcOrderTotals({
        items: [
          makeItem({
            unit_price_vnd: 50000,
            product_voucher_id: PRODUCT_VOUCHER_ID,
            product_voucher_covered_vnd: 60000, // surplus = 10k
          }),
        ],
        discountVouchers: [],
        freeshipVoucher: null,
        shipping_fee_vnd: 0,
      });

      // PRODUCT giảm 50k (drink), surplus 10k → has benefit
      expect(result.appliedVoucherIds).toContain(PRODUCT_VOUCHER_ID);
      expect(result.skippedVoucherIds).not.toContain(PRODUCT_VOUCHER_ID);
    });

    it("PRODUCT voucher không có benefit khi covered = 0 và surplus = 0", () => {
      const result = calcOrderTotals({
        items: [
          makeItem({
            unit_price_vnd: 70000,
            product_voucher_id: PRODUCT_VOUCHER_ID,
            product_voucher_covered_vnd: 0,
          }),
        ],
        discountVouchers: [],
        freeshipVoucher: null,
        shipping_fee_vnd: 0,
      });

      expect(result.skippedVoucherIds).toContain(PRODUCT_VOUCHER_ID);
    });

    it("DISCOUNT FIXED áp sau khi total đã = 0 → không có benefit", () => {
      const result = calcOrderTotals({
        items: [
          makeItem({
            unit_price_vnd: 50000,
            product_voucher_id: PRODUCT_VOUCHER_ID,
            product_voucher_covered_vnd: 50000,
          }),
        ],
        discountVouchers: [
          makeDiscountVoucher({ discount_type: "FIXED", discount_value: 10000 }),
        ],
        freeshipVoucher: null,
        shipping_fee_vnd: 0,
      });

      expect(result.total_voucher_discount_vnd).toBe(0);
      expect(result.skippedVoucherIds).toContain(DISCOUNT_VOUCHER_ID_FIXED);
    });

    it("FREESHIP khi ship = 0 hoặc covered = 0 → không có benefit", () => {
      const result = calcOrderTotals({
        items: [makeItem({ unit_price_vnd: 70000 })],
        discountVouchers: [],
        freeshipVoucher: makeFreeshipVoucher({ covered_delivery_fee_vnd: 0 }),
        shipping_fee_vnd: 25000,
      });

      expect(result.freeship_discount_vnd).toBe(0);
      expect(result.skippedVoucherIds).toContain(FREESHIP_VOUCHER_ID);
    });
  });

  // ── PRODUCT surplus output (WP2) ────────────────────────────────────────────

  describe("order_surplus_vnd — aggregate PRODUCT surplus", () => {
    it("trả order_surplus_vnd = sum(max(covered - drink, 0)) cho applied PRODUCT vouchers", () => {
      // 2 items: covered 77k on 70k drink (surplus 7k), covered 56k on 50k drink (surplus 6k)
      const result = calcOrderTotals({
        items: [
          makeItem({
            unit_price_vnd: 70000,
            product_voucher_id: "pv-1",
            product_voucher_covered_vnd: 77000,
          }),
          makeItem({
            unit_price_vnd: 50000,
            product_voucher_id: "pv-2",
            product_voucher_covered_vnd: 56000,
            menu_item_id: "item-2",
          }),
        ],
        discountVouchers: [],
        freeshipVoucher: null,
        shipping_fee_vnd: 0,
      });

      // Aggregate: 7k + 6k = 13k
      expect(result.order_surplus_vnd).toBe(13000);
    });

    it("order_surplus_vnd = 0 khi không có PRODUCT voucher", () => {
      const result = calcOrderTotals({
        items: [makeItem({ unit_price_vnd: 70000 })],
        discountVouchers: [],
        freeshipVoucher: null,
        shipping_fee_vnd: 0,
      });

      expect(result.order_surplus_vnd).toBe(0);
    });

    it("PRODUCT covered < drink → no surplus, order_surplus_vnd = 0", () => {
      const result = calcOrderTotals({
        items: [
          makeItem({
            unit_price_vnd: 70000,
            product_voucher_id: PRODUCT_VOUCHER_ID,
            product_voucher_covered_vnd: 50000,
          }),
        ],
        discountVouchers: [],
        freeshipVoucher: null,
        shipping_fee_vnd: 0,
      });

      expect(result.order_surplus_vnd).toBe(0);
    });

    it("PRODUCT skipped (zero benefit) → không tính vào surplus", () => {
      // covered = 0 → skipped → no surplus
      const result = calcOrderTotals({
        items: [
          makeItem({
            unit_price_vnd: 70000,
            product_voucher_id: PRODUCT_VOUCHER_ID,
            product_voucher_covered_vnd: 0,
          }),
        ],
        discountVouchers: [],
        freeshipVoucher: null,
        shipping_fee_vnd: 0,
      });

      expect(result.order_surplus_vnd).toBe(0);
      expect(result.skippedVoucherIds).toContain(PRODUCT_VOUCHER_ID);
    });
  });

  describe("voucher application details", () => {
    it("returns per-item results so routes only persist and consume beneficial vouchers", () => {
      const result = calcOrderTotals({
        items: [
          makeItem({
            unit_price_vnd: 70000,
            addons_price_vnd: 15000,
            product_voucher_id: PRODUCT_VOUCHER_ID,
            product_voucher_covered_vnd: 80000,
            addon_vouchers: [
              {
                voucher_id: ADDON_VOUCHER_ID,
                addon_option_id: ADDON_KEM_ID,
                covered_price_vnd: 15000,
              },
              {
                voucher_id: ADDON_VOUCHER_ID_2,
                addon_option_id: ADDON_EXTRA_MATCHA_ID,
                covered_price_vnd: 10000,
                gram_value: 1,
              },
            ],
          }),
        ],
        discountVouchers: [],
        freeshipVoucher: null,
        shipping_fee_vnd: 0,
      });

      expect(result.itemResults).toEqual([
        {
          product_voucher_id: PRODUCT_VOUCHER_ID,
          product_voucher_discount_vnd: 70000,
          addon_vouchers: [
            {
              voucher_id: ADDON_VOUCHER_ID,
              addon_option_id: ADDON_KEM_ID,
              discount_applied_vnd: 15000,
            },
          ],
          total_discount_vnd: 85000,
        },
      ]);
      expect(result.skippedVoucherIds).toContain(ADDON_VOUCHER_ID_2);
    });
  });
});
