"use client";

import { useCallback, useMemo, useState } from "react";
import { Layers, Plus, RefreshCw, Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import AddonGroupCard from "@/src/components/admin/AddonGroupCard";
import AddonGroupModal from "@/src/components/admin/AddonGroupModal";
import AddonOptionCreateOverlay from "@/src/components/admin/AddonOptionCreateOverlay";
import { ConfirmModal } from "@/src/components/ui/ConfirmModal";
import { useAdminAddonMutations } from "@/src/hooks/useAdminAddonMutations";
import { listAdminAddonGroups } from "@/src/services/adminAddonService";
import type { AddonGroupReorderEntry, AdminAddonGroup } from "@/src/lib/types/addonGroup";
import { cn } from "@/src/utils/cn";

type Editor =
  | { kind: "group"; groupId: string }
  | { kind: "option"; groupId: string; optionId: string }
  | null;

type PendingAction =
  | { kind: "editor"; editor: Editor }
  | { kind: "create-group" }
  | { kind: "create-option"; groupId: string };

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
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"active" | "all" | "inactive">("active");
  const [editor, setEditor] = useState<Editor>(null);
  const [editorDirty, setEditorDirty] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [createOptionGroupId, setCreateOptionGroupId] = useState<string | null>(null);

  const { data = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["admin", "addon-groups"],
    queryFn: listAdminAddonGroups,
  });
  const groups = useMemo(() => orderedGroups(data), [data]);
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const filteredGroups = groups.filter((group) => {
    const statusMatches = statusFilter === "all"
      || (statusFilter === "active" ? group.is_active : !group.is_active);
    return statusMatches && (!normalizedSearch || group.name.toLowerCase().includes(normalizedSearch));
  });

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

  const reorderGroup = (groupId: string, direction: "up" | "down") => {
    if (normalizedSearch) return;
    const visibleIndex = filteredGroups.findIndex((group) => group.id === groupId);
    const swapVisibleIndex = direction === "up" ? visibleIndex - 1 : visibleIndex + 1;
    if (visibleIndex < 0 || swapVisibleIndex < 0 || swapVisibleIndex >= filteredGroups.length) return;
    const swapId = filteredGroups[swapVisibleIndex].id;
    const next = [...groups];
    const currentIndex = next.findIndex((group) => group.id === groupId);
    const swapIndex = next.findIndex((group) => group.id === swapId);
    [next[currentIndex], next[swapIndex]] = [next[swapIndex], next[currentIndex]];
    void mutations.saveOrder(reorderPayload(next)).catch(() => undefined);
  };

  const reorderOption = (groupId: string, optionId: string, direction: "up" | "down") => {
    const next = groups.map((group) => ({ ...group, options: [...group.options] }));
    const group = next.find((item) => item.id === groupId);
    if (!group) return;
    const currentIndex = group.options.findIndex((option) => option.id === optionId);
    const swapIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (currentIndex < 0 || swapIndex < 0 || swapIndex >= group.options.length) return;
    [group.options[currentIndex], group.options[swapIndex]] = [group.options[swapIndex], group.options[currentIndex]];
    void mutations.saveOrder(reorderPayload(next)).catch(() => undefined);
  };

  const createOptionGroup = groups.find((group) => group.id === createOptionGroupId) ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">Addon Groups</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{groups.length} nhóm · {groups.filter((group) => group.is_active).length} đang hoạt động</p>
        </div>
        <div className="flex gap-2">
          <button type="button" aria-label="Làm mới" onClick={() => void refetch()} className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-secondary/60">
            <RefreshCw className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => requestAction({ kind: "create-group" })} className="flex min-h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            <Plus className="h-4 w-4" /> Thêm nhóm
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <label className="relative min-w-[13rem] flex-1">
          <span className="sr-only">Tìm tên nhóm</span>
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input type="search" placeholder="Tìm tên nhóm..." value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} className="w-full rounded-xl border border-border bg-background py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary/40" />
        </label>
        <div className="flex overflow-hidden rounded-xl border border-border text-sm">
          {([
            ["active", "Đang hoạt động"],
            ["all", "Tất cả"],
            ["inactive", "Đã ẩn"],
          ] as const).map(([id, label]) => (
            <button key={id} type="button" onClick={() => setStatusFilter(id)} className={cn("min-h-10 px-3", statusFilter === id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary/40")}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {normalizedSearch ? <p className="text-xs text-muted-foreground">Xóa nội dung tìm kiếm để thay đổi thứ tự các nhóm. Thứ tự option vẫn có thể chỉnh.</p> : null}

      {isLoading ? (
        <div className="space-y-4">{Array.from({ length: 3 }).map((_, index) => <div key={index} className="h-52 animate-pulse rounded-2xl bg-secondary/30" />)}</div>
      ) : isError ? (
        <div className="rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-6 text-center text-sm text-destructive">
          Không thể tải danh sách. <button type="button" onClick={() => void refetch()} className="font-medium text-primary hover:underline">Thử lại</button>
        </div>
      ) : filteredGroups.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center text-muted-foreground"><Layers className="mb-4 h-12 w-12 opacity-50" /><p className="text-sm">Không tìm thấy nhóm addon phù hợp.</p></div>
      ) : (
        <div className="space-y-4">
          {filteredGroups.map((group, index) => (
            <AddonGroupCard
              key={group.id}
              item={group}
              isFirst={index === 0}
              isLast={index === filteredGroups.length - 1}
              canReorderGroup={!normalizedSearch}
              isEditingGroup={editor?.kind === "group" && editor.groupId === group.id}
              editingOptionId={editor?.kind === "option" && editor.groupId === group.id ? editor.optionId : null}
              busyKey={mutations.busyKey}
              onEditGroup={() => requestAction({ kind: "editor", editor: { kind: "group", groupId: group.id } })}
              onCancelEdit={() => requestAction({ kind: "editor", editor: null })}
              onDirtyChange={handleDirtyChange}
              onToggleGroup={(next) => void mutations.toggleGroup(group.id, next).catch(() => undefined)}
              onReorderGroup={(direction) => reorderGroup(group.id, direction)}
              onCreateOption={() => requestAction({ kind: "create-option", groupId: group.id })}
              onEditOption={(optionId) => requestAction({ kind: "editor", editor: { kind: "option", groupId: group.id, optionId } })}
              onToggleOption={(optionId, next) => void mutations.toggleOption(group.id, optionId, next).catch(() => undefined)}
              onReorderOption={(optionId, direction) => reorderOption(group.id, optionId, direction)}
              onSaveGroup={async (payload, file, filename) => {
                await mutations.saveGroup(group.id, payload, file, filename);
                setEditor(null);
                setEditorDirty(false);
                focusTrigger({ kind: "group", groupId: group.id });
              }}
              onSaveOption={async (optionId, payload, file, filename) => {
                await mutations.saveOption(group.id, optionId, payload, file, filename);
                setEditor(null);
                setEditorDirty(false);
                focusTrigger({ kind: "option", groupId: group.id, optionId });
              }}
            />
          ))}
        </div>
      )}

      {createGroupOpen ? <AddonGroupModal mode="create" onClose={() => setCreateGroupOpen(false)} onSuccess={mutations.acceptCreatedGroup} /> : null}
      {createOptionGroup ? (
        <AddonOptionCreateOverlay
          group={createOptionGroup}
          isSubmitting={mutations.busyKey === `option-create:${createOptionGroup.id}`}
          onClose={() => setCreateOptionGroupId(null)}
          onSubmit={async (payload, file, filename) => { await mutations.addOption(createOptionGroup.id, payload, file, filename); setCreateOptionGroupId(null); }}
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
