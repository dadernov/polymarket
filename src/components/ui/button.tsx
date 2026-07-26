import { Slot } from "./slot";
import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes } from "react";

type Variant =
  | "primary"
  | "secondary"
  | "outline"
  | "ghost"
  | "yes"
  | "no"
  | "danger";
type Size = "xs" | "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-accent text-white hover:bg-accent-hover disabled:hover:bg-accent",
  secondary:
    "bg-surface-hover text-text border border-border hover:border-border-strong",
  outline:
    "border border-border text-text hover:bg-surface-hover hover:border-border-strong",
  ghost: "text-muted hover:text-text hover:bg-surface-hover",
  // Кнопки покупки исхода: мягкий фон в покое, насыщенный — под курсором.
  yes: "bg-yes-soft text-yes hover:bg-yes hover:text-white font-semibold",
  no: "bg-no-soft text-no hover:bg-no hover:text-white font-semibold",
  danger: "bg-no text-white hover:bg-no-hover",
};

const SIZES: Record<Size, string> = {
  xs: "h-7 px-2.5 text-xs rounded-md gap-1",
  sm: "h-8 px-3 text-sm rounded-lg gap-1.5",
  md: "h-10 px-4 text-sm rounded-lg gap-2",
  lg: "h-12 px-5 text-base rounded-xl gap-2",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Отрисовать дочерний элемент вместо <button> — например <Link>. */
  asChild?: boolean;
  fullWidth?: boolean;
}

export function Button({
  className,
  variant = "primary",
  size = "md",
  asChild = false,
  fullWidth = false,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap font-medium",
        "transition-colors duration-150 cursor-pointer select-none",
        "disabled:pointer-events-none disabled:opacity-50",
        VARIANTS[variant],
        SIZES[size],
        fullWidth && "w-full",
        className,
      )}
      {...props}
    />
  );
}
