import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Показатель: подпись сверху мелким капительным гротеском, значение —
 * крупной антиквой. Единая единица для шапок страниц, сводки портфеля и
 * блоков статистики, чтобы числа во всём приложении выглядели одинаково.
 */
export function Stat({
  label,
  value,
  hint,
  tone = "neutral",
  size = "md",
  className,
}: {
  label: string;
  value: ReactNode;
  /** Вторая строка под значением: пояснение или дельта. */
  hint?: ReactNode;
  tone?: "neutral" | "yes" | "no" | "accent";
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const valueTone =
    tone === "yes"
      ? "text-yes"
      : tone === "no"
        ? "text-no"
        : tone === "accent"
          ? "text-accent"
          : "text-text";

  const valueSize =
    size === "lg"
      ? "text-[28px] leading-[1.05]"
      : size === "sm"
        ? "text-base leading-tight"
        : "text-xl leading-tight";

  return (
    <div className={cn("min-w-0", className)}>
      <p className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-faint">
        {label}
      </p>
      <p className={cn("display tnum mt-1.5", valueSize, valueTone)}>{value}</p>
      {hint && (
        <p className="mt-1 truncate text-[11px] leading-tight text-muted">{hint}</p>
      )}
    </div>
  );
}

/** Ряд показателей, разделённых тонкими линиями. */
export function StatRow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-5 [&>*+*]:border-l [&>*+*]:border-border [&>*+*]:pl-5",
        className,
      )}
    >
      {children}
    </div>
  );
}
