"use client";

import { HelpCircle } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Подсказка у термина. Рынки предсказаний полны понятий, которые новичку
 * непонятны («спред», «ликвидность», «нокаут»), а объяснять их сносками
 * в тексте — значит утопить интерфейс. Здесь объяснение прячется до наведения
 * и появляется на фокусе с клавиатуры.
 *
 * Реализовано на group-hover без обработчиков: подсказке не нужно состояние,
 * а лишний клиентский стейт на каждый термин — лишние ре-рендеры.
 */
export function Hint({
  children,
  side = "top",
  className,
}: {
  /** Текст подсказки. */
  children: ReactNode;
  side?: "top" | "bottom";
  className?: string;
}) {
  return (
    <span className={cn("group/hint relative inline-flex align-middle", className)}>
      <button
        type="button"
        aria-label="Пояснение"
        className="cursor-help text-faint transition-colors hover:text-muted"
      >
        <HelpCircle className="size-3.5" aria-hidden />
      </button>
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute left-1/2 z-50 w-56 -translate-x-1/2 rounded-xl",
          "border border-border bg-surface-raised p-2.5 text-left text-[11.5px]",
          "font-normal leading-relaxed text-muted shadow-pop",
          "opacity-0 transition-opacity duration-150",
          "group-hover/hint:opacity-100 group-focus-within/hint:opacity-100",
          side === "top" ? "bottom-full mb-2" : "top-full mt-2",
        )}
      >
        {children}
      </span>
    </span>
  );
}

/**
 * Блок-пояснение внутри карточки: приглушённая плашка с текстом.
 * Для мест, где объяснение нужно видеть сразу, а не по наведению.
 */
export function Note({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "warn" | "accent";
  className?: string;
}) {
  const tones = {
    neutral: "border-border bg-bg-subtle text-muted",
    warn: "border-transparent bg-warn-soft text-warn",
    accent: "border-transparent bg-accent-soft text-accent",
  } as const;

  return (
    <p
      className={cn(
        "rounded-xl border px-3 py-2.5 text-[11.5px] leading-relaxed",
        tones[tone],
        className,
      )}
    >
      {children}
    </p>
  );
}
