"use client";

/**
 * Расчёт сделки в подаче «главное — выплата».
 *
 * На рынке предсказаний человек думает не «какая у меня средняя цена», а
 * «сколько я получу, если угадаю». Поэтому герой блока — одно крупное число
 * антиквой (выплата при верном исходе), под ним прибыль и доходность, и лишь
 * затем мелкой группой служебные величины: средняя цена, объём,
 * проскальзывание, комиссия, итог списания.
 *
 * Ничего не считает сам — только показывает поля `Quote` из @/lib/pricing и
 * переводит технические ошибки движка на человеческий.
 */

import { AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";

import { Hint } from "@/components/ui/hint";
import { Skeleton } from "@/components/ui/skeleton";
import {
  formatCents,
  formatCompact,
  formatMoney,
  formatPercent,
  formatSignedMoney,
} from "@/lib/format";
import type { Quote, Side } from "@/lib/pricing";
import { cn } from "@/lib/utils";

/** Сообщения движка и портфеля приходят по-английски — показываем по-русски. */
const MESSAGES: Record<string, string> = {
  "Enter an amount": "Введите сумму",
  "Enter a size": "Введите количество",
  "Insufficient liquidity": "Недостаточно ликвидности",
  "No liquidity in the order book": "В стакане нет заявок",
  "Order could not be filled": "Заявку нельзя исполнить",
  "No orders match your limit price": "Нет заявок по вашей лимитной цене",
  "Limit price must be between 0 and 1": "Лимитная цена должна быть от 0 до 1",
  "Insufficient balance": "Недостаточно средств",
  "Not enough shares": "Недостаточно акций",
  "No position to sell": "Нет позиции для продажи",
  "Invalid price": "Некорректная цена",
  "Market is missing": "Рынок недоступен",
};

export function translateTradeError(error: string | null | undefined): string | null {
  if (!error) return null;
  return MESSAGES[error] ?? error;
}

/** formatPercent всегда ставит «+» — для проскальзывания знак только мешает. */
function unsignedPercent(value: number, digits = 2): string {
  return formatPercent(Math.abs(value), digits).replace("+", "");
}

const DASH = "—";

export type FigureTone = "neutral" | "yes" | "no" | "accent" | "muted";

const FIGURE_TONES: Record<FigureTone, string> = {
  neutral: "text-text",
  yes: "text-yes",
  no: "text-no",
  accent: "text-accent",
  muted: "text-faint",
};

/**
 * Герой торгового блока: одно число, которое отвечает на главный вопрос экрана.
 * У спота это выплата, у плеча — нокаут-цена. Общий компонент нужен, чтобы у
 * обеих вкладок был один типографский масштаб и одна рамка.
 */
export function TradeHero({
  kicker,
  value,
  tone = "neutral",
  note,
  hint,
  accented = false,
  alarm = false,
  className,
}: {
  /** Подпись капителью: чему равно число. */
  kicker: string;
  value: ReactNode;
  tone?: FigureTone;
  /** Строка под числом: прибыль, доходность, расстояние до нокаута. */
  note?: ReactNode;
  /** Пояснение термина рядом с подписью. */
  hint?: ReactNode;
  /** Индиговая подложка — когда число «живое» и в нём есть смысл. */
  accented?: boolean;
  /** Тревожная подложка — для нокаут-цены в зоне досягаемости. */
  alarm?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[14px] border px-4 py-3.5 transition-colors",
        alarm
          ? "border-no/30 bg-no-soft"
          : accented
            ? "border-accent/25 bg-accent-soft"
            : "border-border bg-bg-subtle",
        className,
      )}
    >
      {/* Подсказка стоит сразу за подписью, а не у правого края: тултип шириной
          224px, выровненный по правому краю узкой колонки, уезжал бы за экран. */}
      <div className="flex items-center gap-1.5">
        <p className="min-w-0 truncate text-[10.5px] font-medium uppercase tracking-[0.08em] text-faint">
          {kicker}
        </p>
        {hint && (
          <span className="shrink-0">
            <Hint>{hint}</Hint>
          </span>
        )}
      </div>

      <p className={cn("display tnum mt-2 text-[36px] leading-[0.95]", FIGURE_TONES[tone])}>
        {value}
      </p>

      {note && (
        <p className="tnum mt-2 text-[11.5px] leading-tight text-muted">{note}</p>
      )}
    </div>
  );
}

