import AdminMenuPage from '@/src/views/admin/AdminMenuPage';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sản phẩm — Quản trị Bạn Cá Bán Matcha',
  description: 'Quản lý danh sách sản phẩm và addon.',
};

export default function Page() {
  return <AdminMenuPage />;
}
