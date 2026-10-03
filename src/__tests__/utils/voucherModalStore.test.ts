import { beforeEach, describe, expect, it } from "vitest";
import { useVoucherModalStore } from "@/src/lib/store/voucherModalStore";

describe("voucher modal use-now handoff", () => {
  beforeEach(() => {
    useVoucherModalStore.setState({ open: false, requestedUseNowVoucherToken: null, useNowRequestVersion: 0 });
  });

  it("mở ví và giữ token voucher được yêu cầu", () => {
    useVoucherModalStore.getState().requestUseNowVoucher("welcome-token");

    expect(useVoucherModalStore.getState()).toMatchObject({
      open: true,
      requestedUseNowVoucherToken: "welcome-token",
    });
  });

  it("chỉ cho consumer nhận đúng request hiện tại một lần", () => {
    useVoucherModalStore.getState().requestUseNowVoucher("first-token");
    useVoucherModalStore.getState().requestUseNowVoucher("replacement-token");

    const currentVersion = useVoucherModalStore.getState().useNowRequestVersion;
    expect(useVoucherModalStore.getState().claimUseNowVoucherRequest("first-token", currentVersion)).toBe(false);
    expect(useVoucherModalStore.getState().requestedUseNowVoucherToken).toBe("replacement-token");
    expect(useVoucherModalStore.getState().claimUseNowVoucherRequest("replacement-token", currentVersion)).toBe(true);
    expect(useVoucherModalStore.getState().requestedUseNowVoucherToken).toBeNull();
    expect(useVoucherModalStore.getState().claimUseNowVoucherRequest("replacement-token", currentVersion)).toBe(false);
  });

  it("không cho request cùng token cũ claim thay request mới", () => {
    useVoucherModalStore.getState().requestUseNowVoucher("same-token");
    const firstVersion = useVoucherModalStore.getState().useNowRequestVersion;
    useVoucherModalStore.getState().requestUseNowVoucher("same-token");
    const replacementVersion = useVoucherModalStore.getState().useNowRequestVersion;

    expect(useVoucherModalStore.getState().claimUseNowVoucherRequest("same-token", firstVersion)).toBe(false);
    expect(useVoucherModalStore.getState().requestedUseNowVoucherToken).toBe("same-token");
    expect(useVoucherModalStore.getState().claimUseNowVoucherRequest("same-token", replacementVersion)).toBe(true);
  });

  it("xóa request chưa được nhận khi đóng ví", () => {
    useVoucherModalStore.getState().requestUseNowVoucher("welcome-token");

    useVoucherModalStore.getState().close();

    expect(useVoucherModalStore.getState()).toMatchObject({
      open: false,
      requestedUseNowVoucherToken: null,
    });
  });
});
