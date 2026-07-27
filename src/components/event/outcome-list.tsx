"use client";

/**
 * Список исходов события.
 *
 * Выбор здесь не локальный: пара «рынок + исход» приходит сверху и уходит
 * обратно одним колбэком — тем же, что читает панель сделки. Рассинхрон этих
 * двух мест был реальным багом, из-за которого покупался не тот исход.
 *
 * Подача зависит от смысла набора. Взаимоисключающие рынки сравнимы между
 * собой: у них есть номер и полоса-мера, а цены в сумме дают 100%. Набор
 * независимых ставок сравнивать не с чем — там ни рейтинга, ни полос, только
 * собственная траектория каждого вопроса.
 */

import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { isMarketTradable, outcomeToneByLabel } from "@/components/trade/outcome-selector";
import { Badge, ChangeBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MarketImage } from "@/components/ui/market-image";
import { ProbabilityBar } from "@/components/ui/probability-ring";
import { Sparkline } from "@/components/ui/sparkline";
import { REFRESH, api, queryKeys } from "@/lib/api";
import { formatCents, formatProbability, formatVolume } from "@/lib/format";
import type { Market, MarketEvent, Outcome, SparklineMap } from "@/lib/types";
import { cn, seriesColor } from "@/lib/utils";

/** Столько рынков запрашиваем траекториями: дальше растёт только адрес запроса. */
const MAX_SPARKLINES = 24;

/** С такого числа строк список получает свою полосу прокрутки. */
const SCROLL_FROM = 9;

export interface OutcomeSelection {
  marketId: string;
  outcomeIndex: number;
}

interface OutcomeListProps {
  event: MarketEvent;
  selected: OutcomeSelection;
  onSelect: (market: Market, outcome: Outcome) => void;
}

type PluralForms = readonly [string, string, string];

const QUESTION_FORMS: PluralForms = ["вопрос", "вопроса", "вопросов"];

/** Русское склонение после числа: 1 вопрос, 2 вопроса, 5 вопросов. */
function plural(count: number, forms: PluralForms): string {
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 14) return forms[2];
  const mod10 = count % 10;
  if (mod10 === 1) return forms[0];
  if (mod10 >= 2 && mod10 <= 4) return forms[1];
  return forms[2];
}

function isSelected(selected: OutcomeSelection, market: Market, index: number): boolean {
  return selected.marketId === market.id && selected.outcomeIndex === index;
}

/** Цвет стороны исхода токенами дизайн-системы. */
function toneColor(label: string, index: number): string {
  return outcomeToneByLabel(label, index) === "no" ? "var(--no)" : "var(--yes)";
}

/** Заголовок раздела: что это за набор и что делает выбор строки. */
function SectionHead({ title, note }: { title: string; note: string }) {
  return (
    <div className="mb-3">
      <h2 className="display text-[20px] leading-tight text-text">{title}</h2>
      <p className="mt-1.5 text-[12px] leading-relaxed text-muted">{note}</p>
    </div>
  );
}

/** Метка выбора справа в строке: она же объясняет, что строка делает. */
function PickMark({ active, tradable }: { active: boolean; tradable: boolean }) {
  if (!tradable) return <Badge tone="neutral">Закрыт</Badge>;
  if (active) return <Badge tone="accent">Выбрано</Badge>;
  return (
    <span className="rounded-full border border-border px-2.5 py-1 text-[10.5px] font-medium uppercase leading-none tracking-[0.04em] text-faint">
      Выбрать
    </span>
  );
}

/** Полоска у левого края выбранной строки — «вы читаете это». */
function ActiveStripe() {
  return <span aria-hidden className="absolute inset-y-0 left-0 w-[2px] bg-accent" />;
}

/* ------------------------------------------------------------------ */
/* Событие из одного рынка: две крупные строки по исходам              */
/* ------------------------------------------------------------------ */

