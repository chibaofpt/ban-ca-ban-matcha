"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/src/components/ui/button";

const schema = z.object({ points: z.coerce.number().int("Điểm phải là số nguyên").min(1, "Tối thiểu 1 điểm").max(100, "Tối đa 100 điểm") });
type InputValues = z.input<typeof schema>;
type Values = z.output<typeof schema>;

interface AdminUserPointsGiftProps { currentBalance: number; pending: boolean; onSubmit: (points: number) => Promise<void> }

/** Renders the validated points gift form inside a customer sheet. */
export function AdminUserPointsGift({ currentBalance, pending, onSubmit }: AdminUserPointsGiftProps) {
  const { register, setValue, handleSubmit, formState: { errors } } = useForm<InputValues, object, Values>({ resolver: zodResolver(schema), mode: "onBlur", defaultValues: { points: 1 } });
  return <form className="space-y-3 rounded-2xl border border-border p-4" onSubmit={handleSubmit(async ({ points }) => onSubmit(points))}>
    <div><p className="font-semibold">Tặng điểm</p><p className="text-sm text-muted-foreground">Số dư hiện tại: {currentBalance.toLocaleString("vi-VN")} điểm</p></div>
    <div className="grid grid-cols-5 gap-2">{[1,2,5,10,20].map((value) => <Button key={value} type="button" size="sm" variant="outline" disabled={pending} onClick={() => setValue("points", value, { shouldValidate: true })}>+{value}</Button>)}</div>
    <label className="block text-sm font-medium" htmlFor="gift-points">Nhập số điểm</label>
    <input id="gift-points" type="number" min={1} max={100} disabled={pending} {...register("points")} className="min-h-11 w-full rounded-xl border border-input bg-background px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
    {errors.points ? <p role="alert" className="text-sm text-destructive">{errors.points.message}</p> : null}
    <Button type="submit" disabled={pending} className="w-full">{pending ? <Loader2 className="h-4 w-4 animate-spin" aria-label="Đang tặng điểm" /> : "Tặng điểm"}</Button>
  </form>;
}
