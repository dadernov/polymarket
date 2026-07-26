import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type Tone = "neutral" | "accent" | "yes" | "no" | "warn" | "live";

const TONES: Record<Tone, string> = {
  neutral: "bg-surface-hover text-muted border-border",
  accent: "bg-accent-soft text-accent border-transparent",
  yes: "bg-yes-soft text-yes border-transparent",
  no: "bg-no-soft text-no border-transparent",
  warn: "bg-[color:var(--warn)]/12 text-[color:var(--warn)] border-transparent",
  live: "bg-no-soft text-no border-transparent",
};

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5",
        "text-[11px] font-medium leading-none whitespace-nowrap",
        TONES[tone],
        className,
      )}
    >
      {tone === "live" && (
        <span className="animate-pulse-dot size-1.5 rounded-full bg-no" />
      )}
      {children}
    </span>
  );
}

/**
 * Изменение цены в процентных пунктах со стрелкой.
 * Ноль показываем нейтрально, без стрелки — чтобы не шуметь.
 */
export function ChangeBadge({
  change,
  className,
}: {
  change: number;
  className?: string;
}) {
  const pts = change * 100;
  const rounded = Math.abs(pts) < 0.05 ? 0 : pts;

  return (
    <span
      className={cn(
        "tnum inline-flex items-center gap-0.5 text-xs font-semibold",
        rounded > 0 && "text-yes",
        rounded < 0 && "text-no",
        rounded === 0 && "text-faint",
        className,
      )}
    >
      {rounded !== 0 && (
        <svg viewBox="0 0 10 10" className="size-2.5" aria-hidden>
          <path
            d={rounded > 0 ? "M5 1.5L9 8H1z" : "M5 8.5L1 2h8z"}
            fill="currentColor"
          />
        </svg>
      )}
      {rounded === 0 ? "0.0" : `${Math.abs(rounded).toFixed(1)}`}
      <span className="sr-only">
        {rounded > 0 ? "процентных пунктов роста" : "процентных пунктов падения"}
      </span>
    </span>
  );
}
