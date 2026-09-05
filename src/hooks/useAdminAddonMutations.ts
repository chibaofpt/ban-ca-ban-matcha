"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type {
  AddonGroupDetailsMutationPayload,
  AddonGroupReorderEntry,
  AddonOptionCreatePayload,
  AddonOptionDetailsMutationPayload,
  AdminAddonGroup,
} from "@/src/lib/types/addonGroup";
import {
  createAddonOption,
  reorderAddonGroups,
  toggleAddonGroupActive,
  toggleAddonOptionActive,
  updateAddonGroupDetails,
  updateAddonOptionDetails,
} from "@/src/services/adminAddonService";

const QUERY_KEY = ["admin", "addon-groups"] as const;

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/** Coordinate add-on mutations and keep the admin catalogue cache canonical. */
export function useAdminAddonMutations() {
  const queryClient = useQueryClient();
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const replaceGroup = (saved: AdminAddonGroup) => {
    queryClient.setQueryData<AdminAddonGroup[]>(QUERY_KEY, (current) =>
      current
        ?.map((group) => group.id === saved.id ? saved : group)
        .sort((left, right) => left.sort_order - right.sort_order || left.id.localeCompare(right.id)),
    );
  };

  const run = async <T,>(key: string, task: () => Promise<T>, success: string): Promise<T> => {
    setBusyKey(key);
    try {
      const result = await task();
      toast.success(success);
      return result;
    } catch (error: unknown) {
      toast.error(errorMessage(error, "Không thể lưu thay đổi. Vui lòng thử lại."));
      throw error;
    } finally {
      setBusyKey(null);
    }
  };

  return {
    busyKey,
    acceptCreatedGroup(group: AdminAddonGroup) {
      queryClient.setQueryData<AdminAddonGroup[]>(QUERY_KEY, (current = []) =>
        [...current.filter((item) => item.id !== group.id), group]
          .sort((left, right) => left.sort_order - right.sort_order || left.id.localeCompare(right.id)),
      );
      toast.success(`Đã thêm nhóm "${group.name}"`);
    },
    async saveGroup(
      groupId: string,
      payload: AddonGroupDetailsMutationPayload,
      imageFile: File | null,
      imageFilename: string,
    ) {
      const saved = await run(
        `group:${groupId}`,
        () => updateAddonGroupDetails(groupId, payload, imageFile, imageFilename),
        "Đã cập nhật nhóm addon",
      );
      replaceGroup(saved);
      return saved;
    },
    async addOption(
      groupId: string,
      payload: AddonOptionCreatePayload,
      imageFile: File | null,
      imageFilename: string,
    ) {
      const saved = await run(
        `option-create:${groupId}`,
        () => createAddonOption(groupId, payload, imageFile, imageFilename),
        "Đã thêm option",
      );
      replaceGroup(saved);
      return saved;
    },
    async saveOption(
      groupId: string,
      optionId: string,
      payload: AddonOptionDetailsMutationPayload,
      imageFile: File | null,
      imageFilename: string,
    ) {
      const saved = await run(
        `option:${optionId}`,
        () => updateAddonOptionDetails(groupId, optionId, payload, imageFile, imageFilename),
        "Đã cập nhật option",
      );
      replaceGroup(saved);
      return saved;
    },
    async toggleGroup(groupId: string, next: boolean) {
      const saved = await run(
        `group-toggle:${groupId}`,
        () => toggleAddonGroupActive(groupId, next),
        next ? "Đã hiển thị nhóm addon" : "Đã ẩn nhóm addon",
      );
      replaceGroup(saved);
    },
    async toggleOption(groupId: string, optionId: string, next: boolean) {
      const saved = await run(
        `option-toggle:${optionId}`,
        () => toggleAddonOptionActive(groupId, optionId, next),
        next ? "Đã hiển thị option" : "Đã ẩn option",
      );
      replaceGroup(saved);
    },
    async saveOrder(groups: AddonGroupReorderEntry[]) {
      const saved = await run("reorder", () => reorderAddonGroups(groups), "Đã cập nhật thứ tự hiển thị");
      queryClient.setQueryData(QUERY_KEY, saved);
      return saved;
    },
  };
}
