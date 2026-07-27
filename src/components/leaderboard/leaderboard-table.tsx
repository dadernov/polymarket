"use client";

import { useQuery } from "@tanstack/react-query";
import { Trophy } from "lucide-react";
import { useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Stat, StatRow } from "@/components/ui/stat";
import { SegmentedControl } from "@/components/ui/tabs";
import { api, queryKeys } from "@/lib/api";
import { formatMoney, formatVolume, shortenAddress, traderName } from "@/lib/format";
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

/** Капительная шапка столбца. */
const TH =
  "px-4 py-3 text-[10.5px] font-medium uppercase tracking-[0.08em] text-faint whitespace-nowrap";

/**
 * Золото / серебро / бронза. Светофорных цветов на подиуме нет: медали — это
 * тёплый warn разной насыщенности плюс нейтральная бумага для серебра.
 */
const MEDALS: Record<number, string> = {
  1: "bg-warn-soft text-warn ring-1 ring-warn/35",
  2: "bg-bg-subtle text-muted ring-1 ring-border-strong",
  3: "bg-bg-subtle text-warn ring-1 ring-warn/20",
};

/** Компактная сумма со знаком: `$1.2m`, `-$430k`. */
function compactSigned(value: number): string {
  return value < 0 ? `-${formatVolume(-value)}` : formatVolume(value);
}

function amountClass(type: LeaderboardType, amount: number): string {
  if (type !== "profit") return "text-text";
  if (amount > 0) return "text-yes";
  if (amount < 0) return "text-no";
  return "text-text";
}

/** Номер места: на подиуме — крупной антиквой, в таблице — мелкой плашкой. */
function RankBadge({ rank, size = "sm" }: { rank: number; size?: "sm" | "md" | "lg" }) {
  return (
    <span
      className={cn(
        "display tnum inline-flex items-center justify-center rounded-full",
        size === "lg"
          ? "size-10 text-[20px]"
          : size === "md"
            ? "size-8 text-[16px]"
            : "size-6 text-[12px]",
        MEDALS[rank] ?? "text-faint",
      )}
    >
      {rank}
    </span>
  );
}

/**
 * Тумба призёров. Первое место выше и крупнее остальных — иерархия задаётся
 * размером плашки и кегля числа, а не цветной рамкой. На узких экранах тумбы
 * нет: там те же три места читаются первыми строками таблицы.
 */
