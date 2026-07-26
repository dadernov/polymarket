"use client";

import { BarChart3, Check, Clock, Droplets, Link2, Star } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MarketImage } from "@/components/ui/market-image";
import { formatDate, formatTimeLeft, formatVolume } from "@/lib/format";
import { useIsWatched, useWatchlistStore } from "@/lib/store";
import type { MarketEvent } from "@/lib/types";
import { cn } from "@/lib/utils";

function Meta({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-muted">
      <Icon className="size-3.5 shrink-0 text-faint" />
      <span className="tnum">{children}</span>
    </span>
  );
}

export function EventHeader({ event }: { event: MarketEvent }) {
  const watched = useIsWatched(event.slug);
  const toggle = useWatchlistStore((s) => s.toggle);
  const [copied, setCopied] = useState(false);

  // Подтверждение копирования гасим само — отдельной кнопки «ок» не нужно.
  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(id);
  }, [copied]);

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
    } catch {
      // Буфер недоступен (нет https или отказали в правах) — молча пропускаем.
    }
  };

  const ending = formatTimeLeft(event.endDate);
  const tags = event.tags.filter((t) => t.slug && t.slug !== "all").slice(0, 2);

  return (
    <header className="flex items-start gap-3 sm:gap-4">
      <MarketImage
        src={event.icon ?? event.image}
        alt=""
        size={56}
        className="rounded-xl border border-border"
      />

      <div className="min-w-0 flex-1">
        <h1 className="text-xl font-bold leading-snug tracking-tight text-text sm:text-2xl">
          {event.title}
        </h1>

        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
          {event.live && <Badge tone="live">Live</Badge>}
          {event.isNew && !event.live && <Badge tone="accent">Новое</Badge>}
          {event.closed && <Badge tone="neutral">Закрыто</Badge>}
          {!event.closed && ending !== "—" && (
            <Badge tone={event.live ? "warn" : "neutral"}>{ending}</Badge>
          )}

          <Meta icon={BarChart3}>{formatVolume(event.volume)} объём</Meta>
          <Meta icon={Droplets}>{formatVolume(event.liquidity)} ликвидности</Meta>
          <Meta icon={Clock}>до {formatDate(event.endDate)}</Meta>

          {tags.map((tag) => (
            <Link
              key={tag.id}
              href={`/?tag=${encodeURIComponent(tag.slug)}`}
              className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted transition-colors hover:border-border-strong hover:text-text"
            >
              {tag.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          onClick={() => toggle(event.slug)}
          aria-pressed={watched}
          aria-label={watched ? "Убрать из избранного" : "Добавить в избранное"}
          className={cn(watched && "border-[color:var(--warn)]/40 text-[color:var(--warn)]")}
        >
          <Star className={cn("size-4", watched && "fill-current")} />
          <span className="hidden sm:inline">{watched ? "В избранном" : "В избранное"}</span>
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={share}
          aria-label="Скопировать ссылку на событие"
        >
          {copied ? <Check className="size-4 text-yes" /> : <Link2 className="size-4" />}
          <span className="hidden sm:inline">{copied ? "Скопировано" : "Поделиться"}</span>
        </Button>
      </div>
    </header>
  );
}
