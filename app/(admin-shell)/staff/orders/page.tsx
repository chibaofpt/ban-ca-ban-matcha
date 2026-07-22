import StaffOrdersPage from '@/src/views/staff/StaffOrdersPage';
import type { Metadata } from 'next';
import { getSession } from "@/lib/auth";

export const metadata: Metadata = {
  title: 'Tạo đơn — Bạn Cá Bán Matcha',
  description: 'Tạo đơn hàng mới tại quầy.',
};

export default async function Page() {
  const session = await getSession();
  const userRole = session?.role === "ADMIN" ? "ADMIN" : "STAFF";

  return <StaffOrdersPage userRole={userRole} />;
}
