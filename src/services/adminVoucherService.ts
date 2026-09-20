import { apiClient } from "@/src/lib/api/client";
import { isAxiosError } from "axios";
import type {
  AdminVoucherRecipientPage,
  CreateVoucherPackageInput,
  DeactivateVoucherPackageResult,
  GrantedVoucher,
  GrantVoucherInput,
  UpdateVoucherPackageInput,
  VoucherOwnerPage,
  VoucherOwnerStatus,
  VoucherPackage,
  VoucherRecipientStatus,
} from "@/contracts/admin/voucher";
import type { ApiError, ApiResponse } from "@/src/lib/types/api";
import { ApiServiceError } from "@/src/lib/api/serviceError";

export type {
  AdminVoucherGrantWarning,
  AdminVoucherRecipientPage,
  AdminVoucherRecipientSummary,
  AdminVoucherRecipientVoucher,
  CreateVoucherPackageInput,
  DeactivateVoucherPackageResult,
  GrantedVoucher,
  GrantVoucherInput,
  UpdateVoucherPackageInput,
  VoucherBundleProductScope,
  VoucherBundleRule,
  VoucherEligibleAddonOption,
  VoucherEligibleMenuItem,
  VoucherIssuedVia,
  VoucherOwnerInstance,
  VoucherOwnerPage,
  VoucherOwnerStatus,
  VoucherPackage,
  VoucherPackageOwner,
  VoucherPackageStats,
  VoucherRecipientStatus,
} from "@/contracts/admin/voucher";

async function preserveApiError<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    if (!isAxiosError<ApiError>(error) || !error.response?.data?.error) throw error;
    const payload = error.response?.data;
    throw new ApiServiceError(
      payload?.error ?? error.message,
      error.response?.status ?? 0,
      payload?.code ?? "INTERNAL_ERROR",
      payload?.details,
    );
  }
}

const URL = {
  list: "/api/admin/voucher-packages",
  byId: (id: string) => `/api/admin/voucher-packages/${id}`,
  owners: (id: string) => `/api/admin/voucher-packages/${id}/owners`,
  recipients: (id: string, userQrToken: string) => `/api/admin/voucher-packages/${id}/recipients/${userQrToken}`,
  grants: (id: string) => `/api/admin/voucher-packages/${id}/grants`,
} as const;

/** List all voucher packages (active and inactive) — ADMIN only. */
export async function listVoucherPackages(): Promise<VoucherPackage[]> {
  return preserveApiError(async () => {
    const res = await apiClient.get<ApiResponse<VoucherPackage[]>>(URL.list);
    return res.data.data;
  });
}

/** Searches owners of one package with effective status filtering. */
export async function searchVoucherPackageOwners(id: string, params: { q: string; status: VoucherOwnerStatus; cursor?: string }): Promise<VoucherOwnerPage> {
  return preserveApiError(async () => {
    const res = await apiClient.get<ApiResponse<VoucherOwnerPage>>(URL.owners(id), { params });
    return res.data.data;
  });
}

/** Reads one customer's bounded voucher history for a package. */
export async function getVoucherPackageRecipientHistory(
  id: string,
  userQrToken: string,
  params: { status: VoucherRecipientStatus; cursor?: string },
): Promise<AdminVoucherRecipientPage> {
  return preserveApiError(async () => {
    const res = await apiClient.get<ApiResponse<AdminVoucherRecipientPage>>(
      URL.recipients(id, userQrToken),
      { params },
    );
    return res.data.data;
  });
}

/** Gives exactly one voucher to a selected CUSTOMER through the audited admin route. */
export async function grantVoucherToCustomer(
  id: string,
  input: GrantVoucherInput,
): Promise<GrantedVoucher> {
  return preserveApiError(async () => {
    const res = await apiClient.post<ApiResponse<GrantedVoucher>>(URL.grants(id), input);
    return res.data.data;
  });
}

/** Create a new voucher package — ADMIN only. */
export async function createVoucherPackage(data: CreateVoucherPackageInput): Promise<VoucherPackage> {
  return preserveApiError(async () => {
    const res = await apiClient.post<ApiResponse<VoucherPackage>>(URL.list, data);
    return res.data.data;
  });
}

/** Update editable fields of a voucher package — ADMIN only. */
export async function updateVoucherPackage(
  id: string,
  data: UpdateVoucherPackageInput
): Promise<VoucherPackage> {
  return preserveApiError(async () => {
    const res = await apiClient.put<ApiResponse<VoucherPackage>>(URL.byId(id), data);
    return res.data.data;
  });
}

/** Deactivate (soft delete) a voucher package — ADMIN only. */
export async function deleteVoucherPackage(id: string): Promise<DeactivateVoucherPackageResult> {
  return preserveApiError(async () => {
    const res = await apiClient.delete<ApiResponse<DeactivateVoucherPackageResult>>(URL.byId(id));
    return res.data.data;
  });
}