/** Служебная величина второго плана: подпись, подсказка, значение. */
export function Metric({
  label,
  value,
  hint,
  tone,
  strong = false,
  divider = false,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: string;
  strong?: boolean;
  divider?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-3",
        divider && "mt-2 border-t border-border pt-2",
      )}
    >
      <span className="flex min-w-0 items-center gap-1 text-muted">
        <span className="truncate">{label}</span>
        {hint && <Hint>{hint}</Hint>}
      </span>
      <span
        className={cn(
          "tnum shrink-0 text-right",
          strong ? "font-semibold text-text" : "font-medium text-text",
          tone,
        )}
      >
        {value}
      </span>
    </div>
  );
}

/** Группа служебных величин: мелкий текст, ровная сетка подписей и значений. */
export function MetricList({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5 px-1 text-[11.5px] leading-tight", className)}>
      {children}
    </div>
  );
}

/** Тревожная плашка расчёта: изменившаяся цена, частичное исполнение, ошибка. */
export function TradeNotice({
  children,
  tone = "warn",
  role,
}: {
  children: ReactNode;
  tone?: "warn" | "no";
  role?: "alert";
}) {
  return (
    <div
      role={role}
      className={cn(
        "flex items-start gap-2 rounded-[12px] px-3 py-2 text-[11.5px] leading-relaxed",
        tone === "no" ? "bg-no-soft text-no" : "bg-warn-soft text-warn",
      )}
    >
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <p className="min-w-0">{children}</p>
    </div>
  );
}

const AVG_PRICE_HINT =
  "Средняя цена всех акций заявки. Заявка съедает уровни стакана снизу вверх, поэтому чем она крупнее, тем средняя хуже лучшей цены.";

const SLIPPAGE_HINT =
  "Насколько средняя цена исполнения хуже лучшей цены в стакане. Растёт вместе с размером заявки и падает вместе с ликвидностью.";

const PAYOUT_HINT =
  "Каждая акция верного исхода гасится по $1. Выплата — это число акций в долларах; из неё уже вычтены комиссия и цена входа при расчёте прибыли.";

/** Цена ушла между показом расчёта и кликом по кнопке. */
export interface PriceAlert {
  /** Средняя цена, которую пользователь видел. */
  from: number;
  /** Средняя цена по текущему стакану. */
  to: number;
}

export interface QuoteSummaryProps {
  side: Side;
  quote: Quote | null;
  loading?: boolean;
  /** Название исхода — попадает в подпись героя. */
  outcomeLabel?: string;
  /**
   * Сколько вернёт один доллар при выигрыше (estimateReturn из @/lib/pricing).
   * Показываем до ввода суммы: пустой герой иначе ничего не сообщает.
   */
  perDollar?: number;
  /** Ожидаемый реализованный P&L продажи относительно средней позиции. */
  estimatedPnl?: number | null;
  priceAlert?: PriceAlert | null;
}

