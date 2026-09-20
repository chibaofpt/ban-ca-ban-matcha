import { apiClient } from "@/src/lib/api/client";
import type { PowderApiResponse } from "@/contracts/catalog";

/**
 * Fetches the full powder catalog and system-level gram defaults from the server.
 * This should ideally be called once on app mount and cached in global state.
 */
export async function fetchPowders(): Promise<PowderApiResponse> {
  const { data } = await apiClient.get<PowderApiResponse>("/api/powders");
  return data;
}