function BinaryOutcomes({ event, selected, onSelect }: OutcomeListProps) {
  const market = event.markets[0];
  if (!market) return null;

  const tradable = isMarketTradable(market, event.closed);

  return (
    <section>
      <SectionHead
        title="Исходы"
        note="Сработает ровно один исход: цены в сумме дают 100%. Выбранная строка подставляется в панель сделки."
      />

      <div className="card overflow-hidden">
        {market.outcomes.map((outcome) => {
          const active = isSelected(selected, market, outcome.index);
          const color = toneColor(outcome.label, outcome.index);
          return (
            <button
              key={outcome.index}
              type="button"
              onClick={() => onSelect(market, outcome)}
              aria-pressed={active}
              disabled={!outcome.tokenId}
              className={cn(
                "relative flex w-full cursor-pointer items-center gap-4 px-4 py-4 text-left transition-colors",
                "border-b border-border last:border-b-0 disabled:cursor-default disabled:opacity-60",
                active ? "bg-accent-soft" : "enabled:hover:bg-surface-hover",
              )}
            >
              {active && <ActiveStripe />}

              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  <span className="truncate text-[13.5px] font-semibold text-text">
                    {outcome.label}
                  </span>
                </span>
                <span className="tnum mt-1 block text-[11px] text-faint">
                  {formatCents(outcome.price, 1)} за акцию
                </span>
                <span className="mt-3 block">
                  <ProbabilityBar probability={outcome.price} color={color} />
                </span>
              </span>

              <span className="display tnum w-[86px] shrink-0 text-right text-[28px] leading-none text-text sm:text-[32px]">
                {formatProbability(outcome.price)}
              </span>

              <span className="hidden shrink-0 justify-end sm:flex">
                <PickMark active={active} tradable={tradable} />
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Мультирынок: таблица рынков события                                 */
/* ------------------------------------------------------------------ */

function MarketRow({
  market,
  index,
  ranked,
  eventClosed,
  points,
  selected,
  onSelect,
}: {
  market: Market;
  index: number;
  /** Взаимоисключающий набор: есть номер строки и полоса-мера. */
  ranked: boolean;
  eventClosed: boolean;
  points?: number[];
  selected: OutcomeSelection;
  onSelect: (market: Market, outcome: Outcome) => void;
}) {
  const yes = market.outcomes[0];
  const no = market.outcomes[1];
  const active = selected.marketId === market.id;
  const color = seriesColor(index);
  const tradable = isMarketTradable(market, eventClosed);
  const price = yes?.price ?? 0;

  const sideButton = (outcome: Outcome | undefined, side: "yes" | "no") => {
    if (!outcome) return null;
    const picked = isSelected(selected, market, outcome.index);
    const cents = formatCents(outcome.price, 0);
    return (
      <Button
        variant={side}
        size="xs"
        disabled={!outcome.tokenId}
        aria-pressed={picked}
        onClick={() => onSelect(market, outcome)}
        title={`${outcome.label} · ${cents}`}
        aria-label={`Выбрать «${outcome.label}» по ${cents}`}
        className={cn(
          "tnum h-8 min-w-[50px] flex-1 px-2 text-[11.5px] sm:min-w-[54px]",
          picked &&
            (side === "no"
              ? "bg-no text-white ring-no hover:bg-no-hover"
              : "bg-yes text-white ring-yes hover:bg-yes-hover"),
        )}
      >
        {cents}
      </Button>
    );
  };

  return (
    <div
      className={cn(
        "relative flex items-center gap-3 border-b border-border px-4 py-3 transition-colors last:border-b-0",
        active ? "bg-accent-soft" : "hover:bg-surface-hover",
      )}
    >
      {active && <ActiveStripe />}

      {ranked && (
        <span className="tnum w-4 shrink-0 text-[11px] leading-none text-faint" aria-hidden>
          {index + 1}
        </span>
      )}

      <MarketImage
        src={market.icon ?? market.image}
        alt=""
        size={32}
        className="hidden rounded-[10px] sm:block"
      />

      {/* Клик по названию выбирает исход «за» — тот же выбор, что и кнопка. */}
      <button
        type="button"
        onClick={() => yes && onSelect(market, yes)}
        aria-current={active}
        className="min-w-0 flex-1 cursor-pointer text-left"
      >
        <span className="line-clamp-2 text-[13px] font-medium leading-snug text-text">
          {market.groupTitle ?? market.question}
        </span>
        <span className="tnum mt-1 block text-[10.5px] leading-none text-faint">
          {formatVolume(market.volume)} оборот
        </span>
      </button>

      <Sparkline
        points={points ?? []}
        color={ranked ? color : undefined}
        width={64}
        height={22}
        className="hidden md:block"
      />

      <div className="hidden w-14 shrink-0 items-baseline justify-end lg:flex">
        <ChangeBadge change={market.oneDayPriceChange} />
      </div>

      <div className="w-[68px] shrink-0">
        <span className="display tnum block text-right text-[21px] leading-none text-text">
          {formatProbability(price)}
        </span>
        {/* Полоса — мера доли в общих 100%. У независимых ставок такой доли
            нет, поэтому её там не рисуем: она врала бы о сравнимости. */}
        {ranked && (
          <ProbabilityBar probability={price} color={color} className="mt-2" />
        )}
      </div>

      <div className="flex w-[110px] shrink-0 justify-end gap-1.5 sm:w-[120px]">
        {tradable ? (
          <>
            {sideButton(yes, "yes")}
            {sideButton(no, "no")}
          </>
        ) : (
          <Badge tone="neutral">Закрыт</Badge>
        )}
      </div>
    </div>
  );
}

function MarketTable({ event, selected, onSelect }: OutcomeListProps) {
  const ranked = event.exclusive;

  // Траектории берём ПАКЕТОМ на весь список: запрос на строку апстрим не выдержит.
  const tokenIds = useMemo(() => {
    const ids: string[] = [];
    for (const market of event.markets.slice(0, MAX_SPARKLINES)) {
      const id = market.outcomes[0]?.tokenId;
      if (id) ids.push(id);
    }
    return ids;
  }, [event.markets]);

  const { data } = useQuery({
    queryKey: queryKeys.sparklines(tokenIds),
    queryFn: ({ signal }) => api.sparklines(tokenIds, signal),
    enabled: tokenIds.length > 0,
    staleTime: REFRESH.prices,
  });
  const series: SparklineMap = data ?? {};

  const count = event.markets.length;
  const note = ranked
    ? `Сработает ровно один из ${count} исходов — цены в сумме дают 100%. Выбранная строка подставляется в панель сделки.`
    : `${count} независимых ${plural(count, QUESTION_FORMS)}: каждый решается сам по себе, складывать их цены незачем. Выбранная строка подставляется в панель сделки.`;

  return (
    <section>
      <SectionHead title={ranked ? "Исходы" : "Ставки события"} note={note} />

      <div className="card overflow-hidden">
        <div className="flex items-center gap-3 border-b border-border bg-bg-subtle px-4 py-2.5 text-[10px] font-medium uppercase leading-none tracking-[0.08em] text-faint">
          {ranked && <span className="w-4 shrink-0" />}
          <span className="hidden w-8 shrink-0 sm:block" />
          <span className="min-w-0 flex-1">{ranked ? "Исход" : "Вопрос"}</span>
          <span className="hidden w-16 shrink-0 md:block">Динамика</span>
          <span className="hidden w-14 shrink-0 text-right lg:block">24 ч</span>
          <span className="w-[68px] shrink-0 text-right">Шанс</span>
          <span className="w-[110px] shrink-0 text-right sm:w-[120px]">Выбор</span>
        </div>

        <div
          className={cn(
            count >= SCROLL_FROM && "thin-scrollbar max-h-[560px] overflow-y-auto",
          )}
        >
          {event.markets.map((market, index) => (
            <MarketRow
              key={market.id}
              market={market}
              index={index}
              ranked={ranked}
              eventClosed={event.closed}
              points={
                market.outcomes[0]?.tokenId
                  ? series[market.outcomes[0].tokenId]
                  : undefined
              }
              selected={selected}
              onSelect={onSelect}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

export function OutcomeList(props: OutcomeListProps) {
  const { event } = props;

  if (!event.markets.length) return null;
  if (event.isBinary || event.markets.length === 1) {
    return <BinaryOutcomes {...props} />;
  }
  return <MarketTable {...props} />;
}
