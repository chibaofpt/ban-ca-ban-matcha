import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/src/lib/api/client', () => ({ apiClient: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } }));

import { apiClient } from '@/src/lib/api/client';
import {
  fetchAdminUsers, fetchAdminUser, fetchAdminUserOrders, fetchAdminUserOrder,
  fetchAdminUserVouchers, fetchAdminUserVoucherPackages, giftAdminUserPoints, updateAdminUser,
} from '@/src/services/adminUserService';
import { ApiServiceError } from '@/src/services/orderService';

describe('Service quản lý khách hàng', () => {
  beforeEach(() => vi.clearAllMocks());

  it('gửi trang và tìm kiếm rồi trả đúng trang dữ liệu từ server', async () => {
    const page = { items: [{ qr_token: 'customer-token', name: 'Bạn Cá' }], total: 12, page: 2, total_pages: 2 };
    vi.mocked(apiClient.get).mockResolvedValue({ data: { data: page } });
    await expect(fetchAdminUsers(2, '@ban.ca')).resolves.toEqual(page);
    expect(apiClient.get).toHaveBeenCalledWith('/api/admin/users', { params: { page: 2, q: '@ban.ca' } });
  });

  it('đọc chi tiết, orders, voucher và danh mục bằng đúng token và bộ lọc', async () => {
    const response = { items: [], total: 0, page: 3, total_pages: 0 };
    vi.mocked(apiClient.get).mockResolvedValue({ data: { data: response } });
    await expect(fetchAdminUser('customer-token')).resolves.toEqual(response);
    expect(apiClient.get).toHaveBeenLastCalledWith('/api/admin/users/customer-token');
    await expect(fetchAdminUserOrders('customer-token', 3)).resolves.toEqual(response);
    expect(apiClient.get).toHaveBeenLastCalledWith('/api/admin/users/customer-token/orders', { params: { page: 3 } });
    await expect(fetchAdminUserOrder('customer-token', 'order-id')).resolves.toEqual(response);
    expect(apiClient.get).toHaveBeenLastCalledWith('/api/admin/users/customer-token/orders/order-id');
    await expect(fetchAdminUserVouchers('customer-token', 3)).resolves.toEqual(response);
    expect(apiClient.get).toHaveBeenLastCalledWith('/api/admin/users/customer-token/vouchers', { params: { page: 3 } });
    await expect(fetchAdminUserVoucherPackages(3, 'GIFT')).resolves.toEqual(response);
    expect(apiClient.get).toHaveBeenLastCalledWith('/api/admin/users/voucher-packages', { params: { page: 3, category: 'GIFT' } });
  });

  it('gửi đúng điểm và các action xác thực, chặn', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: { data: { points_balance: 35 } } });
    await expect(giftAdminUserPoints('customer-token', 20)).resolves.toEqual({ points_balance: 35 });
    expect(apiClient.post).toHaveBeenCalledWith('/api/admin/users/customer-token/points', { points: 20 });
    vi.mocked(apiClient.patch).mockResolvedValue({ data: { data: { success: true } } });
    for (const action of [
      { action: 'verify', is_verified: true } as const,
      { action: 'block', is_blocked: false } as const,
    ]) {
      await expect(updateAdminUser('customer-token', action)).resolves.toEqual({ success: true });
      expect(apiClient.patch).toHaveBeenLastCalledWith('/api/admin/users/customer-token', action);
    }
  });

  it('trả mật khẩu tạm thời từ action reset và giữ nguyên lỗi server', async () => {
    const reset = { success: true as const, temporary_password: 'Temp-4821' };
    vi.mocked(apiClient.patch).mockResolvedValueOnce({ data: { data: reset } });
    await expect(updateAdminUser('customer-token', { action: 'reset_password' })).resolves.toEqual(reset);
    expect(apiClient.patch).toHaveBeenLastCalledWith('/api/admin/users/customer-token', { action: 'reset_password' });

    vi.mocked(apiClient.patch).mockRejectedValueOnce({ isAxiosError: true, response: {
      status: 422, data: { error: 'Không thể reset mật khẩu', code: 'BUSINESS_RULE_VIOLATION', details: { reason: 'RESET_NOT_ALLOWED' } },
    } });
    await expect(updateAdminUser('customer-token', { action: 'reset_password' })).rejects.toMatchObject({
      message: 'Không thể reset mật khẩu', status: 422, code: 'BUSINESS_RULE_VIOLATION', details: { reason: 'RESET_NOT_ALLOWED' },
    });
  });

  it('giữ lỗi nghiệp vụ và không biến lỗi kết nối thành lỗi server', async () => {
    const details = { reason: 'POINTS_BALANCE_LIMIT' };
    vi.mocked(apiClient.post).mockRejectedValue({ isAxiosError: true, response: {
      status: 422, data: { error: 'Số điểm vượt giới hạn', code: 'BUSINESS_RULE_VIOLATION', details },
    } });
    const error = await giftAdminUserPoints('customer-token', 20).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiServiceError);
    expect(error).toMatchObject({ message: 'Số điểm vượt giới hạn', status: 422, code: 'BUSINESS_RULE_VIOLATION', details });
    const connectionError = new Error('offline');
    vi.mocked(apiClient.get).mockRejectedValue(connectionError);
    await expect(fetchAdminUser('customer-token')).rejects.toBe(connectionError);
  });
});
