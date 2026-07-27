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
    "bg-text text-bg hover:bg-text/90 disabled:hover:bg-text shadow-card",
  secondary:
    "bg-surface text-text border border-border hover:border-border-strong hover:shadow-card",
  outline:
    "border border-border text-text hover:bg-surface-hover hover:border-border-strong",
  ghost: "text-muted hover:text-text hover:bg-surface-hover",
  // Кнопки исхода: мягкая плашка в покое, насыщенная — под курсором. Тонкая
  // внутренняя рамка держит форму кнопки на светлом фоне, где мягкий фон почти
  // сливается с карточкой.
  yes: "bg-yes-soft text-yes ring-1 ring-inset ring-yes/15 hover:bg-yes hover:text-white hover:ring-yes font-semibold",
  no: "bg-no-soft text-no ring-1 ring-inset ring-no/15 hover:bg-no hover:text-white hover:ring-no font-semibold",
  danger: "bg-no text-white hover:bg-no-hover",
};

const SIZES: Record<Size, string> = {
  xs: "h-7 px-2.5 text-xs rounded-lg gap-1",
  sm: "h-9 px-3.5 text-[13px] rounded-[10px] gap-1.5",
  md: "h-10 px-4 text-sm rounded-xl gap-2",
  lg: "h-12 px-5 text-[15px] rounded-2xl gap-2",
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
