"use client";

import { useQuery } from "@tanstack/react-query";
import { Trophy } from "lucide-react";
import { useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { SegmentedControl } from "@/components/ui/tabs";
import { api, queryKeys } from "@/lib/api";
import { formatMoney, shortenAddress, traderName } from "@/lib/format";
import type {
  LeaderboardEntry,
  LeaderboardType,
  LeaderboardWindow,
} from "@/lib/types";
import { cn } from "@/lib/utils";

const TYPES: { value: LeaderboardType; label: string }[] = [
  { value: "volume", label: "Объём" },
  { value: "profit", label: "Прибыль" },
];

const WINDOWS: { value: LeaderboardWindow; label: string }[] = [
  { value: "1d", label: "1д" },
  { value: "7d", label: "7д" },
  { value: "30d", label: "30д" },
  { value: "all", label: "Всё" },
];

/** Золото / серебро / бронза. Бронзу собираем из приглушённого warn. */
const MEDALS: Record<number, string> = {
  1: "bg-[color:var(--warn)]/15 text-[color:var(--warn)] ring-1 ring-[color:var(--warn)]/35",
  2: "bg-surface-hover text-muted ring-1 ring-border-strong",
  3: "bg-[color:var(--warn)]/10 text-[color:var(--warn)] opacity-70 ring-1 ring-[color:var(--warn)]/20",
};

function amountClass(type: LeaderboardType, amount: number): string {
  if (type !== "profit") return "text-text";
  if (amount > 0) return "text-yes";
  if (amount < 0) return "text-no";
  return "text-text";
}

function RankBadge({ rank, size = "sm" }: { rank: number; size?: "sm" | "lg" }) {
  return (
    <span
      className={cn(
        "tnum inline-flex items-center justify-center rounded-full font-semibold",
        size === "lg" ? "size-7 text-xs" : "size-6 text-[11px]",
        MEDALS[rank] ?? "text-faint",
      )}
    >
      {rank}
    </span>
  );
}

/** Тумба призёров — только на широких экранах, на мобильных хватает таблицы. */
function Podium({
  entries,
  type,
}: {
  entries: LeaderboardEntry[];
  type: LeaderboardType;
}) {
  if (entries.length < 3) return null;
  // Победителя ставим в центр: 2 — 1 — 3.
  const order = [entries[1], entries[0], entries[2]];

  return (
    <div className="hidden grid-cols-3 items-end gap-3 sm:grid">
      {order.map((entry) => {
        const first = entry.rank === 1;
        return (
          <div
            key={entry.proxyWallet}
            className={cn(
              "flex flex-col items-center gap-1.5 rounded-xl border bg-surface p-4 text-center",
              "transition-colors hover:border-border-strong",
              first
                ? "border-[color:var(--warn)]/40 pb-6 pt-6 shadow-card"
                : "border-border",
            )}
          >
            <RankBadge rank={entry.rank} size={first ? "lg" : "sm"} />
            <Avatar
              src={entry.profileImage}
              name={entry.name}
              seed={entry.proxyWallet}
              size={first ? 56 : 44}
              className="mt-1"
            />
            <p className="mt-1 line-clamp-1 text-sm font-semibold text-text">
              {traderName(entry)}
            </p>
            <p className="font-mono text-[11px] text-faint">
              {shortenAddress(entry.proxyWallet)}
            </p>
            <p
              className={cn(
                "tnum mt-1 font-semibold",
                first ? "text-lg" : "text-base",
                amountClass(type, entry.amount),
              )}
            >
              {formatMoney(entry.amount, 0)}
            </p>
          </div>
        );
      })}
    </div>
  );
}

export function LeaderboardTable() {
  const [type, setType] = useState<LeaderboardType>("volume");
  const [timeWindow, setTimeWindow] = useState<LeaderboardWindow>("1d");

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: queryKeys.leaderboard(type, timeWindow),
    queryFn: ({ signal }) => api.leaderboard(type, timeWindow, signal),
    staleTime: 120_000,
  });

  const entries = data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl items={TYPES} value={type} onChange={setType} />
        <SegmentedControl items={WINDOWS} value={timeWindow} onChange={setTimeWindow} />
        <span className="ml-auto text-xs text-faint">
          {type === "volume" ? "Оборот за период" : "Чистый результат за период"}
        </span>
      </div>

      {isPending ? (
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          {Array.from({ length: 8 }, (_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 border-b border-border p-3 last:border-0"
            >
              <Skeleton className="size-6 rounded-full" />
              <Skeleton className="size-8 rounded-full" />
              <Skeleton className="h-3.5 w-40" />
              <Skeleton className="ml-auto h-4 w-20" />
            </div>
          ))}
        </div>
      ) : isError ? (
        <div className="rounded-xl border border-border bg-surface">
          <EmptyState
            icon={<Trophy />}
            title="Рейтинг не загрузился"
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
      ) : entries.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface">
          <EmptyState
            icon={<Trophy />}
            title="За этот период пусто"
            description="Попробуйте другой интервал — например, «Всё время»."
          />
        </div>
      ) : (
        <>
          <Podium entries={entries} type={type} />

          <div className="overflow-hidden rounded-xl border border-border bg-surface">
            <div className="thin-scrollbar max-h-[70vh] overflow-auto">
              <table className="w-full border-collapse text-sm">
                <thead className="sticky top-0 z-10 bg-surface">
                  <tr className="border-b border-border text-xs font-medium text-muted">
                    <th className="w-14 px-3 py-2.5 text-left font-medium">#</th>
                    <th className="px-3 py-2.5 text-left font-medium">Трейдер</th>
                    <th className="hidden px-3 py-2.5 text-left font-medium sm:table-cell">
                      Кошелёк
                    </th>
                    <th className="px-3 py-2.5 text-right font-medium">
                      {type === "volume" ? "Объём" : "Прибыль"}
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {entries.map((entry) => (
                    <tr
                      key={entry.proxyWallet}
                      className="border-b border-border transition-colors last:border-0 hover:bg-surface-hover"
                    >
                      <td className="px-3 py-2.5">
                        {entry.rank <= 3 ? (
                          <RankBadge rank={entry.rank} />
                        ) : (
                          <span className="tnum pl-1.5 text-xs text-faint">
                            {entry.rank}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <Avatar
                            src={entry.profileImage}
                            name={entry.name}
                            seed={entry.proxyWallet}
                            size={28}
                          />
                          <span className="line-clamp-1 font-medium text-text">
                            {traderName(entry)}
                          </span>
                        </div>
                      </td>
                      <td className="hidden px-3 py-2.5 font-mono text-xs text-faint sm:table-cell">
                        {shortenAddress(entry.proxyWallet)}
                      </td>
                      <td
                        className={cn(
                          "tnum px-3 py-2.5 text-right font-semibold",
                          amountClass(type, entry.amount),
                        )}
                      >
                        {formatMoney(entry.amount, 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
