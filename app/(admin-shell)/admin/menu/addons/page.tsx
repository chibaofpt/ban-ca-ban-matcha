import type { Metadata } from "next";
import AdminAddonsPage from "@/src/views/admin/AdminAddonsPage";

export const metadata: Metadata = {
  title: "Quản lý Addon Groups | Bạn Cá Bán Matcha",
  description: "Trang quản lý addon groups toàn cục cho Admin.",
};

export default function AdminAddonGroupsRoute() {
  return <AdminAddonsPage />;
}
