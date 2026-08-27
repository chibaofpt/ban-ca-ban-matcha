import { redirect } from "next/navigation";

/** Preserves old bookmarks while promotions are managed as BUNDLE vouchers. */
export default function PromotionsPage() {
  redirect("/admin/voucher-packages?type=BUNDLE");
}
