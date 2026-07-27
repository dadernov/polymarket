import { cn } from "@/lib/utils";

/**
 * Микрографик траектории вероятности.
 *
 * Смысловая основа новой карточки рынка: «62%» само по себе не говорит
 * ничего о том, откуда рынок пришёл. Спарклайн добавляет к числу контекст
 * направления, занимая одну строку и не требуя подписей.
 *
 * Реализован на чистом SVG без библиотек: на странице их десятки, и любой
 * графический движок здесь обошёлся бы дороже самой страницы.
 */

export interface SparklineProps {
  /** Цены 0..1 по возрастанию времени. Меньше двух точек — ничего не рисуем. */
  points: number[];
  /** Цвет линии; по умолчанию берётся из направления движения. */
  color?: string;
  width?: number;
  height?: number;
  /** Заливка под линией мягким градиентом. */
  area?: boolean;
  /** Точка на последнем значении — «вы находитесь здесь». */
  dot?: boolean;
  className?: string;
}

/** Приводим значения к координатам с запасом по вертикали. */
function toPath(points: number[], width: number, height: number, pad: number) {
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min;
  // Плоская линия должна идти посередине, а не прилипать к краю.
  const scale = (value: number) =>
    span < 1e-6 ? height / 2 : pad + (1 - (value - min) / span) * (height - pad * 2);
  const step = points.length > 1 ? width / (points.length - 1) : width;

  const coords = points.map((value, i) => [i * step, scale(value)] as const);
  const line = coords
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`)
    .join(" ");

  return { line, coords };
}

export function Sparkline({
  points,
  color,
  width = 96,
  height = 28,
  area = true,
  dot = false,
  className,
}: SparklineProps) {
  if (points.length < 2) {
    return (
      <div
        className={cn("shrink-0", className)}
        style={{ width, height }}
        aria-hidden
      />
    );
  }

  const rising = points[points.length - 1] >= points[0];
  const stroke = color ?? (rising ? "var(--yes)" : "var(--no)");
  const pad = 3;
  const { line, coords } = toPath(points, width, height, pad);
  const last = coords[coords.length - 1];
  const id = `sl-${points.length}-${Math.round(points[0] * 1e4)}-${Math.round(
    points[points.length - 1] * 1e4,
  )}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn("shrink-0 overflow-visible", className)}
      role="img"
      aria-label={`Динамика: ${rising ? "рост" : "снижение"}`}
    >
      {area && (
        <>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity={0.22} />
              <stop offset="100%" stopColor={stroke} stopOpacity={0} />
            </linearGradient>
          </defs>
          <path
            d={`${line} L${width},${height} L0,${height} Z`}
            fill={`url(#${id})`}
          />
        </>
      )}
      <path
        d={line}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {dot && (
        <circle cx={last[0]} cy={last[1]} r={2.5} fill={stroke} />
      )}
    </svg>
  );
}
