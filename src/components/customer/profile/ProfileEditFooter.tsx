import { Loader2 } from "lucide-react";

interface ProfileEditFooterProps {
  dirty: boolean;
  submitting: boolean;
  onCancel: () => void;
}

/** Sticky mobile action bar for the profile edit sheet. */
export function ProfileEditFooter({
  dirty,
  submitting,
  onCancel,
}: ProfileEditFooterProps) {
  return (
    <footer className="grid grid-cols-2 gap-3 border-t border-border/60 bg-card px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4">
      <button
        type="button"
        onClick={onCancel}
        disabled={submitting}
        className="h-12 rounded-2xl border-2 border-primary text-sm font-bold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Huỷ
      </button>
      <button
        type="submit"
        disabled={!dirty || submitting}
        className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-primary text-sm font-bold text-primary-foreground transition-transform active:scale-[0.98] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
        Lưu thay đổi
      </button>
    </footer>
  );
}
