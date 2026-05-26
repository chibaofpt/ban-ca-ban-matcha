import type { Metadata } from "next";
import MyVouchersPage from "@/src/views/customer/MyVouchersPage";

export const metadata: Metadata = {
  title: "Túi Voucher – Bạn Cá Bán Matcha",
  description: "Xem voucher đã đổi và hiển thị mã QR để sử dụng tại Bạn Cá Bán Matcha.",
};

export default function VouchersPage() {
  return <MyVouchersPage />;
}
