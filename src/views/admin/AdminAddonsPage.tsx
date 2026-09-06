"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import AddonGroupCard from "@/src/components/admin/AddonGroupCard";
import AddonEditOverlay, { type AddonEditTarget } from "@/src/components/admin/AddonEditOverlay";
import AddonGroupModal from "@/src/components/admin/AddonGroupModal";
import AddonOptionCreateOverlay from "@/src/components/admin/AddonOptionCreateOverlay";
import AddonsToolbar, { type AddonStatusFilter } from "@/src/components/admin/AddonsToolbar";
import {
  AddonsEmptyState,
  AddonVisibilityConfirm,
  type AddonVisibilityTarget,
} from "@/src/components/admin/AddonsPageFeedback";
import { ConfirmModal } from "@/src/components/ui/ConfirmModal";
import { useAdminAddonMutations } from "@/src/hooks/useAdminAddonMutations";
import { listAdminAddonGroups } from "@/src/services/adminAddonService";
import type { AddonGroupReorderEntry, AdminAddonGroup } from "@/src/lib/types/addonGroup";

type Editor =
  | { kind: "group"; groupId: string }
  | { kind: "option"; groupId: string; optionId: string }
  | null;

type PendingAction =
  | { kind: "editor"; editor: Editor }
  | { kind: "create-group" }
  | { kind: "create-option"; groupId: string };

type ReorderPending =
  | { kind: "group"; groupId: string; direction: "up" | "down" }
  | { kind: "option"; groupId: string; optionId: string; direction: "up" | "down" }
  | null;

function orderedGroups(groups: AdminAddonGroup[]): AdminAddonGroup[] {
  return [...groups]
    .sort((left, right) => left.sort_order - right.sort_order || left.id.localeCompare(right.id))
    .map((group) => ({
      ...group,
      options: [...group.options].sort((left, right) =>
        left.sort_order - right.sort_order || left.id.localeCompare(right.id)),
    }));
}

function reorderPayload(groups: AdminAddonGroup[]): AddonGroupReorderEntry[] {
  return groups.map((group) => ({
    id: group.id,
    option_ids: group.options.map((option) => option.id),
  }));
}

