import { describe, expect, it } from "vitest";
import type { AcquiredVoucher, MyVoucher } from "@/src/services/customerVoucherService";
import {
  createVoucherAcquisitionCoordinator,
  type VoucherAcquisitionGateway,
  type VoucherAcquisitionRequest,
} from "@/src/lib/utils/voucherAcquisitionState";

const acquired: AcquiredVoucher = {
  qr_token: "qr-new",
  voucher_type: "BUNDLE",
  status: "ACTIVE",
  expires_at: null,
  already_granted: false,
};

const walletVoucher: MyVoucher = {
  package_id: "package-1",
  qr_token: acquired.qr_token,
  voucher_type: "BUNDLE",
  discount_type: null,
  discount_value: null,
  menu_item_id: null,
  size: null,
  matcha_powder_id: null,
  milk_type_id: null,
  included_addon_option_ids: [],
  addon_option_id: null,
  covered_price_vnd: null,
  covered_delivery_fee_vnd: null,
  min_order_vnd: null,
  max_discount_vnd: null,
  status: "ACTIVE",
  used_channel: null,
  expires_at: null,
  redeemed_at: null,
  created_at: "2026-09-07T00:00:00.000Z",
  package: {
    name: "Bundle mới",
    description: null,
    points_cost: 20,
  },
  menuItem: null,
  addonOption: null,
  staff: null,
  availability: {
    status: "USABLE",
    can_apply: true,
    can_refund: false,
    refund_points: 0,
  },
};

function makeGateway(overrides: Partial<VoucherAcquisitionGateway> = {}): VoucherAcquisitionGateway {
  return {
    claimFreeVoucher: async () => acquired,
    exchangeVoucher: async () => acquired,
    refreshWallet: async () => [walletVoucher],
    ...overrides,
  };
}

const request = { id: "package-1", acquisition_mode: "POINTS_EXCHANGE" } satisfies VoucherAcquisitionRequest;

describe("voucher acquisition coordinator", () => {
  it("shares one in-flight request even when a second package is requested", async () => {
    let exchangeCalls = 0;
    let releaseRefresh: () => void = () => undefined;
    const refreshWallet = () => new Promise<MyVoucher[]>((resolve) => {
      releaseRefresh = () => resolve([walletVoucher]);
    });
    const coordinator = createVoucherAcquisitionCoordinator(makeGateway({
      exchangeVoucher: async () => {
        exchangeCalls += 1;
        return acquired;
      },
      refreshWallet,
    }));

    const first = coordinator.acquire(request);
    const second = coordinator.acquire({ id: "package-2", acquisition_mode: "FREE_CLAIM" });
    expect(first).toBe(second);
    expect(exchangeCalls).toBe(1);
    await Promise.resolve();
    releaseRefresh();
    expect((await second).acquired.qr_token).toBe(acquired.qr_token);
  });

  it("retains the successful receipt when refresh fails and retries refresh only", async () => {
    let exchangeCalls = 0;
    let refreshCalls = 0;
    const coordinator = createVoucherAcquisitionCoordinator(makeGateway({
      exchangeVoucher: async () => {
        exchangeCalls += 1;
        return acquired;
      },
      refreshWallet: async () => {
        refreshCalls += 1;
        if (refreshCalls === 1) throw new Error("wallet unavailable");
        return [walletVoucher];
      },
    }));

    const first = await coordinator.acquire(request);
    expect(first.acquired.qr_token).toBe(acquired.qr_token);
    expect(first.wallet).toBeNull();
    expect(first.refreshError?.message).toBe("wallet unavailable");

    const retried = await coordinator.retryRefresh();
    expect(retried?.wallet?.[0]?.qr_token).toBe(acquired.qr_token);
    expect(retried?.refreshError).toBeNull();
    expect(exchangeCalls).toBe(1);
    expect(refreshCalls).toBe(2);
  });

  it("keeps catalog refresh best-effort after successful exchange", async () => {
    let refreshWalletCalls = 0;
    const coordinator = createVoucherAcquisitionCoordinator(makeGateway({
      refreshCatalog: async () => { throw new Error("catalog unavailable"); },
      refreshWallet: async () => {
        refreshWalletCalls += 1;
        return [walletVoucher];
      },
    }));

    const result = await coordinator.acquire(request);
    expect(result.acquired.qr_token).toBe(acquired.qr_token);
    expect(result.refreshError).toBeNull();
    expect(refreshWalletCalls).toBe(1);
  });

  it("does not create a receipt or refresh the wallet when exchange fails", async () => {
    let refreshWalletCalls = 0;
    const coordinator = createVoucherAcquisitionCoordinator(makeGateway({
      exchangeVoucher: async () => { throw new Error("exchange failed"); },
      refreshWallet: async () => {
        refreshWalletCalls += 1;
        return [walletVoucher];
      },
    }));

    await expect(coordinator.acquire(request)).rejects.toThrow("exchange failed");
    expect(coordinator.getReceipt()).toBeNull();
    expect(refreshWalletCalls).toBe(0);
  });
});
