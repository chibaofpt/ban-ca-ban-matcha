import { describe, expect, it } from "vitest";
import {
  canClaimLegacyGhost,
  canSetInitialPassword,
  isRegisteredAccount,
  type AccountIdentityInput,
} from "@/lib/auth/accountIdentityPolicy";

const legacyGhost: AccountIdentityInput & { points_balance: number } = {
  password_hash: "GHOST_USER_NO_PASSWORD",
  google_sub: null,
  account_origin: "LEGACY_PHONE",
  role: "CUSTOMER",
  is_blocked: false,
  phone_number: "0901234567",
  points_balance: 0,
  merged: false,
};

const googleLinkedLegacy: AccountIdentityInput = {
  password_hash: null,
  google_sub: "google-sub-1048",
  account_origin: "LEGACY_PHONE",
  role: "CUSTOMER",
  is_blocked: false,
  phone_number: "0901234567",
  merged: false,
};

describe("Chính sách identity tài khoản", () => {
  it("không xem sentinel của ghost là mật khẩu đăng ký", () => {
    expect(isRegisteredAccount(legacyGhost)).toBe(false);
  });

  it("giữ tài khoản password cũ là tài khoản đã đăng ký", () => {
    expect(isRegisteredAccount({ ...legacyGhost, password_hash: "$2b$12$existing-password-hash" })).toBe(true);
  });

  it("xem tài khoản Google không có phone hay password là tài khoản đã đăng ký", () => {
    expect(isRegisteredAccount({
      ...googleLinkedLegacy, account_origin: "GOOGLE_EMAIL", phone_number: null,
    })).toBe(true);
  });

  it("không coi credential null, rỗng hoặc chỉ khoảng trắng là đăng ký", () => {
    expect(isRegisteredAccount({ ...legacyGhost, password_hash: null })).toBe(false);
    expect(isRegisteredAccount({ ...legacyGhost, password_hash: "", google_sub: "" })).toBe(false);
    expect(isRegisteredAccount({ ...legacyGhost, password_hash: " ", google_sub: " " })).toBe(false);
  });

  it("không trộn trạng thái block hoặc merge với định nghĩa đã đăng ký", () => {
    expect(isRegisteredAccount({ ...googleLinkedLegacy, is_blocked: true, merged: true })).toBe(true);
  });
});

describe("Claim ghost phone cũ", () => {
  it.each([
    { balance: 7, eligible: true },
    { balance: 0, eligible: false },
    { balance: -3, eligible: false },
  ])("số dư $balance không có lịch sử/voucher trả về quyền claim $eligible", ({ balance, eligible }) => {
    const ghost = { ...legacyGhost, points_balance: balance };
    expect(canClaimLegacyGhost(ghost, { hasEarnedPoints: false, hasVouchers: false })).toBe(eligible);
  });

  it("cho claim khi từng tích điểm dù không có voucher", () => {
    expect(canClaimLegacyGhost(legacyGhost, { hasEarnedPoints: true, hasVouchers: false })).toBe(true);
  });

  it("cho claim khi có voucher dù chưa từng tích điểm", () => {
    expect(canClaimLegacyGhost(legacyGhost, { hasEarnedPoints: false, hasVouchers: true })).toBe(true);
  });

  it("không cho claim ghost thiếu lịch sử điểm và voucher", () => {
    expect(canClaimLegacyGhost(legacyGhost, { hasEarnedPoints: false, hasVouchers: false })).toBe(false);
  });

  it.each([
    { role: "ADMIN" }, { role: "STAFF" }, { is_blocked: true }, { merged: true },
    { account_origin: "GOOGLE_EMAIL" as const }, { phone_number: null }, { phone_number: " " },
    { google_sub: "google-sub-1048" }, { password_hash: "$2b$12$existing-password-hash" },
  ])("từ chối ghost không đủ điều kiện: %j", (changes) => {
    expect(canClaimLegacyGhost({ ...legacyGhost, ...changes }, {
      hasEarnedPoints: true, hasVouchers: true,
    })).toBe(false);
    const ghostWithBalance = { ...legacyGhost, ...changes, points_balance: 7 };
    expect(canClaimLegacyGhost(ghostWithBalance, {
      hasEarnedPoints: false, hasVouchers: false,
    })).toBe(false);
  });

  it("cho claim ghost chuyển từ sentinel sang credential null", () => {
    expect(canClaimLegacyGhost({ ...legacyGhost, password_hash: null }, {
      hasEarnedPoints: true, hasVouchers: false,
    })).toBe(true);
  });
});

describe("Đặt mật khẩu đầu tiên", () => {
  it("cho khách legacy đã liên kết Google và chưa có mật khẩu", () => {
    expect(canSetInitialPassword(googleLinkedLegacy)).toBe(true);
    expect(canSetInitialPassword({ ...googleLinkedLegacy, password_hash: "GHOST_USER_NO_PASSWORD" })).toBe(true);
  });

  it("từ chối ghost chưa liên kết Google", () => {
    expect(canSetInitialPassword(legacyGhost)).toBe(false);
  });

  it.each([
    { role: "ADMIN" }, { role: "STAFF" }, { is_blocked: true }, { merged: true },
    { account_origin: "GOOGLE_EMAIL" as const }, { phone_number: null }, { phone_number: " " },
    { google_sub: null }, { google_sub: "" }, { google_sub: " " },
    { password_hash: "$2b$12$existing-password-hash" },
  ])("từ chối khách không đủ điều kiện: %j", (changes) => {
    expect(canSetInitialPassword({ ...googleLinkedLegacy, ...changes })).toBe(false);
  });
});
