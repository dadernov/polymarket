"use client";

// Директива здесь не про интерактивность, а про <Button asChild>: внутри Slot
// зовётся Children.only, а из серверного компонента дети приезжают RSC-потоком
// как массив — на этом Slot падает. Поэтому выбор героя и его ставок живёт
// в серверной странице, а здесь остаётся только подача.

import Link from "next/link";
import { Badge, ChangeBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/hint";
import { MarketImage } from "@/components/ui/market-image";
import { Sparkline } from "@/components/ui/sparkline";
import { Stat } from "@/components/ui/stat";
import {
  formatCents,
  formatDate,
  formatProbability,
  formatTimeLeft,
  formatVolume,
} from "@/lib/format";
import type { Market, MarketEvent, SparklineMap } from "@/lib/types";
import { cn, eventHref } from "@/lib/utils";

/** Русское склонение после числа: 1 исход, 2 исхода, 5 исходов. */
function plural(count: number, forms: readonly [string, string, string]): string {
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 14) return forms[2];
  const mod10 = count % 10;
  if (mod10 === 1) return forms[0];
  if (mod10 >= 2 && mod10 <= 4) return forms[1];
  return forms[2];
}

/**
 * Ссылка на событие с предзаполненной сделкой: состояние живёт в адресе, им
 * можно поделиться. Правило повторяет карточку ленты — оно одинаковое, но
 * общего модуля у клиентских компонентов для него нет.
 */
function tradeHref(slug: string, tokenId: string | null): string {
  const base = eventHref(slug);
  if (!tokenId) return base;
  return `${base}?outcome=${encodeURIComponent(tokenId)}&side=BUY`;
}

export interface HeroMarketProps {
  event: MarketEvent;
  /**
   * Верхние ставки события, у которого нет единой вероятности
   * (`exclusive: false`). Пустой список означает обратное: у события есть одно
   * главное число, и показывать надо его. Что считать главным — решает
   * страница, здесь только подача.
   */
  bets: Market[];
  /** Ряды цен по tokenId из пакетного запроса страницы. */
  series: SparklineMap;
  className?: string;
}

/**
 * Главный материал главной страницы.
 *
 * Карточка ленты отвечает на вопрос «что здесь торгуется», герой — на вопрос
 * «что сейчас важно»: вопрос заголовочной антиквой, вероятность размером
 * с заголовок, недельная траектория во всю ширину и показатели рядом.
 *
 * Событию без единой вероятности (набор независимых ставок, `exclusive: false`)
 * одно большое число показать нельзя — сумма цен по такому событию доходит до
 * десятков. Вместо него идут три самые торгуемые ставки, каждая со своей
 * траекторией: это честная подача того же объёма внимания.
 */
