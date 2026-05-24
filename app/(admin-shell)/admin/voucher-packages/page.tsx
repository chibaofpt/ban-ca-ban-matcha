import AdminVoucherPackagesPage from '@/src/views/admin/AdminVoucherPackagesPage';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Gói voucher — Quản trị Bạn Cá Bán Matcha',
  description: 'Quản lý gói voucher.',
};

export default function Page() {
  return <AdminVoucherPackagesPage />;
}
