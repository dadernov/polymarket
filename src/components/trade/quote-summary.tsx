"use client";

/**
 * Расшифровка котировки: средняя цена, объём, выплата, комиссия, итог.
 * Ничего не считает сама — только показывает то, что вернул движок из
 * @/lib/pricing, плюс переводит его технические ошибки на человеческий.
 */

import { AlertTriangle } from "lucide-react";

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

function Row({
  label,
  value,
  tone,
  strong = false,
}: {
  label: string;
  value: string;
  tone?: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span
        className={cn(
          "tnum text-right",
          strong ? "text-sm font-semibold text-text" : "font-medium text-text",
          tone,
        )}
      >
        {value}
      </span>
    </div>
  );
}

export interface QuoteSummaryProps {
  side: Side;
  quote: Quote | null;
  loading?: boolean;
  /** Ожидаемый реализованный P&L продажи относительно средней позиции. */
  estimatedPnl?: number | null;
}

export function QuoteSummary({ side, quote, loading = false, estimatedPnl }: QuoteSummaryProps) {
  if (loading) {
    return (
      <div className="space-y-2 rounded-xl border border-border bg-bg-subtle p-3">
        {[0, 1, 2, 3].map((row) => (
          <div key={row} className="flex items-center justify-between gap-3">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
    );
  }

  const error = translateTradeError(quote?.error);
  const filled = quote && !quote.error ? quote : null;
  const isBuy = side === "BUY";

  return (
    <div className="space-y-2.5">
      <div className="space-y-1.5 rounded-xl border border-border bg-bg-subtle p-3 text-xs">
        <Row
          label="Средняя цена"
          value={filled ? formatCents(filled.avgPrice) : DASH}
        />
        <Row
          label={isBuy ? "Получите акций" : "Продадите акций"}
          value={filled ? formatCompact(filled.shares) : DASH}
        />

        {isBuy ? (
          <>
            <Row
              label="Выплата при выигрыше"
              value={filled ? formatMoney(filled.payout) : DASH}
            />
            <Row
              label="Прибыль"
              value={
                filled
                  ? `${formatSignedMoney(filled.profitIfWin)} · ${formatPercent(filled.returnPct, 0)}`
                  : DASH
              }
              tone={filled && filled.profitIfWin > 0 ? "text-yes" : undefined}
            />
          </>
        ) : (
          estimatedPnl != null && (
            <Row
              label="Реализованный P&L"
              value={formatSignedMoney(estimatedPnl)}
              tone={
                estimatedPnl > 0 ? "text-yes" : estimatedPnl < 0 ? "text-no" : undefined
              }
            />
          )
        )}

        <Row
          label="Проскальзывание"
          value={filled ? unsignedPercent(filled.slippage) : DASH}
          tone={filled && filled.slippage > 0.01 ? "text-[color:var(--warn)]" : undefined}
        />
        <Row label="Комиссия" value={filled ? formatMoney(filled.fee) : DASH} />

        <div className="mt-1 border-t border-border pt-2">
          <Row
            label={isBuy ? "Спишется" : "Вы получите"}
            value={filled ? formatMoney(filled.total) : DASH}
            strong
          />
        </div>
      </div>

      {filled?.partial && (
        <div className="flex items-start gap-2 rounded-lg bg-[color:var(--warn)]/10 px-2.5 py-2 text-xs text-[color:var(--warn)]">
          <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
          <p>
            Недостаточно ликвидности — исполнится только{" "}
            <span className="tnum font-semibold">{formatCompact(filled.filledShares)}</span> акц.
            на <span className="tnum font-semibold">{formatMoney(filled.cost)}</span>.
          </p>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-no-soft px-2.5 py-2 text-xs text-no">
          <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
          <p>{error}</p>
        </div>
      )}
    </div>
  );
}
