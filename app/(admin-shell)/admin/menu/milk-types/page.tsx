import type { Metadata } from "next";
import AdminMilkTypesPage from "@/src/views/admin/AdminMilkTypesPage";

export const metadata: Metadata = {
  title: "Quản lý Loại Sữa | Bạn Cá Bán Matcha",
  description: "Trang quản lý các loại sữa cho Admin.",
};

export default function AdminMilkTypesRoute() {
  return <AdminMilkTypesPage />;
}