export default function AdminAddonsPage() {
  const mutations = useAdminAddonMutations();
  const [statusFilter, setStatusFilter] = useState<AddonStatusFilter>("active");
  const [editor, setEditor] = useState<Editor>(null);
  const [editorDirty, setEditorDirty] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [createOptionGroupId, setCreateOptionGroupId] = useState<string | null>(null);
  const [reorderPending, setReorderPending] = useState<ReorderPending>(null);
  const [visibilityTarget, setVisibilityTarget] = useState<AddonVisibilityTarget | null>(null);
  const [visibilityBusy, setVisibilityBusy] = useState(false);
  const [highlightedGroupId, setHighlightedGroupId] = useState<string | null>(null);
  const [highlightedOptionId, setHighlightedOptionId] = useState<string | null>(null);

  const { data = [], isLoading, isFetching, isError, refetch } = useQuery({
    queryKey: ["admin", "addon-groups"],
    queryFn: listAdminAddonGroups,
  });
  const groups = useMemo(() => orderedGroups(data), [data]);
  const filteredGroups = groups.filter((group) => {
    return statusFilter === "all"
      || (statusFilter === "active" ? group.is_active : !group.is_active);
  });

  useEffect(() => {
    const targetId = highlightedOptionId
      ? `addon-option-${highlightedOptionId}`
      : highlightedGroupId
        ? `addon-group-${highlightedGroupId}`
        : null;
    if (!targetId) return;
    const frame = requestAnimationFrame(() => {
      document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    const timeout = window.setTimeout(() => {
      setHighlightedGroupId(null);
      setHighlightedOptionId(null);
    }, 1500);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, [highlightedGroupId, highlightedOptionId]);

  const focusTrigger = (previous: Editor) => {
    if (!previous) return;
    const id = previous.kind === "group"
      ? `edit-group-${previous.groupId}`
      : `edit-option-${previous.optionId}`;
    requestAnimationFrame(() => document.getElementById(id)?.focus());
  };

  const executeAction = (action: PendingAction) => {
    const previous = editor;
    setEditorDirty(false);
    if (action.kind === "editor") {
      setEditor(action.editor);
      if (!action.editor) focusTrigger(previous);
    } else if (action.kind === "create-group") {
      setEditor(null);
      setCreateGroupOpen(true);
    } else {
      setEditor(null);
      setCreateOptionGroupId(action.groupId);
    }
    setPendingAction(null);
  };

  const requestAction = (action: PendingAction) => {
    if (editorDirty) setPendingAction(action);
    else executeAction(action);
  };

  const handleDirtyChange = useCallback((dirty: boolean) => setEditorDirty(dirty), []);

  const reorderGroup = async (groupId: string, direction: "up" | "down") => {
    const visibleIndex = filteredGroups.findIndex((group) => group.id === groupId);
    const swapVisibleIndex = direction === "up" ? visibleIndex - 1 : visibleIndex + 1;
    if (visibleIndex < 0 || swapVisibleIndex < 0 || swapVisibleIndex >= filteredGroups.length) return;
    const swapId = filteredGroups[swapVisibleIndex].id;
    const next = groups.map((group) => ({ ...group }));
    const currentIndex = next.findIndex((group) => group.id === groupId);
    const swapIndex = next.findIndex((group) => group.id === swapId);
    [next[currentIndex], next[swapIndex]] = [next[swapIndex], next[currentIndex]];
    const ranked = next.map((group, index) => ({ ...group, sort_order: index }));
    setReorderPending({ kind: "group", groupId, direction });
    try {
      await mutations.saveOrder(reorderPayload(ranked), ranked);
    } catch {
      // The mutation hook restores the previous catalogue and displays the error.
    } finally {
      setReorderPending(null);
    }
  };

  const reorderOption = async (groupId: string, optionId: string, direction: "up" | "down") => {
    const next = groups.map((group) => ({ ...group, options: [...group.options] }));
    const group = next.find((item) => item.id === groupId);
    if (!group) return;
    const currentIndex = group.options.findIndex((option) => option.id === optionId);
    const swapIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (currentIndex < 0 || swapIndex < 0 || swapIndex >= group.options.length) return;
    [group.options[currentIndex], group.options[swapIndex]] = [group.options[swapIndex], group.options[currentIndex]];
    group.options = group.options.map((option, index) => ({ ...option, sort_order: index }));
    setReorderPending({ kind: "option", groupId, optionId, direction });
    try {
      await mutations.saveOrder(reorderPayload(next), next);
    } catch {
      // The mutation hook restores the previous catalogue and displays the error.
    } finally {
      setReorderPending(null);
    }
  };

  const requestGroupVisibility = (group: AdminAddonGroup, next: boolean) => {
    if (next) {
      void mutations.toggleGroup(group.id, true).catch(() => undefined);
      return;
    }
    setVisibilityTarget({ kind: "group", groupId: group.id, name: group.name });
  };

  const requestOptionVisibility = (group: AdminAddonGroup, optionId: string, next: boolean) => {
    const option = group.options.find((item) => item.id === optionId);
    if (!option) return;
    if (next) {
      void mutations.toggleOption(group.id, optionId, true).catch(() => undefined);
      return;
    }
    const activeOptionCount = group.options.filter((item) => item.is_active).length;
    if (group.is_active && option.is_active && activeOptionCount <= 1) {
      toast.error("Nhóm đang hiển thị phải có ít nhất một option đang bật.");
      return;
    }
    setVisibilityTarget({ kind: "option", groupId: group.id, optionId, name: option.label });
  };

  const confirmHide = async () => {
    if (!visibilityTarget) return;
    setVisibilityBusy(true);
    try {
      if (visibilityTarget.kind === "group") {
        await mutations.toggleGroup(visibilityTarget.groupId, false);
      } else {
        await mutations.toggleOption(visibilityTarget.groupId, visibilityTarget.optionId, false);
      }
      setVisibilityTarget(null);
    } catch {
      // The mutation hook keeps the dialog open and displays the API error.
    } finally {
      setVisibilityBusy(false);
    }
  };

  const createOptionGroup = groups.find((group) => group.id === createOptionGroupId) ?? null;
  const editorGroup = editor ? groups.find((group) => group.id === editor.groupId) ?? null : null;
  const editTarget: AddonEditTarget | null = editor && editorGroup
    ? editor.kind === "group"
      ? { kind: "group", group: editorGroup }
      : (() => {
          const option = editorGroup.options.find((item) => item.id === editor.optionId);
          return option ? { kind: "option" as const, group: editorGroup, option } : null;
        })()
    : null;

  return (
    <div className="space-y-2.5">
      <AddonsToolbar
        groupCount={groups.length}
        activeCount={groups.filter((group) => group.is_active).length}
        status={statusFilter}
        isLoading={isLoading}
        isFetching={isFetching}
        onRefresh={() => void refetch()}
        onCreate={() => requestAction({ kind: "create-group" })}
        onStatusChange={setStatusFilter}
      />

      {isLoading ? (
        <div className="space-y-2.5">{Array.from({ length: 3 }).map((_, index) => <div key={index} className="h-40 animate-pulse rounded-xl bg-secondary/30" />)}</div>
      ) : isError ? (
        <div className="rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-6 text-center text-sm text-destructive">
          Không thể tải danh sách. <button type="button" onClick={() => void refetch()} className="font-medium text-primary hover:underline">Thử lại</button>
        </div>
      ) : filteredGroups.length === 0 ? (
        <AddonsEmptyState catalogueEmpty={groups.length === 0} status={statusFilter} onCreate={() => requestAction({ kind: "create-group" })} />
      ) : (
        <div className="space-y-2.5">
          {filteredGroups.map((group, index) => (
            <AddonGroupCard
              key={group.id}
              item={group}
              isFirst={index === 0}
              isLast={index === filteredGroups.length - 1}
              busyKey={mutations.busyKey}
              isHighlighted={highlightedGroupId === group.id}
              highlightedOptionId={highlightedOptionId}
              reorderBusy={mutations.busyKey === "reorder"}
              pendingGroupDirection={reorderPending?.kind === "group" && reorderPending.groupId === group.id ? reorderPending.direction : null}
              pendingOption={reorderPending?.kind === "option" && reorderPending.groupId === group.id ? { optionId: reorderPending.optionId, direction: reorderPending.direction } : null}
              onEditGroup={() => requestAction({ kind: "editor", editor: { kind: "group", groupId: group.id } })}
              onToggleGroup={(next) => requestGroupVisibility(group, next)}
              onReorderGroup={(direction) => void reorderGroup(group.id, direction)}
              onCreateOption={() => requestAction({ kind: "create-option", groupId: group.id })}
              onEditOption={(optionId) => requestAction({ kind: "editor", editor: { kind: "option", groupId: group.id, optionId } })}
              onToggleOption={(optionId, next) => requestOptionVisibility(group, optionId, next)}
              onReorderOption={(optionId, direction) => void reorderOption(group.id, optionId, direction)}
            />
          ))}
        </div>
      )}

      {createGroupOpen ? (
        <AddonGroupModal
          mode="create"
          onClose={() => setCreateGroupOpen(false)}
          onSuccess={(group) => {
            mutations.acceptCreatedGroup(group);
            setStatusFilter(group.is_active ? "active" : "inactive");
            setHighlightedGroupId(group.id);
          }}
        />
      ) : null}
      {createOptionGroup ? (
        <AddonOptionCreateOverlay
          group={createOptionGroup}
          isSubmitting={mutations.busyKey === `option-create:${createOptionGroup.id}`}
          onClose={() => setCreateOptionGroupId(null)}
          onSubmit={async (payload, file, filename) => {
            const saved = await mutations.addOption(createOptionGroup.id, payload, file, filename);
            const createdOption = saved.options[saved.options.length - 1];
            setCreateOptionGroupId(null);
            if (createdOption) setHighlightedOptionId(createdOption.id);
          }}
        />
      ) : null}
      {editTarget ? (
        <AddonEditOverlay
          target={editTarget}
          isSubmitting={mutations.busyKey === (editTarget.kind === "group"
            ? `group:${editTarget.group.id}`
            : `option:${editTarget.option.id}`)}
          onDirtyChange={handleDirtyChange}
          onClose={() => requestAction({ kind: "editor", editor: null })}
          onSaveGroup={async (payload, file, filename) => {
            await mutations.saveGroup(editTarget.group.id, payload, file, filename);
            setEditor(null);
            setEditorDirty(false);
            focusTrigger({ kind: "group", groupId: editTarget.group.id });
          }}
          onSaveOption={async (payload, file, filename) => {
            if (editTarget.kind !== "option") return;
            await mutations.saveOption(editTarget.group.id, editTarget.option.id, payload, file, filename);
            setEditor(null);
            setEditorDirty(false);
            focusTrigger({ kind: "option", groupId: editTarget.group.id, optionId: editTarget.option.id });
          }}
        />
      ) : null}
      {visibilityTarget ? (
        <AddonVisibilityConfirm
          target={visibilityTarget}
          isLoading={visibilityBusy}
          onConfirm={() => void confirmHide()}
          onCancel={() => setVisibilityTarget(null)}
        />
      ) : null}
      {pendingAction ? (
        <ConfirmModal
          isOpen
          title="Bỏ thay đổi chưa lưu?"
          message="Các thay đổi trong form hiện tại chưa được lưu. Bạn có muốn bỏ chúng và tiếp tục?"
          confirmLabel="Bỏ thay đổi"
          isDestructive
          onConfirm={() => executeAction(pendingAction)}
          onCancel={() => setPendingAction(null)}
        />
      ) : null}
    </div>
  );
}
