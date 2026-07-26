"use client";

import Link from "next/link";
import { History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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

export function HistoryTable({
  fills,
  loading = false,
}: {
  fills: Fill[];
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 border-b border-border p-3 last:border-0">
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="size-8 rounded-lg" />
            <Skeleton className="h-3.5 flex-1" />
            <Skeleton className="h-3.5 w-20" />
          </div>
        ))}
      </div>
    );
  }

  if (fills.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface">
        <EmptyState
          icon={<History />}
          title="История сделок пуста"
          description="Каждая покупка и продажа попадает сюда: цена исполнения, комиссия и результат."
        />
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="thin-scrollbar overflow-x-auto">
        <table className="w-full min-w-[860px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-xs font-medium text-muted">
              <th className="px-3 py-2.5 text-left font-medium">Когда</th>
              <th className="px-3 py-2.5 text-left font-medium">Сторона</th>
              <th className="px-3 py-2.5 text-left font-medium">Рынок</th>
              <th className="px-3 py-2.5 text-right font-medium">Акции</th>
              <th className="px-3 py-2.5 text-right font-medium">Цена</th>
              <th className="px-3 py-2.5 text-right font-medium">Итого</th>
              <th className="px-3 py-2.5 text-right font-medium">Результат</th>
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
                    className="whitespace-nowrap px-3 py-3 text-xs text-muted"
                    title={formatDateTime(fill.timestamp)}
                  >
                    {formatRelativeTime(fill.timestamp)}
                  </td>
                  <td className="px-3 py-3">
                    <Badge tone={buy ? "yes" : "no"}>{buy ? "Покупка" : "Продажа"}</Badge>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2.5">
                      <MarketImage src={fill.icon} alt="" size={30} />
                      <div className="min-w-0">
                        <Link
                          href={eventHref(fill.eventSlug)}
                          className="line-clamp-1 text-sm text-text transition-colors hover:text-accent"
                        >
                          {fill.eventTitle}
                        </Link>
                        <p className="text-[11px] text-faint">{fill.outcomeLabel}</p>
                      </div>
                    </div>
                  </td>
                  <td className="tnum px-3 py-3 text-right text-muted">
                    {formatCompact(fill.shares)}
                  </td>
                  <td className="tnum px-3 py-3 text-right text-text">
                    {formatCents(fill.price)}
                  </td>
                  <td className="tnum px-3 py-3 text-right font-medium text-text">
                    {formatMoney(total)}
                  </td>
                  <td className="px-3 py-3 text-right">
                    {buy ? (
                      <span className="text-xs text-faint">—</span>
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
