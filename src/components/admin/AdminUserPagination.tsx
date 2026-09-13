import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/src/components/ui/button";

interface AdminUserPaginationProps { page: number; totalPages: number; onPageChange: (page: number) => void; disabled?: boolean }

/** Provides bounded previous and next controls for admin customer lists. */
export function AdminUserPagination({ page, totalPages, onPageChange, disabled = false }: AdminUserPaginationProps) {
  if (totalPages <= 1) return null;
  return <nav aria-label="Phân trang" className="flex items-center justify-center gap-3">
    <Button variant="outline" size="icon" aria-label="Trang trước" disabled={disabled || page <= 1} onClick={() => onPageChange(page - 1)}><ChevronLeft className="h-4 w-4" /></Button>
    <span className="text-sm text-muted-foreground">Trang {page}/{totalPages}</span>
    <Button variant="outline" size="icon" aria-label="Trang sau" disabled={disabled || page >= totalPages} onClick={() => onPageChange(page + 1)}><ChevronRight className="h-4 w-4" /></Button>
  </nav>;
}
