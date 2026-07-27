import { cn } from "@/lib/utils";
import { clamp01 } from "@/lib/format";

/**
 * Круговой индикатор вероятности.
 *
 * Дуга идёт от 12 часов по часовой стрелке, число — антиквой: это главный
 * смысловой объект карточки, и он должен читаться как объект, а не как
 * подпись. У значений около половины дуга нейтрально-серая: подсвечивать
 * зелёным рынок 50/50 значит утверждать то, чего данные не говорят.
 */
export function ProbabilityRing({
  probability,
  size = 56,
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
  const stroke = size < 44 ? 3 : 3.5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  const color =
    pct > 52 ? "var(--yes)" : pct < 48 ? "var(--no)" : "var(--muted)";

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
          stroke="var(--grid)"
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
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      {showLabel && (
        <div className="absolute inset-0 flex items-baseline justify-center gap-[1px]">
          <span
            className="display tnum leading-none"
            style={{ fontSize: size * 0.36, color, marginTop: size * 0.3 }}
          >
            {pct}
          </span>
          <span
            className="leading-none text-faint"
            style={{ fontSize: size * 0.16, marginTop: size * 0.3 }}
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
    <div
      className={cn(
        "h-[3px] w-full overflow-hidden rounded-full bg-grid",
        className,
      )}
    >
      <div
        className="h-full rounded-full transition-[width] duration-700 ease-out"
        style={{ width: `${p * 100}%`, backgroundColor: color ?? "var(--accent)" }}
      />
    </div>
  );
}
