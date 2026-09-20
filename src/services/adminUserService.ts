import { isAxiosError, type AxiosResponse } from 'axios';
import { apiClient } from '@/src/lib/api/client';
import type { ApiError, ApiResponse } from '@/src/lib/types/api';
import type {
  AdminUserMutationResult, AdminUserOrder, AdminUserPage, AdminUserPasswordResetResult,
  AdminUserPatch, AdminUserPointsInput, AdminUserPointsResult, AdminUserSummary,
  AdminUserVoucher, AdminUserVoucherCategory, AdminUserVoucherPackage,
} from '@/contracts/admin/user';
import { ApiServiceError } from '@/src/lib/api/serviceError';

export type {
  AdminUserOrder, AdminUserPage, AdminUserPasswordResetResult, AdminUserPatch,
  AdminUserSummary, AdminUserVoucher, AdminUserVoucherCategory, AdminUserVoucherPackage,
} from '@/contracts/admin/user';

const URL = {
  list: '/api/admin/users',
  detail: (token: string) => `/api/admin/users/${encodeURIComponent(token)}`,
  points: (token: string) => `/api/admin/users/${encodeURIComponent(token)}/points`,
  orders: (token: string) => `/api/admin/users/${encodeURIComponent(token)}/orders`,
  order: (token: string, id: string) => `/api/admin/users/${encodeURIComponent(token)}/orders/${encodeURIComponent(id)}`,
  vouchers: (token: string) => `/api/admin/users/${encodeURIComponent(token)}/vouchers`,
  packages: '/api/admin/users/voucher-packages',
} as const;

export const adminUserKeys = {
  all: ['admin', 'users'] as const,
  list: (page: number, q: string) => ['admin', 'users', 'list', page, q] as const,
  detail: (token: string) => ['admin', 'users', 'detail', token] as const,
  orders: (token: string, page: number) => ['admin', 'users', 'orders', token, page] as const,
  order: (token: string, id: string) => ['admin', 'users', 'order', token, id] as const,
  vouchers: (token: string, page: number) => ['admin', 'users', 'vouchers', token, page] as const,
  packages: (page: number, category: AdminUserVoucherCategory) => ['admin', 'users', 'packages', page, category] as const,
};

async function unwrap<T>(request: Promise<AxiosResponse<ApiResponse<T>>>): Promise<T> {
  try {
    return (await request).data.data;
  } catch (error: unknown) {
    if (isAxiosError<ApiError>(error) && error.response &&
        typeof error.response.data?.error === 'string' && typeof error.response.data.code === 'string') {
      throw new ApiServiceError(error.response.data.error, error.response.status,
        error.response.data.code, error.response.data.details);
    }
    throw error;
  }
}

/** Fetches one admin customer page with server-owned ordering and totals. */
export async function fetchAdminUsers(page = 1, q = ''): Promise<AdminUserPage<AdminUserSummary>> {
  return unwrap(apiClient.get(URL.list, { params: { page, q } }));
}

/** Fetches the current summary for a public customer QR token. */
export async function fetchAdminUser(token: string): Promise<AdminUserSummary> {
  return unwrap(apiClient.get(URL.detail(token)));
}

/** Applies one explicit account administration action. */
export async function updateAdminUser(token: string, action: Extract<AdminUserPatch, { action: 'reset_password' }>): Promise<AdminUserPasswordResetResult>;
export async function updateAdminUser(token: string, action: Exclude<AdminUserPatch, { action: 'reset_password' }>): Promise<AdminUserMutationResult>;
export async function updateAdminUser(token: string, action: AdminUserPatch): Promise<AdminUserMutationResult | AdminUserPasswordResetResult>;
export async function updateAdminUser(token: string, action: AdminUserPatch): Promise<AdminUserMutationResult | AdminUserPasswordResetResult> {
  return unwrap(apiClient.patch(URL.detail(token), action));
}

/** Gifts points through the audited server workflow. */
export async function giftAdminUserPoints(token: string, points: number): Promise<AdminUserPointsResult> {
  const payload = { points } satisfies AdminUserPointsInput;
  return unwrap(apiClient.post(URL.points(token), payload));
}

/** Fetches ten orders belonging to the selected customer. */
export async function fetchAdminUserOrders(token: string, page = 1): Promise<AdminUserPage<AdminUserOrder>> {
  return unwrap(apiClient.get(URL.orders(token), { params: { page } }));
}

/** Fetches an order detail scoped to the selected customer. */
export async function fetchAdminUserOrder(token: string, id: string): Promise<AdminUserOrder> {
  return unwrap(apiClient.get(URL.order(token, id)));
}

/** Fetches a customer voucher page with server-projected lifecycle and expiry. */
export async function fetchAdminUserVouchers(token: string, page = 1): Promise<AdminUserPage<AdminUserVoucher>> {
  return unwrap(apiClient.get(URL.vouchers(token), { params: { page } }));
}

/** Fetches ten active gift packages in the requested category. */
export async function fetchAdminUserVoucherPackages(page = 1, category: AdminUserVoucherCategory = 'ALL'): Promise<AdminUserPage<AdminUserVoucherPackage>> {
  return unwrap(apiClient.get(URL.packages, { params: { page, category } }));
}
