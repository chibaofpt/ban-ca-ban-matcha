import type { Metadata } from "next";
import { Layers } from "lucide-react";

export const metadata: Metadata = {
  title: "Quản lý Addon Groups | Bạn Cá Bán Matcha",
  description: "Trang quản lý addon groups toàn cục cho Admin.",
};

/** Placeholder — Addon Groups CRUD will be implemented in a separate task. */
export default function AdminAddonGroupsRoute() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4 text-muted-foreground p-8">
      <Layers size={48} strokeWidth={1.2} />
      <div className="text-center">
        <p className="text-lg font-medium text-foreground">Quản lý Addon Groups</p>
        <p className="text-sm mt-1">Tính năng đang được phát triển.</p>
      </div>
    </div>
  );
}
