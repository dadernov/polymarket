"use client";

import { useQueries } from "@tanstack/react-query";
import { Activity } from "lucide-react";

import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { REFRESH, api, queryKeys } from "@/lib/api";
import {
  formatCents,
  formatCompact,
  formatMoney,
  formatRelativeTime,
  traderName,
} from "@/lib/format";
import type { MarketEvent, Trade } from "@/lib/types";
import { outcomeColor } from "@/lib/utils";

/** Сколько рынков события опрашиваем: на длинных списках иначе десятки запросов. */
const MAX_MARKETS = 5;
const PER_MARKET = 20;
const MAX_ROWS = 40;

function tradeKey(trade: Trade): string {
  return `${trade.transactionHash}-${trade.asset}-${trade.timestamp}-${trade.size}`;
}

export function ActivityFeed({ event }: { event: MarketEvent }) {
  const markets = event.markets.slice(0, MAX_MARKETS);
  // Название рынка в строке нужно только когда рынков несколько; берём
  // короткий заголовок группы, иначе вопрос целиком съедает всю строку.
  const multi = event.markets.length > 1;
  const titles = new Map(
    event.markets.map((m) => [m.conditionId, m.groupTitle ?? m.question]),
  );

  const results = useQueries({
    queries: markets.map((market) => ({
      queryKey: queryKeys.trades({ conditionId: market.conditionId, limit: PER_MARKET }),
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        api.trades({ conditionId: market.conditionId, limit: PER_MARKET }, signal),
      refetchInterval: REFRESH.trades,
      staleTime: REFRESH.trades,
      retry: 1,
    })),
  });

  const loading = results.some((r) => r.isPending);

  const seen = new Set<string>();
  const trades = results
    .flatMap((r) => r.data ?? [])
    .filter((trade) => {
      const key = tradeKey(trade);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, MAX_ROWS);

  if (loading && trades.length === 0) {
    return (
      <div className="space-y-2 py-2">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 py-1.5">
            <Skeleton className="size-8 shrink-0 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-2/3" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-4 w-14" />
          </div>
        ))}
      </div>
    );
  }

  if (!trades.length) {
    return (
      <EmptyState
        icon={<Activity />}
        title="Сделок пока нет"
        description="Как только по этому событию пройдут первые сделки, они появятся здесь."
      />
    );
  }

  return (
    <ul className="divide-y divide-border">
      {trades.map((trade) => {
        const color = outcomeColor(trade.outcome, trade.outcomeIndex);
        const marketLabel = titles.get(trade.conditionId) ?? trade.title;
        return (
          <li key={tradeKey(trade)} className="flex items-center gap-3 py-2.5">
            <Avatar
              src={trade.profileImage}
              name={trade.name || trade.pseudonym}
              seed={trade.proxyWallet}
              size={32}
            />

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm leading-snug">
                {/* Имена бывают в сотню символов — обрезаем, чтобы строка не «съелась». */}
                <span className="inline-block max-w-[45%] truncate align-bottom font-semibold text-text">
                  {traderName(trade)}
                </span>{" "}
                <span className="text-muted">
                  {trade.side === "BUY" ? "купил" : "продал"}{" "}
                  <span className="tnum">{formatCompact(trade.size)}</span> акций
                </span>{" "}
                <span className="font-semibold" style={{ color }}>
                  {trade.outcome}
                </span>{" "}
                <span className="tnum text-muted">по {formatCents(trade.price)}</span>
              </p>
              <p className="truncate text-[11px] text-faint">
                {multi && marketLabel ? `${marketLabel} · ` : ""}
                {formatRelativeTime(trade.timestamp)}
              </p>
            </div>

            <span className="tnum shrink-0 text-sm font-semibold text-text">
              {formatMoney(trade.size * trade.price)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
