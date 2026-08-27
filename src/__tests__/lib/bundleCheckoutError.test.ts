import { describe, expect, it } from "vitest";
import {
  findUnavailableBundleTokens,
  getBundleCheckoutAvailabilityReason,
  getReadyBundleApplications,
  hasBlockingBundleApplication,
  isBundleAvailabilityReason,
} from "@/src/lib/utils/bundleCheckoutError";

describe("Nhận diện lỗi live availability khi checkout", () => {
  it("nhận normalized BUSINESS_RULE_VIOLATION từ customer/staff", () => {
    const error = {
      response: {
        status: 422,
        data: {
          code: "BUSINESS_RULE_VIOLATION",
          details: { reason: "NO_ACTIVE_CONFIGURATION" },
        },
      },
    };
    expect(getBundleCheckoutAvailabilityReason(error)).toBe("NO_ACTIVE_CONFIGURATION");
  });

  it("giữ bridge cho BUNDLE_NOT_ELIGIBLE trong giai đoạn deploy", () => {
    const error = {
      response: {
        status: 422,
        data: { code: "BUNDLE_NOT_ELIGIBLE", details: { reason: "NO_ACTIVE_REWARD" } },
      },
    };
    expect(getBundleCheckoutAvailabilityReason(error)).toBe("NO_ACTIVE_REWARD");
  });

  it("không hiểu BUSINESS_RULE_VIOLATION khác là lỗi availability", () => {
    expect(getBundleCheckoutAvailabilityReason({
      response: {
        status: 422,
        data: { code: "BUSINESS_RULE_VIOLATION", details: { reason: "ORDER_VALUE_EXCEEDED" } },
      },
    })).toBeNull();
    expect(isBundleAvailabilityReason("ORDER_VALUE_EXCEEDED")).toBe(false);
  });

  it("chỉ nhận diện token bị unusable hoặc biến mất sau refetch", () => {
    expect(findUnavailableBundleTokens(
      ["bundle-a", "bundle-b", "bundle-missing"],
      [
        { qr_token: "bundle-a", availability: { can_apply: false } },
        { qr_token: "bundle-b", availability: { can_apply: true } },
      ],
    )).toEqual(["bundle-a", "bundle-missing"]);
  });

  it("persisted UNAVAILABLE hoặc VERIFY_FAILED luôn chặn checkout dù projection READY", () => {
    expect(hasBlockingBundleApplication([
      { status: "READY" },
      { status: "UNAVAILABLE" },
    ])).toBe(true);
    expect(hasBlockingBundleApplication([{ status: "VERIFY_FAILED" }])).toBe(true);
    expect(hasBlockingBundleApplication([{ status: "READY" }])).toBe(false);
  });

  it("payload customer/staff chỉ nhận application persisted READY", () => {
    const applications = [
      { voucher_qr_token: "bundle-ready", status: "READY" },
      { voucher_qr_token: "bundle-unavailable", status: "UNAVAILABLE" },
      { voucher_qr_token: "bundle-verify-failed", status: "VERIFY_FAILED" },
    ];
    expect(getReadyBundleApplications(applications).map((application) => application.voucher_qr_token))
      .toEqual(["bundle-ready"]);
  });
});
