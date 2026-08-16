import type { Metadata } from "next";
import AdminVoucherPackagesPage from "@/src/views/admin/AdminVoucherPackagesPage";

export const metadata: Metadata = {
  title: "Voucher & ưu đãi — Quản trị Bạn Cá Bán Matcha",
  description: "Quản lý phát hành và quyền lợi voucher.",
};

export default function Page() {
  return <AdminVoucherPackagesPage />;
}
