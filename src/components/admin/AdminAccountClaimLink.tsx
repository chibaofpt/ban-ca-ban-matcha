"use client";
import Image from "next/image";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ClaimLinkResult } from "@/contracts/account";
import { createAccountClaimLink } from "@/src/services/accountService";
import { useServerDeadline } from "@/src/hooks/useServerDeadline";
import { useQrCodeImage } from "@/src/hooks/useQrCodeImage";
import { Button } from "@/src/components/ui/button";
import { toLocalPhone } from "@/src/utils/phone";
/** Display an in-memory claim link within the existing customer detail overlay. */
export function AdminAccountClaimLink({ qrToken, phone, onBusyChange }: { qrToken: string; phone: string | null; onBusyChange: (busy: boolean) => void }) {
  const [link, setLink] = useState<ClaimLinkResult | null>(null);
  const remaining = useServerDeadline(link);
  const valid = Boolean(link && remaining > 0);
  const image = useQrCodeImage(valid ? link!.url : null);
  const mutation = useMutation({ mutationFn: createAccountClaimLink, retry: false,
    onMutate: () => { setLink(null); onBusyChange(true); },
    onSuccess: setLink,
    onError: (error) => toast.error(error.message),
    onSettled: () => onBusyChange(false),
  });
  const create = () => mutation.mutate(qrToken);
  return <section className="space-y-4">
    <p className="text-sm text-muted-foreground">Khách mở link hoặc quét QR để tự nhận tài khoản. Link chỉ hiển thị trong phiên này.</p>
    {!link && !mutation.isPending && !mutation.isError ? <Button className="w-full min-h-11" disabled={mutation.isPending} onClick={create}>{mutation.isPending ? "Đang tạo link…" : "Tạo link nhận tài khoản"}</Button> : <>
      {mutation.isPending ? <p role="status" className="text-center text-sm">Đang tạo link…</p> : mutation.isError ? <p role="alert" className="rounded-xl bg-muted p-4 text-sm text-destructive">{mutation.error.message} Vui lòng tạo lại link.</p> : valid && link ? <>
        <p role="status" className="text-center text-sm">Còn {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}</p>
        {image ? <Image src={image} alt="QR link nhận tài khoản" width={256} height={256} unoptimized className="mx-auto rounded-xl" /> : <p className="text-center text-sm">Đang tạo QR…</p>}
        <label htmlFor="account-claim-url" className="block text-sm">Link nhận tài khoản</label>
        <input id="account-claim-url" readOnly value={link.url} onFocus={(event) => event.currentTarget.select()} className="min-h-11 w-full rounded-xl border bg-muted px-3 text-sm" />
        <Button className="w-full min-h-11" variant="outline" onClick={() => void navigator.clipboard.writeText(link.url).then(() => toast.success("Đã sao chép link"), () => toast.error("Không thể sao chép tự động"))}>Sao chép link</Button>
      </> : <p role="alert" className="rounded-xl bg-muted p-4 text-sm">Link đã hết hạn. Tạo lại link để gửi cho khách.</p>}
      <div className="grid grid-cols-2 gap-2">
        <Button className="min-h-11" disabled={mutation.isPending} onClick={create}>{mutation.isPending ? "Đang tạo…" : "Tạo lại link"}</Button>
        {phone ? <a className="flex min-h-11 items-center justify-center rounded-xl border px-3 text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring" href={`https://zalo.me/${toLocalPhone(phone)}`} target="_blank" rel="noopener noreferrer">Mở Zalo</a> : <Button variant="outline" className="min-h-11" disabled>Mở Zalo</Button>}
      </div>
    </>}
  </section>;
}