export function HeroMarket({ event, bets, series, className }: HeroMarketProps) {
  const lead = event.markets[0];
  if (!lead) return null;

  const ranked = bets.length === 0;
  const yes = lead.outcomes[0];
  const no = lead.outcomes[1];
  const yesLabel = yes?.label ?? "Yes";
  const noLabel = no?.label ?? "No";
  const locked = event.closed || lead.closed || !lead.acceptingOrders;
  const leadPoints = (yes?.tokenId ? series[yes.tokenId] : undefined) ?? [];

  // Надзаголовок объясняет, что за число (или список) идёт ниже.
  const kicker = ranked
    ? event.markets.length > 1
      ? `Лидер из ${event.markets.length} ${plural(event.markets.length, ["исхода", "исходов", "исходов"])}`
      : null
    : `${event.markets.length} ${plural(event.markets.length, ["независимая ставка", "независимые ставки", "независимых ставок"])}`;

  // Подпись у большого числа: чья это вероятность. Название рынка идёт
  // в обычном регистре — капитель превращает исходы вроде «No change»
  // в лозунг, который читается как часть интерфейса, а не как данные.
  const captionKind = event.markets.length > 1 ? "лидер" : "исход";
  const captionName = event.markets.length > 1 ? (lead.groupTitle ?? lead.question) : yesLabel;

  return (
    <article className={cn("card", className)}>
      <div className="grid lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 p-5 sm:p-7 lg:p-9">
          <header className="flex items-center gap-3.5">
            <MarketImage
              src={event.icon ?? event.image}
              alt=""
              size={44}
              className="rounded-xl"
            />
            <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5">
              <span className="text-[10.5px] font-semibold uppercase leading-none tracking-[0.16em] text-accent">
                Главный вопрос дня
              </span>
              {event.live && <Badge tone="live">Live</Badge>}
              {event.isNew && <Badge tone="accent">Новое</Badge>}
              {kicker && (
                <span className="tnum text-[10.5px] font-medium uppercase leading-none tracking-[0.08em] text-faint">
                  {kicker}
                </span>
              )}
            </div>
          </header>

          {/* На узком экране строка короткая, и двух строк вопросу мало —
              обрезать главный вопрос страницы нельзя, поэтому там три. */}
          <h2 className="mt-5 sm:mt-6">
            <Link
              href={eventHref(event.slug)}
              className="display line-clamp-3 text-[28px] leading-[1.12] text-text transition-colors hover:text-accent sm:line-clamp-2 sm:text-[34px] lg:text-[40px]"
            >
              {event.title}
            </Link>
          </h2>

          {ranked ? (
            <>
              <div className="mt-7 flex flex-wrap items-end gap-x-9 gap-y-4">
                <div className="flex items-end gap-3.5">
                  <span className="display tnum text-[62px] leading-[0.8] text-text sm:text-[78px]">
                    {formatProbability(yes?.price ?? 0)}
                  </span>
                  <span className="mb-1.5 max-w-[16ch] min-w-0">
                    <span className="block text-[10px] font-semibold uppercase leading-none tracking-[0.16em] text-faint">
                      {captionKind}
                    </span>
                    <span className="mt-1.5 line-clamp-2 text-[13px] font-medium leading-tight text-muted">
                      {captionName}
                    </span>
                  </span>
                </div>
                <div className="mb-2 flex items-baseline gap-2">
                  <ChangeBadge change={lead.oneDayPriceChange} className="text-[16px]" />
                  <span className="text-[11.5px] leading-none text-faint">
                    п.п. за сутки
                  </span>
                </div>
              </div>

              {/* Два экземпляра вместо одного растяжимого: SVG сохраняет
                  пропорции viewBox, поэтому единственный размер давал бы либо
                  поля по бокам на десктопе, либо плоскую линию на телефоне.
                  У мобильного заливки нет — вместе с ней ушёл бы и повторный
                  id градиента. */}
              <div className="mt-7">
                <Sparkline
                  points={leadPoints}
                  width={360}
                  height={52}
                  area={false}
                  dot
                  className="w-full sm:hidden"
                />
                <Sparkline
                  points={leadPoints}
                  width={980}
                  height={68}
                  dot
                  className="hidden w-full sm:block"
                />
                {leadPoints.length >= 2 && (
                  <div className="mt-2 flex items-center justify-between text-[10px] font-medium uppercase leading-none tracking-[0.14em] text-faint">
                    <span>7 дней назад</span>
                    <span>сейчас</span>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="mt-6 flex flex-col">
              {bets.map((market, index) => {
                const bet = market.outcomes[0];
                const against = market.outcomes[1];
                const betPoints = (bet?.tokenId ? series[bet.tokenId] : undefined) ?? [];
                const betLocked =
                  event.closed || market.closed || !market.acceptingOrders;
                return (
                  <div
                    key={market.id}
                    className={cn(
                      "flex flex-wrap items-center gap-x-5 gap-y-3 py-4",
                      index === 0 && "pt-0",
                      index > 0 && "border-t border-border",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium leading-snug text-text">
                        {market.groupTitle ?? market.question}
                      </p>
                      <p className="tnum mt-1.5 text-[11px] leading-none text-faint">
                        Оборот за сутки {formatVolume(market.volume24hr)}
                      </p>
                    </div>

                    <Sparkline points={betPoints} width={80} height={28} dot />

                    <span className="display tnum shrink-0 text-[30px] leading-none text-text">
                      {formatProbability(bet?.price ?? 0)}
                    </span>

                    {betLocked ? (
                      <Badge className="shrink-0">Закрыт</Badge>
                    ) : (
                      // На кнопке одна цена: подписи «Yes»/«No» читаются
                      // цветом, а имя вопроса стоит строкой левее. Для
                      // скринридера смысл кнопки несёт aria-label.
                      <div className="flex shrink-0 items-center gap-2">
                        <Button asChild variant="yes" size="sm" className="min-w-[68px]">
                          <Link
                            href={tradeHref(event.slug, bet?.tokenId ?? null)}
                            aria-label={`${bet?.label ?? "Yes"} по ${formatCents(bet?.price ?? 0, 0)}: ${market.groupTitle ?? market.question}`}
                          >
                            <span className="tnum">{formatCents(bet?.price ?? 0, 0)}</span>
                          </Link>
                        </Button>
                        <Button asChild variant="no" size="sm" className="min-w-[68px]">
                          <Link
                            href={tradeHref(event.slug, against?.tokenId ?? null)}
                            aria-label={`${against?.label ?? "No"} по ${formatCents(against?.price ?? 1 - (bet?.price ?? 0), 0)}: ${market.groupTitle ?? market.question}`}
                          >
                            <span className="tnum">
                              {formatCents(against?.price ?? 1 - (bet?.price ?? 0), 0)}
                            </span>
                          </Link>
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Приглушённая панель справа: показатели и вход в сделку отделены от
            смысловой части, как врезка от текста статьи. */}
        {/* Скругления повторяют форму карточки: снизу на телефоне, справа на
            десктопе. Без этого фон панели срезал бы угол карточки. */}
        <aside className="flex flex-col gap-6 rounded-b-[15px] border-t border-border bg-bg-subtle p-5 sm:p-7 lg:rounded-bl-none lg:rounded-tr-[15px] lg:border-l lg:border-t-0">
          {/* Столбец на телефоне, ряд на планшете, столбец с линовкой на
              десктопе. Показатели идут столбцом, а не сеткой, ещё и затем,
              чтобы подсказка у «Ликвидности» раскрывалась от левого края:
              её всплывающая плашка фиксированной ширины и края окна не знает. */}
          <div className="flex flex-col gap-4 sm:flex-row sm:gap-7 lg:flex-col lg:gap-0 lg:[&>*+*]:mt-4 lg:[&>*+*]:border-t lg:[&>*+*]:border-border lg:[&>*+*]:pt-4">
            <Stat label="Оборот за 24 часа" value={formatVolume(event.volume24hr)} />
            <div className="flex min-w-0 items-start gap-1.5">
              <Stat label="Ликвидность" value={formatVolume(event.liquidity)} />
              <Hint>
                Ликвидность — сколько денег стоит в заявках рядом с текущей
                ценой. Чем её больше, тем меньше крупная ставка сдвигает цену.
              </Hint>
            </div>
            <Stat
              label="Закрытие"
              value={formatDate(event.endDate)}
              hint={formatTimeLeft(event.endDate)}
            />
          </div>

          <div>
            {ranked ? (
              locked ? (
                <>
                  <Badge tone="warn">Торги закрыты</Badge>
                  <p className="mt-2.5 text-[11px] leading-relaxed text-faint">
                    Ставки по этому вопросу больше не принимаются — остались
                    график и правила расчёта.
                  </p>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2.5">
                    <Button asChild variant="yes" size="lg" fullWidth>
                      <Link href={tradeHref(event.slug, yes?.tokenId ?? null)}>
                        <span className="truncate">{yesLabel}</span>
                        <span className="tnum shrink-0">
                          {formatCents(yes?.price ?? 0, 0)}
                        </span>
                      </Link>
                    </Button>
                    <Button asChild variant="no" size="lg" fullWidth>
                      <Link href={tradeHref(event.slug, no?.tokenId ?? null)}>
                        <span className="truncate">{noLabel}</span>
                        <span className="tnum shrink-0">
                          {formatCents(no?.price ?? 1 - (yes?.price ?? 0), 0)}
                        </span>
                      </Link>
                    </Button>
                  </div>
                  <p className="mt-2.5 text-[11px] leading-relaxed text-faint">
                    Открывает событие с выбранным исходом: стакан, график и
                    правила расчёта — там же.
                  </p>
                </>
              )
            ) : (
              <Button asChild size="lg" fullWidth>
                <Link href={eventHref(event.slug)}>
                  Все {event.markets.length}{" "}
                  {plural(event.markets.length, ["ставка", "ставки", "ставок"])}
                </Link>
              </Button>
            )}
          </div>
        </aside>
      </div>
    </article>
  );
}
