"use client";

import { useState, useEffect } from "react";
import { Coins, Gift, Plus, Pencil, Trash2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/src/utils/cn";
import { toast } from "sonner";
import { ConfirmModal } from "@/src/components/ui/ConfirmModal";
import {
  listVoucherPackages,
  createVoucherPackage,
  updateVoucherPackage,
  deleteVoucherPackage,
  type VoucherPackage,
  type CreateVoucherPackageInput
} from "@/src/services/adminVoucherService";
import { fetchMenuItems } from "@/src/services/menuService";
import { fetchPowders } from "@/src/services/powderService";
import type { MenuItem } from "@/src/lib/types/menu";
import type { Powder } from "@/src/lib/types/powder";

interface VoucherPackageForm {
  name: string;
  description: string;
  voucher_type: "DISCOUNT" | "PRODUCT" | "ADDON" | "FREESHIP";
  points_cost: number;
  expires_after_days: number | "";
  // DISCOUNT fields
  discount_type: "PERCENT" | "FIXED";
  discount_value: number | "";
  // PRODUCT fields
  menu_item_id: string;
  size: "M" | "L" | "XL";
  matcha_powder_id: string;
  milk_type_id: string;
  // ADDON fields
  addon_option_id: string;
  // FREESHIP fields
  covered_delivery_fee_vnd: number | "";
  min_order_vnd: number | "";
  // LIMITS
  quantity: number | "";
  max_per_user: number | "";
}

const emptyForm: VoucherPackageForm = {
  name: "",
  description: "",
  voucher_type: "DISCOUNT",
  points_cost: 10,
  expires_after_days: 30,
  discount_type: "PERCENT",
  discount_value: "",
  menu_item_id: "",
  size: "M",
  matcha_powder_id: "",
  milk_type_id: "",
  addon_option_id: "",
  covered_delivery_fee_vnd: "",
  min_order_vnd: "",
  quantity: "",
  max_per_user: 1,
};


function VoucherTypeBadge({ type }: { type: VoucherPackage["voucher_type"] }) {
  const map: Record<VoucherPackage["voucher_type"], { label: string; color: string }> = {
    DISCOUNT: { label: "GIẢM GIÁ", color: "bg-blue-100 text-blue-800" },
    PRODUCT: { label: "SẢN PHẨM", color: "bg-orange-100 text-orange-800" },
    ADDON: { label: "ADDON", color: "bg-green-100 text-green-800" },
    FREESHIP: { label: "FREESHIP", color: "bg-purple-100 text-purple-800" },
  };

  const config = map[type];

  return (
    <span
      className={cn(
        "shrink-0 text-[10px] px-2 py-0.5 rounded-full font-bold",
        config.color
      )}
    >
      {config.label}
    </span>
  );
}

export default function AdminVoucherPackagesPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<VoucherPackageForm>(emptyForm);

  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    isDestructive: boolean;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: "",
    message: "",
    isDestructive: false,
    onConfirm: () => {},
  });

  const { data: voucherPackages = [], isLoading: isPkgsLoading } = useQuery({
    queryKey: ["admin", "voucher-packages"],
    queryFn: listVoucherPackages,
  });

  const { data: menuItems = [], isLoading: isMenuLoading } = useQuery({
    queryKey: ["admin", "menu", "flat"],
    queryFn: fetchMenuItems,
  });

  const { data: powdersData, isLoading: isPowdersLoading } = useQuery({
    queryKey: ["admin", "powders", "raw"],
    queryFn: fetchPowders,
  });
  const powders = powdersData?.data || [];

  const loading = isPkgsLoading || isMenuLoading || isPowdersLoading;

  // Extract unique non-matcha addon options from all menu items
  const uniqueAddonOptions = Array.from(
    new Map(
      menuItems
        .flatMap((item) => item.addon_groups || [])
        .flatMap((group) => group.options || [])
        .filter((opt) => opt.gram_value === null || opt.gram_value <= 0)
        .map((opt) => [opt.id, opt])
    ).values()
  );

  // Extract unique milk types from all menu items
  const uniqueMilkTypes = Array.from(
    new Map(
      menuItems
        .flatMap((item) => item.milk_types || [])
        .map((opt) => [opt.id, opt])
    ).values()
  );

  // Prepopulate select defaults if items are loaded
  useEffect(() => {
    if (menuItems.length > 0 && !form.menu_item_id && form.name === emptyForm.name) {
      setForm(prev => ({
        ...prev,
        menu_item_id: menuItems[0].id
      }));
    }
  }, [menuItems, form.menu_item_id, form.name]);

  // Sync menu_item_id and addon_option_id when dialog opens
  useEffect(() => {
    if (open) {
      if (menuItems.length > 0 && !form.menu_item_id) {
        setForm(prev => ({ ...prev, menu_item_id: menuItems[0].id }));
      }
      if (uniqueAddonOptions.length > 0 && !form.addon_option_id) {
        setForm(prev => ({ ...prev, addon_option_id: uniqueAddonOptions[0].id }));
      }
    }
  }, [open, menuItems, uniqueAddonOptions]);

  const openAdd = () => {
    setEditingId(null);
    setForm({
      ...emptyForm,
      menu_item_id: menuItems[0]?.id || "",
      addon_option_id: uniqueAddonOptions[0]?.id || ""
    });
    setOpen(true);
  };

  const openEdit = (pkg: VoucherPackage) => {
    setEditingId(pkg.id);
    setForm({
      name: pkg.name,
      description: pkg.description || "",
      voucher_type: pkg.voucher_type,
      points_cost: pkg.points_cost,
      expires_after_days: pkg.expires_after_days ?? "",
      discount_type: pkg.discount_type || "PERCENT",
      discount_value: pkg.discount_value ?? "",
      menu_item_id: pkg.menu_item_id || menuItems[0]?.id || "",
      size: pkg.size || "M",
      matcha_powder_id: pkg.matcha_powder_id || "",
      milk_type_id: pkg.milk_type_id || "",
      addon_option_id: pkg.addon_option_id || uniqueAddonOptions[0]?.id || "",
      covered_delivery_fee_vnd: pkg.covered_delivery_fee_vnd ?? "",
      min_order_vnd: pkg.min_order_vnd ?? "",
      quantity: pkg.quantity ?? "",
      max_per_user: pkg.max_per_user ?? 1,
    });
    setOpen(true);
  };

  const createMutation = useMutation({
    mutationFn: createVoucherPackage,
    onSuccess: (newPkg) => {
      queryClient.setQueryData<VoucherPackage[]>(["admin", "voucher-packages"], (old) => [newPkg, ...(old || [])]);
      toast.success("Đã thêm gói voucher mới");
      setOpen(false);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || "Thao tác thất bại.");
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string, data: any }) => updateVoucherPackage(id, data),
    onSuccess: (updated) => {
      queryClient.setQueryData<VoucherPackage[]>(["admin", "voucher-packages"], (old) =>
        old?.map((p) => (p.id === updated.id ? { ...p, ...updated } : p))
      );
      toast.success("Đã cập nhật gói voucher");
      setOpen(false);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || "Thao tác thất bại.");
    }
  });

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error("Vui lòng nhập tên gói voucher");
      return;
    }
    if (form.points_cost < 0) {
      toast.error("Chi phí điểm không được âm");
      return;
    }

    const expiresDays = form.expires_after_days === "" ? null : Number(form.expires_after_days);

    if (editingId) {
      // Edit mode
      updateMutation.mutate({
        id: editingId,
        data: {
          name: form.name,
          description: form.description || null,
          points_cost: form.points_cost,
          expires_after_days: expiresDays,
          quantity: form.quantity === "" ? null : Number(form.quantity),
          max_per_user: form.max_per_user === "" ? null : Number(form.max_per_user),
        }
      });
    } else {
      // Create mode
      let createInput: CreateVoucherPackageInput;

      if (form.voucher_type === "DISCOUNT") {
        if (form.discount_value === "" || Number(form.discount_value) <= 0) {
          toast.error("Vui lòng nhập giá trị giảm giá hợp lệ");
          return;
        }
        createInput = {
          voucher_type: "DISCOUNT",
          name: form.name,
          description: form.description || undefined,
          points_cost: form.points_cost,
          discount_type: form.discount_type,
          discount_value: Number(form.discount_value),
          expires_after_days: expiresDays,
        };
      } else if (form.voucher_type === "PRODUCT") {
        if (!form.menu_item_id) {
          toast.error("Vui lòng chọn một sản phẩm");
          return;
        }
        createInput = {
          voucher_type: "PRODUCT",
          name: form.name,
          description: form.description || undefined,
          points_cost: form.points_cost,
          menu_item_id: form.menu_item_id,
          size: form.size,
          matcha_powder_id: form.matcha_powder_id || undefined,
          milk_type_id: form.milk_type_id || undefined,
          expires_after_days: expiresDays,
          quantity: form.quantity === "" ? null : Number(form.quantity),
          max_per_user: form.max_per_user === "" ? null : Number(form.max_per_user),
        };
      } else if (form.voucher_type === "FREESHIP") {
        if (form.covered_delivery_fee_vnd === "" || Number(form.covered_delivery_fee_vnd) < 1000) {
          toast.error("Vui lòng nhập phí giao hàng tối thiểu 1.000đ");
          return;
        }
        createInput = {
          voucher_type: "FREESHIP",
          name: form.name,
          description: form.description || undefined,
          points_cost: form.points_cost,
          covered_delivery_fee_vnd: Number(form.covered_delivery_fee_vnd),
          min_order_vnd: form.min_order_vnd === "" ? null : Number(form.min_order_vnd),
          expires_after_days: expiresDays,
          quantity: form.quantity === "" ? null : Number(form.quantity),
          max_per_user: form.max_per_user === "" ? null : Number(form.max_per_user),
        };
      } else {
        // ADDON
        if (!form.addon_option_id) {
          toast.error("Vui lòng chọn một addon");
          return;
        }
        createInput = {
          voucher_type: "ADDON",
          name: form.name,
          description: form.description || undefined,
          points_cost: form.points_cost,
          addon_option_id: form.addon_option_id,
          expires_after_days: expiresDays,
          quantity: form.quantity === "" ? null : Number(form.quantity),
          max_per_user: form.max_per_user === "" ? null : Number(form.max_per_user),
        };
      }

      if (createInput.voucher_type === "DISCOUNT") {
        createInput.quantity = form.quantity === "" ? null : Number(form.quantity);
        createInput.max_per_user = form.max_per_user === "" ? null : Number(form.max_per_user);
      }

      createMutation.mutate(createInput);
    }
  };

  const deleteMutation = useMutation({
    mutationFn: deleteVoucherPackage,
    onSuccess: (_, id) => {
      queryClient.setQueryData<VoucherPackage[]>(["admin", "voucher-packages"], (old) =>
        old?.filter((p) => p.id !== id)
      );
      toast.success("Đã ngưng hoạt động gói voucher");
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || "Xóa thất bại");
    }
  });

  const handleDelete = (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: "Xóa gói voucher",
      message: "Bạn có chắc chắn muốn ngưng hoạt động (xóa) gói voucher này? Hành động này không thể hoàn tác.",
      isDestructive: true,
      onConfirm: async () => {
        setConfirmModal((s) => ({ ...s, isOpen: false }));
        deleteMutation.mutate(id);
      },
    });
  };

  const toggleMutation = useMutation({
    mutationFn: ({ id, data }: { id: string, data: { is_active: boolean } }) => updateVoucherPackage(id, data),
    onSuccess: (updated) => {
      queryClient.setQueryData<VoucherPackage[]>(["admin", "voucher-packages"], (old) =>
        old?.map((p) => (p.id === updated.id ? { ...p, is_active: updated.is_active } : p))
      );
      toast.success(updated.is_active ? "Đã kích hoạt gói" : "Đã hủy kích hoạt gói");
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || "Cập nhật thất bại");
    }
  });

  const toggleActive = async (pkg: VoucherPackage) => {
    const nextActive = !pkg.is_active;
    toggleMutation.mutate({ id: pkg.id, data: { is_active: nextActive } });
  };

  const activeVoucherCount = voucherPackages.filter((p) => p.is_active).length;

  return (
    <div className="px-4 md:px-0 py-4 space-y-4 max-w-7xl mx-auto">
      <h1 className="font-serif text-2xl font-semibold">Điểm &amp; Voucher</h1>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 md:gap-6">
        <div className="bg-card border border-border rounded-2xl p-4">
          <Coins className="text-primary mb-2" size={24} />
          <div className="text-2xl font-semibold">—</div>
          <div className="text-xs text-muted-foreground">Tổng điểm đã phát</div>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4">
          <Gift className="text-accent mb-2" size={24} />
          <div className="text-2xl font-semibold">{activeVoucherCount}</div>
          <div className="text-xs text-muted-foreground">Gói đang hoạt động</div>
        </div>
      </div>

      {/* Voucher packages */}
      <div className="bg-card border border-border rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-serif text-lg font-semibold">Gói Voucher</h2>
          <button
            onClick={openAdd}
            className="flex items-center gap-1.5 bg-primary text-primary-foreground text-xs font-medium px-3 py-1.5 rounded-xl hover:bg-primary/90 transition"
          >
            <Plus size={14} />
            Thêm gói
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-6">Đang tải danh sách...</p>
        ) : voucherPackages.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Chưa có gói voucher nào.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {voucherPackages.map((pkg) => (
              <div
                key={pkg.id}
                className="rounded-2xl border bg-card shadow-sm overflow-hidden p-4 space-y-3"
              >
                {/* Row 1: Badge + Name / Toggle + Actions */}
                <div className="flex justify-between items-start">
                  <div className="space-y-1 pr-2">
                    <div className="flex items-center gap-2">
                      <VoucherTypeBadge type={pkg.voucher_type} />
                      <span className="font-bold text-foreground text-sm tracking-wide uppercase line-clamp-1">
                        {pkg.name}
                      </span>
                    </div>
                    {pkg.description && (
                      <div className="text-xs text-muted-foreground line-clamp-2">
                        {pkg.description}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => openEdit(pkg)}
                      className="p-1.5 rounded-lg hover:bg-secondary/40 text-muted-foreground transition"
                      aria-label="Sửa"
                    >
                      <Pencil size={14} />
                    </button>
                  </div>
                </div>

                {/* Body Details */}
                <div className="bg-secondary/20 p-2.5 rounded-xl space-y-2 text-sm text-foreground/90">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground text-xs font-medium">Quyền lợi:</span>
                    <span className="font-medium text-right text-[13px]">
                      {pkg.voucher_type === "DISCOUNT" && (
                        <span>
                          Giảm {pkg.discount_value}
                          {pkg.discount_type === "PERCENT" ? "%" : "đ"}
                        </span>
                      )}
                      {pkg.voucher_type === "PRODUCT" && (
                        <span>
                          {pkg.menuItem?.name || "N/A"} ({pkg.size})
                          {pkg.covered_price_vnd ? ` (Tối đa ${pkg.covered_price_vnd.toLocaleString()}đ)` : ""}
                        </span>
                      )}
                      {pkg.voucher_type === "ADDON" && (
                        <span>
                          Thêm {pkg.addonOption?.label || "N/A"}
                          {pkg.covered_price_vnd ? ` (Tối đa ${pkg.covered_price_vnd.toLocaleString()}đ)` : ""}
                        </span>
                      )}
                      {pkg.voucher_type === "FREESHIP" && (
                        <span>
                          Freeship tối đa {pkg.covered_delivery_fee_vnd?.toLocaleString() ?? "?"}đ
                          {pkg.min_order_vnd ? ` (Đơn từ ${(pkg.min_order_vnd / 1000).toLocaleString()}k)` : ""}
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground text-xs font-medium">Phí đổi:</span>
                    <span className="font-bold text-primary">{pkg.points_cost} điểm</span>
                  </div>
                </div>

                {/* Footer */}
                <div className="border-t border-border pt-3 flex items-center justify-between text-xs">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-muted-foreground">
                      Hạn: {pkg.expires_after_days ? `${pkg.expires_after_days} ngày` : <span className="italic">Vô thời hạn</span>}
                    </span>
                    <span className="font-medium text-foreground">
                      {pkg.quantity !== null ? `Còn ${pkg.quantity} gói` : "Vô hạn"}
                      {pkg.max_per_user ? ` • Tối đa ${pkg.max_per_user}/người` : ""}
                    </span>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <button
                      role="switch"
                      aria-checked={pkg.is_active}
                      onClick={() => toggleActive(pkg)}
                      className={cn(
                        "relative inline-flex h-5 w-9 rounded-full transition",
                        pkg.is_active ? "bg-primary" : "bg-border"
                      )}
                    >
                      <span
                        className={cn(
                          "block h-4 w-4 rounded-full bg-white shadow transition-transform m-0.5",
                          pkg.is_active ? "translate-x-4" : "translate-x-0"
                        )}
                      />
                    </button>
                    <span className={cn("text-[10px] font-medium", pkg.is_active ? "text-primary" : "text-muted-foreground")}>
                      {pkg.is_active ? 'Hoạt động' : 'Tạm ẩn'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add/edit dialog */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="relative bg-card rounded-2xl p-6 w-full max-w-sm md:max-w-md mx-4 shadow-xl space-y-3 max-h-[90vh] overflow-y-auto">
            <h2 className="font-serif text-lg font-semibold">
              {editingId ? "Sửa gói voucher" : "Thêm gói voucher"}
            </h2>

            <div>
              <label className="text-sm font-medium text-foreground">Tên gói</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ví dụ: Giảm 10%"
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-primary/40 mt-1"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-foreground">Mô tả gói (Không bắt buộc)</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Ví dụ: Áp dụng khi ăn tại quán..."
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-primary/40 mt-1 h-16 resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-foreground">Tổng số lượng (để trống = Vô hạn)</label>
                <input
                  type="number"
                  min={1}
                  value={form.quantity}
                  onChange={(e) =>
                    setForm({ ...form, quantity: e.target.value === "" ? "" : Number(e.target.value) })
                  }
                  placeholder="Ví dụ: 100"
                  className="rounded-xl border border-border bg-background px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-primary/40 mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Tối đa mỗi khách</label>
                <input
                  type="number"
                  min={1}
                  value={form.max_per_user}
                  onChange={(e) =>
                    setForm({ ...form, max_per_user: e.target.value === "" ? "" : Number(e.target.value) })
                  }
                  placeholder="Mặc định: 1"
                  className="rounded-xl border border-border bg-background px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-primary/40 mt-1"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-foreground">Chi phí (điểm)</label>
                <input
                  type="number"
                  min={0}
                  value={form.points_cost}
                  onChange={(e) =>
                    setForm({ ...form, points_cost: Number(e.target.value) })
                  }
                  className="rounded-xl border border-border bg-background px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-primary/40 mt-1"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Hạn dùng (ngày)</label>
                <input
                  type="number"
                  min={1}
                  value={form.expires_after_days}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      expires_after_days: e.target.value === "" ? "" : Number(e.target.value),
                    })
                  }
                  placeholder="Để trống = vô thời hạn"
                  className="rounded-xl border border-border bg-background px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-primary/40 mt-1"
                />
              </div>
            </div>

            {editingId ? (
              <div className="bg-secondary/20 p-3 rounded-xl text-sm space-y-1 mb-2">
                <div className="font-medium text-foreground pb-1 border-b border-border/50 mb-2">Chi tiết quyền lợi (Không thể sửa)</div>
                <div><span className="text-muted-foreground">Loại Voucher:</span> {form.voucher_type === "DISCOUNT" ? "Giảm giá" : form.voucher_type === "PRODUCT" ? "Sản phẩm" : form.voucher_type === "ADDON" ? "Topping Addon" : "Freeship"}</div>
                
                {form.voucher_type === "DISCOUNT" && (
                  <div><span className="text-muted-foreground">Mức giảm:</span> {form.discount_value}{form.discount_type === "PERCENT" ? "%" : "đ"}</div>
                )}
                
                {form.voucher_type === "PRODUCT" && (
                  <>
                    <div><span className="text-muted-foreground">Sản phẩm:</span> {menuItems.find(i => i.id === form.menu_item_id)?.name} (Size {form.size})</div>
                    {form.matcha_powder_id && <div><span className="text-muted-foreground">Bột đổi:</span> {powders.find(p => p.id === form.matcha_powder_id)?.name}</div>}
                    {form.milk_type_id && <div><span className="text-muted-foreground">Sữa đổi:</span> {uniqueMilkTypes.find(m => m.id === form.milk_type_id)?.name}</div>}
                  </>
                )}

                {form.voucher_type === "ADDON" && (
                  <div><span className="text-muted-foreground">Addon:</span> {uniqueAddonOptions.find(a => a.id === form.addon_option_id)?.label}</div>
                )}
              </div>
            ) : (
              <>
                <div>
                  <label className="text-sm font-medium text-foreground">Loại voucher</label>
                  <select
                    value={form.voucher_type}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        voucher_type: e.target.value as VoucherPackageForm["voucher_type"],
                      })
                    }
                    className="rounded-xl border border-border bg-background px-3 py-2 text-sm w-full mt-1"
                  >
                    <option value="DISCOUNT">Giảm giá</option>
                    <option value="PRODUCT">Sản phẩm</option>
                    <option value="ADDON">Topping Addon</option>
                    <option value="FREESHIP">Freeship</option>
                  </select>
                </div>

                {form.voucher_type === "DISCOUNT" && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm font-medium text-foreground">Kiểu giảm</label>
                      <select
                        value={form.discount_type}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            discount_type: e.target.value as "PERCENT" | "FIXED",
                          })
                        }
                        className="rounded-xl border border-border bg-background px-3 py-2 text-sm w-full mt-1"
                      >
                        <option value="PERCENT">%</option>
                        <option value="FIXED">VND</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-foreground">Giá trị giảm</label>
                      <input
                        type="number"
                        min={0}
                        value={form.discount_value}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            discount_value: e.target.value === "" ? "" : Number(e.target.value),
                          })
                        }
                        className="rounded-xl border border-border bg-background px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-primary/40 mt-1"
                      />
                    </div>
                  </div>
                )}

                {form.voucher_type === "PRODUCT" && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-sm font-medium text-foreground">Chọn sản phẩm</label>
                        <select
                          value={form.menu_item_id}
                          onChange={(e) => setForm({ ...form, menu_item_id: e.target.value })}
                          className="rounded-xl border border-border bg-background px-3 py-2 text-sm w-full mt-1"
                        >
                          {menuItems.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-foreground">Chọn Size</label>
                        <select
                          value={form.size}
                          onChange={(e) => setForm({ ...form, size: e.target.value as "M" | "L" | "XL" })}
                          className="rounded-xl border border-border bg-background px-3 py-2 text-sm w-full mt-1"
                        >
                          <option value="M">Size M</option>
                          <option value="L">Size L</option>
                          <option value="XL">Size XL</option>
                        </select>
                      </div>
                    </div>
                    {menuItems.find(i => i.id === form.menu_item_id)?.category === "fusion" && (
                      <div>
                        <label className="text-sm font-medium text-foreground">Đổi Bột Matcha (Tùy chọn)</label>
                        <select
                          value={form.matcha_powder_id}
                          onChange={(e) => setForm({ ...form, matcha_powder_id: e.target.value })}
                          className="rounded-xl border border-border bg-background px-3 py-2 text-sm w-full mt-1"
                        >
                          <option value="">-- Mặc định của sản phẩm --</option>
                          {powders.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    {menuItems.find(i => i.id === form.menu_item_id)?.category === "latte" && (
                      <div>
                        <label className="text-sm font-medium text-foreground">Đổi Sữa (Tùy chọn)</label>
                        <select
                          value={form.milk_type_id}
                          onChange={(e) => setForm({ ...form, milk_type_id: e.target.value })}
                          className="rounded-xl border border-border bg-background px-3 py-2 text-sm w-full mt-1"
                        >
                          <option value="">-- Mặc định (Sữa bò) --</option>
                          {uniqueMilkTypes.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                )}

                {form.voucher_type === "ADDON" && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm font-medium text-foreground">Chọn Topping Addon</label>
                      <select
                        value={form.addon_option_id}
                        onChange={(e) => setForm({ ...form, addon_option_id: e.target.value })}
                        className="rounded-xl border border-border bg-background px-3 py-2 text-sm w-full mt-1"
                      >
                        {uniqueAddonOptions.map((addon) => (
                          <option key={addon.id} value={addon.id}>
                            {addon.label} ({addon.price_vnd.toLocaleString()}đ)
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
                {form.voucher_type === "FREESHIP" && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-sm font-medium text-foreground">Phí giao hàng được bao (VND)</label>
                      <input
                        type="number"
                        min={1000}
                        step={1000}
                        value={form.covered_delivery_fee_vnd}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            covered_delivery_fee_vnd: e.target.value === "" ? "" : Number(e.target.value),
                          })
                        }
                        placeholder="Ví dụ: 30000"
                        className="rounded-xl border border-border bg-background px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-primary/40 mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-foreground">Đơn tối thiểu (VND) — Để trống = không yêu cầu</label>
                      <input
                        type="number"
                        min={1000}
                        step={1000}
                        value={form.min_order_vnd}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            min_order_vnd: e.target.value === "" ? "" : Number(e.target.value),
                          })
                        }
                        placeholder="Ví dụ: 100000 (đơn từ 100k)"
                        className="rounded-xl border border-border bg-background px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-primary/40 mt-1"
                      />
                    </div>
                  </div>
                )}
              </>
            )}

            <div className="flex gap-2 justify-end pt-1">
              <button
                type="button"
                disabled={createMutation.isPending || updateMutation.isPending}
                onClick={() => setOpen(false)}
                className="px-4 py-2 rounded-xl border border-border text-sm hover:bg-secondary/40 transition disabled:opacity-50"
              >
                Huỷ
              </button>
              <button
                type="button"
                disabled={createMutation.isPending || updateMutation.isPending}
                onClick={handleSave}
                className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm hover:bg-primary/90 transition flex items-center gap-2 disabled:opacity-70"
              >
                {(createMutation.isPending || updateMutation.isPending) ? (
                  <>
                    <span className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin"></span>
                    Đang lưu...
                  </>
                ) : (
                  editingId ? "Lưu thay đổi" : "Thêm gói"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        isDestructive={confirmModal.isDestructive}
        onCancel={() => setConfirmModal((s) => ({ ...s, isOpen: false }))}
        onConfirm={confirmModal.onConfirm}
      />
    </div>
  );
}
