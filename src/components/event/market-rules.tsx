"use client";

import { ChevronDown, ExternalLink, FileText } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/format";
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
  if (!isUrl) return <span className="text-muted">{source}</span>;
  return (
    <a
      href={source}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-accent transition-colors hover:text-accent-hover"
    >
      <span className="max-w-[320px] truncate">{source.replace(/^https?:\/\//, "")}</span>
      <ExternalLink className="size-3.5 shrink-0" />
    </a>
  );
}

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

  // Кнопку «показать полностью» рисуем только если текст реально не влез.
  useEffect(() => {
    const node = bodyRef.current;
    if (!node) return;
    setOverflows(node.scrollHeight > COLLAPSED_HEIGHT + 24);
  }, [text]);

  if (!text) {
    return (
      <EmptyState
        icon={<FileText />}
        title="Правила не опубликованы"
        description="Организатор не приложил описание условий разрешения этого рынка."
      />
    );
  }

  const paragraphs = paragraphsOf(text);
  const collapsed = overflows && !expanded;

  return (
    <div className="py-1">
      <div className="relative">
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

      <dl className="mt-5 grid gap-3 border-t border-border pt-4 text-sm sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="text-xs font-medium uppercase tracking-wider text-faint">
            Источник разрешения
          </dt>
          <dd className="mt-1 truncate">
            {source ? <SourceLink source={source} /> : <span className="text-muted">—</span>}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs font-medium uppercase tracking-wider text-faint">
            Дата окончания
          </dt>
          <dd className="tnum mt-1 text-text">{formatDate(endDate)}</dd>
        </div>
      </dl>
    </div>
  );
}
