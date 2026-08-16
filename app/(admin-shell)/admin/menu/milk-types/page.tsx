import type { Metadata } from "next";
import AdminMilkTypesPage from "@/src/views/admin/AdminMilkTypesPage";

export const metadata: Metadata = {
  title: "Quản lý Base Liquid | Bạn Cá Bán Matcha",
  description: "Trang quản lý danh mục Base Liquid dùng cho Latte và Fusion.",
};

export default function AdminMilkTypesRoute() {
  return <AdminMilkTypesPage />;
}
