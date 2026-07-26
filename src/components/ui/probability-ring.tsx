import { cn } from "@/lib/utils";
import { clamp01 } from "@/lib/format";

/**
 * Круговой индикатор вероятности на карточке бинарного рынка.
 * Дуга рисуется от 12 часов по часовой стрелке; цвет — зелёный выше 50%,
 * красный ниже, серый у самой середины.
 */
export function ProbabilityRing({
  probability,
  size = 52,
  className,
  showLabel = true,
}: {
  probability: number;
  size?: number;
  className?: string;
  showLabel?: boolean;
}) {
  const p = clamp01(probability);
  const pct = Math.round(p * 100);
  const stroke = size < 44 ? 4 : 5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  const color = pct > 52 ? "var(--yes)" : pct < 48 ? "var(--no)" : "var(--text-muted)";

  return (
    <div
      className={cn("relative shrink-0", className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Вероятность ${pct}%`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--border)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - p)}
          className="transition-[stroke-dashoffset] duration-500"
        />
      </svg>
      {showLabel && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="tnum font-bold leading-none"
            style={{ fontSize: size * 0.3, color }}
          >
            {pct}
          </span>
          <span
            className="leading-none text-faint"
            style={{ fontSize: size * 0.17, marginTop: size * 0.05 }}
          >
            %
          </span>
        </div>
      )}
    </div>
  );
}

/** Горизонтальная полоса вероятности — для строк списка исходов. */
export function ProbabilityBar({
  probability,
  color,
  className,
}: {
  probability: number;
  color?: string;
  className?: string;
}) {
  const p = clamp01(probability);
  return (
    <div className={cn("h-1 w-full overflow-hidden rounded-full bg-border", className)}>
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{ width: `${p * 100}%`, backgroundColor: color ?? "var(--accent)" }}
      />
    </div>
  );
}
