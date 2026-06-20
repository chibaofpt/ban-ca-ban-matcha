import { Metadata } from "next";
import AdminPowderPage from "@/src/views/admin/AdminPowderPage";

export const metadata: Metadata = {
  title: "Quản lý bột | Bạn Cá Bán Matcha",
  description: "Trang quản lý danh mục bột matcha cho Admin.",
};

export default function AdminPowdersRoute() {
  return <AdminPowderPage />;
}
