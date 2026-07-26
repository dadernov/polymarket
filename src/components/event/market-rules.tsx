"use client";

import { CalendarClock, ChevronDown, ExternalLink, Lightbulb, Scale } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { formatDate, formatTimeLeft } from "@/lib/format";
import type { Market, MarketEvent } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Высота, после которой текст сворачивается под кнопку. */
const COLLAPSED_HEIGHT = 320;

function paragraphsOf(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Ссылки внутри правил встречаются часто — делаем их кликабельными. */
function linkify(paragraph: string) {
  return paragraph.split(/(https?:\/\/[^\s)]+)/g).map((chunk, index) =>
    /^https?:\/\//.test(chunk) ? (
      <a
        key={index}
        href={chunk}
        target="_blank"
        rel="noopener noreferrer"
        className="break-all text-accent underline-offset-2 transition-colors hover:text-accent-hover hover:underline"
      >
        {chunk}
      </a>
    ) : (
      chunk
    ),
  );
}

function SourceLink({ source }: { source: string }) {
  const isUrl = /^https?:\/\//.test(source);
  if (!isUrl) return <span className="text-text">{source}</span>;
  return (
    <a
      href={source}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex max-w-full items-center gap-1 font-medium text-accent transition-colors hover:text-accent-hover"
    >
      <span className="min-w-0 truncate">{source.replace(/^https?:\/\//, "")}</span>
      <ExternalLink className="size-3.5 shrink-0" />
    </a>
  );
}

/** Одна строка «ярлык — значение» в шапке правил. */
function Fact({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 gap-2.5">
      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wider text-faint">
          {label}
        </p>
        <div className="mt-0.5 text-sm leading-snug">{children}</div>
      </div>
    </div>
  );
}

const READING_HINTS = [
  "Цена исхода — это оценка его вероятности: 62¢ означают 62%.",
  "После закрытия верный исход гасится по $1, остальные — по $0.",
  "Итог подводится строго по тексту ниже и по указанному источнику, а не по общему впечатлению от новостей.",
];

export function MarketRules({
  event,
  market,
}: {
  event: MarketEvent;
  market: Market;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const text = (market.description ?? event.description ?? "").trim();
  const source = market.resolutionSource ?? event.resolutionSource;
  const endDate = market.endDate ?? event.endDate;
  const closed = market.closed || event.closed;
  const timeLeft = formatTimeLeft(endDate);

  // Кнопку «показать полностью» рисуем только если текст реально не влез.
  useEffect(() => {
    const node = bodyRef.current;
    if (!node) return;
    setOverflows(node.scrollHeight > COLLAPSED_HEIGHT + 24);
  }, [text]);

  const paragraphs = paragraphsOf(text);
  const collapsed = overflows && !expanded;

  return (
    <div className="space-y-4 py-1">
      <div className="rounded-xl border border-border bg-surface p-3.5">
        <p className="text-[11px] font-medium uppercase tracking-wider text-faint">
          Вопрос рынка
        </p>
        <p className="mt-1 text-sm font-semibold leading-snug text-text">
          {market.question}
        </p>

        <div className="mt-3.5 grid gap-3.5 border-t border-border pt-3.5 sm:grid-cols-2">
          <Fact icon={Scale} label="Источник разрешения">
            {source ? (
              <SourceLink source={source} />
            ) : (
              <span className="text-muted">
                Отдельный источник не указан — исход определяется по тексту правил
              </span>
            )}
          </Fact>

          <Fact icon={CalendarClock} label="Окончание">
            <span className="tnum text-text">{formatDate(endDate)}</span>
            <span className="text-faint">
              {closed ? " · рынок закрыт" : timeLeft === "—" ? "" : ` · ${timeLeft}`}
            </span>
          </Fact>
        </div>
      </div>

      <section>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-faint">
          Условия разрешения
        </h3>

        {text ? (
          <>
            <div className="relative mt-2">
              <div
                ref={bodyRef}
                className={cn("overflow-hidden", collapsed && "max-h-[320px]")}
              >
                <div className="space-y-3 text-sm leading-relaxed text-muted">
                  {paragraphs.map((paragraph, index) => (
                    <p key={index} className="whitespace-pre-line">
                      {linkify(paragraph)}
                    </p>
                  ))}
                </div>
              </div>

              {collapsed && (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-bg to-transparent" />
              )}
            </div>

            {overflows && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="mt-2 inline-flex cursor-pointer items-center gap-1 text-sm font-medium text-accent transition-colors hover:text-accent-hover"
              >
                {expanded ? "Свернуть" : "Показать полностью"}
                <ChevronDown
                  className={cn("size-4 transition-transform", expanded && "rotate-180")}
                />
              </button>
            )}
          </>
        ) : (
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Организатор не опубликовал развёрнутые условия для этого рынка.
            Ориентируйтесь на формулировку вопроса выше — исход определяется
            буквально по ней.
          </p>
        )}
      </section>

      <aside className="rounded-xl border border-border bg-bg-subtle p-3.5">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-text">
          <Lightbulb className="size-3.5 text-accent" aria-hidden />
          Как это читать
        </p>
        <ul className="mt-2 space-y-1.5">
          {READING_HINTS.map((hint) => (
            <li
              key={hint}
              className="relative pl-3.5 text-xs leading-relaxed text-muted before:absolute before:left-0 before:top-[0.55em] before:size-1 before:rounded-full before:bg-faint"
            >
              {hint}
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
