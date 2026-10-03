import type { Metadata } from "next";
import AdminUsersPage from "@/src/views/admin/AdminUsersPage";

export const metadata: Metadata = {
  title: "Khách hàng — Quản trị Bạn Cá Bán Matcha",
  description: "Tìm kiếm và quản lý tài khoản khách hàng.",
};

/** Renders the admin customer-management route. */
export default function Page() {
  return <AdminUsersPage />;
}
