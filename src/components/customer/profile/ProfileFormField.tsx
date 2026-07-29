import type { ReactNode } from "react";

interface ProfileFormFieldProps {
  id: string;
  label: string;
  icon: ReactNode;
  error?: string;
  helper?: string;
  children: ReactNode;
}

/** Accessible label, input wrapper, and validation copy for profile fields. */
export function ProfileFormField({
  id,
  label,
  icon,
  error,
  helper,
  children,
}: ProfileFormFieldProps) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
          {icon}
        </span>
        {children}
      </div>
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : (
        helper && <p className="text-xs text-muted-foreground">{helper}</p>
      )}
    </div>
  );
}

/** Return the shared mobile-friendly input classes for profile fields. */
export function profileInputClass(hasError: boolean, extra = ""): string {
  return `h-11 w-full rounded-xl border bg-background pl-9 pr-4 text-base focus:outline-none focus:ring-2 md:text-sm ${
    hasError
      ? "border-destructive focus:ring-destructive"
      : "border-input focus:ring-ring"
  } ${extra}`;
}
