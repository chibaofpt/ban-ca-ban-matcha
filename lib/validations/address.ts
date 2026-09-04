import { z } from "zod";

const phoneRegex = /^\+84[35789][0-9]{8}$/;

export const addressSchema = z.object({
  label: z.string().min(1, "Vui lòng nhập tên gợi nhớ (VD: Nhà, Công ty)").max(50),
  full_address: z.string().min(5, "Địa chỉ quá ngắn").max(500),
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
  receiver_name: z.string().min(2, "Tên người nhận quá ngắn").max(100),
  receiver_phone: z.string().regex(phoneRegex, "Số điện thoại không hợp lệ (định dạng +84)"),
  is_default: z.boolean().default(false),
});

export type AddressInput = z.infer<typeof addressSchema>;
