"use client";

import { useCallback, useRef, useState } from "react";
import { useForm, type FieldPath, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { adminVoucherDraftSchema, getAdminVoucherStep2FieldPaths } from "@/src/lib/validations/adminVoucher";
import { createEmptyVoucherDraft, type VoucherDraft } from "@/src/lib/utils/adminVoucherForm";

type DraftUpdater = (current: VoucherDraft) => VoucherDraft;

function normalizeDraft(draft: VoucherDraft): VoucherDraft {
  let next = draft;
  if (next.visibility === "PRIVATE") next = { ...next, acquisitionMode: "FREE_CLAIM", pointsCost: 0, maxPerUser: 1 };
  if (next.acquisitionMode !== "POINTS_EXCHANGE") next = { ...next, pointsCost: 0, maxPerUser: 1 };
  if (next.rewardKind === "PRODUCT") next = { ...next, rewardAddonOptionIds: [], benefitScaling: "PER_BUNDLE" };
  if (next.rewardKind === "ADDON") next = { ...next, rewardMode: "ALLOWED_SCOPE", rewardProductScopes: [] };
  if (next.rewardMode === "SAME_CONFIG") next = { ...next, rewardProductScopes: [] };
  if (next.benefitScaling === "ONCE_PER_ORDER") next = { ...next, maxApplications: 1 };
  return next;
}

/** Owns RHF synchronization and async lifecycle for the admin voucher draft. */
export function useAdminVoucherWizardForm() {
  const emptyDraft = createEmptyVoucherDraft();
  const [draft, setDraft] = useState<VoucherDraft>(emptyDraft);
  const draftRef = useRef<VoucherDraft>(emptyDraft);
  const resolver = zodResolver(adminVoucherDraftSchema) as unknown as Resolver<VoucherDraft>;
  const form = useForm<VoucherDraft>({
    mode: "onBlur",
    resolver,
    defaultValues: emptyDraft,
  });
  const submitting = useRef(false);

  const syncForm = useCallback((next: VoucherDraft) => {
    form.reset(next, { keepErrors: true, keepDirty: true, keepTouched: true });
  }, [form]);

  const updateDraft = useCallback((updater: DraftUpdater) => {
    const next = normalizeDraft(updater(draftRef.current));
    draftRef.current = next;
    syncForm(next);
    setDraft(next);
  }, [syncForm]);

  const resetDraft = useCallback(() => {
    const next = createEmptyVoucherDraft();
    draftRef.current = next;
    setDraft(next);
    form.reset(next);
  }, [form]);

  const validate = useCallback(async (scope: "step2" | "all" = "all"): Promise<boolean> => {
    if (scope === "step2") return form.trigger(getAdminVoucherStep2FieldPaths(draftRef.current.voucherType) as FieldPath<VoucherDraft>[]);
    return form.trigger();
  }, [form]);

  const errorFor = useCallback((field: keyof VoucherDraft): string | undefined => {
    const message = form.formState.errors[field]?.message;
    return typeof message === "string" ? message : undefined;
  }, [form.formState.errors]);

  const errorForPath = useCallback((path: string): string | undefined => {
    let current: unknown = form.formState.errors;
    for (const segment of path.split(".")) {
      if (typeof current !== "object" || current === null) return undefined;
      current = (current as Record<string, unknown>)[segment];
    }
    if (typeof current !== "object" || current === null) return undefined;
    const message = (current as Record<string, unknown>).message;
    return typeof message === "string" ? message : undefined;
  }, [form.formState.errors]);

  const submit = useCallback(async (request: (current: VoucherDraft) => Promise<void>, onSuccess?: () => void): Promise<boolean> => {
    if (submitting.current) return false;
    submitting.current = true;
    try {
      await request(draftRef.current);
      resetDraft();
      onSuccess?.();
      return true;
    } catch {
      return false;
    } finally {
      submitting.current = false;
    }
  }, [resetDraft]);

  return { draft, form, updateDraft, resetDraft, validate, submit, errorFor, errorForPath };
}
