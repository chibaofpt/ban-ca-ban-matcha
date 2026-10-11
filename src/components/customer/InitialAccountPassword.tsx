"use client";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { GoogleAccountButton } from "@/src/components/common/GoogleAccountButton";
import { Button } from "@/src/components/ui/button";
import { changePassword } from "@/src/services/profileService";
const schema = z.object({ new_password: z.string().min(6, "Ít nhất 6 ký tự").refine((value) => new TextEncoder().encode(value).length <= 72, "Tối đa 72 byte UTF-8"), confirm: z.string() }).refine((values) => values.new_password === values.confirm, { path: ["confirm"], message: "Mật khẩu xác nhận không khớp" });
/** Require a fresh Google proof before setting the first password on an eligible account. */
export function InitialAccountPassword({ onSaved }: { onSaved: () => void }) {
  const [proof, setProof] = useState<string | null>(null);
  const form = useForm({ resolver: zodResolver(schema), mode: "onBlur", defaultValues: { new_password: "", confirm: "" } });
  const mutation = useMutation({ mutationFn: changePassword, retry: false, onSuccess: onSaved, onError: () => setProof(null) });
  return <div className="space-y-4">
    {!proof ? <GoogleAccountButton purpose="REAUTH" onSuccess={(result) => { if ("reauth_proof" in result) setProof(result.reauth_proof); }} /> : <p className="text-sm text-primary">Đã xác nhận Google cho lần lưu này.</p>}
    <form className="space-y-4" onSubmit={form.handleSubmit((values) => { if (proof) mutation.mutate({ new_password: values.new_password, reauth_proof: proof }); })}>
      {(["new_password", "confirm"] as const).map((field) => <div className="space-y-1" key={field}><label className="text-sm" htmlFor={field}>{field === "new_password" ? "Mật khẩu mới" : "Xác nhận mật khẩu"}</label><input id={field} type="password" autoComplete="new-password" {...form.register(field)} className="min-h-11 w-full rounded-xl border bg-background px-3 focus-visible:ring-2 focus-visible:ring-ring" />{form.formState.errors[field] ? <p className="text-xs text-destructive">{form.formState.errors[field]?.message}</p> : null}</div>)}
      {mutation.isError ? <p role="alert" className="text-sm text-destructive">{mutation.error.message}</p> : null}
      <Button type="submit" className="min-h-11 w-full" disabled={!proof || mutation.isPending}>{mutation.isPending ? "Đang lưu…" : "Đặt mật khẩu"}</Button>
    </form>
  </div>;
}