function Podium({
  entries,
  type,
}: {
  entries: LeaderboardEntry[];
  type: LeaderboardType;
}) {
  // Победителя ставим в центр: 2 — 1 — 3. Место берём по позиции в списке,
  // а не из поля rank: подиум не должен рассыпаться на нестандартной нумерации.
  const order = [
    { entry: entries[1], place: 2 },
    { entry: entries[0], place: 1 },
    { entry: entries[2], place: 3 },
  ];
  const label = type === "volume" ? "Объём" : "Прибыль";

  return (
    <div className="hidden grid-cols-3 items-end gap-3 sm:grid lg:gap-4">
      {order.map(({ entry, place }) => {
        const first = place === 1;
        const third = place === 3;

        return (
          <article
            key={entry.proxyWallet}
            className={cn(
              // Тумба некликабельна, поэтому без card-interactive.
              "card flex flex-col items-center px-4 text-center",
              first ? "py-7" : third ? "py-4" : "py-5",
            )}
          >
            <RankBadge rank={place} size={first ? "lg" : third ? "sm" : "md"} />

            <Avatar
              src={entry.profileImage}
              name={entry.name}
              seed={entry.proxyWallet}
              size={first ? 64 : third ? 44 : 52}
              className="mt-3"
            />

            <p
              className={cn(
                "mt-3 line-clamp-1 w-full font-semibold text-text",
                first ? "text-[15px]" : "text-[13.5px]",
              )}
            >
              {traderName(entry)}
            </p>
            <p className="mt-0.5 font-mono text-[10.5px] text-faint">
              {shortenAddress(entry.proxyWallet)}
            </p>

            <p className="mt-4 text-[10px] font-medium uppercase tracking-[0.1em] text-faint">
              {label}
            </p>
            <p
              className={cn(
                "display tnum mt-1.5 leading-none",
                first ? "text-[34px]" : third ? "text-[22px]" : "text-[26px]",
                amountClass(type, entry.amount),
              )}
            >
              {formatMoney(entry.amount, 0)}
            </p>
          </article>
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
  const podium = entries.length >= 3;
  const sum = entries.reduce((acc, entry) => acc + entry.amount, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl items={TYPES} value={type} onChange={setType} />
        <SegmentedControl items={WINDOWS} value={timeWindow} onChange={setTimeWindow} />

        {entries.length > 0 && (
          <StatRow className="ml-auto hidden md:flex">
            <Stat label="Участников" value={entries.length} size="sm" />
            <Stat
              label={type === "volume" ? "Оборот в рейтинге" : "Результат в рейтинге"}
              value={compactSigned(sum)}
              size="sm"
              tone={type === "profit" && sum < 0 ? "no" : "neutral"}
            />
          </StatRow>
        )}
      </div>

      {isPending ? (
        <div className="card overflow-hidden">
          {Array.from({ length: 8 }, (_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 border-b border-border p-4 last:border-0"
            >
              <Skeleton className="size-6 rounded-full" />
              <Skeleton className="size-8 rounded-full" />
              <Skeleton className="h-3.5 w-40" />
              <Skeleton className="ml-auto h-4 w-20" />
            </div>
          ))}
        </div>
      ) : isError ? (
        <div className="card">
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
        <div className="card">
          <EmptyState
            icon={<Trophy />}
            title="За этот период пусто"
            description="Попробуйте другой интервал — например, «Всё время»."
          />
        </div>
      ) : (
        <>
          {podium && <Podium entries={entries} type={type} />}

          <div className="card overflow-hidden">
            <div className="thin-scrollbar max-h-[70vh] overflow-auto">
              {/* table-fixed: среди имён встречаются адреса в 55 символов,
                  и при автоширине они выдавливают колонку суммы за экран. */}
              <table className="w-full table-fixed border-collapse text-sm">
                <thead className="sticky top-0 z-10 bg-surface">
                  <tr className="border-b border-border">
                    <th className={cn(TH, "w-12 text-left sm:w-14")}>#</th>
                    <th className={cn(TH, "text-left")}>Трейдер</th>
                    <th className={cn(TH, "hidden w-40 text-left sm:table-cell")}>Кошелёк</th>
                    <th className={cn(TH, "w-28 text-right sm:w-36")}>
                      {type === "volume" ? "Объём" : "Прибыль"}
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {entries.map((entry, index) => (
                    <tr
                      key={entry.proxyWallet}
                      className={cn(
                        "border-b border-border transition-colors last:border-0 hover:bg-surface-hover",
                        // Призёров на широких экранах показывает тумба —
                        // повторять их строками значит дублировать данные.
                        podium && index < 3 && "sm:hidden",
                      )}
                    >
                      <td className="px-4 py-3">
                        {entry.rank <= 3 ? (
                          <RankBadge rank={entry.rank} />
                        ) : (
                          <span className="tnum pl-1.5 text-xs text-faint">
                            {entry.rank}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <Avatar
                            src={entry.profileImage}
                            name={entry.name}
                            seed={entry.proxyWallet}
                            size={28}
                          />
                          <span className="truncate text-[13.5px] font-medium text-text">
                            {traderName(entry)}
                          </span>
                        </div>
                      </td>
                      <td className="hidden truncate px-4 py-3 font-mono text-[11.5px] text-faint sm:table-cell">
                        {shortenAddress(entry.proxyWallet)}
                      </td>
                      <td
                        className={cn(
                          "tnum px-4 py-3 text-right font-semibold",
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
