import { describe, expect, it } from "vitest";

import { changePasswordFormSchema } from "@/src/lib/validations/auth";

describe("change-password client validation", () => {
  it("requires both password fields and reports the field path", () => {
    const result = changePasswordFormSchema.safeParse({
      current_password: "",
      new_password: "short",
      confirm_password: "short",
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.map((issue) => issue.path[0])).toContain("current_password");
  });

  it("rejects a new password over 72 UTF-8 bytes", () => {
    const result = changePasswordFormSchema.safeParse({
      current_password: "current1",
      new_password: "😀".repeat(19),
      confirm_password: "😀".repeat(19),
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.some((issue) => issue.path[0] === "new_password")).toBe(true);
  });

  it("rejects mismatched confirmation and reusing the current password", () => {
    const mismatch = changePasswordFormSchema.safeParse({
      current_password: "current1",
      new_password: "newpass1",
      confirm_password: "newpass2",
    });
    const reused = changePasswordFormSchema.safeParse({
      current_password: "current1",
      new_password: "current1",
      confirm_password: "current1",
    });

    expect(mismatch.success).toBe(false);
    expect(reused.success).toBe(false);
    if (!reused.success) {
      expect(reused.error.issues.some((issue) => issue.path[0] === "new_password")).toBe(true);
    }
  });
});
