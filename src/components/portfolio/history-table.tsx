"use client";

import Link from "next/link";
import { History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { MarketImage } from "@/components/ui/market-image";
import { Skeleton } from "@/components/ui/skeleton";
import {
  formatCents,
  formatCompact,
  formatDateTime,
  formatMoney,
  formatRelativeTime,
  formatSignedMoney,
} from "@/lib/format";
import type { Fill } from "@/lib/store";
import { cn, eventHref } from "@/lib/utils";

/** Капительная шапка столбца — общий вид всех таблиц портфеля. */
const TH =
  "px-4 py-3 text-[10.5px] font-medium uppercase tracking-[0.08em] text-faint whitespace-nowrap";

export function HistoryTable({
  fills,
  loading = false,
}: {
  fills: Fill[];
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="card overflow-hidden">
        {Array.from({ length: 5 }, (_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 border-b border-border p-4 last:border-0"
          >
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="size-8 rounded-xl" />
            <Skeleton className="h-3.5 flex-1" />
            <Skeleton className="h-3.5 w-20" />
          </div>
        ))}
      </div>
    );
  }

  if (fills.length === 0) {
    return (
      <div className="card">
        <EmptyState
          icon={<History />}
          title="История сделок пуста"
          description="Каждая покупка и продажа попадает сюда: цена исполнения, комиссия и результат."
          action={
            <Button asChild size="sm">
              <Link href="/">К рынкам</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <div className="thin-scrollbar overflow-x-auto">
        <table className="w-full min-w-[880px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className={cn(TH, "text-left")}>Когда</th>
              <th className={cn(TH, "text-left")}>Сторона</th>
              <th className={cn(TH, "text-left")}>Рынок</th>
              <th className={cn(TH, "text-right")}>Акции</th>
              <th className={cn(TH, "text-right")}>Цена</th>
              <th className={cn(TH, "text-right")}>Итого</th>
              <th className={cn(TH, "text-right")}>Результат</th>
            </tr>
          </thead>

          <tbody>
            {fills.map((fill) => {
              const buy = fill.side === "BUY";
              // Покупка списывает cost + комиссию, продажа приносит cost - комиссию.
              const total = buy ? fill.cost + fill.fee : Math.max(0, fill.cost - fill.fee);

              return (
                <tr
                  key={fill.id}
                  className="border-b border-border transition-colors last:border-0 hover:bg-surface-hover"
                >
                  <td
                    className="whitespace-nowrap px-4 py-3.5 text-[12px] text-muted"
                    title={formatDateTime(fill.timestamp)}
                  >
                    {formatRelativeTime(fill.timestamp)}
                  </td>
                  <td className="px-4 py-3.5">
                    {/* Сторона сделки читается цветом слова, а не плашкой:
                        в длинной ленте плашки создают лишний шум. */}
                    <span
                      className={cn(
                        "text-[10.5px] font-semibold uppercase tracking-[0.08em]",
                        buy ? "text-yes" : "text-no",
                      )}
                    >
                      {buy ? "Покупка" : "Продажа"}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <MarketImage src={fill.icon} alt="" size={30} className="rounded-lg" />
                      <div className="min-w-0">
                        <Link
                          href={eventHref(fill.eventSlug)}
                          className="line-clamp-1 text-[13.5px] text-text transition-colors hover:text-accent"
                        >
                          {fill.eventTitle}
                        </Link>
                        <p className="text-[11px] text-faint">{fill.outcomeLabel}</p>
                      </div>
                    </div>
                  </td>
                  <td className="tnum px-4 py-3.5 text-right text-muted">
                    {formatCompact(fill.shares)}
                  </td>
                  <td className="tnum px-4 py-3.5 text-right text-text">
                    {formatCents(fill.price)}
                  </td>
                  <td className="tnum px-4 py-3.5 text-right font-medium text-text">
                    {formatMoney(total)}
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    {buy ? (
                      <span className="text-xs text-faint" title="Результат фиксируется при продаже">
                        —
                      </span>
                    ) : (
                      <span
                        className={cn(
                          "tnum font-semibold",
                          fill.realizedPnl > 0 && "text-yes",
                          fill.realizedPnl < 0 && "text-no",
                          fill.realizedPnl === 0 && "text-faint",
                        )}
                      >
                        {formatSignedMoney(fill.realizedPnl)}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
