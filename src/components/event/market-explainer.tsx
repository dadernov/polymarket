"use client";

/**
 * Разбор выбранного исхода простыми словами.
 *
 * Главная претензия к рынкам предсказаний в том, что новичок не понимает, что
 * именно он покупает: акцию исхода, которая гасится по $1 или по $0. Блок
 * отвечает на это фактическими числами выбранного рынка — цена, сколько акций
 * даёт условная сумма, что будет при верном и при неверном исходе, когда и по
 * какому источнику подводится итог.
 *
 * Тон намеренно бухгалтерский: механика расчёта, без обещаний дохода.
 */

import type { ReactNode } from "react";

import { Hint, Note } from "@/components/ui/hint";
import {
  formatCents,
  formatCompact,
  formatDate,
  formatMoney,
  formatProbability,
  formatTimeLeft,
} from "@/lib/format";
import { estimateReturn } from "@/lib/pricing";
import type { Market, MarketEvent, Outcome } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Условная сумма, на которой показываем арифметику: круглая читается быстрее. */
const EXAMPLE = 100;

/** Ниже/выше этого цена означает, что вопрос фактически уже решён. */
const RESOLVED_EPS = 0.005;

export interface MarketExplainerProps {
  event: MarketEvent;
  market: Market;
  outcome: Outcome;
  className?: string;
}

/** Из ссылки на источник показываем только домен — путь съедает строку. */
function sourceHost(source: string): string {
  try {
    return new URL(source).host.replace(/^www\./, "");
  } catch {
    return source;
  }
}

function SourceValue({ source }: { source: string | null }) {
  if (!source) {
    return <span className="text-text">тексту правил (вкладка «Правила»)</span>;
  }
  if (!/^https?:\/\//.test(source)) {
    return <span className="text-text">{source}</span>;
  }
  return (
    <a
      href={source}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-accent underline-offset-2 transition-colors hover:text-accent-hover hover:underline"
    >
      {sourceHost(source)}
    </a>
  );
}

function Step({
  index,
  label,
  children,
}: {
  index: number;
  label: string;
  children: ReactNode;
}) {
  return (
    <li className="min-w-0">
      <p className="flex items-baseline gap-2 text-[10.5px] font-medium uppercase leading-none tracking-[0.08em] text-faint">
        <span className="display tnum text-[14px] leading-none">{index}</span>
        <span className="min-w-0">{label}</span>
      </p>
      <p className="mt-2 text-[12.5px] leading-relaxed text-muted">{children}</p>
    </li>
  );
}

/** Число внутри объяснения: чернилами и табличными цифрами. */
function Num({ children }: { children: ReactNode }) {
  return <strong className="tnum font-semibold text-text">{children}</strong>;
}

