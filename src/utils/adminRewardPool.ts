import type { AdminRewardPoolInput } from "@/src/services/adminRewardService";

export interface AdminRewardPoolFeedback {
  total: number;
  warning: string | null;
}

interface AvailabilityCandidate {
  is_active: boolean;
  ends_at: string | null;
}

/** Return whether a reward package is active and has not reached its end time. */
export function isAdminRewardPackageAvailable(candidate: AvailabilityCandidate, now = new Date()): boolean {
  if (!candidate.is_active) return false;
  if (!candidate.ends_at) return true;
  const endsAt = new Date(candidate.ends_at);
  return !Number.isNaN(endsAt.getTime()) && endsAt > now;
}

/** Calculate local pool totals and the first unreachable unlock threshold. */
export function getAdminRewardPoolFeedback(items: AdminRewardPoolInput[]): AdminRewardPoolFeedback {
  const total = items.reduce((sum, item) => sum + item.quantity, 0);
  if (items.length === 0) return { total, warning: "Pool cần ít nhất một voucher." };
  if (items.length > 100) return { total, warning: "Pool có tối đa 100 voucher." };
  if (new Set(items.map((item) => item.voucher_package_id)).size !== items.length) return { total, warning: "Mỗi voucher chỉ được xuất hiện một lần." };
  if (items.some((item) => !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 10_000)) {
    return { total, warning: "Số lượng mỗi voucher phải là số nguyên từ 1 đến 10.000." };
  }
  if (items.some((item) => !Number.isInteger(item.unlock_after_draws) || item.unlock_after_draws < 0 || item.unlock_after_draws > 99_999)) {
    return { total, warning: "Mốc mở phải là số nguyên từ 0 đến 99.999." };
  }
  if (total > 100_000) return { total, warning: "Tổng phân bổ không được vượt 100.000." };
  if (items.some((item) => item.unlock_after_draws >= total)) return { total, warning: `Mốc mở phải nhỏ hơn tổng phân bổ ${total}.` };
  const thresholds = [...new Set(items.map((item) => item.unlock_after_draws).filter((value) => value > 0))].sort((a, b) => a - b);
  for (const threshold of thresholds) {
    const earlier = items.filter((item) => item.unlock_after_draws < threshold).reduce((sum, item) => sum + item.quantity, 0);
    if (earlier < threshold) return { total, warning: `Mốc mở ${threshold} cần ít nhất ${threshold} phần quà khả dụng trước đó.` };
  }
  return { total, warning: null };
}
