import type { Metadata } from "next";
import Vouchers from "@/src/views/Vouchers";

export const metadata: Metadata = {
  title: "Ví Voucher – Bạn Cá Bán Matcha",
  description: "Xem và sử dụng voucher của bạn tại Bạn Cá Bán Matcha.",
};

/** Voucher wallet page — renders the Vouchers view component. */
export default function VouchersPage() {
  return <Vouchers />;
}
