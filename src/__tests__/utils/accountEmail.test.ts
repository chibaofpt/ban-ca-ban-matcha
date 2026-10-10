import { describe, expect, it } from "vitest";
import { isValidGhostAccountEmail, normalizeAccountEmail } from "@/src/utils/accountEmail";

describe("Chuẩn hóa email tài khoản", () => {
  it("bỏ khoảng trắng, chữ hoa và dấu chấm của Gmail", () => {
    expect(normalizeAccountEmail("  Matcha.Owner@GMAIL.COM  ")).toBe("matchaowner@gmail.com");
  });

  it("giữ dấu chấm trong địa chỉ Workspace", () => {
    expect(normalizeAccountEmail("  Matcha.Owner@Tea.Example  ")).toBe("matcha.owner@tea.example");
  });

  it("không loại bỏ alias khi chuẩn hóa email đã xác minh", () => {
    expect(normalizeAccountEmail("Matcha.Owner+Receipt@Gmail.Com")).toBe("matchaowner+receipt@gmail.com");
  });

  it("giữ địa chỉ thiếu cú pháp để validation xử lý độc lập", () => {
    expect(normalizeAccountEmail(" NO-AT-SIGN ")).toBe("no-at-sign");
  });
});

describe("Email nhập cho ghost", () => {
  it.each(["owner@gmail.com", " Matcha.Owner@GMAIL.COM ", "matcha.owner@tea.example", "team_owner@sub.tea.example"])(
    "chấp nhận địa chỉ có cú pháp hợp lệ: %s",
    (email) => { expect(isValidGhostAccountEmail(email)).toBe(true); },
  );

  it.each([
    "", " ", "matcha.owner", "@gmail.com", "owner@", "owner@@gmail.com",
    "owner+receipt@gmail.com", "owner+receipt@tea.example",
    ".owner@gmail.com", "owner.@gmail.com", "matcha..owner@gmail.com",
    "owner name@gmail.com", "owner\n@gmail.com", "owner@localhost",
    "owner@-tea.example", "owner@tea-.example", "owner@tea..example",
    "owner@tea_example.com", "owner@example.c", "owner@example.123",
    '"owner"@tea.example',
  ])("từ chối alias hoặc địa chỉ sai cú pháp: %s", (email) => {
    expect(isValidGhostAccountEmail(email)).toBe(false);
  });

  it("từ chối local-part và domain label vượt giới hạn cú pháp", () => {
    expect(isValidGhostAccountEmail("a".repeat(65) + "@tea.example")).toBe(false);
    expect(isValidGhostAccountEmail("owner@" + "a".repeat(64) + ".example")).toBe(false);
  });

  it("từ chối tổng chiều dài email vượt giới hạn", () => {
    const domain = ["a".repeat(63), "b".repeat(63), "c".repeat(63), "example"].join(".");
    expect(isValidGhostAccountEmail("o".repeat(64) + "@" + domain)).toBe(false);
  });
});