export function MarketExplainer({
  event,
  market,
  outcome,
  className,
}: MarketExplainerProps) {
  const price = outcome.price;
  const tradable = !event.closed && !market.closed && market.acceptingOrders;
  const settled = price <= RESOLVED_EPS || price >= 1 - RESOLVED_EPS;

  const shares = price > 0 ? EXAMPLE / price : 0;
  const multiple = estimateReturn(price);
  const surplus = shares - EXAMPLE;

  const source = market.resolutionSource ?? event.resolutionSource;
  const endDate = market.endDate ?? event.endDate;
  const timeLeft = formatTimeLeft(endDate);
  const marketName = market.groupTitle?.trim() || null;
  /** Набор независимых ставок: соседние вопросы события к этому не относятся. */
  const standalone = !event.exclusive && event.markets.length > 1;

  return (
    <section className={cn("card p-4 sm:p-5", className)}>
      <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 className="display text-[20px] leading-tight text-text">
            Что вы покупаете
          </h2>
          <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
            Разбор исхода «{outcome.label}»
            {marketName ? ` рынка «${marketName}»` : ""} по текущей цене, на
            примере {formatMoney(EXAMPLE, 0)}.
            {standalone
              ? " Это отдельный вопрос события — остальные ставки решаются независимо от него."
              : ""}
          </p>
        </div>

        <p className="shrink-0 text-right">
          <span className="block text-[10.5px] font-medium uppercase leading-none tracking-[0.08em] text-faint">
            цена акции
          </span>
          <span className="display tnum mt-1.5 block text-[22px] leading-none text-text">
            {formatCents(price, 1)}
          </span>
        </p>
      </header>

      <ol
        className={cn(
          "mt-4 grid gap-4 border-t border-border pt-4",
          "sm:grid-cols-3 sm:gap-6 sm:[&>*+*]:border-l sm:[&>*+*]:border-border sm:[&>*+*]:pl-6",
        )}
      >
        <Step index={1} label="цена — это вероятность">
          Акция исхода стоит <Num>{formatCents(price, 1)}</Num> из доллара.
          Столько же — <Num>{formatProbability(price)}</Num> — рынок отводит
          этому исходу шансов.
        </Step>

        {settled ? (
          <Step index={2} label="запаса почти нет">
            Цена <Num>{formatCents(price, 1)}</Num> означает, что вопрос считают
            практически решённым: расстояние между ценой и границей ($1 или $0)
            почти исчерпано.
          </Step>
        ) : (
          <Step index={2} label="верный исход — $1">
            На {formatMoney(EXAMPLE, 0)} приходится{" "}
            <Num>{formatCompact(shares)}</Num> акц. Верный исход гасится по{" "}
            <Num>$1</Num> за акцию — это <Num>{formatMoney(shares)}</Num>, то
            есть <Num>{multiple.toFixed(2)}×</Num> вложенного (
            <Num>+{formatMoney(surplus)}</Num>).
          </Step>
        )}

        <Step index={3} label="неверный исход — $0">
          {settled ? (
            <>
              Если вопрос всё же решится иначе, акции гасятся по <Num>$0</Num> и
              вложенное не возвращается: риск ограничен суммой сделки, но
              реализуется целиком.
            </>
          ) : (
            <>
              Если исход не подтвердится, акции гасятся по <Num>$0</Num>: из{" "}
              {formatMoney(EXAMPLE, 0)} не вернётся ничего. Потерять можно всю
              сумму, но не больше неё.
            </>
          )}
        </Step>
      </ol>

      <div
        className={cn(
          "mt-4 flex flex-wrap items-baseline gap-x-6 gap-y-2 border-t border-border pt-3.5",
          "text-[11.5px] leading-relaxed text-muted",
        )}
      >
        <span className="min-w-0">
          Итог подводится по <SourceValue source={source} />
        </span>
        <span className="min-w-0">
          после <Num>{formatDate(endDate)}</Num>
          {!event.closed && timeLeft !== "—" ? (
            <span className="text-faint"> · {timeLeft}</span>
          ) : null}
        </span>
      </div>

      {tradable ? (
        <Note className="mt-3">
          Числа выше — по текущей цене. Фактическая цена сделки складывается из
          заявок в стакане: чем шире спред{" "}
          <Hint>
            Спред — разрыв между лучшей ценой покупки и лучшей ценой продажи.
            Чем он шире, тем дороже войти в позицию и выйти из неё.
          </Hint>{" "}
          и крупнее заявка, тем заметнее проскальзывание{" "}
          <Hint>
            Проскальзывание — разница между ожидаемой ценой и средней ценой
            исполнения: крупная заявка выкупает несколько уровней стакана
            подряд.
          </Hint>
          . Точный расчёт по вашей сумме показывает панель сделки.
        </Note>
      ) : (
        <Note tone="warn" className="mt-3">
          Торги по этому рынку закрыты: новые заявки не принимаются. Числа выше
          описывают механику расчёта, а не доступную сейчас сделку.
        </Note>
      )}
    </section>
  );
}