export function QuoteSummary({
  side,
  quote,
  loading = false,
  outcomeLabel,
  perDollar,
  estimatedPnl,
  priceAlert,
}: QuoteSummaryProps) {
  const isBuy = side === "BUY";

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="rounded-[14px] border border-border bg-bg-subtle px-4 py-3.5">
          <Skeleton className="h-2.5 w-28" />
          <Skeleton className="mt-3 h-8 w-36" />
          <Skeleton className="mt-3 h-2.5 w-24" />
        </div>
        <div className="space-y-2 px-1">
          {[0, 1, 2].map((row) => (
            <div key={row} className="flex items-center justify-between gap-3">
              <Skeleton className="h-2.5 w-24" />
              <Skeleton className="h-2.5 w-14" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const error = translateTradeError(quote?.error);
  const filled = quote && !quote.error ? quote : null;

  const label = outcomeLabel?.trim();
  // Длинное название исхода в подписи пришлось бы усечь, а вместе с ним уехал
  // бы вправо и знак подсказки — для таких рынков берём безымянный вариант.
  const heroKicker = isBuy
    ? label && label.length <= 12
      ? `Выплата, если «${label}»`
      : "Выплата при выигрыше"
    : "Придёт на счёт";

  const heroNote = isBuy ? (
    filled ? (
      <>
        <span
          className={cn(
            "font-semibold",
            filled.profitIfWin > 0 ? "text-yes" : filled.profitIfWin < 0 ? "text-no" : undefined,
          )}
        >
          {formatSignedMoney(filled.profitIfWin)}
        </span>{" "}
        прибыли · доходность{" "}
        <span className="font-semibold text-text">{formatPercent(filled.returnPct, 0)}</span>
      </>
    ) : perDollar && perDollar > 0 ? (
      <>
        Каждый вложенный $1 вернёт{" "}
        <span className="font-semibold text-text">{formatMoney(perDollar)}</span>
      </>
    ) : (
      "Введите сумму — покажем выплату и доходность"
    )
  ) : filled ? (
    estimatedPnl != null ? (
      <>
        Реализованный P&L{" "}
        <span
          className={cn(
            "font-semibold",
            estimatedPnl > 0 ? "text-yes" : estimatedPnl < 0 ? "text-no" : undefined,
          )}
        >
          {formatSignedMoney(estimatedPnl)}
        </span>{" "}
        к средней цене позиции
      </>
    ) : (
      "Выручка за акции по текущему стакану"
    )
  ) : (
    "Введите количество акций — покажем выручку"
  );

  return (
    <div className="space-y-3">
      <TradeHero
        kicker={heroKicker}
        hint={isBuy ? PAYOUT_HINT : undefined}
        // Пустой герой — «сумма, которой пока нет»: знак доллара с прочерком
        // читается как незаполненная строка, а один прочерк — как длинная линейка.
        value={filled ? formatMoney(isBuy ? filled.payout : filled.total) : `$${DASH}`}
        tone={filled ? "neutral" : "muted"}
        accented={Boolean(filled)}
        note={heroNote}
      />

      <MetricList>
        <Metric
          label="Средняя цена"
          hint={AVG_PRICE_HINT}
          value={filled ? formatCents(filled.avgPrice) : DASH}
        />
        <Metric
          label={isBuy ? "Получите акций" : "Продадите акций"}
          value={filled ? formatCompact(filled.shares) : DASH}
        />
        <Metric
          label="Проскальзывание"
          hint={SLIPPAGE_HINT}
          value={filled ? unsignedPercent(filled.slippage) : DASH}
          tone={filled && filled.slippage > 0.01 ? "text-warn" : undefined}
        />
        <Metric label="Комиссия" value={filled ? formatMoney(filled.fee) : DASH} />
        <Metric
          label={isBuy ? "Спишется со счёта" : "Выручка до комиссии"}
          value={filled ? formatMoney(isBuy ? filled.total : filled.cost) : DASH}
          strong
          divider
        />
      </MetricList>

      {priceAlert && (
        <TradeNotice role="alert">
          Цена изменилась:{" "}
          <span className="tnum font-semibold">{formatCents(priceAlert.from)}</span> →{" "}
          <span className="tnum font-semibold">{formatCents(priceAlert.to)}</span>. Расчёт выше
          уже пересчитан — нажмите ещё раз, чтобы исполнить по новой цене.
        </TradeNotice>
      )}

      {filled?.partial && (
        <TradeNotice>
          Недостаточно ликвидности — исполнится только{" "}
          <span className="tnum font-semibold">{formatCompact(filled.filledShares)}</span> акц. на{" "}
          <span className="tnum font-semibold">{formatMoney(filled.cost)}</span>.
        </TradeNotice>
      )}

      {error && <TradeNotice tone="no">{error}</TradeNotice>}
    </div>
  );
}
