"use client";

/**
 * Правила разрешения рынка. Экран смысловой, а не декоративный: сначала точная
 * формулировка вопроса и два факта (по чему и когда подводится итог), затем
 * полный текст условий со сворачиванием, затем короткая памятка «как читать».
 * Логика прежняя — переодета типографика.
 */

import { CalendarClock, ChevronDown, ExternalLink, Scale } from "lucide-react";
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
    <div className="flex min-w-0 gap-3">
      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-[10px] bg-accent-soft text-accent">
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0">
        <p className="text-[10.5px] font-medium uppercase leading-none tracking-[0.08em] text-faint">
          {label}
        </p>
        <div className="mt-1.5 text-[12.5px] leading-snug">{children}</div>
      </div>
    </div>
  );
}

const READING_HINTS = [
  "Цена исхода — это оценка его вероятности: 62¢ означают 62%.",
  "После закрытия верный исход гасится по $1, остальные — по $0.",
  "Итог подводится строго по тексту выше и по указанному источнику, а не по общему впечатлению от новостей.",
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
    <div className="space-y-5">
      <div className="card p-4 sm:p-5">
        <p className="text-[10.5px] font-medium uppercase leading-none tracking-[0.08em] text-faint">
          Вопрос рынка
        </p>
        <p className="display mt-2.5 text-[19px] leading-snug text-text sm:text-[21px]">
          {market.question}
        </p>

        <div className="mt-4 grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
          <Fact icon={Scale} label="источник разрешения">
            {source ? (
              <SourceLink source={source} />
            ) : (
              <span className="text-muted">
                Отдельный источник не указан — исход определяется по тексту правил
              </span>
            )}
          </Fact>

          <Fact icon={CalendarClock} label="окончание">
            <span className="tnum text-text">{formatDate(endDate)}</span>
            <span className="text-faint">
              {closed ? " · рынок закрыт" : timeLeft === "—" ? "" : ` · ${timeLeft}`}
            </span>
          </Fact>
        </div>
      </div>

      <section>
        <h3 className="text-[10.5px] font-medium uppercase leading-none tracking-[0.08em] text-faint">
          Условия разрешения
        </h3>

        {text ? (
          <>
            <div className="relative mt-3">
              <div
                ref={bodyRef}
                className={cn("overflow-hidden", collapsed && "max-h-[320px]")}
              >
                <div className="space-y-3.5 text-[13px] leading-relaxed text-muted">
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
                className="mt-3 inline-flex cursor-pointer items-center gap-1 text-[12.5px] font-medium text-accent transition-colors hover:text-accent-hover"
              >
                {expanded ? "Свернуть" : "Показать полностью"}
                <ChevronDown
                  className={cn("size-4 transition-transform", expanded && "rotate-180")}
                />
              </button>
            )}
          </>
        ) : (
          <p className="mt-3 text-[13px] leading-relaxed text-muted">
            Организатор не опубликовал развёрнутые условия для этого рынка.
            Ориентируйтесь на формулировку вопроса выше — исход определяется
            буквально по ней.
          </p>
        )}
      </section>

      <aside className="rounded-[16px] border border-border bg-bg-subtle p-4">
        <p className="text-[10.5px] font-medium uppercase leading-none tracking-[0.08em] text-faint">
          Как это читать
        </p>
        <ul className="mt-2.5 space-y-2">
          {READING_HINTS.map((hint) => (
            <li
              key={hint}
              className="relative pl-4 text-[12px] leading-relaxed text-muted before:absolute before:left-0 before:top-[0.6em] before:size-1 before:rounded-full before:bg-faint"
            >
              {hint}
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
