import StaffOrdersListPage from '@/src/views/staff/StaffOrdersListPage';
import type { Metadata } from 'next';
import { getSession } from '@/lib/auth';

export const metadata: Metadata = {
  title: 'Danh sách đơn hàng — Bạn Cá Bán Matcha',
  description: 'Xem danh sách tất cả đơn hàng.',
};

export default async function Page() {
  const session = await getSession();
  const userRole = session?.role || 'STAFF';
  return <StaffOrdersListPage userRole={userRole} />;
}
