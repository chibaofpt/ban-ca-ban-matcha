import * as React from "react";

import { cn } from "@/src/utils/cn";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "default" | "secondary" | "outline" | "ghost" | "destructive" | "accent";
  size?: "default" | "sm" | "lg" | "icon";
}

const variantClasses: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary: "bg-primary text-primary-foreground shadow-md hover:bg-primary/90",
  default: "bg-primary text-primary-foreground shadow-md hover:bg-primary/90",
  secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
  outline: "border border-input bg-transparent hover:bg-secondary hover:text-secondary-foreground",
  ghost: "hover:bg-secondary hover:text-secondary-foreground",
  destructive: "bg-destructive text-destructive-foreground shadow-md hover:bg-destructive/90",
  accent: "bg-accent text-accent-foreground shadow-sm hover:bg-accent/90",
};

const sizeClasses: Record<NonNullable<ButtonProps["size"]>, string> = {
  default: "min-h-11 px-6 py-2",
  sm: "min-h-11 px-3 text-xs",
  lg: "min-h-12 px-8 text-base",
  icon: "h-11 w-11",
};

/** Renders the canonical accessible project button. */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", size = "default", type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex items-center justify-center rounded-xl font-medium ring-offset-background transition-all duration-200 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    />
  );
});
