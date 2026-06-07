import { z } from "zod";

const phoneRegex = /^\+84[3|5|7|8|9][0-9]{8}$/;

export const addressSchema = z.object({
  label: z.string().min(1, "Vui lòng nhập tên gợi nhớ (VD: Nhà, Công ty)"),
  full_address: z.string().min(5, "Địa chỉ quá ngắn"),
  lat: z.number(),
  lng: z.number(),
  receiver_name: z.string().min(2, "Tên người nhận quá ngắn"),
  receiver_phone: z.string().regex(phoneRegex, "Số điện thoại không hợp lệ (định dạng +84)"),
  is_default: z.boolean().default(false),
});

export type AddressInput = z.infer<typeof addressSchema>;
