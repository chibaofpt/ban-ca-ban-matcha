import { z } from "zod";

const vietnamPhoneRegex = /^(0|\+84)[35789][0-9]{8}$/;

/** Client-side schema for the customer delivery-address form. */
export const addressFormSchema = z.object({
  full_address: z.string().min(5, "Vui lòng chọn vị trí giao hàng trên bản đồ"),
  label: z.string().trim().min(1, "Vui lòng nhập tên gợi nhớ").max(50, "Tên gợi nhớ quá dài"),
  lat: z.number().nullable().refine((value) => value !== null, "Vui lòng chọn vị trí giao hàng"),
  lng: z.number().nullable().refine((value) => value !== null, "Vui lòng chọn vị trí giao hàng"),
  receiver_name: z.string().trim().min(1, "Vui lòng nhập tên người nhận").max(100, "Tên người nhận quá dài"),
  receiver_phone: z.string().regex(vietnamPhoneRegex, "Số điện thoại không hợp lệ (vd: 0912345678)"),
  is_default: z.boolean(),
});

export type AddressFormValues = z.infer<typeof addressFormSchema>;
export type AddressFormInput = z.input<typeof addressFormSchema>;
