import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Заголовок секции в издательском духе: капительный надзаголовок, название
 * антиквой, пояснение гротеском и линовка `rule` под всем блоком. Рамки здесь
 * не нужны — сетку страницы держат линии, а не карточки.
 *
 * Пояснение под названием обязательно там, где секция отвечает на вопрос,
 * который сам по себе неочевиден («куда двинулось за сутки»): без него
 * заголовок остаётся ярлыком, а не смыслом.
 */
export interface SectionHeadProps {
  title: string;
  /** Одна строка о том, что именно собрано в секции и по какому правилу. */
  description?: ReactNode;
  /** Надзаголовок капителью: «24 часа», «Полный список». */
  kicker?: string;
  /** Ссылка или контрол справа — выравнивается по базовой линии заголовка. */
  action?: ReactNode;
  /** Уровень заголовка: страница сама решает свою структуру. */
  as?: "h2" | "h3";
  className?: string;
}

export function SectionHead({
  title,
  description,
  kicker,
  action,
  as: Heading = "h2",
  className,
}: SectionHeadProps) {
  return (
    <div
      className={cn(
        "rule flex flex-wrap items-end justify-between gap-x-8 gap-y-3 pb-3.5",
        className,
      )}
    >
      <div className="min-w-0">
        {kicker && (
          <p className="mb-2 text-[10.5px] font-semibold uppercase leading-none tracking-[0.16em] text-faint">
            {kicker}
          </p>
        )}
        <Heading className="display text-[22px] leading-none text-text sm:text-[26px]">
          {title}
        </Heading>
        {description && (
          <p className="mt-2.5 max-w-[70ch] text-[12.5px] leading-relaxed text-muted">
            {description}
          </p>
        )}
      </div>

      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}

/** Ссылка-действие для правой части заголовка секции. */
export function SectionLink({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex items-center gap-1.5 text-[12.5px] font-medium text-muted transition-colors hover:text-accent",
        className,
      )}
    >
      {children}
      <ArrowRight
        className="size-3.5 transition-transform group-hover:translate-x-0.5"
        aria-hidden
      />
    </Link>
  );
}
