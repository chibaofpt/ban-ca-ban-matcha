import { describe, it, expect } from "vitest";
import { calcShippingFee, calcFreeshipDiscount } from "@/src/utils/pricing";

describe("Delivery calculation utilities", () => {
  describe("calcShippingFee", () => {
    it("calcShippingFee: 0km -> 0", () => {
      expect(calcShippingFee(0)).toBe(0);
      expect(calcShippingFee(-1)).toBe(0);
    });

    it("calcShippingFee: <= 2km -> 15k * 85% = 12.75k -> ceil 1000 -> 13k", () => {
      expect(calcShippingFee(0.5)).toBe(13000);
      expect(calcShippingFee(1)).toBe(13000);
      expect(calcShippingFee(2)).toBe(13000);
    });

    it("calcShippingFee: > 2km -> tính đúng công thức * 85%", () => {
      // 2km = 15k, extra = 1km * 5.7k = 5.7k -> 20.7k * 0.85 = 17595 -> ceil 1000 -> 18k
      expect(calcShippingFee(3)).toBe(18000);
      
      // 2km = 15k, extra = 1.5km * 5.7k = 8.55k -> 23.55k * 0.85 = 20017.5 -> ceil 1000 -> 21k
      expect(calcShippingFee(3.5)).toBe(21000);
      
      // 10km: 2km = 15k, extra = 8km * 5.7k = 45.6k -> 60.6k * 0.85 = 51510 -> ceil 1000 -> 52k
      expect(calcShippingFee(10)).toBe(52000);
    });
  });

  describe("calcFreeshipDiscount", () => {
    it("calcFreeshipDiscount: phí ship < voucher cover -> giảm tối đa bằng phí ship", () => {
      // Shipping is 15k, voucher covers 20k -> discount is 15k (we don't pay customer extra)
      expect(calcFreeshipDiscount(15000, 20000)).toBe(15000);
    });

    it("calcFreeshipDiscount: phí ship > voucher cover -> giảm đúng số tiền cover", () => {
      // Shipping is 30k, voucher covers 20k -> discount is 20k
      expect(calcFreeshipDiscount(30000, 20000)).toBe(20000);
    });

    it("calcFreeshipDiscount: phí ship bằng voucher cover -> giảm hết", () => {
      expect(calcFreeshipDiscount(15000, 15000)).toBe(15000);
    });
  });
});
