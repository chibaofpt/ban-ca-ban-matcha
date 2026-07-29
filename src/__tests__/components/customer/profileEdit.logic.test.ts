import { describe, expect, it } from "vitest";
import {
  buildProfilePatchPayload,
  hasProfileChanges,
} from "@/src/lib/utils/profileEdit";

const PROFILE = {
  name: "Bạn Cá",
  phone_number: "+84912345678",
  insta_name: "ban.ca",
  points_balance: 25,
  qr_token: "qr-token",
};

describe("Logic form cập nhật hồ sơ", () => {
  it("chỉ gửi name khi Instagram không đổi", () => {
    expect(
      buildProfilePatchPayload(PROFILE, {
        name: "Tên mới",
        insta_name: "@Ban.Ca",
        current_password: "",
      }),
    ).toEqual({ name: "Tên mới" });
  });

  it("gửi null và mật khẩu khi xoá Instagram", () => {
    expect(
      buildProfilePatchPayload(PROFILE, {
        name: "Bạn Cá",
        insta_name: "",
        current_password: "secret12",
      }),
    ).toEqual({ insta_name: null, current_password: "secret12" });
  });

  it("phát hiện form pristine sau chuẩn hoá", () => {
    expect(
      hasProfileChanges(PROFILE, {
        name: " Bạn Cá ",
        insta_name: " @BAN.CA ",
        current_password: "",
      }),
    ).toBe(false);
  });
});
