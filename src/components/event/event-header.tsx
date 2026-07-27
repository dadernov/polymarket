"use client";

/**
 * Шапка события — «первая полоса» страницы.
 *
 * Вопрос набран крупной антиквой: это главный текст экрана, а не подпись к
 * графику. Под ним «учётная полоса»: вероятность выбранного исхода очень
 * крупно и служебные показатели ряд — так страница начинается с двух вещей,
 * которые вообще нужны читателю, а не с плотной панели метаданных.
 */

import { ArrowDown, Check, Link2, Star } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

import { outcomeToneByLabel } from "@/components/trade/outcome-selector";
import { Badge, ChangeBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MarketImage } from "@/components/ui/market-image";
import { Stat, StatRow } from "@/components/ui/stat";
import {
  formatDate,
  formatProbability,
  formatTimeLeft,
  formatVolume,
} from "@/lib/format";
import { useIsWatched, useWatchlistStore } from "@/lib/store";
import type { Market, MarketEvent, Outcome } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface EventHeaderProps {
  event: MarketEvent;
  /** Выбранный рынок — от него берутся дельта и подпись к числу. */
  market?: Market | null;
  /** Выбранный исход: его вероятность и есть главное число страницы. */
  outcome?: Outcome | null;
}

/**
 * Надзаголовок отвечает на вопрос «что это за набор». Числа ставим после
 * точки-разделителя: так подпись не зависит от русского склонения.
 */
function kickerOf(event: MarketEvent): string | null {
  if (event.isBinary || event.markets.length < 2) return null;
  const kind = event.exclusive ? "Взаимоисключающие исходы" : "Независимые ставки";
  return `${kind} · ${event.markets.length}`;
}

/** Подпись к главному числу: чей именно это шанс. */
function captionOf(event: MarketEvent, market: Market | null, outcome: Outcome): string {
  if (event.isBinary || event.markets.length < 2) {
    return `Шанс «${outcome.label}»`;
  }
  const name = market?.groupTitle?.trim() || market?.question || "";
  return name ? `${name} · ${outcome.label}` : `Шанс «${outcome.label}»`;
}

export function EventHeader({ event, market = null, outcome = null }: EventHeaderProps) {
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

  const endDate = market?.endDate ?? event.endDate;
  const timeLeft = formatTimeLeft(endDate);
  const tags = event.tags.filter((t) => t.slug && t.slug !== "all").slice(0, 3);
  const kicker = kickerOf(event);

  // Дельта Gamma считается по первому исходу рынка. Для второго исхода она
  // ровно противоположна: иначе выбранный «No» показывал бы рост «Yes».
  const rawChange = market?.oneDayPriceChange ?? 0;
  const change = outcome && outcome.index === 0 ? rawChange : -rawChange;
  const tone = outcome ? outcomeToneByLabel(outcome.label, outcome.index) : "yes";

  const stats: ReactNode = (
    <>
      <Stat
        label="Оборот"
        value={formatVolume(event.volume)}
        hint={`за 24 ч ${formatVolume(event.volume24hr)}`}
        size="sm"
      />
      <Stat
        label="Ликвидность"
        value={formatVolume(event.liquidity)}
        hint="глубина стакана"
        size="sm"
      />
      <Stat label="Дата резолва" value={formatDate(endDate)} size="sm" />
      <Stat
        label="До закрытия"
        value={event.closed ? "закрыто" : timeLeft}
        size="sm"
      />
    </>
  );

  return (
    <header>
      <div className="flex items-start gap-3.5 sm:gap-4">
        <MarketImage
          src={event.icon ?? event.image}
          alt=""
          size={56}
          className="mt-1 rounded-[14px] border border-border"
        />

        <div className="min-w-0 flex-1">
          {(event.live || event.isNew || event.closed || kicker) && (
            <div className="flex flex-wrap items-center gap-2">
              {event.live && <Badge tone="live">Live</Badge>}
              {event.isNew && !event.live && <Badge tone="accent">Новое</Badge>}
              {event.closed && <Badge tone="neutral">Закрыто</Badge>}
              {kicker && (
                <span className="tnum text-[10.5px] font-medium uppercase leading-none tracking-[0.08em] text-faint">
                  {kicker}
                </span>
              )}
            </div>
          )}

          <h1 className="display mt-2 text-[26px] leading-[1.14] text-text sm:text-[33px] lg:text-[38px]">
            {event.title}
          </h1>

          {tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <Link
                  key={tag.id}
                  href={`/?tag=${encodeURIComponent(tag.slug)}`}
                  className={cn(
                    "rounded-full border border-border px-2.5 py-1 text-[10.5px] font-medium",
                    "uppercase leading-none tracking-[0.04em] text-muted transition-colors",
                    "hover:border-border-strong hover:text-text",
                  )}
                >
                  {tag.label}
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Служебные действия — иконками: на первой полосе им не место словами. */}
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => toggle(event.slug)}
            aria-pressed={watched}
            aria-label={watched ? "Убрать из избранного" : "Добавить в избранное"}
            title={watched ? "В избранном" : "В избранное"}
            className={cn("w-9 px-0", watched && "border-warn/40 text-warn")}
          >
            <Star className={cn("size-4", watched && "fill-current")} />
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={share}
            aria-label="Скопировать ссылку на событие"
            title={copied ? "Ссылка скопирована" : "Скопировать ссылку"}
            className="w-9 px-0"
          >
            {copied ? <Check className="size-4 text-yes" /> : <Link2 className="size-4" />}
          </Button>
        </div>
      </div>

      {/* Учётная полоса: главное число слева, служебные показатели справа. */}
      <div
        className={cn(
          "mt-5 flex flex-col gap-5 border-t border-border pt-5",
          "sm:flex-row sm:items-end sm:justify-between sm:gap-8",
        )}
      >
        {outcome && (
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[10.5px] font-medium uppercase tracking-[0.08em] text-faint">
              <span
                aria-hidden
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  tone === "no" ? "bg-no" : "bg-yes",
                )}
              />
              <span className="truncate">{captionOf(event, market, outcome)}</span>
            </p>

            {/* Число — чернилами, не светофором: цвет здесь несёт сторона
                исхода (точка выше) и направление дельты, а не сама величина. */}
            <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="display tnum text-[46px] leading-[0.88] text-text sm:text-[54px]">
                {formatProbability(outcome.price)}
              </span>
              <span className="flex items-baseline gap-1 whitespace-nowrap">
                <ChangeBadge change={change} />
                <span className="text-[11px] leading-none text-faint">
                  п.п. за 24 ч
                </span>
              </span>
            </div>

            {/* На узком экране панель сделки стоит ниже графика: из шапки к ней
                нужен короткий путь, иначе до неё три экрана прокрутки. */}
            <a
              href="#trade"
              className="mt-3.5 inline-flex items-center gap-1.5 text-[12px] font-medium text-accent transition-colors hover:text-accent-hover lg:hidden"
            >
              К панели сделки
              <ArrowDown className="size-3.5" aria-hidden />
            </a>
          </div>
        )}

        <div className="grid grid-cols-2 gap-x-5 gap-y-4 sm:hidden">{stats}</div>
        <StatRow className="hidden shrink-0 sm:flex">{stats}</StatRow>
      </div>
    </header>
  );
}
