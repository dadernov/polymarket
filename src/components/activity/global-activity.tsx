"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Activity } from "lucide-react";
import { useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { EmptyState, Spinner } from "@/components/ui/empty-state";
import { MarketImage } from "@/components/ui/market-image";
import { Skeleton } from "@/components/ui/skeleton";
import { SegmentedControl } from "@/components/ui/tabs";
import { api, queryKeys, REFRESH } from "@/lib/api";
import {
  formatCents,
  formatCompact,
  formatDateTime,
  formatMoney,
  formatRelativeTime,
  traderName,
} from "@/lib/format";
import type { Trade } from "@/lib/types";
import { cn, eventHref } from "@/lib/utils";

type SizeFilter = "all" | "100" | "1000" | "10000";

const FILTERS: { value: SizeFilter; label: string }[] = [
  { value: "all", label: "Все" },
  { value: "100", label: "$100+" },
  { value: "1000", label: "$1k+" },
  { value: "10000", label: "$10k+" },
];

const MIN_AMOUNT: Record<SizeFilter, number> = {
  all: 0,
  "100": 100,
  "1000": 1000,
  "10000": 10_000,
};

const LIMIT = 40;

/** Уникальный ключ сделки: одна транзакция может закрыть несколько токенов. */
function tradeKey(trade: Trade): string {
  return `${trade.transactionHash}-${trade.asset}-${trade.timestamp}`;
}

export function GlobalActivity() {
  const [filter, setFilter] = useState<SizeFilter>("all");
  const minAmount = MIN_AMOUNT[filter];

  const { data, isPending, isError, isFetching, error, refetch } = useQuery({
    queryKey: queryKeys.trades({ limit: LIMIT, minAmount }),
    queryFn: ({ signal }) => api.trades({ limit: LIMIT, minAmount }, signal),
    refetchInterval: REFRESH.trades,
    staleTime: REFRESH.trades,
  });

  const trades = data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl items={FILTERS} value={filter} onChange={setFilter} />
        <div className="ml-auto flex items-center gap-2">
          {isFetching && <Spinner className="size-3.5" />}
          <Badge tone="live">Live</Badge>
        </div>
      </div>

      {isPending ? (
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          {Array.from({ length: 10 }, (_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 border-b border-border p-3 last:border-0"
            >
              <Skeleton className="size-8 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      ) : isError ? (
        <div className="rounded-xl border border-border bg-surface">
          <EmptyState
            icon={<Activity />}
            title="Лента недоступна"
            description={error instanceof Error ? error.message : "Попробуйте ещё раз."}
            action={
              <button
                type="button"
                onClick={() => void refetch()}
                className="cursor-pointer text-sm font-medium text-accent hover:underline"
              >
                Повторить
              </button>
            }
          />
        </div>
      ) : trades.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface">
          <EmptyState
            icon={<Activity />}
            title="Крупных сделок пока нет"
            description="Снизьте минимальный размер — мелкие сделки идут постоянно."
          />
        </div>
      ) : (
        <ul className="overflow-hidden rounded-xl border border-border bg-surface">
          {trades.map((trade) => {
            const key = tradeKey(trade);
            const buy = trade.side === "BUY";
            const total = trade.size * trade.price;
            const href = eventHref(trade.eventSlug || trade.slug);

            return (
              // animate-rise проигрывается один раз при монтировании узла:
              // строки живут по ключу сделки, поэтому «въезжают» только новые.
              <li
                key={key}
                className={cn(
                  "animate-rise flex items-center gap-3 border-b border-border px-3 py-2.5",
                  "transition-colors last:border-0 hover:bg-surface-hover",
                )}
              >
                <Avatar
                  src={trade.profileImage}
                  name={trade.name}
                  seed={trade.proxyWallet}
                  size={32}
                />

                <div className="min-w-0 flex-1">
                  {/* Имя трейдера бывает длиннее строки — режем его, а не сделку. */}
                  <p className="flex items-baseline gap-1.5 text-sm">
                    <span className="max-w-[40%] shrink-0 truncate font-medium text-text">
                      {traderName(trade)}
                    </span>
                    <span className="truncate text-muted">
                      <span className={cn("font-medium", buy ? "text-yes" : "text-no")}>
                        {buy ? "купил" : "продал"}
                      </span>{" "}
                      <span className="tnum text-text">{formatCompact(trade.size)}</span> ×{" "}
                      <span className="text-text">{trade.outcome}</span>
                      <span className="tnum"> по {formatCents(trade.price)}</span>
                    </span>
                  </p>

                  <div className="mt-0.5 flex items-center gap-1.5">
                    <MarketImage src={trade.icon} alt="" size={16} className="rounded" />
                    <Link
                      href={href}
                      className="truncate text-xs text-muted transition-colors hover:text-accent"
                    >
                      {trade.title}
                    </Link>
                  </div>
                </div>

                <div className="shrink-0 text-right">
                  <p className="tnum text-sm font-semibold text-text">
                    {formatMoney(total, total >= 1000 ? 0 : 2)}
                  </p>
                  <p
                    className="text-[11px] text-faint"
                    title={formatDateTime(trade.timestamp)}
                  >
                    {formatRelativeTime(trade.timestamp)}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
