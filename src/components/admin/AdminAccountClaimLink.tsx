"use client";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Copy, Loader2 } from "lucide-react";
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
  const [copying, setCopying] = useState<"link" | "zalo" | null>(null);
  const initialized = useRef(false);
  const working = useRef(false);
  const remaining = useServerDeadline(link);
  const valid = Boolean(link && remaining > 0);
  const image = useQrCodeImage(valid ? link!.url : null);
  const mutation = useMutation({ mutationFn: createAccountClaimLink, retry: false,
    onMutate: () => { setLink(null); onBusyChange(true); },
    onSuccess: setLink,
    onError: (error) => toast.error(error.message),
    onSettled: () => { working.current = false; onBusyChange(false); },
  });
  const { mutate } = mutation;
  const create = useCallback(() => {
    if (working.current) return;
    working.current = true;
    mutate(qrToken);
  }, [mutate, qrToken]);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    create();
  }, [create]);
  const creating = mutation.isPending || (!link && !mutation.isError);
  const busy = creating || copying !== null;
  const copyLink = async (openZalo = false) => {
    if (working.current || !valid || !link || (openZalo && !phone)) return;
    working.current = true; setCopying(openZalo ? "zalo" : "link"); onBusyChange(true);
    const deadline = performance.now() + remaining * 1000;
    let popup: Window | null = null;
    try {
      if (openZalo) {
        // Reserve the tab during the click; navigating after clipboard permission may lose activation.
        popup = window.open("about:blank", "_blank");
        if (popup) popup.opener = null;
      }
      await navigator.clipboard.writeText(link.url);
      if (performance.now() >= deadline) { popup?.close(); toast.error("Link đã hết hạn. Vui lòng tạo lại link."); return; }
      if (openZalo && phone) {
        if (!popup) { toast.error("Đã sao chép link. Hãy cho phép mở tab mới để mở Zalo."); return; }
        popup.location.replace(`https://zalo.me/${toLocalPhone(phone)}`);
        toast.success("Đã sao chép link và mở Zalo");
      } else toast.success("Đã sao chép link");
    } catch { popup?.close(); toast.error("Không thể hoàn tất sao chép link. Vui lòng thử lại."); }
    finally { working.current = false; setCopying(null); onBusyChange(false); }
  };
  const actions = <div className="grid shrink-0 grid-cols-2 gap-2">
        <Button className="min-h-11" disabled={busy} onClick={create}>{creating ? "Đang tạo…" : "Tạo lại link"}</Button>
        <Button type="button" className="min-h-11 bg-sky-700 text-white hover:bg-sky-800 dark:bg-sky-400 dark:text-sky-950 dark:hover:bg-sky-300" disabled={busy || !valid || !phone} onClick={() => void copyLink(true)}>
          {copying === "zalo" ? <><Loader2 className="size-4 animate-spin" aria-hidden="true" />Đang mở…</> : "Mở Zalo"}
        </Button>
      </div>;
  return <section className="flex min-h-0 flex-1 flex-col gap-2" aria-busy={busy}>
    {valid && link ? <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto] gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:grid-rows-1 landscape:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] landscape:grid-rows-1">
      <div className="flex min-h-0 min-w-0 flex-col gap-2">
        <p role="status" className="shrink-0 text-center text-sm">Còn {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}</p>
        <div className="flex min-h-0 flex-1 items-center justify-center">
          {image ? <Image src={image} alt="QR link nhận tài khoản" width={256} height={256} unoptimized className="h-full max-h-64 w-full max-w-64 object-contain" /> : <p className="text-center text-sm">Đang tạo QR…</p>}
        </div>
      </div>
      <div className="flex min-w-0 flex-col justify-center gap-2">
        <p className="text-xs leading-4 text-muted-foreground landscape:hidden">Quét QR hoặc mở link để nhận tài khoản.</p>
        <p id="account-claim-url-label" className="text-xs leading-4">Link nhận tài khoản</p>
        <div role="group" aria-labelledby="account-claim-url-label" className="flex min-w-0 items-center gap-2">
          <p className="min-w-0 flex-1 select-all break-all rounded-xl border bg-muted px-3 py-2 text-xs leading-4" dir="ltr">{link.url}</p>
          <Button type="button" variant="outline" size="icon" className="size-11 shrink-0" aria-label="Sao chép link nhận tài khoản" title="Sao chép link" disabled={busy} onClick={() => void copyLink()}>
            {copying === "link" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
          </Button>
        </div>
        {actions}
      </div>
    </div> : <>
      <div className="flex min-h-0 flex-1 items-center justify-center">
        {creating ? <p role="status" className="text-center text-sm">Đang tạo link…</p> : mutation.isError ? <p role="alert" className="rounded-xl bg-muted p-3 text-sm text-destructive">{mutation.error.message} Vui lòng tạo lại link.</p> : <p role="alert" className="rounded-xl bg-muted p-3 text-sm">Link đã hết hạn. Tạo lại link để gửi cho khách.</p>}
      </div>
      {actions}
    </>}
  </section>;
}
