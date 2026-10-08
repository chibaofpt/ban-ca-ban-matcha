import { describe, expect, it } from "vitest";
import { RegisterSchemaWithInstagram, LoginSchema } from "@/lib/validations/auth";
import { addressSchema } from "@/lib/validations/address";
import { registerFormSchema } from "@/src/lib/validations/auth";
import { addressFormSchema } from "@/src/lib/validations/address";

describe("Điện thoại xuyên validation — APPLICATION_LOGIC", () => {
  it.each(["0912345678", "+84912345678", "84912345678", "091 234 5678", "091-234-5678", "+840912345678"])("cùng identity khi nhập %s", (phone_number) => {
    const registration = { name: "Bạn Cá", password: "secret123", phone_number };
    expect(RegisterSchemaWithInstagram.parse(registration).phone_number).toBe("+84912345678");
    expect(LoginSchema.parse({ phone_number, password: "secret123" }).phone_number).toBe("+84912345678");
    expect(registerFormSchema.parse(registration).phone_number).toBe("0912345678");
    const address = { label: "Nhà", full_address: "123 Đường Cá", lat: 10.7, lng: 106.7, receiver_name: "Bạn Cá", receiver_phone: phone_number, is_default: false };
    expect(addressSchema.parse(address).receiver_phone).toBe("+84912345678");
    expect(addressFormSchema.parse(address).receiver_phone).toBe("0912345678");
  });
  it.each(["0912abc345678", "+81912345678", "091234567", "09123456789"])("từ chối số sai %s", (phone_number) => {
    expect(RegisterSchemaWithInstagram.safeParse({ name: "Bạn Cá", password: "secret123", phone_number }).success).toBe(false);
    expect(registerFormSchema.safeParse({ name: "Bạn Cá", password: "secret123", phone_number }).success).toBe(false);
  });
});
