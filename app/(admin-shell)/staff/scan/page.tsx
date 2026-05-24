import StaffScanPage from '@/src/views/staff/StaffScanPage';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Quét QR — Bạn Cá Bán Matcha',
  description: 'Quét mã QR voucher hoặc thông tin khách hàng.',
};

export default function Page() {
  return <StaffScanPage />;
}
