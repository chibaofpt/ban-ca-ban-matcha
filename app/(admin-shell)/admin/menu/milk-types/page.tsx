import type { Metadata } from "next";
import { Milk } from "lucide-react";

export const metadata: Metadata = {
  title: "Quản lý Loại Sữa | Bạn Cá Bán Matcha",
  description: "Trang quản lý các loại sữa cho Admin.",
};

/** Placeholder — Milk Types CRUD will be implemented in a separate task. */
export default function AdminMilkTypesRoute() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4 text-muted-foreground p-8">
      <Milk size={48} strokeWidth={1.2} />
      <div className="text-center">
        <p className="text-lg font-medium text-foreground">Quản lý Loại Sữa</p>
        <p className="text-sm mt-1">Tính năng đang được phát triển.</p>
      </div>
    </div>
  );
}
