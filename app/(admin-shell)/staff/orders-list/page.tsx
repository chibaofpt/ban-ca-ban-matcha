import StaffOrdersListPage from '@/src/views/staff/StaffOrdersListPage';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Danh sách đơn hàng — Bạn Cá Bán Matcha',
  description: 'Xem danh sách tất cả đơn hàng.',
};

export default function Page() {
  return <StaffOrdersListPage />;
}
